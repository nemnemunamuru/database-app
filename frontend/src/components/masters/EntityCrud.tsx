import { useState, useEffect, useCallback, Fragment, useMemo, useRef } from "react";
import {
  Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, IconButton, InputAdornment,
  InputLabel, MenuItem, Paper, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import apiClient from "../../api/client";
import { columnDefsTableApi } from "../../api/masters";
import { IdPickerDialog } from "../common/IdPickerDialog";
import { FK_CONFIG } from "../common/IdSelectField";
import { useUndo } from "../../context/UndoContext";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import CloseIcon from "@mui/icons-material/Close";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import FormatColorResetIcon from "@mui/icons-material/FormatColorReset";

// ── Shared tree types ─────────────────────────────────────────────────────────
export type TItem = { label: React.ReactNode; value?: React.ReactNode; children?: TItem[] };

export function TreeBlock({ items, depth = 0, candidatesMap = {} }: {
  items: TItem[]; depth?: number; candidatesMap?: Record<string, Candidate[]>;
}) {
  return (
    <>
      {items.map((item, i) => {
        const isLast   = i === items.length - 1;
        const hasKids  = !!item.children?.length;
        const isHeader = hasKids && item.value === undefined;

        // If label is a string and value is a string, check candidatesMap for a color match
        const labelKey = typeof item.label === "string" ? item.label : null;
        const rawValue = typeof item.value === "string" ? item.value : null;
        let displayValue: React.ReactNode = item.value;
        if (labelKey && rawValue && candidatesMap[labelKey]) {
          const cand = candidatesMap[labelKey].find(c => c.label === rawValue);
          if (cand?.color) {
            displayValue = (
              <Chip label={cand.label} size="small"
                sx={{ bgcolor: cand.color, color: "#fff", fontWeight: 700, height: 20, fontSize: 11, borderRadius: "10px" }} />
            );
          }
        }

        // For header items (label is a string, has children): scan all candidatesMap for a color match
        let labelDisplay: React.ReactNode = item.label;
        if (isHeader && typeof item.label === "string") {
          for (const cands of Object.values(candidatesMap)) {
            const cand = cands.find(c => c.label === item.label);
            if (cand?.color) {
              labelDisplay = (
                <Chip label={cand.label} size="small"
                  sx={{ bgcolor: cand.color, color: "#fff", fontWeight: 700, height: 20, fontSize: 11, borderRadius: "10px" }} />
              );
              break;
            }
          }
        }

        return (
          <Fragment key={i}>
            <Box sx={{ display: "flex", alignItems: "center", pl: `${depth * 14}px`, py: 0.2 }}>
              {depth > 0 && (
                <Box
                  component="span"
                  sx={{ color: "text.disabled", fontSize: 11, mr: 0.3, flexShrink: 0, fontFamily: "monospace", lineHeight: "20px" }}
                >
                  {isLast ? "└ " : "├ "}
                </Box>
              )}
              <Box sx={{
                fontSize: 11,
                fontWeight: isHeader ? 700 : 400,
                color: isHeader ? "primary.main" : "text.secondary",
                mr: 0.5, flexShrink: 0,
                minWidth: isHeader ? undefined : 130,
                display: "flex", alignItems: "center",
              }}>
                {labelDisplay}
              </Box>
              {item.value !== undefined && (
                <Box sx={{ fontSize: 11, color: "text.primary", wordBreak: "break-word", display: "flex", alignItems: "center" }}>
                  {displayValue}
                </Box>
              )}
            </Box>
            {hasKids && <TreeBlock items={item.children!} depth={depth + 1} candidatesMap={candidatesMap} />}
          </Fragment>
        );
      })}
    </>
  );
}

// ── Candidate (label + optional color) ─────────────────────────────────────
export type Candidate = { label: string; color?: string };

/** Parse "label;;#color|label2;;#color2" (or legacy "label|label2" or "a/b/c") into Candidate[] */
function parseCandidates(raw: any): Candidate[] {
  if (raw == null || raw === "") return [];
  const s = String(raw).trim();
  // Choose delimiter: prefer "|", fall back to "/"
  const parts = s.includes("|") ? s.split("|") : s.split("/");
  return parts.map((p: string) => p.trim()).filter(Boolean).map(p => {
    const idx = p.indexOf(";;");
    if (idx >= 0) return { label: p.slice(0, idx), color: p.slice(idx + 2) || undefined };
    return { label: p };
  });
}

/** Serialize Candidate[] back to "label;;#color|..." */
function serializeCandidates(cands: Candidate[]): string {
  return cands.map(c => c.color ? `${c.label};;${c.color}` : c.label).join("|");
}

/** Format a raw date/datetime string for display */
function formatDate(raw: any, includeTime = false): string {
  if (raw == null || raw === "") return "—";
  const s = String(raw);
  // YYYY/MM/DD HH:MM:SS or YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) {
    return includeTime ? s.slice(0, 19) : s.slice(0, 10);
  }
  // ISO: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const base = s.slice(0, 10).replace(/-/g, "/");
    if (includeTime && s.length >= 16) {
      const time = s.slice(11, 19);
      return `${base} ${time}`;
    }
    return base;
  }
  return s;
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "fk" | "date" | "datetime" | "tags";
  renderCell?: (value: any) => React.ReactNode;
  /** If true, this field is hidden in the table but still shown in the edit dialog */
  hideInTable?: boolean;
  /** If provided, the field renders as a Select with these fixed choices */
  options?: string[];
  /** If provided, shows a computed suffix adornment in the TextField based on current form values */
  endAdornment?: (form: Record<string, any>) => string | undefined;
  /** If provided, the field is disabled when this predicate returns true */
  disabledWhen?: (form: Record<string, any>) => boolean;
  /** If provided, the field shows this computed value when disabled (overrides form value) */
  defaultWhen?: (form: Record<string, any>) => string | undefined;
  /** FK-specific: API to load the referenced table options */
  fkApi?: { list: () => Promise<{ data: any[] }> };
  /** FK-specific: PK field name of the referenced table */
  fkPk?: string;
  /** FK-specific: how to display each option in the dropdown */
  fkLabel?: (item: any) => string;
}

