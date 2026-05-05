import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Box, Button, CircularProgress,
  IconButton, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
  Tooltip, Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import type { Experiment, ExperimentDetail } from "../../api/experiments";
import {
  fetchExperiments, fetchExperimentDetail, deleteExperiment,
  cloneExperiment,
} from "../../api/experiments";
import { columnDefsTableApi } from "../../api/masters";
import type { Candidate } from "../masters/EntityCrud";
import { DetailPanel } from "./ExperimentDetailPanel";
import ExperimentFilterBar from "../common/ExperimentFilterBar";
import {
  type FilterState,
  FILTER_DEFAULT,
  matchDeep,
} from "../../utils/experimentFilter";

function parseCandidates(raw: any): Candidate[] {
  if (raw == null || raw === "") return [];
  const s = String(raw).trim();
  const parts = s.includes("|") ? s.split("|") : s.split("/");
  return parts.map((p: string) => p.trim()).filter(Boolean).map(p => {
    const idx = p.indexOf(";;");
    if (idx >= 0) return { label: p.slice(0, idx), color: p.slice(idx + 2) || undefined };
    return { label: p };
  });
}

const sid = (id: string | null | undefined) => id ? id.slice(0, 6) + "\u2026" : "\u2014";

interface Props {
  onSelect: (exp: Experiment) => void;
  onAddNew: () => void;
  refresh: number;
}

// Columns that are never shown as regular data columns in the table
const HIDDEN_COLS = new Set(["project_name"]);

