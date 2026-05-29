import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  Box, Button, Checkbox, Chip, CircularProgress, Collapse,
  Divider, FormControl, FormControlLabel, IconButton, InputLabel,
  Menu, MenuItem, Paper, Select, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import TuneIcon from "@mui/icons-material/Tune";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceArea,
  ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";

import type { Experiment } from "../../api/experiments";
import { fetchExperimentDetail, fetchExperiments, getLogFile } from "../../api/experiments";
import { projectsApi } from "../../api/projects";
import type { ProjectExperiment, Project } from "../../api/projects";
import { columnDefsApi } from "../../api/masters";
import { settingsApi } from "../../api/settings";
import ExperimentFilterBar from "../common/ExperimentFilterBar";
import { type FilterState, FILTER_DEFAULT, matchDeep } from "../../utils/experimentFilter";

// ── Types ──────────────────────────────────────────────────────────────────────
type SeriesType    = "line" | "scatter";
type ChartMode     = "2d" | "3d" | "dist";
type MarkerShape2D = "circle" | "square" | "triangle" | "diamond";

interface SeriesStyle {
  color: string;
  strokeWidth: number;
  dashArray: string;
  markerShape2d: MarkerShape2D;
  markerShape3d: string;
  markerSize: number;
  useColormap: boolean;
  colormapName: string;
  colormapCol: string;
  colormapMin: string;
  colormapMax: string;
}

interface PfSeriesConfig {
  id: string;
  yCol: string;
  label: string;
  color: string;
  strokeWidth: number;
  dashArray: string;
  hidden?: boolean;
}

interface AvgRangeConfig {
  id: string;
  xMin: string;
  xMax: string;
  yCols: string[]; // empty = use all effectiveY
  label: string;
}

interface DisplayItem {
  id: string;
  title: string;
  pathCol: string;
  xCol: string;
  yCols: string[];
  // zCol: 2D mode = color col (Z), 3D mode = depth axis
  zCol: string;
  chartMode: ChartMode;
  downsample: number;
  seriesTypes: Record<string, SeriesType>;
  seriesStyles: Record<string, SeriesStyle>;
  chartBgColor: string;
  expanded: boolean;
  editing: boolean;
  xLabel: string; yLabel: string;
  xMin: string;   xMax: string;
  yMin: string;   yMax: string;
  chartContext: string; // "main" or project_id
  showLegend: boolean;
  visible: boolean;
  // X-range averages (multiple)
  avgRanges: AvgRangeConfig[];
  // Rolling percentile filter
  pfEnabled: boolean;
  pfWindowN: string;
  pfPercent: string;
  pfSeries: PfSeriesConfig[];
  // Per-Y visibility
  hiddenYCols: string[];
  // Unified series render order (yCols names + pfSeries IDs, mixed)
  seriesOrder?: string[];
  // Distribution (heatmap) mode range + step
  distXMin: string; distXMax: string;
  distYMin: string; distYMax: string;
  distXStep: string;
  distYStep: string;
  // Distribution colormap range
  distCmapMin: string; distCmapMax: string;
}

interface ExpEntry {
  experiment_id: string;
  remarks: string | null;
  source: "main" | string;
  projectName?: string;
}

type DataCache    = Record<string, Record<string, number>[]>;
type HeadersCache = Record<string, string[]>;

// ── Constants ──────────────────────────────────────────────────────────────────
const META_KEY = "analysis_v5_meta";
const projKey = (pk: string) => `analysis_v5_proj_${pk}`;
const CHART_HEIGHT = 600;

const PALETTE = [
  "#1976d2", "#e53935", "#43a047", "#fb8c00", "#8e24aa",
  "#00acc1", "#6d4c41", "#f06292", "#aed581", "#546e7a",
];

const DASH_OPTIONS = [
  { label: "\u2501\u2501\u2501", value: "",    title: "Solid" },
  { label: "\u254c\u254c\u254c", value: "6 3", title: "Dashed" },
  { label: "\u00b7\u00b7\u00b7", value: "2 3", title: "Dotted" },
];

const MARKER_SHAPES_2D: { value: MarkerShape2D; label: string }[] = [
  { value: "circle",   label: "\u25cf" },
  { value: "square",   label: "\u25a0" },
  { value: "triangle", label: "\u25b2" },
  { value: "diamond",  label: "\u25c6" },
];

const MARKER_SHAPES_3D = [
  { value: "circle",  label: "\u25cf" },
  { value: "square",  label: "\u25a0" },
  { value: "diamond", label: "\u25c6" },
  { value: "cross",   label: "+" },
  { value: "x",       label: "\u00d7" },
];

const PLOTLY_COLORSCALE: Record<string, string> = {
  viridis: "Viridis", plasma: "Plasma", jet: "Jet",
  hot: "Hot", cool: "Picnic", gray: "Greys",
  cividis: "Cividis", turbo: "Turbo", rainbow: "Rainbow",
};
const COLORMAP_OPTIONS = Object.keys(PLOTLY_COLORSCALE);

type CStop = [number, number, number, number];
const COLORMAP_STOPS: Record<string, CStop[]> = {
  viridis: [[0.00,68,1,84],[0.25,59,82,139],[0.50,33,145,140],[0.75,94,201,98],[1.00,253,231,37]],
  plasma:  [[0.00,13,8,135],[0.25,126,3,167],[0.50,204,71,120],[0.75,248,149,64],[1.00,240,249,33]],
  jet:     [[0.000,0,0,128],[0.125,0,0,255],[0.375,0,255,255],[0.625,255,255,0],[0.875,255,0,0],[1.000,128,0,0]],
  hot:     [[0.000,0,0,0],[0.333,255,0,0],[0.667,255,255,0],[1.000,255,255,255]],
  cool:    [[0.0,0,255,255],[1.0,255,0,255]],
  gray:    [[0.0,0,0,0],[1.0,255,255,255]],
  cividis: [[0.00,0,34,78],[0.25,62,95,119],[0.50,124,154,107],[0.75,196,208,80],[1.00,254,232,56]],
  turbo:   [[0.00,48,18,59],[0.20,70,152,228],[0.40,84,231,153],[0.60,206,236,32],[0.80,249,111,28],[1.00,122,4,3]],
  rainbow: [[0.00,128,0,128],[0.25,0,0,255],[0.50,0,255,0],[0.75,255,255,0],[1.00,255,0,0]],
};

function sampleColormap(name: string, t: number): string {
  const stops = COLORMAP_STOPS[name] ?? COLORMAP_STOPS.viridis;
  const tt = Math.max(0, Math.min(1, t));
  if (tt <= stops[0][0]) { const [,r,g,b]=stops[0]; return `rgb(${r},${g},${b})`; }
  const last = stops[stops.length-1];
  if (tt >= last[0]) { const [,r,g,b]=last; return `rgb(${r},${g},${b})`; }
  for (let i=0; i<stops.length-1; i++) {
    const [t0,r0,g0,b0]=stops[i]; const [t1,r1,g1,b1]=stops[i+1];
    if (tt>=t0 && tt<=t1) {
      const f=(tt-t0)/(t1-t0);
      return `rgb(${Math.round(r0+(r1-r0)*f)},${Math.round(g0+(g1-g0)*f)},${Math.round(b0+(b1-b0)*f)})`;
    }
  }
  return "#888";
}

function colormapGradientCss(name: string): string {
  const stops = COLORMAP_STOPS[name] ?? COLORMAP_STOPS.viridis;
  return `linear-gradient(to right, ${stops.map(([t,r,g,b])=>`rgb(${r},${g},${b}) ${(t*100).toFixed(0)}%`).join(", ")})`;
}

const DEFAULT_SERIES_STYLE: SeriesStyle = {
  color: "#1976d2", strokeWidth: 2, dashArray: "",
  markerShape2d: "circle", markerShape3d: "circle", markerSize: 6,
  useColormap: false, colormapName: "viridis", colormapCol: "",
  colormapMin: "", colormapMax: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const parsePathCol = (pc: string) => {
  const i = pc.indexOf("::");
  return i === -1 ? { table: "EXPERIMENT", col: pc } : { table: pc.slice(0,i), col: pc.slice(i+2) };
};
const basename = (p: string) => (p.split(/[/\\]/).filter(Boolean).at(-1) ?? p).trim();

function findInDetail(detail: any, col: string): string | null {
  if (!detail) return null;
  if (col in detail && detail[col] != null) return String(detail[col]);
  for (const val of Object.values(detail))
    if (val && typeof val === "object" && !Array.isArray(val))
      if (col in (val as any) && (val as any)[col] != null) return String((val as any)[col]);
  return null;
}

function resolveFilename(
  entry: ExpEntry, pathCol: string,
  mainRaw: Record<string, Experiment>, projRaw: Record<string, ProjectExperiment>,
  detailCache: Record<string, any>,
): string | null {
  const { table, col } = parsePathCol(pathCol);
  let raw: string | null = null;
  if (table === "EXPERIMENT") {
    const exp = entry.source === "main" ? mainRaw[entry.experiment_id] : projRaw[entry.experiment_id];
    raw = exp ? ((exp as any)[col] ?? null) : null;
  } else {
    raw = findInDetail(detailCache[entry.experiment_id], col);
  }
  return raw ? basename(raw) : null;
}

function createDisplayItem(chartContext = "main"): DisplayItem {
  return {
    id: crypto.randomUUID(), title: "", pathCol: "", xCol: "", yCols: [], zCol: "",
    chartMode: "2d", downsample: 10, seriesTypes: {}, seriesStyles: {},
    chartBgColor: "#ffffff", expanded: true, editing: true,
    xLabel: "", yLabel: "", xMin: "", xMax: "", yMin: "", yMax: "",
    chartContext, showLegend: true, visible: true,
    avgRanges: [],
    pfEnabled: false, pfWindowN: "11", pfPercent: "50", pfSeries: [],
    hiddenYCols: [],
    distXMin: "", distXMax: "", distYMin: "", distYMax: "",
    distXStep: "", distYStep: "",
    distCmapMin: "", distCmapMax: "",
  };
}

function getSeriesStyle(styles: Record<string, SeriesStyle>, col: string, idx: number): SeriesStyle {
  const base = styles[col] ?? {};
  return { ...DEFAULT_SERIES_STYLE, color: PALETTE[idx % PALETTE.length], ...base };
}

const shortLabel = (e: ExpEntry) => `${e.remarks ?? "-"}  (${e.experiment_id.slice(0,6)})`;

const parseNum = (s: string): number | undefined => {
  const v = parseFloat(s);
  return isNaN(v) ? undefined : v;
};

/** Compute Nth percentile of a sorted or unsorted array */
function calcPercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Rolling percentile filter over a 1D array with window size n (odd) */
function rollingPercentile(data: number[], n: number, p: number): number[] {
  const half = Math.floor(n / 2);
  return data.map((_, i) => {
    const start = Math.max(0, i - half);
    const end   = Math.min(data.length - 1, i + half);
    const win   = data.slice(start, end + 1).filter(v => isFinite(v));
    return win.length > 0 ? calcPercentile(win, p) : NaN;
  });
}

/** Apply Z col as colormap col to all scatter series in 2D mode */
function applyZColColormap(
  item: DisplayItem, newZCol: string,
): Partial<DisplayItem> {
  const newStyles = { ...item.seriesStyles };
  item.yCols.forEach((col, i) => {
    const cur = getSeriesStyle(item.seriesStyles, col, i);
    if ((item.seriesTypes[col] ?? "line") === "scatter") {
      newStyles[col] = { ...cur, useColormap: !!newZCol, colormapCol: newZCol };
    }
  });
  return { zCol: newZCol, seriesStyles: newStyles };
}

// ── ColorInput ─────────────────────────────────────────────────────────────────
function ColorInput({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input type="color" value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onChange(e.target.value)}
      style={{ width:28, height:24, border:"1px solid #bbb", borderRadius:3, cursor:"pointer", padding:1 }}
    />
  );
}

// ── NumInput ───────────────────────────────────────────────────────────────────
function NumInput({ value, placeholder="auto", width=64, onChange }: {
  value: string; placeholder?: string; width?: number; onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => onChange(local);
  return (
    <TextField size="small" value={local} placeholder={placeholder}
      onChange={e => setLocal(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key==="Enter") { commit(); (e.target as HTMLInputElement).blur(); } }}
      inputProps={{ style:{ fontSize:11, width, textAlign:"right" } }} sx={{ width: width+22 }}
    />
  );
}

// ── ColormapBar2D ──────────────────────────────────────────────────────────────
function ColormapBar2D({
  uid, name, minVal, maxVal, label, bgColor, height = CHART_HEIGHT,
}: {
  uid: string; name: string; minVal: number; maxVal: number;
  label?: string; bgColor?: string; height?: number;
}) {
  const stops = COLORMAP_STOPS[name] ?? COLORMAP_STOPS.viridis;
  const gradId = `cmbar_${uid.replace(/[^a-z0-9]/gi, "_")}`;
  const barTop = 36; const barH = height - 72;
  const barX = 12; const barW = 12; const svgW = 54;
  const fmt = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e6 || (a < 0.001 && a > 0)) return v.toExponential(1);
    if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(3);
  };
  return (
    <svg width={svgW} height={height} style={{ flexShrink: 0, overflow: "visible" }}>
      {bgColor && <rect x={0} y={0} width={svgW} height={height} fill={bgColor}/>}
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
          {stops.map(([t, r, g, b]) => (
            <stop key={t} offset={`${(t * 100).toFixed(0)}%`} stopColor={`rgb(${r},${g},${b})`}/>
          ))}
        </linearGradient>
      </defs>
      <rect x={barX} y={barTop} width={barW} height={barH}
        fill={`url(#${gradId})`} stroke="#aaa" strokeWidth={0.5}/>
      {/* tick marks */}
      <line x1={barX+barW} y1={barTop} x2={barX+barW+3} y2={barTop} stroke="#888" strokeWidth={0.8}/>
      <line x1={barX+barW} y1={barTop+barH/2} x2={barX+barW+3} y2={barTop+barH/2} stroke="#888" strokeWidth={0.8}/>
      <line x1={barX+barW} y1={barTop+barH} x2={barX+barW+3} y2={barTop+barH} stroke="#888" strokeWidth={0.8}/>
      {/* value labels */}
      <text x={barX+barW+5} y={barTop} fontSize={9} fill="#555" dominantBaseline="middle">{fmt(maxVal)}</text>
      <text x={barX+barW+5} y={barTop+barH/2} fontSize={9} fill="#555" dominantBaseline="middle">{fmt((minVal+maxVal)/2)}</text>
      <text x={barX+barW+5} y={barTop+barH} fontSize={9} fill="#555" dominantBaseline="middle">{fmt(minVal)}</text>
      {/* rotated col label */}
      {label && (
        <text x={8} y={barTop+barH/2} fontSize={9} fill="#777" textAnchor="middle"
          transform={`rotate(-90,8,${barTop+barH/2})`}>
          {label.length > 10 ? label.slice(0, 9) + "…" : label}
        </text>
      )}
    </svg>
  );
}

// ── 2D scatter dots ────────────────────────────────────────────────────────────
function makeScatterDot(shape: MarkerShape2D, size: number, color: string) {
  return function ScatterDot(props: any) {
    const { cx, cy } = props; if (cx==null||cy==null) return null;
    const r = size/2;
    if (shape==="square")   return <rect x={cx-r} y={cy-r} width={size} height={size} fill={color} stroke="none"/>;
    if (shape==="triangle") return <polygon points={`${cx},${cy-r} ${cx-r},${cy+r} ${cx+r},${cy+r}`} fill={color} stroke="none"/>;
    if (shape==="diamond")  return <polygon points={`${cx},${cy-r} ${cx+r},${cy} ${cx},${cy+r} ${cx-r},${cy}`} fill={color} stroke="none"/>;
    return <circle cx={cx} cy={cy} r={r} fill={color} stroke="none"/>;
  };
}

