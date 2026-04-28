import { useEffect, useMemo, useState } from "react";
import {
  AppBar, Box, CssBaseline, Tab, Tabs, Toolbar, Typography,
  createTheme, ThemeProvider,
} from "@mui/material";
import ScienceIcon from "@mui/icons-material/Science";
import ExperimentPage from "./pages/ExperimentPage";
import MasterPage from "./pages/MasterPage";
import IoPage from "./pages/IoPage";
import SettingsPage from "./pages/SettingsPage";
import DocumentsPage from "./pages/DocumentsPage";
import { settingsApi } from "./api/settings";

const MAIN_TABS = ["Experiments", "Masters", "Import / Export", "Settings", "Documents"];

function App() {
  const [mainTab, setMainTab] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  // Load theme preference from DB on mount
  useEffect(() => {
    settingsApi.get("theme_mode").then(r => {
      if (r.data.value === "dark") setDarkMode(true);
    }).catch(() => {});
  }, []);

  const theme = useMemo(() =>
    createTheme({
      palette: {
        mode: darkMode ? "dark" : "light",
        ...(darkMode ? {
          primary:   { main: "#90caf9" },
          secondary: { main: "#ce93d8" },
          background: { default: "#121212", paper: "#1e1e1e" },
        } : {}),
      },
    }),
  [darkMode]);

  const handleToggleDark = (val: boolean) => {
    setDarkMode(val);
    settingsApi.set("theme_mode", val ? "dark" : "light").catch(() => {});
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "background.default" }}>
        <CssBaseline />
        <AppBar position="static" color="primary">
          <Toolbar>
            <ScienceIcon sx={{ mr: 1 }} />
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Laser Experiment Database
            </Typography>
          </Toolbar>
          <Tabs
            value={mainTab}
            onChange={(_, v) => setMainTab(v)}
            textColor="inherit"
            indicatorColor="secondary"
            sx={{ px: 2 }}
          >
            {MAIN_TABS.map((label) => (
              <Tab key={label} label={label} />
            ))}
          </Tabs>
        </AppBar>
        <Box sx={{ px: 2, py: 1.5, flexGrow: 1, width: "100%", color: "text.primary" }}>
          {mainTab === 0 && <ExperimentPage />}
          {mainTab === 1 && <MasterPage />}
          {mainTab === 2 && <IoPage />}
          {mainTab === 3 && <SettingsPage darkMode={darkMode} onToggleDark={handleToggleDark} />}
          {mainTab === 4 && <DocumentsPage darkMode={darkMode} />}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
