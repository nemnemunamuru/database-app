import { useEffect, useState } from "react";
import { Box, CircularProgress, Tab, Tabs, Typography } from "@mui/material";
import MermaidChart from "../components/MermaidChart";
import api from "../api/client";

interface Props {
  darkMode?: boolean;
}

export default function DocumentsPage({ darkMode }: Props) {
  const [subTab, setSubTab] = useState(0);
  const [erDiagram, setErDiagram] = useState<string | null>(null);
  const [erError, setErError] = useState(false);

  useEffect(() => {
    api.get<string>("/api/docs/er_diagram.mmd").then(r => {
      setErDiagram(r.data);
    }).catch(() => setErError(true));
  }, []);

  return (
    <Box>
      <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 1, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="ER Diagram" />
      </Tabs>

      {subTab === 0 && (
        erError ? (
          <Typography color="error">Failed to load er_diagram.mmd from docs/</Typography>
        ) : erDiagram == null ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
        ) : (
          <MermaidChart chart={erDiagram} darkMode={darkMode} />
        )
      )}
    </Box>
  );
}