/**
 * Shared tree-building helpers for experiment detail panels.
 * Used by ExperimentDetailPanel, MasterPage, and NewProjectPage to guarantee
 * identical structure and coloring across all three views.
 */
import { Chip } from "@mui/material";
import type { TItem } from "../masters/EntityCrud";

// ── Shared value helpers ──────────────────────────────────────────────────────
export const f = (v: unknown, unit = ""): string | null =>
  v != null ? `${v}${unit}` : null;

export const fDate = (v: unknown): string | null =>
  v != null ? String(v).replace(/[T ]00:00:00$/, "") : null;

// ── BoolChip (boolean value display) ─────────────────────────────────────────
export const BoolChip = ({ v }: { v: boolean | null | undefined }) =>
  v == null ? <>—</> : (
    <Chip
      label={v ? "Yes" : "No"}
      size="small"
      color={v ? "error" : "success"}
      variant="outlined"
      sx={{ height: 16, fontSize: 10, "& .MuiChip-label": { px: 0.5 } }}
    />
  );

// ── Atomic sub-entity builders ────────────────────────────────────────────────

/** Single laser beam entry. Used inside LASER_DEVICE sections. */
export function buildLaserBeamItem(lb: any): TItem {
  return {
    label: lb.beam_type ?? "—",
    children: [
      { label: "wavelength_nm",          value: f(lb.wavelength_nm, " nm") },
      { label: "numerical_aperture",     value: f(lb.numerical_aperture) },
      { label: "core_diameter_um",       value: f(lb.core_diameter_um, " µm") },
      { label: "ring_inner_diameter_um", value: f(lb.ring_inner_diameter_um, " µm") },
      { label: "ring_outer_diameter_um", value: f(lb.ring_outer_diameter_um, " µm") },
    ],
  };
}

/** LASER_DEVICE section (with nested laser_beams). */
export function buildLaserDeviceItem(ld: any): TItem {
  const kids: TItem[] = [
    { label: "manufacturer",   value: f(ld.manufacturer) },
    { label: "model_name",     value: f(ld.model_name) },
    { label: "serial_number",  value: f(ld.serial_number) },
    { label: "beam_structure", value: f(ld.beam_structure) },
    { label: "remarks",        value: f(ld.remarks) },
    ...(ld.laser_beams ?? []).map(buildLaserBeamItem),
  ];
  return { label: "LASER_DEVICE", children: kids };
}

/** DOE section. */
export function buildDoeItem(doe: any): TItem {
  return {
    label: "DOE",
    children: [
      { label: "manufacturer",  value: f(doe.manufacturer) },
      { label: "model_name",    value: f(doe.model_name) },
      { label: "serial_number", value: f(doe.serial_number) },
      { label: "profile_shape", value: f(doe.profile_shape) },
      { label: "remarks",       value: f(doe.remarks) },
    ],
  };
}

/** FTHETA section. */
export function buildFthetaItem(ftheta: any): TItem {
  return {
    label: "FTHETA",
    children: [
      { label: "manufacturer",    value: f(ftheta.manufacturer) },
      { label: "model_name",      value: f(ftheta.model_name) },
      { label: "serial_number",   value: f(ftheta.serial_number) },
      { label: "ftheta_focal_mm", value: f(ftheta.ftheta_focal_mm, " mm") },
      { label: "remarks",         value: f(ftheta.remarks) },
    ],
  };
}

/**
 * Single OPTICS entry.
 * Uses optics_role as the section header label so TreeBlock can apply
 * candidate colors (main / sub / OCT) when candidatesMap is populated.
 */
export function buildOpticsItem(oe: any): TItem {
  const kids: TItem[] = [
    { label: "manufacturer",        value: f(oe.manufacturer) },
    { label: "collimator_focal_mm", value: f(oe.collimator_focal_mm, " mm") },
    { label: "serial_number",       value: f(oe.serial_number) },
    { label: "remarks",             value: f(oe.remarks) },
  ];
  if (oe.doe)          kids.push(buildDoeItem(oe.doe));
  if (oe.laser_device) kids.push(buildLaserDeviceItem(oe.laser_device));
  // Use optics_role as the section header so TreeBlock can colorize it
  return { label: oe.optics_role ?? "OPTICS", children: kids };
}

// ── GALVANO_SYSTEM ────────────────────────────────────────────────────────────

