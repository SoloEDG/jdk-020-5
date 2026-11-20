import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
export function advanceClock(state: Shift, seconds: number): Shift {
  if (state.paused) return state;
  const s = copyShift(state);
  s.time += seconds;
  for (const f of s.flights) {
    if (f.status === "scheduled" && s.time >= f.arrival) {
      f.status = "approach";
      record(s, `${f.id} 加入进近序列 · 等待落地许可`);
    }
  }
  return s;
}
export function togglePause(s: Shift): Shift {
  return { ...s, paused: !s.paused };
}
export function changeSpeed(s: Shift): Shift {
  return { ...s, speed: s.speed === 1 ? 2 : s.speed === 2 ? 4 : 1 };
}
