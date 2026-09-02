import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, Checkbox, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, FormControlLabel, FormGroup, FormLabel, Radio, RadioGroup,
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
import TableViewIcon from "@mui/icons-material/TableView";
import TuneIcon from "@mui/icons-material/Tune";
import type { Project, ProjectExperiment } from "../api/projects";
import { projectsApi } from "../api/projects";
import { fetchExperiments, fetchExperimentProjects } from "../api/experiments";
import type { Experiment, ExperimentDetail } from "../api/experiments";
import AnalysisTab from "../components/experiments/AnalysisTab";
import { settingsApi } from "../api/settings";
import ExpDeepEditDialog from "../components/projects/ExpDeepEditDialog";
import MergeDiffDialog from "../components/projects/MergeDiffDialog";
import type { ConflictItem } from "../components/projects/MergeDiffDialog";
import { DetailPanel } from "../components/experiments/ExperimentDetailPanel";
import { columnDefsTableApi } from "../api/masters";
import type { Candidate } from "../components/masters/EntityCrud";
import ExperimentFilterBar from "../components/common/ExperimentFilterBar";
import {
  type FilterState,
  FILTER_DEFAULT,
  matchDeep,
} from "../utils/experimentFilter";

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

  const NAME_NONE = "(no name)";
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
          <DialogTitle>Select Name</DialogTitle>
          <DialogContent dividers sx={{ p: 0, maxHeight: 400 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
            ) : names.length === 0 ? (
              <Typography sx={{ p: 2, color: "text.secondary" }}>No data</Typography>
            ) : (
              <List dense disablePadding>
                {names.map(name => {
                  const count = allExps.filter(e => getName(e) === name).length;
                  return (
                    <ListItemButton key={name} divider onClick={() => setSelectedName(name)}>
                      <ListItemText
                        primary={name}
                        secondary={`${count} record(s)`}
                        slotProps={{ primary: { sx: { fontWeight: 500 } } }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
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
            Select ID
            <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
              Name: {selectedName}
            </Typography>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 0, maxHeight: 400 }}>
            {filtered.length === 0 ? (
              <Typography sx={{ p: 2, color: "text.secondary" }}>No results</Typography>
            ) : (
              <List dense disablePadding>
                {filtered.map(exp => (
                  <ListItemButton key={exp.experiment_id} divider onClick={() => { onSelect(exp); onClose(); }}>
                    <ListItemText
                      primary={exp.experiment_id}
                      slotProps={{ primary: { sx: { fontFamily: "monospace", fontSize: 12 } } }}
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
            <Button onClick={onClose}>Cancel</Button>
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
  onCreate: (projectId: string, name: string, exps: Experiment[]) => Promise<void>;
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
      await onCreate(proj.project_id, proj.project_name, r.data.items);
      onClose();
    } finally {
      setCreating(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>From EXPERIMENT — Select Project</DialogTitle>
      <DialogContent dividers sx={{ p: 0, minHeight: 160 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
        ) : projects.length === 0 ? (
          <Typography sx={{ p: 3, color: "text.secondary" }}>
            No projects found in Experiment DB
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
                  slotProps={{ primary: { sx: { fontWeight: 500 } }, secondary: { sx: { fontFamily: "monospace", fontSize: 11 } } }}
                />
                {creating === p.project_id && <CircularProgress size={18} sx={{ ml: 1 }} />}
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={creating !== null}>Cancel</Button>
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
          <DialogTitle>Select Project (Experiment DB)</DialogTitle>
          <DialogContent dividers sx={{ p: 0, maxHeight: 420 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
            ) : projects.length === 0 ? (
              <Typography sx={{ p: 2, color: "text.secondary" }}>
                No experiments with project_id found in Experiment DB
              </Typography>
            ) : (
              <List dense disablePadding>
                {projects.map(p => (
                  <ListItemButton key={p.project_id} divider onClick={() => handleSelectProj(p)}>
                    <ListItemText
                      primary={p.project_name}
                      secondary={p.project_id}
                      slotProps={{ primary: { sx: { fontWeight: 500 } }, secondary: { sx: { fontFamily: "monospace", fontSize: 11 } } }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton size="small" onClick={() => setSelectedProj(null)}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            Select Experiments
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
                      <TableRow><TableCell colSpan={3} align="center" sx={{ color: "text.secondary", py: 3 }}>No experiments</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DialogContent>
          <DialogActions>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, pl: 1 }}>
              {checked.size} / {exps.length} selected
            </Typography>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" disabled={checked.size === 0} onClick={handleLoad}>
              Add to Project
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
  const [layoutMode, setLayoutMode] = useState<"sectioned" | "combined_by_experiment">("sectioned");
  const [chartColumns, setChartColumns] = useState(2);
  const [chartWidth, setChartWidth] = useState(640);
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
      setLayoutMode(configRes.data.layout_mode ?? "sectioned");
      setChartColumns(configRes.data.chart_columns ?? 2);
      setChartWidth(configRes.data.chart_width ?? 640);
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
      await projectsApi.putReportConfig(projectId, {
        hidden_fields: Array.from(hidden),
        layout_mode: layoutMode,
        chart_columns: Math.max(1, Math.min(6, Number.isFinite(chartColumns) ? chartColumns : 2)),
        chart_width: Math.max(120, Math.min(3000, Number.isFinite(chartWidth) ? chartWidth : 640)),
      });
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
          <>
            <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: "divider", bgcolor: "background.default" }}>
              <FormControl fullWidth>
                <FormLabel sx={{ mb: 1, fontSize: 14, fontWeight: 600, color: "text.primary" }}>Table Layout</FormLabel>
                <RadioGroup value={layoutMode} onChange={(e) => setLayoutMode(e.target.value as "sectioned" | "combined_by_experiment") }>
                  <FormControlLabel value="sectioned" control={<Radio size="small" />} label="Current: separate table for each section" />
                  <FormControlLabel value="combined_by_experiment" control={<Radio size="small" />} label="Combine selected items into one table by experiment ID" />
                </RadioGroup>
              </FormControl>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mt: 1.25 }}>
                <TextField
                  size="small"
                  label="Charts per row"
                  type="number"
                  inputProps={{ min: 1, max: 6 }}
                  value={chartColumns}
                  onChange={(e) => setChartColumns(Number(e.target.value || 2))}
                  helperText="1-6"
                />
                <TextField
                  size="small"
                  label="Chart width (px)"
                  type="number"
                  inputProps={{ min: 120, max: 3000 }}
                  value={chartWidth}
                  onChange={(e) => setChartWidth(Number(e.target.value || 640))}
                  helperText="Image render width"
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                role項目は1つ選ぶと、同じrole系の複数行に自動適用されます。
              </Typography>
            </Box>
            {sections.map(({ section, fields }) => {
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
                      label={<Typography sx={{ fontWeight: 600, fontSize: 14 }}>{section}</Typography>}
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
                          label={<Typography sx={{ fontSize: 12, fontFamily: "monospace" }}>{f}</Typography>}
                          sx={{ mb: 0, height: 28 }}
                        />
                      ))}
                    </FormGroup>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </>
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
    project_remarks: proj?.remarks ?? null,
    remarks: exp.remarks ?? null,
    // Store raw project object for dynamic display in DetailPanel
    project: proj,
    galvano_system: gs ? { ...gs, optics: gs.optics_rows ?? [] } : null,
    welding_condition: deep.welding_condition ?? null,
    experiment_material: deep.experiment_material ?? null,
    shielding_condition: deep.shielding_condition ?? null,
    result: deep.result ?? null,
    observation: deep.observation ?? null,
    file: deep.file ?? null,
  } as ExperimentDetail;
}

function parseCandidates(raw: unknown): Candidate[] {
  if (raw == null || raw === "") return [];
  const s = String(raw).trim();
  const parts = s.includes("|") ? s.split("|") : s.split("/");
  return parts.map((p: string) => p.trim()).filter(Boolean).map(p => {
    const idx = p.indexOf(";;");
    if (idx >= 0) return { label: p.slice(0, idx), color: p.slice(idx + 2) || undefined };
    return { label: p };
  });
}

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
  const [mergeResult, setMergeResult] = useState<null | { inserted: number; total: number; updated: number }>(null);
  const [mergePreview, setMergePreview] = useState<{ conflicts: ConflictItem[]; new_count: number } | null>(null);
  const [showMergeDiff, setShowMergeDiff] = useState(false);

  const [showDeleteProj, setShowDeleteProj] = useState(false);
  const [importingProj, setImportingProj] = useState(false);

  const [toast, setToast] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  // Detail panel state
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [deepDetail, setDeepDetail] = useState<ExperimentDetail | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [candidatesMap, setCandidatesMap] = useState<Record<string, Candidate[]>>({});
  const [orderedCols, setOrderedCols] = useState<{ column_name: string; is_id: string }[]>([]);

  // ── Filter state ─────────────────────────────────────────────────────────────────────────
  const [filterState, setFilterState] = useState<FilterState>(FILTER_DEFAULT);
  // Cache of deep experiment details for search (keyed by experiment_id)
  const [expDetailCache, setExpDetailCache] = useState<Record<string, ExperimentDetail>>({});
  const [cacheLoading, setCacheLoading]     = useState(false);
  const detailLoadingIds = useRef(new Set<string>());

  const [subTab, setSubTab] = useState<number>(0);
  const [triggerBatchReport, setTriggerBatchReport] = useState(false);

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
  }, [orderedCols.length, selectedId, experiments.length]);

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

  // Reset detail, filter and tab when project changes
  useEffect(() => {
    setSelectedExpId(null);
    setDeepDetail(null);
    setFilterState(FILTER_DEFAULT);
    setExpDetailCache({});
    setSubTab(0);
    detailLoadingIds.current.clear();
  }, [selectedId]);

  // Load candidatesMap and custom EXPERIMENT columns once
  useEffect(() => {
    const TABLES = [
      "GALVANO_SYSTEM", "FTHETA", "OPTICS", "LASER_DEVICE", "LASER_BEAM", "DOE",
      "WELDING_CONDITION", "TRAJECTORY_SET", "MAIN_TRAJECTORY", "CIRCLE_PARAMETER", "LINE_PARAMETER", "SPIRAL_PARAMETER",
      "SUB_TRAJECTORY", "EIGHT_PARAMETER", "RASTER_PARAMETER", "WOBBLING_PARAMETER",
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
      const defs = (r.data as any[]).filter(c => c.column_name !== "project_name");
      setOrderedCols(defs.sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)));
    }).catch(() => {});
  }, []);

  // Batch-load deep detail for all project experiments when filter is active
  useEffect(() => {
    if (!filterState.value || !selectedId) return;
    const toLoad = experiments.filter(
      (e) =>
        !(e.experiment_id in expDetailCache) &&
        !detailLoadingIds.current.has(e.experiment_id),
    );
    if (!toLoad.length) return;

    setCacheLoading(true);
    toLoad.forEach((e) => detailLoadingIds.current.add(e.experiment_id));
    const BATCH = 5;
    const runBatches = async () => {
      for (let i = 0; i < toLoad.length; i += BATCH) {
        const batch = toLoad.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map((e) =>
            projectsApi.getExperimentDeep(selectedId, e.experiment_id).then((r) =>
              setExpDetailCache((prev) => ({
                ...prev,
                [e.experiment_id]: deepToDetail(r.data),
              })),
            ),
          ),
        );
      }
    };
    runBatches().finally(() => setCacheLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState.value, experiments, selectedId]);

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
      const detail = deepToDetail(res.data);
      setDeepDetail(detail);
      // Populate search cache too
      setExpDetailCache((prev) => ({ ...prev, [exp.experiment_id]: detail }));
    } finally {
      setDeepLoading(false);
    }
  };

  const selected = projects.find((p) => p.project_id === selectedId);

  const colNames = useMemo(() => orderedCols.map((c) => c.column_name), [orderedCols]);

  const visibleExps = useMemo(() => {
    if (!filterState.value) return experiments;
    return experiments.filter((exp) =>
      matchDeep(
        exp as unknown as Record<string, unknown>,
        (expDetailCache[exp.experiment_id] as unknown as Record<string, unknown>) ?? null,
        filterState,
        colNames,
      ),
    );
  }, [experiments, filterState, expDetailCache, colNames]);

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
      setToast({ msg: `Project "${r.data.name}" imported successfully`, sev: "success" });
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Import failed";
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
      // experiment_id omitted → backend generates new UUID
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
        // experiment_id omitted → backend generates new UUID
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
    setToast({ msg: `${exps.length} experiment(s) added`, sev: "success" });
  };

  const handleCreateFromExperiments = async (projectId: string, name: string, exps: Experiment[]) => {
    const r = await projectsApi.create(name, projectId);
    const pid = r.data.project_id;
    for (const exp of exps) {
      await projectsApi.createExperiment(pid, {
        experiment_id: exp.experiment_id,   // preserve original ID
        galvano_system_id: exp.galvano_system_id,
        welding_condition_id: exp.welding_condition_id,
        experiment_material_id: exp.experiment_material_id,
        shielding_condition_id: exp.shielding_condition_id,
        result_id: exp.result_id,
        observation_id: exp.observation_id,
        file_id: exp.file_id,
        project_id: exp.project_id ?? pid,  // preserve original project_id
        remarks: exp.remarks ?? null,
      });
    }
    await loadProjects();
    setSelectedId(pid);
    setToast({ msg: `Project "${name}" created (${exps.length} experiment(s))`, sev: "success" });
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
    setMerging(true);
    try {
      const r = await projectsApi.mergePreview(selectedId);
      setMergePreview(r.data);
      setShowMergeDiff(true);
    } catch {
      setToast({ msg: "Merge preview failed", sev: "error" });
    } finally {
      setMerging(false);
    }
  };

  const handleMergeConfirm = async (overwriteIds: string[]) => {
    if (!selectedId) return;
    setShowMergeDiff(false);
    setMerging(true);
    try {
      const r = await projectsApi.merge(selectedId, overwriteIds);
      const details = r.data.details;
      const totalInserted = Object.values(details).reduce((s, v) => s + (v.inserted ?? 0), 0);
      const totalSkipped  = Object.values(details).reduce((s, v) => s + (v.skipped  ?? 0), 0);
      const totalUpdated  = Object.values(details).reduce((s, v) => s + (v.updated  ?? 0), 0);
      setMergeResult({ inserted: totalInserted, total: totalInserted + totalSkipped + totalUpdated, updated: totalUpdated });

      // Merge project analysis chart configs into EXPERIMENTS (main) analysis settings
      try {
        const settingsRes = await settingsApi.get("analysis_v5_all");
        if (settingsRes.data.value) {
          const parsed = JSON.parse(settingsRes.data.value);
          const allItems: any[] = parsed.displayItems ?? [];
          const projectItems = allItems.filter((i: any) => i.chartContext === selectedId);
          if (projectItems.length > 0) {
            // Copy project items as new main items (new id to avoid conflict)
            const newMainItems = projectItems.map((i: any) => ({
              ...i,
              id: crypto.randomUUID(),
              chartContext: "main",
            }));
            const merged = [...allItems, ...newMainItems];
            await settingsApi.set("analysis_v5_all", JSON.stringify({ displayItems: merged }));
          }
        }
      } catch { /* analysis merge is best-effort */ }

      setToast({ msg: `Merge complete: ${totalInserted} inserted / ${totalUpdated} updated`, sev: "success" });
    } catch {
      setToast({ msg: "Merge failed", sev: "error" });
    } finally {
      setMerging(false);
    }
  };

  // ── Markdown report download ──────────────────────────────────────────────
  const handleReportMd = async () => {
    if (!selectedId) return;
    // Switch to Analysis tab and trigger batch report (charts + data tables)
    setSubTab(1);
    setTriggerBatchReport(true);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const sid = (id: string | null | undefined) => (id ? id.slice(0, 8) + "…" : "—");

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
      {/* ── Left sidebar: project list ── */}
      <Paper
        variant="outlined"
        sx={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
             position: "sticky", top: 0, maxHeight: "100vh", alignSelf: "flex-start" }}
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
                    slotProps={{ primary: { noWrap: true, sx: { fontWeight: p.project_id === selectedId ? 600 : 400 } }, secondary: { sx: { fontSize: 11 } } }}
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
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
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
                <Tooltip title="Export project experiments as CSV">
                  <IconButton
                    size="small"
                    onClick={() => window.open(`http://localhost:8000${projectsApi.exportCsv(selectedId!)}`, "_blank")}
                  >
                    <TableViewIcon fontSize="small" />
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
                Merge complete — {mergeResult.inserted} inserted / {mergeResult.updated} updated (total {mergeResult.total})
              </Alert>
            )}

            <Divider />

            {/* Tabs: Experiment List | Analysis */}
            <Tabs
              value={subTab}
              onChange={(_, v) => setSubTab(v)}
              sx={{ borderBottom: 1, borderColor: "divider", mb: 1, minHeight: 36 }}
              slotProps={{ indicator: { style: { height: 2 } } }}
            >
              <Tab label="Experiment List" sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
              <Tab label="Analysis" sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
            </Tabs>

            {subTab === 1 && (
              <AnalysisTab
                key={selectedId ?? ""}
                projectId={selectedId ?? undefined}
                triggerBatchReport={triggerBatchReport}
                onBatchReportDone={() => setTriggerBatchReport(false)}
              />
            )}

            {subTab === 0 && (
            <Box sx={{ width: "100%" }}>
              <Box sx={{ mb: 1, paddingRight: (deepDetail !== null || deepLoading) ? "41vw" : 0 }}>
                <ExperimentFilterBar
                  filter={filterState}
                  onChange={setFilterState}
                  cols={orderedCols}
                  loading={cacheLoading}
                />
              </Box>
              <Box sx={{ paddingRight: (deepDetail !== null || deepLoading) ? "41vw" : 0 }}>
              <TableContainer component={Paper} variant="outlined" ref={tableContainerRef} sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ tableLayout: "auto", minWidth: 1100, "& tbody td": { paddingTop: "0 !important", paddingBottom: "0 !important", px: "6px", lineHeight: "1.4" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    {orderedCols.map(col => (
                      <TableCell key={col.column_name} sx={{ whiteSpace: "nowrap", fontSize: 11, minWidth: col.column_name.endsWith("_id") ? 90 : col.column_name.includes("datetime") ? 140 : 100 }}>
                        {col.column_name}
                      </TableCell>
                    ))}
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleExps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={orderedCols.length + 2} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        {experiments.length === 0
                          ? "No experiments yet. Use \"Add Experiment\" or \"Copy from Main\"."
                          : `No matches (${experiments.length} total)`}
                      </TableCell>
                    </TableRow>
                  ) : visibleExps.map((exp, idx) => (
                    <TableRow
                      key={exp.experiment_id}
                      hover
                      selected={exp.experiment_id === selectedExpId}
                      sx={{ cursor: "pointer", "& td": { paddingTop: "0 !important", paddingBottom: "0 !important" } }}
                      onClick={() => handleExpRowClick(exp)}
                    >
                      <TableCell style={{ paddingTop: 0, paddingBottom: 0 }} sx={{ fontSize: 12 }}>{idx + 1}</TableCell>
                      {orderedCols.map(col => {
                        const val = (exp as any)[col.column_name];
                        const isId = col.is_id === "pk" || col.is_id === "fk";
                        return (
                          <TableCell key={col.column_name} style={{ paddingTop: 0, paddingBottom: 0 }} sx={{ fontFamily: isId ? "monospace" : undefined, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                            {isId ? sid(val) : (val != null ? String(val) : "")}
                          </TableCell>
                        );
                      })}
                      <TableCell align="center" style={{ paddingTop: 0, paddingBottom: 0 }} sx={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
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
                  ))}
                </TableBody>
              </Table>
              </TableContainer>
              </Box>

              {/* Detail panel – fixed full height below AppBar */}
              {(deepDetail !== null || deepLoading) && (
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
                  {deepLoading ? (
                    <Paper sx={{ p: 2, display: "flex", justifyContent: "center" }}>
                      <CircularProgress size={24} />
                    </Paper>
                  ) : deepDetail && (
                    <DetailPanel
                      detail={deepDetail}
                      candidatesMap={candidatesMap}
                      extraExpCols={orderedCols}
                      projectData={(deepDetail as any).project ?? undefined}
                      showOctButton={true}
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
            )}
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
            Delete project <strong>"{selected?.name}"</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            The project database file (.db) will also be permanently deleted. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteProj(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteProject}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Merge Diff Dialog ── */}
      {mergePreview && (
        <MergeDiffDialog
          open={showMergeDiff}
          projectName={selected?.name ?? ""}
          conflicts={mergePreview.conflicts}
          newCount={mergePreview.new_count}
          onCancel={() => setShowMergeDiff(false)}
          onConfirm={handleMergeConfirm}
        />
      )}

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
