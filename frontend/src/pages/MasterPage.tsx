import { useState } from "react";
import { Box, Chip, Divider, Tab, Tabs, Typography } from "@mui/material";
import { EntityCrud } from "../components/masters/EntityCrud";
import type { FieldDef, TItem } from "../components/masters/EntityCrud";
import {
  galvanoSystemsApi, laserDevicesApi, laserBeamsApi, laserBeamsCombinedApi,
  fthetaApi, opticsApi, opticsCombinedApi, doeApi,
  weldingConditionsApi, trajectorySetsApi,
  mainTrajectoriesApi, subTrajectoriesApi,
  lineParametersApi, wobblingParametersApi,
  materialsApi, materialStatesApi,
  shieldingConditionsApi,
  resultsApi, observationsApi, filesApi,
  experimentMaterialsApi,
  galvanoSystemDetail, laserDeviceDetail, opticsDetail, laserBeamDetail,
  trajectorySetDetail,
} from "../api/masters";

// ── Color maps ────────────────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  main:      "#ef5350",
  OCT:       "#66bb6a",
  sub:       "#42a5f5",
  single:    "#7e57c2",
  ring:      "#ff7043",
  core_ring: "#8d6e63",
};

// Trajectory type color palette
const TRAJ_MAIN_COLOR = "#1565c0";  // blue  – main trajectory / line
const TRAJ_SUB_COLOR  = "#e65100";  // orange – sub trajectory / wobbling
const TRAJ_SET_COLOR  = "#6a1b9a";  // purple – trajectory set (links both)

/** sx helper: color-coded sub-tab with top border indicator */
const ctab = (color: string) => ({
  fontWeight: 600,
  borderTop: `3px solid ${color}`,
  borderRadius: "4px 4px 0 0",
  mt: "2px",
  "&.Mui-selected": { color, bgcolor: `${color}14` },
  "&:not(.Mui-selected)": { color: `${color}99` },
});

const RoleChip = ({ role }: { role?: string | null }) => {
  if (!role) return <span>—</span>;
  const bg = ROLE_COLOR[role] ?? "#757575";
  return (
    <Chip
      label={role}
      size="small"
      sx={{ bgcolor: bg, color: "white", fontWeight: "bold", height: 18, fontSize: 10 }}
    />
  );
};

// ── Tree builder helpers ──────────────────────────────────────────────────────
const f = (v: any, unit = "") => (v != null ? `${v}${unit}` : "—");

async function buildGalvanoTree(item: any): Promise<TItem[]> {
  const { data: d } = await galvanoSystemDetail(item.galvano_system_id);
  const nodes: TItem[] = [
    { label: "galvano_type",     value: <RoleChip role={d.galvano_type} /> },
    { label: "serial_number",    value: f(d.serial_number) },
    { label: "main_diameter_um", value: f(d.main_diameter_um, " µm") },
    { label: "sub_diameter_um",  value: f(d.sub_diameter_um, " µm") },
    { label: "oct_diameter_um",  value: f(d.oct_diameter_um, " µm") },
    { label: "remarks",          value: f(d.remarks) },
  ];
  if (d.ftheta) {
    nodes.push({ label: "FTHETA", children: [
      { label: "manufacturer",    value: f(d.ftheta.manufacturer) },
      { label: "model_name",      value: f(d.ftheta.model_name) },
      { label: "ftheta_focal_mm", value: f(d.ftheta.ftheta_focal_mm, " mm") },
    ]});
  }
  if (d.optics) {
    const entryNodes: TItem[] = (d.optics.entries ?? []).map((oe: any) => {
      const kids: TItem[] = [
        { label: "collimator_focal_mm", value: f(oe.collimator_focal_mm, " mm") },
        { label: "serial_number",       value: f(oe.serial_number) },
      ];
      if (oe.doe) {
        kids.push({ label: "DOE", children: [
          { label: "manufacturer",  value: f(oe.doe.manufacturer) },
          { label: "model_name",    value: f(oe.doe.model_name) },
          { label: "profile_shape", value: f(oe.doe.profile_shape) },
        ]});
      }
      if (oe.laser_device) {
        const ld = oe.laser_device;
        const ldKids: TItem[] = [
          { label: "manufacturer",   value: f(ld.manufacturer) },
          { label: "model_name",     value: f(ld.model_name) },
          { label: "beam_structure", value: f(ld.beam_structure) },
        ];
        if (ld.laser_beam) {
          const lb = ld.laser_beam;
          const lbKids: TItem[] = [
            { label: "wavelength_nm",      value: f(lb.wavelength_nm, " nm") },
            { label: "numerical_aperture", value: f(lb.numerical_aperture) },
            { label: "m2_value",           value: f(lb.m2_value) },
            { label: "bpp_mm_mrad",        value: f(lb.bpp_mm_mrad) },
            ...(lb.entries ?? []).map((be: any): TItem => ({
              label: <RoleChip role={be.beam_type} />,
              children: [
                { label: "core_diameter_um",       value: f(be.core_diameter_um, " µm") },
                { label: "ring_inner_diameter_um", value: f(be.ring_inner_diameter_um, " µm") },
                { label: "ring_outer_diameter_um", value: f(be.ring_outer_diameter_um, " µm") },
              ],
            })),
          ];
          ldKids.push({ label: "LASER_BEAM", children: lbKids });
        }
        kids.push({ label: "LASER_DEVICE", children: ldKids });
      }
      return { label: <RoleChip role={oe.optics_role} />, children: kids };
    });
    nodes.push({ label: "OPTICS", children: [
      { label: "manufacturer", value: f(d.optics.manufacturer) },
      ...entryNodes,
    ]});
  }
  return nodes;
}

