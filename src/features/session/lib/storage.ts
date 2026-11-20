import type { Shift } from "../../../shared/types";
import { validShift } from "./validation";
const key = "apron07-shift-v1";
export function saveShift(state: Shift): void {
  localStorage.setItem(key, JSON.stringify(state));
}
/** 兼容旧存档：补齐后新增字段的默认值，再进入严格校验。 */
function normalize(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.closures)) v.closures = [];
  if (typeof v.wake !== "object" || v.wake === null) v.wake = {};
  return v;
}
export function loadShift(): Shift | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const value: unknown = normalize(JSON.parse(raw));
    return validShift(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
