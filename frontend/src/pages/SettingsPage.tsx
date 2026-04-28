import { useState } from "react";
import {
  Box, Button, FormControlLabel, Paper, Switch,
  Tab, Tabs, Typography,
} from "@mui/material";
import SchemaIcon from "@mui/icons-material/Schema";
import PaletteIcon from "@mui/icons-material/Palette";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { EntityCrud } from "../components/masters/EntityCrud";
import type { FieldDef } from "../components/masters/EntityCrud";
import { columnDefsApi, initColumnDefs } from "../api/masters";

interface Props {
  darkMode: boolean;
  onToggleDark: (val: boolean) => void;
}

const COLUMN_DEF_FIELDS: FieldDef[] = [
  { key: "table_name",  label: "table_name",  type: "text" },
  { key: "column_name", label: "column_name", type: "text" },
  { key: "data_type",   label: "data_type",   type: "text" },
  { key: "unit",        label: "unit",        type: "text" },
  { key: "is_id",       label: "is_id",       type: "text" },
  { key: "candidates",  label: "candidates",  type: "text" },
];

export default function SettingsPage({ darkMode, onToggleDark }: Props) {
  const [tab, setTab] = useState(0);
  const [schemaKey, setSchemaKey] = useState(0);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Columns" icon={<SchemaIcon fontSize="small" />} iconPosition="start" />
        <Tab label="Color"   icon={<PaletteIcon fontSize="small" />} iconPosition="start" />
      </Tabs>

      {/* ── Columns ── */}
      {tab === 0 && (
        <Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={async () => {
                const result = await initColumnDefs();
                alert(`Initialized ${result.created} column definitions`);
                setSchemaKey(k => k + 1);
              }}
            >
              Initialize from Models
            </Button>
          </Box>
          <EntityCrud
            key={schemaKey}
            title=""
            fields={COLUMN_DEF_FIELDS}
            pkField="column_def_id"
            api={columnDefsApi}
          />
        </Box>
      )}

      {/* ── Color / Theme ── */}
      {tab === 1 && (
        <Box sx={{ maxWidth: 480 }}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Theme Mode
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2.5}>
              Switch between Light and Dark appearance. The preference is saved to the database and restored on next launch.
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <LightModeIcon sx={{ color: darkMode ? "text.disabled" : "warning.main" }} />
              <FormControlLabel
                control={
                  <Switch
                    checked={darkMode}
                    onChange={(_, checked) => onToggleDark(checked)}
                    color="default"
                    sx={{
                      "& .MuiSwitch-thumb": {
                        bgcolor: darkMode ? "#90caf9" : "#fdd835",
                      },
                      "& .MuiSwitch-track": {
                        bgcolor: darkMode ? "#37474f" : "#b0bec5",
                      },
                    }}
                  />
                }
                label=""
              />
              <DarkModeIcon sx={{ color: darkMode ? "primary.main" : "text.disabled" }} />
              <Typography variant="body1" fontWeight={600} ml={1}>
                {darkMode ? "Dark Mode" : "Light Mode"}
              </Typography>
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
}