async function buildLaserDeviceTree(item: any): Promise<TItem[]> {
  const { data: d } = await laserDeviceDetail(item.laser_device_id);
  const nodes: TItem[] = [
    { label: "manufacturer",   value: f(d.manufacturer) },
    { label: "model_name",     value: f(d.model_name) },
    { label: "serial_number",  value: f(d.serial_number) },
    { label: "beam_structure", value: f(d.beam_structure) },
    { label: "remarks",        value: f(d.remarks) },
  ];
  if (d.laser_beam) {
    const lb = d.laser_beam;
    const lbKids: TItem[] = [
      { label: "wavelength_nm",      value: f(lb.wavelength_nm, " nm") },
      { label: "numerical_aperture", value: f(lb.numerical_aperture) },
      { label: "m2_value",           value: f(lb.m2_value) },
      { label: "bpp_mm_mrad",        value: f(lb.bpp_mm_mrad) },
      ...(lb.entries ?? []).map((be: any): TItem => ({
        label: <RoleChip role={be.beam_type} />,
        children: [
          { label: "core_diameter_um",       value: f(be.core_diameter_um, " µm") },
          { label: "ring_inner_diameter_um", value: f(be.ring_inner_diameter_um, " µm") },
          { label: "ring_outer_diameter_um", value: f(be.ring_outer_diameter_um, " µm") },
        ],
      })),
    ];
    nodes.push({ label: "LASER_BEAM", children: lbKids });
  }
  return nodes;
}

async function buildOpticsTree(item: any): Promise<TItem[]> {
  const { data: d } = await opticsDetail(item.optics_id);
  const nodes: TItem[] = [
    { label: "manufacturer", value: f(d.manufacturer) },
    { label: "remarks",      value: f(d.remarks) },
  ];
  (d.entries ?? []).forEach((oe: any) => {
    const kids: TItem[] = [
      { label: "collimator_focal_mm", value: f(oe.collimator_focal_mm, " mm") },
      { label: "serial_number",       value: f(oe.serial_number) },
    ];
    if (oe.doe) {
      kids.push({ label: "DOE", children: [
        { label: "manufacturer",  value: f(oe.doe.manufacturer) },
        { label: "model_name",    value: f(oe.doe.model_name) },
      ]});
    }
    if (oe.laser_device) {
      const ld = oe.laser_device;
      const ldKids: TItem[] = [
        { label: "manufacturer",   value: f(ld.manufacturer) },
        { label: "model_name",     value: f(ld.model_name) },
        { label: "beam_structure", value: f(ld.beam_structure) },
      ];
      if (ld.laser_beam) {
        const lb = ld.laser_beam;
        const lbKids: TItem[] = [
          { label: "wavelength_nm",      value: f(lb.wavelength_nm, " nm") },
          { label: "numerical_aperture", value: f(lb.numerical_aperture) },
          { label: "m2_value",           value: f(lb.m2_value) },
          { label: "bpp_mm_mrad",        value: f(lb.bpp_mm_mrad) },
          ...(lb.entries ?? []).map((be: any): TItem => ({
            label: <RoleChip role={be.beam_type} />,
            children: [
              { label: "core_diameter_um",       value: f(be.core_diameter_um, " µm") },
              { label: "ring_inner_diameter_um", value: f(be.ring_inner_diameter_um, " µm") },
              { label: "ring_outer_diameter_um", value: f(be.ring_outer_diameter_um, " µm") },
            ],
          })),
        ];
        ldKids.push({ label: "LASER_BEAM", children: lbKids });
      }
      kids.push({ label: "LASER_DEVICE", children: ldKids });
    }
    nodes.push({ label: <RoleChip role={oe.optics_role} />, children: kids });
  });
  return nodes;
}

async function buildLaserBeamTree(item: any): Promise<TItem[]> {
  const { data: d } = await laserBeamDetail(item.laser_beam_id);
  const nodes: TItem[] = [
    { label: "wavelength_nm",      value: f(d.wavelength_nm, " nm") },
    { label: "numerical_aperture", value: f(d.numerical_aperture) },
    { label: "m2_value",           value: f(d.m2_value) },
    { label: "bpp_mm_mrad",        value: f(d.bpp_mm_mrad) },
    { label: "remarks",            value: f(d.remarks) },
  ];
  (d.entries ?? []).forEach((be: any) => {
    nodes.push({
      label: <RoleChip role={be.beam_type} />,
      children: [
        { label: "core_diameter_um",       value: f(be.core_diameter_um, " µm") },
        { label: "ring_inner_diameter_um", value: f(be.ring_inner_diameter_um, " µm") },
        { label: "ring_outer_diameter_um", value: f(be.ring_outer_diameter_um, " µm") },
      ],
    });
  });
  return nodes;
}

// ── Additional tree builders ──────────────────────────────────────────────────

async function buildFthetaTree(item: any): Promise<TItem[]> {
  return [
    { label: "manufacturer",    value: f(item.manufacturer) },
    { label: "model_name",      value: f(item.model_name) },
    { label: "serial_number",   value: f(item.serial_number) },
    { label: "ftheta_focal_mm", value: f(item.ftheta_focal_mm, " mm") },
    { label: "remarks",         value: f(item.remarks) },
  ];
}

async function buildOpticsCombinedTree(item: any): Promise<TItem[]> {
  const nodes: TItem[] = [
    { label: "manufacturer",        value: f(item.manufacturer) },
    { label: "optics_role",         value: <RoleChip role={item.optics_role} /> },
    { label: "collimator_focal_mm", value: f(item.collimator_focal_mm, " mm") },
    { label: "serial_number",       value: f(item.serial_number) },
    { label: "remarks",             value: f(item.remarks) },
  ];
  if (item.laser_device_id) {
    try {
      const { data: ld } = await laserDevicesApi.get(item.laser_device_id);
      const ldKids: TItem[] = [
        { label: "manufacturer",   value: f(ld.manufacturer) },
        { label: "model_name",     value: f(ld.model_name) },
        { label: "beam_structure", value: f(ld.beam_structure) },
      ];
      if (ld.laser_beam_id) {
        try {
          const { data: lb } = await laserBeamsApi.get(ld.laser_beam_id);
          const lbKids: TItem[] = [
            { label: "wavelength_nm",      value: f(lb.wavelength_nm, " nm") },
            { label: "numerical_aperture", value: f(lb.numerical_aperture) },
            { label: "m2_value",           value: f(lb.m2_value) },
            { label: "bpp_mm_mrad",        value: f(lb.bpp_mm_mrad) },
          ];
          ldKids.push({ label: "LASER_BEAM", children: lbKids });
        } catch { /* not found */ }
      }
      nodes.push({ label: "LASER_DEVICE", children: ldKids });
    } catch { /* not found */ }
  }
  if (item.doe_id) {
    try {
      const { data: doe } = await doeApi.get(item.doe_id);
      nodes.push({ label: "DOE", children: [
        { label: "manufacturer",  value: f(doe.manufacturer) },
        { label: "model_name",    value: f(doe.model_name) },
        { label: "profile_shape", value: f(doe.profile_shape) },
      ]});
    } catch { /* not found */ }
  }
  return nodes;
}

