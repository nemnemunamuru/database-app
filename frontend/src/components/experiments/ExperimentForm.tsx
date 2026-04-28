import { useState } from "react";
import {
  Box, Button, Divider, Grid, Paper, TextField, Typography,
} from "@mui/material";
import type { Experiment } from "../../api/experiments";
import { createExperiment, updateExperiment } from "../../api/experiments";

interface Props {
  initial?: Experiment;
  onSaved: () => void;
  onCancel: () => void;
  onSavedAndNext?: () => void;
}

const EMPTY: Partial<Experiment> = {
  galvano_system_id: "",
  welding_condition_id: "",
  experiment_material_id: "",
  shielding_condition_id: "",
  result_id: "",
  observation_id: "",
  file_id: "",
  remarks: "",
};

export default function ExperimentForm({ initial, onSaved, onCancel, onSavedAndNext }: Props) {
  const [form, setForm] = useState<Partial<Experiment>>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);

  const handleChange = (key: keyof Experiment) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value || null }));
  };

  const handleSubmit = async (andNext = false) => {
    setSaving(true);
    try {
      if (initial?.experiment_id) {
        await updateExperiment(initial.experiment_id, form);
      } else {
        await createExperiment(form);
      }
      if (andNext && onSavedAndNext) {
        onSavedAndNext();
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!initial?.experiment_id;

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" mb={2}>{isEdit ? "Edit Experiment" : "New Experiment"}</Typography>
      <Divider sx={{ mb: 2 }} />
      <Grid container spacing={2}>
        {[
          { key: "galvano_system_id", label: "galvano_system_id" },
          { key: "welding_condition_id", label: "welding_condition_id" },
          { key: "experiment_material_id", label: "experiment_material_id" },
          { key: "shielding_condition_id", label: "shielding_condition_id" },
          { key: "result_id", label: "result_id" },
          { key: "observation_id", label: "observation_id" },
          { key: "file_id", label: "file_id" },
        ].map(({ key, label }) => (
          <Grid item xs={12} sm={6} key={key}>
            <TextField
              fullWidth
              size="small"
              label={label}
              value={(form as Record<string, unknown>)[key] ?? ""}
              onChange={handleChange(key as keyof Experiment)}
              placeholder="UUID または空欄"
            />
          </Grid>
        ))}
        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label="remarks"
            multiline
            rows={3}
            value={form.remarks ?? ""}
            onChange={handleChange("remarks")}
          />
        </Grid>
      </Grid>
      <Box sx={{ display: "flex", gap: 1, mt: 3, justifyContent: "flex-end" }}>
        <Button variant="outlined" onClick={onCancel}>Cancel</Button>
        {!isEdit && onSavedAndNext && (
          <Button variant="outlined" color="secondary" onClick={() => handleSubmit(true)} disabled={saving}>
            Save &amp; Add Next
          </Button>
        )}
        <Button variant="contained" onClick={() => handleSubmit(false)} disabled={saving}>
          {isEdit ? "Update" : "Save"}
        </Button>
      </Box>
    </Paper>
  );
}
