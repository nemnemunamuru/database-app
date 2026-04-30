import { useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Paper,
  Tab, Tabs, Typography,
} from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import MergeIcon from "@mui/icons-material/MergeType";
import api from "../api/client";

interface Props { isAdmin?: boolean; }
export default function IoPage({ isAdmin = false }: Props) {
  const [tab, setTab] = useState(0);
  useEffect(() => { setTab(0); }, [isAdmin]);

  // Import tab state
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Add tab state
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<any>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/api/io/import/db", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportMsg({
        text: `Imported successfully. "experiment.db" has been replaced (backup saved as experiment.db.bak).`,
        ok: true,
      });
    } catch (err: any) {
      setImportMsg({ text: err?.response?.data?.detail ?? "Import failed", ok: false });
    } finally {
      setImporting(false);
    }
  };

  const handleMerge = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setMerging(true);
    setMergeResult(null);
    setMergeError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/api/io/merge/db", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMergeResult(res.data);
    } catch (err: any) {
      setMergeError(err?.response?.data?.detail ?? "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Export" />
        {isAdmin && <Tab label="Import" />}
        <Tab label="Add" />
      </Tabs>

      {/* ── Export ── */}
      {tab === 0 && (
        <Box sx={{ maxWidth: 480 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Download the current <code>experiment.db</code> as a SQLite binary file.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<StorageIcon />}
            onClick={() => { window.open("http://localhost:8000/api/io/export/db", "_blank"); }}
          >
            Download experiment.db
          </Button>
        </Box>
      )}

      {/* ── Import ── */}
      {isAdmin && tab === 1 && (
        <Box sx={{ maxWidth: 560 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            <strong>Replace experiment.db with the selected file.</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The uploaded <code>.db</code> file will be saved as <code>db/experiment.db</code>.
            The current <code>experiment.db</code> is automatically backed up as{" "}
            <code>experiment.db.bak</code> before being replaced.
          </Typography>
          <Button
            variant="contained"
            component="label"
            startIcon={importing ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />}
            disabled={importing}
          >
            {importing ? "Importing…" : "Select .db file to import"}
            <input type="file" accept=".db" hidden onChange={handleImport} />
          </Button>
          {importMsg && (
            <Alert severity={importMsg.ok ? "success" : "error"} sx={{ mt: 2 }}>
              {importMsg.text}
            </Alert>
          )}
        </Box>
      )}

      {/* ── Add (merge) ── */}
      {tab === (isAdmin ? 2 : 1) && (
        <Box sx={{ maxWidth: 560 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            <strong>Merge records from another .db file into experiment.db.</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Records from the uploaded file will be inserted into the current{" "}
            <code>experiment.db</code>. Rows whose primary key already exists are skipped (no overwrite).
          </Typography>
          <Button
            variant="contained"
            component="label"
            startIcon={merging ? <CircularProgress size={18} color="inherit" /> : <MergeIcon />}
            disabled={merging}
          >
            {merging ? "Merging…" : "Select .db file to merge"}
            <input type="file" accept=".db" hidden onChange={handleMerge} />
          </Button>
          {mergeError && (
            <Alert severity="error" sx={{ mt: 2 }}>{mergeError}</Alert>
          )}
          {mergeResult && (
            <Paper sx={{ p: 2, mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>{mergeResult.message}</Typography>
              {mergeResult.details &&
                Object.entries(mergeResult.details).map(([table, info]: [string, any]) => (
                  <Typography key={table} variant="body2">
                    <strong>{table}</strong>: inserted {info.inserted} / skipped {info.skipped}
                  </Typography>
                ))}
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}
