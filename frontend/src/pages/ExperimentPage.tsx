import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import ExperimentList from "../components/experiments/ExperimentList";
import AnalysisTab from "../components/experiments/AnalysisTab";
import ExpDeepEditDialog from "../components/projects/ExpDeepEditDialog";
import type { Experiment } from "../api/experiments";
import type { ProjectExperiment } from "../api/projects";

export default function ExperimentPage() {
  const [subTab, setSubTab] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingExp, setEditingExp] = useState<Experiment | null>(null);

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
        <>
          <ExperimentList
            onSelect={(exp: Experiment) => { setEditingExp(exp); setShowForm(true); }}
            onAddNew={() => { setEditingExp(null); setShowForm(true); }}
            refresh={refresh}
          />
          <ExpDeepEditDialog
            open={showForm}
            initial={(editingExp ?? {}) as Partial<ProjectExperiment>}
            title={editingExp ? "Edit Experiment" : "New Experiment"}
            saving={false}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); setRefresh((r) => r + 1); }}
          />
        </>
      )}

      {subTab === 1 && <AnalysisTab />}
    </Box>
  );
}
