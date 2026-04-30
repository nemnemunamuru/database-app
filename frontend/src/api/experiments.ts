import api from "./client";

export interface Experiment {
  experiment_id: string;
  galvano_system_id: string | null;
  welding_condition_id: string | null;
  experiment_material_id: string | null;
  shielding_condition_id: string | null;
  result_id: string | null;
  observation_id: string | null;
  file_id: string | null;
  project_id: string | null;
  project_name: string | null;
  remarks: string | null;
  [key: string]: unknown;  // custom columns
}

export interface ExperimentDetail extends Experiment {
  galvano_system: {
    galvano_type?: string; serial_number?: string;
    main_diameter_um?: number; sub_diameter_um?: number; oct_diameter_um?: number; remarks?: string;
    ftheta?: { manufacturer?: string; model_name?: string; ftheta_focal_mm?: number } | null;
    optics?: Array<{
      optics_role?: string; collimator_focal_mm?: number; serial_number?: string; manufacturer?: string;
      doe?: { manufacturer?: string; model_name?: string; profile_shape?: string; serial_number?: string; remarks?: string } | null;
      laser_device?: {
        manufacturer?: string; model_name?: string; beam_structure?: string; serial_number?: string; remarks?: string;
        laser_beams?: Array<{
          beam_type?: string; wavelength_nm?: number; numerical_aperture?: number; m2_value?: number;
          bpp_mm_mrad?: number; core_diameter_um?: number;
          ring_inner_diameter_um?: number; ring_outer_diameter_um?: number;
        }>;
      } | null;
    }> | null;
  } | null;
  welding_condition: {
    main_power_w?: number; sub_power_w?: number; welding_speed_mm_s?: number;
    main_focus_offset_mm?: number; sub_focus_offset_mm?: number; remarks?: string;
    trajectory_set?: {
      trajectory_csv_path?: string; remarks?: string;
      main_trajectory?: {
        main_trajectory_type?: string; remarks?: string;
        line_parameter?: { length_mm?: number; remarks?: string } | null;
      } | null;
      sub_trajectory?: {
        sub_trajectory_type?: string; remarks?: string;
        wobbling_parameter?: {
          wobble_radius_mm?: number; wobble_frequency_hz?: number;
          circumferential_speed?: number; remarks?: string;
        } | null;
      } | null;
    } | null;
  } | null;
  experiment_material: {
    material_role?: string; remarks?: string;
    material_state?: {
      thickness_mm?: number; width_mm?: number; length_mm?: number; surface_condition?: string; remarks?: string;
      material?: {
        material_name?: string; material_class?: string; density_kg_m3?: number;
        thermal_conductivity_w_mk?: number; reflectivity_1070nm?: number; remarks?: string;
      } | null;
    } | null;
  } | null;
  shielding_condition: {
    gas_type?: string; gas_purity_percent?: number; gas_flow_l_min?: number; gas_pressure_kpa?: number;
    nozzle_type?: string; nozzle_diameter_mm?: number; nozzle_distance_mm?: number; nozzle_angle_deg?: number; remarks?: string;
  } | null;
  result: {
    result_id?: string; oct_depth_mm?: number; cross_section_depth_mm?: number;
    oct_surface_csv_path?: string; oct_depth_csv_path?: string; oct_result_csv_path?: string;
    spatter_flag?: boolean; spatter_severity?: number;
    gap_opening_flag?: boolean; crack_flag?: boolean; crack_severity?: number;
    glass_contamination?: boolean; surface_contamination?: boolean; penetration_flag?: boolean; remarks?: string;
  } | null;
  observation: {
    observation_id?: string; observer_name?: string; observation_datetime?: string; comment?: string; remarks?: string;
  } | null;
  file: {
    remarks?: string;
  } | null;
}

export interface ExperimentListResponse {
  total: number;
  items: Experiment[];
}

export const fetchExperiments = (params?: { skip?: number; limit?: number; remarks?: string; project_id?: string }) =>
  api.get<ExperimentListResponse>("/api/experiments/", { params });

export const fetchExperimentProjects = () =>
  api.get<{ project_id: string; project_name: string }[]>("/api/experiments/projects");

export const fetchExperiment = (id: string) =>
  api.get<Experiment>(`/api/experiments/${id}`);

export const fetchExperimentDetail = (id: string) =>
  api.get<ExperimentDetail>(`/api/experiments/${id}/detail`);

export const createExperiment = (data: Partial<Experiment>) =>
  api.post<Experiment>("/api/experiments/", data);

export const updateExperiment = (id: string, data: Partial<Experiment>) =>
  api.put<Experiment>(`/api/experiments/${id}`, data);

export const deleteExperiment = (id: string) =>
  api.delete(`/api/experiments/${id}`);

export const cloneExperiment = (id: string) =>
  api.post<Experiment>(`/api/experiments/${id}/clone`);

export const exportExperimentsCsv = () =>
  api.get("/api/io/export/experiments/csv", { responseType: "blob" });
