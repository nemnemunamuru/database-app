import { useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import {
  Box, Chip, FormControl, IconButton, keyframes,
  ListSubheader, MenuItem, Paper, Select, TextField, Tooltip, Typography,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import StorageIcon from "@mui/icons-material/Storage";
import api from "../../api/client";

// --- design tokens ---
const BG       = "#0d1117";
const BG2      = "#161b27";
const CYAN     = "#00d4ff";
const CYAN_DIM = "rgba(0,212,255,0.15)";
const BORDER   = "rgba(0,212,255,0.25)";
const TEXT     = "#c9d1d9";
const TEXT_DIM = "#58a6aa";

const pulse = keyframes`
  0%,100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(1.15); }
`;
const dot = keyframes`
  0%,80%,100% { transform: scale(0); opacity: 0; }
  40%         { transform: scale(1); opacity: 1; }
`;
const scanline = keyframes`
  0%   { backgroundPosition: "0 0"; }
  100% { backgroundPosition: "0 100%"; }
`;

function TypingDots() {
  return (
    <Box sx={{ display: "flex", gap: 0.6, alignItems: "center", height: 20 }}>
      {[0, 1, 2].map(i => (
        <Box key={i} sx={{
          width: 6, height: 6, borderRadius: "50%",
          bgcolor: CYAN,
          animation: `${dot} 1.4s ease-in-out ${i * 0.16}s infinite`,
        }} />
      ))}
    </Box>
  );
}

interface DbOption {
  id: string;
  label: string;
  group: "EXPERIMENT" | "PROJECT";
}

interface Message {
  role: "user" | "assistant";
  text: string;
  experimentCount?: number | null;
  experimentIds?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ChatbotDialog({ open, onClose }: Props) {
  const [databases, setDatabases] = useState<DbOption[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.get<{ databases: DbOption[]; default: string }>("/api/chat/databases")
      .then(r => {
        setDatabases(r.data.databases);
        if (!selectedDb && r.data.default) setSelectedDb(r.data.default);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await api.post<{
        db_label: string;
        experiment_count: number | null;
        experiment_ids: string[];
        message: string;
      }>("/api/chat/query", { question: q, db: selectedDb });
      setMessages(prev => [...prev, {
        role: "assistant",
        text: res.data.message,
        experimentCount: res.data.experiment_count,
        experimentIds: res.data.experiment_ids,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        text: "An error occurred. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const experimentDbs = databases.filter(d => d.group === "EXPERIMENT");
  const projectDbs = databases.filter(d => d.group === "PROJECT");
  const nodeRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  return (
    <Draggable nodeRef={nodeRef as React.RefObject<HTMLElement>} handle=".drag-handle" bounds="body">
      <Paper
        ref={nodeRef}
        elevation={0}
        sx={{
          position: "fixed",
          bottom: 80, right: 24,
          width: 420, height: 540,
          display: "flex", flexDirection: "column",
          zIndex: 1300,
          borderRadius: "12px",
          overflow: "hidden",
          resize: "both",
          bgcolor: BG,
          border: `1px solid ${BORDER}`,
          boxShadow: `0 0 32px rgba(0,212,255,0.12), 0 8px 40px rgba(0,0,0,0.7)`,
        }}
      >
      {/* Header */}
      <Box
        className="drag-handle"
        sx={{
          display: "flex", alignItems: "center", gap: 1.5,
          px: 2, py: 1.25, flexShrink: 0,
          background: `linear-gradient(90deg, #0f0c29 0%, #1a1a3e 50%, #0d1117 100%)`,
          borderBottom: `1px solid ${BORDER}`,
          cursor: "move", userSelect: "none",
        }}
      >
        <Box sx={{ animation: `${pulse} 2.5s ease-in-out infinite`, display: "flex" }}>
          <SmartToyIcon sx={{ fontSize: 20, color: CYAN }} />
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: CYAN, letterSpacing: 1.5, fontFamily: "monospace" }}>
            AI DATABASE ASSISTANT
          </Typography>
          <Typography sx={{ fontSize: 9, color: TEXT_DIM, letterSpacing: 2, fontFamily: "monospace" }}>
            NEURAL QUERY ENGINE v0.1
          </Typography>
        </Box>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose}
            sx={{ color: TEXT_DIM, "&:hover": { color: CYAN, bgcolor: CYAN_DIM } }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* DB selector */}
      <Box sx={{
        px: 2, py: 0.75, flexShrink: 0,
        bgcolor: BG2,
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", gap: 1,
      }}>
        <StorageIcon sx={{ fontSize: 14, color: TEXT_DIM }} />
        <Typography sx={{ fontSize: 10, color: TEXT_DIM, fontFamily: "monospace", mr: 0.5, letterSpacing: 1 }}>TARGET DB</Typography>
        <FormControl size="small" sx={{ flexGrow: 1 }}>
          <Select
            value={selectedDb}
            onChange={e => setSelectedDb(e.target.value)}
            displayEmpty
            variant="outlined"
            sx={{
              fontSize: 11, fontFamily: "monospace", color: CYAN,
              height: 28,
              "& .MuiOutlinedInput-notchedOutline": { borderColor: BORDER },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: CYAN },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: CYAN },
              "& .MuiSvgIcon-root": { color: TEXT_DIM },
              bgcolor: "rgba(0,212,255,0.04)",
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  bgcolor: BG2, border: `1px solid ${BORDER}`,
                  "& .MuiMenuItem-root": { fontSize: 12, fontFamily: "monospace", color: TEXT },
                  "& .MuiMenuItem-root:hover": { bgcolor: CYAN_DIM, color: CYAN },
                  "& .MuiListSubheader-root": { bgcolor: BG, color: TEXT_DIM, fontSize: 10, letterSpacing: 2, lineHeight: "26px" },
                },
              },
            }}
          >
            {experimentDbs.length > 0 && (
              <ListSubheader>EXPERIMENT</ListSubheader>
            )}
            {experimentDbs.map(db => (
              <MenuItem key={db.id} value={db.id}>{db.label}</MenuItem>
            ))}
            {projectDbs.length > 0 && (
              <ListSubheader>PROJECT</ListSubheader>
            )}
            {projectDbs.map(db => (
              <MenuItem key={db.id} value={db.id}>{db.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Message list */}
      <Box sx={{
        flexGrow: 1, overflowY: "auto", px: 2, py: 1.5,
        display: "flex", flexDirection: "column", gap: 1.5,
        bgcolor: BG,
        "&::-webkit-scrollbar": { width: 4 },
        "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
        "&::-webkit-scrollbar-thumb": { bgcolor: BORDER, borderRadius: 2 },
      }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: "center", mt: 5 }}>
            <Box sx={{ animation: `${pulse} 3s ease-in-out infinite`, display: "inline-block", mb: 1.5 }}>
              <SmartToyIcon sx={{ fontSize: 52, color: BORDER }} />
            </Box>
            <Typography sx={{ color: TEXT_DIM, fontSize: 12, letterSpacing: 1, fontFamily: "monospace" }}>
              SELECT DATABASE TO BEGIN
            </Typography>
            <Typography sx={{ color: "rgba(88,166,170,0.5)", fontSize: 10, mt: 0.75, fontFamily: "monospace", lineHeight: 1.7 }}>
              EXPERIMENT: Query experiments from shared DB<br />
              PROJECT: Retrieve, edit, and add project experiments
            </Typography>
          </Box>
        )}
        {messages.map((msg, i) => (
          <Box key={i} sx={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "user" ? (
              <Box sx={{
                px: 1.5, py: 0.75, maxWidth: "80%",
                bgcolor: "rgba(0,212,255,0.12)",
                border: `1px solid ${BORDER}`,
                borderRadius: "12px 12px 2px 12px",
              }}>
                <Typography sx={{ fontSize: 13, color: TEXT, whiteSpace: "pre-wrap" }}>{msg.text}</Typography>
              </Box>
            ) : (
              <Box sx={{ maxWidth: "88%", display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
                  <SmartToyIcon sx={{ fontSize: 11, color: CYAN }} />
                  <Typography sx={{ fontSize: 9, color: TEXT_DIM, fontFamily: "monospace", letterSpacing: 1 }}>AI</Typography>
                </Box>
                <Box sx={{
                  px: 1.5, py: 0.75,
                  bgcolor: BG2,
                  border: `1px solid ${BORDER}`,
                  borderRadius: "2px 12px 12px 12px",
                }}>
                  <Typography sx={{ fontSize: 13, color: TEXT, whiteSpace: "pre-wrap" }}>{msg.text}</Typography>
                  {msg.experimentIds && msg.experimentIds.length > 0 && (
                    <Box sx={{ mt: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {msg.experimentIds.map(id => (
                        <Chip
                          key={id}
                          label={id.slice(0, 8)}
                          size="small"
                          title={id}
                          sx={{
                            fontSize: 9, height: 16, fontFamily: "monospace",
                            bgcolor: "rgba(0,212,255,0.08)",
                            color: CYAN,
                            border: `1px solid ${BORDER}`,
                            "& .MuiChip-label": { px: 0.75 },
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        ))}
        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <SmartToyIcon sx={{ fontSize: 11, color: CYAN }} />
            <Box sx={{
              px: 1.5, py: 0.75,
              bgcolor: BG2, border: `1px solid ${BORDER}`,
              borderRadius: "2px 12px 12px 12px",
            }}>
              <TypingDots />
            </Box>
          </Box>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Input area */}
      <Box sx={{
        px: 2, py: 1.25, flexShrink: 0,
        display: "flex", gap: 1, alignItems: "flex-end",
        bgcolor: BG2,
        borderTop: `1px solid ${BORDER}`,
      }}>
        <TextField
          fullWidth multiline maxRows={4} size="small"
          placeholder="Enter query… (Enter to send)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          disabled={loading || !selectedDb}
          sx={{
            "& .MuiOutlinedInput-root": {
              fontSize: 13, color: TEXT, fontFamily: "monospace",
              bgcolor: "rgba(0,0,0,0.3)",
              "& fieldset": { borderColor: BORDER },
              "&:hover fieldset": { borderColor: CYAN },
              "&.Mui-focused fieldset": { borderColor: CYAN, boxShadow: `0 0 8px rgba(0,212,255,0.2)` },
            },
            "& .MuiOutlinedInput-input::placeholder": { color: TEXT_DIM, opacity: 1 },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={loading || !input.trim() || !selectedDb}
          sx={{
            flexShrink: 0,
            color: CYAN,
            bgcolor: CYAN_DIM,
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            "&:hover": { bgcolor: "rgba(0,212,255,0.25)", boxShadow: `0 0 12px rgba(0,212,255,0.3)` },
            "&.Mui-disabled": { color: TEXT_DIM, bgcolor: "transparent", borderColor: "transparent" },
          }}
        >
          <SendIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Paper>
    </Draggable>
  );
}
