import { useState, useMemo, useEffect } from "react";
import { Box, Chip, Divider, Tab, Tabs, Typography } from "@mui/material";
import { EntityCrud } from "../components/masters/EntityCrud";
import type { FieldDef, TItem } from "../components/masters/EntityCrud";
import {
  galvanoSystemsApi, laserDevicesApi, laserBeamsApi,
  fthetaApi, opticsApi, doeApi,
  weldingConditionsApi, trajectorySetsApi,
  mainTrajectoriesApi, subTrajectoriesApi,
  lineParametersApi, wobblingParametersApi,
  materialsApi, materialStatesApi,
  shieldingConditionsApi,
  resultsApi, observationsApi, filesApi,
  experimentMaterialsApi,
  galvanoSystemDetail, laserDeviceDetail, opticsDetail,
  trajectorySetDetail,
  masterProjectsApi,
  trajectoryTypeDefsApi, dynParamsApi,
  columnDefsTableApi,
} from "../api/masters";
import type { TrajectoryTypeDef } from "../api/masters";
import {
  buildGalvanoSystemChildren,
  buildLaserDeviceItem,
  f, fDate,
} from "../components/common/detailTreeBuilders";

// ── Per-entity tree builders ──────────────────────────────────────────────────

async function buildGalvanoTree(item: any): Promise<TItem[]> {
  const { data: d } = await galvanoSystemDetail(item.galvano_system_id);
  return buildGalvanoSystemChildren(d);
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
  // Standalone view includes extra beam fields (m2_value, bpp_mm_mrad)
  (d.laser_beams ?? []).forEach((lb: any) => {
    nodes.push({
      label: lb.beam_type ?? "—",
      children: [
        { label: "wavelength_nm",          value: f(lb.wavelength_nm, " nm") },
        { label: "numerical_aperture",     value: f(lb.numerical_aperture) },
        { label: "m2_value",               value: f(lb.m2_value) },
        { label: "bpp_mm_mrad",            value: f(lb.bpp_mm_mrad) },
        { label: "core_diameter_um",       value: f(lb.core_diameter_um, " µm") },
        { label: "ring_inner_diameter_um", value: f(lb.ring_inner_diameter_um, " µm") },
        { label: "ring_outer_diameter_um", value: f(lb.ring_outer_diameter_um, " µm") },
      ],
    });
  });
  return nodes;
}

async function buildOpticsTree(item: any): Promise<TItem[]> {
  const { data: d } = await opticsDetail(item._id);
  // Standalone OPTICS view: show optics_role as a value field
  const nodes: TItem[] = [
    { label: "optics_role",         value: f(d.optics_role) },
    { label: "manufacturer",        value: f(d.manufacturer) },
    { label: "collimator_focal_mm", value: f(d.collimator_focal_mm, " mm") },
    { label: "serial_number",       value: f(d.serial_number) },
    { label: "remarks",             value: f(d.remarks) },
  ];
  if (d.doe) nodes.push({
    label: "DOE",
    children: [
      { label: "manufacturer",  value: f(d.doe.manufacturer) },
      { label: "model_name",    value: f(d.doe.model_name) },
      { label: "serial_number", value: f(d.doe.serial_number) },
      { label: "profile_shape", value: f(d.doe.profile_shape) },
      { label: "remarks",       value: f(d.doe.remarks) },
    ],
  });
  if (d.laser_device) nodes.push(buildLaserDeviceItem(d.laser_device));
  return nodes;
}

async function buildLaserBeamTree(item: any): Promise<TItem[]> {
  return [
    { label: "beam_type",              value: f(item.beam_type) },
    { label: "wavelength_nm",          value: f(item.wavelength_nm, " nm") },
    { label: "numerical_aperture",     value: f(item.numerical_aperture) },
    { label: "m2_value",               value: f(item.m2_value) },
    { label: "bpp_mm_mrad",            value: f(item.bpp_mm_mrad) },
    { label: "core_diameter_um",       value: f(item.core_diameter_um, " µm") },
    { label: "ring_inner_diameter_um", value: f(item.ring_inner_diameter_um, " µm") },
    { label: "ring_outer_diameter_um", value: f(item.ring_outer_diameter_um, " µm") },
    { label: "remarks",                value: f(item.remarks) },
  ];
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
  return buildOpticsTree(item);
}

async function buildLaserBeamCombinedTree(item: any): Promise<TItem[]> {
  return buildLaserBeamTree(item);
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
    { label: "observation_datetime", value: fDate(item.observation_datetime) },
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
    { label: "observation_datetime", value: fDate(d.observation_datetime) },
    { label: "comment",              value: f(d.comment) },
  ]);
  return nodes;
}

// ── Field definitions ─────────────────────────────────────────────────────────

