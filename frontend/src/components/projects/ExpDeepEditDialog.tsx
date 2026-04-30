/**
 * ExpDeepEditDialog
 *
 * Opens the full nested tree of an experiment.
 * The user can expand any sub-record and edit its fields.
 * On Save, dirty nodes are written bottom-up as new records in the project DB,
 * and parent FK IDs are updated to point to the new children.
 */
import { useEffect, useRef, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary,
  Box, Button, Checkbox, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, TextField, Tooltip, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FiberNewIcon from "@mui/icons-material/FiberNew";
import api from "../../api/client";
import type { ProjectExperiment } from "../../api/projects";
import { projectsApi } from "../../api/projects";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FType = "string" | "number" | "boolean" | "text";
interface Field { key: string; label: string; type: FType }

// A node in the edit tree
interface NodeDef {
  /** Unique key in the flat `nodes` map */
  key: string;
  label: string;
  table: string;
  pkField: string;
  fields: Field[];
  /** Children that this node owns (FK pointing downward) */
  children?: string[];
  /** Array nodes: this node may appear multiple times (optics rows, laser beams) */
  isArray?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node definitions (matches models.py hierarchy)
// ─────────────────────────────────────────────────────────────────────────────

const NODE_DEFS: Record<string, NodeDef> = {
  // ── galvano branch ──────────────────────────────────────────────────────
  galvano_system: {
    key: "galvano_system", label: "Galvano System",
    table: "galvano_system", pkField: "galvano_system_id",
    children: ["ftheta", "optics_group"],
    fields: [
      { key: "galvano_type",     label: "galvano_type",     type: "string" },
      { key: "serial_number",    label: "serial_number",    type: "string" },
      { key: "main_diameter_um", label: "main_diameter_um [µm]", type: "number" },
      { key: "sub_diameter_um",  label: "sub_diameter_um [µm]",  type: "number" },
      { key: "oct_diameter_um",  label: "oct_diameter_um [µm]",  type: "number" },
      { key: "remarks",          label: "remarks",          type: "text" },
    ],
  },
  ftheta: {
    key: "ftheta", label: "Ftheta",
    table: "ftheta", pkField: "ftheta_id",
    fields: [
      { key: "manufacturer",    label: "manufacturer",     type: "string" },
      { key: "model_name",      label: "model_name",       type: "string" },
      { key: "serial_number",   label: "serial_number",    type: "string" },
      { key: "ftheta_focal_mm", label: "ftheta_focal_mm",  type: "number" },
      { key: "remarks",         label: "remarks",          type: "text" },
    ],
  },
  optics_group: {
    key: "optics_group", label: "Optics rows (same optics_id)",
    table: "optics", pkField: "optics_id",
    isArray: true,
    children: ["laser_device", "doe"],
    fields: [
      { key: "optics_role",         label: "optics_role",         type: "string" },
      { key: "manufacturer",        label: "manufacturer",        type: "string" },
      { key: "collimator_focal_mm", label: "collimator_focal_mm", type: "number" },
      { key: "serial_number",       label: "serial_number",       type: "string" },
      { key: "remarks",             label: "remarks",             type: "text" },
    ],
  },
  laser_device: {
    key: "laser_device", label: "Laser Device",
    table: "laser_device", pkField: "laser_device_id",
    children: ["laser_beams"],
    fields: [
      { key: "manufacturer",  label: "manufacturer",  type: "string" },
      { key: "model_name",    label: "model_name",    type: "string" },
      { key: "serial_number", label: "serial_number", type: "string" },
      { key: "beam_structure",label: "beam_structure",type: "string" },
      { key: "remarks",       label: "remarks",       type: "text" },
    ],
  },
  laser_beams: {
    key: "laser_beams", label: "Laser Beams (same laser_beam_id)",
    table: "laser_beam", pkField: "laser_beam_id",
    isArray: true,
    fields: [
      { key: "beam_type",              label: "beam_type",              type: "string" },
      { key: "wavelength_nm",          label: "wavelength_nm",          type: "number" },
      { key: "numerical_aperture",     label: "numerical_aperture",     type: "number" },
      { key: "m2_value",               label: "m2_value",               type: "number" },
      { key: "bpp_mm_mrad",            label: "bpp_mm_mrad",            type: "number" },
      { key: "core_diameter_um",       label: "core_diameter_um [µm]",  type: "number" },
      { key: "ring_inner_diameter_um", label: "ring_inner_diameter_um", type: "number" },
      { key: "ring_outer_diameter_um", label: "ring_outer_diameter_um", type: "number" },
      { key: "remarks",                label: "remarks",                type: "text" },
    ],
  },
  doe: {
    key: "doe", label: "DOE",
    table: "doe", pkField: "doe_id",
    fields: [
      { key: "manufacturer",  label: "manufacturer",  type: "string" },
      { key: "model_name",    label: "model_name",    type: "string" },
      { key: "serial_number", label: "serial_number", type: "string" },
      { key: "profile_shape", label: "profile_shape", type: "string" },
      { key: "remarks",       label: "remarks",       type: "text" },
    ],
  },

  // ── welding branch ──────────────────────────────────────────────────────
  welding_condition: {
    key: "welding_condition", label: "Welding Condition",
    table: "welding_condition", pkField: "welding_condition_id",
    children: ["trajectory_set"],
    fields: [
      { key: "main_power_w",         label: "main_power_w [W]",     type: "number" },
      { key: "sub_power_w",          label: "sub_power_w [W]",      type: "number" },
      { key: "welding_speed_mm_s",   label: "welding_speed [mm/s]", type: "number" },
      { key: "main_focus_offset_mm", label: "main_focus_offset_mm", type: "number" },
      { key: "sub_focus_offset_mm",  label: "sub_focus_offset_mm",  type: "number" },
      { key: "remarks",              label: "remarks",              type: "text" },
    ],
  },
  trajectory_set: {
    key: "trajectory_set", label: "Trajectory Set",
    table: "trajectory_set", pkField: "trajectory_set_id",
    children: ["main_trajectory", "sub_trajectory"],
    fields: [
      { key: "trajectory_csv_path", label: "trajectory_csv_path", type: "string" },
      { key: "remarks",             label: "remarks",             type: "text" },
    ],
  },
  main_trajectory: {
    key: "main_trajectory", label: "Main Trajectory",
    table: "main_trajectory", pkField: "main_trajectory_id",
    children: ["line_parameter"],
    fields: [
      { key: "main_trajectory_type", label: "main_trajectory_type", type: "string" },
      { key: "remarks",              label: "remarks",              type: "text" },
    ],
  },
  line_parameter: {
    key: "line_parameter", label: "Line Parameter",
    table: "line_parameter", pkField: "main_trajectory_type_parameter_id",
    fields: [
      { key: "length_mm", label: "length_mm", type: "number" },
      { key: "remarks",   label: "remarks",   type: "text" },
    ],
  },
  sub_trajectory: {
    key: "sub_trajectory", label: "Sub Trajectory",
    table: "sub_trajectory", pkField: "sub_trajectory_id",
    children: ["wobbling_parameter"],
    fields: [
      { key: "sub_trajectory_type", label: "sub_trajectory_type", type: "string" },
      { key: "remarks",             label: "remarks",             type: "text" },
    ],
  },
  wobbling_parameter: {
    key: "wobbling_parameter", label: "Wobbling Parameter",
    table: "wobbling_parameter", pkField: "sub_trajectory_type_parameter_id",
    fields: [
      { key: "wobble_radius_mm",   label: "wobble_radius_mm",   type: "number" },
      { key: "wobble_frequency_hz",label: "wobble_frequency_hz",type: "number" },
      { key: "circumferential_speed",label:"circumferential_speed",type:"number"},
      { key: "remarks",            label: "remarks",            type: "text" },
    ],
  },

  // ── material branch ─────────────────────────────────────────────────────
  experiment_material: {
    key: "experiment_material", label: "Experiment Material",
    table: "experiment_material", pkField: "experiment_material_id",
    children: ["material_state"],
    fields: [
      { key: "material_role", label: "material_role", type: "string" },
      { key: "remarks",       label: "remarks",       type: "text" },
    ],
  },
  material_state: {
    key: "material_state", label: "Material State",
    table: "material_state", pkField: "material_state_id",
    children: ["material"],
    fields: [
      { key: "thickness_mm",      label: "thickness_mm",      type: "number" },
      { key: "width_mm",          label: "width_mm",          type: "number" },
      { key: "length_mm",         label: "length_mm",         type: "number" },
      { key: "surface_condition", label: "surface_condition", type: "string" },
      { key: "remarks",           label: "remarks",           type: "text" },
    ],
  },
  material: {
    key: "material", label: "Material",
    table: "material", pkField: "material_id",
    fields: [
      { key: "material_name",          label: "material_name",          type: "string" },
      { key: "material_class",         label: "material_class",         type: "string" },
      { key: "density_kg_m3",          label: "density [kg/m³]",        type: "number" },
      { key: "thermal_conductivity_w_mk", label: "thermal_conductivity", type: "number" },
      { key: "reflectivity_1070nm",    label: "reflectivity_1070nm",    type: "number" },
      { key: "remarks",                label: "remarks",                type: "text" },
    ],
  },

  // ── leaf branches ───────────────────────────────────────────────────────
  shielding_condition: {
    key: "shielding_condition", label: "Shielding Condition",
    table: "shielding_condition", pkField: "shielding_condition_id",
    fields: [
      { key: "gas_type",           label: "gas_type",           type: "string" },
      { key: "gas_purity_percent", label: "gas_purity [%]",     type: "number" },
      { key: "gas_flow_l_min",     label: "gas_flow [L/min]",   type: "number" },
      { key: "gas_pressure_kpa",   label: "gas_pressure [kPa]", type: "number" },
      { key: "nozzle_type",        label: "nozzle_type",        type: "string" },
      { key: "nozzle_diameter_mm", label: "nozzle_diameter_mm", type: "number" },
      { key: "nozzle_distance_mm", label: "nozzle_distance_mm", type: "number" },
      { key: "nozzle_angle_deg",   label: "nozzle_angle [deg]", type: "number" },
      { key: "remarks",            label: "remarks",            type: "text" },
    ],
  },
  result: {
    key: "result", label: "Result",
    table: "result", pkField: "result_id",
    fields: [
      { key: "oct_depth_mm",           label: "oct_depth_mm",           type: "number" },
      { key: "cross_section_depth_mm", label: "cross_section_depth_mm", type: "number" },
      { key: "oct_surface_csv_path",   label: "oct_surface_csv_path",   type: "string" },
      { key: "oct_depth_csv_path",     label: "oct_depth_csv_path",     type: "string" },
      { key: "oct_result_csv_path",    label: "oct_result_csv_path",    type: "string" },
      { key: "spatter_flag",           label: "spatter_flag",           type: "boolean" },
      { key: "spatter_severity",       label: "spatter_severity",       type: "number" },
      { key: "gap_opening_flag",       label: "gap_opening_flag",       type: "boolean" },
      { key: "crack_flag",             label: "crack_flag",             type: "boolean" },
      { key: "crack_severity",         label: "crack_severity",         type: "number" },
      { key: "glass_contamination",    label: "glass_contamination",    type: "boolean" },
      { key: "surface_contamination",  label: "surface_contamination",  type: "boolean" },
      { key: "penetration_flag",       label: "penetration_flag",       type: "boolean" },
      { key: "remarks",                label: "remarks",                type: "text" },
    ],
  },
  observation: {
    key: "observation", label: "Observation",
    table: "observation", pkField: "observation_id",
    fields: [
      { key: "observer_name",        label: "observer_name",        type: "string" },
      { key: "observation_datetime", label: "observation_datetime", type: "string" },
      { key: "comment",              label: "comment",              type: "text" },
      { key: "remarks",              label: "remarks",              type: "text" },
    ],
  },
  file: {
    key: "file", label: "File",
    table: "file", pkField: "file_id",
    fields: [
      { key: "remarks", label: "remarks", type: "text" },
    ],
  },
  project: {
    key: "project", label: "Project",
    table: "project", pkField: "project_id",
    fields: [
      { key: "project_name", label: "project_name", type: "string" },
    ],
  },
};

// Top-level branches from Experiment (key → fkField in ProjectExperiment)
const TOP_BRANCHES: Array<{ nodeKey: string; expFk: keyof ProjectExperiment }> = [
  { nodeKey: "galvano_system",      expFk: "galvano_system_id" },
  { nodeKey: "welding_condition",   expFk: "welding_condition_id" },
  { nodeKey: "experiment_material", expFk: "experiment_material_id" },
  { nodeKey: "shielding_condition", expFk: "shielding_condition_id" },
  { nodeKey: "result",              expFk: "result_id" },
  { nodeKey: "observation",         expFk: "observation_id" },
  { nodeKey: "file",                expFk: "file_id" },
  { nodeKey: "project",             expFk: "project_id" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Node state (keyed by nodeKey, or nodeKey+"_"+index for array rows)
// ─────────────────────────────────────────────────────────────────────────────
interface NodeState {
  expanded: boolean;
  loading: boolean;
  /** original data from main DB (or empty) */
  original: Record<string, unknown>;
  /** edited copy */
  data: Record<string, unknown>;
  dirty: boolean;
  /** for array nodes: all rows */
  rows?: Array<{ original: Record<string, unknown>; data: Record<string, unknown>; dirty: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: render a field grid
// ─────────────────────────────────────────────────────────────────────────────
function FieldGrid({
  fields,
  data,
  onChange,
}: {
  fields: Field[];
  data: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
}) {
  return (
    <Grid container spacing={1.5}>
      {fields.map((f) => {
        const raw = data[f.key];
        if (f.type === "boolean") {
          return (
            <Grid item xs={12} sm={6} key={f.key}>
              <FormControlLabel
                control={
                  <Checkbox size="small" checked={!!raw}
                    onChange={(e) => onChange(f.key, e.target.checked)} />
                }
                label={<Typography variant="body2">{f.label}</Typography>}
              />
            </Grid>
          );
        }
        return (
          <Grid item xs={12} sm={f.type === "text" ? 12 : 6} key={f.key}>
            <TextField
              fullWidth size="small" label={f.label}
              type={f.type === "number" ? "number" : "text"}
              multiline={f.type === "text"} rows={f.type === "text" ? 2 : undefined}
              value={raw != null ? String(raw) : ""}
              onChange={(e) => {
                const v = f.type === "number"
                  ? (e.target.value === "" ? null : parseFloat(e.target.value))
                  : (e.target.value || null);
                onChange(f.key, v);
              }}
            />
          </Grid>
        );
      })}
    </Grid>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  initial: Partial<ProjectExperiment>;
  title: string;
  saving: boolean;
  projectId: string;
  onClose: () => void;
  onSubmit: (data: Partial<ProjectExperiment>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function ExpDeepEditDialog({ open, initial, title, saving, projectId, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<Partial<ProjectExperiment>>(initial);
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const [submitting, setSubmitting] = useState(false);

  // Deep-loaded server data (keyed by nodeKey in the /deep response)
  const deepRef = useRef<Record<string, unknown>>({});
  // Same data as a state so accorion headers can reactively show current IDs
  const [deepData, setDeepData] = useState<Record<string, unknown>>({});

  // ── Load deep tree on open ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setNodes({});
    deepRef.current = {};
    setDeepData({});
    setSubmitting(false);

    const expId = (initial as Record<string, unknown>)["experiment_id"] as string | undefined;
    if (!expId || !projectId) return;

    projectsApi.getExperimentDeep(projectId, expId).then((res) => {
      const d = res.data as Record<string, unknown>;
      deepRef.current = d;
      setDeepData(d);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Expand a node ─────────────────────────────────────────────────────────
  const handleToggle = async (nodeKey: string) => {
    const cur = nodes[nodeKey];
    if (cur?.expanded) {
      setNodes((p) => ({ ...p, [nodeKey]: { ...p[nodeKey], expanded: false } }));
      return;
    }
    if (cur && !cur.loading) {
      setNodes((p) => ({ ...p, [nodeKey]: { ...p[nodeKey], expanded: true } }));
      return;
    }

    // start loading
    setNodes((p) => ({
      ...p,
      [nodeKey]: { expanded: true, loading: true, original: {}, data: {}, dirty: false },
    }));

    const def = NODE_DEFS[nodeKey];
    if (!def) return;

    // Try to get data from the /deep preload first, otherwise fetch on demand
    const deep = deepRef.current;
    let rawData: Record<string, unknown> | null = null;
    let rows: Record<string, unknown>[] | null = null;

    const deepKeyMap: Record<string, string> = {
      galvano_system: "galvano_system",
      ftheta: "galvano_system",        // nested under galvano_system.ftheta
      optics_group: "galvano_system",  // galvano_system.optics_rows
      laser_device: "galvano_system",  // nested
      laser_beams: "galvano_system",
      doe: "galvano_system",
      welding_condition: "welding_condition",
      trajectory_set: "welding_condition",
      main_trajectory: "welding_condition",
      line_parameter: "welding_condition",
      sub_trajectory: "welding_condition",
      wobbling_parameter: "welding_condition",
      experiment_material: "experiment_material",
      material_state: "experiment_material",
      material: "experiment_material",
      shielding_condition: "shielding_condition",
      result: "result",
      observation: "observation",
      file: "file",
      project: "project",
    };

    const extractFromDeep = (key: string): Record<string, unknown> | null => {
      const gs = deep["galvano_system"] as Record<string, unknown> | null;
      const wc = deep["welding_condition"] as Record<string, unknown> | null;
      const em = deep["experiment_material"] as Record<string, unknown> | null;
      switch (key) {
        case "galvano_system": return gs ?? null;
        case "ftheta": return (gs?.ftheta as Record<string, unknown>) ?? null;
        case "welding_condition": return wc ?? null;
        case "trajectory_set": return (wc?.trajectory_set as Record<string, unknown>) ?? null;
        case "main_trajectory": return ((wc?.trajectory_set as Record<string, unknown>)?.main_trajectory as Record<string, unknown>) ?? null;
        case "line_parameter": return (((wc?.trajectory_set as Record<string, unknown>)?.main_trajectory as Record<string, unknown>)?.line_parameter as Record<string, unknown>) ?? null;
        case "sub_trajectory": return ((wc?.trajectory_set as Record<string, unknown>)?.sub_trajectory as Record<string, unknown>) ?? null;
        case "wobbling_parameter": return (((wc?.trajectory_set as Record<string, unknown>)?.sub_trajectory as Record<string, unknown>)?.wobbling_parameter as Record<string, unknown>) ?? null;
        case "experiment_material": return em ?? null;
        case "material_state": return (em?.material_state as Record<string, unknown>) ?? null;
        case "material": return ((em?.material_state as Record<string, unknown>)?.material as Record<string, unknown>) ?? null;
        case "shielding_condition": return deep["shielding_condition"] as Record<string, unknown> ?? null;
        case "result": return deep["result"] as Record<string, unknown> ?? null;
        case "observation": return deep["observation"] as Record<string, unknown> ?? null;
        case "file": return deep["file"] as Record<string, unknown> ?? null;
        case "project": return deep["project"] as Record<string, unknown> ?? null;
        case "optics_group": {
          const arr = (gs?.optics_rows as Record<string, unknown>[]) ?? [];
          return arr.length > 0 ? arr[0] : null;  // representative
        }
        case "laser_device": {
          const opticsRows = (gs?.optics_rows as Record<string, unknown>[]) ?? [];
          for (const o of opticsRows) {
            if (o.laser_device) return o.laser_device as Record<string, unknown>;
          }
          return null;
        }
        case "laser_beams": return null; // handled as array
        case "doe": {
          const opticsRows2 = (gs?.optics_rows as Record<string, unknown>[]) ?? [];
          for (const o of opticsRows2) {
            if (o.doe) return o.doe as Record<string, unknown>;
          }
          return null;
        }
        default: return null;
      }
    };

    // Array nodes
    if (nodeKey === "optics_group") {
      const gs = deep["galvano_system"] as Record<string, unknown> | null;
      rows = (gs?.optics_rows as Record<string, unknown>[]) ?? [];
    } else if (nodeKey === "laser_beams") {
      const gs = deep["galvano_system"] as Record<string, unknown> | null;
      const opticsRows = (gs?.optics_rows as Record<string, unknown>[]) ?? [];
      // Get first laser_device's laser_beams
      for (const o of opticsRows) {
        const ld = o.laser_device as Record<string, unknown> | null;
        if (ld?.laser_beams) {
          rows = ld.laser_beams as Record<string, unknown>[];
          break;
        }
      }
      rows = rows ?? [];
    }

    if (rows !== null) {
      // Strip PKs from rows
      const makeEditable = (r: Record<string, unknown>) => {
        const copy = { ...r };
        delete copy[def.pkField];
        return copy;
      };
      setNodes((p) => ({
        ...p,
        [nodeKey]: {
          expanded: true, loading: false,
          original: {}, data: {}, dirty: false,
          rows: rows!.map((r) => ({ original: r, data: makeEditable(r), dirty: false })),
        },
      }));
      return;
    }

    rawData = extractFromDeep(nodeKey);
    if (!rawData) {
      // Fallback: try fetch from main DB using current FK value
      const fkBranchMap: Record<string, keyof ProjectExperiment> = {
        galvano_system: "galvano_system_id",
        welding_condition: "welding_condition_id",
        experiment_material: "experiment_material_id",
        shielding_condition: "shielding_condition_id",
        result: "result_id",
        observation: "observation_id",
        file: "file_id",
        project: "project_id",
      };
      const masterPathMap: Record<string, string> = {
        galvano_system: "galvano-systems",
        ftheta: "ftheta",
        welding_condition: "welding-conditions",
        trajectory_set: "trajectory-sets",
        main_trajectory: "main-trajectories",
        line_parameter: "line-parameters",
        sub_trajectory: "sub-trajectories",
        wobbling_parameter: "wobbling-parameters",
        experiment_material: "experiment-materials",
        material_state: "material-states",
        material: "materials",
        shielding_condition: "shielding-conditions",
        result: "results",
        observation: "observations",
        file: "files",
        laser_device: "laser-devices",
        doe: "doe",
      };
      const path = masterPathMap[nodeKey];
      const fkKey = fkBranchMap[nodeKey];
      const idVal = fkKey ? (form[fkKey] as string | null) : null;
      if (path && idVal) {
        try {
          const res = await api.get(`/api/masters/${path}/${idVal}`);
          rawData = res.data as Record<string, unknown>;
        } catch { /* keep empty */ }
      }
    }

    const clean = { ...(rawData ?? {}) };
    delete clean[def.pkField];

    setNodes((p) => ({
      ...p,
      [nodeKey]: { expanded: true, loading: false, original: rawData ?? {}, data: clean, dirty: false },
    }));
  };

  // ── Field change ──────────────────────────────────────────────────────────
  const handleChange = (nodeKey: string, fieldKey: string, value: unknown) => {
    setNodes((p) => ({
      ...p,
      [nodeKey]: { ...p[nodeKey], data: { ...p[nodeKey].data, [fieldKey]: value }, dirty: true },
    }));
  };

  const handleArrayChange = (nodeKey: string, rowIdx: number, fieldKey: string, value: unknown) => {
    setNodes((p) => {
      const rows = [...(p[nodeKey].rows ?? [])];
      rows[rowIdx] = { ...rows[rowIdx], data: { ...rows[rowIdx].data, [fieldKey]: value }, dirty: true };
      return { ...p, [nodeKey]: { ...p[nodeKey], rows, dirty: rows.some((r) => r.dirty) } };
    });
  };

  // ── Save: bottom-up commit ────────────────────────────────────────────────
  const handleSave = async () => {
    setSubmitting(true);
    try {
      const expPayload: Record<string, unknown> = { ...form };
      const deep = deepRef.current;

      const createRecord = async (table: string, data: Record<string, unknown>) => {
        const res = await api.post(`/api/projects/${projectId}/records/${table}`, data);
        return res.data as Record<string, unknown>;
      };

      // Returns data for a node: expanded state if available, otherwise deepRef cache.
      // The PKs are stripped so the backend assigns a fresh UUID.
      const getNodeData = (nodeKey: string): Record<string, unknown> => {
        const def = NODE_DEFS[nodeKey];
        const n = nodes[nodeKey];
        if (n?.expanded) return { ...n.data };

        const gs = deep["galvano_system"] as Record<string, unknown> | null;
        const wc = deep["welding_condition"] as Record<string, unknown> | null;
        const em = deep["experiment_material"] as Record<string, unknown> | null;
        const ts = (wc?.trajectory_set as Record<string, unknown>) ?? null;
        const mt = (ts?.main_trajectory as Record<string, unknown>) ?? null;
        const st = (ts?.sub_trajectory as Record<string, unknown>) ?? null;

        let raw: Record<string, unknown> | null = null;
        switch (nodeKey) {
          case "galvano_system":       raw = gs; break;
          case "ftheta":               raw = (gs?.ftheta as Record<string, unknown>) ?? null; break;
          case "welding_condition":    raw = wc; break;
          case "trajectory_set":       raw = ts; break;
          case "main_trajectory":      raw = mt; break;
          case "line_parameter":       raw = (mt?.line_parameter as Record<string, unknown>) ?? null; break;
          case "sub_trajectory":       raw = st; break;
          case "wobbling_parameter":   raw = (st?.wobbling_parameter as Record<string, unknown>) ?? null; break;
          case "experiment_material":  raw = em; break;
          case "material_state":       raw = (em?.material_state as Record<string, unknown>) ?? null; break;
          case "material":             raw = ((em?.material_state as Record<string, unknown>)?.material as Record<string, unknown>) ?? null; break;
          case "shielding_condition":  raw = (deep["shielding_condition"] as Record<string, unknown>) ?? null; break;
          case "result":               raw = (deep["result"] as Record<string, unknown>) ?? null; break;
          case "observation":          raw = (deep["observation"] as Record<string, unknown>) ?? null; break;
          case "file":                 raw = (deep["file"] as Record<string, unknown>) ?? null; break;
          case "project":              raw = (deep["project"] as Record<string, unknown>) ?? null; break;
        }
        if (!raw) return {};
        const copy = { ...raw };
        delete copy[def.pkField];
        return copy;
      };

      const isDirty = (...keys: string[]) => keys.some((k) => nodes[k]?.dirty === true);

      // ── galvano branch ──────────────────────────────────────────────────
      if (isDirty("galvano_system", "ftheta", "optics_group", "laser_device", "laser_beams", "doe")) {
        const gsData = getNodeData("galvano_system");

        // ftheta
        if (isDirty("ftheta")) {
          const r = await createRecord("ftheta", getNodeData("ftheta"));
          gsData["ftheta_id"] = r["ftheta_id"];
        }

        // optics rows
        if (isDirty("optics_group", "laser_device", "laser_beams", "doe")) {
          const newOpticsId = crypto.randomUUID();
          const ogNode = nodes["optics_group"];
          const sourceRows: Record<string, unknown>[] = ogNode?.rows
            ? ogNode.rows.map((r) => ({ ...r.data }))
            : ((deep["galvano_system"] as Record<string, unknown>)?.optics_rows as Record<string, unknown>[]) ?? [];

          for (const rowData of sourceRows.map((r) => ({ ...r, optics_id: newOpticsId }))) {
            if (isDirty("laser_device", "laser_beams")) {
              const ldData = getNodeData("laser_device");
              if (isDirty("laser_beams")) {
                const lbNode = nodes["laser_beams"];
                const newLbId = crypto.randomUUID();
                const lbRows: Record<string, unknown>[] = lbNode?.rows
                  ? lbNode.rows.map((r) => ({ ...r.data }))
                  : (((deep["galvano_system"] as Record<string, unknown>)?.optics_rows as Record<string, unknown>[])?.[0]
                      ?.laser_device as Record<string, unknown>)?.laser_beams as Record<string, unknown>[] ?? [];
                for (const lb of lbRows) {
                  await createRecord("laser_beam", { ...lb, laser_beam_id: newLbId });
                }
                ldData["laser_beam_id"] = newLbId;
              }
              const ldRes = await createRecord("laser_device", ldData);
              rowData["laser_device_id"] = ldRes["laser_device_id"];
            }
            if (isDirty("doe")) {
              const doeRes = await createRecord("doe", getNodeData("doe"));
              rowData["doe_id"] = doeRes["doe_id"];
            }
            await createRecord("optics", rowData);
          }
          gsData["optics_id"] = newOpticsId;
        }

        const gsRes = await createRecord("galvano_system", gsData);
        expPayload["galvano_system_id"] = gsRes["galvano_system_id"];
      }

      // ── welding branch ──────────────────────────────────────────────────
      if (isDirty("welding_condition", "trajectory_set", "main_trajectory", "line_parameter", "sub_trajectory", "wobbling_parameter")) {
        const wcData = getNodeData("welding_condition");

        if (isDirty("trajectory_set", "main_trajectory", "line_parameter", "sub_trajectory", "wobbling_parameter")) {
          const tsData = getNodeData("trajectory_set");

          if (isDirty("main_trajectory", "line_parameter")) {
            const mtData = getNodeData("main_trajectory");
            if (isDirty("line_parameter")) {
              const r = await createRecord("line_parameter", getNodeData("line_parameter"));
              mtData["main_trajectory_parameter_id"] = r["main_trajectory_type_parameter_id"];
            }
            const r = await createRecord("main_trajectory", mtData);
            tsData["main_trajectory_id"] = r["main_trajectory_id"];
          }

          if (isDirty("sub_trajectory", "wobbling_parameter")) {
            const stData = getNodeData("sub_trajectory");
            if (isDirty("wobbling_parameter")) {
              const r = await createRecord("wobbling_parameter", getNodeData("wobbling_parameter"));
              stData["sub_trajectory_parameter_id"] = r["sub_trajectory_type_parameter_id"];
            }
            const r = await createRecord("sub_trajectory", stData);
            tsData["sub_trajectory_id"] = r["sub_trajectory_id"];
          }

          const tsRes = await createRecord("trajectory_set", tsData);
          wcData["trajectory_set_id"] = tsRes["trajectory_set_id"];
        }

        const wcRes = await createRecord("welding_condition", wcData);
        expPayload["welding_condition_id"] = wcRes["welding_condition_id"];
      }

      // ── material branch ─────────────────────────────────────────────────
      if (isDirty("experiment_material", "material_state", "material")) {
        const emData = getNodeData("experiment_material");

        if (isDirty("material_state", "material")) {
          const msData = getNodeData("material_state");
          if (isDirty("material")) {
            const r = await createRecord("material", getNodeData("material"));
            msData["material_id"] = r["material_id"];
          }
          const r = await createRecord("material_state", msData);
          emData["material_state_id"] = r["material_state_id"];
        }

        const emRes = await createRecord("experiment_material", emData);
        expPayload["experiment_material_id"] = emRes["experiment_material_id"];
      }

      // ── leaf branches ───────────────────────────────────────────────────
      const leafMap: Array<[string, string, keyof ProjectExperiment]> = [
        ["shielding_condition", "shielding_condition", "shielding_condition_id"],
        ["result",              "result",              "result_id"],
        ["observation",         "observation",         "observation_id"],
        ["file",                "file",                "file_id"],
      ];
      for (const [nodeKey, table, expFk] of leafMap) {
        if (isDirty(nodeKey)) {
          const r = await createRecord(table, getNodeData(nodeKey));
          expPayload[expFk] = r[NODE_DEFS[nodeKey].pkField];
        }
      }

      // project: always stamp current project_id; update project_name if dirty
      expPayload["project_id"] = projectId;
      if (isDirty("project")) {
        const projData = getNodeData("project");
        // Create/upsert project record in project DB
        await api.post(`/api/projects/${projectId}/records/project`, {
          project_id: projectId,
          ...projData,
        }).catch(() => {/* ignore if already exists */});
      }

      onSubmit(expPayload as Partial<ProjectExperiment>);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Current PK ID for a (nested) node, from deepData or node original ──────
  const getNodeCurrentId = (nodeKey: string): string | null => {
    const def = NODE_DEFS[nodeKey];
    // If already expanded, original holds the PK
    const n = nodes[nodeKey];
    if (n?.original?.[def.pkField]) return n.original[def.pkField] as string;
    // Otherwise read from deepData (reactive state)
    const gs = deepData["galvano_system"] as Record<string, unknown> | null;
    const wc = deepData["welding_condition"] as Record<string, unknown> | null;
    const em = deepData["experiment_material"] as Record<string, unknown> | null;
    const ts = (wc?.trajectory_set as Record<string, unknown>) ?? null;
    const mt = (ts?.main_trajectory as Record<string, unknown>) ?? null;
    const st = (ts?.sub_trajectory as Record<string, unknown>) ?? null;
    switch (nodeKey) {
      case "ftheta": return ((gs?.ftheta as Record<string, unknown>)?.[def.pkField] as string) ?? null;
      case "optics_group": return (gs?.optics_id as string) ?? null;
      case "laser_device": {
        const rows = (gs?.optics_rows as Record<string, unknown>[]) ?? [];
        for (const o of rows) { if (o.laser_device_id) return o.laser_device_id as string; }
        return null;
      }
      case "laser_beams": {
        const rows = (gs?.optics_rows as Record<string, unknown>[]) ?? [];
        for (const o of rows) {
          const ld = o.laser_device as Record<string, unknown> | null;
          if (ld?.laser_beam_id) return ld.laser_beam_id as string;
        }
        return null;
      }
      case "doe": {
        const rows = (gs?.optics_rows as Record<string, unknown>[]) ?? [];
        for (const o of rows) { if (o.doe_id) return o.doe_id as string; }
        return null;
      }
      case "trajectory_set": return (ts?.[def.pkField] as string) ?? null;
      case "main_trajectory": return (mt?.[def.pkField] as string) ?? null;
      case "line_parameter": return ((mt?.line_parameter as Record<string, unknown>)?.[def.pkField] as string) ?? null;
      case "sub_trajectory": return (st?.[def.pkField] as string) ?? null;
      case "wobbling_parameter": return ((st?.wobbling_parameter as Record<string, unknown>)?.[def.pkField] as string) ?? null;
      case "material_state": return ((em?.material_state as Record<string, unknown>)?.[def.pkField] as string) ?? null;
      case "material": return (((em?.material_state as Record<string, unknown>)?.material as Record<string, unknown>)?.[def.pkField] as string) ?? null;
      case "project": return (deepData["project"] as Record<string, unknown> | null)?.project_id as string ?? null;
      default: return null;
    }
  };

  // ── Render one node accordion ─────────────────────────────────────────────
  const renderNode = (nodeKey: string, depth = 0) => {
    const def = NODE_DEFS[nodeKey];
    if (!def) return null;
    const node = nodes[nodeKey];
    const isExpanded = node?.expanded ?? false;
    const isDirty = node?.dirty ?? false;
    const currentId = getNodeCurrentId(nodeKey);

    return (
      <Accordion
        key={nodeKey}
        expanded={isExpanded}
        onChange={() => handleToggle(nodeKey)}
        disableGutters
        sx={{
          mb: 0.5, "&:before": { display: "none" },
          border: "1px solid", borderColor: isDirty ? "warning.main" : "divider",
          borderRadius: "4px !important",
          ml: depth * 2,
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
            <Typography variant="body2" fontWeight={600} sx={{ minWidth: 160 }}>{def.label}</Typography>
            {currentId ? (
              <Tooltip title={currentId}>
                <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                  {currentId.slice(0, 14)}…
                </Typography>
              </Tooltip>
            ) : (
              <Typography variant="caption" color="text.disabled">— (empty)</Typography>
            )}
            {isDirty && (
              <Chip label="modified → new record" size="small" color="warning"
                variant="outlined" icon={<FiberNewIcon />} sx={{ ml: "auto", mr: 2 }} />
            )}
          </Box>
        </AccordionSummary>

        <AccordionDetails sx={{ pt: 1.5, pb: 2 }}>
          {node?.loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={22} />
            </Box>
          ) : def.isArray ? (
            // Array node
            (node?.rows ?? []).length === 0 ? (
              <Typography variant="caption" color="text.secondary">No data found in main DB.</Typography>
            ) : (
              (node?.rows ?? []).map((row, idx) => (
                <Box key={idx} sx={{ mb: 1.5, p: 1.5, border: "1px dashed", borderColor: "divider", borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                    Row {idx + 1} {row.dirty ? " — modified" : ""}
                  </Typography>
                  <FieldGrid
                    fields={def.fields}
                    data={row.data}
                    onChange={(k, v) => handleArrayChange(nodeKey, idx, k, v)}
                  />
                  {/* Child nodes for each array row: only shown for optics_group */}
                  {nodeKey === "optics_group" && idx === 0 && def.children?.map((ck) =>
                    renderNode(ck, 0)
                  )}
                </Box>
              ))
            )
          ) : (
            <>
              <FieldGrid
                fields={def.fields}
                data={node?.data ?? {}}
                onChange={(k, v) => handleChange(nodeKey, k, v)}
              />
              {/* Children */}
              {def.children && isExpanded && (
                <Box sx={{ mt: 1.5 }}>
                  {def.children
                    .filter((ck) => nodeKey !== "optics_group") // optics_group children rendered per-row
                    .map((ck) => renderNode(ck, 1))}
                </Box>
              )}
            </>
          )}
        </AccordionDetails>
      </Accordion>
    );
  };

  const isBusy = saving || submitting;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {/* Top-level remarks */}
        <TextField
          fullWidth size="small" label="remarks" multiline rows={2}
          value={form.remarks ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value || null }))}
          sx={{ mb: 2 }}
        />

        {/* Top-level FK branches */}
        {TOP_BRANCHES.map(({ nodeKey, expFk }) => {
          const fkVal = form[expFk] as string | null;
          const node = nodes[nodeKey];
          const isExpanded = node?.expanded ?? false;
          const isDirty = node?.dirty ?? false;
          const def = NODE_DEFS[nodeKey];

          return (
            <Accordion
              key={nodeKey}
              expanded={isExpanded}
              onChange={() => handleToggle(nodeKey)}
              disableGutters
              sx={{
                mb: 1, "&:before": { display: "none" },
                border: "2px solid",
                borderColor: isDirty ? "warning.main" : "divider",
                borderRadius: "4px !important",
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 52 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%" }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 190 }}>
                    {def.label}
                  </Typography>
                  {fkVal ? (
                    <Tooltip title={fkVal}>
                      <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                        {fkVal.slice(0, 14)}…
                      </Typography>
                    </Tooltip>
                  ) : (
                    <Typography variant="caption" color="text.disabled">— (empty)</Typography>
                  )}
                  {isDirty && (
                    <Chip label="modified → new record" size="small" color="warning"
                      variant="outlined" icon={<FiberNewIcon />} sx={{ ml: "auto", mr: 2 }} />
                  )}
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ pt: 1.5, pb: 2 }}>
                {node?.loading ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : (
                  <>
                    <FieldGrid
                      fields={def.fields}
                      data={node?.data ?? {}}
                      onChange={(k, v) => handleChange(nodeKey, k, v)}
                    />
                    {/* Nested children */}
                    {def.children && isExpanded && (
                      <Box sx={{ mt: 1.5 }}>
                        {def.children.map((ck) => renderNode(ck, 0))}
                      </Box>
                    )}
                  </>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isBusy}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={isBusy}>
          {isBusy ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