async function buildLaserBeamCombinedTree(item: any): Promise<TItem[]> {
  return [
    { label: "wavelength_nm",          value: f(item.wavelength_nm, " nm") },
    { label: "numerical_aperture",     value: f(item.numerical_aperture) },
    { label: "m2_value",               value: f(item.m2_value) },
    { label: "bpp_mm_mrad",            value: f(item.bpp_mm_mrad) },
    { label: "beam_type",              value: <RoleChip role={item.beam_type} /> },
    { label: "core_diameter_um",       value: f(item.core_diameter_um, " µm") },
    { label: "ring_inner_diameter_um", value: f(item.ring_inner_diameter_um, " µm") },
    { label: "ring_outer_diameter_um", value: f(item.ring_outer_diameter_um, " µm") },
    { label: "remarks",                value: f(item.remarks) },
  ];
}

async function buildDoeTree(item: any): Promise<TItem[]> {
  return [
    { label: "manufacturer",  value: f(item.manufacturer) },
    { label: "model_name",    value: f(item.model_name) },
    { label: "serial_number", value: f(item.serial_number) },
    { label: "profile_shape", value: f(item.profile_shape) },
    { label: "remarks",       value: f(item.remarks) },
  ];
}

async function buildWeldingTree(item: any): Promise<TItem[]> {
  const nodes: TItem[] = [
    { label: "main_power_w",         value: f(item.main_power_w, " W") },
    { label: "sub_power_w",          value: f(item.sub_power_w, " W") },
    { label: "welding_speed_mm_s",   value: f(item.welding_speed_mm_s, " mm/s") },
    { label: "main_focus_offset_mm", value: f(item.main_focus_offset_mm, " mm") },
    { label: "sub_focus_offset_mm",  value: f(item.sub_focus_offset_mm, " mm") },
    { label: "remarks",              value: f(item.remarks) },
  ];
  if (item.trajectory_set_id) {
    try {
      const { data: ts } = await trajectorySetDetail(item.trajectory_set_id);
      const tsKids: TItem[] = [
        { label: "trajectory_csv_path", value: f(ts.trajectory_csv_path) },
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
        tsKids.push({ label: "MAIN_TRAJECTORY", children: mtKids });
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
          ]});
        }
        tsKids.push({ label: "SUB_TRAJECTORY", children: stKids });
      }
      nodes.push({ label: "TRAJECTORY_SET", children: tsKids });
    } catch { /* not found */ }
  }
  return nodes;
}

async function buildTrajectorySetTree(item: any): Promise<TItem[]> {
  const { data: ts } = await trajectorySetDetail(item.trajectory_set_id);
  const nodes: TItem[] = [
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
    nodes.push({ label: "MAIN_TRAJECTORY", children: mtKids });
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
      ]});
    }
    nodes.push({ label: "SUB_TRAJECTORY", children: stKids });
  }
  return nodes;
}

async function buildMainTrajectoryTree(item: any): Promise<TItem[]> {
  const nodes: TItem[] = [
    { label: "main_trajectory_type", value: f(item.main_trajectory_type) },
    { label: "remarks",              value: f(item.remarks) },
  ];
  if (item.main_trajectory_parameter_id) {
    try {
      const { data: lp } = await lineParametersApi.get(item.main_trajectory_parameter_id);
      nodes.push({ label: "LINE_PARAMETER", children: [
        { label: "length_mm", value: f(lp.length_mm, " mm") },
        { label: "remarks",   value: f(lp.remarks) },
      ]});
    } catch { /* not found */ }
  }
  return nodes;
}

async function buildLineParameterTree(item: any): Promise<TItem[]> {
  return [
    { label: "length_mm", value: f(item.length_mm, " mm") },
    { label: "remarks",   value: f(item.remarks) },
  ];
}

async function buildSubTrajectoryTree(item: any): Promise<TItem[]> {
  const nodes: TItem[] = [
    { label: "sub_trajectory_type", value: f(item.sub_trajectory_type) },
    { label: "remarks",             value: f(item.remarks) },
  ];
  if (item.sub_trajectory_parameter_id) {
    try {
      const { data: wp } = await wobblingParametersApi.get(item.sub_trajectory_parameter_id);
      nodes.push({ label: "WOBBLING_PARAMETER", children: [
        { label: "wobble_radius_mm",      value: f(wp.wobble_radius_mm, " mm") },
        { label: "wobble_frequency_hz",   value: f(wp.wobble_frequency_hz, " Hz") },
        { label: "circumferential_speed", value: f(wp.circumferential_speed) },
        { label: "remarks",              value: f(wp.remarks) },
      ]});
    } catch { /* not found */ }
  }
  return nodes;
}

async function buildWobblingParameterTree(item: any): Promise<TItem[]> {
  return [
    { label: "wobble_radius_mm",      value: f(item.wobble_radius_mm, " mm") },
    { label: "wobble_frequency_hz",   value: f(item.wobble_frequency_hz, " Hz") },
    { label: "circumferential_speed", value: f(item.circumferential_speed) },
    { label: "remarks",              value: f(item.remarks) },
  ];
}

