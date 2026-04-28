import { useState, useEffect, Fragment, useCallback } from "react";
import {
  Box, Button, Chip, CircularProgress, Divider,
  IconButton, InputAdornment, Paper, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import type { Experiment, ExperimentDetail } from "../../api/experiments";
import {
  fetchExperiments, fetchExperimentDetail, deleteExperiment,
  cloneExperiment, exportExperimentsCsv,
} from "../../api/experiments";
import { galvanoSystemsApi } from "../../api/masters";

// ── short ID helper ──────────────────────────────────────────────
const sid = (id: string | null | undefined) => id ? id.slice(0, 6) + "…" : "—";

const BoolChip = ({ v }: { v: boolean | null | undefined }) =>
  v == null ? <>—</> : (
    <Chip
      label={v ? "Yes" : "No"}
      size="small"
      color={v ? "error" : "success"}
      variant="outlined"
      sx={{ height: 16, fontSize: 10, "& .MuiChip-label": { px: 0.5 } }}
    />
  );

// ── role color chips ──────────────────────────────────────────────
export const ROLE_COLOR: Record<string, string> = {
  main: "#ef5350", OCT: "#66bb6a", sub: "#42a5f5",
  single: "#7e57c2", ring: "#ff7043", core_ring: "#8d6e63",
};
const RoleChip = ({ role }: { role?: string | null }) => {
  if (!role) return <span>—</span>;
  const bg = ROLE_COLOR[role] ?? "#757575";
  return (
    <Chip
      label={role}
      size="small"
      sx={{ bgcolor: bg, color: "white", fontWeight: "bold", height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.6 } }}
    />
  );
};

// ── tree types & renderer ─────────────────────────────────────────
type TItem = { label: React.ReactNode; value?: React.ReactNode; children?: TItem[] };

/** Recursively removes leaf nodes whose value is "—" or null/empty when hideEmpty=true */
function filterTree(items: TItem[], hideEmpty: boolean): TItem[] {
  if (!hideEmpty) return items;
  return items.flatMap(item => {
    if (item.children) {
      const filtered = filterTree(item.children, hideEmpty);
      if (filtered.length === 0) return [];
      return [{ ...item, children: filtered }];
    }
    const isEmpty =
      item.value === "—" ||
      item.value == null ||
      item.value === "" ||
      item.value === "null" ||
      item.value === "undefined";
    return isEmpty ? [] : [item];
  });
}

