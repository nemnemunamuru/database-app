import { useState } from "react";
import { Box, Tabs, Tab } from "@mui/material";
import ExperimentList from "../components/experiments/ExperimentList";
import ExperimentForm from "../components/experiments/ExperimentForm";
import type { Experiment } from "../api/experiments";

export default function ExperimentPage() {
  const [subTab, setSubTab] = useState(0);
  const [selected, setSelected] = useState<Experiment | null>(null);
  const [refresh, setRefresh] = useState(0);

  const handleSelect = (exp: Experiment) => {
    setSelected(exp);
    setSubTab(1); // 詳細・編集タブへ
  };

  const handleAddNew = () => {
    setSelected(null);
    setSubTab(2);
  };

  const handleSaved = () => {
    setRefresh((r) => r + 1);
    setSubTab(0);
  };

  const handleSavedAndNext = () => {
    setRefresh((r) => r + 1);
    setSelected(null);
    setSubTab(2); // 新規追加タブへ戻る
  };

  return (
    <Box>
      <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 2 }}>
        <Tab label="List" />
        <Tab label="Edit" disabled={!selected} />
        <Tab label="New" />
      </Tabs>

      {subTab === 0 && (
        <ExperimentList
          onSelect={handleSelect}
          onAddNew={handleAddNew}
          refresh={refresh}
        />
      )}
      {subTab === 1 && selected && (
        <ExperimentForm
          initial={selected}
          onSaved={handleSaved}
          onCancel={() => setSubTab(0)}
        />
      )}
      {subTab === 2 && (
        <ExperimentForm
          onSaved={handleSaved}
          onCancel={() => setSubTab(0)}
          onSavedAndNext={handleSavedAndNext}
        />
      )}
    </Box>
  );
}
