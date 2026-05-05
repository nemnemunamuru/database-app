import { useEffect, useMemo, useState } from "react";
import {
  Box, Button, FormControlLabel, Paper, Switch,
  Tab, Tabs, Typography,
} from "@mui/material";
import SchemaIcon from "@mui/icons-material/Schema";
import PaletteIcon from "@mui/icons-material/Palette";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { EntityCrud } from "../components/masters/EntityCrud";
import type { FieldDef } from "../components/masters/EntityCrud";
import { columnDefsApi, columnDefsTableApi, deleteFkByColumn, getColumnDef, initColumnDefs, reorderColumnDefs, syncFkForColumn, trajectoryTypeDefsApi } from "../api/masters";

interface Props {
  darkMode: boolean;
  onToggleDark: (val: boolean) => void;
  isAdmin?: boolean;
}

const COLUMN_DEF_FIELDS: FieldDef[] = [
  { key: "column_name", label: "column_name", type: "text",
    endAdornment: (form) => form.is_id === "id" ? "_id" : undefined },
  { key: "data_type",   label: "data_type",   type: "text",
    options: ["string", "float", "integer", "boolean", "text", "uuid", "date", "datetime", "path"],
    disabledWhen: (form) => form.is_id === "id",
    defaultWhen:  (form) => form.is_id === "id" ? "uuid" : undefined },
  { key: "unit",        label: "unit",        type: "text",
    disabledWhen: (form) => form.data_type === "date" || form.data_type === "datetime" },
  { key: "is_id",       label: "is_id",       type: "text",
    options: ["id", ""],
    disabledWhen: (form) => form.data_type === "date" || form.data_type === "datetime" },
  { key: "candidates",  label: "candidates",  type: "tags",
    disabledWhen: (form) => form.is_id === "id" || form.data_type === "date" || form.data_type === "datetime" },
];

// Table groups for two-level tab navigation
const TABLE_GROUPS = [
  { key: "EXPERIMENT",     label: "EXPERIMENT",       color: "#1565c0", tables: ["EXPERIMENT"] },
  { key: "PROJECT",        label: "PROJECT",          color: "#26a69a", tables: ["PROJECT"] },
  { key: "GALVANO_SYSTEM", label: "GALVANO_SYSTEM",   color: "#6a1b9a", tables: ["GALVANO_SYSTEM", "FTHETA", "OPTICS", "LASER_DEVICE", "LASER_BEAM", "DOE"] },
  { key: "WELDING",        label: "WELDING",          color: "#2e7d32", tables: ["WELDING_CONDITION", "TRAJECTORY_SET", "MAIN_TRAJECTORY", "LINE_PARAMETER", "SUB_TRAJECTORY", "WOBBLING_PARAMETER"] },
  { key: "MATERIAL",       label: "MATERIAL",         color: "#00695c", tables: ["EXPERIMENT_MATERIAL", "MATERIAL_STATE", "MATERIAL"] },
  { key: "SHIELDING",      label: "SHIELDING",        color: "#5d4037", tables: ["SHIELDING_CONDITION"] },
  { key: "RESULT",         label: "RESULT",           color: "#ad1457", tables: ["RESULT"] },
  { key: "OBSERVATION",    label: "OBSERVATION",      color: "#0277bd", tables: ["OBSERVATION"] },
  { key: "FILE",           label: "FILE",             color: "#37474f", tables: ["FILE"] },
] as const;

// Color groups for table tabs
const TABLE_COLOR_MAP: Record<string, string> = {
  EXPERIMENT: "#1565c0",
  PROJECT: "#26a69a",
  GALVANO_SYSTEM: "#6a1b9a", FTHETA: "#6a1b9a", OPTICS: "#6a1b9a",
  LASER_DEVICE: "#6a1b9a", LASER_BEAM: "#6a1b9a", DOE: "#6a1b9a",
  WELDING_CONDITION: "#2e7d32", TRAJECTORY_SET: "#2e7d32",
  MAIN_TRAJECTORY: "#2e7d32", LINE_PARAMETER: "#2e7d32",
  SUB_TRAJECTORY: "#e65100", WOBBLING_PARAMETER: "#e65100",
  EXPERIMENT_MATERIAL: "#00695c", MATERIAL_STATE: "#00695c", MATERIAL: "#00695c",
  SHIELDING_CONDITION: "#5d4037",
  RESULT: "#ad1457",
  OBSERVATION: "#0277bd",
  FILE: "#37474f",
};

// Fallback palette for tables not in TABLE_COLOR_MAP
const AUTO_COLOR_PALETTE = ["#455a64","#558b2f","#6d4c41","#4527a0","#00838f","#ef6c00"];
const _autoColorCache: Record<string, string> = {};
let _autoColorIdx = 0;
function getTabColor(name: string): string {
  if (TABLE_COLOR_MAP[name]) return TABLE_COLOR_MAP[name];
  if (!_autoColorCache[name]) {
    _autoColorCache[name] = AUTO_COLOR_PALETTE[_autoColorIdx % AUTO_COLOR_PALETTE.length];
    _autoColorIdx++;
  }
  return _autoColorCache[name];
}