function TreeBlock({ items, depth = 0, hideEmpty }: { items: TItem[]; depth?: number; hideEmpty?: boolean }) {
  const visible = filterTree(items, !!hideEmpty);
  return (
    <>
      {visible.map((item, i) => {
        const isLast   = i === visible.length - 1;
        const hasKids  = !!item.children?.length;
        const isHeader = hasKids && item.value === undefined;
        return (
          <Fragment key={i}>
            <Box sx={{ display: "flex", alignItems: "center", pl: `${depth * 14}px`, py: 0.2 }}>
              {depth > 0 && (
                <Box
                  component="span"
                  sx={{ color: "text.disabled", fontSize: 11, mr: 0.3, flexShrink: 0, fontFamily: "monospace", lineHeight: "20px" }}
                >
                  {isLast ? "└ " : "├ "}
                </Box>
              )}
              <Box sx={{
                fontSize: 11,
                fontWeight: isHeader ? 700 : 400,
                color: isHeader ? "primary.main" : "text.secondary",
                mr: 0.5, flexShrink: 0,
                minWidth: isHeader ? undefined : 175,
                display: "flex", alignItems: "center",
              }}>
                {item.label}
              </Box>
              {item.value !== undefined && (
                <Box sx={{ fontSize: 11, color: "text.primary", wordBreak: "break-all", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                  {item.value}
                </Box>
              )}
            </Box>
            {hasKids && <TreeBlock items={item.children!} depth={depth + 1} hideEmpty={hideEmpty} />}
          </Fragment>
        );
      })}
    </>
  );
}

// ── detail side panel ─────────────────────────────────────────────
interface Props {
  onSelect: (exp: Experiment) => void;
  onAddNew: () => void;
  refresh: number;
}

function DetailPanel({
  detail, galvanoType, onEdit, onClose,
}: {
  detail: ExperimentDetail;
  galvanoType?: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [hideEmpty, setHideEmpty] = useState(false);

  const f = (v: unknown, unit = "") => v != null ? `${v}${unit}` : null;
  const gs  = detail.galvano_system;
  const wc  = detail.welding_condition;
  const em  = detail.experiment_material;
  const sc  = detail.shielding_condition;
  const res = detail.result;
  const obs = detail.observation;
  const fil = detail.file;

  // Panel left-border color from galvano_type
  const panelColor = galvanoType ? (ROLE_COLOR[galvanoType] ?? "#bbb") : "#bbb";

  const sections: TItem[] = [
    {
      label: "GALVANO_SYSTEM",
      children: gs ? [
        { label: "galvano_type",     value: <RoleChip role={gs.galvano_type} /> },
        { label: "serial_number",    value: f(gs.serial_number) },
        { label: "main_diameter_um", value: f(gs.main_diameter_um, " µm") },
        { label: "sub_diameter_um",  value: f(gs.sub_diameter_um, " µm") },
        { label: "oct_diameter_um",  value: f(gs.oct_diameter_um, " µm") },
        { label: "remarks",          value: f(gs.remarks) },
        ...(gs.ftheta ? [{ label: "FTHETA", children: [
          { label: "manufacturer",    value: f(gs.ftheta.manufacturer) },
          { label: "model_name",      value: f(gs.ftheta.model_name) },
          { label: "serial_number",   value: f(gs.ftheta.serial_number) },
          { label: "ftheta_focal_mm", value: f(gs.ftheta.ftheta_focal_mm, " mm") },
          { label: "remarks",         value: f(gs.ftheta.remarks) },
        ]}] : []),
        ...(gs.optics ? [{ label: "OPTICS", children: [
          { label: "manufacturer", value: f(gs.optics.manufacturer) },
          { label: "remarks",      value: f(gs.optics.remarks) },
          ...(gs.optics.entries ?? []).map((oe, oi) => ({
            label: <RoleChip role={oe.optics_role ?? `entry${oi + 1}`} />,
            children: [
              { label: "collimator_focal_mm", value: f(oe.collimator_focal_mm, " mm") },
              { label: "serial_number",       value: f(oe.serial_number) },
              ...(oe.doe ? [{ label: "DOE", children: [
                { label: "manufacturer",  value: f(oe.doe.manufacturer) },
                { label: "model_name",    value: f(oe.doe.model_name) },
                { label: "serial_number", value: f(oe.doe.serial_number) },
                { label: "profile_shape", value: f(oe.doe.profile_shape) },
                { label: "remarks",       value: f(oe.doe.remarks) },
              ]}] : []),
              ...(oe.laser_device ? [{ label: "LASER_DEVICE", children: [
                { label: "manufacturer",   value: f(oe.laser_device.manufacturer) },
                { label: "model_name",     value: f(oe.laser_device.model_name) },
                { label: "serial_number",  value: f(oe.laser_device.serial_number) },
                { label: "beam_structure", value: f(oe.laser_device.beam_structure) },
                { label: "remarks",        value: f(oe.laser_device.remarks) },
                ...(oe.laser_device.laser_beam ? [{ label: "LASER_BEAM", children: [
                  { label: "wavelength_nm",      value: f(oe.laser_device.laser_beam.wavelength_nm, " nm") },
                  { label: "numerical_aperture", value: f(oe.laser_device.laser_beam.numerical_aperture) },
                  { label: "m2_value",           value: f(oe.laser_device.laser_beam.m2_value) },
                  { label: "bpp_mm_mrad",        value: f(oe.laser_device.laser_beam.bpp_mm_mrad) },
                  { label: "remarks",            value: f(oe.laser_device.laser_beam.remarks) },
                  ...(oe.laser_device.laser_beam.entries ?? []).map((be, bi) => ({
                    label: <RoleChip role={be.beam_type ?? `beam${bi + 1}`} />,
                    children: [
                      { label: "core_diameter_um",       value: f(be.core_diameter_um, " µm") },
                      { label: "ring_inner_diameter_um", value: f(be.ring_inner_diameter_um, " µm") },
                      { label: "ring_outer_diameter_um", value: f(be.ring_outer_diameter_um, " µm") },
                    ],
                  })),
                ]}] : []),
              ]}] : []),
            ],
          })),
        ]}] : []),
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "WELDING_CONDITION",
      children: wc ? [
        { label: "main_power_w",           value: f(wc.main_power_w, " W") },
        { label: "sub_power_w",            value: f(wc.sub_power_w, " W") },
        { label: "welding_speed_mm_s",     value: f(wc.welding_speed_mm_s, " mm/s") },
        { label: "main_focus_offset_mm",   value: f(wc.main_focus_offset_mm, " mm") },
        { label: "sub_focus_offset_mm",    value: f(wc.sub_focus_offset_mm, " mm") },
        { label: "remarks",                value: f(wc.remarks) },
        ...(wc.trajectory_set ? [{ label: "TRAJECTORY_SET", children: [
          { label: "trajectory_csv_path", value: f(wc.trajectory_set.trajectory_csv_path) },
          { label: "remarks",             value: f(wc.trajectory_set.remarks) },
          ...(wc.trajectory_set.main_trajectory ? [{ label: "MAIN_TRAJECTORY", children: [
            { label: "main_trajectory_type", value: f(wc.trajectory_set.main_trajectory.main_trajectory_type) },
            { label: "remarks",              value: f(wc.trajectory_set.main_trajectory.remarks) },
            ...(wc.trajectory_set.main_trajectory.line_parameter ? [{ label: "LINE_PARAMETER", children: [
              { label: "length_mm", value: f(wc.trajectory_set.main_trajectory.line_parameter.length_mm, " mm") },
              { label: "remarks",   value: f(wc.trajectory_set.main_trajectory.line_parameter.remarks) },
            ]}] : []),
          ]}] : []),
          ...(wc.trajectory_set.sub_trajectory ? [{ label: "SUB_TRAJECTORY", children: [
            { label: "sub_trajectory_type", value: f(wc.trajectory_set.sub_trajectory.sub_trajectory_type) },
            { label: "remarks",             value: f(wc.trajectory_set.sub_trajectory.remarks) },
            ...(wc.trajectory_set.sub_trajectory.wobbling_parameter ? [{ label: "WOBBLING_PARAMETER", children: [
              { label: "wobble_radius_mm",      value: f(wc.trajectory_set.sub_trajectory.wobbling_parameter.wobble_radius_mm, " mm") },
              { label: "wobble_frequency_hz",   value: f(wc.trajectory_set.sub_trajectory.wobbling_parameter.wobble_frequency_hz, " Hz") },
              { label: "circumferential_speed", value: f(wc.trajectory_set.sub_trajectory.wobbling_parameter.circumferential_speed) },
              { label: "remarks",               value: f(wc.trajectory_set.sub_trajectory.wobbling_parameter.remarks) },
            ]}] : []),
          ]}] : []),
        ]}] : []),
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "EXPERIMENT_MATERIAL",
      children: em ? [
        { label: "material_role", value: f(em.material_role) },
        { label: "remarks",       value: f(em.remarks) },
        ...(em.material_state ? [{ label: "MATERIAL_STATE", children: [
          { label: "thickness_mm",      value: f(em.material_state.thickness_mm, " mm") },
          { label: "width_mm",          value: f(em.material_state.width_mm, " mm") },
          { label: "length_mm",         value: f(em.material_state.length_mm, " mm") },
          { label: "surface_condition", value: f(em.material_state.surface_condition) },
          { label: "remarks",           value: f(em.material_state.remarks) },
          ...(em.material_state.material ? [{ label: "MATERIAL", children: [
            { label: "material_name",             value: f(em.material_state.material.material_name) },
            { label: "material_class",            value: f(em.material_state.material.material_class) },
            { label: "density_kg_m3",             value: f(em.material_state.material.density_kg_m3, " kg/m³") },
            { label: "thermal_conductivity_w_mk", value: f(em.material_state.material.thermal_conductivity_w_mk, " W/mK") },
            { label: "reflectivity_1070nm",       value: f(em.material_state.material.reflectivity_1070nm) },
            { label: "remarks",                   value: f(em.material_state.material.remarks) },
          ]}] : []),
        ]}] : []),
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "SHIELDING_CONDITION",
      children: sc ? [
        { label: "gas_type",            value: f(sc.gas_type) },
        { label: "gas_purity_percent",  value: f(sc.gas_purity_percent, " %") },
        { label: "gas_flow_l_min",      value: f(sc.gas_flow_l_min, " L/min") },
        { label: "gas_pressure_kpa",    value: f(sc.gas_pressure_kpa, " kPa") },
        { label: "nozzle_type",         value: f(sc.nozzle_type) },
        { label: "nozzle_diameter_mm",  value: f(sc.nozzle_diameter_mm, " mm") },
        { label: "nozzle_distance_mm",  value: f(sc.nozzle_distance_mm, " mm") },
        { label: "nozzle_angle_deg",    value: f(sc.nozzle_angle_deg, "°") },
        { label: "remarks",             value: f(sc.remarks) },
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "RESULT",
      children: res ? [
        { label: "oct_depth_mm",           value: f(res.oct_depth_mm, " mm") },
        { label: "oct_surface_csv_path",   value: f(res.oct_surface_csv_path) },
        { label: "oct_depth_csv_path",     value: f(res.oct_depth_csv_path) },
        { label: "oct_result_csv_path",    value: f(res.oct_result_csv_path) },
        { label: "cross_section_depth_mm", value: f(res.cross_section_depth_mm, " mm") },
        { label: "spatter_flag",           value: <BoolChip v={res.spatter_flag} /> },
        { label: "spatter_severity",       value: f(res.spatter_severity) },
        { label: "gap_opening_flag",       value: <BoolChip v={res.gap_opening_flag} /> },
        { label: "crack_flag",             value: <BoolChip v={res.crack_flag} /> },
        { label: "crack_severity",         value: f(res.crack_severity) },
        { label: "glass_contamination",    value: <BoolChip v={res.glass_contamination} /> },
        { label: "surface_contamination",  value: <BoolChip v={res.surface_contamination} /> },
        { label: "penetration_flag",       value: <BoolChip v={res.penetration_flag} /> },
        { label: "remarks",                value: f(res.remarks) },
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "OBSERVATION",
      children: obs ? [
        { label: "observer_name",        value: f(obs.observer_name) },
        { label: "observation_datetime", value: f(obs.observation_datetime) },
        { label: "comment",              value: f(obs.comment) },
        { label: "remarks",              value: f(obs.remarks) },
      ] : [{ label: "(not set)", value: "" }],
    },
    {
      label: "FILE",
      children: fil ? [
        { label: "remarks", value: f(fil.remarks) },
      ] : [{ label: "(not set)", value: "" }],
    },
  ];

  return (
    <Paper
      elevation={3}
      sx={{
        position: "sticky", top: 8,
        maxHeight: "calc(100vh - 180px)", overflow: "auto",
        p: 1.5, minWidth: 300,
        borderLeft: `4px solid ${panelColor}`,
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="caption" fontFamily="monospace" fontSize={10} color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
          {detail.experiment_id}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.3, alignItems: "center" }}>
          <Tooltip title={hideEmpty ? "Show empty values" : "Hide empty values"}>
            <IconButton size="small" onClick={() => setHideEmpty(h => !h)} color={hideEmpty ? "primary" : "default"}>
              {hideEmpty ? <VisibilityOffIcon sx={{ fontSize: 14 }} /> : <VisibilityIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in Edit tab">
            <IconButton size="small" onClick={onEdit}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
        </Box>
      </Box>
      <Divider sx={{ mb: 1 }} />
      {sections.map((sec, i) => (
        <Fragment key={i}>
          {i > 0 && <Divider sx={{ my: 0.8 }} />}
          <TreeBlock items={[sec]} depth={0} hideEmpty={hideEmpty} />
        </Fragment>
      ))}
    </Paper>
  );
}

// ── main list ──────────────────────────────────────────────────────
export default function ExperimentList({ onSelect, onAddNew, refresh }: Props) {
  const [items, setItems]       = useState<Experiment[]>([]);
  const [total, setTotal]       = useState(0);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail]     = useState<ExperimentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // galvano_system_id → galvano_type map for row coloring
  const [galvanoTypeMap, setGalvanoTypeMap] = useState<Record<string, string>>({});

  const loadGalvanoTypes = useCallback(async () => {
    try {
      const res = await galvanoSystemsApi.list();
      const map: Record<string, string> = {};
      for (const gs of res.data) {
        if (gs.galvano_system_id && gs.galvano_type) map[gs.galvano_system_id] = gs.galvano_type;
      }
      setGalvanoTypeMap(map);
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async (keyword = "") => {
    setLoading(true);
    try {
      const res = await fetchExperiments({ remarks: keyword || undefined, limit: 100 });
      setItems(res.data.items);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search);
    loadGalvanoTypes();
  }, [refresh]);

  const handleRowClick = async (exp: Experiment) => {
    if (selectedId === exp.experiment_id) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    setSelectedId(exp.experiment_id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetchExperimentDetail(exp.experiment_id);
      setDetail(res.data);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this experiment?")) return;
    await deleteExperiment(id);
    if (selectedId === id) { setSelectedId(null); setDetail(null); }
    load(search);
  };

  const handleClone = async (id: string) => {
    await cloneExperiment(id);
    load(search);
  };

  const handleExportCsv = async () => {
    const res = await exportExperimentsCsv();
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "experiments.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedExp = items.find((e) => e.experiment_id === selectedId);
  const showDetail  = detail !== null || detailLoading;

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography variant="h6">Experiments (total: {total})</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" size="small" onClick={onAddNew}>+ Add New</Button>
          <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExportCsv}>Export CSV</Button>
        </Box>
      </Box>
      <TextField
        size="small"
        placeholder="Search by remarks"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && load(search)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
            ),
          },
        }}
        sx={{ mb: 1.5, width: 260 }}
      />

      {loading ? <CircularProgress /> : (
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", width: "100%" }}>
          {/* ── table ── */}
          <Box sx={{ flex: showDetail ? "0 0 56%" : "1 1 100%", minWidth: 0, overflow: "auto" }}>
            <TableContainer component={Paper}>
              <Table size="small" sx={{ tableLayout: "auto", minWidth: 1100 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>experiment_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>galvano_type</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>galvano_system_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>welding_condition_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>experiment_material_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>shielding_condition_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>result_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>observation_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>file_id</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11, minWidth: 120 }}>remarks</TableCell>
                    <TableCell align="center" sx={{ whiteSpace: "nowrap" }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((exp) => {
                    const galvanoType = exp.galvano_system_id ? galvanoTypeMap[exp.galvano_system_id] : undefined;
                    const rowColor    = galvanoType ? ROLE_COLOR[galvanoType] : undefined;
                    return (
                      <TableRow
                        key={exp.experiment_id}
                        hover
                        selected={exp.experiment_id === selectedId}
                        sx={{
                          cursor: "pointer",
                          bgcolor: rowColor ? `${rowColor}18` : undefined,
                          borderLeft: rowColor ? `3px solid ${rowColor}` : "3px solid transparent",
                        }}
                        onClick={() => handleRowClick(exp)}
                      >
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.experiment_id)}</TableCell>
                        <TableCell>
                          {galvanoType ? <RoleChip role={galvanoType} /> : <span style={{ fontSize: 11, color: "#aaa" }}>—</span>}
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.galvano_system_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.welding_condition_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.experiment_material_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.shielding_condition_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.result_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.observation_id)}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{sid(exp.file_id)}</TableCell>
                        <TableCell sx={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {exp.remarks ?? ""}
                        </TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Clone">
                            <IconButton size="small" onClick={() => handleClone(exp.experiment_id)}>
                              <ContentCopyIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(exp.experiment_id)}>
                              <DeleteIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} align="center">No data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* ── detail panel ── */}
          {showDetail && (
            <Box sx={{ flex: "0 0 42%", minWidth: 300 }}>
              {detailLoading ? (
                <Paper sx={{ p: 2, display: "flex", justifyContent: "center" }}>
                  <CircularProgress size={24} />
                </Paper>
              ) : detail && (
                <DetailPanel
                  detail={detail}
                  galvanoType={detail.galvano_system?.galvano_type ?? undefined}
                  onEdit={() => selectedExp && onSelect(selectedExp)}
                  onClose={() => { setSelectedId(null); setDetail(null); }}
                />
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