function makeScatterDotColormap(
  shape: MarkerShape2D, size: number, name: string, cmKey: string, mn: number, mx: number,
) {
  const range = mx===mn ? 1 : mx-mn;
  return function ScatterDotCm(props: any) {
    const { cx, cy, payload } = props; if (cx==null||cy==null) return null;
    const color = sampleColormap(name, ((payload?.[cmKey] ?? mn) - mn) / range);
    const r = size/2;
    if (shape==="square")   return <rect x={cx-r} y={cy-r} width={size} height={size} fill={color} stroke="none"/>;
    if (shape==="triangle") return <polygon points={`${cx},${cy-r} ${cx-r},${cy+r} ${cx+r},${cy+r}`} fill={color} stroke="none"/>;
    if (shape==="diamond")  return <polygon points={`${cx},${cy-r} ${cx+r},${cy} ${cx},${cy+r} ${cx-r},${cy}`} fill={color} stroke="none"/>;
    return <circle cx={cx} cy={cy} r={r} fill={color} stroke="none"/>;
  };
}

// ── Plot3D ─────────────────────────────────────────────────────────────────────
interface Plot3DProps {
  rows: Record<string,number>[]; xCol: string; yCols: string[]; zCol: string;
  seriesStyles: Record<string,SeriesStyle>; bgColor: string; availHeaders: string[];
  xLabel: string; yLabel: string; xMin: string; xMax: string; yMin: string; yMax: string;
  showLegend?: boolean;
}
function Plot3D({ rows, xCol, yCols, zCol, seriesStyles, bgColor, availHeaders,
                  xLabel, yLabel, xMin, xMax, yMin, yMax, showLegend }: Plot3DProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const plotJson = useMemo(() => {
    const traces = yCols.map((col, i) => {
      const s = getSeriesStyle(seriesStyles, col, i);
      const cmCol = s.useColormap ? (s.colormapCol||col) : null;
      const cmValid = cmCol && availHeaders.includes(cmCol);
      const cmin = cmValid && s.colormapMin!=="" ? parseFloat(s.colormapMin) : undefined;
      const cmax = cmValid && s.colormapMax!=="" ? parseFloat(s.colormapMax) : undefined;
      return {
        type:"scatter3d", mode:"markers", name:col,
        x: rows.map(r=>r[xCol]), y: rows.map(r=>r[col]), z: rows.map(r=>r[zCol]),
        marker: {
          color: cmValid ? rows.map(r=>r[cmCol!]) : s.color,
          colorscale: cmValid ? (PLOTLY_COLORSCALE[s.colormapName]??"Viridis") : undefined,
          showscale: cmValid ? true : undefined,
          colorbar: cmValid ? { thickness:14, len:0.8 } : undefined,
          cmin, cmax,
          size: Math.max(2, Math.round(s.markerSize/1.5)),
          symbol: s.markerShape3d||"circle", opacity:0.85,
        },
      };
    });
    const xRange = (xMin!==""&&xMax!=="") ? [parseFloat(xMin),parseFloat(xMax)] : undefined;
    const yRange = (yMin!==""&&yMax!=="") ? [parseFloat(yMin),parseFloat(yMax)] : undefined;
    const layout = {
      paper_bgcolor:bgColor, plot_bgcolor:bgColor,
      scene: {
        xaxis:{ title:xLabel||xCol, ...(xRange?{range:xRange}:{}) },
        yaxis:{ title:yLabel||yCols.join(", "), ...(yRange?{range:yRange}:{}) },
        zaxis:{ title:zCol }, bgcolor:bgColor,
      },
      margin:{l:0,r:0,t:30,b:0}, height:CHART_HEIGHT, autosize:true, showlegend: showLegend !== false,
    };
    return JSON.stringify({ traces, layout });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, xCol, yCols.join(","), zCol, seriesStyles, bgColor, availHeaders,
      xLabel, yLabel, xMin, xMax, yMin, yMax]);

  useEffect(() => {
    if (!divRef.current) return;
    const el = divRef.current;
    const { traces, layout } = JSON.parse(plotJson);
    if (!traces.length) return;
    import("plotly.js-dist-min").then((mod: any) => {
      (mod.default??mod).react(el, traces, layout, { responsive:true });
    }).catch(console.error);
    return () => { import("plotly.js-dist-min").then((mod:any)=>{ (mod.default??mod).purge(el); }).catch(()=>{}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotJson]);

  return <div ref={divRef} style={{ width:"100%", height:CHART_HEIGHT }}/>;
}

const Hint = ({ children }: { children: React.ReactNode }) => (
  <Typography fontSize={12} color="text.secondary" sx={{ py:2, textAlign:"center" }}>{children}</Typography>
);

// ── Export directory persistence (IndexedDB) ──────────────────────────────────
function openExportDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open("analysis_export", 1);
    req.onupgradeneeded = e => (e.target as IDBOpenDBRequest).result.createObjectStore("handles");
    req.onsuccess = e => res((e.target as IDBOpenDBRequest).result);
    req.onerror  = e => rej((e.target as IDBOpenDBRequest).error);
  });
}
async function saveExportDirHandle(handle: any) {
  const db = await openExportDB();
  const tx = db.transaction("handles", "readwrite");
  tx.objectStore("handles").put(handle, "export_dir");
  await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
  db.close();
}
async function loadExportDirHandle(): Promise<any | null> {
  const db = await openExportDB();
  const tx = db.transaction("handles", "readonly");
  const handle = await new Promise<any>(r => {
    const req = tx.objectStore("handles").get("export_dir");
    req.onsuccess = () => r(req.result ?? null);
    req.onerror   = () => r(null);
  });
  db.close();
  return handle;
}

