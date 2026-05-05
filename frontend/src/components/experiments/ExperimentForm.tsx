import { useState } from "react";
import {
  Box, Button, Divider, Grid, Paper, TextField, Typography,
} from "@mui/material";
import type { Experiment } from "../../api/experiments";
import { createExperiment, updateExperiment } from "../../api/experiments";
import IdSelectField from "../common/IdSelectField";

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
  project_id: "",
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
          "galvano_system_id",
          "welding_condition_id",
          "experiment_material_id",
          "shielding_condition_id",
          "result_id",
          "observation_id",
          "file_id",
          "project_id",
        ].map((key) => (
          <Grid size={{ xs: 12, sm: 6 }} key={key}>
            <IdSelectField
              fieldName={key}
              value={(form as Record<string, unknown>)[key] as string | null ?? null}
              onChange={(v) => setForm((prev) => ({ ...prev, [key]: v }))}
            />
          </Grid>
        ))}
        <Grid size={12}>
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
