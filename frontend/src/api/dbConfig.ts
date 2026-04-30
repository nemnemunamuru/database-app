import api from "./client";

export interface DbInfo {
  db_name: string;
  is_master: boolean;
  master_db: string;
  available: string[];
}

export const dbConfigApi = {
  info: () => api.get<DbInfo>("/api/db/info"),
  switch: (db_name: string) =>
    api.post<{ db_name: string; is_master: boolean }>("/api/db/switch", { db_name }),
  open: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ db_name: string; is_master: boolean }>("/api/db/open", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