// ── AnalysisTab ────────────────────────────────────────────────────────────────
export default function AnalysisTab({ projectId, triggerBatchReport, onBatchReportDone }: {
  projectId?: string;
  triggerBatchReport?: boolean;
  onBatchReportDone?: () => void;
} = {}) {
  const [entries, setEntries]     = useState<ExpEntry[]>([]);
  const [mainRaw, setMainRaw]     = useState<Record<string,Experiment>>({});
  const [projRaw, setProjRaw]     = useState<Record<string,ProjectExperiment>>({});
  const [projects, setProjects]   = useState<Project[]>([]);
  const [pathCols, setPathCols]   = useState<string[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<string>("");
  const [displayItems, setDisplayItems]   = useState<DisplayItem[]>([]);
  const [detailCache, setDetailCache]   = useState<Record<string,any>>({});
  const [dataCache, setDataCache]       = useState<DataCache>({});
  const [headersCache, setHeadersCache] = useState<HeadersCache>({});
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [fileErrors, setFileErrors]     = useState<Set<string>>(new Set());
  const loadedRef = useRef(new Set<string>());
  const [expFilter, setExpFilter]         = useState<FilterState>(FILTER_DEFAULT);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<null|HTMLElement>(null);

  const selectedExpIdRef   = useRef(selectedExpId);
  const displayItemsRef    = useRef(displayItems);
  const loadingFilesRef    = useRef(new Set<string>());
  const filteredEntriesRef = useRef<ExpEntry[]>([]);
  useEffect(()=>{ selectedExpIdRef.current   = selectedExpId;    }, [selectedExpId]);
  useEffect(()=>{ displayItemsRef.current    = displayItems;     }, [displayItems]);
  useEffect(()=>{ loadingFilesRef.current    = loadingFiles;     }, [loadingFiles]);
  const [batchExporting, setBatchExporting] = useState(false);
  const [batchProgress, setBatchProgress]   = useState({ current:0, total:0 });
  const batchCancelRef = useRef(false);
  const batchReportTriggeredRef = useRef(false);
  const [batchMenuAnchor, setBatchMenuAnchor] = useState<HTMLElement|null>(null);
  const [exportWidth,  setExportWidth]  = useState("2000");
  const [exportHeight, setExportHeight] = useState("2000");

  useEffect(() => {
    settingsApi.get(META_KEY).then(r => {
      if (r.data.value) { try { const s=JSON.parse(r.data.value); if(s.selectedExpId)setSelectedExpId(s.selectedExpId); } catch{/***/} }
    }).catch(()=>{});
    // Load unified chart settings
    settingsApi.get("analysis_v5_all").then(r => {
      if (r.data.value) {
        try { const s=JSON.parse(r.data.value); setDisplayItems((s.displayItems??[]).map((i:any)=>({chartContext:"main",...i}))); } catch{/***/}
      } else {
        // Migrate from old main key
        settingsApi.get(projKey("main")).then(r2 => {
          if (r2.data.value) {
            try { const s=JSON.parse(r2.data.value); setDisplayItems((s.displayItems??[]).map((i:any)=>({chartContext:"main",...i}))); } catch{/***/}
          }
        }).catch(()=>{});
      }
    }).catch(()=>{});
    columnDefsApi.list().then(r => {
      setPathCols((r.data as any[]).filter(c=>c.data_type==="path").map(c=>`${c.table_name}::${c.column_name}`));
    }).catch(()=>{});
    if (projectId) {
      // Project-scoped: only load that project's experiments
      projectsApi.listExperiments(projectId).then(r => {
        const pRaw: Record<string,ProjectExperiment>={};
        r.data.forEach(e=>{pRaw[e.experiment_id]=e;});
        setProjRaw(pRaw);
        setEntries(r.data.map(e=>({experiment_id:e.experiment_id,remarks:e.remarks,source:projectId})));
      }).catch(()=>{}).finally(()=>setLoading(false));
    } else {
      Promise.all([fetchExperiments({limit:2000}), projectsApi.list()]).then(async ([expRes,projRes]) => {
        const mRaw: Record<string,Experiment>={};
        expRes.data.items.forEach(e=>{mRaw[e.experiment_id]=e;});
        setMainRaw(mRaw);
        const pList: Project[] = projRes.data;
        setProjects(pList);
        const pRaw: Record<string,ProjectExperiment>={};
        await Promise.all(pList.map(async p=>{
          try {
            const er=await projectsApi.listExperiments(p.project_id);
            er.data.forEach(e=>{pRaw[e.experiment_id]=e;});
          } catch{/***/}
        }));
        setProjRaw(pRaw);
        // Only main experiments in the list
        setEntries(expRes.data.items.map(e=>({experiment_id:e.experiment_id,remarks:e.remarks,source:"main" as const})));
      }).catch(()=>{}).finally(()=>setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedExpId) return;
    const needsDetail = displayItems.some(item=>item.pathCol&&parsePathCol(item.pathCol).table!=="EXPERIMENT");
    if (!needsDetail||detailCache[selectedExpId]) return;
    const entry = entries.find(e=>e.experiment_id===selectedExpId);
    if (!entry) return;
    (entry.source==="main"?fetchExperimentDetail(selectedExpId):projectsApi.getExperimentDeep(entry.source,selectedExpId))
      .then(r=>setDetailCache(prev=>({...prev,[selectedExpId]:r.data}))).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpId, displayItems, entries]);

  const loadFile = useCallback(async (filename: string, ds: number) => {
    const key=`${filename}@${ds}`;
    if (loadedRef.current.has(key)) return;
    loadedRef.current.add(key);
    setLoadingFiles(prev=>new Set([...prev,key]));
    try {
      const r=await getLogFile(filename,ds);
      setHeadersCache(prev=>({...prev,[filename]:r.data.headers}));
      setDataCache(prev=>({...prev,[key]:r.data.rows}));
    } catch {
      loadedRef.current.delete(key);
      setFileErrors(prev=>new Set([...prev,key]));
    } finally {
      setLoadingFiles(prev=>{const s=new Set(prev);s.delete(key);return s;});
    }
  }, []);

  const refreshFile = useCallback((filename: string, ds: number) => {
    const key=`${filename}@${ds}`;
    loadedRef.current.delete(key);
    setDataCache(prev=>{const n={...prev};delete n[key];return n;});
    setFileErrors(prev=>{const n=new Set(prev);n.delete(key);return n;});
    loadFile(filename, ds);
  }, [loadFile]);

  useEffect(() => {
    if (!selectedExpId) return;
    const entry=entries.find(e=>e.experiment_id===selectedExpId);
    if (!entry) return;
    for (const item of displayItems) {
      if (!item.pathCol) continue;
      const fn=resolveFilename(entry,item.pathCol,mainRaw,projRaw,detailCache);
      const key=fn?`${fn}@${item.downsample}`:null;
      if (fn&&key&&!fileErrors.has(key)) loadFile(fn,item.downsample);
    }
  }, [displayItems, selectedExpId, entries, mainRaw, projRaw, detailCache, loadFile, fileErrors]);

  // Save: apply draft + persist to unified settings key
  const handleSave = useCallback((id: string, draft: Partial<DisplayItem>) => {
    setSaving(true);
    const merged = displayItemsRef.current.map(i=>
      i.id===id ? {...i,...draft,editing:false} : i
    );
    setDisplayItems(merged);
    const payload = JSON.stringify({ displayItems: merged });
    Promise.all([
      settingsApi.set("analysis_v5_all", payload),
      settingsApi.set(META_KEY, JSON.stringify({ selectedExpId: selectedExpIdRef.current })),
    ]).finally(()=>setSaving(false));
  }, []);

  const updateItem = (id: string, patch: Partial<DisplayItem>) =>
    setDisplayItems(prev=>prev.map(i=>i.id===id?{...i,...patch}:i));
  const addItemWithContext = (ctx: string) =>
    setDisplayItems(prev=>[...prev, createDisplayItem(ctx)]);
  const removeItem = (id: string) => setDisplayItems(prev=>prev.filter(i=>i.id!==id));
  const panelChartRefs = useRef<Map<string,HTMLElement>>(new Map());
  const [exportDirName, setExportDirName] = useState<string>("");
  const exportDirHandleRef = useRef<any>(null);

  // Load persisted export dir handle on mount
  useEffect(() => {
    loadExportDirHandle().then(async h => {
      if (!h) return;
      try {
        const perm = await h.queryPermission({ mode: "readwrite" });
        if (perm === "granted") { exportDirHandleRef.current = h; setExportDirName(h.name); }
      } catch {/* ignore */}
    });
  }, []);

  const handleChoosePath = useCallback(async () => {
    if (typeof (window as any).showDirectoryPicker !== "function") return;
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      exportDirHandleRef.current = dirHandle;
      setExportDirName(dirHandle.name);
      await saveExportDirHandle(dirHandle);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e);
    }
  }, []);

  const ensureDirHandle = useCallback(async (): Promise<any|null> => {
    if (typeof (window as any).showDirectoryPicker !== "function") return null;
    let h = exportDirHandleRef.current;
    if (h) {
      try { const p = await h.requestPermission({ mode:"readwrite" }); if (p === "granted") return h; } catch{}
    }
    try {
      h = await (window as any).showDirectoryPicker({ mode:"readwrite" });
      exportDirHandleRef.current = h; setExportDirName(h.name);
      await saveExportDirHandle(h); return h;
    } catch (e:any) { if (e?.name !== "AbortError") console.error(e); return null; }
  }, []);

  const saveCanvases = useCallback(async (canvases: {canvas:HTMLCanvasElement;filename:string}[], dirHandle: any) => {
    const tw = parseInt(exportWidth)||0, th = parseInt(exportHeight)||0;
    const scale = (src: HTMLCanvasElement): HTMLCanvasElement => {
      if (!tw && !th) return src;
      const w = tw || Math.round(src.width * (th / src.height));
      const h = th || Math.round(src.height * (tw / src.width));
      const dst = document.createElement("canvas"); dst.width=w; dst.height=h;
      dst.getContext("2d")!.drawImage(src, 0, 0, w, h);
      return dst;
    };
    if (dirHandle) {
      for (const {canvas, filename} of canvases) {
        const blob = await new Promise<Blob>(res => scale(canvas).toBlob(b=>res(b!),"image/png"));
        const fh = await dirHandle.getFileHandle(filename, {create:true});
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      }
    } else {
      for (const {canvas, filename} of canvases) {
        const a = document.createElement("a"); a.download = filename;
        a.href = scale(canvas).toDataURL("image/png"); a.click();
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }, [exportWidth, exportHeight]);

  const handleExportAll = useCallback(async () => {
    const expId = selectedExpId || "unknown";
    const items = displayItemsRef.current.filter(item => item.visible !== false);
    const canvases: { canvas: HTMLCanvasElement; filename: string }[] = [];
    for (const item of items) {
      const el = panelChartRefs.current.get(item.id);
      if (!el) continue;
      try {
        const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
          ignoreElements: (e) => e.classList.contains("recharts-tooltip-wrapper") || e.classList.contains("recharts-tooltip-cursor") });
        const safe = (item.title || item.id.slice(0,6)).replace(/[^\w\-\.]/g, "_");
        canvases.push({ canvas, filename: `${expId}_${safe}.png` });
      } catch (e) { console.error("Export failed:", e); }
    }
    if (canvases.length === 0) return;
    const dirHandle = await ensureDirHandle();
    await saveCanvases(canvases, dirHandle);
  }, [selectedExpId, ensureDirHandle, saveCanvases]);

  const handleExportReportMd = useCallback(async (targetCtx?: string) => {
    const expId = selectedExpId || "analysis";
    const projId = targetCtx || projectId || (selectedExpId ? mainRaw[selectedExpId]?.project_id : undefined);
    const tw = parseInt(exportWidth)||0, th = parseInt(exportHeight)||0;
    const scaleCanvas = (src: HTMLCanvasElement): HTMLCanvasElement => {
      if (!tw && !th) return src;
      const w = tw || Math.round(src.width * (th / src.height));
      const h = th || Math.round(src.height * (tw / src.width));
      const dst = document.createElement("canvas"); dst.width=w; dst.height=h;
      dst.getContext("2d")!.drawImage(src, 0, 0, w, h);
      return dst;
    };

    // Capture all visible charts
    const chartFiles: { filename: string; title: string; canvas: HTMLCanvasElement }[] = [];
    for (const item of displayItemsRef.current.filter(i => i.visible !== false)) {
      const el = panelChartRefs.current.get(item.id);
      if (!el) continue;
      try {
        const raw = await html2canvas(el, {
          backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
          ignoreElements: (e) => e.classList.contains("recharts-tooltip-wrapper") || e.classList.contains("recharts-tooltip-cursor"),
        });
        const title = item.title || item.id.slice(0, 6);
        const safe = title.replace(/[^\w\-\.]/g, "_");
        chartFiles.push({ filename: `${expId}_${safe}.png`, title, canvas: scaleCanvas(raw) });
      } catch (e) { console.error(e); }
    }

    // Fetch project report text from backend
    let reportText = "";
    if (projId) {
      try {
        const res = await fetch(`http://localhost:8000/api/projects/${projId}/report/md`);
        if (res.ok) reportText = await res.text();
      } catch { /* ignore */ }
    }

    // Build markdown referencing PNG files by relative filename
    let md = `# Analysis Report\n\n`;
    if (expId !== "analysis") md += `**Experiment:** ${expId}\n\n`;
    md += `## Charts\n\n`;
    for (const { title, filename } of chartFiles) {
      md += `### ${title}\n\n`;
      md += `![${title}](${filename})\n\n`;
    }
    if (reportText) md += `---\n\n${reportText}`;

    const mdFilename = `${expId}_report.md`;

    // Get folder handle (prompts if not set)
    const dirHandle = await ensureDirHandle();
    if (dirHandle) {
      // Save PNG files to folder
      for (const { canvas, filename } of chartFiles) {
        const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), "image/png"));
        const fh = await dirHandle.getFileHandle(filename, { create: true });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      }
      // Save MD file to same folder
      const mdBlob = new Blob([md], { type: "text/markdown" });
      const fh = await dirHandle.getFileHandle(mdFilename, { create: true });
      const w = await fh.createWritable(); await w.write(mdBlob); await w.close();
    } else {
      // Fallback: download individual PNG files then MD
      for (const { canvas, filename } of chartFiles) {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = filename; a.click();
        await new Promise(r => setTimeout(r, 200));
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
      a.download = mdFilename; a.click();
      URL.revokeObjectURL(a.href);
    }
  }, [projectId, selectedExpId, mainRaw, ensureDirHandle, exportWidth, exportHeight]);

  // ── Batch Report MD: all experiments → charts + project data tables ──────────
  const handleBatchReportMd = useCallback(async () => {
    const targets = filteredEntriesRef.current;
    if (targets.length === 0 || !projectId) return;
    const tw = parseInt(exportWidth)||0, th = parseInt(exportHeight)||0;
    const scaleCanvas = (src: HTMLCanvasElement): HTMLCanvasElement => {
      if (!tw && !th) return src;
      const w = tw || Math.round(src.width * (th / src.height));
      const h = th || Math.round(src.height * (tw / src.width));
      const dst = document.createElement("canvas"); dst.width=w; dst.height=h;
      dst.getContext("2d")!.drawImage(src, 0, 0, w, h);
      return dst;
    };
    const dirHandle = await ensureDirHandle();

    // Fetch project report data text (tables)
    let reportText = "";
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectId}/report/md`);
      if (res.ok) reportText = await res.text();
    } catch { /* ignore */ }

    // Batch capture per experiment
    batchCancelRef.current = false;
    setBatchExporting(true);
    setBatchProgress({ current: 0, total: targets.length });
    const prevExpId = selectedExpIdRef.current;
    let chartsMd = `## 分析グラフ\n\n`;
    const allChartFiles: { filename: string; canvas: HTMLCanvasElement }[] = [];

    try {
      for (let i = 0; i < targets.length; i++) {
        if (batchCancelRef.current) break;
        const entry = targets[i];
        setBatchProgress({ current: i+1, total: targets.length });
        setSelectedExpId(entry.experiment_id);
        await new Promise(r => setTimeout(r, 300));
        for (let w = 0; w < 150; w++) {
          if (loadingFilesRef.current.size === 0) break;
          await new Promise(r => setTimeout(r, 100));
        }
        await new Promise(r => setTimeout(r, 600));
        chartsMd += `### ${entry.experiment_id}\n\n`;
        for (const item of displayItemsRef.current.filter(i => i.visible !== false)) {
          const el = panelChartRefs.current.get(item.id);
          if (!el) continue;
          try {
            const raw = await html2canvas(el, {
              backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
              ignoreElements: (e) => e.classList.contains("recharts-tooltip-wrapper") || e.classList.contains("recharts-tooltip-cursor"),
            });
            const title = item.title || item.id.slice(0, 6);
            const safe = title.replace(/[^\w\-\.]/g, "_");
            const filename = `${entry.experiment_id}_${safe}.png`;
            allChartFiles.push({ filename, canvas: scaleCanvas(raw) });
            chartsMd += `![${title}](${filename})\n\n`;
          } catch (e) { console.error(e); }
        }
      }
    } finally {
      setSelectedExpId(prevExpId);
      setBatchExporting(false);
      setBatchProgress({ current: 0, total: 0 });
    }

    // Tables first, then charts
    const projName = projects.find(p => p.project_id === projectId)?.name ?? projectId.slice(0, 8);
    const fullMd = reportText + `\n\n---\n\n` + chartsMd;
    const mdFilename = `${projName}_report.md`;

    if (dirHandle) {
      for (const { canvas, filename } of allChartFiles) {
        const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), "image/png"));
        const fh = await dirHandle.getFileHandle(filename, { create: true });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      }
      const mdBlob = new Blob([fullMd], { type: "text/markdown" });
      const fh = await dirHandle.getFileHandle(mdFilename, { create: true });
      const w = await fh.createWritable(); await w.write(mdBlob); await w.close();
    } else {
      for (const { canvas, filename } of allChartFiles) {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = filename; a.click();
        await new Promise(r => setTimeout(r, 200));
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([fullMd], { type: "text/markdown" }));
      a.download = mdFilename; a.click();
      URL.revokeObjectURL(a.href);
    }
  }, [projectId, ensureDirHandle, exportWidth, exportHeight, projects]);

  // Watch triggerBatchReport prop — run once entries are loaded
  useEffect(() => {
    if (triggerBatchReport && !loading && entries.length > 0 && !batchReportTriggeredRef.current) {
      batchReportTriggeredRef.current = true;
      handleBatchReportMd().finally(() => {
        batchReportTriggeredRef.current = false;
        onBatchReportDone?.();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerBatchReport, loading, entries.length]);

  const handleBatchExport = useCallback(async (targetEntries?: ExpEntry[]) => {
    const targets = targetEntries ?? filteredEntriesRef.current;
    if (targets.length === 0) return;
    const dirHandle = await ensureDirHandle();
    batchCancelRef.current = false;
    setBatchExporting(true);
    setBatchProgress({ current:0, total:targets.length });
    const prevExpId = selectedExpIdRef.current;
    try {
      for (let i = 0; i < targets.length; i++) {
        if (batchCancelRef.current) break;
        const entry = targets[i];
        setBatchProgress({ current:i+1, total:targets.length });
        setSelectedExpId(entry.experiment_id);
        // Wait for React to re-render and trigger file loading
        await new Promise(r => setTimeout(r, 300));
        // Wait for file loading to complete (up to 15s)
        for (let w = 0; w < 150; w++) {
          if (loadingFilesRef.current.size === 0) break;
          await new Promise(r => setTimeout(r, 100));
        }
        // Wait for chart render to complete
        await new Promise(r => setTimeout(r, 600));
        const canvases: { canvas: HTMLCanvasElement; filename: string }[] = [];
        for (const item of displayItemsRef.current.filter(i=>i.visible!==false)) {
          const el = panelChartRefs.current.get(item.id);
          if (!el) continue;
          try {
            const canvas = await html2canvas(el, { backgroundColor:"#ffffff", scale:2, useCORS:true, logging:false,
              ignoreElements: (e) => e.classList.contains("recharts-tooltip-wrapper") || e.classList.contains("recharts-tooltip-cursor") });
            const safe = (item.title || item.id.slice(0,6)).replace(/[^\w\-\.]/g, "_");
            canvases.push({ canvas, filename:`${entry.experiment_id}_${safe}.png` });
          } catch (e) { console.error(e); }
        }
        await saveCanvases(canvases, dirHandle);
      }
    } finally {
      setSelectedExpId(prevExpId);
      setBatchExporting(false);
      setBatchProgress({ current:0, total:0 });
    }
  }, [ensureDirHandle, saveCanvases]);

  const moveItem = (id: string, dir: -1|1) => setDisplayItems(prev=>{
    const idx=prev.findIndex(i=>i.id===id); if(idx<0) return prev;
    const next=idx+dir; if(next<0||next>=prev.length) return prev;
    const arr=[...prev]; [arr[idx],arr[next]]=[arr[next],arr[idx]]; return arr;
  });

  const filteredEntries = useMemo(() => {
    if (!expFilter.value) return entries;
    return entries.filter((e) =>
      matchDeep(
        (mainRaw[e.experiment_id] as unknown as Record<string, unknown>) ?? { experiment_id: e.experiment_id, remarks: e.remarks },
        (detailCache[e.experiment_id] as unknown as Record<string, unknown>) ?? null,
        expFilter,
        Object.keys(mainRaw[e.experiment_id] ?? { experiment_id: "", remarks: "" }),
      ),
    );
  }, [entries, expFilter, mainRaw, detailCache]);
  useEffect(()=>{ filteredEntriesRef.current = filteredEntries; }, [filteredEntries]);

  /** Column names derived from the first loaded experiment — used by the filter bar dropdown. */
  const expCols = useMemo(
    () =>
      Object.keys(Object.values(mainRaw)[0] ?? {}).map((k) => ({ column_name: k })),
    [mainRaw],
  );

  // Group experiments by project_id from mainRaw
  const grouped = useMemo(()=>{
    const map=new Map<string,{key:string;label:string;items:ExpEntry[]}>();
    for (const e of filteredEntries) {
      const exp=mainRaw[e.experiment_id];
      const pk=exp?.project_id??"__none__";
      const label=exp?.project_name??"No Project";
      if(!map.has(pk))map.set(pk,{key:pk,label,items:[]});
      map.get(pk)!.items.push(e);
    }
    // No-project first, then alphabetical
    return [...map.values()].sort((a,b)=>{
      if(a.key==="__none__")return -1;
      if(b.key==="__none__")return 1;
      return a.label.localeCompare(b.label);
    });
  }, [filteredEntries, mainRaw]);

  // Projects available for Add Chart context
  const availableProjects = useMemo(()=>{
    return projects.map(p=>({id:p.project_id,name:p.name}));
  }, [projects]);

  // Group displayItems by chartContext (main first, then per-project)
  const mainItems = useMemo(()=>displayItems.filter(i=>(i.chartContext??"main")==="main"), [displayItems]);
  const projItemGroups = useMemo(()=>{
    const map=new Map<string,{label:string;items:DisplayItem[]}>();
    for (const item of displayItems) {
      const ctx=item.chartContext??"main";
      if(ctx==="main")continue;
      if(!map.has(ctx)){const p=projects.find(p=>p.project_id===ctx);map.set(ctx,{label:p?.name??ctx.slice(0,8),items:[]});}
      map.get(ctx)!.items.push(item);
    }
    return [...map.entries()].map(([ctx,{label,items}])=>({ctx,label,items}));
  }, [displayItems, projects]);

  const selectedEntry = entries.find(e=>e.experiment_id===selectedExpId)??null;
  if (loading) return <Box sx={{p:3}}><CircularProgress size={24}/></Box>;

  return (
    <Box sx={{ p:1.5, display:"flex", flexDirection:"column", gap:2 }}>

      {/* ── Experiment selector ── */}
      <Paper elevation={1} sx={{ p:1.5 }}>
        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb:1 }}>Experiment</Typography>
        {selectedEntry ? (
          <Chip label={shortLabel(selectedEntry)}
            color="primary" size="small" onDelete={()=>setSelectedExpId("")}
            sx={{ mb:1, fontSize:11, maxWidth:"100%" }}
          />
        ) : (
          <Typography fontSize={11} color="text.secondary" sx={{ mb:1 }}>Not selected \u2014 choose from list</Typography>
        )}
        <Box sx={{ mb: 0.5 }}>
          <ExperimentFilterBar
            filter={expFilter}
            onChange={setExpFilter}
            cols={expCols}
          />
        </Box>
        <Box sx={{ maxHeight:230, overflowY:"auto", border:"1px solid", borderColor:"divider", borderRadius:1 }}>
          {grouped.map(group=>(
            <Box key={group.key}>
              <Box sx={{ px:1.5, py:0.4, bgcolor:"grey.200", position:"sticky", top:0, zIndex:1, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <Typography fontSize={10} fontWeight="bold" color="text.secondary">
                  {group.key==="__none__" ? (projectId ? "PROJECT EXPERIMENTS" : "EXPERIMENTS") : `Project: ${group.label}`}
                </Typography>
                <Button size="small" variant="outlined" color="warning" disabled={batchExporting}
                  onClick={()=>handleBatchExport(group.items)}
                  sx={{ fontSize:9, py:0, px:0.5, minWidth:0, lineHeight:1.4 }}>
                  Batch({group.items.length})
                </Button>
              </Box>
              {group.items.map(e=>{
                const sel=e.experiment_id===selectedExpId;
                return (
                  <Box key={e.experiment_id} onClick={()=>setSelectedExpId(e.experiment_id)} sx={{
                    px:2, py:0.5, cursor:"pointer", fontSize:11,
                    bgcolor:sel?"primary.main":"transparent", color:sel?"primary.contrastText":"text.primary",
                    "&:hover":{bgcolor:sel?"primary.dark":"action.hover"},
                    borderBottom:"1px solid", borderColor:"divider",
                  }}>{shortLabel(e)}</Box>
                );
              })}
            </Box>
          ))}
          {grouped.length===0 && <Typography fontSize={11} color="text.secondary" sx={{px:1.5,py:1}}>No results</Typography>}
        </Box>
      </Paper>

      {/* ── Chart panels header ── */}
      <Box sx={{ display:"flex", alignItems:"center", gap:1, flexWrap:"wrap" }}>
        <Typography variant="subtitle2" fontWeight="bold">Charts</Typography>
        <Button size="small" startIcon={<AddIcon/>} variant="contained"
          onClick={e=>projectId?addItemWithContext(projectId):(availableProjects.length>0?setAddMenuAnchor(e.currentTarget):addItemWithContext("main"))}
          sx={{ ml:0.5 }}>Add Chart</Button>
        <Button size="small" startIcon={<DownloadIcon/>} variant="outlined"
          onClick={handleExportAll}
          sx={{ ml:0.5 }}>
          {exportDirName ? `Save → ${exportDirName}` : "Save Charts"}
        </Button>
        <Button size="small" startIcon={<FolderOpenIcon/>} variant="outlined" color="secondary"
          onClick={handleChoosePath}
          sx={{ fontSize:11 }}>
          {exportDirName ? "Change Path" : "Choose Path"}
        </Button>
        {!batchExporting ? (
          <>
            <Button size="small" variant="outlined" color="warning"
              onClick={e=>setBatchMenuAnchor(e.currentTarget)}
              sx={{ fontSize:11 }}>
              Batch Export ({filteredEntries.length})
            </Button>
            <Menu anchorEl={batchMenuAnchor} open={!!batchMenuAnchor} onClose={()=>setBatchMenuAnchor(null)}>
              <MenuItem dense onClick={()=>{ setBatchMenuAnchor(null); handleBatchExport(); }}>
                All ({filteredEntries.length})
              </MenuItem>
              <Divider/>
              {grouped.map(g=>(
                <MenuItem dense key={g.key} onClick={()=>{ setBatchMenuAnchor(null); handleBatchExport(g.items); }}>
                  {g.key==="__none__" ? "EXPERIMENTS" : `Project: ${g.label}`} ({g.items.length})
                </MenuItem>
              ))}
            </Menu>
          </>
        ) : (
          <>
            <Typography fontSize={11} color="warning.main" sx={{ alignSelf:"center" }}>
              Exporting… {batchProgress.current}/{batchProgress.total}
            </Typography>
            <Button size="small" variant="contained" color="error"
              onClick={()=>{ batchCancelRef.current = true; }}
              sx={{ fontSize:11 }}>
              Stop
            </Button>
          </>
        )}
        {/* Fixed export size */}
        <Box sx={{ display:"flex", alignItems:"center", gap:0.4, ml:0.5 }}>
          <Typography fontSize={10} color="text.secondary">W</Typography>
          <TextField size="small" value={exportWidth} placeholder="auto"
            onChange={e=>setExportWidth(e.target.value)}
            inputProps={{ style:{fontSize:10, width:48, textAlign:"right"} }} sx={{ width:64 }}/>
          <Typography fontSize={10} color="text.secondary">H</Typography>
          <TextField size="small" value={exportHeight} placeholder="auto"
            onChange={e=>setExportHeight(e.target.value)}
            inputProps={{ style:{fontSize:10, width:48, textAlign:"right"} }} sx={{ width:64 }}/>
          <Typography fontSize={10} color="text.secondary">px</Typography>
        </Box>
        {!projectId && (
        <Menu anchorEl={addMenuAnchor} open={!!addMenuAnchor} onClose={()=>setAddMenuAnchor(null)}>
          <MenuItem dense onClick={()=>{addItemWithContext("main");setAddMenuAnchor(null);}}>EXPERIMENTS</MenuItem>
          <Divider/>
          {availableProjects.map(p=>(
            <MenuItem dense key={p.id} onClick={()=>{addItemWithContext(p.id);setAddMenuAnchor(null);}}>
              Project: {p.name}
            </MenuItem>
          ))}
        </Menu>
        )}
      </Box>

      {/* ── EXPERIMENTS charts ── */}
      {!projectId&&mainItems.length>0&&(
        <Box>
          <Typography fontSize={11} fontWeight="bold" color="text.secondary" sx={{ mb:0.5 }}>EXPERIMENTS</Typography>
          <Box sx={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:2, alignItems:"start" }}>
            {mainItems.map((item,idx)=>{
              const fn=selectedEntry&&item.pathCol?resolveFilename(selectedEntry,item.pathCol,mainRaw,projRaw,detailCache):null;
              const cacheKey=fn?`${fn}@${item.downsample}`:null;
              const avHdr=headersCache[fn??""]??[];
              const rows=cacheKey?dataCache[cacheKey]:undefined;
              const isLoadingF=!!cacheKey&&loadingFiles.has(cacheKey);
              const hasError=!!cacheKey&&fileErrors.has(cacheKey);
              return (
                <DisplayItemPanel key={item.id} item={item} index={idx}
                  pathCols={pathCols} selectedEntry={selectedEntry}
                  resolvedFile={fn} availHeaders={avHdr}
                  rows={rows} isLoadingFile={isLoadingF} hasError={hasError} saving={saving}
                  accentColor="#1976d2"
                  onUpdate={patch=>updateItem(item.id,patch)}
                  onRemove={()=>removeItem(item.id)}
                  onSave={draft=>handleSave(item.id,draft)}
                  onRefresh={()=>{ if(fn) refreshFile(fn,item.downsample); }}
                  onMoveUp={idx>0?()=>moveItem(item.id,-1):undefined}
                  onMoveDown={idx<mainItems.length-1?()=>moveItem(item.id,1):undefined}
                  chartAreaRef={el=>{ if(el) panelChartRefs.current.set(item.id,el); else panelChartRefs.current.delete(item.id); }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* ── Project charts (below EXPERIMENTS) ── */}
      {projItemGroups.filter(g=>{
        if (projectId) return g.ctx === projectId;
        if (selectedExpId) {
          const selProj = mainRaw[selectedExpId]?.project_id;
          if (selProj) return g.ctx === selProj;
        }
        return true;
      }).map(g=>(
        <Box key={g.ctx}>
          <Box sx={{ display:"flex", alignItems:"center", gap:1, my:0.5 }}>
            <Divider sx={{ flex:1 }}/>
            <Typography fontSize={11} fontWeight="bold" color="secondary.main">Project: {g.label}</Typography>
            <Button size="small" variant="outlined" color="secondary"
              onClick={()=>handleExportReportMd(g.ctx)}
              sx={{ fontSize:10, py:0.2, px:0.8, minWidth:0 }}>
              Report MD
            </Button>
            <Divider sx={{ flex:1 }}/>
          </Box>
          <Box sx={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:2, alignItems:"start" }}>
            {g.items.map((item,idx)=>{
              const fn=selectedEntry&&item.pathCol?resolveFilename(selectedEntry,item.pathCol,mainRaw,projRaw,detailCache):null;
              const cacheKey=fn?`${fn}@${item.downsample}`:null;
              const avHdr=headersCache[fn??""]??[];
              const rows=cacheKey?dataCache[cacheKey]:undefined;
              const isLoadingF=!!cacheKey&&loadingFiles.has(cacheKey);
              const hasError=!!cacheKey&&fileErrors.has(cacheKey);
              return (
                <DisplayItemPanel key={item.id} item={item} index={idx}
                  pathCols={pathCols} selectedEntry={selectedEntry}
                  resolvedFile={fn} availHeaders={avHdr}
                  rows={rows} isLoadingFile={isLoadingF} hasError={hasError} saving={saving}
                  accentColor="#9c27b0"
                  onUpdate={patch=>updateItem(item.id,patch)}
                  onRemove={()=>removeItem(item.id)}
                  onSave={draft=>handleSave(item.id,draft)}
                  onRefresh={()=>{ if(fn) refreshFile(fn,item.downsample); }}
                  onMoveUp={idx>0?()=>moveItem(item.id,-1):undefined}
                  onMoveDown={idx<g.items.length-1?()=>moveItem(item.id,1):undefined}
                  chartAreaRef={el=>{ if(el) panelChartRefs.current.set(item.id,el); else panelChartRefs.current.delete(item.id); }}
                />
              );
            })}
          </Box>
        </Box>
      ))}

      {(projectId ? !projItemGroups.find(g=>g.ctx===projectId) : displayItems.length===0) && (
        <Paper sx={{p:4,textAlign:"center"}} elevation={1}>
          <Typography color="text.secondary" fontSize={13}>Click "Add Chart" to add a graph panel</Typography>
        </Paper>
      )}
    </Box>
  );
}

// ── DisplayItemPanel ───────────────────────────────────────────────────────────
interface DisplayItemPanelProps {
  item: DisplayItem; index: number;
  pathCols: string[]; selectedEntry: ExpEntry|null;
  resolvedFile: string|null; availHeaders: string[];
  rows: Record<string,number>[]|undefined;
  isLoadingFile: boolean; hasError: boolean; saving: boolean;
  accentColor: string;
  onUpdate: (patch: Partial<DisplayItem>)=>void;
  onRemove: ()=>void; onSave: (draft: Partial<DisplayItem>)=>void;
  onRefresh: ()=>void;
  onMoveUp?: ()=>void; onMoveDown?: ()=>void;
  chartAreaRef?: (el: HTMLElement|null)=>void;
}

function DisplayItemPanel({
  item, index, pathCols, selectedEntry, resolvedFile, availHeaders,
  rows, isLoadingFile, hasError, saving, accentColor, onUpdate, onRemove, onSave, onRefresh,
  onMoveUp, onMoveDown, chartAreaRef,
}: DisplayItemPanelProps) {
  // Local draft -- all edit-panel changes live here until Save
  const [draft, setDraft] = useState<DisplayItem>(()=>({...item}));
  // Sync draft when item identity changes (new chart panel)
  useEffect(()=>{ setDraft({...item}); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Full sync from item when edit panel opens, so draft reflects latest saved state
  const prevEditingRef = useRef(item.editing);
  useEffect(()=>{
    if (item.editing && !prevEditingRef.current) { setDraft({...item}); }
    else { setDraft(prev=>({...prev, editing:item.editing, expanded:item.expanded, visible:item.visible})); }
    prevEditingRef.current = item.editing;
  }, [item.editing, item.expanded, item.visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convenience draft updater
  const draftUpdate = (patch: Partial<DisplayItem>) => setDraft(prev=>({...prev,...patch}));

  // Auto-select X/Y columns when file first loads for an unconfigured panel
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (availHeaders.length === 0) { autoSelectedRef.current = false; return; }
    if (autoSelectedRef.current) return;
    if (item.xCol || item.yCols.length > 0) return; // already configured
    autoSelectedRef.current = true;
    const xCol = availHeaders[0];
    const yCols = availHeaders.slice(1);
    onSaveRef.current({ xCol, yCols });
  }, [availHeaders.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local text field buffers (need intermediate state while typing)
  const [localDs, setLocalDs] = useState(draft.downsample);
  const [localXL, setLocalXL] = useState(draft.xLabel);
  const [localYL, setLocalYL] = useState(draft.yLabel);
  useEffect(()=>setLocalDs(draft.downsample), [draft.downsample]);
  useEffect(()=>setLocalXL(draft.xLabel),     [draft.xLabel]);
  useEffect(()=>setLocalYL(draft.yLabel),     [draft.yLabel]);

  const effectiveX = (draft.xCol&&availHeaders.includes(draft.xCol))?draft.xCol:"";
  const effectiveY = draft.yCols.filter(y=>availHeaders.includes(y));
  const effectiveZ = (draft.zCol&&availHeaders.includes(draft.zCol))?draft.zCol:"";

  // Unified series order (Y cols + PF series IDs) respecting draft.seriesOrder
  const settingsSeriesOrder = useMemo<string[]>(()=>{
    const all=[...draft.yCols,...(draft.pfEnabled?(draft.pfSeries??[]).map(pf=>pf.id):[])];
    if (!draft.seriesOrder||draft.seriesOrder.length===0) return all;
    const vs=new Set(all); const ordered=draft.seriesOrder.filter(id=>vs.has(id));
    const os=new Set(ordered); for(const id of all) if(!os.has(id)) ordered.push(id);
    return ordered;
  },[draft.yCols,draft.pfEnabled,draft.pfSeries,draft.seriesOrder]);

  const xColMissing  = !!draft.xCol&&availHeaders.length>0&&!availHeaders.includes(draft.xCol);
  const yColsMissing = draft.yCols.filter(y=>availHeaders.length>0&&!availHeaders.includes(y));
  const zColMissing  = !!draft.zCol&&availHeaders.length>0&&!availHeaders.includes(draft.zCol);

  // Per-col data min/max
  const colMinMax = useMemo<Record<string,[number,number]>>(()=>{
    if (!rows||rows.length===0) return {};
    const result: Record<string,[number,number]>={};
    for (const col of availHeaders) {
      let mn=Infinity,mx=-Infinity;
      for (const row of rows){ const v=row[col]; if(v<mn)mn=v; if(v>mx)mx=v; }
      result[col]=[isFinite(mn)?mn:0, isFinite(mx)?mx:1];
    }
    return result;
  }, [rows, availHeaders]);

  // ── PF computed data (shared by chartData2D and avgValues) ────────────────
  const pfComputed = useMemo<Record<string, number[]>>(() => {
    if (!rows || !draft.pfEnabled || (draft.pfSeries??[]).length === 0) return {};
    const rawN = parseInt(draft.pfWindowN || "11", 10) || 11;
    const n = rawN % 2 === 0 ? rawN + 1 : rawN;
    const p = parseNum(draft.pfPercent || "50") ?? 50;
    const result: Record<string, number[]> = {};
    for (const pf of draft.pfSeries) {
      // PF-on-PF: if yCol is a previous PF id, use that computed array
      const srcData = availHeaders.includes(pf.yCol)
        ? rows.map(r => r[pf.yCol])
        : (result[pf.yCol] ?? null);
      if (!srcData) continue;
      result[pf.id] = rollingPercentile(srcData, n, p);
    }
    return result;
  }, [rows, availHeaders, draft.pfEnabled, draft.pfSeries, draft.pfWindowN, draft.pfPercent]);

  // 2D chart data with rolling percentile filter series
  const chartData2D = useMemo<Record<string,number|string>[]>(()=>{
    if (!rows||!effectiveX||effectiveY.length===0) return [];
    const extraCols=new Set<string>();
    for (const col of effectiveY) {
      const s=draft.seriesStyles[col];
      if (s?.useColormap){const cc=s.colormapCol||col; if(cc&&availHeaders.includes(cc))extraCols.add(cc);}
    }
    return rows.map((row, i)=>{
      const pt: Record<string,number|string>={[effectiveX]:row[effectiveX]};
      for (const y of effectiveY) pt[y]=row[y];
      for (const ec of extraCols) pt[ec]=row[ec];
      for (const pf of (draft.pfEnabled ? (draft.pfSeries??[]) : [])) {
        if (pfComputed[pf.id] !== undefined) pt[pf.id] = pfComputed[pf.id][i];
      }
      return pt;
    });
  }, [rows, effectiveX, effectiveY, draft.seriesStyles, availHeaders, draft.pfEnabled, draft.pfSeries, pfComputed]);

  // X-range average values — uses chartData2D rows so PF series are included
  const avgValues = useMemo<{rangeId:string;rangeLabel:string;col:string;colLabel:string;val:number;color:string}[]>(()=>{
    if (!effectiveX || !chartData2D.length) return [];
    const ranges = draft.avgRanges ?? [];
    if (ranges.length === 0) return [];
    // Build a color/label map for PF series
    const pfColorMap: Record<string, string> = {};
    const pfLabelMap: Record<string, string> = {};
    for (const pf of (draft.pfSeries ?? [])) {
      pfColorMap[pf.id] = pf.color;
      pfLabelMap[pf.id] = pf.label || `${pf.yCol}_pf`;
    }
    const result: {rangeId:string;rangeLabel:string;col:string;colLabel:string;val:number;color:string}[] = [];
    for (const ar of ranges) {
      const xMin = parseNum(ar.xMin ?? "");
      const xMax = parseNum(ar.xMax ?? "");
      const inRange = chartData2D.filter(r => {
        const x = r[effectiveX] as number;
        return (xMin === undefined || x >= xMin) && (xMax === undefined || x <= xMax);
      });
      if (inRange.length === 0) continue;
      // Raw Y cols + PF series
      const pfCols = draft.pfEnabled ? (draft.pfSeries ?? []).map(pf => pf.id) : [];
      const allCols = [...effectiveY, ...pfCols];
      const targetCols = ar.yCols.length > 0 ? ar.yCols.filter(c => allCols.includes(c)) : allCols;
      for (const col of targetCols) {
        const isPf = pfCols.includes(col);
        const i = effectiveY.indexOf(col);
        const color = isPf ? (pfColorMap[col] ?? "#888") : getSeriesStyle(draft.seriesStyles, col, i).color;
        const colLabel = isPf ? (pfLabelMap[col] ?? col) : col;
        const sum = inRange.reduce((s, r) => s + ((r[col] as number) ?? 0), 0);
        result.push({ rangeId: ar.id, rangeLabel: ar.label, col, colLabel, val: sum / inRange.length, color });
      }
    }
    return result;
  }, [draft.avgRanges, effectiveX, effectiveY, chartData2D, draft.pfEnabled, draft.pfSeries, draft.seriesStyles]);



  // 2D dot renderers (scatter only)
  const dotRenderers = useMemo(()=>{
    const map: Record<string,any>={};
    effectiveY.forEach((col,i)=>{
      if ((draft.seriesTypes[col]??"line")!=="scatter") return;
      const s=getSeriesStyle(draft.seriesStyles,col,i);
      if (s.useColormap) {
        const cmCol=s.colormapCol||col;
        const [dataMn,dataMx]=(availHeaders.includes(cmCol)?colMinMax[cmCol]:null)??[0,1];
        const mn=parseNum(s.colormapMin)??dataMn;
        const mx=parseNum(s.colormapMax)??dataMx;
        map[col]=makeScatterDotColormap(s.markerShape2d,s.markerSize,s.colormapName,cmCol,mn,mx);
      } else {
        map[col]=makeScatterDot(s.markerShape2d,s.markerSize,s.color);
      }
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveY.join(","), draft.seriesTypes, draft.seriesStyles, colMinMax, availHeaders]);

  const updateStyle = (col: string, patch: Partial<SeriesStyle>) => {
    const i=draft.yCols.indexOf(col);
    const cur=getSeriesStyle(draft.seriesStyles,col,i);
    draftUpdate({seriesStyles:{...draft.seriesStyles,[col]:{...cur,...patch}}});
  };

  // When series type changes: apply/remove colormap based on Z col (2D) or just disable
  const setSeriesType = (col: string, t: SeriesType) => {
    const i=draft.yCols.indexOf(col);
    const cur=getSeriesStyle(draft.seriesStyles,col,i);
    const updates: Partial<DisplayItem>={seriesTypes:{...draft.seriesTypes,[col]:t}};
    if (draft.chartMode==="2d") {
      if (t==="scatter"&&draft.zCol) {
        updates.seriesStyles={...draft.seriesStyles,[col]:{...cur,useColormap:true,colormapCol:draft.zCol}};
      } else if (t==="line") {
        updates.seriesStyles={...draft.seriesStyles,[col]:{...cur,useColormap:false}};
      }
    }
    draftUpdate(updates);
  };

  // Z col change: auto-apply colormap to scatter series (works for both 2D and 3D)
  const handleZColChange = (newZCol: string) => {
    const patch = applyZColColormap(draft, newZCol);
    draftUpdate(patch);
    onUpdate(patch);
  };

  const fileReady = !isLoadingFile&&!hasError&&!!resolvedFile&&!!selectedEntry&&!!draft.pathCol;
  const ready2D   = fileReady&&draft.chartMode==="2d"&&!!effectiveX&&effectiveY.length>0;
  const ready3D   = fileReady&&draft.chartMode==="3d"&&!!effectiveX&&effectiveY.length>0&&!!effectiveZ;
  const readyDist = fileReady&&draft.chartMode==="dist"&&!!effectiveX&&effectiveY.length>0;

  // Distribution heatmap data
  const distData = useMemo(()=>{
    if (!readyDist||!rows||rows.length===0) return null;
    const yCol = effectiveY[0];
    const allX = rows.map(r=>r[effectiveX] as number).filter(v=>isFinite(v));
    const allY = rows.map(r=>r[yCol] as number).filter(v=>isFinite(v));
    if (allX.length===0||allY.length===0) return null;
    const xMin = parseNum(draft.distXMin)??Math.min(...allX);
    const xMax = parseNum(draft.distXMax)??Math.max(...allX);
    const yMin = parseNum(draft.distYMin)??Math.min(...allY);
    const yMax = parseNum(draft.distYMax)??Math.max(...allY);
    if (xMin>=xMax||yMin>=yMax) return null;
    const xStep = parseNum(draft.distXStep)??((xMax-xMin)/20);
    const yStep = parseNum(draft.distYStep)??((yMax-yMin)/20);
    if (xStep<=0||yStep<=0) return null;
    const xNum = Math.max(1,Math.floor((xMax-xMin)/xStep));
    const yNum = Math.max(1,Math.floor((yMax-yMin)/yStep));
    if (xNum>500||yNum>500) return null;
    const dist: number[][] = Array.from({length:yNum},()=>new Array(xNum).fill(0));
    let total = 0;
    for (const row of rows) {
      const x = row[effectiveX] as number;
      const y = row[yCol] as number;
      if (!isFinite(x)||!isFinite(y)) continue;
      const xi = Math.floor((x-xMin)/xStep);
      const yi = Math.floor((y-yMin)/yStep);
      if (xi>=0&&xi<xNum&&yi>=0&&yi<yNum) { dist[yi][xi]++; total++; }
    }
    if (total===0) return null;
    const pct = dist.map(row=>row.map(v=>v/total*100));
    const maxPct = Math.max(...pct.flat());
    return { pct, xMin, xMax, xStep, xNum, yMin, yMax, yStep, yNum,
             xCol:effectiveX, yCol, total, maxPct };
  },[readyDist, rows, effectiveX, effectiveY, draft.distXMin, draft.distXMax, draft.distYMin, draft.distYMax, draft.distXStep, draft.distYStep]);

  const xDomain: [any,any]|undefined=(draft.xMin!==""||draft.xMax!=="")
    ?[parseNum(draft.xMin)??"auto",parseNum(draft.xMax)??"auto"]:undefined;
  const yDomain: [any,any]|undefined=(draft.yMin!==""||draft.yMax!=="")
    ?[parseNum(draft.yMin)??"auto",parseNum(draft.yMax)??"auto"]:undefined;

  const xTickFmt=(v:number)=>Math.abs(v)>=1000?`${(v/1000).toFixed(1)}k`:String(v);

  return (
    <Paper elevation={2} sx={{ overflow:"hidden", borderTop:"3px solid", borderColor:accentColor }}>

      {/* ── Header ── */}
      <Box sx={{
        display:"flex", alignItems:"center", gap:0.5, px:1.5, py:0.6,
        bgcolor:"grey.100", borderBottom:"1px solid", borderColor:"divider", flexWrap:"wrap",
      }}>
        <Typography fontSize={12} fontWeight="bold" color="text.secondary" sx={{ mr:0.3 }}>#{index+1}</Typography>
        <TextField size="small" variant="standard" placeholder="Title"
          value={item.title} onChange={e=>{ onUpdate({title:e.target.value}); draftUpdate({title:e.target.value}); }}
          inputProps={{ style:{fontSize:13,fontWeight:"bold"} }} sx={{ flexGrow:1, minWidth:60 }}
        />
        {/* Downsample */}
        <Box sx={{ display:"flex", alignItems:"center", gap:0.4, flexShrink:0 }}>
          <Typography fontSize={10} color="text.secondary">1/</Typography>
          <TextField size="small" value={localDs}
            onChange={e=>setLocalDs(e.target.value as any)}
            onBlur={()=>{const n=Math.max(1,Math.min(10000,parseInt(String(localDs),10)||1));setLocalDs(n);draftUpdate({downsample:n});}}
            onKeyDown={e=>{if(e.key==="Enter"){const n=Math.max(1,Math.min(10000,parseInt(String(localDs),10)||1));setLocalDs(n);draftUpdate({downsample:n});(e.target as HTMLInputElement).blur();}}}
            inputProps={{ style:{fontSize:12,width:48,textAlign:"right"} }} sx={{ width:68 }}
          />
        </Box>
        {/* Refresh */}
        <IconButton size="small" onClick={onRefresh} title="Reload data" disabled={isLoadingFile||!resolvedFile}>
          {isLoadingFile ? <CircularProgress size={14}/> : <RefreshIcon fontSize="small"/>}
        </IconButton>
        {/* Visibility toggle */}
        <IconButton size="small"
          color={item.visible===false?"default":"default"}
          onClick={()=>onUpdate({visible:item.visible===false?true:false})} title={item.visible===false?"Show chart":"Hide chart"}
          sx={{ border:"1px solid", borderColor:item.visible===false?"warning.main":"divider" }}
        >
          {item.visible===false ? <VisibilityOffIcon fontSize="small" color="warning"/> : <VisibilityIcon fontSize="small"/>}
        </IconButton>
        {/* Edit toggle */}
        <IconButton size="small" color={item.editing?"primary":"default"}
          onClick={()=>onUpdate({editing:!item.editing})} title="Edit settings"
          sx={{ border:"1px solid", borderColor:item.editing?"primary.main":"divider" }}
        >
          <TuneIcon fontSize="small"/>
        </IconButton>
        <Button size="small" variant="contained" sx={{ minWidth:54, fontSize:11 }}
          startIcon={saving?<CircularProgress size={12} color="inherit"/>:<SaveIcon fontSize="small"/>}
          onClick={()=>onSave({...draft, visible: item.visible, editing: draft.editing})} disabled={saving}
        >
          {saving?"Saving\u2026":"Save"}
        </Button>
        <Button size="small" variant="outlined" color="warning" sx={{ fontSize:11 }}
          startIcon={<RestartAltIcon fontSize="small"/>}
          onClick={()=>{ const f=createDisplayItem(); setDraft({...f,id:draft.id,title:draft.title,pathCol:draft.pathCol,expanded:draft.expanded,editing:draft.editing}); }}>Reset</Button>
        <IconButton size="small" color="error" onClick={onRemove}><DeleteIcon fontSize="small"/></IconButton>
        <IconButton size="small" onClick={onMoveUp} disabled={!onMoveUp} title="Move left"><ArrowUpwardIcon fontSize="small"/></IconButton>
        <IconButton size="small" onClick={onMoveDown} disabled={!onMoveDown} title="Move right"><ArrowDownwardIcon fontSize="small"/></IconButton>
      </Box>

      <Collapse in={item.expanded && item.visible !== false}>
        {/* ── Settings panel ── */}
        <Collapse in={!!item.editing}>
          <Box sx={{ p:1.5, pb:1, borderBottom:"1px solid", borderColor:"divider", display:"flex", flexDirection:"column", gap:1.5 }}>

            {/* Path + mode + BG */}
            <Box sx={{ display:"flex", gap:1.5, flexWrap:"wrap", alignItems:"center" }}>
              <FormControl size="small" sx={{ minWidth:240 }}>
                <InputLabel sx={{ fontSize:12 }}>File path column</InputLabel>
                <Select label="File path column" value={draft.pathCol}
                  onChange={e=>draftUpdate({pathCol:e.target.value})} sx={{ fontSize:12 }}>
                  <MenuItem value=""><em>Select\u2026</em></MenuItem>
                  {pathCols.map(c=>{const{table,col}=parsePathCol(c);return<MenuItem key={c} value={c} sx={{fontSize:12}}>{table}: {col}</MenuItem>;})}
                </Select>
              </FormControl>
              {resolvedFile&&<Chip label={resolvedFile} size="small" sx={{ fontSize:10 }}/>}
              {draft.pathCol&&selectedEntry&&!resolvedFile&&!isLoadingFile&&(
                <Typography fontSize={11} color="warning.main">Path not set</Typography>
              )}
              <Box sx={{ display:"flex", alignItems:"center", gap:0.5 }}>
                <Typography fontSize={12} color="text.secondary">Mode:</Typography>
                {(["2d","3d","dist"] as ChartMode[]).map(m=>(
                  <Button key={m} size="small" variant={draft.chartMode===m?"contained":"outlined"}
                    onClick={()=>draftUpdate({chartMode:m})} sx={{ fontSize:11, minWidth:38, py:0.2 }}
                  >{m.toUpperCase()}</Button>
                ))}
              </Box>
              <Box sx={{ display:"flex", alignItems:"center", gap:0.5 }}>
                <Typography fontSize={12} color="text.secondary">BG:</Typography>
                <input type="color" value={draft.chartBgColor}
                  onChange={e=>draftUpdate({chartBgColor:e.target.value})}
                  style={{ width:36, height:26, border:"1px solid #bbb", borderRadius:4, cursor:"pointer", padding:1 }}
                />
              </Box>
              <FormControlLabel
                control={<Checkbox size="small" sx={{ py:0.1 }} checked={draft.showLegend !== false}
                  onChange={e=>draftUpdate({showLegend:e.target.checked})}/>}
                label={<Typography fontSize={12}>Legend</Typography>}
              />
            </Box>

            {/* Axis selectors */}
            {availHeaders.length>0 && (
              <Box sx={{ display:"flex", flexDirection:"column", gap:0.8 }}>
                {/* X */}
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb:0.3 }}>
                    X axis{xColMissing&&<Chip label={`"${item.xCol}" not found`} size="small" color="warning" sx={{ml:1,fontSize:10}}/>}
                  </Typography>
                  <Box sx={{ display:"flex", gap:0.4, flexWrap:"wrap" }}>
                    {availHeaders.map(h=>(
                      <Button key={h} size="small" variant={item.xCol===h?"contained":"outlined"}
                        onClick={()=>{const p={xCol:h,yCols:item.yCols.filter(y=>y!==h)};onUpdate(p);draftUpdate(p);}}
                        sx={{ fontSize:11, py:0.1, minWidth:50 }}>{h}</Button>
                    ))}
                  </Box>
                </Box>
                {/* Y */}
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb:0.3 }}>
                    {item.chartMode==="3d"?"Y axis (pick one)":"Y axis / series order (↑↓ to reorder)"}
                    {yColsMissing.length>0&&<Chip label={`"${yColsMissing.join(", ")}" not found`} size="small" color="warning" sx={{ml:1,fontSize:10}}/>}
                    {(draft.hiddenYCols??[]).length>0&&(
                      <Chip label="Show all" size="small" color="default" sx={{ml:1,fontSize:10,cursor:"pointer"}}
                        onClick={()=>{onUpdate({hiddenYCols:[]});draftUpdate({hiddenYCols:[]});}}/>
                    )}
                  </Typography>
                  {/* Unified series list: Y cols + PF series in one reorderable list */}
                  {settingsSeriesOrder.length > 0 && (
                    <Box sx={{ display:"flex", flexDirection:"column", gap:0.3, mb:0.5, maxHeight:200, overflowY:"auto" }}>
                      {settingsSeriesOrder.map((id, si) => {
                        const isYCol = draft.yCols.includes(id);
                        const pf = !isYCol ? (draft.pfSeries??[]).find(p=>p.id===id) : undefined;
                        const isHidden = isYCol ? (draft.hiddenYCols??[]).includes(id) : (pf?.hidden ?? false);
                        return (
                          <Box key={id} sx={{ display:"flex", alignItems:"center", gap:0.3,
                            bgcolor: isHidden ? "grey.100" : (isYCol ? "primary.50" : "grey.50"),
                            border:"1px solid",
                            borderColor: isHidden ? "grey.300" : (isYCol ? "primary.200" : (pf?.color??"grey.300")),
                            borderRadius:0.5, px:0.5, py:0.2 }}>
                            <IconButton size="small" sx={{ p:0.2 }}
                              onClick={()=>{
                                if (isYCol) {
                                  const hidden=draft.hiddenYCols??[];
                                  const p={hiddenYCols:hidden.includes(id)?hidden.filter(c=>c!==id):[...hidden,id]};
                                  onUpdate(p); draftUpdate(p);
                                } else {
                                  const ns=[...(draft.pfSeries??[])]; const pi=ns.findIndex(p=>p.id===id);
                                  if(pi>=0){ns[pi]={...ns[pi],hidden:!ns[pi].hidden}; draftUpdate({pfSeries:ns}); onUpdate({pfSeries:ns});}
                                }
                              }}>
                              {isHidden
                                ?<VisibilityOffIcon sx={{fontSize:13,color:"warning.main"}}/>
                                :<VisibilityIcon sx={{fontSize:13,color:"primary.main"}}/>}
                            </IconButton>
                            <Typography fontSize={11} sx={{ flex:1, fontWeight:500, color:isYCol?"text.primary":"primary.main" }}>
                              {isYCol ? id : (pf?.label || `${pf?.yCol}_pf`)}
                            </Typography>
                            {!isYCol&&<Typography fontSize={9} sx={{ bgcolor:"primary.50", color:"primary.main", px:0.4, borderRadius:0.5, flexShrink:0 }}>PF</Typography>}
                            {isYCol&&availHeaders.length>0&&!availHeaders.includes(id)&&<Typography fontSize={9} color="warning.main" sx={{flexShrink:0}}>!</Typography>}
                            <IconButton size="small" disabled={si===0} sx={{ p:0.2 }}
                              onClick={()=>{
                                const ns=[...settingsSeriesOrder]; [ns[si-1],ns[si]]=[ns[si],ns[si-1]];
                                draftUpdate({seriesOrder:ns}); onUpdate({seriesOrder:ns});
                              }}>
                              <ArrowUpwardIcon sx={{ fontSize:13 }}/>
                            </IconButton>
                            <IconButton size="small" disabled={si===settingsSeriesOrder.length-1} sx={{ p:0.2 }}
                              onClick={()=>{
                                const ns=[...settingsSeriesOrder]; [ns[si+1],ns[si]]=[ns[si],ns[si+1]];
                                draftUpdate({seriesOrder:ns}); onUpdate({seriesOrder:ns});
                              }}>
                              <ArrowDownwardIcon sx={{ fontSize:13 }}/>
                            </IconButton>
                            {isYCol&&(
                              <IconButton size="small" color="error" sx={{ p:0.2 }}
                                onClick={()=>{const p={yCols:draft.yCols.filter(y=>y!==id)};onUpdate(p);draftUpdate(p);}}>
                                <DeleteIcon sx={{ fontSize:13 }}/>
                              </IconButton>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                  {/* Unselected headers to add */}
                  <Box sx={{ display:"flex", gap:0.3, flexWrap:"wrap" }}>
                    {availHeaders.filter(h=>h!==item.xCol&&!item.yCols.includes(h)&&(item.chartMode==="2d"||h!==item.zCol)).map(h=>(
                      <Button key={h} size="small" variant="outlined" color="inherit"
                        onClick={()=>{
                          const yCols = item.chartMode==="3d" ? [h] : [...item.yCols, h];
                          onUpdate({yCols}); draftUpdate({yCols});
                        }}
                        sx={{ fontSize:10, py:0.1, minWidth:40, color:"text.secondary", borderColor:"grey.300" }}>+ {h}</Button>
                    ))}
                  </Box>
                </Box>
                {/* Z axis: depth in 3D, color col in 2D */}
                {item.xCol && availHeaders.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb:0.3 }}>
                      Z axis{item.chartMode==="2d" ? " (color col  Eauto-enables colormap on scatter)" : " (depth)"}
                      {zColMissing&&<Chip label={`"${item.zCol}" not found`} size="small" color="warning" sx={{ml:1,fontSize:10}}/>}
                    </Typography>
                    <Box sx={{ display:"flex", gap:0.4, flexWrap:"wrap" }}>
                      <Button size="small" variant={item.zCol===""?"contained":"outlined"}
                        onClick={()=>handleZColChange("")}
                        sx={{ fontSize:11, py:0.1, minWidth:40 }}>None</Button>
                      {availHeaders.filter(h=>h!==item.xCol).map(h=>(
                        <Button key={h} size="small" variant={item.zCol===h?"contained":"outlined"}
                          onClick={()=>handleZColChange(item.zCol===h?"":h)}
                          sx={{ fontSize:11, py:0.1, minWidth:50 }}>{h}</Button>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {/* Axis labels & ranges */}
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb:0.5 }}>Axis labels &amp; ranges</Typography>
              <Box sx={{ display:"flex", flexDirection:"column", gap:0.6 }}>
                {draft.chartMode !== "dist" ? (
                  <>
                    <Box sx={{ display:"flex", alignItems:"center", gap:1, flexWrap:"wrap" }}>
                      <Typography fontSize={11} color="text.secondary" sx={{ minWidth:14 }}>X</Typography>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.5 }}>
                        <Typography fontSize={10} color="text.secondary">Label</Typography>
                        <TextField size="small" value={localXL} placeholder={effectiveX||"X"}
                          onChange={e=>setLocalXL(e.target.value)} onBlur={()=>draftUpdate({xLabel:localXL})}
                          onKeyDown={e=>{if(e.key==="Enter"){draftUpdate({xLabel:localXL});(e.target as HTMLInputElement).blur();}}}
                          inputProps={{ style:{fontSize:11,width:90} }} sx={{ width:112 }}/>
                      </Box>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.4 }}>
                        <Typography fontSize={10} color="text.secondary">Range</Typography>
                        <NumInput value={draft.xMin} width={60} onChange={v=>draftUpdate({xMin:v})}/>
                        <Typography fontSize={10}>~</Typography>
                        <NumInput value={draft.xMax} width={60} onChange={v=>draftUpdate({xMax:v})}/>
                      </Box>
                    </Box>
                    <Box sx={{ display:"flex", alignItems:"center", gap:1, flexWrap:"wrap" }}>
                      <Typography fontSize={11} color="text.secondary" sx={{ minWidth:14 }}>Y</Typography>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.5 }}>
                        <Typography fontSize={10} color="text.secondary">Label</Typography>
                        <TextField size="small" value={localYL} placeholder={effectiveY.join(",")||"Y"}
                          onChange={e=>setLocalYL(e.target.value)} onBlur={()=>draftUpdate({yLabel:localYL})}
                          onKeyDown={e=>{if(e.key==="Enter"){draftUpdate({yLabel:localYL});(e.target as HTMLInputElement).blur();}}}
                          inputProps={{ style:{fontSize:11,width:90} }} sx={{ width:112 }}/>
                      </Box>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.4 }}>
                        <Typography fontSize={10} color="text.secondary">Range</Typography>
                        <NumInput value={draft.yMin} width={60} onChange={v=>draftUpdate({yMin:v})}/>
                        <Typography fontSize={10}>~</Typography>
                        <NumInput value={draft.yMax} width={60} onChange={v=>draftUpdate({yMax:v})}/>
                      </Box>
                    </Box>
                  </>
                ) : (
                  <>
                    <Box sx={{ display:"flex", alignItems:"center", gap:1, flexWrap:"wrap" }}>
                      <Typography fontSize={11} color="text.secondary" sx={{ minWidth:14 }}>X</Typography>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.5 }}>
                        <Typography fontSize={10} color="text.secondary">Label</Typography>
                        <TextField size="small" value={localXL} placeholder={effectiveX||"X"}
                          onChange={e=>setLocalXL(e.target.value)} onBlur={()=>draftUpdate({xLabel:localXL})}
                          onKeyDown={e=>{if(e.key==="Enter"){draftUpdate({xLabel:localXL});(e.target as HTMLInputElement).blur();}}}
                          inputProps={{ style:{fontSize:11,width:90} }} sx={{ width:112 }}/>
                      </Box>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.4 }}>
                        <Typography fontSize={10} color="text.secondary">Range</Typography>
                        <NumInput value={draft.distXMin} width={60} onChange={v=>draftUpdate({distXMin:v})}/>
                        <Typography fontSize={10}>~</Typography>
                        <NumInput value={draft.distXMax} width={60} onChange={v=>draftUpdate({distXMax:v})}/>
                      </Box>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.4 }}>
                        <Typography fontSize={10} color="text.secondary">Step</Typography>
                        <NumInput value={draft.distXStep} width={60} onChange={v=>draftUpdate({distXStep:v})}/>
                      </Box>
                    </Box>
                    <Box sx={{ display:"flex", alignItems:"center", gap:1, flexWrap:"wrap" }}>
                      <Typography fontSize={11} color="text.secondary" sx={{ minWidth:14 }}>Y</Typography>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.5 }}>
                        <Typography fontSize={10} color="text.secondary">Label</Typography>
                        <TextField size="small" value={localYL} placeholder={effectiveY.join(",")||"Y"}
                          onChange={e=>setLocalYL(e.target.value)} onBlur={()=>draftUpdate({yLabel:localYL})}
                          onKeyDown={e=>{if(e.key==="Enter"){draftUpdate({yLabel:localYL});(e.target as HTMLInputElement).blur();}}}
                          inputProps={{ style:{fontSize:11,width:90} }} sx={{ width:112 }}/>
                      </Box>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.4 }}>
                        <Typography fontSize={10} color="text.secondary">Range</Typography>
                        <NumInput value={draft.distYMin} width={60} onChange={v=>draftUpdate({distYMin:v})}/>
                        <Typography fontSize={10}>~</Typography>
                        <NumInput value={draft.distYMax} width={60} onChange={v=>draftUpdate({distYMax:v})}/>
                      </Box>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.4 }}>
                        <Typography fontSize={10} color="text.secondary">Step</Typography>
                        <NumInput value={draft.distYStep} width={60} onChange={v=>draftUpdate({distYStep:v})}/>
                      </Box>
                    </Box>
                    <Typography fontSize={10} color="text.secondary" sx={{ pl:"20px" }}>(range &amp; step: auto if blank)</Typography>
                    <Box sx={{ display:"flex", alignItems:"center", gap:1, flexWrap:"wrap" }}>
                      <Typography fontSize={11} color="text.secondary" sx={{ minWidth:14 }}>C</Typography>
                      <Box sx={{ display:"flex", alignItems:"center", gap:0.4 }}>
                        <Typography fontSize={10} color="text.secondary">Cmap</Typography>
                        <NumInput value={draft.distCmapMin} width={60} onChange={v=>draftUpdate({distCmapMin:v})}/>
                        <Typography fontSize={10}>~</Typography>
                        <NumInput value={draft.distCmapMax} width={60} onChange={v=>draftUpdate({distCmapMax:v})}/>
                        <Typography fontSize={10} color="text.secondary">% (auto if blank)</Typography>
                      </Box>
                    </Box>
                  </>
                )}
              </Box>
            </Box>

            {/* Per-series style */}
            {draft.yCols.length>0&&availHeaders.length>0&&(
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb:0.5 }}>Series style</Typography>
                {draft.yCols.map((col,i)=>(
                  <SeriesStyleRow key={col} col={col} index={i} item={draft}
                    seriesType={draft.seriesTypes[col]??"line"}
                    chartMode={draft.chartMode} availHeaders={availHeaders}
                    onStyleChange={patch=>updateStyle(col,patch)}
                    onTypeChange={t=>setSeriesType(col,t)}
                  />
                ))}
              </Box>
            )}

            {/* Percentile filter (rolling window) */}
            {draft.chartMode==="2d" && availHeaders.length>0 && (
              <Box>
                <FormControlLabel
                  control={<Checkbox size="small" sx={{ py:0.1 }} checked={draft.pfEnabled??false}
                    onChange={e=>draftUpdate({pfEnabled:e.target.checked})}/>}
                  label={<Typography fontSize={12}>Percentile filter (rolling window)</Typography>}
                />
                {draft.pfEnabled && (
                  <Box sx={{ pl:1, display:"flex", flexDirection:"column", gap:1, mt:0.5 }}>
                    {/* Window size and percentile */}
                    <Box sx={{ display:"flex", gap:1, flexWrap:"wrap", alignItems:"center" }}>
                      <Typography fontSize={11} color="text.secondary">Window</Typography>
                      <NumInput value={draft.pfWindowN??"11"} width={50} placeholder="11"
                        onChange={v=>{ const n=parseInt(v,10)||11; draftUpdate({pfWindowN:String(n%2===0?n+1:n)}); }}/>
                      <Typography fontSize={11} color="text.secondary">pt (odd)</Typography>
                      <Typography fontSize={11} color="text.secondary" sx={{ ml:1 }}>Percentile</Typography>
                      <NumInput value={draft.pfPercent??"50"} width={46} placeholder="50" onChange={v=>draftUpdate({pfPercent:v})}/>
                      <Typography fontSize={11} color="text.secondary">%</Typography>
                    </Box>
                    {/* Filtered series list */}
                    {(draft.pfSeries??[]).map((pf, pi)=>(
                      <Box key={pf.id} sx={{ display:"flex", gap:0.8, alignItems:"center", flexWrap:"wrap",
                        pl:0.5, borderLeft:"3px solid", borderColor:pf.color, py:0.4, pr:0.5,
                        bgcolor:"grey.50", borderRadius:"0 4px 4px 0",
                        opacity: pf.hidden ? 0.45 : 1 }}>
                        <IconButton size="small" sx={{ p:0.2 }}
                          onClick={()=>{ const ns=[...(draft.pfSeries??[])]; ns[pi]={...pf,hidden:!pf.hidden}; draftUpdate({pfSeries:ns}); onUpdate({pfSeries:ns}); }}>
                          {pf.hidden
                            ?<VisibilityOffIcon sx={{fontSize:13,color:"text.disabled"}}/>
                            :<VisibilityIcon sx={{fontSize:13,color:"primary.main"}}/>}
                        </IconButton>
                        <FormControl size="small" sx={{ minWidth:110 }}>
                          <InputLabel sx={{ fontSize:11 }}>Y col</InputLabel>
                          <Select label="Y col" value={pf.yCol}
                            onChange={e=>{ const ns=[...(draft.pfSeries??[])]; ns[pi]={...pf,yCol:e.target.value}; draftUpdate({pfSeries:ns}); }}
                            sx={{ fontSize:11 }}>
                            {availHeaders.map(h=><MenuItem key={h} value={h} sx={{fontSize:11}}>{h}</MenuItem>)}
                            {pi>0 && (draft.pfSeries??[]).slice(0,pi).map(prev=>(
                              <MenuItem key={prev.id} value={prev.id} sx={{fontSize:11,color:"primary.main"}}>
                                {prev.label||`${prev.yCol}_pf`} (PF)
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <TextField size="small" placeholder={pf.yCol?`${pf.yCol}_pf`:"label"} value={pf.label}
                          onChange={e=>{ const ns=[...(draft.pfSeries??[])]; ns[pi]={...pf,label:e.target.value}; draftUpdate({pfSeries:ns}); }}
                          inputProps={{ style:{fontSize:11,width:100} }} sx={{ width:122 }}/>
                        <ColorInput value={pf.color}
                          onChange={c=>{ const ns=[...(draft.pfSeries??[])]; ns[pi]={...pf,color:c}; draftUpdate({pfSeries:ns}); }}/>
                        <TextField size="small" type="number" value={pf.strokeWidth}
                          onChange={e=>{ const ns=[...(draft.pfSeries??[])]; ns[pi]={...pf,strokeWidth:parseFloat(e.target.value)||1}; draftUpdate({pfSeries:ns}); }}
                          inputProps={{ style:{fontSize:11,width:30} }} sx={{ width:52 }}/>
                        <Select size="small" value={pf.dashArray}
                          onChange={e=>{ const ns=[...(draft.pfSeries??[])]; ns[pi]={...pf,dashArray:e.target.value}; draftUpdate({pfSeries:ns}); }}
                          sx={{ fontSize:11, minWidth:72 }}>
                          {DASH_OPTIONS.map(o=><MenuItem key={o.value} value={o.value} title={o.title} sx={{fontSize:12}}>{o.label}</MenuItem>)}
                        </Select>
                        <IconButton size="small" color="error"
                          onClick={()=>draftUpdate({pfSeries:(draft.pfSeries??[]).filter((_,k)=>k!==pi)})}>
                          <DeleteIcon fontSize="small"/>
                        </IconButton>
                      </Box>
                    ))}
                    <Button size="small" startIcon={<AddIcon/>} variant="outlined" sx={{ alignSelf:"flex-start", fontSize:11 }}
                      onClick={()=>{
                        const newPf: PfSeriesConfig = {
                          id: crypto.randomUUID(),
                          yCol: availHeaders[0]??"",
                          label: "",
                          color: PALETTE[(draft.pfSeries??[]).length % PALETTE.length],
                          strokeWidth: 2,
                          dashArray: "6 3",
                        };
                        draftUpdate({pfSeries:[...(draft.pfSeries??[]), newPf]});
                      }}>
                      Add filtered series
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {/* X-range averages (multiple) */}
            {draft.chartMode==="2d" && effectiveX && effectiveY.length>0 && (
              <Box>
                <Box sx={{ display:"flex", alignItems:"center", gap:0.5 }}>
                  <Typography fontSize={12} fontWeight={500}>X-range averages</Typography>
                  <IconButton size="small" color="primary"
                    onClick={()=>{
                      const newAr: AvgRangeConfig = { id: crypto.randomUUID(), xMin:"", xMax:"", yCols:[], label:"" };
                      draftUpdate({ avgRanges: [...(draft.avgRanges??[]), newAr] });
                    }}>
                    <AddIcon fontSize="small"/>
                  </IconButton>
                </Box>
                {(draft.avgRanges??[]).map((ar, ai)=>{
                  const arAvg = avgValues.filter(v=>v.rangeId===ar.id);
                  return (
                    <Box key={ar.id} sx={{ mt:0.5, pl:1, borderLeft:"3px solid", borderColor:"info.main",
                      bgcolor:"grey.50", borderRadius:"0 4px 4px 0", py:0.5, pr:0.5,
                      display:"flex", flexDirection:"column", gap:0.5 }}>
                      {/* Row 1: label + x range + delete */}
                      <Box sx={{ display:"flex", gap:0.5, alignItems:"center", flexWrap:"wrap" }}>
                        <TextField size="small" placeholder="label" value={ar.label}
                          onChange={e=>{ const n=[...(draft.avgRanges??[])]; n[ai]={...ar,label:e.target.value}; draftUpdate({avgRanges:n}); }}
                          inputProps={{ style:{fontSize:11,width:80} }} sx={{ width:100 }}/>
                        <Typography fontSize={11} color="text.secondary">X:</Typography>
                        <NumInput value={ar.xMin} width={60} placeholder="min"
                          onChange={v=>{ const n=[...(draft.avgRanges??[])]; n[ai]={...ar,xMin:v}; draftUpdate({avgRanges:n}); }}/>
                        <Typography fontSize={11}>～</Typography>
                        <NumInput value={ar.xMax} width={60} placeholder="max"
                          onChange={v=>{ const n=[...(draft.avgRanges??[])]; n[ai]={...ar,xMax:v}; draftUpdate({avgRanges:n}); }}/>
                        <IconButton size="small" color="error"
                          onClick={()=>draftUpdate({avgRanges:(draft.avgRanges??[]).filter((_,k)=>k!==ai)})}>
                          <DeleteIcon fontSize="small"/>
                        </IconButton>
                      </Box>
                      {/* Row 2: Y cols selector (empty = all) */}
                      <Box sx={{ display:"flex", gap:0.3, flexWrap:"wrap", alignItems:"center" }}>
                        <Typography fontSize={10} color="text.secondary" sx={{ mr:0.2 }}>Y (empty=all):</Typography>
                        {effectiveY.map(col=>(
                          <FormControlLabel key={col}
                            control={<Checkbox size="small" sx={{ py:0.1 }} checked={ar.yCols.includes(col)}
                              onChange={e=>{
                                const nc = e.target.checked ? [...ar.yCols,col] : ar.yCols.filter(c=>c!==col);
                                const n=[...(draft.avgRanges??[])]; n[ai]={...ar,yCols:nc}; draftUpdate({avgRanges:n});
                              }}/>}
                            label={<Typography fontSize={10}>{col}</Typography>} sx={{ mr:0.3 }}
                          />
                        ))}
                        {draft.pfEnabled && (draft.pfSeries??[]).map(pf=>(
                          <FormControlLabel key={pf.id}
                            control={<Checkbox size="small" sx={{ py:0.1 }} checked={ar.yCols.includes(pf.id)}
                              onChange={e=>{
                                const nc = e.target.checked ? [...ar.yCols,pf.id] : ar.yCols.filter(c=>c!==pf.id);
                                const n=[...(draft.avgRanges??[])]; n[ai]={...ar,yCols:nc}; draftUpdate({avgRanges:n});
                              }}/>}
                            label={<Typography fontSize={10} sx={{color:"primary.main"}}>{pf.label||`${pf.yCol}_pf`}</Typography>} sx={{ mr:0.3 }}
                          />
                        ))}
                      </Box>
                      {/* Row 3: computed avg chips */}
                      {arAvg.length>0 && (
                        <Box sx={{ display:"flex", gap:0.5, flexWrap:"wrap" }}>
                          {arAvg.map(({col,colLabel,val,color})=>(
                            <Chip key={col} size="small"
                              label={`${ar.label?ar.label+" ":""}avg ${colLabel}: ${val.toFixed(4)}`}
                              sx={{ fontSize:10, bgcolor:color+"22", borderColor:color, border:"1px solid" }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Collapse>

        {/* ── Chart area ── */}
        <Box ref={chartAreaRef} sx={{ p:1 }}>
          {!draft.pathCol ? (
            <Hint>[\u2261] Open Edit \u2192 select a file path column</Hint>
          ) : !selectedEntry ? (
            <Hint>Select an experiment above</Hint>
          ) : hasError ? (
            <Hint>Failed to load file \u2014 press \u21ba to retry</Hint>
          ) : !resolvedFile ? (
            <Hint>Path column not set for this experiment</Hint>
          ) : isLoadingFile ? (
            <Box sx={{ height:80, display:"flex", alignItems:"center", justifyContent:"center", gap:1 }}>
              <CircularProgress size={18}/><Typography fontSize={12} color="text.secondary">Loading\u2026</Typography>
            </Box>
          ) : draft.chartMode==="2d" ? (
            !ready2D ? <Hint>[\u2261] Select X and Y columns</Hint>
            : chartData2D.length===0 ? <Hint>No data</Hint>
            : (
              <Box sx={{ bgcolor:draft.chartBgColor, borderRadius:1, p:1, overflow:"hidden", display:"flex", gap:0.5 }}>
                <Box sx={{ flexGrow:1, minWidth:0 }}>
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <LineChart data={chartData2D} margin={{ top:5, right:20, bottom:32, left:10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25}/>
                    <XAxis dataKey={effectiveX} tickFormatter={xTickFmt} tick={{ fontSize:10 }}
                      domain={xDomain} allowDataOverflow={!!xDomain}
                      label={{ value:draft.xLabel||effectiveX, position:"insideBottom", offset:-16, fontSize:11 }}
                    />
                    <YAxis tick={{ fontSize:10 }} width={draft.yLabel?72:52}
                      domain={yDomain} allowDataOverflow={!!yDomain}
                      label={draft.yLabel?{ value:draft.yLabel, angle:-90, position:"insideLeft", fontSize:11, offset:10 }:undefined}
                    />
                    <ChartTooltip contentStyle={{ fontSize:11 }}
                      formatter={(v:number)=>[typeof v==="number"?v.toFixed(4):v,""]}
                    />
                    {draft.showLegend !== false && <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize:11 }}/>}
                    {/* X range colored backgrounds — behind everything */}
                    {(draft.avgRanges??[]).map((ar)=>{
                      const x1=parseNum(ar.xMin??"");
                      const x2=parseNum(ar.xMax??"");
                      if (x1===undefined&&x2===undefined) return null;
                      const rangeAvgVals=avgValues.filter(v=>v.rangeId===ar.id);
                      const rangeColor=rangeAvgVals[0]?.color??"#888";
                      return (
                        <ReferenceArea key={`bg-${ar.id}`}
                          x1={x1} x2={x2}
                          fill={rangeColor} fillOpacity={0.10}
                          stroke={rangeColor} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="4 3"
                          label={(lp: any)=>{
                            const vb=lp?.viewBox; if(!vb) return null;
                            const cx=vb.x+vb.width/2;
                            return (
                              <g>
                                {rangeAvgVals.map((item,i)=>(
                                  <text key={item.col} x={cx} y={vb.y+11+i*12}
                                    textAnchor="middle" fontSize={9} fill={item.color}
                                    fontWeight={600} style={{pointerEvents:"none"}}>
                                    {`${item.colLabel}: ${item.val.toFixed(4)}`}
                                  </text>
                                ))}
                              </g>
                            );
                          }}
                        />
                      );
                    })}
                    {settingsSeriesOrder.map(id=>{
                      if (draft.yCols.includes(id)) {
                        if (!availHeaders.includes(id)||(draft.hiddenYCols??[]).includes(id)) return null;
                        const i=draft.yCols.indexOf(id);
                        const s=getSeriesStyle(draft.seriesStyles,id,i);
                        const t=draft.seriesTypes[id]??"line";
                        const Dot=dotRenderers[id];
                        return (
                          <Line key={id} type="monotone" dataKey={id} name={id}
                            stroke={s.useColormap&&t==="scatter"?"transparent":s.color}
                            strokeWidth={t==="scatter"?0:s.strokeWidth}
                            strokeDasharray={t==="scatter"?undefined:(s.dashArray||undefined)}
                            dot={t==="scatter"&&Dot?(Dot as any):false}
                            activeDot={t==="scatter"?false:{ r:3, fill:s.color }}
                            isAnimationActive={false}
                          />
                        );
                      } else {
                        const pf=(draft.pfSeries??[]).find(p=>p.id===id);
                        if (!pf||!draft.pfEnabled||pf.hidden) return null;
                        return (
                          <Line key={`pf-${pf.id}`} type="monotone" dataKey={pf.id}
                            name={pf.label||`${pf.yCol}_pf`}
                            stroke={pf.color} strokeWidth={pf.strokeWidth||2}
                            strokeDasharray={pf.dashArray||undefined}
                            dot={false} activeDot={{ r:3, fill:pf.color }}
                            isAnimationActive={false} connectNulls
                          />
                        );
                      }
                    })}
                  </LineChart>
                </ResponsiveContainer>
                </Box>
                {/* 2D colormap colorbars */}
                {effectiveY.filter(col=>{
                  const t=draft.seriesTypes[col]??"line";
                  const idx=effectiveY.indexOf(col);
                  const s=getSeriesStyle(draft.seriesStyles,col,idx);
                  return t==="scatter"&&s.useColormap;
                }).map(col=>{
                  const idx=effectiveY.indexOf(col);
                  const s=getSeriesStyle(draft.seriesStyles,col,idx);
                  const cmCol=s.colormapCol||col;
                  const [dataMn,dataMx]=(availHeaders.includes(cmCol)?colMinMax[cmCol]:null)??[0,1];
                  const mn=parseNum(s.colormapMin)??dataMn;
                  const mx=parseNum(s.colormapMax)??dataMx;
                  return <ColormapBar2D key={col} uid={`${draft.id}-${col}`}
                    name={s.colormapName} minVal={mn} maxVal={mx} label={cmCol}
                    bgColor={draft.chartBgColor}/>;
                })}
              </Box>
            )
          ) : draft.chartMode==="dist" ? (
            !readyDist ? <Hint>[\u2261] Select X and Y columns</Hint>
            : !distData ? <Hint>No data in range</Hint>
            : (
              <Box sx={{ bgcolor:draft.chartBgColor, borderRadius:1, overflow:"hidden" }}>
                <DistHeatmap
                  pct={distData.pct}
                  xMin={distData.xMin} xMax={distData.xMax} xStep={distData.xStep} xNum={distData.xNum}
                  yMin={distData.yMin} yMax={distData.yMax} yStep={distData.yStep} yNum={distData.yNum}
                  xLabel={draft.xLabel||distData.xCol} yLabel={draft.yLabel||distData.yCol}
                  maxPct={distData.maxPct} bgColor={draft.chartBgColor}
                  cmapMin={parseNum(draft.distCmapMin)} cmapMax={parseNum(draft.distCmapMax)}
                />
              </Box>
            )
          ) : (
            !ready3D ? <Hint>[\u2261] Select X, Y, Z columns</Hint>
            : !rows?.length ? <Hint>No data</Hint>
            : (
              <Box sx={{ bgcolor:draft.chartBgColor, borderRadius:1, overflow:"hidden" }}>
                <Plot3D rows={rows} xCol={effectiveX} yCols={effectiveY} zCol={effectiveZ}
                  seriesStyles={draft.seriesStyles} bgColor={draft.chartBgColor} availHeaders={availHeaders}
                  xLabel={draft.xLabel} yLabel={draft.yLabel}
                  xMin={draft.xMin} xMax={draft.xMax} yMin={draft.yMin} yMax={draft.yMax}
                  showLegend={draft.showLegend !== false}
                />
              </Box>
            )
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── DistHeatmap ───────────────────────────────────────────────────────────────
const INFERNO_STOPS: [number, [number,number,number]][] = [
  [0.00, [  0,   0,   4]],
  [0.20, [ 40,  11,  84]],
  [0.40, [101,  21, 110]],
  [0.60, [167,  54,  72]],
  [0.80, [224, 120,  18]],
  [1.00, [252, 255, 164]],
];

function infernoColor(t: number): string {
  const s = INFERNO_STOPS;
  for (let i=1; i<s.length; i++) {
    if (t <= s[i][0]) {
      const [t0,c0] = s[i-1], [t1,c1] = s[i];
      const f = (t-t0)/(t1-t0);
      const r = Math.round(c0[0]+f*(c1[0]-c0[0]));
      const g = Math.round(c0[1]+f*(c1[1]-c0[1]));
      const b = Math.round(c0[2]+f*(c1[2]-c0[2]));
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(252,255,164)`;
}

interface DistHeatmapProps {
  pct: number[][];
  xMin: number; xMax: number; xStep: number; xNum: number;
  yMin: number; yMax: number; yStep: number; yNum: number;
  xLabel: string; yLabel: string;
  maxPct: number; bgColor: string;
  cmapMin?: number; cmapMax?: number;
}

function DistHeatmap({ pct, xMin, xMax: _xMax, xStep, xNum, yMin, yMax: _yMax, yStep, yNum, xLabel, yLabel, maxPct, bgColor, cmapMin, cmapMax }: DistHeatmapProps) {
  const svgH = CHART_HEIGHT;
  const mt = 12, mb = 68;
  const cMin = cmapMin ?? 0;
  const cMax = cmapMax ?? maxPct;

  // Colorbar gradient stops: top=max(yellow), bottom=min(black)
  const gradStops = INFERNO_STOPS.slice().reverse().map(([t,]) => `${infernoColor(t)} ${Math.round((1-t)*100)}%`).join(",");

  // X axis ticks (up to 8)
  const xTickCount = Math.min(xNum, 8);
  const xTicks = Array.from({length: xTickCount+1}, (_,i) => {
    const idx = Math.round(i * (xNum / xTickCount));
    return { idx: Math.min(idx, xNum), val: xMin + Math.min(idx, xNum) * xStep };
  });

  // Y axis ticks (up to 8)
  const yTickCount = Math.min(yNum, 8);
  const yTicks = Array.from({length: yTickCount+1}, (_,i) => {
    const idx = Math.round(i * (yNum / yTickCount));
    return { idx: Math.min(idx, yNum), val: yMin + Math.min(idx, yNum) * yStep };
  });

  const fmtVal = (v: number) => {
    if (Math.abs(v) >= 10000) return `${(v/1000).toFixed(1)}k`;
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 1) return v.toFixed(2);
    return v.toFixed(3);
  };

  return (
    <Box sx={{ width:"100%", height:svgH, display:"flex", flexDirection:"column", bgcolor:bgColor, userSelect:"none" }}>
      {/* Main layout: Y-label | Y-ticks | grid | colorbar */}
      <Box sx={{ display:"flex", flex:1, minHeight:0, mt:`${mt}px`, mb:`${mb}px` }}>
        {/* Y axis label (rotated) */}
        <Box sx={{ width:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Typography fontSize={11} color="text.secondary"
            sx={{ transform:"rotate(-90deg)", whiteSpace:"nowrap", transformOrigin:"center" }}>
            {yLabel}
          </Typography>
        </Box>
        {/* Y axis ticks */}
        <Box sx={{ width:44, position:"relative", height:"100%" }}>
          {yTicks.map(({idx, val}) => (
            <Typography key={idx} fontSize={9} color="text.secondary"
              sx={{ position:"absolute", right:4, top:`${(idx/yNum)*100}%`,
                transform:"translateY(-50%)", whiteSpace:"nowrap", textAlign:"right" }}>
              {fmtVal(val)}
            </Typography>
          ))}
        </Box>
        {/* Heatmap grid */}
        <Box sx={{ flex:1, minWidth:0, position:"relative", height:"100%" }}>
          <Box sx={{
            position:"absolute", inset:0,
            display:"grid",
            gridTemplateRows:`repeat(${yNum},1fr)`,
            gridTemplateColumns:`repeat(${xNum},1fr)`,
          }}>
            {pct.map((row, yi) => row.map((val, xi) => {
              const t = cMax > cMin ? Math.max(0, Math.min(1, (val - cMin) / (cMax - cMin))) : 0;
              return (
                <Box key={`${yi}-${xi}`}
                  title={`x=${fmtVal(xMin+xi*xStep)}~${fmtVal(xMin+(xi+1)*xStep)}, y=${fmtVal(yMin+yi*yStep)}~${fmtVal(yMin+(yi+1)*yStep)}: ${val.toFixed(3)}%`}
                  sx={{ bgcolor: infernoColor(t) }}
                />
              );
            }))}
          </Box>
          {/* X axis ticks — rotated 45° to prevent overlap */}
          <Box sx={{ position:"absolute", bottom:`-${mb}px`, left:0, right:0, height:`${mb}px`, overflow:"visible" }}>
            {xTicks.map(({idx, val}) => (
              <Typography key={idx} fontSize={9} color="text.secondary"
                sx={{
                  position:"absolute",
                  left:`${(idx/xNum)*100}%`,
                  top:4,
                  transform:"rotate(45deg)",
                  transformOrigin:"left top",
                  whiteSpace:"nowrap",
                }}>
                {fmtVal(val)}
              </Typography>
            ))}
            {/* X axis label */}
            <Typography fontSize={11} color="text.secondary"
              sx={{ position:"absolute", bottom:2, left:"50%", transform:"translateX(-50%)", whiteSpace:"nowrap" }}>
              {xLabel}
            </Typography>
          </Box>
        </Box>
        {/* Colorbar */}
        <Box sx={{ width:20, ml:1, position:"relative", height:"100%",
          background:`linear-gradient(to bottom, ${gradStops})`,
          border:"1px solid rgba(128,128,128,0.3)", borderRadius:0.5 }}
        />
        {/* Colorbar labels */}
        <Box sx={{ width:52, position:"relative", height:"100%", pl:0.5 }}>
          {[0,0.25,0.5,0.75,1].map(t => (
            <Typography key={t} fontSize={9} color="text.secondary"
              sx={{ position:"absolute", top:`${t*100}%`, transform:"translateY(-50%)", whiteSpace:"nowrap" }}>
              {(cMin + (cMax - cMin)*(1-t)).toFixed(2)}%
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ── SeriesStyleRow ─────────────────────────────────────────────────────────────
interface SeriesStyleRowProps {
  col: string; index: number; item: DisplayItem;
  seriesType: SeriesType; chartMode: ChartMode; availHeaders: string[];
  onStyleChange: (patch: Partial<SeriesStyle>)=>void;
  onTypeChange: (t: SeriesType)=>void;
}

function SeriesStyleRow({ col, index, item, seriesType, chartMode, availHeaders, onStyleChange, onTypeChange }: SeriesStyleRowProps) {
  const s = getSeriesStyle(item.seriesStyles, col, index);
  const [localCmMin, setLocalCmMin] = useState(s.colormapMin);
  const [localCmMax, setLocalCmMax] = useState(s.colormapMax);
  useEffect(()=>setLocalCmMin(s.colormapMin), [s.colormapMin]);
  useEffect(()=>setLocalCmMax(s.colormapMax), [s.colormapMax]);

  // 2D colormap only valid for scatter
  const canColormap = chartMode==="3d" || seriesType==="scatter";

  return (
    <Box sx={{ mb:0.8, pl:0.5, borderLeft:"3px solid", borderColor:s.useColormap?"transparent":s.color }}>
      {/* Row 1 */}
      <Box sx={{ display:"flex", alignItems:"center", gap:1, flexWrap:"wrap" }}>
        <Typography fontSize={11} fontWeight="bold" sx={{ minWidth:80, flexShrink:0 }}>{col}</Typography>

        {/* Colormap toggle: 2D only when scatter */}
        {canColormap && (
          <FormControlLabel
            control={<Checkbox size="small" sx={{ py:0.1 }} checked={s.useColormap}
              onChange={e=>onStyleChange({useColormap:e.target.checked})}/>}
            label={<Typography fontSize={10}>Colormap</Typography>} sx={{ mr:0 }}
          />
        )}

        {!s.useColormap && (
          <Box sx={{ display:"flex", alignItems:"center", gap:0.3, flexShrink:0 }}>
            <Typography fontSize={10} color="text.secondary">Color</Typography>
            <ColorInput value={s.color} onChange={c=>onStyleChange({color:c})}/>
          </Box>
        )}

        {chartMode==="2d" && (
          <Box sx={{ display:"flex", gap:0.3, flexShrink:0 }}>
            {(["line","scatter"] as SeriesType[]).map(t=>(
              <Button key={t} size="small" variant={seriesType===t?"contained":"outlined"}
                onClick={()=>onTypeChange(t)} sx={{ fontSize:10, py:0.1, minWidth:54 }}>
                {t==="line"?"Line":"Scatter"}
              </Button>
            ))}
          </Box>
        )}

        {chartMode==="2d"&&seriesType==="line"&&(
          <>
            <Box sx={{ display:"flex", alignItems:"center", gap:0.3, flexShrink:0 }}>
              <Typography fontSize={10} color="text.secondary">Width</Typography>
              <Select size="small" value={s.strokeWidth}
                onChange={e=>onStyleChange({strokeWidth:Number(e.target.value)})}
                sx={{ fontSize:11, minWidth:62, height:26 }}>
                {[0.5,1,1.5,2,3,4].map(w=><MenuItem key={w} value={w} sx={{fontSize:11}}>{w}px</MenuItem>)}
              </Select>
            </Box>
            <Box sx={{ display:"flex", alignItems:"center", gap:0.3, flexShrink:0 }}>
              <Typography fontSize={10} color="text.secondary">Dash</Typography>
              {DASH_OPTIONS.map(opt=>(
                <Button key={opt.value} size="small"
                  variant={s.dashArray===opt.value?"contained":"outlined"}
                  onClick={()=>onStyleChange({dashArray:opt.value})} title={opt.title}
                  sx={{ fontSize:15, minWidth:36, py:0, lineHeight:1.5 }}>{opt.label}</Button>
              ))}
            </Box>
          </>
        )}

        {chartMode==="2d"&&seriesType==="scatter"&&(
          <>
            <Box sx={{ display:"flex", alignItems:"center", gap:0.3, flexShrink:0 }}>
              <Typography fontSize={10} color="text.secondary">Shape</Typography>
              {MARKER_SHAPES_2D.map(m=>(
                <Button key={m.value} size="small"
                  variant={s.markerShape2d===m.value?"contained":"outlined"}
                  onClick={()=>onStyleChange({markerShape2d:m.value})}
                  sx={{ fontSize:14, minWidth:32, py:0, lineHeight:1.6 }}>{m.label}</Button>
              ))}
            </Box>
            <Box sx={{ display:"flex", alignItems:"center", gap:0.3, flexShrink:0 }}>
              <Typography fontSize={10} color="text.secondary">Size</Typography>
              <Select size="small" value={s.markerSize}
                onChange={e=>onStyleChange({markerSize:Number(e.target.value)})}
                sx={{ fontSize:11, minWidth:62, height:26 }}>
                {[3,4,5,6,8,10,12].map(sz=><MenuItem key={sz} value={sz} sx={{fontSize:11}}>{sz}px</MenuItem>)}
              </Select>
            </Box>
          </>
        )}

        {chartMode==="3d"&&(
          <>
            <Box sx={{ display:"flex", alignItems:"center", gap:0.3, flexShrink:0 }}>
              <Typography fontSize={10} color="text.secondary">Shape</Typography>
              {MARKER_SHAPES_3D.map(m=>(
                <Button key={m.value} size="small"
                  variant={s.markerShape3d===m.value?"contained":"outlined"}
                  onClick={()=>onStyleChange({markerShape3d:m.value})}
                  sx={{ fontSize:14, minWidth:32, py:0, lineHeight:1.6 }}>{m.label}</Button>
              ))}
            </Box>
            <Box sx={{ display:"flex", alignItems:"center", gap:0.3, flexShrink:0 }}>
              <Typography fontSize={10} color="text.secondary">Size</Typography>
              <Select size="small" value={s.markerSize}
                onChange={e=>onStyleChange({markerSize:Number(e.target.value)})}
                sx={{ fontSize:11, minWidth:62, height:26 }}>
                {[3,4,5,6,8,10,12,16,20].map(sz=><MenuItem key={sz} value={sz} sx={{fontSize:11}}>{sz}px</MenuItem>)}
              </Select>
            </Box>
          </>
        )}
      </Box>

      {/* Row 2: colormap settings */}
      {s.useColormap&&canColormap&&(
        <Box sx={{ display:"flex", alignItems:"center", gap:1, mt:0.5, flexWrap:"wrap", pl:0.5 }}>
          <FormControl size="small" sx={{ minWidth:110 }}>
            <InputLabel sx={{ fontSize:11 }}>Colormap</InputLabel>
            <Select label="Colormap" value={s.colormapName}
              onChange={e=>onStyleChange({colormapName:e.target.value})} sx={{ fontSize:11 }}>
              {COLORMAP_OPTIONS.map(n=><MenuItem key={n} value={n} sx={{fontSize:11}}>{n}</MenuItem>)}
            </Select>
          </FormControl>
          <Box sx={{ width:80, height:14, borderRadius:1, border:"1px solid #ccc",
            background:colormapGradientCss(s.colormapName), flexShrink:0 }}/>
          <FormControl size="small" sx={{ minWidth:130 }}>
            <InputLabel sx={{ fontSize:11 }}>Color col</InputLabel>
            <Select label="Color col" value={s.colormapCol}
              onChange={e=>onStyleChange({colormapCol:e.target.value})} sx={{ fontSize:11 }}>
              <MenuItem value="" sx={{fontSize:11}}><em>= Y ({col})</em></MenuItem>
              {availHeaders.map(h=><MenuItem key={h} value={h} sx={{fontSize:11}}>{h}</MenuItem>)}
            </Select>
          </FormControl>
          <Box sx={{ display:"flex", alignItems:"center", gap:0.4 }}>
            <Typography fontSize={10} color="text.secondary">Range</Typography>
            <TextField size="small" value={localCmMin} placeholder="auto"
              onChange={e=>setLocalCmMin(e.target.value)}
              onBlur={()=>onStyleChange({colormapMin:localCmMin})}
              onKeyDown={e=>{if(e.key==="Enter"){onStyleChange({colormapMin:localCmMin});(e.target as HTMLInputElement).blur();}}}
              inputProps={{ style:{fontSize:11,width:60,textAlign:"right"} }} sx={{ width:82 }}/>
            <Typography fontSize={10}>~</Typography>
            <TextField size="small" value={localCmMax} placeholder="auto"
              onChange={e=>setLocalCmMax(e.target.value)}
              onBlur={()=>onStyleChange({colormapMax:localCmMax})}
              onKeyDown={e=>{if(e.key==="Enter"){onStyleChange({colormapMax:localCmMax});(e.target as HTMLInputElement).blur();}}}
              inputProps={{ style:{fontSize:11,width:60} }} sx={{ width:82 }}/>
          </Box>
        </Box>
      )}
    </Box>
  );
}