async function buildMaterialStateTree(item: any): Promise<TItem[]> {
  const nodes: TItem[] = [
    { label: "thickness_mm",      value: f(item.thickness_mm, " mm") },
    { label: "width_mm",          value: f(item.width_mm, " mm") },
    { label: "length_mm",         value: f(item.length_mm, " mm") },
    { label: "surface_condition", value: f(item.surface_condition) },
    { label: "remarks",           value: f(item.remarks) },
  ];
  if (item.material_id) {
    try {
      const { data: mat } = await materialsApi.get(item.material_id);
      nodes.push({ label: "MATERIAL", children: [
        { label: "material_name",  value: f(mat.material_name) },
        { label: "material_class", value: f(mat.material_class) },
        { label: "density_kg_m3",  value: f(mat.density_kg_m3, " kg/m³") },
      ]});
    } catch { /* not found */ }
  }
  return nodes;
}

async function buildMaterialTree(item: any): Promise<TItem[]> {
  return [
    { label: "material_name",             value: f(item.material_name) },
    { label: "material_class",            value: f(item.material_class) },
    { label: "density_kg_m3",             value: f(item.density_kg_m3, " kg/m³") },
    { label: "thermal_conductivity_w_mk", value: f(item.thermal_conductivity_w_mk, " W/mK") },
    { label: "reflectivity_1070nm",       value: f(item.reflectivity_1070nm) },
    { label: "remarks",                   value: f(item.remarks) },
  ];
}

async function buildShieldingTree(item: any): Promise<TItem[]> {
  return [
    { label: "gas_type",           value: f(item.gas_type) },
    { label: "gas_purity_percent", value: f(item.gas_purity_percent, " %") },
    { label: "gas_flow_l_min",     value: f(item.gas_flow_l_min, " L/min") },
    { label: "gas_pressure_kpa",   value: f(item.gas_pressure_kpa, " kPa") },
    { label: "nozzle_type",        value: f(item.nozzle_type) },
    { label: "nozzle_diameter_mm", value: f(item.nozzle_diameter_mm, " mm") },
    { label: "nozzle_distance_mm", value: f(item.nozzle_distance_mm, " mm") },
    { label: "nozzle_angle_deg",   value: f(item.nozzle_angle_deg, "°") },
    { label: "remarks",            value: f(item.remarks) },
  ];
}

async function buildResultTree(item: any): Promise<TItem[]> {
  return [
    { label: "oct_depth_mm",           value: f(item.oct_depth_mm, " mm") },
    { label: "oct_surface_csv_path",   value: f(item.oct_surface_csv_path) },
    { label: "oct_depth_csv_path",     value: f(item.oct_depth_csv_path) },
    { label: "oct_result_csv_path",    value: f(item.oct_result_csv_path) },
    { label: "cross_section_depth_mm", value: f(item.cross_section_depth_mm, " mm") },
    { label: "spatter_flag",           value: f(item.spatter_flag) },
    { label: "spatter_severity",       value: f(item.spatter_severity) },
    { label: "gap_opening_flag",       value: f(item.gap_opening_flag) },
    { label: "crack_flag",             value: f(item.crack_flag) },
    { label: "crack_severity",         value: f(item.crack_severity) },
    { label: "glass_contamination",    value: f(item.glass_contamination) },
    { label: "surface_contamination",  value: f(item.surface_contamination) },
    { label: "penetration_flag",       value: f(item.penetration_flag) },
    { label: "remarks",                value: f(item.remarks) },
  ];
}

async function buildObservationTree(item: any): Promise<TItem[]> {
  return [
    { label: "observer_name",        value: f(item.observer_name) },
    { label: "observation_datetime", value: f(item.observation_datetime) },
    { label: "comment",              value: f(item.comment) },
    { label: "remarks",              value: f(item.remarks) },
  ];
}

async function buildFileTree(item: any): Promise<TItem[]> {
  return [
    { label: "remarks", value: f(item.remarks) },
  ];
}

async function buildExperimentMaterialTree(item: any): Promise<TItem[]> {
  const nodes: TItem[] = [
    { label: "material_role", value: f(item.material_role) },
    { label: "remarks",       value: f(item.remarks) },
  ];
  if (item.material_state_id) {
    try {
      const { data: ms } = await materialStatesApi.get(item.material_state_id);
      const msKids: TItem[] = [
        { label: "thickness_mm",      value: f(ms.thickness_mm, " mm") },
        { label: "width_mm",          value: f(ms.width_mm, " mm") },
        { label: "length_mm",         value: f(ms.length_mm, " mm") },
        { label: "surface_condition", value: f(ms.surface_condition) },
        { label: "remarks",           value: f(ms.remarks) },
      ];
      if (ms.material_id) {
        try {
          const { data: mat } = await materialsApi.get(ms.material_id);
          msKids.push({ label: "MATERIAL", children: [
            { label: "material_name",  value: f(mat.material_name) },
            { label: "material_class", value: f(mat.material_class) },
            { label: "density_kg_m3",  value: f(mat.density_kg_m3, " kg/m³") },
            { label: "thermal_conductivity_w_mk", value: f(mat.thermal_conductivity_w_mk, " W/mK") },
            { label: "reflectivity_1070nm", value: f(mat.reflectivity_1070nm) },
            { label: "remarks",        value: f(mat.remarks) },
          ]});
        } catch { /* not found */ }
      }
      nodes.push({ label: "MATERIAL_STATE", children: msKids });
    } catch { /* not found */ }
  }
  return nodes;
}

async function buildExperimentMaterialEntryTree(_item: any): Promise<TItem[]> { return []; }

