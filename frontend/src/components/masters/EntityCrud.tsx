import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, IconButton, InputLabel,
  MenuItem, Paper, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";

// ── Shared tree types ─────────────────────────────────────────────────────────
export type TItem = { label: React.ReactNode; value?: React.ReactNode; children?: TItem[] };

export function TreeBlock({ items, depth = 0 }: { items: TItem[]; depth?: number }) {
  return (
    <>
      {items.map((item, i) => {
        const isLast   = i === items.length - 1;
        const hasKids  = !!item.children?.length;
        const isHeader = hasKids && item.value === undefined;
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
                {item.label}
              </Box>
              {item.value !== undefined && (
                <Box sx={{ fontSize: 11, color: "text.primary", wordBreak: "break-word", display: "flex", alignItems: "center" }}>
                  {item.value}
                </Box>
              )}
            </Box>
            {hasKids && <TreeBlock items={item.children!} depth={depth + 1} />}
          </Fragment>
        );
      })}
    </>
  );
}

// ── Field definition ──────────────────────────────────────────────────────────
export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "fk";
  renderCell?: (value: any) => React.ReactNode;
  /** If true, this field is hidden in the table but still shown in the edit dialog */
  hideInTable?: boolean;
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
  /** Optional function returning a hex color used for left border + row tint */
  rowColor?: (item: any) => string | undefined;
}

// ── Side panel ────────────────────────────────────────────────────────────────
function SidePanel({
  title, item, treeNodes, loading, onClose,
}: { title: string; item: any; treeNodes: TItem[] | null; loading: boolean; onClose: () => void }) {
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
              <TreeBlock items={[sec]} depth={0} />
            </Fragment>
          ))
          : <Typography variant="body2" color="text.secondary" fontSize={11}>—</Typography>
      }
    </Paper>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function EntityCrud({ title, fields, pkField, api, buildTree, rowColor }: Props) {
  const [items, setItems]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [open, setOpen]               = useState(false);
  const [editing, setEditing]         = useState<any | null>(null);
  const [form, setForm]               = useState<Record<string, any>>({});
  const [fkOptions, setFkOptions]     = useState<Record<string, any[]>>({});
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [treeNodes, setTreeNodes]     = useState<TItem[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);

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
    if (editing) {
      await api.update(editing[pkField], form);
    } else {
      await api.create(form);
    }
    setOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this record?")) return;
    await api.remove(id);
    if (selectedId === id) { setSelectedId(null); setTreeNodes(null); }
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
                    <TableCell align="center" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>{pkField.replace(/_id$/, '').toUpperCase()}</TableCell>
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
                    const color = rowColor ? rowColor(item) : undefined;
                    return (
                      <TableRow
                        key={id}
                        hover
                        selected={isSel}
                        onClick={buildTree ? () => handleRowClick(item) : undefined}
                        sx={{
                          cursor: buildTree ? "pointer" : undefined,
                          bgcolor: color ? `${color}18` : undefined,
                          borderLeft: color ? `3px solid ${color}` : undefined,
                        }}
                      >
                        <TableCell align="center" sx={{ fontFamily: "monospace", fontSize: 10, whiteSpace: "nowrap" }}>
                          {String(id)}
                        </TableCell>
                        {fields.filter(f => !f.hideInTable).map(f => (
                          <TableCell key={f.key} align="center" sx={{ fontSize: 12, whiteSpace: "nowrap" }}>
                            {f.renderCell
                              ? f.renderCell(item[f.key])
                              : item[f.key] != null ? String(item[f.key]) : "—"}
                          </TableCell>
                        ))}
                        <TableCell align="center" onClick={e => e.stopPropagation()}>
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
              return (
                <TextField
                  key={f.key}
                  label={f.label}
                  size="small"
                  type={f.type === "number" ? "number" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={handleChange(f.key, f.type)}
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
