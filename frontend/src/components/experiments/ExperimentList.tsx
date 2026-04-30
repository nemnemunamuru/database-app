import { useState, useEffect, useCallback } from "react";
import {
  Box, Button, CircularProgress,
  IconButton, InputAdornment, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
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

const KNOWN_EXP_COLS = new Set([
  "experiment_id", "galvano_system_id", "welding_condition_id",
  "experiment_material_id", "shielding_condition_id",
  "result_id", "observation_id", "file_id", "project_id", "project_name", "remarks",
]);

export default function ExperimentList({ onSelect, onAddNew, refresh }: Props) {
  const [items, setItems]       = useState<Experiment[]>([]);
  const [total, setTotal]       = useState(0);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail]     = useState<ExperimentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [candidatesMap, setCandidatesMap] = useState<Record<string, Candidate[]>>({});
  const [customCols, setCustomCols] = useState<{ column_name: string }[]>([]);

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
      const cols = (r.data as any[])
        .filter(c => (c.is_id === "" || !c.is_id) && !KNOWN_EXP_COLS.has(c.column_name))
        .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));
      setCustomCols(cols);
    }).catch(() => {});
  }, []);

  const load = useCallback(async (keyword = "") => {
    setLoading(true);
    try {
      const res = await fetchExperiments({ remarks: keyword || undefined, limit: 100 });
      setItems(res.data.items);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search);
  }, [refresh]);

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
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this experiment?")) return;
    await deleteExperiment(id);
    if (selectedId === id) { setSelectedId(null); setDetail(null); }
    load(search);
  };

  const handleClone = async (id: string) => {
    await cloneExperiment(id);
    load(search);
  };

  const selectedExp = items.find((e) => e.experiment_id === selectedId);
  const showDetail  = detail !== null || detailLoading;
  const colSpanCount = 10 + customCols.length;

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography variant="h6">Experiments (total: {total})</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" size="small" onClick={onAddNew}>+ Add New</Button>
        </Box>
      </Box>
      <TextField
        size="small"
        placeholder="Search by remarks"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && load(search)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
            ),
          },
        }}
        sx={{ mb: 1.5, width: 260 }}
      />

      {loading ? <CircularProgress /> : (
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", width: "100%" }}>
          <Box sx={{ flex: showDetail ? "0 0 56%" : "1 1 100%", minWidth: 0, overflow: "auto" }}>
            <TableContainer component={Paper}>
              <Table size="small" sx={{ tableLayout: "auto", minWidth: 1100 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>experiment_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>project_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>galvano_system_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>welding_condition_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>experiment_material_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>shielding_condition_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>result_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>observation_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>file_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11, minWidth: 120 }}>remarks</TableCell>
                    {customCols.map(col => (
                      <TableCell key={col.column_name} sx={{ whiteSpace: "nowrap", fontSize: 11, minWidth: 100 }}>{col.column_name}</TableCell>
                    ))}
                    <TableCell align="center" sx={{ whiteSpace: "nowrap" }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((exp) => (
                    <TableRow
                      key={exp.experiment_id}
                      hover
                      selected={exp.experiment_id === selectedId}
                      sx={{ cursor: "pointer" }}
                      onClick={() => handleRowClick(exp)}
                    >
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.experiment_id)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.project_id)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.galvano_system_id)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.welding_condition_id)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.experiment_material_id)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.shielding_condition_id)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.result_id)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.observation_id)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.file_id)}</TableCell>
                      <TableCell sx={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {exp.remarks ?? ""}
                      </TableCell>
                      {customCols.map(col => (
                        <TableCell key={col.column_name} sx={{ fontSize: 11 }}>
                          {String((exp as any)[col.column_name] ?? "")}
                        </TableCell>
                      ))}
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
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
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={colSpanCount} align="center">No data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {showDetail && (
            <Box sx={{ flex: "0 0 42%", minWidth: 300 }}>
              {detailLoading ? (
                <Paper sx={{ p: 2, display: "flex", justifyContent: "center" }}>
                  <CircularProgress size={24} />
                </Paper>
              ) : detail && (
                <DetailPanel
                  detail={detail}
                  candidatesMap={candidatesMap}
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
