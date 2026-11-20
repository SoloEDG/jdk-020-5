import type { Flight, Shift } from "../../../shared/types";
import { copyShift } from "../../../shared/document";
import { blocks } from "../model/network";
import {
  movementGate,
  releaseForward,
  returnToStand,
  revokeClearance,
} from "../model/clearance";

export interface WaitInfo {
  reason: string;
  blockers: string[];
}

/** 由当前状态推导航空器的等待原因（与推进逻辑共用门控判定）。 */
export function waitInfoFor(state: Shift, f: Flight): WaitInfo | undefined {
  const mv = f.move;
  if (!mv) return undefined;
  if (mv.holding) return { reason: "指令保持等待", blockers: [] };
  const gate = movementGate(state, f);
  if (gate.pass || !gate.check) return undefined;
  if (mv.entered) {
    const blk = blocks[mv.route[mv.index].block];
    if (mv.dist < Math.min(gate.maxDist, blk.length) - 1e-6) return undefined;
  }
  return { reason: gate.check.reason!, blockers: gate.check.blockers };
}

function waitGraph(state: Shift): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const f of state.flights) {
    const w = waitInfoFor(state, f);
    if (w) edges.set(f.id, w.blockers.filter((b) => edges0(state, b)));
  }
  return edges;
}
function edges0(state: Shift, id: string): boolean {
  return state.flights.some((f) => f.id === id && f.move);
}

/** Tarjan 强连通分量，返回所有大小>1 或带自环的分量（互相等待的环）。 */
export function findDeadlocks(state: Shift): string[][] {
  const graph = waitGraph(state);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  let counter = 0;
  function visit(v: string) {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1 || (graph.get(v) ?? []).includes(v)) out.push(scc);
    }
  }
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return out;
}

/** 从航班出发沿等待边追溯受阻链条（含环检测）。 */
export function waitChain(
  state: Shift,
  id: string,
): { id: string; reason: string }[] {
  const chain: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur && !seen.has(cur) && chain.length < 6) {
    seen.add(cur);
    const f = state.flights.find((x) => x.id === cur);
    if (!f) break;
    const w = waitInfoFor(state, f);
    if (!w) break;
    chain.push({ id: cur, reason: w.reason });
    cur = w.blockers[0];
  }
  if (cur && seen.has(cur)) chain.push({ id: cur, reason: "↩ 形成互相等待" });
  return chain;
}

export interface Resolution {
  flightId: string;
  action: "revoke" | "return" | "release";
  label: string;
}

function applyResolution(state: Shift, r: Resolution): Shift {
  if (r.action === "revoke") return revokeClearance(state, r.flightId);
  if (r.action === "return") return returnToStand(state, r.flightId);
  return releaseForward(state, r.flightId);
}

/** 对给定环计算能安全打破它的操作（逐一仿真验证）。 */
export function resolutionsFor(state: Shift, cycle: string[]): Resolution[] {
  const candidates: Resolution[] = [];
  for (const id of cycle) {
    const f = state.flights.find((x) => x.id === id);
    const mv = f?.move;
    if (!f || !mv) continue;
    if (!mv.entered)
      candidates.push({
        flightId: id,
        action: "revoke",
        label: `撤销 ${id} 的${f.status === "departing" ? "离港" : "落地"}许可`,
      });
    if (f.status === "departing" && mv.entered && mv.index === 0)
      candidates.push({
        flightId: id,
        action: "return",
        label: `${id} 滑回机位等待`,
      });
    if (mv.clearedThrough > mv.index)
      candidates.push({
        flightId: id,
        action: "release",
        label: `解除 ${id} 的后续路段预留`,
      });
  }
  return candidates.filter((r) => {
    const next = applyResolution(copyShift(state), r);
    const still = findDeadlocks(next);
    return !still.some((c) => c.some((id) => cycle.includes(id)));
  });
}