/** Convert "id" → "pk" if column_name matches table's own PK pattern, else "fk" */
function resolveIsId(tableName: string, columnName: string, isIdInput: string): string {
  if (isIdInput !== "id") return isIdInput ?? "";
  const expectedPk = tableName.toLowerCase() + "_id";
  return columnName === expectedPk ? "pk" : "fk";
}

export default function SettingsPage({ darkMode, onToggleDark, isAdmin = false }: Props) {
  const [tab, setTab] = useState(0);

  useEffect(() => { setTab(0); }, [isAdmin]);
  const [groupIdx, setGroupIdx] = useState(0);
  const [subIdx,   setSubIdx]   = useState(0);
  const [extraTables, setExtraTables] = useState<Array<{ root: string; tables: string[] }>>([]);
  const [schemaKey, setSchemaKey] = useState(0);
  const [dynParamTables, setDynParamTables] = useState<string[]>([]);

  // Load dynamic trajectory parameter tables
  useEffect(() => {
    trajectoryTypeDefsApi.list().then(r => {
      const tables = r.data.map((d: any) => (d.param_table as string).toUpperCase());
      setDynParamTables(tables);
    }).catch(() => {});
  }, [schemaKey]);

  // All tables that belong to any predefined group
  const knownTables = new Set(TABLE_GROUPS.flatMap(g => g.tables as string[]));

  // Fetch column_defs to find tables not in any predefined group and build hierarchy
  useEffect(() => {
    columnDefsApi.list().then(r => {
      const allRows = r.data as any[];
      const names: string[] = Array.from(new Set(allRows.map((d: any) => d.table_name as string)));
      const extra = names.filter(n => !knownTables.has(n));
      const extraSet = new Set(extra);

      // Build children map from FK columns among extra tables
      const children: Record<string, string[]> = {};
      const hasParent = new Set<string>();
      for (const row of allRows) {
        if (!extraSet.has(row.table_name)) continue;
        if (row.is_id === "fk") {
          const refTable = (row.column_name as string).replace(/_id$/i, "").toUpperCase();
          if (extraSet.has(refTable)) {
            if (!children[row.table_name]) children[row.table_name] = [];
            if (!children[row.table_name].includes(refTable)) children[row.table_name].push(refTable);
            hasParent.add(refTable);
          }
        }
      }

      // Root tables = extra tables with no parent in the extra set
      const roots = extra.filter(t => !hasParent.has(t)).sort();

      // Collect all descendants via BFS
      function getDescendants(t: string): string[] {
        const result: string[] = [];
        const queue = [...(children[t] ?? [])];
        while (queue.length) {
          const next = queue.shift()!;
          result.push(next);
          queue.push(...(children[next] ?? []));
        }
        return result;
      }

      setExtraTables(roots.map(t => ({ root: t, tables: [t, ...getDescendants(t)] })));
    }).catch(() => {});
  }, [schemaKey]);

  // Build the full groups list (static + dynamic trajectory param tables in WELDING + extra groups)
  const WELDING_STATIC = ["WELDING_CONDITION", "TRAJECTORY_SET", "MAIN_TRAJECTORY", "LINE_PARAMETER", "SUB_TRAJECTORY", "WOBBLING_PARAMETER"];
  const knownParamTables = new Set(WELDING_STATIC);
  const extraParamTables = dynParamTables.filter(t => !knownParamTables.has(t));

  const allGroups = TABLE_GROUPS.map(g =>
    g.key === "WELDING"
      ? { ...g, tables: [...g.tables, ...extraParamTables] }
      : g
  ).concat(
    extraTables
      .filter(({ root }) => !dynParamTables.includes(root))
      .map(({ root, tables }) => ({ key: root, label: root, color: getTabColor(root), tables }))
  );

  const activeGroup = allGroups[groupIdx] ?? allGroups[0];
  const activeTable = (activeGroup.tables[subIdx] ?? activeGroup.tables[0]) as string;

  // Wrap api: auto-resolve is_id and sync FKs after PK add
  const tableApi = useMemo(() => {
    const base = columnDefsTableApi(activeTable);
    return {
      ...base,
      create: async (data: any) => {
        // Append _id suffix when is_id="id" (shown as endAdornment in the form)
        let columnName: string = data.column_name ?? "";
        if (data.is_id === "id") {
          columnName = columnName + "_id";
        }

        // Resolve "id" → "pk" (own table's PK) or "fk" (foreign key)
        const isId = resolveIsId(activeTable, columnName, data.is_id ?? "");

        // Always create the row in the current table
        await base.create({
          ...data,
          column_name: columnName,
          table_name: activeTable,
          is_id: isId,
          ...(isId === "pk" || isId === "fk" ? { data_type: "uuid", candidates: null } : {}),
        });

        // If FK: also create a PK row in the referenced table and add its tab
        if (isId === "fk") {
          const refTable = columnName.replace(/_id$/i, "").toUpperCase();
          await columnDefsApi.create({
            ...data,
            column_name: columnName,
            table_name: refTable,
            is_id: "pk",
            data_type: "uuid",
            candidates: null,
          });
          await syncFkForColumn(columnName).catch(() => {});
        }

        setSchemaKey(k => k + 1);
      },
      update: async (id: string, data: any) => {
        const isId = resolveIsId(activeTable, data.column_name ?? "", data.is_id ?? "");
        const resolved = {
          ...data,
          is_id: isId,
          ...(isId === "pk" || isId === "fk" ? { data_type: "uuid", candidates: null } : {}),
        };
        await base.update(id, resolved);

        // If FK: ensure PK row exists in referenced table and sync all FKs
        if (isId === "fk") {
          const colName = data.column_name ?? "";
          const refTable = colName.replace(/_id$/i, "").toUpperCase();
          // Check if PK already exists; create if not
          const existing = await columnDefsApi.list().then((r: any) =>
            (r.data as any[]).find(
              (x: any) => x.table_name === refTable && x.column_name === colName && x.is_id === "pk"
            )
          ).catch(() => null);
          if (!existing) {
            await columnDefsApi.create({
              column_name: colName,
              table_name: refTable,
              is_id: "pk",
              data_type: "uuid",
              candidates: null,
            }).catch(() => {});
          }
          await syncFkForColumn(colName).catch(() => {});
        }

        setSchemaKey(k => k + 1);
      },
      remove: async (id: string) => {
        // If this row is a PK, cascade-delete all FK rows with same column_name
        const item = await getColumnDef(id).catch(() => null);
        const result = await base.remove(id);
        if (item?.is_id === "pk") {
          await deleteFkByColumn(item.column_name).catch(() => {});
        }
        setSchemaKey(k => k + 1);
        return result;
      },
    };
  }, [activeTable]);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        {isAdmin && <Tab label="Columns" icon={<SchemaIcon fontSize="small" />} iconPosition="start" />}
        <Tab label="Color"   icon={<PaletteIcon fontSize="small" />} iconPosition="start" />
        <Tab label="AI Chatbot" icon={<SmartToyIcon fontSize="small" />} iconPosition="start" />
      </Tabs>

      {/* ── Columns ── */}
      {isAdmin && tab === 0 && (
        <Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={async () => {
                const result = await initColumnDefs();
                alert(`Deduplicated: ${result.deleted_duplicates ?? 0}  /  Created: ${result.created}`);
                setSchemaKey(k => k + 1);
              }}
            >
              Initialize from Models
            </Button>
          </Box>

          {/* Group tabs - always visible */}
          <Tabs
            value={Math.min(groupIdx, allGroups.length - 1)}
            onChange={(_, v) => { setGroupIdx(v); setSubIdx(0); }}
            sx={{ mb: 0, borderBottom: 1, borderColor: "divider", minHeight: 40 }}
          >
            {allGroups.map((g) => (
              <Tab
                key={g.key}
                label={g.label}
                sx={{
                  minHeight: 40, py: 0.5, fontSize: "0.75rem", fontWeight: 700,
                  borderTop: `3px solid ${g.color}`,
                  borderRadius: "4px 4px 0 0",
                  "&.Mui-selected": { color: g.color, bgcolor: `${g.color}14` },
                  "&:not(.Mui-selected)": { color: `${g.color}88` },
                }}
              />
            ))}
          </Tabs>

          {/* Sub-tabs - only when the group has multiple tables */}
          {activeGroup.tables.length > 1 && (
            <Tabs
              value={subIdx}
              onChange={(_, v) => setSubIdx(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ mb: 1.5, borderBottom: 1, borderColor: "divider", minHeight: 34 }}
            >
              {activeGroup.tables.map((t) => (
                <Tab key={t} label={t} sx={{ minHeight: 34, py: 0.3, fontSize: "0.7rem" }} />
              ))}
            </Tabs>
          )}

          {activeTable && (
            <EntityCrud
              key={`${activeTable}-${schemaKey}`}
              title=""
              fields={COLUMN_DEF_FIELDS}
              pkField="column_def_id"
              api={tableApi}
              onReorder={async (newItems) => {
                await reorderColumnDefs(
                  newItems.map((item, idx) => ({ id: item.column_def_id, order_index: idx }))
                );
              }}
            />
          )}
        </Box>
      )}

      {/* ── Color / Theme ── */}
      {tab === (isAdmin ? 1 : 0) && (
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
      {/* ── AI Chatbot ── */}
      {tab === (isAdmin ? 2 : 1) && (
        <Box sx={{ maxWidth: 600 }}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <SmartToyIcon color="primary" />
              <Typography variant="subtitle1" fontWeight="bold">AI Chatbot Settings</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              AI chatbot settings (OpenAI API key, model selection, etc.) are coming soon.
            </Typography>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