async function buildExperimentTree(item: any): Promise<TItem[]> {
  const nodes: TItem[] = [
    { label: "remarks", value: f(item.remarks) },
  ];
  const resolveFK = async (id: string | null, api: any, label: string, render: (d: any) => TItem[]) => {
    if (!id) return;
    try {
      const { data: d } = await api.get(id);
      nodes.push({ label, children: render(d) });
    } catch { /* not found */ }
  };
  await resolveFK(item.galvano_system_id, galvanoSystemsApi, "GALVANO_SYSTEM", (d) => [
    { label: "galvano_type",  value: f(d.galvano_type) },
    { label: "serial_number", value: f(d.serial_number) },
  ]);
  await resolveFK(item.welding_condition_id, weldingConditionsApi, "WELDING_CONDITION", (d) => [
    { label: "main_power_w",       value: f(d.main_power_w, " W") },
    { label: "welding_speed_mm_s", value: f(d.welding_speed_mm_s, " mm/s") },
  ]);
  await resolveFK(item.shielding_condition_id, shieldingConditionsApi, "SHIELDING_CONDITION", (d) => [
    { label: "gas_type",       value: f(d.gas_type) },
    { label: "gas_flow_l_min", value: f(d.gas_flow_l_min, " L/min") },
  ]);
  await resolveFK(item.result_id, resultsApi, "RESULT", (d) => [
    { label: "oct_depth_mm",           value: f(d.oct_depth_mm, " mm") },
    { label: "cross_section_depth_mm", value: f(d.cross_section_depth_mm, " mm") },
    { label: "spatter_flag",           value: f(d.spatter_flag) },
    { label: "crack_flag",             value: f(d.crack_flag) },
    { label: "penetration_flag",       value: f(d.penetration_flag) },
  ]);
  await resolveFK(item.observation_id, observationsApi, "OBSERVATION", (d) => [
    { label: "observer_name",        value: f(d.observer_name) },
    { label: "observation_datetime", value: f(d.observation_datetime) },
    { label: "comment",              value: f(d.comment) },
  ]);
  return nodes;
}

// ── Field definitions ─────────────────────────────────────────────────────────

const GALVANO_FIELDS: FieldDef[] = [
  {
    key: "galvano_type", label: "galvano_type", type: "text",
    renderCell: (v) => v != null
      ? <Chip label={v} size="small" sx={{ bgcolor: ROLE_COLOR[v] ?? "#757575", color: "white", fontWeight: "bold" }} />
      : "—",
  },
  { key: "serial_number",    label: "serial_number",    type: "text" },
  { key: "main_diameter_um", label: "main_diameter_um", type: "number" },
  { key: "sub_diameter_um",  label: "sub_diameter_um",  type: "number" },
  { key: "oct_diameter_um",  label: "oct_diameter_um",  type: "number" },
  {
    key: "ftheta_id", label: "ftheta_id", type: "fk", hideInTable: true,
    fkApi: fthetaApi, fkPk: "ftheta_id",
    fkLabel: (o) => `${o.manufacturer ?? ""} ${o.model_name ?? ""} (${String(o.ftheta_id).slice(0, 6)})`,
  },
  {
    key: "optics_id", label: "optics_id", type: "fk", hideInTable: true,
    fkApi: opticsApi, fkPk: "optics_id",
    fkLabel: (o) => `${o.manufacturer ?? ""} (${String(o.optics_id).slice(0, 6)})`,
  },
  { key: "remarks", label: "remarks", type: "text" },
];

const LASER_DEVICE_FIELDS: FieldDef[] = [
  { key: "manufacturer",  label: "manufacturer",  type: "text" },
  { key: "model_name",    label: "model_name",    type: "text" },
  { key: "serial_number", label: "serial_number", type: "text" },
  { key: "beam_structure",label: "beam_structure",type: "text" },
  {
    key: "laser_beam_id", label: "laser_beam_id", type: "fk", hideInTable: true,
    fkApi: laserBeamsApi, fkPk: "laser_beam_id",
    fkLabel: (o) => `${o.wavelength_nm ?? "?"}nm (${String(o.laser_beam_id).slice(0, 6)})`,
  },
  { key: "remarks", label: "remarks", type: "text" },
];

// LASER_BEAM + LASER_BEAM_ENTRY を統合したフラットビュー（Excel形式：1行＝1エントリ）
const LASER_BEAM_COMBINED_FIELDS: FieldDef[] = [
  { key: "wavelength_nm",      label: "wavelength_nm",      type: "number" },
  { key: "numerical_aperture", label: "numerical_aperture", type: "number" },
  { key: "m2_value",           label: "m2_value",           type: "number" },
  { key: "bpp_mm_mrad",        label: "bpp_mm_mrad",        type: "number" },
  {
    key: "beam_type", label: "beam_type", type: "text",
    renderCell: (v) => v != null
      ? <Chip label={v} size="small" sx={{ bgcolor: ROLE_COLOR[v] ?? "#757575", color: "white", fontWeight: "bold" }} />
      : "—",
  },
  { key: "core_diameter_um",       label: "core_diameter_um",       type: "number" },
  { key: "ring_inner_diameter_um", label: "ring_inner_diameter_um", type: "number" },
  { key: "ring_outer_diameter_um", label: "ring_outer_diameter_um", type: "number" },
  { key: "remarks",                label: "remarks",                type: "text" },
];

const FTHETA_FIELDS: FieldDef[] = [
  { key: "manufacturer",    label: "manufacturer",    type: "text" },
  { key: "model_name",      label: "model_name",      type: "text" },
  { key: "serial_number",   label: "serial_number",   type: "text" },
  { key: "ftheta_focal_mm", label: "ftheta_focal_mm", type: "number" },
  { key: "remarks",         label: "remarks",         type: "text" },
];

// OPTICS + OPTICS_ENTRY を統合したフラットビュー（Excel形式：1行＝1エントリ）
const OPTICS_COMBINED_FIELDS: FieldDef[] = [
  { key: "manufacturer",        label: "manufacturer",        type: "text" },
  {
    key: "optics_role", label: "optics_role", type: "text",
    renderCell: (v) => v != null
      ? <Chip label={v} size="small" sx={{ bgcolor: ROLE_COLOR[v] ?? "#757575", color: "white", fontWeight: "bold" }} />
      : "—",
  },
  { key: "collimator_focal_mm", label: "collimator_focal_mm", type: "number" },
  { key: "serial_number",       label: "serial_number",       type: "text" },
  {
    key: "laser_device_id", label: "laser_device_id", type: "fk", hideInTable: true,
    fkApi: laserDevicesApi, fkPk: "laser_device_id",
    fkLabel: (o) => `${o.manufacturer ?? ""} ${o.model_name ?? ""} (${String(o.laser_device_id).slice(0, 6)})`,
  },
  {
    key: "doe_id", label: "doe_id", type: "fk", hideInTable: true,
    fkApi: doeApi, fkPk: "doe_id",
    fkLabel: (o) => `${o.manufacturer ?? ""} ${o.model_name ?? ""} (${String(o.doe_id).slice(0, 6)})`,
  },
  { key: "remarks",             label: "remarks",             type: "text" },
];

