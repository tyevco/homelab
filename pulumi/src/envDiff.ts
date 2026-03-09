import { PropertyChange } from "./composeDiff";

/**
 * Parse a .env file string into a key-value map.
 * Skips blank lines and comments (lines starting with #).
 */
function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      result[trimmed] = "";
    } else {
      result[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  }
  return result;
}

/**
 * Diff two .env file contents, returning per-variable property changes.
 */
export function diffEnvFile(oldEnv: string, newEnv: string): PropertyChange[] {
  const oldMap = parseEnv(oldEnv);
  const newMap = parseEnv(newEnv);
  const changes: PropertyChange[] = [];

  const allKeys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
  for (const key of allKeys) {
    if (!(key in oldMap)) {
      changes.push({ kind: "ADD", path: key });
    } else if (!(key in newMap)) {
      changes.push({ kind: "DELETE", path: key });
    } else if (oldMap[key] !== newMap[key]) {
      changes.push({ kind: "UPDATE", path: key });
    }
  }
  return changes;
}