export default function ExperimentList({ onSelect, onAddNew, refresh }: Props) {
  const [items, setItems]       = useState<Experiment[]>([]);
  const [total, setTotal]       = useState(0);
  const [filterState, setFilterState] = useState<FilterState>(FILTER_DEFAULT);
  const [loading, setLoading]   = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail]     = useState<ExperimentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [candidatesMap, setCandidatesMap] = useState<Record<string, Candidate[]>>({});
  // All ordered columns from column_def (including fixed FK cols)
  const [orderedCols, setOrderedCols] = useState<{ column_name: string; is_id: string }[]>([]);
  // Cache of lazily-loaded ExperimentDetail objects (for deep search)
  const [detailCache, setDetailCache] = useState<Record<string, ExperimentDetail>>({});
  const [cacheLoading, setCacheLoading] = useState(false);
  const loadingIds = useRef(new Set<string>());

  useEffect(() => {
    const TABLES = [
      "GALVANO_SYSTEM", "FTHETA", "OPTICS", "LASER_DEVICE", "LASER_BEAM", "DOE",
      "WELDING_CONDITION", "TRAJECTORY_SET", "MAIN_TRAJECTORY", "LINE_PARAMETER",
      "SUB_TRAJECTORY", "WOBBLING_PARAMETER",
      "EXPERIMENT_MATERIAL", "MATERIAL_STATE", "MATERIAL",
      "SHIELDING_CONDITION", "RESULT", "OBSERVATION", "FILE",
    ];
    Promise.all(TABLES.map(t => columnDefsTableApi(t).list().catch(() => ({ data: [] })))).then(results => {
      const map: Record<string, Candidate[]> = {};
      for (const res of results) {
        for (const row of (res.data as any[])) {
          if (row.candidates) {
            const parts = parseCandidates(row.candidates);
            if (parts.length) map[row.column_name] = parts;
          }
        }
      }
      setCandidatesMap(map);
    });
    columnDefsTableApi("EXPERIMENT").list().then(r => {
      const defs = (r.data as any[]).filter(c => !HIDDEN_COLS.has(c.column_name));
      setOrderedCols(defs.sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)));
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchExperiments({ limit: 200 });
      setItems(res.data.items);
      setTotal(res.data.total);
      // Clear cache when list refreshes
      setDetailCache({});
      loadingIds.current.clear();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [refresh]);

  // When a filter value is active, batch-load detail for all items not yet cached
  useEffect(() => {
    if (!filterState.value) return;
    const toLoad = items.filter(
      (e) => !(e.experiment_id in detailCache) && !loadingIds.current.has(e.experiment_id),
    );
    if (!toLoad.length) return;

    setCacheLoading(true);
    toLoad.forEach((e) => loadingIds.current.add(e.experiment_id));

    const BATCH = 5;
    const runBatches = async () => {
      for (let i = 0; i < toLoad.length; i += BATCH) {
        const batch = toLoad.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map((e) =>
            fetchExperimentDetail(e.experiment_id).then((r) =>
              setDetailCache((prev) => ({ ...prev, [e.experiment_id]: r.data })),
            ),
          ),
        );
      }
    };
    runBatches().finally(() => setCacheLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState.value, items]);

  const handleRowClick = async (exp: Experiment) => {
    if (selectedId === exp.experiment_id) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    setSelectedId(exp.experiment_id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetchExperimentDetail(exp.experiment_id);
      setDetail(res.data);
      // Populate deep-search cache too
      setDetailCache((prev) => ({ ...prev, [exp.experiment_id]: res.data }));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this experiment?")) return;
    await deleteExperiment(id);
    if (selectedId === id) { setSelectedId(null); setDetail(null); }
    load();
  };

  const handleClone = async (id: string) => {
    await cloneExperiment(id);
    load();
  };

  const colNames = useMemo(() => orderedCols.map((c) => c.column_name), [orderedCols]);

  const visibleItems = useMemo(() => {
    if (!filterState.value) return items;
    return items.filter((exp) =>
      matchDeep(
        exp as unknown as Record<string, unknown>,
        (detailCache[exp.experiment_id] as unknown as Record<string, unknown>) ?? null,
        filterState,
        colNames,
      ),
    );
  }, [items, filterState, detailCache, colNames]);

  const selectedExp = items.find((e) => e.experiment_id === selectedId);
  const showDetail  = detail !== null || detailLoading;
  const colSpanCount = orderedCols.length + 1;

  // Scroll the selected row into view when detail loads
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (selectedId) {
      const id = requestAnimationFrame(() =>
        selectedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
      return () => cancelAnimationFrame(id);
    }
  }, [selectedId]);

  // Dynamic panel top: align with TableContainer top
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [panelTop, setPanelTop] = useState(200);
  useEffect(() => {
    const measure = () => {
      if (tableContainerRef.current) {
        setPanelTop(Math.round(tableContainerRef.current.getBoundingClientRect().top));
      }
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, [loading, orderedCols.length]);

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography variant="h6">
          Experiments ({visibleItems.length} / {total})
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" size="small" onClick={onAddNew}>+ Add New</Button>
        </Box>
      </Box>
      <Box sx={{ mb: 1.5, paddingRight: showDetail ? "41%" : 0, transition: "padding-right 0.15s ease" }}>
        <ExperimentFilterBar
          filter={filterState}
          onChange={setFilterState}
          cols={orderedCols}
          loading={cacheLoading}
        />
      </Box>

      {loading ? <CircularProgress /> : (
        <Box sx={{ paddingRight: showDetail ? "41%" : 0, transition: "padding-right 0.15s ease" }}>
          <TableContainer component={Paper} ref={tableContainerRef} sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ tableLayout: "auto", minWidth: 1100, "& tbody td": { paddingTop: "0 !important", paddingBottom: "0 !important", px: "6px", lineHeight: "1.4" } }}>
                <TableHead>
                  <TableRow>
                    {orderedCols.map(col => (
                      <TableCell key={col.column_name} sx={{ whiteSpace: "nowrap", fontSize: 11, minWidth: col.column_name.endsWith("_id") ? 90 : col.column_name.includes("datetime") ? 140 : 100 }}>
                        {col.column_name}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ whiteSpace: "nowrap" }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleItems.map((exp) => (
                    <TableRow
                      key={exp.experiment_id}
                      ref={exp.experiment_id === selectedId ? selectedRowRef : null}
                      hover
                      selected={exp.experiment_id === selectedId}
                      sx={{ cursor: "pointer", "& td": { paddingTop: "0 !important", paddingBottom: "0 !important" } }}
                      onClick={() => handleRowClick(exp)}
                    >
                      {orderedCols.map(col => {
                        const val = (exp as any)[col.column_name];
                        const isId = col.is_id === "pk" || col.is_id === "fk";
                        return (
                          <TableCell key={col.column_name} style={{ paddingTop: 0, paddingBottom: 0 }} sx={{ fontFamily: isId ? "monospace" : undefined, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                            {isId ? sid(val) : (val != null ? String(val) : "")}
                          </TableCell>
                        );
                      })}
                      <TableCell align="center" style={{ paddingTop: 0, paddingBottom: 0 }} sx={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Copy">
                          <IconButton size="small" onClick={() => handleClone(exp.experiment_id)}>
                            <ContentCopyIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => { onSelect(exp); }}>
                            <EditIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleDelete(exp.experiment_id)}>
                            <DeleteIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={colSpanCount} align="center">
                        {items.length === 0 ? "No data" : `No matches (${items.length} loaded)`}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
          </TableContainer>

          {showDetail && (
            <Box sx={{
              position: "fixed",
              top: `${panelTop}px`,
              right: 0,
              bottom: 0,
              width: "40%",
              overflow: "auto",
              zIndex: 100,
              bgcolor: "background.paper",
              boxShadow: 6,
            }}>
              {detailLoading ? (
                <Paper sx={{ p: 2, display: "flex", justifyContent: "center" }}>
                  <CircularProgress size={24} />
                </Paper>
              ) : detail && (
                <DetailPanel
                  detail={detail}
                  candidatesMap={candidatesMap}
                  extraExpCols={orderedCols}
                  projectData={(detail as any).project ?? undefined}
                  onEdit={() => selectedExp && onSelect(selectedExp)}
                  onClose={() => { setSelectedId(null); setDetail(null); }}
                />
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
