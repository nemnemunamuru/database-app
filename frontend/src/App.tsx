import { useEffect, useMemo, useState } from "react";
import {
  AppBar, Box, Button, CssBaseline, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Tab, Tabs, TextField, Toolbar, Tooltip, Typography,
  createTheme, ThemeProvider,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ScienceIcon from "@mui/icons-material/Science";
import UndoIcon from "@mui/icons-material/Undo";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import NewProjectPage from "./pages/NewProjectPage";
import ExperimentPage from "./pages/ExperimentPage";
import MasterPage from "./pages/MasterPage";
import IoPage from "./pages/IoPage";
import SettingsPage from "./pages/SettingsPage";
import DocumentsPage from "./pages/DocumentsPage";
import ChatbotDialog from "./components/chat/ChatbotDialog";
import { settingsApi } from "./api/settings";
import { UndoProvider, useUndo } from "./context/UndoContext";

const MAIN_TABS = ["New Project", "Experiments", "Masters", "Import / Export", "Settings", "Documents"];

function AppContent() {
  const [mainTab, setMainTab] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [role, setRole] = useState<"operator" | "administrator">("operator");
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const { canUndo, undoLabel, executeUndo } = useUndo();
  const isAdmin = role === "administrator";

  useEffect(() => {
    settingsApi.get("theme_mode").then(r => {
      if (r.data.value === "dark") setDarkMode(true);
    }).catch(() => {});
  }, []);

  const handleRoleIconClick = () => {
    if (isAdmin) {
      setRole("operator");
    } else {
      setPasswordInput("");
      setPasswordError(false);
      setShowLoginDialog(true);
    }
  };

  const handleLoginSubmit = () => {
    if (passwordInput === "admin") {
      setRole("administrator");
      setShowLoginDialog(false);
    } else {
      setPasswordError(true);
    }
  };

  const theme = useMemo(() =>
    createTheme({
      palette: {
        mode: darkMode ? "dark" : "light",
        primary: { main: isAdmin ? "#c62828" : (darkMode ? "#90caf9" : "#1976d2") },
        ...(darkMode ? {
          secondary: { main: "#ce93d8" },
          background: { default: "#121212", paper: "#1e1e1e" },
        } : {}),
      },
    }),
  [darkMode, isAdmin]);

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
            <Tooltip title="AI Database Assistant">
              <IconButton color="inherit" onClick={() => setShowChatbot(true)} sx={{ ml: 0.5 }}>
                <SmartToyIcon />
              </IconButton>
            </Tooltip>
            {canUndo && (
              <Button
                color="error"
                size="small"
                variant="contained"
                startIcon={<UndoIcon />}
                onClick={executeUndo}
                sx={{ mr: 1 }}
              >
                Undo: {undoLabel}
              </Button>
            )}
            <IconButton
              color="inherit"
              onClick={handleRoleIconClick}
              sx={{ ml: 0.5 }}
              title={isAdmin ? "Administrator — click to switch to Operator" : "Operator — click to switch to Administrator"}
            >
              {isAdmin ? <AdminPanelSettingsIcon /> : <AccountCircleIcon />}
            </IconButton>
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
          {mainTab === 0 && <NewProjectPage />}
          {mainTab === 1 && <ExperimentPage />}
          {mainTab === 2 && <MasterPage />}
          {mainTab === 3 && <IoPage isAdmin={isAdmin} />}
          {mainTab === 4 && <SettingsPage darkMode={darkMode} onToggleDark={handleToggleDark} isAdmin={isAdmin} />}
          {mainTab === 5 && <DocumentsPage darkMode={darkMode} />}
        </Box>
        <Dialog open={showLoginDialog} onClose={() => setShowLoginDialog(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Administrator Login</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Password"
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={e => { if (e.key === "Enter") handleLoginSubmit(); }}
              error={passwordError}
              helperText={passwordError ? "Incorrect password" : ""}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowLoginDialog(false)}>Cancel</Button>
            <Button onClick={handleLoginSubmit} variant="contained">Login</Button>
          </DialogActions>
        </Dialog>
        <ChatbotDialog open={showChatbot} onClose={() => setShowChatbot(false)} />
      </Box>
    </ThemeProvider>
  );
}

function App() {
  return (
    <UndoProvider>
      <AppContent />
    </UndoProvider>
  );
}

export default App;