const DOE_FIELDS: FieldDef[] = [
  { key: "manufacturer",  label: "manufacturer",  type: "text" },
  { key: "model_name",    label: "model_name",    type: "text" },
  { key: "serial_number", label: "serial_number", type: "text" },
  { key: "profile_shape", label: "profile_shape", type: "text" },
  { key: "remarks",       label: "remarks",       type: "text" },
];

const WELDING_FIELDS: FieldDef[] = [
  { key: "main_power_w",           label: "main_power_w",           type: "number" },
  { key: "sub_power_w",            label: "sub_power_w",            type: "number" },
  { key: "welding_speed_mm_s",     label: "welding_speed_mm_s",     type: "number" },
  { key: "main_focus_offset_mm",   label: "main_focus_offset_mm",   type: "number" },
  { key: "sub_focus_offset_mm",    label: "sub_focus_offset_mm",    type: "number" },
  {
    key: "trajectory_set_id", label: "trajectory_set_id", type: "fk", hideInTable: true,
    fkApi: trajectorySetsApi, fkPk: "trajectory_set_id",
    fkLabel: (o) => `${o.trajectory_csv_path ?? ""} (${String(o.trajectory_set_id).slice(0, 6)})`,
  },
  { key: "remarks",                label: "remarks",                type: "text" },
];

const TRAJECTORY_SET_FIELDS: FieldDef[] = [
  {
    key: "main_trajectory_id", label: "main_trajectory_id", type: "fk", hideInTable: true,
    fkApi: mainTrajectoriesApi, fkPk: "main_trajectory_id",
    fkLabel: (o) => `${o.main_trajectory_type ?? ""} (${String(o.main_trajectory_id).slice(0, 6)})`,
  },
  {
    key: "sub_trajectory_id", label: "sub_trajectory_id", type: "fk", hideInTable: true,
    fkApi: subTrajectoriesApi, fkPk: "sub_trajectory_id",
    fkLabel: (o) => `${o.sub_trajectory_type ?? ""} (${String(o.sub_trajectory_id).slice(0, 6)})`,
  },
  { key: "trajectory_csv_path", label: "trajectory_csv_path", type: "text" },
  { key: "remarks",             label: "remarks",             type: "text" },
];

const MAIN_TRAJECTORY_FIELDS: FieldDef[] = [
  { key: "main_trajectory_type",       label: "main_trajectory_type", type: "text" },
  {
    key: "main_trajectory_parameter_id", label: "line_parameter_id", type: "fk", hideInTable: true,
    fkApi: lineParametersApi, fkPk: "main_trajectory_type_parameter_id",
    fkLabel: (o) => `length=${o.length_mm ?? "?"} (${String(o.main_trajectory_type_parameter_id).slice(0, 6)})`,
  },
  { key: "remarks", label: "remarks", type: "text" },
];

const LINE_PARAMETER_FIELDS: FieldDef[] = [
  { key: "length_mm", label: "length_mm", type: "number" },
  { key: "remarks",   label: "remarks",   type: "text" },
];

const SUB_TRAJECTORY_FIELDS: FieldDef[] = [
  { key: "sub_trajectory_type", label: "sub_trajectory_type", type: "text" },
  {
    key: "sub_trajectory_parameter_id", label: "wobbling_parameter_id", type: "fk", hideInTable: true,
    fkApi: wobblingParametersApi, fkPk: "sub_trajectory_type_parameter_id",
    fkLabel: (o) => `r=${o.wobble_radius_mm ?? "?"}mm (${String(o.sub_trajectory_type_parameter_id).slice(0, 6)})`,
  },
  { key: "remarks", label: "remarks", type: "text" },
];

const WOBBLING_PARAMETER_FIELDS: FieldDef[] = [
  { key: "wobble_radius_mm",      label: "wobble_radius_mm",      type: "number" },
  { key: "wobble_frequency_hz",   label: "wobble_frequency_hz",   type: "number" },
  { key: "circumferential_speed", label: "circumferential_speed", type: "number" },
  { key: "remarks",               label: "remarks",               type: "text" },
];

const MATERIAL_FIELDS: FieldDef[] = [
  { key: "material_name",              label: "material_name",              type: "text" },
  { key: "material_class",             label: "material_class",             type: "text" },
  { key: "density_kg_m3",              label: "density_kg_m3",              type: "number" },
  { key: "thermal_conductivity_w_mk",  label: "thermal_conductivity_w_mk",  type: "number" },
  { key: "reflectivity_1070nm",        label: "reflectivity_1070nm",        type: "number" },
  { key: "remarks",                    label: "remarks",                    type: "text" },
];

const MATERIAL_STATE_FIELDS: FieldDef[] = [
  {
    key: "material_id", label: "material_id", type: "fk", hideInTable: true,
    fkApi: materialsApi, fkPk: "material_id",
    fkLabel: (o) => `${o.material_name ?? ""} (${String(o.material_id).slice(0, 6)})`,
  },
  { key: "thickness_mm",     label: "thickness_mm",     type: "number" },
  { key: "width_mm",         label: "width_mm",         type: "number" },
  { key: "length_mm",        label: "length_mm",        type: "number" },
  { key: "surface_condition",label: "surface_condition",type: "text" },
  { key: "remarks",          label: "remarks",          type: "text" },
];

const SHIELDING_FIELDS: FieldDef[] = [
  { key: "gas_type",            label: "gas_type",            type: "text" },
  { key: "gas_purity_percent",  label: "gas_purity_percent",  type: "number" },
  { key: "gas_flow_l_min",      label: "gas_flow_l_min",      type: "number" },
  { key: "gas_pressure_kpa",    label: "gas_pressure_kpa",    type: "number" },
  { key: "nozzle_type",         label: "nozzle_type",         type: "text" },
  { key: "nozzle_diameter_mm",  label: "nozzle_diameter_mm",  type: "number" },
  { key: "nozzle_distance_mm",  label: "nozzle_distance_mm",  type: "number" },
  { key: "nozzle_angle_deg",    label: "nozzle_angle_deg",    type: "number" },
  { key: "remarks",             label: "remarks",             type: "text" },
];

