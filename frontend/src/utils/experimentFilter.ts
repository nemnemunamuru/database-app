/**
 * Shared filter utilities for experiment lists.
 * Used by ExperimentList, NewProjectPage, and AnalysisTab.
 */

export type FilterMode = "contains" | "exact" | "starts" | "ends";

export interface FilterState {
  /** "__all__" = search all columns; otherwise exact column_name */
  field: string;
  value: string;
  mode: FilterMode;
}

export const FILTER_DEFAULT: FilterState = {
  field: "__all__",
  value: "",
  mode: "contains",
};

/** Basic string comparison with the selected mode. */
export function matchValue(haystack: string, needle: string, mode: FilterMode): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  switch (mode) {
    case "exact":  return h === n;
    case "starts": return h.startsWith(n);
    case "ends":   return h.endsWith(n);
    default:       return h.includes(n); // "contains"
  }
}

/**
 * Recursively flatten any object/array into dot-path → string pairs.
 * e.g. { galvano_system: { serial_number: "X1" } }
 *   → { "galvano_system.serial_number": "X1" }
 */
export function flattenObject(
  obj: unknown,
  prefix = "",
): Record<string, string> {
  if (obj == null || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v == null) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) =>
        Object.assign(out, flattenObject(item, `${path}[${i}]`)),
      );
    } else if (typeof v === "object") {
      Object.assign(out, flattenObject(v, path));
    } else {
      out[path] = String(v);
    }
  }
  return out;
}

/**
 * Match a flat experiment row against the filter using the given column names.
 * When field === "__all__", tests all columns.
 */
export function matchFlat(
  row: Record<string, unknown>,
  filter: FilterState,
  colNames: string[],
): boolean {
  if (!filter.value) return true;
  if (filter.field === "__all__") {
    return colNames.some((col) =>
      matchValue(String(row[col] ?? ""), filter.value, filter.mode),
    );
  }
  return matchValue(String(row[filter.field] ?? ""), filter.value, filter.mode);
}

/**
 * Match a row plus its (optionally loaded) detail object.
 *
 * - For "__all__": searches all flat columns THEN all flattened detail values.
 * - For a specific field: searches the flat column first; if not found there,
 *   searches the flattened detail for a key that is (or ends with) the field name.
 *
 * Returns true immediately on the first match found.
 */
export function matchDeep(
  row: Record<string, unknown>,
  detail: Record<string, unknown> | null,
  filter: FilterState,
  colNames: string[],
): boolean {
  if (!filter.value) return true;

  // Try flat match first
  if (matchFlat(row, filter, colNames)) return true;

  if (!detail) return false;

  const flat = flattenObject(detail);

  if (filter.field === "__all__") {
    // Scan every value in the flattened detail
    return Object.values(flat).some((v) =>
      matchValue(v, filter.value, filter.mode),
    );
  }

  // Specific field: exact path or suffix match
  const directVal = flat[filter.field];
  if (directVal !== undefined) {
    return matchValue(directVal, filter.value, filter.mode);
  }
  // e.g., field = "material_name" matches key "galvano_system.material.material_name"
  const suffixKey = Object.keys(flat).find(
    (k) => k === filter.field || k.endsWith(`.${filter.field}`),
  );
  if (suffixKey !== undefined) {
    return matchValue(flat[suffixKey], filter.value, filter.mode);
  }

  return false;
}
