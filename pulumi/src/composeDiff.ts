import { parse as parseYaml } from "yaml";

export interface PropertyChange {
  kind: "ADD" | "DELETE" | "UPDATE";
  path: string;
}

/**
 * Parse a YAML string into an object, resolving anchors/aliases.
 * Returns an empty object on empty/undefined input.
 */
function safeParseYaml(yamlStr: string | undefined): Record<string, any> {
  if (!yamlStr || yamlStr.trim() === "") return {};
  return parseYaml(yamlStr, { merge: true }) || {};
}

/**
 * Deep-merge two compose objects following Docker Compose override semantics:
 * - Scalars: override replaces main
 * - Maps: deep merge (override keys added/overwrite)
 * - Arrays: override replaces entirely
 */
function composeMerge(
  main: Record<string, any>,
  override: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = { ...main };
  for (const key of Object.keys(override)) {
    const mainVal = main[key];
    const overVal = override[key];
    if (
      isPlainObject(mainVal) &&
      isPlainObject(overVal)
    ) {
      result[key] = composeMerge(mainVal, overVal);
    } else {
      result[key] = overVal;
    }
  }
  return result;
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

/**
 * Normalize compose environment/labels from list form to map form.
 * `["FOO=bar", "BAZ=qux"]` → `{ FOO: "bar", BAZ: "qux" }`
 */
function listToMap(arr: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of arr) {
    const eqIdx = item.indexOf("=");
    if (eqIdx === -1) {
      result[item] = "";
    } else {
      result[item.slice(0, eqIdx)] = item.slice(eqIdx + 1);
    }
  }
  return result;
}

/** Fields whose list form should be normalized to map form */
const NORMALIZABLE_FIELDS = new Set(["environment", "labels"]);

/**
 * Walk a compose object and normalize environment/labels from list→map form.
 * Only normalizes inside `services.<name>.<field>`.
 */
function normalizeCompose(obj: Record<string, any>): Record<string, any> {
  const result = { ...obj };
  if (isPlainObject(result.services)) {
    const services: Record<string, any> = {};
    for (const [svcName, svcDef] of Object.entries(result.services)) {
      if (!isPlainObject(svcDef)) {
        services[svcName] = svcDef;
        continue;
      }
      const svc = { ...(svcDef as Record<string, any>) };
      for (const field of NORMALIZABLE_FIELDS) {
        if (Array.isArray(svc[field])) {
          svc[field] = listToMap(svc[field] as string[]);
        }
      }
      services[svcName] = svc;
    }
    result.services = services;
  }
  return result;
}

/**
 * Format a path segment. Uses dot notation for object keys, brackets for array indices.
 */
function joinPath(prefix: string, key: string | number): string {
  if (typeof key === "number") {
    return `${prefix}[${key}]`;
  }
  return prefix ? `${prefix}.${key}` : key;
}

/**
 * Deep diff two values, producing a list of property changes.
 */
function deepDiff(
  oldVal: any,
  newVal: any,
  prefix: string,
  changes: PropertyChange[],
): void {
  if (oldVal === newVal) return;

  // Both plain objects → recurse per key
  if (isPlainObject(oldVal) && isPlainObject(newVal)) {
    const allKeys = new Set([
      ...Object.keys(oldVal),
      ...Object.keys(newVal),
    ]);
    for (const key of allKeys) {
      const path = joinPath(prefix, key);
      if (!(key in oldVal)) {
        changes.push({ kind: "ADD", path });
      } else if (!(key in newVal)) {
        changes.push({ kind: "DELETE", path });
      } else {
        deepDiff(oldVal[key], newVal[key], path, changes);
      }
    }
    return;
  }

  // Both arrays → positional compare
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    const maxLen = Math.max(oldVal.length, newVal.length);
    for (let i = 0; i < maxLen; i++) {
      const path = joinPath(prefix, i);
      if (i >= oldVal.length) {
        changes.push({ kind: "ADD", path });
      } else if (i >= newVal.length) {
        changes.push({ kind: "DELETE", path });
      } else {
        deepDiff(oldVal[i], newVal[i], path, changes);
      }
    }
    return;
  }

  // Type mismatch or scalar difference
  if (oldVal !== newVal) {
    // Coerce to string for comparison to catch number/string equivalence (e.g. port "3000" vs 3000)
    if (String(oldVal) !== String(newVal)) {
      changes.push({ kind: "UPDATE", path: prefix });
    }
  }
}

/**
 * Diff two plain YAML strings, returning granular property changes.
 * No compose-specific merging or normalization is applied.
 */
export function diffYaml(oldYaml: string, newYaml: string): PropertyChange[] {
  const oldObj = safeParseYaml(oldYaml);
  const newObj = safeParseYaml(newYaml);
  const changes: PropertyChange[] = [];
  deepDiff(oldObj, newObj, "", changes);
  return changes;
}

/**
 * Diff two compose configurations (main + optional override), returning granular property changes.
 *
 * Merges main + override following Docker Compose semantics, normalizes
 * environment/labels from list→map form, then deep-diffs the effective configs.
 */
export function diffCompose(
  oldYaml: string,
  oldOverride: string | undefined,
  newYaml: string,
  newOverride: string | undefined,
): PropertyChange[] {
  const oldMain = safeParseYaml(oldYaml);
  const oldOver = safeParseYaml(oldOverride);
  const newMain = safeParseYaml(newYaml);
  const newOver = safeParseYaml(newOverride);

  const oldMerged = normalizeCompose(
    Object.keys(oldOver).length > 0 ? composeMerge(oldMain, oldOver) : oldMain,
  );
  const newMerged = normalizeCompose(
    Object.keys(newOver).length > 0 ? composeMerge(newMain, newOver) : newMain,
  );

  const changes: PropertyChange[] = [];
  deepDiff(oldMerged, newMerged, "", changes);
  return changes;
}
