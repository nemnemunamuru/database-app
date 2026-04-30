import { useCallback, useEffect, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, Checkbox, CircularProgress, Collapse, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, FormGroup,
  IconButton, List, ListItemButton, ListItemText,
  Paper, Snackbar, Tab, Tabs, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MergeIcon from "@mui/icons-material/CallMerge";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DescriptionIcon from "@mui/icons-material/Description";
import DownloadIcon from "@mui/icons-material/Download";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import TuneIcon from "@mui/icons-material/Tune";
import type { Project, ProjectExperiment } from "../api/projects";
import { projectsApi } from "../api/projects";
import { fetchExperiments, fetchExperimentProjects } from "../api/experiments";
import type { Experiment, ExperimentDetail } from "../api/experiments";
import ExpDeepEditDialog from "../components/projects/ExpDeepEditDialog";
import { DetailPanel } from "../components/experiments/ExperimentDetailPanel";
import { columnDefsTableApi } from "../api/masters";
import type { Candidate } from "../components/masters/EntityCrud";

// ── 2-step Load by Name dialog ────────────────────────────────────────────────
function LoadByNameDialog({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (exp: Experiment) => void;
}) {
  const [allExps, setAllExps] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setSelectedName(null); return; }
    setLoading(true);
    fetchExperiments({ limit: 2000 })
      .then(r => setAllExps(r.data.items))
      .finally(() => setLoading(false));
  }, [open]);

  const NAME_NONE = "（名称なし）";
  const getName = (e: Experiment) => e.remarks?.trim() || NAME_NONE;

  // Distinct names in appearance order
  const names: string[] = Array.from(new Set(allExps.map(getName))).sort((a, b) =>
    a === NAME_NONE ? 1 : b === NAME_NONE ? -1 : a.localeCompare(b, "ja")
  );

  const filtered = selectedName ? allExps.filter(e => getName(e) === selectedName) : [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {/* Step 1: name list */}
      {!selectedName && (
        <>
          <DialogTitle>名称を選択</DialogTitle>
          <DialogContent dividers sx={{ p: 0, maxHeight: 400 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
            ) : names.length === 0 ? (
              <Typography sx={{ p: 2, color: "text.secondary" }}>データがありません</Typography>
            ) : (
              <List dense disablePadding>
                {names.map(name => {
                  const count = allExps.filter(e => getName(e) === name).length;
                  return (
                    <ListItemButton key={name} divider onClick={() => setSelectedName(name)}>
                      <ListItemText
                        primary={name}
                        secondary={`${count} 件`}
                        primaryTypographyProps={{ fontWeight: 500 }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>キャンセル</Button>
          </DialogActions>
        </>
      )}

      {/* Step 2: ID list for selected name */}
      {selectedName && (
        <>
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton size="small" onClick={() => setSelectedName(null)}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            ID を選択
            <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
              名称: {selectedName}
            </Typography>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 0, maxHeight: 400 }}>
            {filtered.length === 0 ? (
              <Typography sx={{ p: 2, color: "text.secondary" }}>該当なし</Typography>
            ) : (
              <List dense disablePadding>
                {filtered.map(exp => (
                  <ListItemButton key={exp.experiment_id} divider onClick={() => { onSelect(exp); onClose(); }}>
                    <ListItemText
                      primary={exp.experiment_id}
                      primaryTypographyProps={{ fontFamily: "monospace", fontSize: 12 }}
                      secondary={[
                        exp.galvano_system_id ? `galvano: ${exp.galvano_system_id.slice(0, 8)}` : null,
                        exp.welding_condition_id ? `weld: ${exp.welding_condition_id.slice(0, 8)}` : null,
                      ].filter(Boolean).join(" / ")}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>キャンセル</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

// ── From EXPERIMENT: create new project from selected experiments ─────────────
function FromExperimentDialog({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, exps: Experiment[]) => Promise<void>;
}) {
  const [projects, setProjects]   = useState<{ project_id: string; project_name: string }[]>([]);
  const [loading, setLoading]     = useState(false);
  const [creating, setCreating]   = useState<string | null>(null); // project_id being created

  useEffect(() => {
    if (!open) { setCreating(null); return; }
    setLoading(true);
    fetchExperimentProjects()
      .then(r => setProjects(r.data))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSelect = async (proj: { project_id: string; project_name: string }) => {
    setCreating(proj.project_id);
    try {
      const r = await fetchExperiments({ limit: 2000, project_id: proj.project_id });
      await onCreate(proj.project_name, r.data.items);
      onClose();
    } finally {
      setCreating(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>From EXPERIMENT — プロジェクトを選択</DialogTitle>
      <DialogContent dividers sx={{ p: 0, minHeight: 160 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
        ) : projects.length === 0 ? (
          <Typography sx={{ p: 3, color: "text.secondary" }}>
            Experiment DB にプロジェクトが見つかりません
          </Typography>
        ) : (
          <List dense disablePadding>
            {projects.map(p => (
              <ListItemButton
                key={p.project_id}
                divider
                disabled={creating !== null}
                onClick={() => handleSelect(p)}
              >
                <ListItemText
                  primary={p.project_name}
                  secondary={p.project_id}
                  primaryTypographyProps={{ fontWeight: 500 }}
                  secondaryTypographyProps={{ fontFamily: "monospace", fontSize: 11 }}
                />
                {creating === p.project_id && <CircularProgress size={18} sx={{ ml: 1 }} />}
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={creating !== null}>キャンセル</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Load from Experiment DB by project name/ID ───────────────────────────────
function LoadByProjectDialog({ open, onClose, onSelectAll }: {
  open: boolean;
  onClose: () => void;
  onSelectAll: (exps: Experiment[]) => void;
}) {
  const [projects, setProjects] = useState<{ project_id: string; project_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProj, setSelectedProj] = useState<{ project_id: string; project_name: string } | null>(null);
  const [exps, setExps] = useState<Experiment[]>([]);
  const [expsLoading, setExpsLoading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) { setSelectedProj(null); setExps([]); setChecked(new Set()); return; }
    setLoading(true);
    fetchExperimentProjects().then(r => setProjects(r.data)).finally(() => setLoading(false));
  }, [open]);

  const handleSelectProj = async (proj: { project_id: string; project_name: string }) => {
    setSelectedProj(proj);
    setExpsLoading(true);
    setChecked(new Set());
    try {
      const r = await fetchExperiments({ limit: 2000, project_id: proj.project_id });
      setExps(r.data.items);
      setChecked(new Set(r.data.items.map(e => e.experiment_id)));
    } finally {
      setExpsLoading(false);
    }
  };

  const toggleAll = () => {
    if (checked.size === exps.length) setChecked(new Set());
    else setChecked(new Set(exps.map(e => e.experiment_id)));
  };

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleLoad = () => {
    const selected = exps.filter(e => checked.has(e.experiment_id));
    onSelectAll(selected);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {!selectedProj ? (
        <>
          <DialogTitle>プロジェクトを選択（Experiment DB）</DialogTitle>
          <DialogContent dividers sx={{ p: 0, maxHeight: 420 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
            ) : projects.length === 0 ? (
              <Typography sx={{ p: 2, color: "text.secondary" }}>
                Experiment DBにproject_idが設定された実験がありません
              </Typography>
            ) : (
              <List dense disablePadding>
                {projects.map(p => (
                  <ListItemButton key={p.project_id} divider onClick={() => handleSelectProj(p)}>
                    <ListItemText
                      primary={p.project_name}
                      secondary={p.project_id}
                      primaryTypographyProps={{ fontWeight: 500 }}
                      secondaryTypographyProps={{ fontFamily: "monospace", fontSize: 11 }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>キャンセル</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton size="small" onClick={() => setSelectedProj(null)}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            実験を選択
            <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
              {selectedProj.project_name}
            </Typography>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 0, maxHeight: 400 }}>
            {expsLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
            ) : (
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={checked.size === exps.length && exps.length > 0} indeterminate={checked.size > 0 && checked.size < exps.length} onChange={toggleAll} />
                      </TableCell>
                      <TableCell>experiment_id</TableCell>
                      <TableCell>remarks</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {exps.map(e => (
                      <TableRow key={e.experiment_id} hover onClick={() => toggle(e.experiment_id)} sx={{ cursor: "pointer" }}>
                        <TableCell padding="checkbox">
                          <Checkbox size="small" checked={checked.has(e.experiment_id)} onChange={() => toggle(e.experiment_id)} onClick={ev => ev.stopPropagation()} />
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{e.experiment_id.slice(0, 8)}…</TableCell>
                        <TableCell>{e.remarks ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {exps.length === 0 && (
                      <TableRow><TableCell colSpan={3} align="center" sx={{ color: "text.secondary", py: 3 }}>実験がありません</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DialogContent>
          <DialogActions>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, pl: 1 }}>
              {checked.size} / {exps.length} 件選択
            </Typography>
            <Button onClick={onClose}>キャンセル</Button>
            <Button variant="contained" disabled={checked.size === 0} onClick={handleLoad}>
              プロジェクトに追加
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

// ── Field definitions shared between add/edit forms ───────────────────────────
const EXP_FIELDS = [
  "galvano_system_id",
  "welding_condition_id",
  "experiment_material_id",
  "shielding_condition_id",
  "result_id",
  "observation_id",
  "file_id",
] as const;

type ExpField = (typeof EXP_FIELDS)[number];

const EMPTY_EXP: Partial<ProjectExperiment> = {
  galvano_system_id: null,
  welding_condition_id: null,
  experiment_material_id: null,
  shielding_condition_id: null,
  result_id: null,
  observation_id: null,
  file_id: null,
  project_id: null,
  remarks: null,
};

// ── Unified copy dialog (Main DB or another Project) ─────────────────────────
interface CopyDialogProps {
  open: boolean;
  currentProjectId: string;
  onClose: () => void;
  onCopyMain: (exp: Experiment) => void;
  onCopyProject: (exp: ProjectExperiment) => void;
}
function CopySourceDialog({ open, currentProjectId, onClose, onCopyMain, onCopyProject }: CopyDialogProps) {
  const [tab, setTab] = useState<0 | 1>(0);
  const [search, setSearch] = useState("");

  // Main DB
  const [mainItems, setMainItems] = useState<Experiment[]>([]);
  const [mainLoading, setMainLoading] = useState(false);

  // Projects
  const [otherProjects, setOtherProjects] = useState<Project[]>([]);
  const [projLoading, setProjLoading] = useState(false);
  const [srcProjectId, setSrcProjectId] = useState<string | null>(null);
  const [projExps, setProjExps] = useState<ProjectExperiment[]>([]);
  const [projExpsLoading, setProjExpsLoading] = useState(false);

  useEffect(() => {
    if (!open) { setSearch(""); setSrcProjectId(null); return; }
    setMainLoading(true);
    fetchExperiments({ limit: 500 })
      .then((r) => setMainItems(r.data.items))
      .finally(() => setMainLoading(false));
    setProjLoading(true);
    projectsApi.list()
      .then((r) => setOtherProjects(r.data))
      .finally(() => setProjLoading(false));
  }, [open, currentProjectId]);

  useEffect(() => {
    if (!srcProjectId) { setProjExps([]); return; }
    setProjExpsLoading(true);
    projectsApi.listExperiments(srcProjectId)
      .then((r) => setProjExps(r.data))
      .finally(() => setProjExpsLoading(false));
  }, [srcProjectId]);

  const sid = (id: string | null | undefined) => (id ? id.slice(0, 8) + "…" : "—");

  const filteredMain = mainItems.filter((e) =>
    !search || e.experiment_id.includes(search) ||
    (e.remarks ?? "").toLowerCase().includes(search.toLowerCase()),
  );
  const filteredProj = projExps.filter((e) =>
    !search || e.experiment_id.includes(search) ||
    (e.remarks ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const expTableHead = (
    <TableHead>
      <TableRow>
        <TableCell>experiment_id</TableCell>
        <TableCell>galvano_system_id</TableCell>
        <TableCell>welding_condition_id</TableCell>
        <TableCell>remarks</TableCell>
        <TableCell />
      </TableRow>
    </TableHead>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Copy Experiment</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setSearch(""); }}
          sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}>
          <Tab label="From Main DB" />
          <Tab label="From Project" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {/* ── Tab 0: Main DB ── */}
          {tab === 0 && (
            <>
              <TextField
                fullWidth size="small" placeholder="Search by ID or remarks…"
                value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 1.5 }}
              />
              {mainLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}><CircularProgress /></Box>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
                  <Table size="small" stickyHeader>
                    {expTableHead}
                    <TableBody>
                      {filteredMain.map((exp) => (
                        <TableRow key={exp.experiment_id} hover>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{sid(exp.experiment_id)}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{sid(exp.galvano_system_id)}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{sid(exp.welding_condition_id)}</TableCell>
                          <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exp.remarks ?? ""}</TableCell>
                          <TableCell>
                            <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />}
                              onClick={() => { onCopyMain(exp); onClose(); }}>Copy</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredMain.length === 0 && (
                        <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>No experiments found</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}

          {/* ── Tab 1: Other Project ── */}
          {tab === 1 && (
            <>
              {projLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}><CircularProgress /></Box>
              ) : otherProjects.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No projects found.</Typography>
              ) : (
                <>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                    {otherProjects.map((p) => (
                      <Button
                        key={p.project_id} size="small"
                        variant={srcProjectId === p.project_id ? "contained" : "outlined"}
                        onClick={() => { setSrcProjectId(p.project_id); setSearch(""); }}
                      >
                        {p.name} ({p.experiment_count}){p.project_id === currentProjectId ? " ★" : ""}
                      </Button>
                    ))}
                  </Box>
                  {srcProjectId && (
                    <>
                      <TextField
                        fullWidth size="small" placeholder="Search by ID or remarks…"
                        value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 1.5 }}
                      />
                      {projExpsLoading ? (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}><CircularProgress /></Box>
                      ) : (
                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 260 }}>
                          <Table size="small" stickyHeader>
                            {expTableHead}
                            <TableBody>
                              {filteredProj.map((exp) => (
                                <TableRow key={exp.experiment_id} hover>
                                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{sid(exp.experiment_id)}</TableCell>
                                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{sid(exp.galvano_system_id)}</TableCell>
                                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{sid(exp.welding_condition_id)}</TableCell>
                                  <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exp.remarks ?? ""}</TableCell>
                                  <TableCell>
                                    <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />}
                                      onClick={() => { onCopyProject(exp); onClose(); }}>Copy</Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                              {filteredProj.length === 0 && (
                                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>No experiments found</TableCell></TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── ReportSettingsDialog ─────────────────────────────────────────────────────
interface ReportSettingsDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
}

function ReportSettingsDialog({ open, projectId, onClose }: ReportSettingsDialogProps) {
  const [sections, setSections] = useState<{ section: string; fields: string[] }[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    Promise.all([
      projectsApi.reportFields(projectId),
      projectsApi.getReportConfig(projectId),
    ]).then(([fieldsRes, configRes]) => {
      setSections(fieldsRes.data);
      setHidden(new Set(configRes.data.hidden_fields));
    }).finally(() => setLoading(false));
  }, [open, projectId]);

  const toggleField = (key: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSection = (fields: string[]) => {
    const allHidden = fields.every(f => hidden.has(f));
    setHidden(prev => {
      const next = new Set(prev);
      if (allHidden) fields.forEach(f => next.delete(f));
      else fields.forEach(f => next.add(f));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await projectsApi.putReportConfig(projectId, Array.from(hidden));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Report Settings</DialogTitle>
      <DialogContent dividers sx={{ p: 0, maxHeight: "70vh", overflowY: "auto" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
        ) : (
          sections.map(({ section, fields }) => {
            const allChecked = fields.every(f => !hidden.has(f));
            const someChecked = fields.some(f => !hidden.has(f));
            return (
              <Accordion key={section} disableGutters defaultExpanded
                sx={{ "&:before": { display: "none" }, borderBottom: 1, borderColor: "divider" }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, "& .MuiAccordionSummary-content": { alignItems: "center", my: 0 } }}>
                  <FormControlLabel
                    onClick={(e) => e.stopPropagation()}
                    control={
                      <Checkbox
                        checked={allChecked}
                        indeterminate={!allChecked && someChecked}
                        onChange={() => toggleSection(fields)}
                        size="small"
                      />
                    }
                    label={<Typography fontWeight={600} fontSize={14}>{section}</Typography>}
                    sx={{ mr: 0 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: "auto", mr: 1 }}>
                    {fields.filter(f => !hidden.has(f)).length} / {fields.length}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0, pb: 1, pl: 4 }}>
                  <FormGroup>
                    {fields.map(f => (
                      <FormControlLabel
                        key={f}
                        control={<Checkbox checked={!hidden.has(f)} onChange={() => toggleField(f)} size="small" />}
                        label={<Typography fontSize={12} fontFamily="monospace">{f}</Typography>}
                        sx={{ mb: 0, height: 28 }}
                      />
                    ))}
                  </FormGroup>
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || loading}>
          {saving ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Adapter: projects deep response → ExperimentDetail ───────────────────────
function deepToDetail(deep: any): ExperimentDetail {
  const exp = deep.experiment ?? {};
  const proj = deep.project ?? {};
  const gs = deep.galvano_system;
  return {
    experiment_id: exp.experiment_id ?? "",
    galvano_system_id: exp.galvano_system_id ?? null,
    welding_condition_id: exp.welding_condition_id ?? null,
    experiment_material_id: exp.experiment_material_id ?? null,
    shielding_condition_id: exp.shielding_condition_id ?? null,
    result_id: exp.result_id ?? null,
    observation_id: exp.observation_id ?? null,
    file_id: exp.file_id ?? null,
    project_id: exp.project_id ?? null,
    project_name: proj?.project_name ?? null,
    remarks: exp.remarks ?? null,
    galvano_system: gs ? { ...gs, optics: gs.optics_rows ?? [] } : null,
    welding_condition: deep.welding_condition ?? null,
    experiment_material: deep.experiment_material ?? null,
    shielding_condition: deep.shielding_condition ?? null,
    result: deep.result ?? null,
    observation: deep.observation ?? null,
    file: deep.file ?? null,
  } as ExperimentDetail;
}

const KNOWN_EXP_COLS = new Set([
  "experiment_id", "galvano_system_id", "welding_condition_id",
  "experiment_material_id", "shielding_condition_id",
  "result_id", "observation_id", "file_id", "project_id", "project_name", "remarks",
]);

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewProjectPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<ProjectExperiment[]>([]);

  // Dialogs
  const [newProjName, setNewProjName] = useState("");
  const [showNewProj, setShowNewProj] = useState(false);
  const [creatingProj, setCreatingProj] = useState(false);

  const [showExpForm, setShowExpForm] = useState(false);
  const [editingExp, setEditingExp] = useState<ProjectExperiment | null>(null);
  const [savingExp, setSavingExp] = useState(false);

  const [showCopy, setShowCopy] = useState(false);
  const [showLoadByName, setShowLoadByName] = useState(false);
  const [showLoadByProject, setShowLoadByProject] = useState(false);
  const [showFromExperiment, setShowFromExperiment] = useState(false);
  const [showReportSettings, setShowReportSettings] = useState(false);

  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<null | { inserted: number; total: number }>(null);

  const [showDeleteProj, setShowDeleteProj] = useState(false);
  const [importingProj, setImportingProj] = useState(false);

  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  // Detail panel state
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [deepDetail, setDeepDetail] = useState<ExperimentDetail | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [candidatesMap, setCandidatesMap] = useState<Record<string, Candidate[]>>({});
  const [customCols, setCustomCols] = useState<{ column_name: string }[]>([]);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    const r = await projectsApi.list();
    setProjects(r.data);
  }, []);

  const loadExperiments = useCallback(async (id: string) => {
    const r = await projectsApi.listExperiments(id);
    setExperiments(r.data);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (selectedId) loadExperiments(selectedId);
    else setExperiments([]);
  }, [selectedId, loadExperiments]);

  // Reset detail when project changes
  useEffect(() => {
    setSelectedExpId(null);
    setDeepDetail(null);
  }, [selectedId]);

  // Load candidatesMap and custom EXPERIMENT columns once
  useEffect(() => {
    columnDefsTableApi("EXPERIMENT").list().then(r => {
      const cols = (r.data as any[])
        .filter(c => (c.is_id === "" || !c.is_id) && !KNOWN_EXP_COLS.has(c.column_name))
        .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));
      setCustomCols(cols);
    }).catch(() => {});
  }, []);

  const handleExpRowClick = async (exp: ProjectExperiment) => {
    if (!selectedId) return;
    if (selectedExpId === exp.experiment_id) {
      setSelectedExpId(null);
      setDeepDetail(null);
      return;
    }
    setSelectedExpId(exp.experiment_id);
    setDeepDetail(null);
    setDeepLoading(true);
    try {
      const res = await projectsApi.getExperimentDeep(selectedId, exp.experiment_id);
      setDeepDetail(deepToDetail(res.data));
    } finally {
      setDeepLoading(false);
    }
  };

  const selected = projects.find((p) => p.project_id === selectedId);

  // ── Project actions ───────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if (!newProjName.trim()) return;
    setCreatingProj(true);
    try {
      const r = await projectsApi.create(newProjName.trim());
      await loadProjects();
      setSelectedId(r.data.project_id);
      setShowNewProj(false);
      setNewProjName("");
      setToast({ msg: `Project "${r.data.name}" created`, sev: "success" });
    } catch {
      setToast({ msg: "Failed to create project", sev: "error" });
    } finally {
      setCreatingProj(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedId) return;
    const name = selected?.name ?? "";
    await projectsApi.delete(selectedId);
    setShowDeleteProj(false);
    setSelectedId(null);
    await loadProjects();
    setToast({ msg: `Project "${name}" and its database were deleted`, sev: "success" });
  };

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportingProj(true);
    try {
      const r = await projectsApi.importDb(file);
      await loadProjects();
      setSelectedId(r.data.project_id);
      setToast({ msg: `プロジェクト "${r.data.name}" をインポートしました`, sev: "success" });
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "インポートに失敗しました";
      setToast({ msg, sev: "error" });
    } finally {
      setImportingProj(false);
    }
  };

  // ── Experiment actions ────────────────────────────────────────────────────
  const handleSaveExp = async (data: Partial<ProjectExperiment>) => {
    if (!selectedId) return;
    setSavingExp(true);
    try {
      if (editingExp?.experiment_id) {
        await projectsApi.updateExperiment(selectedId, editingExp.experiment_id, data);
      } else {
        await projectsApi.createExperiment(selectedId, data);
      }
      setShowExpForm(false);
      setEditingExp(null);
      await loadExperiments(selectedId);
      await loadProjects();
      setToast({ msg: "Experiment saved", sev: "success" });
    } catch {
      setToast({ msg: "Failed to save experiment", sev: "error" });
    } finally {
      setSavingExp(false);
    }
  };

  const handleDeleteExp = async (expId: string) => {
    if (!selectedId) return;
    if (!confirm("Delete this experiment?")) return;
    await projectsApi.deleteExperiment(selectedId, expId);
    await loadExperiments(selectedId);
    await loadProjects();
  };

  const handleCloneExp = async (exp: ProjectExperiment) => {
    if (!selectedId) return;
    const { experiment_id: _id, ...rest } = exp;
    await projectsApi.createExperiment(selectedId, rest);
    await loadExperiments(selectedId);
  };

  const handleCopyFromMain = async (exp: Experiment) => {
    if (!selectedId) return;
    const payload: Partial<ProjectExperiment> = {
      experiment_id: exp.experiment_id,
      galvano_system_id: exp.galvano_system_id,
      welding_condition_id: exp.welding_condition_id,
      experiment_material_id: exp.experiment_material_id,
      shielding_condition_id: exp.shielding_condition_id,
      result_id: exp.result_id,
      observation_id: exp.observation_id,
      file_id: exp.file_id,
      remarks: exp.remarks ?? null,
    };
    await projectsApi.createExperiment(selectedId, payload);
    await loadExperiments(selectedId);
    await loadProjects();
    setToast({ msg: "Copied from main DB", sev: "success" });
  };

  const handleCopyManyFromMain = async (exps: Experiment[]) => {
    if (!selectedId || exps.length === 0) return;
    for (const exp of exps) {
      await projectsApi.createExperiment(selectedId, {
        experiment_id: exp.experiment_id,
        galvano_system_id: exp.galvano_system_id,
        welding_condition_id: exp.welding_condition_id,
        experiment_material_id: exp.experiment_material_id,
        shielding_condition_id: exp.shielding_condition_id,
        result_id: exp.result_id,
        observation_id: exp.observation_id,
        file_id: exp.file_id,
        remarks: exp.remarks ?? null,
      });
    }
    await loadExperiments(selectedId);
    await loadProjects();
    setToast({ msg: `${exps.length} 件を追加しました`, sev: "success" });
  };

  const handleCreateFromExperiments = async (name: string, exps: Experiment[]) => {
    const r = await projectsApi.create(name);
    const pid = r.data.project_id;
    for (const exp of exps) {
      await projectsApi.createExperiment(pid, {
        experiment_id: exp.experiment_id,
        galvano_system_id: exp.galvano_system_id,
        welding_condition_id: exp.welding_condition_id,
        experiment_material_id: exp.experiment_material_id,
        shielding_condition_id: exp.shielding_condition_id,
        result_id: exp.result_id,
        observation_id: exp.observation_id,
        file_id: exp.file_id,
        remarks: exp.remarks ?? null,
      });
    }
    await loadProjects();
    setSelectedId(pid);
    setToast({ msg: `プロジェクト "${name}" を作成しました（${exps.length} 件）`, sev: "success" });
  };

  const handleCopyFromProject = async (exp: ProjectExperiment) => {
    if (!selectedId) return;
    const payload: Partial<ProjectExperiment> = {
      galvano_system_id: exp.galvano_system_id,
      welding_condition_id: exp.welding_condition_id,
      experiment_material_id: exp.experiment_material_id,
      shielding_condition_id: exp.shielding_condition_id,
      result_id: exp.result_id,
      observation_id: exp.observation_id,
      file_id: exp.file_id,
      remarks: exp.remarks ?? null,
    };
    await projectsApi.createExperiment(selectedId, payload);
    await loadExperiments(selectedId);
    await loadProjects();
    setToast({ msg: "Copied from project", sev: "success" });
  };

  // ── Merge ─────────────────────────────────────────────────────────────────
  const handleMerge = async () => {
    if (!selectedId) return;
    if (!confirm(`Merge project "${selected?.name}" into the main DB?\nExisting records will not be overwritten.`)) return;
    setMerging(true);
    try {
      const r = await projectsApi.merge(selectedId);
      const details = r.data.details;
      const totalInserted = Object.values(details).reduce((s, v) => s + v.inserted, 0);
      const totalSkipped = Object.values(details).reduce((s, v) => s + v.skipped, 0);
      setMergeResult({ inserted: totalInserted, total: totalInserted + totalSkipped });
      setToast({ msg: `Merge complete: ${totalInserted} records inserted`, sev: "success" });
    } catch {
      setToast({ msg: "Merge failed", sev: "error" });
    } finally {
      setMerging(false);
    }
  };

  // ── Markdown report download ──────────────────────────────────────────────
  const handleReportMd = async () => {
    if (!selectedId) return;
    const url = `http://localhost:8000${projectsApi.reportMd(selectedId)}`;
    const projName = selected?.name ?? "report";
    const filename = `${projName}_report.md`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch report");
      const blob = await res.blob();

      // Use File System Access API if available (Chrome/Edge) → lets user pick save location
      if ("showSaveFilePicker" in window) {
        const handle = await (window as Window & typeof globalThis & {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>
        }).showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "Markdown file", accept: { "text/markdown": [".md"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setToast({ msg: "Markdown report saved", sev: "success" });
      } else {
        // Fallback: standard download
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        setToast({ msg: "Markdown report downloaded", sev: "success" });
      }
    } catch (err) {
      // User cancelled the picker → no toast needed
      if (err instanceof Error && err.name !== "AbortError") {
        setToast({ msg: "Failed to generate report", sev: "error" });
      }
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const sid = (id: string | null | undefined) => (id ? id.slice(0, 8) + "…" : "—");

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", gap: 2, height: "calc(100vh - 120px)" }}>
      {/* ── Left sidebar: project list ── */}
      <Paper
        variant="outlined"
        sx={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Button
            fullWidth variant="contained" size="small"
            startIcon={<AddIcon />}
            onClick={() => { setNewProjName(""); setShowNewProj(true); }}
          >
            New
          </Button>
          <Button
            fullWidth variant="outlined" size="small"
            startIcon={importingProj ? <CircularProgress size={14} /> : <UploadFileIcon />}
            component="label"
            disabled={importingProj}
          >
            From DB
            <input type="file" accept=".db" hidden onChange={handleImportProject} />
          </Button>
          <Button
            fullWidth variant="outlined" size="small"
            startIcon={<FolderOpenIcon />}
            onClick={() => setShowFromExperiment(true)}
          >
            From EXPERIMENT
          </Button>
        </Box>

        {projects.length === 0 ? (
          <Box sx={{ p: 2, color: "text.secondary", fontSize: 13 }}>
            No projects yet.
          </Box>
        ) : (
          <List dense sx={{ overflowY: "auto", flexGrow: 1 }}>
            {projects.map((p) => (
              <Box key={p.project_id} sx={{ borderBottom: 1, borderColor: "divider" }}>
                <ListItemButton
                  selected={p.project_id === selectedId}
                  onClick={() => setSelectedId(prev => prev === p.project_id ? null : p.project_id)}
                  sx={{ pr: 1 }}
                >
                  <ListItemText
                    primary={p.name}
                    secondary={`${p.experiment_count} experiments · ${p.created_at.slice(0, 10)}`}
                    primaryTypographyProps={{ noWrap: true, fontWeight: p.project_id === selectedId ? 600 : 400 }}
                    secondaryTypographyProps={{ fontSize: 11 }}
                  />
                  <ExpandMoreIcon
                    fontSize="small"
                    sx={{
                      ml: 0.5, flexShrink: 0, transition: "transform 0.2s",
                      transform: p.project_id === selectedId ? "rotate(180deg)" : "rotate(0deg)",
                      color: "text.secondary",
                    }}
                  />
                </ListItemButton>
              </Box>
            ))}
          </List>
        )}
      </Paper>

      {/* ── Right content ── */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selected ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "text.secondary", gap: 1 }}>
            <FolderOpenIcon sx={{ fontSize: 48, opacity: 0.3 }} />
            <Typography>Select a project or create a new one</Typography>
          </Box>
        ) : (
          <>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Box>
                <Typography variant="h6">{selected.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Created: {selected.created_at.slice(0, 19).replace("T", " ")} · {selected.experiment_count} experiments
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Tooltip title="Download project DB file">
                  <IconButton
                    size="small"
                    onClick={() => window.open(`http://localhost:8000${projectsApi.exportDb(selectedId!)}`, "_blank")}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete project">
                  <IconButton size="small" color="error" onClick={() => setShowDeleteProj(true)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Action buttons */}
            <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
              <Button
                variant="contained" size="small" startIcon={<AddIcon />}
                onClick={() => { setEditingExp(null); setShowExpForm(true); }}
              >
                Add Experiment
              </Button>
              <Button
                variant="outlined" size="small" startIcon={<ContentCopyIcon />}
                onClick={() => setShowCopy(true)}
              >
                Copy
              </Button>
              <Button
                variant="outlined" size="small" startIcon={merging ? <CircularProgress size={14} /> : <MergeIcon />}
                color="success" onClick={handleMerge} disabled={merging || experiments.length === 0}
              >
                Merge to Main DB
              </Button>
              <Button
                variant="outlined" size="small" startIcon={<DescriptionIcon />}
                onClick={handleReportMd} disabled={experiments.length === 0}
              >
                Report (MD)
              </Button>
              <Tooltip title="Report display settings">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => setShowReportSettings(true)}
                    disabled={experiments.length === 0}
                  >
                    <TuneIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>

            {mergeResult && (
              <Alert severity="success" onClose={() => setMergeResult(null)} sx={{ mb: 1.5 }}>
                Merge complete — {mergeResult.inserted} records inserted (of {mergeResult.total} total)
              </Alert>
            )}

            <Divider sx={{ mb: 1.5 }} />

            {/* Experiment table + detail panel */}
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", flexGrow: 1, overflow: "hidden" }}>
              <TableContainer component={Paper} variant="outlined" sx={{ flex: (deepDetail !== null || deepLoading) ? "0 0 58%" : "1 1 100%", overflow: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>experiment_id</TableCell>
                    <TableCell>project_id</TableCell>
                    <TableCell>galvano_system_id</TableCell>
                    <TableCell>welding_condition_id</TableCell>
                    <TableCell>experiment_material_id</TableCell>
                    <TableCell>shielding_condition_id</TableCell>
                    <TableCell>remarks</TableCell>
                    {customCols.map(col => (
                      <TableCell key={col.column_name} sx={{ whiteSpace: "nowrap", fontSize: 11 }}>{col.column_name}</TableCell>
                    ))}
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {experiments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8 + customCols.length} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        No experiments yet. Use "Add Experiment" or "Copy from Main".
                      </TableCell>
                    </TableRow>
                  ) : (
                    experiments.map((exp, idx) => (
                      <TableRow
                        key={exp.experiment_id}
                        hover
                        selected={exp.experiment_id === selectedExpId}
                        sx={{ cursor: "pointer" }}
                        onClick={() => handleExpRowClick(exp)}
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.experiment_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.project_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.galvano_system_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.welding_condition_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.experiment_material_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.shielding_condition_id)}</TableCell>
                        <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {exp.remarks ?? ""}
                        </TableCell>
                        {customCols.map(col => (
                          <TableCell key={col.column_name} sx={{ fontSize: 11 }}>
                            {String((exp as any)[col.column_name] ?? "")}
                          </TableCell>
                        ))}
                        <TableCell align="center" onClick={e => e.stopPropagation()}>
                          <Tooltip title="Copy">
                            <IconButton size="small" onClick={() => handleCloneExp(exp)}>
                              <ContentCopyIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => { setEditingExp(exp); setShowExpForm(true); }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small" color="error"
                              onClick={() => handleDeleteExp(exp.experiment_id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </TableContainer>

              {/* Detail panel */}
              {(deepDetail !== null || deepLoading) && (
                <Box sx={{ flex: "0 0 40%", minWidth: 280, overflow: "auto" }}>
                  {deepLoading ? (
                    <Paper sx={{ p: 2, display: "flex", justifyContent: "center" }}>
                      <CircularProgress size={24} />
                    </Paper>
                  ) : deepDetail && (
                    <DetailPanel
                      detail={deepDetail}
                      candidatesMap={candidatesMap}
                      onEdit={() => {
                        const exp = experiments.find(e => e.experiment_id === selectedExpId);
                        if (exp) { setEditingExp(exp); setShowExpForm(true); }
                      }}
                      onClose={() => { setSelectedExpId(null); setDeepDetail(null); }}
                    />
                  )}
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* ── New project dialog ── */}
      <Dialog open={showNewProj} onClose={() => setShowNewProj(false)} fullWidth maxWidth="xs">
        <DialogTitle>New Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" label="Project Name"
            value={newProjName}
            onChange={(e) => setNewProjName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewProj(false)}>Cancel</Button>
          <Button
            variant="contained" onClick={handleCreateProject}
            disabled={!newProjName.trim() || creatingProj}
          >
            {creatingProj ? <CircularProgress size={18} /> : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Add / Edit experiment dialog ── */}
      <ExpDeepEditDialog
        open={showExpForm}
        initial={editingExp ?? EMPTY_EXP}
        title={editingExp ? "Edit Experiment" : "Add Experiment"}
        saving={savingExp}
        projectId={selectedId ?? ""}
        onClose={() => { setShowExpForm(false); setEditingExp(null); }}
        onSubmit={handleSaveExp}
      />

      {/* ── Report Settings dialog ── */}
      <ReportSettingsDialog
        open={showReportSettings}
        projectId={selectedId ?? ""}
        onClose={() => setShowReportSettings(false)}
      />

      {/* ── Copy dialog (Main or Project) ── */}
      <CopySourceDialog
        open={showCopy}
        currentProjectId={selectedId ?? ""}
        onClose={() => setShowCopy(false)}
        onCopyMain={handleCopyFromMain}
        onCopyProject={handleCopyFromProject}
      />

      {/* ── From EXPERIMENT dialog ── */}
      <FromExperimentDialog
        open={showFromExperiment}
        onClose={() => setShowFromExperiment(false)}
        onCreate={handleCreateFromExperiments}
      />

      {/* ── Load by Project dialog ── */}
      <LoadByProjectDialog
        open={showLoadByProject}
        onClose={() => setShowLoadByProject(false)}
        onSelectAll={handleCopyManyFromMain}
      />

      {/* ── Load by Name dialog ── */}
      <LoadByNameDialog
        open={showLoadByName}
        onClose={() => setShowLoadByName(false)}
        onSelect={handleCopyFromMain}
      />

      {/* ── Delete Project confirmation dialog ── */}
      <Dialog open={showDeleteProj} onClose={() => setShowDeleteProj(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: "error.main" }}>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            プロジェクト <strong>"{selected?.name}"</strong> を削除しますか？
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            プロジェクトのデータベースファイル（.db）も完全に削除されます。この操作は元に戻せません。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteProj(false)}>キャンセル</Button>
          <Button variant="contained" color="error" onClick={handleDeleteProject}>
            削除する
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Toast ── */}
      <Snackbar
        open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast?.sev ?? "success"} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
