import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Button, Checkbox, Chip, CircularProgress, Collapse,
  Divider, FormControl, FormControlLabel, IconButton, InputLabel,
  Menu, MenuItem, Paper, Select, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import TuneIcon from "@mui/icons-material/Tune";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
  CartesianGrid, Legend, Line, LineChart,
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
type ChartMode     = "2d" | "3d";
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

// ── AnalysisTab ────────────────────────────────────────────────────────────────
export default function AnalysisTab() {
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
  useEffect(()=>{ selectedExpIdRef.current = selectedExpId; }, [selectedExpId]);
  useEffect(()=>{ displayItemsRef.current  = displayItems;  }, [displayItems]);

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
              <Box sx={{ px:1.5, py:0.4, bgcolor:"grey.200", position:"sticky", top:0, zIndex:1 }}>
                <Typography fontSize={10} fontWeight="bold" color="text.secondary">
                  {group.key==="__none__" ? "EXPERIMENTS" : `Project: ${group.label}`}
                </Typography>
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
          onClick={e=>availableProjects.length>0?setAddMenuAnchor(e.currentTarget):addItemWithContext("main")}
          sx={{ ml:0.5 }}>Add Chart</Button>
        <Menu anchorEl={addMenuAnchor} open={!!addMenuAnchor} onClose={()=>setAddMenuAnchor(null)}>
          <MenuItem dense onClick={()=>{addItemWithContext("main");setAddMenuAnchor(null);}}>EXPERIMENTS</MenuItem>
          <Divider/>
          {availableProjects.map(p=>(
            <MenuItem dense key={p.id} onClick={()=>{addItemWithContext(p.id);setAddMenuAnchor(null);}}>
              Project: {p.name}
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* ── EXPERIMENTS charts ── */}
      {mainItems.length>0&&(
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
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* ── Project charts (below EXPERIMENTS) ── */}
      {projItemGroups.map(g=>(
        <Box key={g.ctx}>
          <Divider sx={{ my:0.5 }}>
            <Typography fontSize={11} fontWeight="bold" color="secondary.main">Project: {g.label}</Typography>
          </Divider>
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
                />
              );
            })}
          </Box>
        </Box>
      ))}

      {displayItems.length===0 && (
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
}

function DisplayItemPanel({
  item, index, pathCols, selectedEntry, resolvedFile, availHeaders,
  rows, isLoadingFile, hasError, saving, accentColor, onUpdate, onRemove, onSave, onRefresh,
}: DisplayItemPanelProps) {
  // Local draft  Eall edit-panel changes live here until Save
  const [draft, setDraft] = useState<DisplayItem>(()=>({...item}));
  // Sync draft when item identity changes (new chart panel) or editing/expanded toggled externally
  useEffect(()=>{ setDraft({...item}); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{ setDraft(prev=>({...prev, editing:item.editing, expanded:item.expanded, visible:item.visible})); }, [item.editing, item.expanded, item.visible]);

  // Convenience draft updater
  const draftUpdate = (patch: Partial<DisplayItem>) => setDraft(prev=>({...prev,...patch}));

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

  // 2D chart data (include colormap cols in payload)
  const chartData2D = useMemo<Record<string,number|string>[]>(()=>{
    if (!rows||!effectiveX||effectiveY.length===0) return [];
    const extraCols=new Set<string>();
    for (const col of effectiveY) {
      const s=draft.seriesStyles[col];
      if (s?.useColormap){const cc=s.colormapCol||col; if(cc&&availHeaders.includes(cc))extraCols.add(cc);}
    }
    return rows.map(row=>{
      const pt: Record<string,number|string>={[effectiveX]:row[effectiveX]};
      for (const y of effectiveY) pt[y]=row[y];
      for (const ec of extraCols) pt[ec]=row[ec];
      return pt;
    });
  }, [rows, effectiveX, effectiveY, draft.seriesStyles, availHeaders]);

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
    draftUpdate(applyZColColormap(draft, newZCol));
  };

  const fileReady = !isLoadingFile&&!hasError&&!!resolvedFile&&!!selectedEntry&&!!draft.pathCol;
  const ready2D   = fileReady&&draft.chartMode==="2d"&&!!effectiveX&&effectiveY.length>0;
  const ready3D   = fileReady&&draft.chartMode==="3d"&&!!effectiveX&&effectiveY.length>0&&!!effectiveZ;

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
          value={item.title} onChange={e=>onUpdate({title:e.target.value})}
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
                {(["2d","3d"] as ChartMode[]).map(m=>(
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
                        onClick={()=>onUpdate({xCol:h,yCols:item.yCols.filter(y=>y!==h)})}
                        sx={{ fontSize:11, py:0.1, minWidth:50 }}>{h}</Button>
                    ))}
                  </Box>
                </Box>
                {/* Y */}
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb:0.3 }}>
                    {item.chartMode==="3d"?"Y axis (pick one)":"Y axis (multi-select)"}
                    {yColsMissing.length>0&&<Chip label={`"${yColsMissing.join(", ")}" not found`} size="small" color="warning" sx={{ml:1,fontSize:10}}/>}
                  </Typography>
                  <Box sx={{ display:"flex", gap:0.3, flexWrap:"wrap" }}>
                    {availHeaders.filter(h=>h!==item.xCol&&(item.chartMode==="2d"||h!==item.zCol)).map(h=>(
                      <FormControlLabel key={h}
                        control={<Checkbox size="small" sx={{py:0.2}} checked={item.yCols.includes(h)}
                          onChange={e=>{
                            const yCols=item.chartMode==="3d"?(e.target.checked?[h]:[]):e.target.checked?[...item.yCols,h]:item.yCols.filter(y=>y!==h);
                            onUpdate({yCols});
                          }}/>}
                        label={<Typography fontSize={11}>{h}</Typography>} sx={{ mr:0.5 }}
                      />
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
          </Box>
        </Collapse>

        {/* ── Chart area ── */}
        <Box sx={{ p:1 }}>
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
                  <LineChart data={chartData2D} margin={{ top:5, right:20, bottom:24, left:10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25}/>
                    <XAxis dataKey={effectiveX} tickFormatter={xTickFmt} tick={{ fontSize:10 }}
                      domain={xDomain} allowDataOverflow={!!xDomain}
                      label={{ value:draft.xLabel||effectiveX, position:"insideBottom", offset:-12, fontSize:11 }}
                    />
                    <YAxis tick={{ fontSize:10 }} width={draft.yLabel?72:52}
                      domain={yDomain} allowDataOverflow={!!yDomain}
                      label={draft.yLabel?{ value:draft.yLabel, angle:-90, position:"insideLeft", fontSize:11, offset:10 }:undefined}
                    />
                    <ChartTooltip contentStyle={{ fontSize:11 }}
                      formatter={(v:number)=>[typeof v==="number"?v.toFixed(4):v,""]}
                    />
                    {draft.showLegend !== false && <Legend wrapperStyle={{ fontSize:11 }}/>}
                    {effectiveY.map((col,i)=>{
                      const s=getSeriesStyle(draft.seriesStyles,col,i);
                      const t=draft.seriesTypes[col]??"line";
                      const Dot=dotRenderers[col];
                      return (
                        <Line key={col} type="monotone" dataKey={col}
                          stroke={s.useColormap&&t==="scatter"?"transparent":s.color}
                          strokeWidth={t==="scatter"?0:s.strokeWidth}
                          strokeDasharray={t==="scatter"?undefined:(s.dashArray||undefined)}
                          dot={t==="scatter"&&Dot?(Dot as any):false}
                          activeDot={t==="scatter"?false:{ r:3, fill:s.color }}
                          isAnimationActive={false}
                        />
                      );
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
