import { useState } from "react";
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

export interface ConflictItem {
  experiment_id: string;
  diffs: Record<string, { main: unknown; project: unknown }>;
}

interface Props {
  open: boolean;
  projectName: string;
  conflicts: ConflictItem[];
  newCount: number;
  onCancel: () => void;
  onConfirm: (overwriteIds: string[]) => void;
}

export default function MergeDiffDialog({
  open, projectName, conflicts, newCount, onCancel, onConfirm,
}: Props) {
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set());

  const toggleAll = () => {
    if (overwrite.size === conflicts.length) setOverwrite(new Set());
    else setOverwrite(new Set(conflicts.map(c => c.experiment_id)));
  };

  const toggle = (id: string) => {
    setOverwrite(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm([...overwrite]);
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CompareArrowsIcon color="primary" />
        Merge Preview — {projectName}
      </DialogTitle>

      <DialogContent dividers>
        {/* Summary */}
        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <Chip
            icon={<AddCircleOutlineIcon />}
            label={`New: ${newCount} records`}
            color="success"
            variant="outlined"
          />
          <Chip
            icon={<WarningAmberIcon />}
            label={`Conflicts (existing ID): ${conflicts.length}`}
            color={conflicts.length > 0 ? "warning" : "default"}
            variant="outlined"
          />
        </Box>

        {conflicts.length === 0 ? (
          <Typography color="text.secondary" fontSize={14}>
            No conflicts. Only new records will be inserted.
          </Typography>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1, gap: 1 }}>
              <WarningAmberIcon color="warning" fontSize="small" />
              <Typography fontSize={13} fontWeight={600}>
                Conflicting experiments — checked rows will overwrite the main DB
              </Typography>
            </Box>
            <Box sx={{ mb: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={overwrite.size === conflicts.length && conflicts.length > 0}
                    indeterminate={overwrite.size > 0 && overwrite.size < conflicts.length}
                    onChange={toggleAll}
                  />
                }
                label={<Typography fontSize={12}>Select all</Typography>}
              />
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {conflicts.map(conflict => (
                <Box
                  key={conflict.experiment_id}
                  sx={{
                    border: "1px solid",
                    borderColor: overwrite.has(conflict.experiment_id) ? "warning.main" : "divider",
                    borderRadius: 1,
                    overflow: "hidden",
                  }}
                >
                  {/* Conflict header */}
                  <Box sx={{
                    display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75,
                    bgcolor: overwrite.has(conflict.experiment_id) ? "warning.light" : "grey.100",
                  }}>
                    <Checkbox
                      size="small"
                      checked={overwrite.has(conflict.experiment_id)}
                      onChange={() => toggle(conflict.experiment_id)}
                    />
                    <Typography fontSize={12} fontFamily="monospace" sx={{ flexGrow: 1 }}>
                      {conflict.experiment_id}
                    </Typography>
                    <Chip
                      label={overwrite.has(conflict.experiment_id) ? "Overwrite" : "Skip"}
                      size="small"
                      color={overwrite.has(conflict.experiment_id) ? "warning" : "default"}
                      sx={{ fontSize: 10 }}
                    />
                  </Box>

                  {/* Diff table */}
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: "grey.50" }}>
                          <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 160 }}>Column</TableCell>
                          <TableCell sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary" }}>Main DB (current)</TableCell>
                          <TableCell sx={{ fontSize: 11, fontWeight: 700, color: "primary.main" }}>Project (new)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(conflict.diffs).map(([col, { main, project }]) => (
                          <TableRow key={col} sx={{ bgcolor: "rgba(255,152,0,0.04)" }}>
                            <TableCell sx={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{col}</TableCell>
                            <TableCell sx={{ fontSize: 11, fontFamily: "monospace", color: "text.secondary", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {main == null ? <em style={{ opacity: 0.5 }}>null</em> : String(main)}
                            </TableCell>
                            <TableCell sx={{ fontSize: 11, fontFamily: "monospace", color: "primary.main", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {project == null ? <em style={{ opacity: 0.5 }}>null</em> : String(project)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              ))}
            </Box>
          </>
        )}

        <Divider sx={{ my: 2 }} />
        <Typography fontSize={12} color="text.secondary">
          Unchecked conflicts will be skipped (main DB unchanged). All new records will be inserted.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          color={overwrite.size > 0 ? "warning" : "primary"}
          onClick={handleConfirm}
        >
          {overwrite.size > 0
            ? `Merge (insert ${newCount} + update ${overwrite.size})`
            : `Merge (insert ${newCount})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
