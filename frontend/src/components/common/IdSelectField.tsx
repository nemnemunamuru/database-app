/**
 * IdSelectField
 *
 * Autocomplete select for FK UUID fields.
 * Fetches the list from a given API path on mount and renders options as
 *   "<short-id>  label-text"
 * where label-text comes from the first non-id/non-null string/number field.
 */
import { useEffect, useState } from "react";
import {
  Autocomplete, TextField,
} from "@mui/material";
import api from "../../api/client";

// ── Map: FK field name → { apiPath, pkField, labelFields } ───────────────────
interface FkConfig {
  apiPath: string;
  pkField: string;
  /** Ordered list of field names to try for the human-readable label */
  labelFields: string[];
}

export const FK_CONFIG: Record<string, FkConfig> = {
  // ── Top-level experiment FKs ──────────────────────────────────────────────
  galvano_system_id: {
    apiPath: "/api/masters/galvano-systems",
    pkField: "galvano_system_id",
    labelFields: ["galvano_type", "serial_number"],
  },
  welding_condition_id: {
    apiPath: "/api/masters/welding-conditions",
    pkField: "welding_condition_id",
    labelFields: ["main_power_w", "welding_speed_mm_s"],
  },
  experiment_material_id: {
    apiPath: "/api/masters/experiment-materials",
    pkField: "experiment_material_id",
    labelFields: ["material_role"],
  },
  shielding_condition_id: {
    apiPath: "/api/masters/shielding-conditions",
    pkField: "shielding_condition_id",
    labelFields: ["gas_type", "nozzle_type"],
  },
  result_id: {
    apiPath: "/api/masters/results",
    pkField: "result_id",
    labelFields: ["oct_depth_mm", "cross_section_depth_mm"],
  },
  observation_id: {
    apiPath: "/api/masters/observations",
    pkField: "observation_id",
    labelFields: ["observer_name", "observation_datetime"],
  },
  file_id: {
    apiPath: "/api/masters/files",
    pkField: "file_id",
    labelFields: [],
  },
  project_id: {
    apiPath: "/api/masters/projects",
    pkField: "project_id",
    labelFields: ["project_name"],
  },
  // ── Sub-entity PKs (used in ExpDeepEditDialog child nodes) ────────────────
  ftheta_id: {
    apiPath: "/api/masters/ftheta",
    pkField: "ftheta_id",
    labelFields: ["manufacturer", "model_name", "ftheta_focal_mm"],
  },
  trajectory_set_id: {
    apiPath: "/api/masters/trajectory-sets",
    pkField: "trajectory_set_id",
    labelFields: ["trajectory_csv_path"],
  },
  main_trajectory_id: {
    apiPath: "/api/masters/main-trajectories",
    pkField: "main_trajectory_id",
    labelFields: ["main_trajectory_type"],
  },
  main_trajectory_type_parameter_id: {
    apiPath: "/api/masters/line-parameters",
    pkField: "main_trajectory_type_parameter_id",
    labelFields: ["length_mm"],
  },
  sub_trajectory_id: {
    apiPath: "/api/masters/sub-trajectories",
    pkField: "sub_trajectory_id",
    labelFields: ["sub_trajectory_type"],
  },
  sub_trajectory_type_parameter_id: {
    apiPath: "/api/masters/wobbling-parameters",
    pkField: "sub_trajectory_type_parameter_id",
    labelFields: ["wobble_radius_mm", "wobble_frequency_hz"],
  },
  material_state_id: {
    apiPath: "/api/masters/material-states",
    pkField: "material_state_id",
    labelFields: ["thickness_mm", "surface_condition"],
  },
  material_id: {
    apiPath: "/api/masters/materials",
    pkField: "material_id",
    labelFields: ["material_name", "material_class"],
  },
  // ── Master sub-entity FKs (used in EntityCrud edit dialog) ───────────────
  laser_device_id: {
    apiPath: "/api/masters/laser-devices",
    pkField: "laser_device_id",
    labelFields: ["manufacturer", "model_name"],
  },
  doe_id: {
    apiPath: "/api/masters/doe",
    pkField: "doe_id",
    labelFields: ["manufacturer", "model_name"],
  },
  main_trajectory_parameter_id: {
    apiPath: "/api/masters/line-parameters",
    pkField: "main_trajectory_type_parameter_id",
    labelFields: ["length_mm"],
  },
  sub_trajectory_parameter_id: {
    apiPath: "/api/masters/wobbling-parameters",
    pkField: "sub_trajectory_type_parameter_id",
    labelFields: ["wobble_radius_mm", "wobble_frequency_hz"],
  },
  // ── Composite-PK group IDs (deduplicated in picker) ─────────────────────
  optics_id: {
    apiPath: "/api/masters/optics",
    pkField: "optics_id",
    labelFields: ["manufacturer", "optics_role"],
  },
  laser_beam_id: {
    apiPath: "/api/masters/laser-beams",
    pkField: "laser_beam_id",
    labelFields: ["beam_type", "wavelength_nm"],
  },
};

// ── Build a short human-readable label from a record ────────────────────────
function buildLabel(record: Record<string, unknown>, labelFields: string[]): string {
  const parts: string[] = [];
  for (const f of labelFields) {
    const v = record[f];
    if (v != null && v !== "") parts.push(String(v));
    if (parts.length >= 2) break;
  }
  return parts.join(" / ") || "—";
}

// ── Option type ───────────────────────────────────────────────────────────────
interface Option {
  id: string;
  label: string;
}

// Module-level cache to avoid redundant API calls across multiple instances
const optionsCache = new Map<string, Option[]>();

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  fieldName: string;       // e.g. "galvano_system_id"
  value: string | null;
  onChange: (newId: string | null) => void;
  label?: string;
  disabled?: boolean;
  size?: "small" | "medium";
  /** When true, show only the UUID in the dropdown (no label text) */
  idOnly?: boolean;
}

export default function IdSelectField({
  fieldName, value, onChange, label, disabled, size = "small", idOnly = false,
}: Props) {
  const cfg = FK_CONFIG[fieldName];
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    // Return cached result immediately
    if (optionsCache.has(fieldName)) {
      setOptions(optionsCache.get(fieldName)!);
      return;
    }
    setLoading(true);
    api.get<unknown[]>(cfg.apiPath)
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : (res.data as { value?: unknown[] }).value ?? [];
        const opts = (items as Record<string, unknown>[]).map((r) => ({
          id: r[cfg.pkField] as string,
          label: buildLabel(r, cfg.labelFields),
        }));
        optionsCache.set(fieldName, opts);
        setOptions(opts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fieldName]);

  if (!cfg) {
    // Fallback: plain text field for unknown FK fields
    return (
      <TextField
        fullWidth size={size} label={label ?? fieldName}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        inputProps={{ style: { fontFamily: "monospace", fontSize: 12 } }}
        disabled={disabled}
      />
    );
  }

  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <Autocomplete
      fullWidth
      size={size}
      disabled={disabled}
      loading={loading}
      options={options}
      value={selected}
      getOptionLabel={(o) => idOnly ? o.id : `${o.id.slice(0, 8)}…  ${o.label}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, newVal) => onChange(newVal?.id ?? null)}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label ?? fieldName}
          placeholder="Select or leave blank"
        />
      )}
      noOptionsText="No options"
      clearOnEscape
      slotProps={{ popper: { disablePortal: true } }}
    />
  );
}
