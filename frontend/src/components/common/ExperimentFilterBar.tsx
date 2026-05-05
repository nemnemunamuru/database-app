import { Box, CircularProgress, IconButton, MenuItem, Select, TextField } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import type { FilterMode, FilterState } from "../../utils/experimentFilter";
import { FILTER_DEFAULT } from "../../utils/experimentFilter";

interface Props {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  cols: { column_name: string }[];
  /** Show spinner next to the bar while detail cache is loading */
  loading?: boolean;
}

export default function ExperimentFilterBar({ filter, onChange, cols, loading }: Props) {
  const hasFilter = filter.value !== "" || filter.field !== "__all__";

  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
      <Select
        size="small"
        value={filter.field}
        onChange={(e) => onChange({ ...filter, field: e.target.value })}
        sx={{ minWidth: 130, fontSize: 12, height: 32 }}
        disabled={loading}
      >
        <MenuItem value="__all__">
          <em>All fields</em>
        </MenuItem>
        {cols.map((col) => (
          <MenuItem
            key={col.column_name}
            value={col.column_name}
            sx={{ fontSize: 12, fontFamily: "monospace" }}
          >
            {col.column_name}
          </MenuItem>
        ))}
      </Select>

      <TextField
        size="small"
        placeholder="Value…"
        value={filter.value}
        onChange={(e) => onChange({ ...filter, value: e.target.value })}
        sx={{ width: 260, "& .MuiInputBase-root": { height: 32, fontSize: 12 } }}
        disabled={loading}
      />

      <Select
        size="small"
        value={filter.mode}
        onChange={(e) => onChange({ ...filter, mode: e.target.value as FilterMode })}
        sx={{ minWidth: 120, fontSize: 12, height: 32 }}
        disabled={loading}
      >
        <MenuItem value="contains">Contains</MenuItem>
        <MenuItem value="exact">Exact match</MenuItem>
        <MenuItem value="starts">Starts with</MenuItem>
        <MenuItem value="ends">Ends with</MenuItem>
      </Select>

      {loading && <CircularProgress size={16} sx={{ ml: 0.5 }} />}

      {hasFilter && !loading && (
        <IconButton
          size="small"
          title="Clear filter"
          onClick={() => onChange(FILTER_DEFAULT)}
        >
          <ClearIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}
    </Box>
  );
}
