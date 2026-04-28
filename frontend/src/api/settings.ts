import api from "./client";

export const settingsApi = {
  getAll: () => api.get<Record<string, string>>("/api/settings/"),
  get:    (key: string) => api.get<{ key: string; value: string | null }>(`/api/settings/${key}`),
  set:    (key: string, value: string) => api.put(`/api/settings/${key}`, { value }),
};
