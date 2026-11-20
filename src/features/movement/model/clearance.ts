import type { ClearanceMode, Flight, RouteLeg, Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { flightReady } from "../../flights/lib/readiness";
import {
  arrivalRoute,
  blockOfFlight,
  blockReservedBy,
  blocks,
  departureRoute,
  geoEnd,
  geoStart,
  NODE_ZONE,
  occupiedNodes,
  wakeLeft,
} from "./network";

export interface Check {
  ok: boolean;
  reason?: string;
  blockers: string[];
}
const ok: Check = { ok: true, blockers: [] };
function fail(reason: string, blockers: string[] = []): Check {
  return { ok: false, reason, blockers };
}

/** 目标航段进入检查：互斥占用、节点冲突、预留、尾流、封闭、单向。 */
export function canEnter(state: Shift, f: Flight, legIndex: number): Check {
  const mv = f.move;
  if (!mv) return fail("无通行计划");
  const leg = mv.route[legIndex];
  const blk = blocks[leg.block];
  if (state.closures.includes(leg.block))
    return fail(`${blk.label} 临时关闭`);
  if (blk.oneWay && leg.rev) return fail(`${blk.label} 为单向路段`);
  for (const g of state.flights) {
    if (g.id === f.id || !g.move) continue;
    if (blockOfFlight(g) === leg.block)
      return fail(`${blk.label} 被 ${g.id} 占用`, [g.id]);
    if (blockReservedBy(g, leg.block))
      return fail(`${blk.label} 已由 ${g.id} 预留`, [g.id]);
  }
  const node =
    !mv.entered && legIndex === mv.index
      ? geoStart(leg)
      : geoEnd(mv.route[mv.index]);
  for (const g of state.flights) {
    if (g.id === f.id || !g.move?.entered) continue;
    if (occupiedNodes(g).includes(node))
      return fail(`交叉口 ${node} 被 ${g.id} 占用`, [g.id]);
  }
  const wake = wakeLeft(state, leg.block, f.size);
  if (wake > 0) return fail(`尾流间隔 ${Math.ceil(wake)}s`);
  return ok;
}

export interface Gate {
  pass: boolean;
  maxDist: number;
  check: Check | null;
}

/**
 * 通行门控：移动推进、等待显示与死锁检测共用的唯一判定。
 * 返回能否越过当前段末端，以及本段内允许滑行的最远里程。
 * 无法越界时：若交叉口被他人占用则在道口前停下，否则停在段末（机头占住交叉口）。
 */
export function movementGate(state: Shift, f: Flight): Gate {
  const mv = f.move!;
  const leg = mv.route[mv.index];
  const blk = blocks[leg.block];
  if (!mv.entered) {
    const chk = canEnter(state, f, mv.index);
    return { pass: chk.ok, maxDist: 0, check: chk.ok ? null : chk };
  }
  const next = mv.index + 1;
  if (next >= mv.route.length)
    return { pass: true, maxDist: blk.length, check: null };
  const chk = canEnter(state, f, next);
  if (chk.ok) return { pass: true, maxDist: blk.length, check: null };
  const endNode = geoEnd(leg);
  const nodeBusy = state.flights.some(
    (g) => g.id !== f.id && g.move?.entered && occupiedNodes(g).includes(endNode),
  );
  const maxDist = nodeBusy
    ? Math.max(mv.dist, blk.length - NODE_ZONE)
    : blk.length;
  return { pass: false, maxDist: Math.min(blk.length, maxDist), check: chk };
}

/** 发放许可前的整体校核：全程模式检查所有路段，分段模式只检查首段。 */
export function grantCheck(
  state: Shift,
  f: Flight,
  route: RouteLeg[],
  mode: ClearanceMode,
): Check {
  const probe: Flight = {
    ...f,
    move: {
      route,
      index: 0,
      dist: 0,
      mode,
      clearedThrough: mode === "full" ? route.length - 1 : 0,
      holding: false,
      entered: false,
    },
  };
  const legs = mode === "full" ? route.map((_, i) => i) : [0];
  for (const i of legs) {
    const leg = route[i];
    const blk = blocks[leg.block];
    if (state.closures.includes(leg.block))
      return fail(`${blk.label} 临时关闭，航路不可用`);
    for (const g of state.flights) {
      if (g.id === f.id || !g.move) continue;
      if (blockOfFlight(g) === leg.block)
        return fail(`${blk.label} 被 ${g.id} 占用`, [g.id]);
      if (blockReservedBy(g, leg.block))
        return fail(`${blk.label} 已由 ${g.id} 预留`, [g.id]);
    }
    if (wakeLeft(state, leg.block, f.size) > 0)
      return fail(`${blk.label} 尾流间隔未满足`);
  }
  return canEnter(state, probe, 0);
}

function startMove(
  s: Shift,
  f: Flight,
  route: RouteLeg[],
  mode: ClearanceMode,
): void {
  f.move = {
    route,
    index: 0,
    dist: 0,
    mode,
    clearedThrough: mode === "full" ? route.length - 1 : 0,
    holding: false,
    entered: false,
  };
}

export function clearArrival(
  state: Shift,
  id: string,
  mode: ClearanceMode,
): Shift {
  const s = copyShift(state);
  const f = s.flights.find((x) => x.id === id);
  if (!f || f.status !== "approach" || !f.standId) {
    record(s, "落地许可未批准：需先分配机位", "warning");
    return s;
  }
  const route = arrivalRoute(f.standId);
  const chk = grantCheck(s, f, route, mode);
  if (!chk.ok) {
    record(s, `${id} 落地许可未批准：${chk.reason}`, "warning");
    return s;
  }
  f.status = "arriving";
  startMove(s, f, route, mode);
  record(
    s,
    mode === "full"
      ? `${id} 获准落地 · 全程滑行至 ${f.standId}`
      : `${id} 获准落地 · 分段放行`,
    "success",
  );
  return s;
}

export function clearDeparture(
  state: Shift,
  id: string,
  mode: ClearanceMode,
): Shift {
  const s = copyShift(state);
  const f = s.flights.find((x) => x.id === id);
  if (!f) return state;
  if (f.status !== "parked" || !flightReady(s, id)) {
    record(s, "离港未获许可：请先完成全部地勤任务", "warning");
    return s;
  }
  const route = departureRoute(f.standId!);
  const chk = grantCheck(s, f, route, mode);
  if (!chk.ok) {
    record(s, `${id} 离港许可未批准：${chk.reason}`, "warning");
    return s;
  }
  f.status = "departing";
  startMove(s, f, route, mode);
  record(
    s,
    mode === "full"
      ? `${id} 获准推出 · 全程滑行至跑道`
      : `${id} 获准推出 · 分段放行`,
    "success",
  );
  return s;
}

export function toggleHold(state: Shift, id: string): Shift {
  const s = copyShift(state);
  const f = s.flights.find((x) => x.id === id);
  if (!f?.move) return state;
  f.move.holding = !f.move.holding;
  record(s, f.move.holding ? `${id} 指令保持等待` : `${id} 继续滑行`);
  return s;
}

/** 撤销许可：仅适用于已获许可但尚未进入路网的航空器。 */
export function revokeClearance(state: Shift, id: string): Shift {
  const s = copyShift(state);
  const f = s.flights.find((x) => x.id === id);
  if (!f?.move || f.move.entered) return state;
  const wasDeparture = f.status === "departing";
  f.status = wasDeparture ? "parked" : "approach";
  f.move = undefined;
  record(s, `${id} ${wasDeparture ? "离港" : "落地"}许可已撤销`, "info");
  return s;
}

/** 滑回机位：出发航空器仍在机位联络线上时可安全退回。 */
export function returnToStand(state: Shift, id: string): Shift {
  const s = copyShift(state);
  const f = s.flights.find((x) => x.id === id);
  if (!f?.move || f.status !== "departing" || f.move.index !== 0) return state;
  f.status = "parked";
  f.move = undefined;
  record(s, `${id} 已滑回机位 ${f.standId} 等待`, "info");
  return s;
}

/** 解除后续预留：保留当前段，其余改为分段放行。 */
export function releaseForward(state: Shift, id: string): Shift {
  const s = copyShift(state);
  const f = s.flights.find((x) => x.id === id);
  if (!f?.move || f.move.clearedThrough <= f.move.index) return state;
  f.move.clearedThrough = f.move.index;
  f.move.mode = "segment";
  record(s, `${id} 已解除后续路段预留，改为分段放行`, "info");
  return s;
}

export function toggleClosure(state: Shift, blockId: string): Shift {
  const s = copyShift(state);
  const blk = blocks[blockId];
  if (!blk) return state;
  if (s.closures.includes(blockId)) {
    s.closures = s.closures.filter((x) => x !== blockId);
    record(s, `${blk.label} 已重新开放`, "success");
  } else {
    s.closures.push(blockId);
    record(
      s,
      `${blk.label} 临时关闭 · 段内航空器继续驶离，未进入者等待`,
      "warning",
    );
  }
  return s;
}

export function selectBlock(state: Shift, blockId?: string): Shift {
  return { ...state, selectedBlockId: blockId };
}
