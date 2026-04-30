import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Tab, Tabs, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MermaidChart from "../components/MermaidChart";
import api from "../api/client";

interface Props {
  darkMode?: boolean;
}

export default function DocumentsPage({ darkMode }: Props) {
  const [subTab, setSubTab] = useState(0);

  // ER Diagram (Live)
  const [liveChart, setLiveChart] = useState<string | null>(null);
  const [liveError, setLiveError] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);

  // User Guide markdown
  const [manualMd, setManualMd] = useState<string | null>(null);
  const [manualError, setManualError] = useState(false);

  const loadLive = () => {
    setLiveLoading(true);
    setLiveError(false);
    api.get<string>("/api/docs/er_diagram_live").then(r => {
      setLiveChart(r.data);
    }).catch(() => setLiveError(true))
      .finally(() => setLiveLoading(false));
  };

  useEffect(() => { loadLive(); }, []);

  useEffect(() => {
    if (subTab === 0 && manualMd === null && !manualError) {
      api.get<string>("/api/docs/user_manual.md").then(r => {
        setManualMd(r.data);
      }).catch(() => setManualError(true));
    }
  }, [subTab]);

  const mdComponents = {
    table: ({ children }: { children: React.ReactNode }) => (
      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16, fontSize: 13 }}>{children}</table>
    ),
    th: ({ children }: { children: React.ReactNode }) => (
      <th style={{ border: "1px solid #bbb", padding: "6px 10px", backgroundColor: "#f0f0f0", textAlign: "left", whiteSpace: "nowrap" }}>{children}</th>
    ),
    td: ({ children }: { children: React.ReactNode }) => (
      <td style={{ border: "1px solid #bbb", padding: "5px 10px", verticalAlign: "top" }}>{children}</td>
    ),
    tr: ({ children }: { children: React.ReactNode }) => <tr style={{ backgroundColor: "inherit" }}>{children}</tr>,
    pre: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      const isMermaid = className === "language-mermaid";
      const text = String(children).replace(/\n$/, "");
      if (isMermaid) {
        return <MermaidChart chart={text} darkMode={darkMode} />;
      }
      return (
        <pre style={{ backgroundColor: "#f5f5f5", padding: "12px 16px", borderRadius: 4, overflowX: "auto", fontSize: 12, lineHeight: 1.6 }}>
          <code>{children}</code>
        </pre>
      );
    },
  } as Parameters<typeof ReactMarkdown>[0]["components"];

  return (
    <Box>
      <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 1, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="User Guide" />
        <Tab label="ER Diagram" />
      </Tabs>

      {subTab === 0 && (
        <Box sx={{ maxWidth: 960, px: 2 }}>
          {manualError ? (
            <Typography color="error">Failed to load user_manual.md.</Typography>
          ) : manualMd === null ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{manualMd}</ReactMarkdown>
          )}
        </Box>
      )}

      {subTab === 1 && (
        <Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={loadLive} disabled={liveLoading}>
              Refresh
            </Button>
          </Box>
          {liveError ? (
            <Typography color="error">Failed to generate live ER diagram.</Typography>
          ) : liveLoading || liveChart === null ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
          ) : (
            <MermaidChart chart={liveChart} darkMode={darkMode} />
          )}
        </Box>
      )}
    </Box>
  );
}