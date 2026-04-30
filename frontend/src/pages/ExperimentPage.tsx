import { useState } from "react";
import { Box } from "@mui/material";
import ExperimentList from "../components/experiments/ExperimentList";
import type { Experiment } from "../api/experiments";

export default function ExperimentPage() {
  const [refresh, setRefresh] = useState(0);

  const handleSaved = () => setRefresh((r) => r + 1);

  return (
    <Box>
      <ExperimentList
        onSelect={(_exp: Experiment) => {}}
        onAddNew={handleSaved}
        refresh={refresh}
      />
    </Box>
  );
}
