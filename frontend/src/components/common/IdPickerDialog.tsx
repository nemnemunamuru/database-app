/**
 * IdPickerDialog
 *
 * List on the left, detail preview on the right.
 * Single-click  → highlight + show detail
 * Double-click  → apply (calls onApply and closes)
 * "Apply" button → same as double-click on highlighted item
 */
import { useEffect, useRef, useState } from "react";
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, List, ListItemButton, ListItemText, Paper, Typography,
} from "@mui/material";
import api from "../../api/client";
import { FK_CONFIG } from "./IdSelectField";
import { TreeBlock } from "../experiments/ExperimentDetailPanel";
import type { TItem } from "../experiments/ExperimentDetailPanel";
import type { Candidate } from "../masters/EntityCrud";
import { columnDefsTableApi } from "../../api/masters";

// Map fieldName → detail endpoint (for richer nested previews)
const DETAIL_ENDPOINT: Record<string, string> = {
  galvano_system_id:      "/api/masters/galvano-systems/{id}/detail",
  welding_condition_id:   "/api/masters/welding-conditions/{id}/detail",
  experiment_material_id: "/api/masters/experiment-materials/{id}/detail",
  shielding_condition_id: "/api/masters/shielding-conditions/{id}",
  result_id:              "/api/masters/results/{id}",
  observation_id:         "/api/masters/observations/{id}",
  file_id:                "/api/masters/files/{id}",
  project_id:             "/api/masters/projects/{id}",
  ftheta_id:              "/api/masters/ftheta/{id}",
  trajectory_set_id:      "/api/masters/trajectory-sets/{id}/detail",
  main_trajectory_id:     "/api/masters/main-trajectories/{id}/detail",
  main_trajectory_type_parameter_id: "/api/masters/line-parameters/{id}",
  sub_trajectory_id:      "/api/masters/sub-trajectories/{id}/detail",
  sub_trajectory_type_parameter_id:  "/api/masters/wobbling-parameters/{id}",
  material_state_id:      "/api/masters/material-states/{id}/detail",
  material_id:            "/api/masters/materials/{id}",
  // ── Master sub-entity FKs ─────────────────────────────────────────────────
  laser_device_id:              "/api/masters/laser-devices/{id}/detail",
  doe_id:                       "/api/masters/doe/{id}",
  main_trajectory_parameter_id: "/api/masters/line-parameters/{id}",
  sub_trajectory_parameter_id:  "/api/masters/wobbling-parameters/{id}",
  // ── Composite-PK group IDs ───────────────────────────────────────────────
  optics_id:      "/api/masters/optics/{id}/detail",
};

// Keys to use as a section label when found in an object
const LABEL_KEYS = ["beam_type", "optics_role", "material_role", "profile_shape"];
// Keys to skip entirely in tree display
const SKIP_KEYS = new Set(["_id"]);

// Build a recursive TItem[] from any raw record
function buildTree(record: unknown): TItem[] {
  if (record == null || typeof record !== "object") return [];
  if (Array.isArray(record)) {
    return record.flatMap((item) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) return [];
      const obj = item as Record<string, unknown>;
      // Use a meaningful label from known type/role fields
      const labelKey = LABEL_KEYS.find(k => obj[k] != null);
      const label: string = labelKey ? String(obj[labelKey]) : "—";
      const children = buildTree(obj);
      return children.length ? [{ label, children }] : [];
    });
  }
  const obj = record as Record<string, unknown>;
  return Object.entries(obj).flatMap(([k, v]) => {
    if (SKIP_KEYS.has(k)) return [];
    if (v == null || v === "") return [];
    // Skip FK UUID columns (key ends in _id, value looks like a UUID)
    if (k.endsWith("_id") && typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) return [];
    if (Array.isArray(v)) {
      const children = buildTree(v);
      return children.length ? [{ label: k.toUpperCase(), children }] : [];
    }
    if (typeof v === "object") {
      const children = buildTree(v);
      return children.length ? [{ label: k.toUpperCase(), children }] : [];
    }
    return [{ label: k, value: String(v) }];
  });
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

interface OptionItem {
  id: string;
  label: string;
  raw: Record<string, unknown>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  fieldName: string;
  currentValue: string | null;
  onApply: (id: string | null) => void;
  dialogTitle?: string;
}

