import { Fragment, useState } from "react";
import {
  Box, Chip, Divider, IconButton, Paper, Tooltip, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type { ExperimentDetail } from "../../api/experiments";
import type { Candidate } from "../masters/EntityCrud";
import {
  BoolChip as _BoolChip,
  buildGalvanoSystemSection,
  buildWeldingConditionSection,
  buildExperimentMaterialSection,
  buildShieldingConditionSection,
  buildResultSection,
  buildObservationSection,
  buildFileSection,
  f as _f,
} from "../common/detailTreeBuilders";

// ── Tree types ────────────────────────────────────────────────────────────────
export type TItem = { label: React.ReactNode; value?: React.ReactNode; children?: TItem[] };

// Re-export BoolChip from shared location (keeps backward compat for any future imports)
export const BoolChip = _BoolChip;

export function filterTree(items: TItem[], hideEmpty: boolean): TItem[] {
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

export function TreeBlock({ items, depth = 0, hideEmpty, candidatesMap = {} }: {
  items: TItem[]; depth?: number; hideEmpty?: boolean; candidatesMap?: Record<string, Candidate[]>;
}) {
  const visible = filterTree(items, !!hideEmpty);
  return (
    <>
      {visible.map((item, i) => {
        const isLast   = i === visible.length - 1;
        const hasKids  = !!item.children?.length;
        const isHeader = hasKids && item.value === undefined;

        const labelKey = typeof item.label === "string" ? item.label : null;
        const rawValue = typeof item.value === "string" ? item.value : null;
        let displayValue: React.ReactNode = item.value;
        if (labelKey && rawValue && candidatesMap[labelKey]) {
          const cand = candidatesMap[labelKey].find(c => c.label === rawValue);
          if (cand?.color) {
            displayValue = (
              <Chip label={cand.label} size="small"
                sx={{ bgcolor: cand.color, color: "#fff", fontWeight: 700, height: 20, fontSize: 11, borderRadius: "10px" }} />
            );
          }
        }
        let labelDisplay: React.ReactNode = item.label;
        if (isHeader && typeof item.label === "string") {
          for (const cands of Object.values(candidatesMap)) {
            const cand = cands.find(c => c.label === item.label);
            if (cand?.color) {
              labelDisplay = (
                <Chip label={cand.label} size="small"
                  sx={{ bgcolor: cand.color, color: "#fff", fontWeight: 700, height: 20, fontSize: 11, borderRadius: "10px" }} />
              );
              break;
            }
          }
        }

        return (
          <Fragment key={i}>
            <Box sx={{ display: "flex", alignItems: "center", pl: `${depth * 14}px`, py: 0.2 }}>
              {depth > 0 && (
                <Box component="span" sx={{ color: "text.disabled", fontSize: 11, mr: 0.3, flexShrink: 0, fontFamily: "monospace", lineHeight: "20px" }}>
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
                {labelDisplay}
              </Box>
              {item.value !== undefined && (
                <Box sx={{ fontSize: 11, color: "text.primary", wordBreak: "break-all", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                  {displayValue}
                </Box>
              )}
            </Box>
            {hasKids && <TreeBlock items={item.children!} depth={depth + 1} hideEmpty={hideEmpty} candidatesMap={candidatesMap} />}
          </Fragment>
        );
      })}
    </>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
export function DetailPanel({
  detail, onEdit, onClose, candidatesMap, extraExpCols = [], projectData,
}: {
  detail: ExperimentDetail;
  onEdit: () => void;
  onClose: () => void;
  candidatesMap: Record<string, Candidate[]>;
  /** Ordered list of non-PK column defs for the EXPERIMENT table (from column_defs). */
  extraExpCols?: { column_name: string; is_id?: string }[];
  /** Raw project object (all columns). When provided the PROJECT section is built dynamically. */
  projectData?: Record<string, any>;
}) {
  const [hideEmpty, setHideEmpty] = useState(false);

  const gs  = detail.galvano_system;
  const wc  = detail.welding_condition;
  const emList = Array.isArray(detail.experiment_material) ? detail.experiment_material : (detail.experiment_material ? [detail.experiment_material] : []);
  const sc  = detail.shielding_condition;
  const res = detail.result;
  const obs = detail.observation;
  const fil = detail.file;

  // Build PROJECT children dynamically from projectData (same loop-over-properties
  // approach as EntityCrud.handleRowClick) or fall back to flat detail fields.
  const projectChildren: TItem[] = (() => {
    const src: Record<string, any> = projectData ?? {
      project_id:   detail.project_id,
      project_name: detail.project_name,
      remarks:      (detail as any).project_remarks,
    };
    return Object.entries(src)
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, val]) => ({ label: key, value: val != null ? String(val) : null }));
  })();

  const sections: TItem[] = [
    {
      label: "PROJECT",
      children: projectChildren,
    },
    buildGalvanoSystemSection(gs),
    buildWeldingConditionSection(wc),
    buildExperimentMaterialSection(emList),
    buildShieldingConditionSection(sc),
    buildResultSection(res),
    buildObservationSection(obs),
    buildFileSection(fil),
  ];

  // Append dynamic EXPERIMENT columns (from Settings) that aren't already shown
  const staticExpKeys = new Set([
    "experiment_id", "galvano_system_id", "welding_condition_id", "experiment_material_id",
    "shielding_condition_id", "result_id", "observation_id", "file_id",
    "project_id", "project_name", "project_remarks", "remarks",
    "created_datetime", "updated_datetime",
    "galvano_system", "welding_condition", "experiment_material",
    "shielding_condition", "result", "observation", "file",
  ]);
  const dynamicExpItems: TItem[] = extraExpCols
    .filter(c => c.is_id !== "pk" && !staticExpKeys.has(c.column_name))
    .map(c => ({ label: c.column_name, value: _f((detail as any)[c.column_name]) }))
    .filter(item => item.value != null);
  if (dynamicExpItems.length > 0) {
    sections.push({ label: "EXPERIMENT (custom)", children: dynamicExpItems });
  }

  return (
    <Paper elevation={3} sx={{ p: 1.5, minWidth: 300 }}>
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
          <TreeBlock items={[sec]} depth={0} hideEmpty={hideEmpty} candidatesMap={candidatesMap} />
        </Fragment>
      ))}
    </Paper>
  );
}
