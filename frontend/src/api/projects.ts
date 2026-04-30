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
}

export interface ReportFieldSection {
  section: string;
  fields: string[];
}

export interface ReportConfig {
  hidden_fields: string[];
}

export const projectsApi = {
  list: () =>
    api.get<Project[]>("/api/projects"),

  create: (name: string) =>
    api.post<Project>("/api/projects", { name }),

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

  merge: (id: string) =>
    api.post<{ message: string; details: Record<string, { inserted: number; skipped: number }> }>(
      `/api/projects/${id}/merge`,
    ),

  getExperimentDeep: (id: string, expId: string) =>
    api.get<Record<string, unknown>>(`/api/projects/${id}/experiments/${expId}/deep`),

  exportDb: (id: string) =>
    `/api/projects/${id}/export/db`,

  reportMd: (id: string) =>
    `/api/projects/${id}/report/md`,

  reportFields: (id: string) =>
    api.get<ReportFieldSection[]>(`/api/projects/${id}/report/fields`),

  getReportConfig: (id: string) =>
    api.get<ReportConfig>(`/api/projects/${id}/report/config`),

  putReportConfig: (id: string, hidden_fields: string[]) =>
    api.put<ReportConfig>(`/api/projects/${id}/report/config`, { hidden_fields }),

  importDb: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ project_id: string; name: string; created_at: string }>(
      "/api/projects/import", form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
};
