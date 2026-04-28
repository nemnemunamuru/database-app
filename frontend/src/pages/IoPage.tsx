import { useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Paper, Tab, Tabs, Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DownloadIcon from "@mui/icons-material/Download";
import MergeIcon from "@mui/icons-material/MergeType";
import api from "../api/client";

const BASE = "http://localhost:8000/api/io";

export default function IoPage() {
  const [tab, setTab] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const clearStatus = () => { setResult(null); setError(null); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, url: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); clearStatus();
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post(url, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const StatusBlock = () => (
    <>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {result && (
        <Alert severity="success" sx={{ mt: 2 }}>
          <Typography variant="body2" fontWeight="bold">{result.message ?? "Done"}</Typography>
          {result.details && (
            <Box mt={1} sx={{ maxHeight: 260, overflowY: "auto" }}>
              {Object.entries(result.details)
                .filter(([, info]: [string, any]) => info.inserted > 0 || info.skipped > 0)
                .map(([tbl, info]: [string, any]) => (
                  <Typography key={tbl} variant="body2">
                    <strong>{tbl}</strong>: +{info.inserted} inserted / {info.skipped} skipped
                    {info.error ? ` — ${info.error}` : ""}
                  </Typography>
                ))}
            </Box>
          )}
        </Alert>
      )}
    </>
  );

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Tabs value={tab} onChange={(_, v) => { setTab(v); clearStatus(); }} sx={{ mb: 3 }}>
        <Tab label="Export" icon={<DownloadIcon fontSize="small" />} iconPosition="start" />
        <Tab label="Import" icon={<UploadFileIcon fontSize="small" />} iconPosition="start" />
        <Tab label="Add" icon={<MergeIcon fontSize="small" />} iconPosition="start" />
      </Tabs>

      {/* ── Export ── */}
      {tab === 0 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Export — Download DB</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Download the current SQLite database file as a binary backup.
          </Typography>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => window.open(`${BASE}/export/db`, "_blank")}
          >
            Download DB File
          </Button>
        </Paper>
      )}

      {/* ── Import ── */}
      {tab === 1 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Import — Replace DB</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Upload a SQLite <code>.db</code> file to completely replace the current database.
            A backup (<code>.db.bak</code>) is created automatically before replacing.
          </Typography>
          <Button
            variant="outlined"
            component="label"
            startIcon={uploading ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Select DB File (.db)"}
            <input type="file" hidden accept=".db" onChange={e => handleUpload(e, "/api/io/import/db")} />
          </Button>
          <StatusBlock />
        </Paper>
      )}

      {/* ── Add / Merge ── */}
      {tab === 2 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Add — Merge DB</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Upload a SQLite <code>.db</code> file to merge it into the current database.
            Records are added table by table in dependency order. Rows whose primary key
            already exists in the current DB are skipped — no existing data is overwritten.
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            component="label"
            startIcon={uploading ? <CircularProgress size={18} color="inherit" /> : <MergeIcon />}
            disabled={uploading}
          >
            {uploading ? "Merging..." : "Select DB File to Merge (.db)"}
            <input type="file" hidden accept=".db" onChange={e => handleUpload(e, "/api/io/merge/db")} />
          </Button>
          <StatusBlock />
        </Paper>
      )}
    </Box>
  );
}