/** Children array for a galvano_system detail object (with nested ftheta/optics). */
export function buildGalvanoSystemChildren(gs: any): TItem[] {
  const items: TItem[] = [
    { label: "galvano_type",     value: f(gs.galvano_type) },
    { label: "serial_number",    value: f(gs.serial_number) },
    { label: "main_diameter_um", value: f(gs.main_diameter_um, " µm") },
    { label: "sub_diameter_um",  value: f(gs.sub_diameter_um, " µm") },
    { label: "oct_diameter_um",  value: f(gs.oct_diameter_um, " µm") },
    { label: "remarks",          value: f(gs.remarks) },
  ];
  if (gs.ftheta) items.push(buildFthetaItem(gs.ftheta));
  // Accept both "optics" (from API/ExperimentDetail) and "optics_rows" (from deep endpoint)
  const opticsList: any[] = gs.optics ?? gs.optics_rows ?? [];
  opticsList.forEach((oe: any) => items.push(buildOpticsItem(oe)));
  return items;
}

/** Full GALVANO_SYSTEM section TItem. */
export function buildGalvanoSystemSection(gs: any | null): TItem {
  return {
    label: "GALVANO_SYSTEM",
    children: gs ? buildGalvanoSystemChildren(gs) : [{ label: "(not set)", value: "" }],
  };
}

// ── WELDING_CONDITION ─────────────────────────────────────────────────────────

function buildTrajectorySetChildren(ts: any): TItem[] {
  const kids: TItem[] = [
    { label: "trajectory_csv_path", value: f(ts.trajectory_csv_path) },
    { label: "remarks",             value: f(ts.remarks) },
  ];
  if (ts.main_trajectory) {
    const mt = ts.main_trajectory;
    const mtKids: TItem[] = [
      { label: "main_trajectory_type", value: f(mt.main_trajectory_type) },
      { label: "remarks",              value: f(mt.remarks) },
    ];
    if (mt.line_parameter) {
      mtKids.push({ label: "LINE_PARAMETER", children: [
        { label: "length_mm", value: f(mt.line_parameter.length_mm, " mm") },
        { label: "remarks",   value: f(mt.line_parameter.remarks) },
      ]});
    }
    kids.push({ label: "MAIN_TRAJECTORY", children: mtKids });
  }
  if (ts.sub_trajectory) {
    const st = ts.sub_trajectory;
    const stKids: TItem[] = [
      { label: "sub_trajectory_type", value: f(st.sub_trajectory_type) },
      { label: "remarks",             value: f(st.remarks) },
    ];
    if (st.wobbling_parameter) {
      stKids.push({ label: "WOBBLING_PARAMETER", children: [
        { label: "wobble_radius_mm",      value: f(st.wobbling_parameter.wobble_radius_mm, " mm") },
        { label: "wobble_frequency_hz",   value: f(st.wobbling_parameter.wobble_frequency_hz, " Hz") },
        { label: "circumferential_speed", value: f(st.wobbling_parameter.circumferential_speed) },
        { label: "remarks",               value: f(st.wobbling_parameter.remarks) },
      ]});
    }
    kids.push({ label: "SUB_TRAJECTORY", children: stKids });
  }
  return kids;
}

/** Children array for a welding_condition detail object. */
export function buildWeldingConditionChildren(wc: any): TItem[] {
  const items: TItem[] = [
    { label: "main_power_w",         value: f(wc.main_power_w, " W") },
    { label: "sub_power_w",          value: f(wc.sub_power_w, " W") },
    { label: "welding_speed_mm_s",   value: f(wc.welding_speed_mm_s, " mm/s") },
    { label: "main_focus_offset_mm", value: f(wc.main_focus_offset_mm, " mm") },
    { label: "sub_focus_offset_mm",  value: f(wc.sub_focus_offset_mm, " mm") },
    { label: "remarks",              value: f(wc.remarks) },
  ];
  if (wc.trajectory_set) {
    items.push({ label: "TRAJECTORY_SET", children: buildTrajectorySetChildren(wc.trajectory_set) });
  }
  return items;
}

/** Full WELDING_CONDITION section TItem. */
export function buildWeldingConditionSection(wc: any | null): TItem {
  return {
    label: "WELDING_CONDITION",
    children: wc ? buildWeldingConditionChildren(wc) : [{ label: "(not set)", value: "" }],
  };
}

// ── EXPERIMENT_MATERIAL ───────────────────────────────────────────────────────

/** MATERIAL section. */
export function buildMaterialItem(mat: any): TItem {
  return {
    label: "MATERIAL",
    children: [
      { label: "material_name",             value: f(mat.material_name) },
      { label: "material_class",            value: f(mat.material_class) },
      { label: "density_kg_m3",             value: f(mat.density_kg_m3, " kg/m³") },
      { label: "thermal_conductivity_w_mk", value: f(mat.thermal_conductivity_w_mk, " W/mK") },
      { label: "reflectivity_1070nm",       value: f(mat.reflectivity_1070nm) },
      { label: "remarks",                   value: f(mat.remarks) },
    ],
  };
}