const RESULT_FIELDS: FieldDef[] = [
  { key: "oct_depth_mm",             label: "oct_depth_mm",             type: "number" },
  { key: "oct_surface_csv_path",     label: "oct_surface_csv_path",     type: "text" },
  { key: "oct_depth_csv_path",       label: "oct_depth_csv_path",       type: "text" },
  { key: "oct_result_csv_path",      label: "oct_result_csv_path",      type: "text" },
  { key: "cross_section_depth_mm",   label: "cross_section_depth_mm",   type: "number" },
  { key: "spatter_flag",             label: "spatter_flag",             type: "boolean" },
  { key: "spatter_severity",         label: "spatter_severity",         type: "number" },
  { key: "gap_opening_flag",         label: "gap_opening_flag",         type: "boolean" },
  { key: "crack_flag",               label: "crack_flag",               type: "boolean" },
  { key: "crack_severity",           label: "crack_severity",           type: "number" },
  { key: "glass_contamination",      label: "glass_contamination",      type: "boolean" },
  { key: "surface_contamination",    label: "surface_contamination",    type: "boolean" },
  { key: "penetration_flag",         label: "penetration_flag",         type: "boolean" },
  { key: "remarks",                  label: "remarks",                  type: "text" },
];

const OBSERVATION_FIELDS: FieldDef[] = [
  { key: "observer_name",        label: "observer_name",        type: "text" },
  { key: "observation_datetime", label: "observation_datetime", type: "text" },
  { key: "comment",              label: "comment",              type: "text" },
  { key: "remarks",              label: "remarks",              type: "text" },
];

const FILE_FIELDS: FieldDef[] = [
  { key: "remarks", label: "remarks", type: "text" },
];

const EXPERIMENT_MATERIAL_FIELDS: FieldDef[] = [
  {
    key: "material_state_id", label: "material_state_id", type: "fk", hideInTable: true,
    fkApi: materialStatesApi, fkPk: "material_state_id",
    fkLabel: (o) => `t=${o.thickness_mm ?? "?"}mm (${String(o.material_state_id).slice(0, 6)})`,
  },
  { key: "material_role", label: "material_role", type: "text" },
  { key: "remarks",       label: "remarks",       type: "text" },
];

const EXPERIMENT_FIELDS: FieldDef[] = [
  {
    key: "galvano_system_id", label: "galvano_system_id", type: "fk",
    fkApi: galvanoSystemsApi, fkPk: "galvano_system_id",
    fkLabel: (o) => `${o.galvano_type ?? ""} (${String(o.galvano_system_id).slice(0, 6)})`,
  },
  {
    key: "welding_condition_id", label: "welding_condition_id", type: "fk",
    fkApi: weldingConditionsApi, fkPk: "welding_condition_id",
    fkLabel: (o) => `${o.main_power_w ?? "?"}W (${String(o.welding_condition_id).slice(0, 6)})`,
  },
  {
    key: "experiment_material_id", label: "experiment_material_id", type: "fk",
    fkApi: experimentMaterialsApi, fkPk: "experiment_material_id",
    fkLabel: (o) => `(${String(o.experiment_material_id).slice(0, 6)})`,
  },
  {
    key: "shielding_condition_id", label: "shielding_condition_id", type: "fk",
    fkApi: shieldingConditionsApi, fkPk: "shielding_condition_id",
    fkLabel: (o) => `${o.gas_type ?? ""} (${String(o.shielding_condition_id).slice(0, 6)})`,
  },
  {
    key: "result_id", label: "result_id", type: "fk",
    fkApi: resultsApi, fkPk: "result_id",
    fkLabel: (o) => `depth=${o.oct_depth_mm ?? "?"}mm (${String(o.result_id).slice(0, 6)})`,
  },
  {
    key: "observation_id", label: "observation_id", type: "fk",
    fkApi: observationsApi, fkPk: "observation_id",
    fkLabel: (o) => `${o.observer_name ?? ""} (${String(o.observation_id).slice(0, 6)})`,
  },
  {
    key: "file_id", label: "file_id", type: "fk",
    fkApi: filesApi, fkPk: "file_id",
    fkLabel: (o) => `(${String(o.file_id).slice(0, 6)})`,
  },
  { key: "remarks", label: "remarks", type: "text" },
];

