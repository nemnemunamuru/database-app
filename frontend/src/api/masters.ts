import api from "./client";

// --- TypeScript interfaces ---
export interface Material { material_id: string; material_name?: string; material_class?: string; density_kg_m3?: number; thermal_conductivity_w_mk?: number; reflectivity_1070nm?: number; remarks?: string; }
export interface MaterialState { material_state_id: string; material_id?: string; thickness_mm?: number; width_mm?: number; length_mm?: number; surface_condition?: string; remarks?: string; }
export interface LaserBeam { _id: string; laser_beam_id: string; beam_type: string; wavelength_nm?: number; numerical_aperture?: number; m2_value?: number; bpp_mm_mrad?: number; core_diameter_um?: number; ring_inner_diameter_um?: number; ring_outer_diameter_um?: number; remarks?: string; }
export interface LaserDevice { laser_device_id: string; manufacturer?: string; model_name?: string; serial_number?: string; beam_structure?: string; laser_beam_id?: string; remarks?: string; }
export interface Ftheta { ftheta_id: string; manufacturer?: string; model_name?: string; serial_number?: string; ftheta_focal_mm?: number; remarks?: string; }
export interface Doe { doe_id: string; manufacturer?: string; model_name?: string; serial_number?: string; profile_shape?: string; remarks?: string; }
export interface Optics { _id: string; optics_id: string; optics_role: string; manufacturer?: string; collimator_focal_mm?: number; serial_number?: string; laser_device_id?: string; doe_id?: string; remarks?: string; }
export interface GalvanoSystem { galvano_system_id: string; galvano_type?: string; serial_number?: string; ftheta_id?: string; optics_id?: string; main_diameter_um?: number; sub_diameter_um?: number; oct_diameter_um?: number; remarks?: string; }
export interface WeldingCondition { welding_condition_id: string; main_power_w?: number; sub_power_w?: number; welding_speed_mm_s?: number; main_focus_offset_mm?: number; sub_focus_offset_mm?: number; trajectory_set_id?: string; remarks?: string; }
export interface ShieldingCondition { shielding_condition_id: string; gas_type?: string; gas_purity_percent?: number; gas_flow_l_min?: number; gas_pressure_kpa?: number; nozzle_type?: string; nozzle_diameter_mm?: number; nozzle_distance_mm?: number; nozzle_angle_deg?: number; remarks?: string; }

// --- Generic CRUD factory ---
const crud = (prefix: string) => ({
  list: () => api.get<any[]>(`/api/masters/${prefix}`),
  get: (id: string) => api.get<any>(`/api/masters/${prefix}/${id}`),
  create: (data: any) => api.post<any>(`/api/masters/${prefix}`, data),
  update: (id: string, data: any) => api.put<any>(`/api/masters/${prefix}/${id}`, data),
  remove: (id: string) => api.delete(`/api/masters/${prefix}/${id}`),
});

export const materialsApi         = crud("materials");
export const materialStatesApi    = crud("material-states");
export const laserBeamsApi        = crud("laser-beams");
export const laserDevicesApi      = crud("laser-devices");
export const fthetaApi            = crud("ftheta");
export const opticsApi            = crud("optics");
export const doeApi               = crud("doe");
export const galvanoSystemsApi    = crud("galvano-systems");
export const weldingConditionsApi = crud("welding-conditions");
export const shieldingConditionsApi = crud("shielding-conditions");
export const resultsApi           = crud("results");
export const observationsApi      = crud("observations");
export const filesApi             = crud("files");
export const experimentMaterialsApi = crud("experiment-materials");
export const experimentsApi       = crud("experiments");
export const lineParametersApi    = crud("line-parameters");
export const mainTrajectoriesApi  = crud("main-trajectories");
export const wobblingParametersApi = crud("wobbling-parameters");
export const subTrajectoriesApi   = crud("sub-trajectories");
export const trajectorySetsApi    = crud("trajectory-sets");
export const masterProjectsApi    = crud("projects");

// --- Detail endpoints (resolved FK chains) ---
export const galvanoSystemDetail  = (id: string) => api.get<any>(`/api/masters/galvano-systems/${id}/detail`);
export const laserDeviceDetail    = (id: string) => api.get<any>(`/api/masters/laser-devices/${id}/detail`);
export const opticsDetail         = (encodedId: string) => api.get<any>(`/api/masters/optics/${encodeURIComponent(encodedId)}/detail`);
export const trajectorySetDetail  = (id: string) => api.get<any>(`/api/masters/trajectory-sets/${id}/detail`);

// --- ColumnDef (schema metadata) ---
export const columnDefsApi = crud("column-defs");
export const columnDefsTableApi = (tableName: string) => ({
  ...columnDefsApi,
  list: () => api.get<any[]>(`/api/masters/column-defs?table_name=${encodeURIComponent(tableName)}`),
});
export const initColumnDefs = () => api.post("/api/masters/column-defs/init").then(r => r.data);
export const syncFkForColumn = (columnName: string) =>
  api.post(`/api/masters/column-defs/sync-fk/${encodeURIComponent(columnName)}`).then(r => r.data);
export const getColumnDef = (id: string) =>
  api.get<any>(`/api/masters/column-defs/${encodeURIComponent(id)}`).then(r => r.data);
export const deleteFkByColumn = (columnName: string) =>
  api.delete(`/api/masters/column-defs/fk-by-column/${encodeURIComponent(columnName)}`);
