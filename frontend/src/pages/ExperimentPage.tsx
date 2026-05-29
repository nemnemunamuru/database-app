import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import ExperimentList from "../components/experiments/ExperimentList";
import AnalysisTab from "../components/experiments/AnalysisTab";
import type { Experiment } from "../api/experiments";

export default function ExperimentPage() {
  const [refresh, setRefresh] = useState(0);
  const [subTab, setSubTab] = useState(0);

  const handleSaved = () => setRefresh((r) => r + 1);

  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={(_, v) => setSubTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 1, minHeight: 36 }}
        slotProps={{ indicator: { style: { height: 2 } } }}
      >
        <Tab label="Experiment List" sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
        <Tab label="Analysis" sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
      </Tabs>

      {subTab === 0 && (
        <ExperimentList
          onSelect={(_exp: Experiment) => {}}
          onAddNew={handleSaved}
          refresh={refresh}
        />
      )}
      {subTab === 1 && (
        <AnalysisTab
          projectId={undefined}
          triggerBatchReport={false}
          onBatchReportDone={() => {}}
        />
      )}
    </Box>
  );
}