/** MATERIAL_STATE section (with optional nested MATERIAL). */
export function buildMaterialStateItem(ms: any): TItem {
  const kids: TItem[] = [
    { label: "thickness_mm",      value: f(ms.thickness_mm, " mm") },
    { label: "width_mm",          value: f(ms.width_mm, " mm") },
    { label: "length_mm",         value: f(ms.length_mm, " mm") },
    { label: "surface_condition", value: f(ms.surface_condition) },
    { label: "remarks",           value: f(ms.remarks) },
  ];
  if (ms.material) kids.push(buildMaterialItem(ms.material));
  return { label: "MATERIAL_STATE", children: kids };
}

/**
 * Full EXPERIMENT_MATERIAL section TItem.
 * Each role (upper/lower/base) is a sub-section whose label IS the role value
 * so TreeBlock can colorize it from candidatesMap.
 */
export function buildExperimentMaterialSection(emList: any[]): TItem {
  return {
    label: "EXPERIMENT_MATERIAL",
    children: emList.length > 0
      ? emList.map((em: any) => ({
          label: em.material_role ?? "—",
          children: [
            { label: "remarks", value: f(em.remarks) },
            ...(em.material_state ? [buildMaterialStateItem(em.material_state)] : []),
          ],
        }))
      : [{ label: "(not set)", value: "" }],
  };
}

// ── SHIELDING_CONDITION ───────────────────────────────────────────────────────

/** Full SHIELDING_CONDITION section TItem. */
export function buildShieldingConditionSection(sc: any | null): TItem {
  return {
    label: "SHIELDING_CONDITION",
    children: sc ? [
      { label: "gas_type",           value: f(sc.gas_type) },
      { label: "gas_purity_percent", value: f(sc.gas_purity_percent, " %") },
      { label: "gas_flow_l_min",     value: f(sc.gas_flow_l_min, " L/min") },
      { label: "gas_pressure_kpa",   value: f(sc.gas_pressure_kpa, " kPa") },
      { label: "nozzle_type",        value: f(sc.nozzle_type) },
      { label: "nozzle_diameter_mm", value: f(sc.nozzle_diameter_mm, " mm") },
      { label: "nozzle_distance_mm", value: f(sc.nozzle_distance_mm, " mm") },
      { label: "nozzle_angle_deg",   value: f(sc.nozzle_angle_deg, "°") },
      { label: "remarks",            value: f(sc.remarks) },
    ] : [{ label: "(not set)", value: "" }],
  };
}

// ── RESULT ────────────────────────────────────────────────────────────────────

/** Full RESULT section TItem. */
export function buildResultSection(res: any | null): TItem {
  return {
    label: "RESULT",
    children: res ? [
      { label: "oct_depth_mm",           value: f(res.oct_depth_mm, " mm") },
      { label: "oct_surface_csv_path",   value: f(res.oct_surface_csv_path) },
      { label: "oct_depth_csv_path",     value: f(res.oct_depth_csv_path) },
      { label: "oct_result_csv_path",    value: f(res.oct_result_csv_path) },
      { label: "cross_section_depth_mm", value: f(res.cross_section_depth_mm, " mm") },
      { label: "spatter_flag",           value: <BoolChip v={res.spatter_flag} /> },
      { label: "spatter_severity",       value: f(res.spatter_severity) },
      { label: "gap_opening_flag",       value: <BoolChip v={res.gap_opening_flag} /> },
      { label: "crack_flag",             value: <BoolChip v={res.crack_flag} /> },
      { label: "crack_severity",         value: f(res.crack_severity) },
      { label: "glass_contamination",    value: <BoolChip v={res.glass_contamination} /> },
      { label: "surface_contamination",  value: <BoolChip v={res.surface_contamination} /> },
      { label: "penetration_flag",       value: <BoolChip v={res.penetration_flag} /> },
      { label: "remarks",                value: f(res.remarks) },
    ] : [{ label: "(not set)", value: "" }],
  };
}

// ── OBSERVATION ───────────────────────────────────────────────────────────────

/** Full OBSERVATION section TItem. */
export function buildObservationSection(obs: any | null): TItem {
  return {
    label: "OBSERVATION",
    children: obs ? [
      { label: "observer_name",        value: f(obs.observer_name) },
      { label: "observation_datetime", value: fDate(obs.observation_datetime) },
      { label: "comment",              value: f(obs.comment) },
      { label: "remarks",              value: f(obs.remarks) },
    ] : [{ label: "(not set)", value: "" }],
  };
}

// ── FILE ──────────────────────────────────────────────────────────────────────

/** Full FILE section TItem. */
export function buildFileSection(fil: any | null): TItem {
  return {
    label: "FILE",
    children: fil ? [
      { label: "remarks", value: f(fil.remarks) },
    ] : [{ label: "(not set)", value: "" }],
  };
}
