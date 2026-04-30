import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, IconButton, InputAdornment,
  InputLabel, MenuItem, Paper, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import { columnDefsTableApi } from "../../api/masters";
import { useUndo } from "../../context/UndoContext";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CloseIcon from "@mui/icons-material/Close";

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
}

// ── Side panel ────────────────────────────────────────────────────────────────
function SidePanel({
  title, item, treeNodes, loading, onClose, candidatesMap,
}: { title: string; item: any; treeNodes: TItem[] | null; loading: boolean; onClose: () => void; candidatesMap: Record<string, Candidate[]> }) {
  return (
    <Paper
      elevation={3}
      sx={{
        position: "sticky", top: 8,
        maxHeight: "calc(100vh - 220px)", overflow: "auto",
        p: 1.5, minWidth: 260, flex: "0 0 38%",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" fontWeight="bold" color="primary">{title}</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
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
export function EntityCrud({ title, fields, pkField, api, buildTree }: Props) {
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
  const { registerUndo } = useUndo();

  useEffect(() => {
    if (!title) return;
    columnDefsTableApi(title).list().then(r => {
      const map: Record<string, Candidate[]> = {};
      for (const row of (r.data as any[])) {
        if (row.candidates) {
          const parts = parseCandidates(row.candidates);
          if (parts.length) map[row.column_name] = parts;
        }
      }
      setCandidatesMap(map);
    }).catch(() => {});
  }, [title]);

  const showPanel = !!buildTree && selectedId !== null;

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
      const nodes = await buildTree(item);
      setTreeNodes(nodes);
    } finally {
      setTreeLoading(false);
    }
  };

  const handleSave = async () => {
    const payload = { ...form };
    for (const f of fields) {
      if (f.disabledWhen?.(form)) {
        const dv = f.defaultWhen?.(form);
        payload[f.key] = dv !== undefined ? dv : null;
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
    load();
  };

  const handleClone = async (item: any) => {
    const { [pkField]: _pk, ...rest } = item;
    const res = await api.create(rest);
    const newId = res?.data?.[pkField] ?? res?.[pkField];
    if (newId) registerUndo("Clone", async () => { await api.remove(newId); load(); });
    load();
  };

  const handleChange = (key: string, type: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm(prev => ({
      ...prev,
      [key]: type === "number" ? (val === "" ? null : Number(val)) : (val || null),
    }));
  };

  const selectedItem = items.find(i => i[pkField] === selectedId);

  return (
    <Box>
      {/* ── Header ── */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} mb={1}>
        {title ? <Typography variant="subtitle1" fontWeight="bold">{title}</Typography> : <Box />}
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add</Button>
      </Box>

      {/* ── Table + side panel ── */}
      {loading ? <CircularProgress size={20} /> : (
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
          {/* table */}
          <Box sx={{ flex: showPanel ? "0 0 58%" : "1 1 100%", minWidth: 0, overflow: "auto" }}>
            <TableContainer component={Paper} sx={{ maxHeight: 400, overflowX: "auto" }}>
              <Table size="small" stickyHeader sx={{ tableLayout: "auto" }}>
                <TableHead>
                  <TableRow>
                    {pkField !== "_id" && <TableCell align="center" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{pkField}</TableCell>}
                    {fields.filter(f => !f.hideInTable).map(f => (
                      <TableCell key={f.key} align="center" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{f.label}</TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map(item => {
                    const id    = item[pkField];
                    const isSel = selectedId === id;
                    return (
                      <TableRow
                        key={id}
                        hover
                        selected={isSel}
                        onClick={buildTree ? () => handleRowClick(item) : undefined}
                        sx={{ cursor: buildTree ? "pointer" : undefined }}
                      >
                        {pkField !== "_id" && <TableCell align="center" sx={{ fontFamily: "monospace", fontSize: 10, whiteSpace: "nowrap" }}>
                          <Tooltip title={String(id)}><span>{String(id).slice(0, 8) + "…"}</span></Tooltip>
                        </TableCell>}
                        {fields.filter(f => !f.hideInTable).map(f => (
                          <TableCell key={f.key} align="center" sx={{ fontSize: 12, whiteSpace: "nowrap" }}>
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
                                      if (val != null) {
                                        const cand = candidatesMap[f.key]?.find(c => c.label === String(val));
                                        if (cand?.color) {
                                          return <Chip label={cand.label} size="small" sx={{ bgcolor: cand.color, color: "#fff", fontWeight: 700, height: 20, fontSize: 11, borderRadius: "10px" }} />;
                                        }
                                        return <>{String(val)}</>;
                                      }
                                      return <>—</>;
                                    })()}
                          </TableCell>
                        ))}
                        <TableCell align="center" onClick={e => e.stopPropagation()}>
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
            <SidePanel
              title={title}
              item={selectedItem}
              treeNodes={treeNodes}
              loading={treeLoading}
              onClose={() => { setSelectedId(null); setTreeNodes(null); }}
              candidatesMap={candidatesMap}
            />
          )}
        </Box>
      )}

      {/* ── Add / Edit dialog ── */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit" : "Add"} — {title}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {fields.map(f => {
              const isDisabled   = f.disabledWhen?.(form) ?? false;
              const defaultValue = f.defaultWhen?.(form);

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
              if (fieldCandidates?.length && f.type !== "fk") {
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
                const opts       = fkOptions[f.key] ?? [];
                const currentVal: string = form[f.key] ?? "";
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

    </Box>
  );
}