const COLUMN_DEF_FIELDS: FieldDef[] = [
  { key: "table_name",  label: "table_name",  type: "text" },
  { key: "column_name", label: "column_name", type: "text" },
  { key: "data_type",   label: "data_type",   type: "text" },
  { key: "candidates",  label: "candidates",  type: "text" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MasterPage() {
  const [tab, setTab] = useState(0);
  const [subTab0, setSubTab0] = useState(0); // GALVANO_SYSTEM sub-tabs
  const [subTab1, setSubTab1] = useState(0); // WELDING_CONDITION sub-tabs
  const [subTab2, setSubTab2] = useState(0); // EXPERIMENT_MATERIAL sub-tabs

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }} variant="scrollable" scrollButtons="auto">
        <Tab label="GALVANO_SYSTEM" />
        <Tab label="WELDING_CONDITION" />
        <Tab label="EXPERIMENT_MATERIAL" />
        <Tab label="SHIELDING_CONDITION" />
        <Tab label="RESULT" />
        <Tab label="OBSERVATION" />
        <Tab label="FILE" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Tabs value={subTab0} onChange={(_, v) => setSubTab0(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto" textColor="secondary" indicatorColor="secondary">
            <Tab label="GALVANO_SYSTEM" />
            <Tab label="FTHETA" />
            <Tab label="OPTICS" />
            <Tab label="LASER_DEVICE" />
            <Tab label="LASER_BEAM" />
            <Tab label="DOE" />
          </Tabs>
          {subTab0 === 0 && <EntityCrud title="GALVANO_SYSTEM" fields={GALVANO_FIELDS} pkField="galvano_system_id" api={galvanoSystemsApi} expandable buildTree={buildGalvanoTree} rowColor={(item) => ROLE_COLOR[item.galvano_type] ?? undefined} />}
          {subTab0 === 1 && <EntityCrud title="FTHETA" fields={FTHETA_FIELDS} pkField="ftheta_id" api={fthetaApi} expandable buildTree={buildFthetaTree} />}
          {subTab0 === 2 && <EntityCrud title="OPTICS" fields={OPTICS_COMBINED_FIELDS} pkField="optics_entry_id" api={opticsCombinedApi} expandable buildTree={buildOpticsCombinedTree} rowColor={(item) => ROLE_COLOR[item.optics_role] ?? undefined} />}
          {subTab0 === 3 && <EntityCrud title="LASER_DEVICE" fields={LASER_DEVICE_FIELDS} pkField="laser_device_id" api={laserDevicesApi} expandable buildTree={buildLaserDeviceTree} />}
          {subTab0 === 4 && <EntityCrud title="LASER_BEAM" fields={LASER_BEAM_COMBINED_FIELDS} pkField="laser_beam_entry_id" api={laserBeamsCombinedApi} expandable buildTree={buildLaserBeamCombinedTree} rowColor={(item) => ROLE_COLOR[item.beam_type] ?? undefined} />}
          {subTab0 === 5 && <EntityCrud title="DOE" fields={DOE_FIELDS} pkField="doe_id" api={doeApi} expandable buildTree={buildDoeTree} />}
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Tabs value={subTab1} onChange={(_, v) => setSubTab1(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto" textColor="inherit" TabIndicatorProps={{ sx: { display: "none" } }}>
            <Tab label="WELDING_CONDITION" sx={{ fontWeight: 600, '&.Mui-selected': { bgcolor: "action.selected" } }} />
            <Tab label="TRAJECTORY_SET"    sx={ctab(TRAJ_SET_COLOR)} />
            <Tab label="MAIN_TRAJECTORY"   sx={ctab(TRAJ_MAIN_COLOR)} />
            <Tab label="LINE_PARAMETER"    sx={ctab(TRAJ_MAIN_COLOR)} />
            <Tab label="SUB_TRAJECTORY"    sx={ctab(TRAJ_SUB_COLOR)} />
            <Tab label="WOBBLING_PARAMETER" sx={ctab(TRAJ_SUB_COLOR)} />
          </Tabs>
          {subTab1 === 0 && <EntityCrud title="WELDING_CONDITION" fields={WELDING_FIELDS} pkField="welding_condition_id" api={weldingConditionsApi} expandable buildTree={buildWeldingTree} />}
          {subTab1 === 1 && <EntityCrud title="TRAJECTORY_SET" fields={TRAJECTORY_SET_FIELDS} pkField="trajectory_set_id" api={trajectorySetsApi} expandable buildTree={buildTrajectorySetTree} />}
          {subTab1 === 2 && <EntityCrud title="MAIN_TRAJECTORY" fields={MAIN_TRAJECTORY_FIELDS} pkField="main_trajectory_id" api={mainTrajectoriesApi} expandable buildTree={buildMainTrajectoryTree} />}
          {subTab1 === 3 && <EntityCrud title="LINE_PARAMETER" fields={LINE_PARAMETER_FIELDS} pkField="main_trajectory_type_parameter_id" api={lineParametersApi} expandable buildTree={buildLineParameterTree} />}
          {subTab1 === 4 && <EntityCrud title="SUB_TRAJECTORY" fields={SUB_TRAJECTORY_FIELDS} pkField="sub_trajectory_id" api={subTrajectoriesApi} expandable buildTree={buildSubTrajectoryTree} />}
          {subTab1 === 5 && <EntityCrud title="WOBBLING_PARAMETER" fields={WOBBLING_PARAMETER_FIELDS} pkField="sub_trajectory_type_parameter_id" api={wobblingParametersApi} expandable buildTree={buildWobblingParameterTree} />}
        </Box>
      )}

      {tab === 2 && (
        <Box>
          <Tabs value={subTab2} onChange={(_, v) => setSubTab2(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto" textColor="secondary" indicatorColor="secondary">
            <Tab label="EXPERIMENT_MATERIAL" />
            <Tab label="MATERIAL_STATE" />
            <Tab label="MATERIAL" />
          </Tabs>
          {subTab2 === 0 && <EntityCrud title="EXPERIMENT_MATERIAL" fields={EXPERIMENT_MATERIAL_FIELDS} pkField="experiment_material_id" api={experimentMaterialsApi} expandable buildTree={buildExperimentMaterialTree} />}
          {subTab2 === 1 && <EntityCrud title="MATERIAL_STATE" fields={MATERIAL_STATE_FIELDS} pkField="material_state_id" api={materialStatesApi} expandable buildTree={buildMaterialStateTree} />}
          {subTab2 === 2 && <EntityCrud title="MATERIAL" fields={MATERIAL_FIELDS} pkField="material_id" api={materialsApi} expandable buildTree={buildMaterialTree} />}
        </Box>
      )}

      {tab === 3 && (
        <EntityCrud title="SHIELDING_CONDITION" fields={SHIELDING_FIELDS} pkField="shielding_condition_id" api={shieldingConditionsApi} expandable buildTree={buildShieldingTree} />
      )}

      {tab === 4 && (
        <EntityCrud title="RESULT" fields={RESULT_FIELDS} pkField="result_id" api={resultsApi} expandable buildTree={buildResultTree} />
      )}

      {tab === 5 && (
        <EntityCrud title="OBSERVATION" fields={OBSERVATION_FIELDS} pkField="observation_id" api={observationsApi} expandable buildTree={buildObservationTree} />
      )}

      {tab === 6 && (
        <EntityCrud title="FILE" fields={FILE_FIELDS} pkField="file_id" api={filesApi} expandable buildTree={buildFileTree} />
      )}
    </Box>
  );
}