interface CrudApi {
  list: () => Promise<{ data: any[] }>;
  create: (data: any) => Promise<any>;
  update: (id: string, data: any) => Promise<any>;
  remove: (id: string) => Promise<any>;
}

interface Props {
  title: string;
  fields: FieldDef[];
  pkField: string;
  api: CrudApi;
  /** If provided, clicking a row opens a right-side panel with this tree */
  buildTree?: (item: any) => TItem[] | Promise<TItem[]>;
  /** If provided, ↑/↓ reorder buttons appear in the Actions column.
   *  Called with the new ordered array of items after a move. */
  onReorder?: (newItems: any[]) => Promise<void>;
  /** Extra table names whose column_def candidates should be merged into candidatesMap.
   *  Use when the tree expansion shows nested entities from other tables. */
  candidatesTables?: string[];
}

// ── Side panel ────────────────────────────────────────────────────────────────
function SidePanel({
  title, item, treeNodes, loading, onClose, onEdit, onDelete, candidatesMap,
}: { title: string; item: any; treeNodes: TItem[] | null; loading: boolean; onClose: () => void; onEdit?: () => void; onDelete?: () => void; candidatesMap: Record<string, Candidate[]> }) {
  return (
    <Paper
      elevation={3}
      sx={{
        maxHeight: "calc(100vh - 220px)", overflow: "auto",
        p: 1.5, minWidth: 260, flex: "0 0 38%",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" fontWeight="bold" color="primary">{title}</Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {onEdit && (
            <Tooltip title="Edit">
              <IconButton size="small" onClick={onEdit}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={onDelete}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
        </Box>
      </Box>
      <Divider sx={{ mb: 1 }} />
      {loading
        ? <CircularProgress size={18} />
        : treeNodes
          ? treeNodes.map((sec, i) => (
            <Fragment key={i}>
              {i > 0 && <Divider sx={{ my: 0.8 }} />}
              <TreeBlock items={[sec]} depth={0} candidatesMap={candidatesMap} />
            </Fragment>
          ))
          : <Typography variant="body2" color="text.secondary" fontSize={11}>—</Typography>
      }
    </Paper>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function EntityCrud({ title, fields, pkField, api, buildTree, onReorder, candidatesTables }: Props) {
  const [items, setItems]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [open, setOpen]               = useState(false);
  const [editing, setEditing]         = useState<any | null>(null);
  const [form, setForm]               = useState<Record<string, any>>({});
  const [fkOptions, setFkOptions]     = useState<Record<string, any[]>>({});
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [treeNodes, setTreeNodes]     = useState<TItem[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [tagInputs, setTagInputs]     = useState<Record<string, string>>({});
  const [tagColors, setTagColors]     = useState<Record<string, string>>({});
  // candidates from column_defs: { columnName → Candidate[] }
  const [candidatesMap, setCandidatesMap] = useState<Record<string, Candidate[]>>({});
  const [orderMap, setOrderMap]           = useState<Record<string, number>>({});
  const [formulaMap, setFormulaMap]       = useState<Record<string, string>>({});
  const [formulaPick, setFormulaPick]     = useState<Record<string, string>>({});
  const [formulaGlobalRefs, setFormulaGlobalRefs] = useState<string[]>([]);
  const [formulaNumber, setFormulaNumber] = useState<Record<string, string>>({});
  const [fkPickerField, setFkPickerField] = useState<string | null>(null);
  // Extra fields discovered from column_def (not in the static fields prop)
  const [extraFields, setExtraFields]     = useState<FieldDef[]>([]);
  const [roleFields, setRoleFields]         = useState<string[]>([]);
  const { registerUndo } = useUndo();

  // Derive a FieldDef type from column_def data_type
  const deriveFieldType = (dataType: string, colName: string): FieldDef['type'] => {
    const dt = (dataType ?? '').toLowerCase();
    if (dt === 'boolean') return 'boolean';
    if (dt === 'float' || dt === 'numeric') return 'number';
    if (dt === 'integer' || dt === 'int') {
      if (colName.endsWith('_flag') || colName.includes('flag')) return 'boolean';
      return 'number';
    }
    return 'text';
  };

  const computeFormulaValue = (formula: string, values: Record<string, any>): number | undefined => {
    try {
      let expr = formula.replace(/π/g, "pi");
      const refs = Array.from(new Set((expr.match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? [])));

      const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const ref of refs) {
        if (ref === "sqrt" || ref.toLowerCase() === "pi") continue;
        const raw = values[ref] ?? (ref.includes(".") ? values[ref.split(".").pop() ?? ""] : undefined);
        const num = Number(raw);
        const safeNum = Number.isFinite(num) ? num : 0;
        expr = expr.replace(new RegExp(`(?<![A-Za-z0-9_.])${escRe(ref)}(?![A-Za-z0-9_.])`, "g"), `(${safeNum})`);
      }

      expr = expr.replace(/\bpi\b/gi, "Math.PI");
      expr = expr.replace(/\bsqrt\s*\(/g, "Math.sqrt(");
      const normalized = expr.replace(/\bMath\.sqrt\b/g, "1").replace(/\bMath\.PI\b/g, "1");
      if (!/^[0-9+\-*/().\s]+$/.test(normalized)) return undefined;

      const out = Function(`"use strict"; return (${expr});`)();
      const val = Number(out);
      return Number.isFinite(val) ? val : undefined;
    } catch {
      return undefined;
    }
  };

  const tokenizeFormula = (formula: string): string[] =>
    formula.match(/[A-Za-z_][A-Za-z0-9_.]*|\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];

  const joinFormulaTokens = (tokens: string[]): string => tokens.join(" ").trim();

  const loadColDefs = useCallback(async () => {
    if (!title) return;
    const allTables = Array.from(new Set([title, ...(candidatesTables ?? [])]));
    try {
      const results = await Promise.all(allTables.map(t => columnDefsTableApi(t).list()));
      const map: Record<string, Candidate[]> = {};
      const oMap: Record<string, number> = {};
      results.forEach((r, idx) => {
        for (const row of (r.data as any[])) {
          if (idx === 0 && row.order_index != null) {
            oMap[row.column_name] = Number(row.order_index);
          }
          if (row.candidates) {
            const parts = parseCandidates(row.candidates);
            if (parts.length) map[row.column_name] = parts;
          }
        }
      });
      setCandidatesMap(map);
      setOrderMap(oMap);

      const existingKeys = new Set(fields.map(f => f.key));
      const primaryRows = (results[0]?.data ?? []) as any[];
      const fMap: Record<string, string> = {};
      for (const row of primaryRows) {
        if (row.is_computed && row.formula) {
          fMap[row.column_name] = String(row.formula);
        }
      }
      setFormulaMap(fMap);
      const extra: FieldDef[] = primaryRows
        .filter(row => !existingKeys.has(row.column_name) && row.is_id !== 'pk')
        .map(row => ({
          key: row.column_name,
          label: row.column_name,
          type: deriveFieldType(row.data_type ?? 'string', row.column_name),
        }));
      setExtraFields(extra);
      const roleFieldNames = primaryRows
        .filter((row: any) => row.is_id === 'role')
        .map((row: any) => row.column_name as string);
      setRoleFields(roleFieldNames);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, candidatesTables]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list();
      setItems(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);
  // Initial colDefs load (also runs on candidatesTables change)
  useEffect(() => { loadColDefs(); }, [loadColDefs]);

  // Lazily load FK option lists when the dialog opens
  useEffect(() => {
    if (!open) return;
    fields
      .filter(f => f.type === "fk" && f.fkApi)
      .forEach(f => {
        f.fkApi!.list().then(res => {
          setFkOptions(prev => ({ ...prev, [f.key]: res.data }));
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || pkField !== "column_def_id") return;
    apiClient.get<any[]>("/api/masters/column-defs").then((r) => {
      const refs = Array.from(new Set((r.data ?? [])
        .filter((row: any) => row?.column_name)
        .map((row: any) => `${String(row.table_name ?? "").toUpperCase()}.${String(row.column_name)}`)
      )).sort();
      setFormulaGlobalRefs(refs);
    }).catch(() => setFormulaGlobalRefs([]));
  }, [open, pkField]);

  const openAdd  = () => { setEditing(null); setForm({}); setOpen(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ ...item }); setOpen(true); };

  const handleRowClick = async (item: any) => {
    if (!buildTree) return;
    const id = item[pkField];
    if (selectedId === id) { setSelectedId(null); setTreeNodes(null); return; }
    setSelectedId(id);
    setTreeNodes(null);
    setTreeLoading(true);
    try {
      const staticNodes = await buildTree(item);
      // Collect labels already shown in the static tree
      const shownLabels = new Set(staticNodes.map(n => typeof n.label === "string" ? n.label : ""));
      const extraFieldKeys = new Set(extraFields.map(ef => ef.key));
      const allNodes: TItem[] = [...staticNodes];
      // Append any item properties not yet shown:
      //   - Skip internal keys ("_" prefix)
      //   - Skip FK/PK *_id columns UNLESS explicitly added via Settings
      //   - Show null values as null (renders as blank label in tree, same as static fields)
      for (const [key, val] of Object.entries(item)) {
        if (shownLabels.has(key)) continue;
        if (key.startsWith("_")) continue;
        if (key.endsWith("_id") && !extraFieldKeys.has(key)) continue;
        allNodes.push({ label: key, value: val != null ? String(val) : null });
      }
      setTreeNodes(allNodes);
    } finally {
      setTreeLoading(false);
    }
  };

  const handleSave = async () => {
    const payload = { ...form };
    for (const [fieldKey, formula] of Object.entries(formulaMap)) {
      const v = computeFormulaValue(formula, payload);
      if (v !== undefined) payload[fieldKey] = v;
    }
    for (const f of [...fields, ...extraFields]) {
      if (f.disabledWhen?.(form)) {
        const dv = f.defaultWhen?.(form);
        payload[f.key] = dv !== undefined ? dv : null;
      }
      // Coerce boolean fields: sentinel strings → true/false/null
      if (f.type === "boolean" && f.key in payload) {
        const v = payload[f.key];
        if (v === "__true__"  || v === true  || v === 1) payload[f.key] = true;
        else if (v === "__false__" || v === false || v === 0) payload[f.key] = false;
        else payload[f.key] = null;
      }
    }
    if (editing) {
      const before = { ...editing };
      const id = editing[pkField];
      await api.update(id, payload);
      registerUndo("Update", async () => { await api.update(id, before); load(); });
    } else {
      const res = await api.create(payload);
      const newId = res?.data?.[pkField] ?? res?.[pkField];
      if (newId) registerUndo("Create", async () => { await api.remove(newId); load(); });
    }
    setOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this record?")) return;
    const item = items.find(i => i[pkField] === id);
    await api.remove(id);
    if (selectedId === id) { setSelectedId(null); setTreeNodes(null); }
    if (item) registerUndo("Delete", async () => { await api.create(item); load(); });
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    load();
  };

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const handleCheckboxChange = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (checkedIds.size === 0) return;
    if (!confirm(`Delete ${checkedIds.size} record(s)?`)) return;
    for (const id of checkedIds) {
      const item = items.find(i => i[pkField] === id);
      await api.remove(id);
      if (selectedId === id) { setSelectedId(null); setTreeNodes(null); }
      if (item) registerUndo("Delete", async () => { await api.create(item); load(); });
    }
    setCheckedIds(new Set());
    load();
  };

  const handleMoveRow = async (idx: number, dir: -1 | 1) => {
    const newItems = [...items];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];
    setItems(newItems);  // optimistic update
    if (onReorder) {
      await onReorder(newItems);
      load();  // reload from DB to confirm the new order was saved
    }
  };

  const handleClone = async (item: any) => {
    const { [pkField]: _pk, ...rest } = item;
    const res = await api.create(rest);
    const newId = res?.data?.[pkField] ?? res?.[pkField];
    if (newId) registerUndo("Clone", async () => { await api.remove(newId); load(); });
    load();
  };

  const handleCloneWithSameId = (item: any) => {
    setEditing(null);
    const formInit = { ...item };
    // Clear role fields so user must choose a new role value
    for (const rf of roleFields) {
      formInit[rf] = null;
    }
    setForm(formInit);
    setOpen(true);
  };

  const handleChange = (key: string, type: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm(prev => ({
      ...prev,
      [key]: type === "number" ? (val === "" ? null : Number(val)) : (val || null),
    }));
  };

  const selectedItem = items.find(i => i[pkField] === selectedId);

  const showPanel = !!buildTree && selectedId !== null;

  // Dynamic panel top: align with TableContainer top
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [panelTop, setPanelTop] = useState(200);
  useEffect(() => {
    const measure = () => {
      if (tableContainerRef.current) {
        const top = tableContainerRef.current.getBoundingClientRect().top;
        // Only update if element is visible (top > 0 means it's rendered on screen)
        if (top > 0) setPanelTop(Math.round(top));
      }
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure);

    // Re-measure when element becomes visible (e.g. tab switch from display:none)
    let obs: IntersectionObserver | undefined;
    if (tableContainerRef.current) {
      obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          requestAnimationFrame(measure);
        }
      });
      obs.observe(tableContainerRef.current);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      obs?.disconnect();
    };
  }, [loading, items.length]);

  // Sort all fields (static + dynamic) by column_def order_index
  const orderedFields = useMemo(() => {
    const seen = new Set<string>();
    const all = [...fields, ...extraFields].filter(f => {
      if (seen.has(f.key)) return false;
      seen.add(f.key);
      return true;
    });
    return all.sort((a, b) => (orderMap[a.key] ?? 9999) - (orderMap[b.key] ?? 9999));
  }, [fields, extraFields, orderMap]);

  return (
    <Box>
      {/* ── Header ── */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} mb={1}>
        {title ? <Typography variant="subtitle1" fontWeight="bold">{title}</Typography> : <Box />}
        <Box sx={{ display: "flex", gap: 1 }}>
          {checkedIds.size > 0 && (
            <Button size="small" variant="outlined" color="error" onClick={handleDeleteSelected}>
              Delete ({checkedIds.size})
            </Button>
          )}
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add</Button>
        </Box>
      </Box>

      {/* ── Table + side panel ── */}
      {loading ? <CircularProgress size={20} /> : (
        <Box sx={{ paddingRight: showPanel ? "41%" : 0, transition: "padding-right 0.15s ease" }}>
          {/* table */}
          <Box>
            <TableContainer component={Paper} sx={{ maxHeight: 400, overflowX: "auto" }} ref={tableContainerRef}>
              <Table size="small" stickyHeader sx={{ tableLayout: "auto", "& tbody td": { paddingTop: "0 !important", paddingBottom: "0 !important", lineHeight: "1.4" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" sx={{ width: 36 }}>
                      <Checkbox
                        size="small"
                        checked={items.length > 0 && items.every(i => checkedIds.has(i[pkField]))}
                        indeterminate={items.some(i => checkedIds.has(i[pkField])) && !items.every(i => checkedIds.has(i[pkField]))}
                        onChange={(e) => {
                          setCheckedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) items.forEach(i => next.add(i[pkField]));
                            else items.forEach(i => next.delete(i[pkField]));
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    {pkField !== "_id" && <TableCell align="center" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{pkField}</TableCell>}
                    {orderedFields.filter(f => !f.hideInTable).map(f => (
                      <TableCell key={f.key} align="center" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{f.label}</TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map(item => {
                    const id    = item[pkField];
                    const isSel = selectedId === id;
                    // Composite key for tables with role fields (composite PK)
                    const rowKey = roleFields.length > 0
                      ? id + "~" + roleFields.map(rf => item[rf] ?? "").join("~")
                      : id;
                    return (
                      <TableRow
                        key={rowKey}
                        hover
                        selected={isSel}
                        onClick={buildTree ? (e) => handleRowClick(item) : undefined}
                        sx={{ cursor: buildTree ? "pointer" : undefined, "& td": { paddingTop: "0 !important", paddingBottom: "0 !important" } }}
                      >
                        <TableCell padding="checkbox" sx={{ width: 36 }} onClick={e => e.stopPropagation()}>
                          <Checkbox
                            size="small"
                            checked={checkedIds.has(id)}
                            onChange={(e) => handleCheckboxChange(id, e.target.checked)}
                          />
                        </TableCell>
                        {pkField !== "_id" && <TableCell align="center" style={{ paddingTop: 0, paddingBottom: 0 }} sx={{ fontFamily: "monospace", fontSize: 10, whiteSpace: "nowrap" }}>
                          <Tooltip title={String(id)}><span>{String(id).slice(0, 8) + "…"}</span></Tooltip>
                        </TableCell>}
                        {orderedFields.filter(f => !f.hideInTable).map(f => (
                          <TableCell key={f.key} align="center" style={{ paddingTop: 0, paddingBottom: 0 }} sx={{ fontSize: 12, whiteSpace: "nowrap" }}>
                            {f.renderCell
                              ? f.renderCell(item[f.key])
                              : f.type === "tags"
                                ? (() => {
                                    const cands = parseCandidates(item[f.key]);
                                    if (!cands.length) return <span>—</span>;
                                    return (
                                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.3, justifyContent: "center" }}>
                                        {cands.slice(0, 4).map((c, i) => (
                                          <Chip key={i} label={c.label} size="small"
                                            sx={{ height: 16, fontSize: 9,
                                              bgcolor: c.color ?? undefined,
                                              color: c.color ? "#fff" : undefined,
                                              fontWeight: c.color ? 600 : undefined }} />
                                        ))}
                                        {cands.length > 4 && <Typography variant="caption">+{cands.length - 4}</Typography>}
                                      </Box>
                                    );
                                  })()
                              : f.type === "date"
                                ? formatDate(item[f.key], false)
                                : f.type === "datetime"
                                  ? formatDate(item[f.key], true)
                                  : (() => {
                                      const val = item[f.key];
                                      const displayVal = (val == null && formulaMap[f.key])
                                        ? computeFormulaValue(formulaMap[f.key], item)
                                        : val;
                                      if (displayVal != null) {
                                        const cand = candidatesMap[f.key]?.find(c => c.label === String(displayVal));
                                        if (cand?.color) {
                                          return <Chip label={cand.label} size="small" sx={{ bgcolor: cand.color, color: "#fff", fontWeight: 700, height: 20, fontSize: 11, borderRadius: "10px" }} />;
                                        }
                                        return <>{String(displayVal)}</>;
                                      }
                                      return <>—</>;
                                    })()}
                          </TableCell>
                        ))}
                        <TableCell align="center" style={{ paddingTop: 0, paddingBottom: 0 }} sx={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                          {onReorder && (
                            <>
                              <Tooltip title="Move up">
                                <span>
                                  <IconButton size="small" onClick={() => handleMoveRow(items.indexOf(item), -1)} disabled={items.indexOf(item) === 0}>
                                    <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Move down">
                                <span>
                                  <IconButton size="small" onClick={() => handleMoveRow(items.indexOf(item), 1)} disabled={items.indexOf(item) === items.length - 1}>
                                    <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </>
                          )}
                          {roleFields.length > 0 && (
                            <Tooltip title="Copy (same ID)">
                              <IconButton size="small" color="secondary" onClick={() => handleCloneWithSameId(item)}>
                                <CopyAllIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Copy">
                            <IconButton size="small" onClick={() => handleClone(item)}>
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEdit(item)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={fields.length + 2} align="center">No data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* right side panel */}
          {showPanel && selectedItem && (
            <Box sx={{
              position: "fixed",
              top: `${panelTop}px`,
              right: 0,
              bottom: 0,
              width: "40%",
              overflow: "auto",
              zIndex: 100,
              boxShadow: 6,
            }}>
              <SidePanel
                title={title}
                item={selectedItem}
                treeNodes={treeNodes}
                loading={treeLoading}
                onClose={() => { setSelectedId(null); setTreeNodes(null); }}
                onEdit={() => openEdit(selectedItem)}
                onDelete={() => { handleDelete(selectedItem[pkField]); }}
                candidatesMap={candidatesMap}
              />
            </Box>
          )}
        </Box>
      )}

      {/* ── Add / Edit dialog ── */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit" : "Add"} — {title}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {orderedFields.map(f => {
              const computedFormula = formulaMap[f.key];
              const computedValue = computedFormula ? computeFormulaValue(computedFormula, form) : undefined;
              const isDisabled   = !!computedFormula || (f.disabledWhen?.(form) ?? false);
              const defaultValue = computedFormula
                ? (computedValue !== undefined ? computedValue : "")
                : f.defaultWhen?.(form);

              if (pkField === "column_def_id" && f.key === "formula") {
                const tokens = tokenizeFormula(String(form[f.key] ?? ""));
                const currentCol = String(form.column_name ?? "");
                const localCols = items
                  .map((it) => String(it.column_name ?? ""))
                  .filter(Boolean)
                  .filter((c, idx, arr) => arr.indexOf(c) === idx)
                  .filter((c) => c !== currentCol);
                const availableRefs = Array.from(new Set([
                  ...localCols,
                  ...formulaGlobalRefs,
                ]));
                const selectedRef = formulaPick[f.key] ?? "";
                const numberText = formulaNumber[f.key] ?? "";

                const appendTokens = (...nextTokens: string[]) => {
                  if (isDisabled || nextTokens.length === 0) return;
                  const next = [...tokens, ...nextTokens.filter(Boolean)];
                  setForm((prev) => ({ ...prev, [f.key]: joinFormulaTokens(next) || null }));
                };
                const removeTokenAt = (idx: number) => {
                  if (isDisabled) return;
                  const next = tokens.filter((_, i) => i !== idx);
                  setForm((prev) => ({ ...prev, [f.key]: joinFormulaTokens(next) || null }));
                };

                return (
                  <Box key={f.key}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5, color: "text.secondary" }}>
                      {f.label}
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1, p: 0.75, border: "1px solid", borderColor: "divider", borderRadius: 1, minHeight: 44 }}>
                      {tokens.length === 0 ? (
                        <Typography variant="caption" color="text.disabled">Select columns and operators to build formula</Typography>
                      ) : tokens.map((t, i) => (
                        <Chip key={`${t}-${i}`} label={t} size="small" onDelete={isDisabled ? undefined : () => removeTokenAt(i)} />
                      ))}
                    </Box>

                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 1, alignItems: "center" }}>
                      <FormControl size="small" fullWidth disabled={isDisabled || availableRefs.length === 0}>
                        <InputLabel>Field</InputLabel>
                        <Select
                          value={selectedRef}
                          label="Field"
                          onChange={(e) => setFormulaPick((prev) => ({ ...prev, [f.key]: String(e.target.value || "") }))}
                        >
                          <MenuItem value="">— select —</MenuItem>
                          {availableRefs.map((ref) => (
                            <MenuItem key={ref} value={ref}>{ref}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button size="small" variant="outlined" disabled={isDisabled || !selectedRef} onClick={() => appendTokens(selectedRef)}>
                        Add Field
                      </Button>
                      <Button size="small" variant="outlined" disabled={isDisabled || tokens.length === 0} onClick={() => setForm((prev) => ({ ...prev, [f.key]: null }))}>
                        Clear
                      </Button>
                    </Box>

                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 1, alignItems: "center", mt: 1, p: 1, borderRadius: 1, bgcolor: "#fff9c4" }}>
                      <TextField
                        size="small"
                        label="Number"
                        type="number"
                        value={numberText}
                        disabled
                        helperText="Numeric input is disabled"
                        onChange={(e) => setFormulaNumber((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        disabled
                        onClick={() => {
                          const n = Number(numberText);
                          if (!Number.isFinite(n)) return;
                          appendTokens(String(n));
                        }}
                      >
                        Add Number
                      </Button>
                    </Box>

                    <Box sx={{ display: "flex", gap: 0.75, mt: 1, flexWrap: "wrap" }}>
                      {["+", "-", "*", "/", "(", ")"].map((op) => (
                        <Button key={op} size="small" variant="outlined" disabled={isDisabled} onClick={() => appendTokens(op)}>
                          {op}
                        </Button>
                      ))}
                      <Button size="small" variant="outlined" disabled={isDisabled} onClick={() => appendTokens("pi")}>
                        π
                      </Button>
                      <Button size="small" variant="outlined" disabled={isDisabled} onClick={() => appendTokens("sqrt", "(")}>
                        sqrt(
                      </Button>
                    </Box>
                  </Box>
                );
              }

              // ── tags: chip-list editor with color picker per entry ──
              if (f.type === "tags") {
                const currentCands = parseCandidates(form[f.key]);
                const tagInput = tagInputs[f.key] ?? "";
                const tagColor = tagColors[f.key] ?? "#607d8b";
                const addTag = () => {
                  const t = tagInput.trim();
                  if (!t) return;
                  const next = [...currentCands, { label: t, color: tagColor }];
                  setForm(prev => ({ ...prev, [f.key]: serializeCandidates(next) || null }));
                  setTagInputs(prev => ({ ...prev, [f.key]: "" }));
                };
                return (
                  <Box key={f.key}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5, color: "text.secondary" }}>
                      {f.label}
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 1, p: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1, minHeight: 36 }}>
                      {currentCands.map((cand, i) => (
                        <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Tooltip title="Color">
                            <Box
                              component="input" type="color"
                              value={cand.color ?? "#607d8b"}
                              onChange={(e: any) => {
                                const next = currentCands.map((c, j) => j === i ? { ...c, color: e.target.value } : c);
                                setForm(prev => ({ ...prev, [f.key]: serializeCandidates(next) || null }));
                              }}
                              sx={{ width: 28, height: 22, border: "none", cursor: "pointer", p: 0, borderRadius: 0.5 }}
                            />
                          </Tooltip>
                          {cand.color && (
                            <Tooltip title="Clear color">
                              <IconButton size="small" sx={{ p: 0.2, opacity: 0.5, '&:hover': { opacity: 1 } }}
                                onClick={() => {
                                  const next = currentCands.map((c, j) => j === i ? { label: c.label } : c);
                                  setForm(prev => ({ ...prev, [f.key]: serializeCandidates(next) || null }));
                                }}>
                                <FormatColorResetIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Chip
                            label={cand.label} size="small"
                            sx={{ bgcolor: cand.color ?? undefined, color: cand.color ? "#fff" : undefined, fontWeight: 600, height: 20, fontSize: 11 }}
                            onDelete={() => {
                              const next = currentCands.filter((_, j) => j !== i);
                              setForm(prev => ({ ...prev, [f.key]: serializeCandidates(next) || null }));
                            }}
                          />
                        </Box>
                      ))}
                      {!currentCands.length && <Typography variant="caption" color="text.disabled" sx={{ alignSelf: "center" }}>No options</Typography>}
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <Tooltip title="New entry color">
                        <Box
                          component="input" type="color"
                          value={tagColor}
                          onChange={(e: any) => setTagColors(prev => ({ ...prev, [f.key]: e.target.value }))}
                          sx={{ width: 36, height: 32, border: "none", cursor: "pointer", p: 0, borderRadius: 0.5 }}
                        />
                      </Tooltip>
                      <TextField
                        size="small" placeholder="Add option…"
                        value={tagInput}
                        disabled={isDisabled}
                        onChange={(e) => setTagInputs(prev => ({ ...prev, [f.key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { addTag(); e.preventDefault(); } }}
                        sx={{ flex: 1 }}
                      />
                      <Button size="small" variant="outlined" disabled={isDisabled} onClick={addTag}>Add</Button>
                    </Box>
                  </Box>
                );
              }

              // ── candidates enforcement: column_def has allowed values → Select with colors ──
              const fieldCandidates = candidatesMap[f.key];
              if (fieldCandidates?.length && f.type !== "fk" && f.type !== "boolean") {
                return (
                  <FormControl key={f.key} size="small" fullWidth disabled={isDisabled}>
                    <InputLabel>{f.label}</InputLabel>
                    <Select
                      value={isDisabled ? (defaultValue ?? "") : (form[f.key] ?? "")}
                      label={f.label}
                      onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value || null }))}
                      renderValue={(val) => {
                        if (!val) return <em>— none —</em>;
                        const cand = fieldCandidates.find(c => c.label === val);
                        return (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {cand?.color && <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: cand.color, flexShrink: 0 }} />}
                            {String(val)}
                          </Box>
                        );
                      }}
                    >
                      <MenuItem value="">— none —</MenuItem>
                      {fieldCandidates.map(cand => (
                        <MenuItem key={cand.label} value={cand.label}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {cand.color && <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: cand.color, flexShrink: 0 }} />}
                            {cand.label}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                );
              }

              if (f.type === "fk") {
                const currentVal: string = form[f.key] ?? "";

                // Fields with FK_CONFIG: open IdPickerDialog for rich list + nested detail preview
                if (FK_CONFIG[f.key]) {
                  const opts = fkOptions[f.key] ?? [];
                  const opt  = opts.find(o => o[f.fkPk!] === currentVal);
                  const humanLabel = opt && f.fkLabel ? f.fkLabel(opt) : null;
                  return (
                    <Box key={f.key}>
                      <Typography variant="caption" color="text.secondary"
                        sx={{ display: "block", mb: 0.5, fontWeight: 600 }}>
                        {f.label}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1,
                        border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                        <Typography variant="caption" sx={{
                          fontFamily: "monospace", flex: 1,
                          color: currentVal ? "text.primary" : "text.disabled" }}>
                          {currentVal ? currentVal.slice(0, 18) + "…" : "— (not set)"}
                        </Typography>
                        {currentVal && (
                          <IconButton size="small"
                            onClick={() => setForm(p => ({ ...p, [f.key]: null }))}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                        <Button size="small" variant="outlined"
                          startIcon={<EditIcon fontSize="small" />}
                          onClick={() => setFkPickerField(f.key)}>
                          Select
                        </Button>
                      </Box>
                      {humanLabel && (
                        <Typography variant="caption" color="text.secondary"
                          sx={{ mt: 0.3, display: "block", fontSize: 10 }}>
                          {humanLabel}
                        </Typography>
                      )}
                    </Box>
                  );
                }

                // Fallback: Select dropdown for FK fields not in FK_CONFIG (e.g. composite-PK tables)
                const opts       = fkOptions[f.key] ?? [];
                const inList     = opts.some(o => o[f.fkPk!] === currentVal);
                const selectVal  = inList ? currentVal : currentVal ? "__custom__" : "";
                return (
                  <Box key={f.key}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>{f.label}</InputLabel>
                      <Select
                        value={selectVal}
                        label={f.label}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__generate__") {
                            setForm(prev => ({ ...prev, [f.key]: crypto.randomUUID() }));
                          } else if (v === "__custom__") {
                            // keep as-is
                          } else {
                            setForm(prev => ({ ...prev, [f.key]: v || null }));
                          }
                        }}
                      >
                        <MenuItem value="">— none —</MenuItem>
                        <MenuItem value="__generate__">
                          <Chip label="🔄 Auto-generate new UUID" size="small" color="info" />
                        </MenuItem>
                        {!inList && currentVal && (
                          <MenuItem value="__custom__" disabled>
                            ✎ {currentVal.slice(0, 24)}…
                          </MenuItem>
                        )}
                        {opts.map(opt => (
                          <MenuItem key={opt[f.fkPk!]} value={opt[f.fkPk!]}>
                            {f.fkLabel ? f.fkLabel(opt) : `${opt[f.fkPk!].slice(0, 8)}…`}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {currentVal && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.3, fontFamily: "monospace", display: "block", fontSize: 10 }}>
                        {currentVal}
                      </Typography>
                    )}
                  </Box>
                );
              }
              if (f.options) {
                return (
                  <FormControl key={f.key} size="small" fullWidth disabled={isDisabled}>
                    <InputLabel>{f.label}</InputLabel>
                    <Select
                      value={isDisabled ? (defaultValue ?? "") : (form[f.key] ?? "")}
                      label={f.label}
                      onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      <MenuItem value="">— none —</MenuItem>
                      {f.options.map(opt => (
                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                );
              }
              if (f.type === "boolean") {
                // Use unambiguous string sentinels: "__true__", "__false__", "__none__"
                // Avoids MUI Select falsy-value issues with 0 or false
                const raw = isDisabled ? (defaultValue ?? null) : form[f.key];
                const boolSentinel =
                  raw === true  || raw === 1 || raw === "true"  || raw === "__true__"  ? "__true__"
                  : raw === false || raw === 0 || raw === "false" || raw === "__false__" ? "__false__"
                  : "__none__";
                return (
                  <FormControl key={f.key} size="small" fullWidth disabled={isDisabled}>
                    <InputLabel>{f.label}</InputLabel>
                    <Select
                      value={boolSentinel}
                      label={f.label}
                      onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      <MenuItem value="__none__">— none —</MenuItem>
                      <MenuItem value="__true__">✓ true</MenuItem>
                      <MenuItem value="__false__">✗ false</MenuItem>
                    </Select>
                  </FormControl>
                );
              }
              if (f.type === "date" || f.type === "datetime") {
                const isDatetime = f.type === "datetime";
                const rawVal = isDisabled ? (defaultValue ?? "") : (form[f.key] ?? "");
                // Normalise to YYYY-MM-DD or YYYY-MM-DDTHH:MM for the HTML input
                let inputVal = "";
                if (rawVal) {
                  const s = String(rawVal);
                  const base = s.slice(0, 10).replace(/\//g, "-");
                  if (isDatetime) {
                    const time = s.length >= 16
                      ? s.slice(11, 16).replace(/\//g, ":")
                      : "00:00";
                    inputVal = `${base}T${time}`;
                  } else {
                    inputVal = base;
                  }
                }
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    size="small"
                    type={isDatetime ? "datetime-local" : "date"}
                    value={inputVal}
                    disabled={isDisabled}
                    InputLabelProps={{ shrink: true }}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) { setForm(prev => ({ ...prev, [f.key]: null })); return; }
                      if (isDatetime) {
                        // Store as YYYY/MM/DD HH:MM:SS
                        const [datePart, timePart = "00:00"] = v.split("T");
                        const stored = datePart.replace(/-/g, "/") + " " + (timePart.length === 5 ? timePart + ":00" : timePart);
                        setForm(prev => ({ ...prev, [f.key]: stored }));
                      } else {
                        setForm(prev => ({ ...prev, [f.key]: v.replace(/-/g, "/") }));
                      }
                    }}
                  />
                );
              }
              const adornment = f.endAdornment?.(form);
              return (
                <TextField
                  key={f.key}
                  label={f.label}
                  size="small"
                  type={f.type === "number" ? "number" : "text"}
                  value={isDisabled ? (defaultValue ?? "") : (form[f.key] ?? "")}
                  disabled={isDisabled}
                  onChange={handleChange(f.key, f.type)}
                  InputProps={adornment ? {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Typography variant="body2" sx={{ color: "text.disabled", userSelect: "none" }}>
                          {adornment}
                        </Typography>
                      </InputAdornment>
                    ),
                  } : undefined}
                />
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* ── FK IdPickerDialog (shared by all FK fields that have FK_CONFIG) ── */}
      {fkPickerField && (
        <IdPickerDialog
          open={!!fkPickerField}
          fieldName={fkPickerField}
          currentValue={(form[fkPickerField] as string) ?? null}
          onClose={() => setFkPickerField(null)}
          onApply={(id) => {
            setForm(p => ({ ...p, [fkPickerField!]: id }));
          }}
        />
      )}

    </Box>
  );
}
