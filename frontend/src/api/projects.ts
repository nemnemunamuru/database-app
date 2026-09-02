import api from "./client";

export interface Project {
  project_id: string;
  name: string;
  created_at: string;
  experiment_count: number;
}

export interface ProjectExperiment {
  experiment_id: string;
  galvano_system_id: string | null;
  welding_condition_id: string | null;
  experiment_material_id: string | null;
  shielding_condition_id: string | null;
  result_id: string | null;
  observation_id: string | null;
  file_id: string | null;
  project_id: string | null;
  remarks: string | null;
  created_datetime: string | null;
  updated_datetime: string | null;
}

export interface ReportFieldSection {
  section: string;
  fields: string[];
}

export interface ReportConfig {
  hidden_fields: string[];
  layout_mode: "sectioned" | "combined_by_experiment";
  chart_columns: number;
  chart_width: number;
}

export const projectsApi = {
  list: () =>
    api.get<Project[]>("/api/projects"),

  create: (name: string, projectId?: string) =>
    api.post<Project>("/api/projects", { name, project_id: projectId }),

  rename: (id: string, name: string) =>
    api.put<{ project_id: string; name: string }>(`/api/projects/${id}`, { name }),

  delete: (id: string) =>
    api.delete(`/api/projects/${id}`),

  listExperiments: (id: string) =>
    api.get<ProjectExperiment[]>(`/api/projects/${id}/experiments`),

  createExperiment: (id: string, data: Partial<ProjectExperiment>) =>
    api.post<ProjectExperiment>(`/api/projects/${id}/experiments`, data),

  updateExperiment: (id: string, expId: string, data: Partial<ProjectExperiment>) =>
    api.put<ProjectExperiment>(`/api/projects/${id}/experiments/${expId}`, data),

  deleteExperiment: (id: string, expId: string) =>
    api.delete(`/api/projects/${id}/experiments/${expId}`),

  mergePreview: (id: string) =>
    api.get<{ conflicts: { experiment_id: string; diffs: Record<string, { main: unknown; project: unknown }> }[]; new_count: number }>(
      `/api/projects/${id}/merge/preview`,
    ),

  merge: (id: string, overwriteIds: string[] = []) =>
    api.post<{ message: string; details: Record<string, { inserted: number; skipped: number; updated: number }> }>(
      `/api/projects/${id}/merge`,
      { overwrite_ids: overwriteIds },
    ),

  getExperimentDeep: (id: string, expId: string) =>
    api.get<Record<string, unknown>>(`/api/projects/${id}/experiments/${expId}/deep`),

  exportDb: (id: string) =>
    `/api/projects/${id}/export/db`,

  exportCsv: (id: string) =>
    `/api/projects/${id}/export/csv`,

  reportMd: (id: string) =>
    `/api/projects/${id}/report/md`,

  reportFields: (id: string) =>
    api.get<ReportFieldSection[]>(`/api/projects/${id}/report/fields`),

  getReportConfig: (id: string) =>
    api.get<ReportConfig>(`/api/projects/${id}/report/config`),

  putReportConfig: (id: string, config: ReportConfig) =>
    api.put<ReportConfig>(`/api/projects/${id}/report/config`, config),

  importDb: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ project_id: string; name: string; created_at: string }>(
      "/api/projects/import", form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },

  getSetting: (projectId: string, key: string) =>
    api.get<{ key: string; value: string | null }>(`/api/projects/${projectId}/settings/${key}`),

  setSetting: (projectId: string, key: string, value: string) =>
    api.put(`/api/projects/${projectId}/settings/${key}`, { value }),

  writeResult: (projectId: string, expId: string, fields: Record<string, number>) =>
    api.post<{ result_id: string } & Record<string, number>>(
      `/api/projects/${projectId}/experiments/${expId}/write-result`, fields
    ),
};