const GALVANO_FIELDS: FieldDef[] = [
  { key: "galvano_type", label: "galvano_type", type: "text" },
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

// LASER_BEAM flat view (1 row = 1 entry, composite PK: laser_beam_id + beam_type)
const LASER_BEAM_COMBINED_FIELDS: FieldDef[] = [
  { key: "laser_beam_id",      label: "laser_beam_id",      type: "text" },
  { key: "beam_type", label: "beam_type", type: "text" },
  { key: "wavelength_nm",      label: "wavelength_nm",      type: "number" },
  { key: "numerical_aperture", label: "numerical_aperture", type: "number" },
  { key: "m2_value",           label: "m2_value",           type: "number" },
  { key: "bpp_mm_mrad",        label: "bpp_mm_mrad",        type: "number" },
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

// OPTICS flat view (1 row = 1 entry, composite PK: optics_id + optics_role)
const OPTICS_COMBINED_FIELDS: FieldDef[] = [
  { key: "optics_id",           label: "optics_id",           type: "text" },
  { key: "optics_role", label: "optics_role", type: "text" },
  { key: "manufacturer",        label: "manufacturer",        type: "text" },
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
  { key: "observation_datetime", label: "observation_datetime", type: "date" },
  { key: "comment",              label: "comment",              type: "text" },
  { key: "remarks",              label: "remarks",              type: "text" },
];

const FILE_FIELDS: FieldDef[] = [
  { key: "remarks", label: "remarks", type: "text" },
];

const PROJECT_FIELDS: FieldDef[] = [
  { key: "project_name", label: "project_name", type: "text" },
];

async function buildProjectTree(item: any): Promise<TItem[]> {
  return [
    { label: "project_id",   value: f(item.project_id) },
    { label: "project_name", value: f(item.project_name) },
    { label: "remarks",      value: f(item.remarks) },
  ];
}

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
  {
    key: "project_id", label: "project_id", type: "fk",
    fkApi: masterProjectsApi, fkPk: "project_id",
    fkLabel: (o) => `${o.project_name ?? ""} (${String(o.project_id).slice(0, 6)})`,
  },
  { key: "remarks", label: "remarks", type: "text" },
];

const COLUMN_DEF_FIELDS: FieldDef[] = [
  { key: "table_name",  label: "table_name",  type: "text" },
  { key: "column_name", label: "column_name", type: "text" },
  { key: "data_type",   label: "data_type",   type: "text" },
  { key: "candidates",  label: "candidates",  type: "text" },
];

// ── Dynamic trajectory parameter table CRUD ───────────────────────────────────
function DynParamCrud({ title, slug, pkCol }: { title: string; slug: string; pkCol: string }) {
  const tableUpper = slug.replace(/-/g, "_").toUpperCase();
  const [fields, setFields] = useState<FieldDef[]>([{ key: "remarks", label: "remarks", type: "text" }]);
  useEffect(() => {
    columnDefsTableApi(tableUpper).list().then(r => {
      const defs = (r.data as any[]).filter(c => c.is_id !== "pk" && c.is_id !== "fk");
      if (defs.length) {
        setFields(defs.map((c: any) => ({
          key: c.column_name,
          label: c.column_name + (c.unit ? ` [${c.unit}]` : ""),
          type: c.data_type === "float" || c.data_type === "integer" ? "number" : "text",
        })));
      }
    }).catch(() => {});
  }, [tableUpper]);

  const api = dynParamsApi(slug);
  return (
    <EntityCrud
      title={title}
      fields={fields}
      pkField={pkCol}
      api={{ list: api.list, create: api.create, update: api.update, remove: api.remove }}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MasterPage() {
  const [tab, setTab] = useState(0);
  const [subTab0, setSubTab0] = useState(0); // GALVANO_SYSTEM sub-tabs
  const [subTab1, setSubTab1] = useState(0); // WELDING_CONDITION sub-tabs
  const [subTab2, setSubTab2] = useState(0); // EXPERIMENT_MATERIAL sub-tabs
  const [trajectoryTypeDefs, setTrajectoryTypeDefs] = useState<TrajectoryTypeDef[]>([]);

  useEffect(() => {
    trajectoryTypeDefsApi.sync().then(() =>
      trajectoryTypeDefsApi.list().then(r => setTrajectoryTypeDefs(r.data))
    ).catch(() => trajectoryTypeDefsApi.list().then(r => setTrajectoryTypeDefs(r.data)).catch(() => {}));
  }, []);

  // Stable references for candidatesTables arrays to prevent spurious useEffect re-runs
  const galvanoCandidates  = useMemo(() => ["OPTICS", "LASER_BEAM"], []);
  const opticsCandidates   = useMemo(() => ["LASER_BEAM", "DOE"], []);
  const laserDevCandidates = useMemo(() => ["LASER_BEAM"], []);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }} variant="scrollable" scrollButtons="auto">
        <Tab label="PROJECT"              sx={{ color: "#26a69a", fontWeight: 700, '&.Mui-selected': { color: "#26a69a" } }} />
        <Tab label="GALVANO_SYSTEM"       sx={{ color: "#6a1b9a", fontWeight: 700, '&.Mui-selected': { color: "#6a1b9a" } }} />
        <Tab label="WELDING_CONDITION"    sx={{ color: "#2e7d32", fontWeight: 700, '&.Mui-selected': { color: "#2e7d32" } }} />
        <Tab label="EXPERIMENT_MATERIAL"  sx={{ color: "#00695c", fontWeight: 700, '&.Mui-selected': { color: "#00695c" } }} />
        <Tab label="SHIELDING_CONDITION"  sx={{ color: "#5d4037", fontWeight: 700, '&.Mui-selected': { color: "#5d4037" } }} />
        <Tab label="RESULT"               sx={{ color: "#ad1457", fontWeight: 700, '&.Mui-selected': { color: "#ad1457" } }} />
        <Tab label="OBSERVATION"          sx={{ color: "#0277bd", fontWeight: 700, '&.Mui-selected': { color: "#0277bd" } }} />
        <Tab label="FILE"                 sx={{ color: "#37474f", fontWeight: 700, '&.Mui-selected': { color: "#37474f" } }} />
      </Tabs>

      <Box sx={{ display: tab === 0 ? "" : "none" }}>
        <EntityCrud title="PROJECT" fields={PROJECT_FIELDS} pkField="project_id" api={masterProjectsApi} expandable buildTree={buildProjectTree} />
      </Box>

      <Box sx={{ display: tab === 1 ? "" : "none" }}>
        <Box>
          <Tabs value={subTab0} onChange={(_, v) => setSubTab0(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto">
            <Tab label="GALVANO_SYSTEM" />
            <Tab label="FTHETA" />
            <Tab label="OPTICS" />
            <Tab label="LASER_DEVICE" />
            <Tab label="LASER_BEAM" />
            <Tab label="DOE" />
          </Tabs>
          <Box sx={{ display: subTab0 === 0 ? "" : "none" }}><EntityCrud title="GALVANO_SYSTEM" fields={GALVANO_FIELDS} pkField="galvano_system_id" api={galvanoSystemsApi} expandable buildTree={buildGalvanoTree} candidatesTables={galvanoCandidates} /></Box>
          <Box sx={{ display: subTab0 === 1 ? "" : "none" }}><EntityCrud title="FTHETA" fields={FTHETA_FIELDS} pkField="ftheta_id" api={fthetaApi} expandable buildTree={buildFthetaTree} /></Box>
          <Box sx={{ display: subTab0 === 2 ? "" : "none" }}><EntityCrud title="OPTICS" fields={OPTICS_COMBINED_FIELDS} pkField="_id" api={opticsApi} expandable buildTree={buildOpticsTree} candidatesTables={opticsCandidates} /></Box>
          <Box sx={{ display: subTab0 === 3 ? "" : "none" }}><EntityCrud title="LASER_DEVICE" fields={LASER_DEVICE_FIELDS} pkField="laser_device_id" api={laserDevicesApi} expandable buildTree={buildLaserDeviceTree} candidatesTables={laserDevCandidates} /></Box>
          <Box sx={{ display: subTab0 === 4 ? "" : "none" }}><EntityCrud title="LASER_BEAM" fields={LASER_BEAM_COMBINED_FIELDS} pkField="_id" api={laserBeamsApi} expandable buildTree={buildLaserBeamCombinedTree} /></Box>
          <Box sx={{ display: subTab0 === 5 ? "" : "none" }}><EntityCrud title="DOE" fields={DOE_FIELDS} pkField="doe_id" api={doeApi} expandable buildTree={buildDoeTree} /></Box>
        </Box>
      </Box>

      <Box sx={{ display: tab === 2 ? "" : "none" }}>
        <Box>
          {/* Static + dynamic trajectory parameter tabs */}
          <Tabs value={subTab1} onChange={(_, v) => setSubTab1(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons allowScrollButtonsMobile>
            <Tab label="WELDING_CONDITION" />
            <Tab label="TRAJECTORY_SET" />
            <Tab label="MAIN_TRAJECTORY" />
            {/* Dynamic main trajectory parameter tabs */}
            {trajectoryTypeDefs.filter(d => d.parent === "main").map(d => (
              <Tab key={d.type_def_id} label={d.param_table.toUpperCase()} />
            ))}
            <Tab label="SUB_TRAJECTORY" />
            {/* Dynamic sub trajectory parameter tabs */}
            {trajectoryTypeDefs.filter(d => d.parent === "sub").map(d => (
              <Tab key={d.type_def_id} label={d.param_table.toUpperCase()} />
            ))}
          </Tabs>
          <Box sx={{ display: subTab1 === 0 ? "" : "none" }}><EntityCrud title="WELDING_CONDITION" fields={WELDING_FIELDS} pkField="welding_condition_id" api={weldingConditionsApi} expandable buildTree={buildWeldingTree} /></Box>
          <Box sx={{ display: subTab1 === 1 ? "" : "none" }}><EntityCrud title="TRAJECTORY_SET" fields={TRAJECTORY_SET_FIELDS} pkField="trajectory_set_id" api={trajectorySetsApi} expandable buildTree={buildTrajectorySetTree} /></Box>
          <Box sx={{ display: subTab1 === 2 ? "" : "none" }}><EntityCrud title="MAIN_TRAJECTORY" fields={MAIN_TRAJECTORY_FIELDS} pkField="main_trajectory_id" api={mainTrajectoriesApi} expandable buildTree={buildMainTrajectoryTree} /></Box>
          {/* Dynamic main parameter tabs */}
          {trajectoryTypeDefs.filter(d => d.parent === "main").map((d, i) => {
            const tabIdx = 3 + i;
            const slug = d.param_table.replace(/_/g, "-");
            return (
              <Box key={d.type_def_id} sx={{ display: subTab1 === tabIdx ? "" : "none" }}>
                <DynParamCrud title={d.param_table.toUpperCase()} slug={slug} pkCol={d.pk_col} />
              </Box>
            );
          })}
          {/* SUB_TRAJECTORY tab */}
          <Box sx={{ display: subTab1 === 3 + trajectoryTypeDefs.filter(d => d.parent === "main").length ? "" : "none" }}>
            <EntityCrud title="SUB_TRAJECTORY" fields={SUB_TRAJECTORY_FIELDS} pkField="sub_trajectory_id" api={subTrajectoriesApi} expandable buildTree={buildSubTrajectoryTree} />
          </Box>
          {/* Dynamic sub parameter tabs */}
          {trajectoryTypeDefs.filter(d => d.parent === "sub").map((d, i) => {
            const tabIdx = 4 + trajectoryTypeDefs.filter(x => x.parent === "main").length + i;
            const slug = d.param_table.replace(/_/g, "-");
            return (
              <Box key={d.type_def_id} sx={{ display: subTab1 === tabIdx ? "" : "none" }}>
                <DynParamCrud title={d.param_table.toUpperCase()} slug={slug} pkCol={d.pk_col} />
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ display: tab === 3 ? "" : "none" }}>
        <Box>
          <Tabs value={subTab2} onChange={(_, v) => setSubTab2(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto">
            <Tab label="EXPERIMENT_MATERIAL" />
            <Tab label="MATERIAL_STATE" />
            <Tab label="MATERIAL" />
          </Tabs>
          <Box sx={{ display: subTab2 === 0 ? "" : "none" }}><EntityCrud title="EXPERIMENT_MATERIAL" fields={EXPERIMENT_MATERIAL_FIELDS} pkField="experiment_material_id" api={experimentMaterialsApi} expandable buildTree={buildExperimentMaterialTree} /></Box>
          <Box sx={{ display: subTab2 === 1 ? "" : "none" }}><EntityCrud title="MATERIAL_STATE" fields={MATERIAL_STATE_FIELDS} pkField="material_state_id" api={materialStatesApi} expandable buildTree={buildMaterialStateTree} /></Box>
          <Box sx={{ display: subTab2 === 2 ? "" : "none" }}><EntityCrud title="MATERIAL" fields={MATERIAL_FIELDS} pkField="material_id" api={materialsApi} expandable buildTree={buildMaterialTree} /></Box>
        </Box>
      </Box>

      <Box sx={{ display: tab === 4 ? "" : "none" }}>
        <EntityCrud title="SHIELDING_CONDITION" fields={SHIELDING_FIELDS} pkField="shielding_condition_id" api={shieldingConditionsApi} expandable buildTree={buildShieldingTree} />
      </Box>

      <Box sx={{ display: tab === 5 ? "" : "none" }}>
        <EntityCrud title="RESULT" fields={RESULT_FIELDS} pkField="result_id" api={resultsApi} expandable buildTree={buildResultTree} />
      </Box>

      <Box sx={{ display: tab === 6 ? "" : "none" }}>
        <EntityCrud title="OBSERVATION" fields={OBSERVATION_FIELDS} pkField="observation_id" api={observationsApi} expandable buildTree={buildObservationTree} />
      </Box>

      <Box sx={{ display: tab === 7 ? "" : "none" }}>
        <EntityCrud title="FILE" fields={FILE_FIELDS} pkField="file_id" api={filesApi} expandable buildTree={buildFileTree} />
      </Box>
    </Box>
  );
}
