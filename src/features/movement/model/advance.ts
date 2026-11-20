import type { Flight, Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { blocks } from "./network";
import { movementGate } from "./clearance";
import { findDeadlocks } from "../lib/conflicts";

function setWait(s: Shift, f: Flight, reason: string, blockers: string[]) {
  const mv = f.move!;
  if (mv.waitReason !== reason) {
    mv.waitReason = reason;
    mv.waitBlockers = blockers;
    record(s, `${f.id} 等待：${reason}`, "info");
  } else {
    mv.waitBlockers = blockers;
  }
}
function clearWait(f: Flight) {
  if (!f.move) return;
  f.move.waitReason = undefined;
  f.move.waitBlockers = undefined;
}

function finishRoute(s: Shift, f: Flight) {
  if (f.status === "arriving") {
    f.status = "parked";
    f.move = undefined;
    record(s, `${f.id} 已滑入机位 ${f.standId} · 开始保障`, "success");
  } else if (f.status === "departing") {
    f.status = "departed";
    f.departedAt = s.time;
    f.departureAt = s.time;
    f.move = undefined;
    const delay = Math.max(0, s.time - f.deadline);
    const points = Math.max(20, 120 - Math.floor(delay));
    s.score += points;
    record(s, `${f.id} 已起飞 · +${points} 分`, "success");
  }
}

export function advanceTraffic(state: Shift, dt: number): Shift {
  const s = copyShift(state);
  for (const f of s.flights) {
    const mv = f.move;
    if (!mv) continue;
    if (mv.holding) {
      setWait(s, f, "指令保持等待", []);
      continue;
    }
    let remaining = dt;
    let guard = 0;
    while (remaining > 1e-9 && guard++ < 16 && f.move) {
      const gate = movementGate(s, f);
      const leg = mv.route[mv.index];
      const blk = blocks[leg.block];
      if (!mv.entered) {
        if (!gate.pass) {
          setWait(s, f, gate.check!.reason!, gate.check!.blockers);
          break;
        }
        mv.entered = true;
        clearWait(f);
        if (blk.id === "RWY") record(s, `${f.id} 已落地 · 跑道 24`);
        else record(s, `${f.id} 开始推出`);
        continue;
      }
      const next = mv.index + 1;
      if (mv.dist >= blk.length - 1e-9) {
        if (next >= mv.route.length) {
          finishRoute(s, f);
          break;
        }
        if (!gate.pass) {
          setWait(s, f, gate.check!.reason!, gate.check!.blockers);
          break;
        }
        if (mv.clearedThrough < next) mv.clearedThrough = next;
        s.wake[leg.block] = { time: s.time, size: f.size };
        if (f.status === "departing" && mv.index === 0 && f.standId)
          record(s, `机位 ${f.standId} 已释放`);
        mv.index = next;
        mv.dist = 0;
        clearWait(f);
        if (mv.route[next].block === "RWY")
          record(s, `${f.id} 进入跑道 · 起飞滑跑`);
        continue;
      }
      const room = gate.maxDist - mv.dist;
      if (room <= 1e-9) {
        setWait(
          s,
          f,
          gate.check?.reason ?? "前方交叉口占用",
          gate.check?.blockers ?? [],
        );
        break;
      }
      const step = Math.min(room, remaining * blk.speed);
      mv.dist += step;
      remaining -= step / blk.speed;
    }
  }
  const before = findDeadlocks(state).map((c) => c.join("+"));
  for (const cycle of findDeadlocks(s)) {
    const sig = cycle.join("+");
    if (!before.includes(sig))
      record(s, `互相等待：${cycle.join(" ⇄ ")} · 请选择解围方案`, "warning");
  }
  return s;
}
