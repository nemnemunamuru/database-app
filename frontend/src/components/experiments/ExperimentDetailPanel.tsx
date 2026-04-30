import { Fragment, useState } from "react";
import {
  Box, Chip, Divider, IconButton, Paper, Tooltip, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type { ExperimentDetail } from "../../api/experiments";
import type { Candidate } from "../masters/EntityCrud";

// ── Tree types ────────────────────────────────────────────────────────────────
export type TItem = { label: React.ReactNode; value?: React.ReactNode; children?: TItem[] };

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

export function filterTree(items: TItem[], hideEmpty: boolean): TItem[] {
  if (!hideEmpty) return items;
  return items.flatMap(item => {
    if (item.children) {
      const filtered = filterTree(item.children, hideEmpty);
      if (filtered.length === 0) return [];
      return [{ ...item, children: filtered }];
    }
    const isEmpty =
      item.value === "—" ||
      item.value == null ||
      item.value === "" ||
      item.value === "null" ||
      item.value === "undefined";
    return isEmpty ? [] : [item];
  });
}

export function TreeBlock({ items, depth = 0, hideEmpty, candidatesMap = {} }: {
  items: TItem[]; depth?: number; hideEmpty?: boolean; candidatesMap?: Record<string, Candidate[]>;
}) {
  const visible = filterTree(items, !!hideEmpty);
  return (
    <>
      {visible.map((item, i) => {
        const isLast   = i === visible.length - 1;
        const hasKids  = !!item.children?.length;
        const isHeader = hasKids && item.value === undefined;

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
                <Box component="span" sx={{ color: "text.disabled", fontSize: 11, mr: 0.3, flexShrink: 0, fontFamily: "monospace", lineHeight: "20px" }}>
                  {isLast ? "└ " : "├ "}
                </Box>
              )}
              <Box sx={{
                fontSize: 11,
                fontWeight: isHeader ? 700 : 400,
                color: isHeader ? "primary.main" : "text.secondary",
                mr: 0.5, flexShrink: 0,
                minWidth: isHeader ? undefined : 175,
                display: "flex", alignItems: "center",
              }}>
                {labelDisplay}
              </Box>
              {item.value !== undefined && (
                <Box sx={{ fontSize: 11, color: "text.primary", wordBreak: "break-all", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                  {displayValue}
                </Box>
              )}
            </Box>
            {hasKids && <TreeBlock items={item.children!} depth={depth + 1} hideEmpty={hideEmpty} candidatesMap={candidatesMap} />}
          </Fragment>
        );
      })}
    </>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
export function DetailPanel({
  detail, onEdit, onClose, candidatesMap,
}: {
  detail: ExperimentDetail;
  onEdit: () => void;
  onClose: () => void;
  candidatesMap: Record<string, Candidate[]>;
}) {
  const [hideEmpty, setHideEmpty] = useState(false);

  const f = (v: unknown, unit = "") => v != null ? `${v}${unit}` : null;
  const gs  = detail.galvano_system;
  const wc  = detail.welding_condition;
  const em  = detail.experiment_material;
  const sc  = detail.shielding_condition;
  const res = detail.result;
  const obs = detail.observation;
  const fil = detail.file;

  const sections: TItem[] = [
    {
      label: "PROJECT",
      children: [
        { label: "project_id",   value: f(detail.project_id) },
        { label: "project_name", value: f(detail.project_name) },
      ],
    },
    {
      label: "GALVANO_SYSTEM",
      children: gs ? [
        { label: "galvano_type",     value: f(gs.galvano_type) },
        { label: "serial_number",    value: f(gs.serial_number) },
        { label: "main_diameter_um", value: f(gs.main_diameter_um, " µm") },
        { label: "sub_diameter_um",  value: f(gs.sub_diameter_um, " µm") },
        { label: "oct_diameter_um",  value: f(gs.oct_diameter_um, " µm") },
        { label: "remarks",          value: f(gs.remarks) },
        ...(gs.ftheta ? [{ label: "FTHETA", children: [
          { label: "manufacturer",    value: f(gs.ftheta.manufacturer) },
          { label: "model_name",      value: f(gs.ftheta.model_name) },
          { label: "ftheta_focal_mm", value: f(gs.ftheta.ftheta_focal_mm, " mm") },
        ]}] : []),
        ...(gs.optics ?? []).map((oe: any) => ({ label: "OPTICS", children: [
          { label: "optics_role",         value: f(oe.optics_role) },
          { label: "manufacturer",        value: f(oe.manufacturer) },
          { label: "collimator_focal_mm", value: f(oe.collimator_focal_mm, " mm") },
          { label: "serial_number",       value: f(oe.serial_number) },
          ...(oe.doe ? [{ label: "DOE", children: [
            { label: "manufacturer",  value: f(oe.doe.manufacturer) },
            { label: "model_name",    value: f(oe.doe.model_name) },
            { label: "serial_number", value: f(oe.doe.serial_number) },
            { label: "profile_shape", value: f(oe.doe.profile_shape) },
            { label: "remarks",       value: f(oe.doe.remarks) },
          ]}] : []),
          ...(oe.laser_device ? [{ label: "LASER_DEVICE", children: [
            { label: "manufacturer",   value: f(oe.laser_device.manufacturer) },
            { label: "model_name",     value: f(oe.laser_device.model_name) },
            { label: "serial_number",  value: f(oe.laser_device.serial_number) },
            { label: "beam_structure", value: f(oe.laser_device.beam_structure) },
            { label: "remarks",        value: f(oe.laser_device.remarks) },
            ...(oe.laser_device.laser_beams ?? []).map((lb: any) => ({
              label: f(lb.beam_type) ?? "—",
              children: [
                { label: "wavelength_nm",          value: f(lb.wavelength_nm, " nm") },
                { label: "numerical_aperture",     value: f(lb.numerical_aperture) },
                { label: "core_diameter_um",       value: f(lb.core_diameter_um, " µm") },
                { label: "ring_inner_diameter_um", value: f(lb.ring_inner_diameter_um, " µm") },
                { label: "ring_outer_diameter_um", value: f(lb.ring_outer_diameter_um, " µm") },
              ],
            })),
          ]}] : []),
        ]})),
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "WELDING_CONDITION",
      children: wc ? [
        { label: "main_power_w",         value: f(wc.main_power_w, " W") },
        { label: "sub_power_w",          value: f(wc.sub_power_w, " W") },
        { label: "welding_speed_mm_s",   value: f(wc.welding_speed_mm_s, " mm/s") },
        { label: "main_focus_offset_mm", value: f(wc.main_focus_offset_mm, " mm") },
        { label: "sub_focus_offset_mm",  value: f(wc.sub_focus_offset_mm, " mm") },
        { label: "remarks",              value: f(wc.remarks) },
        ...(wc.trajectory_set ? [{ label: "TRAJECTORY_SET", children: [
          { label: "trajectory_csv_path", value: f(wc.trajectory_set.trajectory_csv_path) },
          { label: "remarks",             value: f(wc.trajectory_set.remarks) },
          ...(wc.trajectory_set.main_trajectory ? [{ label: "MAIN_TRAJECTORY", children: [
            { label: "main_trajectory_type", value: f(wc.trajectory_set.main_trajectory.main_trajectory_type) },
            { label: "remarks",              value: f(wc.trajectory_set.main_trajectory.remarks) },
            ...(wc.trajectory_set.main_trajectory.line_parameter ? [{ label: "LINE_PARAMETER", children: [
              { label: "length_mm", value: f(wc.trajectory_set.main_trajectory.line_parameter.length_mm, " mm") },
              { label: "remarks",   value: f(wc.trajectory_set.main_trajectory.line_parameter.remarks) },
            ]}] : []),
          ]}] : []),
          ...(wc.trajectory_set.sub_trajectory ? [{ label: "SUB_TRAJECTORY", children: [
            { label: "sub_trajectory_type", value: f(wc.trajectory_set.sub_trajectory.sub_trajectory_type) },
            { label: "remarks",             value: f(wc.trajectory_set.sub_trajectory.remarks) },
            ...(wc.trajectory_set.sub_trajectory.wobbling_parameter ? [{ label: "WOBBLING_PARAMETER", children: [
              { label: "wobble_radius_mm",      value: f(wc.trajectory_set.sub_trajectory.wobbling_parameter.wobble_radius_mm, " mm") },
              { label: "wobble_frequency_hz",   value: f(wc.trajectory_set.sub_trajectory.wobbling_parameter.wobble_frequency_hz, " Hz") },
              { label: "circumferential_speed", value: f(wc.trajectory_set.sub_trajectory.wobbling_parameter.circumferential_speed) },
              { label: "remarks",               value: f(wc.trajectory_set.sub_trajectory.wobbling_parameter.remarks) },
            ]}] : []),
          ]}] : []),
        ]}] : []),
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "EXPERIMENT_MATERIAL",
      children: em ? [
        { label: "material_role", value: f(em.material_role) },
        { label: "remarks",       value: f(em.remarks) },
        ...(em.material_state ? [{ label: "MATERIAL_STATE", children: [
          { label: "thickness_mm",      value: f(em.material_state.thickness_mm, " mm") },
          { label: "width_mm",          value: f(em.material_state.width_mm, " mm") },
          { label: "length_mm",         value: f(em.material_state.length_mm, " mm") },
          { label: "surface_condition", value: f(em.material_state.surface_condition) },
          { label: "remarks",           value: f(em.material_state.remarks) },
          ...(em.material_state.material ? [{ label: "MATERIAL", children: [
            { label: "material_name",             value: f(em.material_state.material.material_name) },
            { label: "material_class",            value: f(em.material_state.material.material_class) },
            { label: "density_kg_m3",             value: f(em.material_state.material.density_kg_m3, " kg/m³") },
            { label: "thermal_conductivity_w_mk", value: f(em.material_state.material.thermal_conductivity_w_mk, " W/mK") },
            { label: "reflectivity_1070nm",       value: f(em.material_state.material.reflectivity_1070nm) },
            { label: "remarks",                   value: f(em.material_state.material.remarks) },
          ]}] : []),
        ]}] : []),
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "SHIELDING_CONDITION",
      children: sc ? [
        { label: "gas_type",            value: f(sc.gas_type) },
        { label: "gas_purity_percent",  value: f(sc.gas_purity_percent, " %") },
        { label: "gas_flow_l_min",      value: f(sc.gas_flow_l_min, " L/min") },
        { label: "gas_pressure_kpa",    value: f(sc.gas_pressure_kpa, " kPa") },
        { label: "nozzle_type",         value: f(sc.nozzle_type) },
        { label: "nozzle_diameter_mm",  value: f(sc.nozzle_diameter_mm, " mm") },
        { label: "nozzle_distance_mm",  value: f(sc.nozzle_distance_mm, " mm") },
        { label: "nozzle_angle_deg",    value: f(sc.nozzle_angle_deg, "°") },
        { label: "remarks",             value: f(sc.remarks) },
      ] : [{ label: "(not set)", value: "" }],
    },
    {
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
    },
    {
      label: "OBSERVATION",
      children: obs ? [
        { label: "observer_name",        value: f(obs.observer_name) },
        { label: "observation_datetime", value: f(obs.observation_datetime) },
        { label: "comment",              value: f(obs.comment) },
        { label: "remarks",              value: f(obs.remarks) },
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "FILE",
      children: fil ? [
        { label: "remarks", value: f(fil.remarks) },
      ] : [{ label: "(not set)", value: "" }],
    },
  ];

  return (
    <Paper elevation={3} sx={{ position: "sticky", top: 8, maxHeight: "calc(100vh - 180px)", overflow: "auto", p: 1.5, minWidth: 300 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" fontFamily="monospace" fontSize={10} color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
          {detail.experiment_id}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.3, alignItems: "center" }}>
          <Tooltip title={hideEmpty ? "Show empty values" : "Hide empty values"}>
            <IconButton size="small" onClick={() => setHideEmpty(h => !h)} color={hideEmpty ? "primary" : "default"}>
              {hideEmpty ? <VisibilityOffIcon sx={{ fontSize: 14 }} /> : <VisibilityIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in Edit tab">
            <IconButton size="small" onClick={onEdit}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
        </Box>
      </Box>
      <Divider sx={{ mb: 1 }} />
      {sections.map((sec, i) => (
        <Fragment key={i}>
          {i > 0 && <Divider sx={{ my: 0.8 }} />}
          <TreeBlock items={[sec]} depth={0} hideEmpty={hideEmpty} candidatesMap={candidatesMap} />
        </Fragment>
      ))}
    </Paper>
  );
}