export function IdPickerDialog({ open, onClose, fieldName, currentValue, onApply, dialogTitle }: Props) {
  const cfg = FK_CONFIG[fieldName];
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [detail, setDetail] = useState<TItem[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [candidatesMap, setCandidatesMap] = useState<Record<string, Candidate[]>>({});
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load candidatesMap once per dialog open
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    if (!open || !cfg) return;
    setHighlighted(currentValue);
    setDetail(null);
    setLoading(true);
    api.get<unknown[]>(cfg.apiPath)
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : [];
        // Deduplicate by pkField — needed for composite-PK tables (optics, laser_beam)
        // where multiple rows share the same group ID
        const seen = new Set<string>();
        const deduped = (items as Record<string, unknown>[]).filter(r => {
          const id = r[cfg.pkField] as string;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        setOptions(
          deduped.map((r) => ({
            id: r[cfg.pkField] as string,
            label: cfg.labelFields.map(f => r[f]).filter(Boolean).join(" / ") || "—",
            raw: r,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, fieldName]);

  const handleSingleClick = (opt: OptionItem) => {
    setHighlighted(opt.id);
    // Fetch detail for the selected record
    const endpointTemplate = DETAIL_ENDPOINT[fieldName];
    if (!endpointTemplate) {
      setDetail(buildTree(opt.raw));
      return;
    }
    const endpoint = endpointTemplate.replace("{id}", opt.id);
    setDetailLoading(true);
    api.get(endpoint)
      .then((res) => {
        // experiment-materials/detail returns an array — wrap as roles object
        const data = res.data;
        if (Array.isArray(data)) {
          const wrapped = Object.fromEntries(
            (data as Record<string, unknown>[]).map((row) => [row["material_role"] as string ?? "—", row])
          );
          setDetail(buildTree(wrapped));
        } else {
          setDetail(buildTree(data));
        }
      })
      .catch(() => setDetail(buildTree(opt.raw)))
      .finally(() => setDetailLoading(false));
  };

  const handleClick = (opt: OptionItem) => {
    if (clickTimer.current) {
      // double-click: clear timer and apply
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      handleApply(opt.id);
    } else {
      // single click: set timer
      handleSingleClick(opt);
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
      }, 280);
    }
  };

  const handleApply = (id: string | null) => {
    onApply(id);
    onClose();
  };

  if (!cfg) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        {dialogTitle ?? "Select ID"}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          — {fieldName}
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, height: 520, display: "flex", overflow: "hidden" }}>
        {/* ── Left: list ── */}
        <Box sx={{ width: detail ? "42%" : "100%", borderRight: "1px solid", borderColor: "divider", overflow: "auto", flexShrink: 0 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : options.length === 0 ? (
            <Typography sx={{ p: 2, color: "text.secondary", fontSize: 13 }}>No data</Typography>
          ) : (
            <List dense disablePadding>
              {options.map((opt) => (
                <ListItemButton
                  key={opt.id}
                  selected={opt.id === highlighted}
                  divider
                  onClick={() => handleClick(opt)}
                  sx={{
                    bgcolor: opt.id === currentValue ? "action.selected" : undefined,
                    "&.Mui-selected": { bgcolor: "primary.50" },
                  }}
                >
                  <ListItemText
                    primary={opt.label}
                    secondary={opt.id.slice(0, 18) + "…"}
                    slotProps={{
                      primary: { sx: { fontSize: 12, fontWeight: opt.id === currentValue ? 700 : 400 } },
                      secondary: { sx: { fontFamily: "monospace", fontSize: 10 } },
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>

        {/* ── Right: detail ── */}
        {detail !== null && (
          <Box sx={{ flex: 1, overflow: "auto", p: 1.5, bgcolor: "grey.50" }}>
            <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary", mb: 1, display: "block", wordBreak: "break-all" }}>
              {highlighted}
            </Typography>
            <Divider sx={{ mb: 1 }} />
            {detailLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size={20} />
              </Box>
            ) : (
              <Paper variant="outlined" sx={{ p: 1 }}>
                <TreeBlock items={detail} candidatesMap={candidatesMap} />
              </Paper>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, ml: 1 }}>
          Click: Show detail / Double-click: Apply immediately
        </Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" onClick={() => handleApply(null)}>Clear</Button>
        <Button
          variant="contained"
          disabled={!highlighted}
          onClick={() => highlighted && handleApply(highlighted)}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
