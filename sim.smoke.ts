/* 无头仿真冒烟测试：验证跑道/滑行道通行系统的关键约束。 */
import type { Shift } from "./src/shared/types";
import { createShift, advanceClock } from "./src/features/session";
import { advanceFleet } from "./src/features/fleet";
import { advanceServices, dispatchService, serviceBlockReason } from "./src/features/services";
import { assignStand, flightReady } from "./src/features/flights";
import {
  advanceTraffic,
  blocks,
  clearArrival,
  clearDeparture,
  findDeadlocks,
  occupiedNodes,
  resolutionsFor,
  toggleClosure,
  waitInfoFor,
} from "./src/features/movement";
import { validShift } from "./src/features/session/lib/validation";

let failures = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}
function tick(s: Shift, dt: number): Shift {
  return advanceServices(
    advanceFleet(advanceTraffic(advanceClock(s, dt), dt), dt),
    dt,
  );
}
function run(s: Shift, seconds: number, step = 0.5): Shift {
  for (let t = 0; t < seconds; t += step) {
    s = tick(s, step);
    checkInvariants(s);
  }
  return s;
}
function checkInvariants(s: Shift) {
  const entered = s.flights.filter((f) => f.move?.entered);
  for (let i = 0; i < entered.length; i++)
    for (let j = i + 1; j < entered.length; j++) {
      const a = entered[i],
        b = entered[j];
      const ba = a.move!.route[a.move!.index].block,
        bb = b.move!.route[b.move!.index].block;
      if (ba === bb) throw new Error(`区块冲突 ${ba}: ${a.id} vs ${b.id} @t=${s.time}`);
      const na = occupiedNodes(a),
        nb = occupiedNodes(b);
      if (na.some((n) => nb.includes(n)))
        throw new Error(`节点冲突 ${a.id} vs ${b.id} @t=${s.time}`);
    }
  for (const f of s.flights)
    if (f.move) {
      const blk = blocks[f.move.route[f.move.index].block];
      if (f.move.dist < -1e-9 || f.move.dist > blk.length + 1e-6)
        throw new Error(`里程越界 ${f.id} ${f.move.dist}/${blk.length}`);
    }
}
function flight(s: Shift, id: string) {
  return s.flights.find((f) => f.id === id)!;
}
function serviceAll(s: Shift, id: string): Shift {
  // 依次派遣全部地勤（行李→清洁有依赖，燃油独立）
  for (const kind of ["baggage", "fuel"] as const) {
    const v = s.vehicles.find((x) => x.kind === kind && x.status === "idle");
    if (v) s = dispatchService(s, id, kind, v.id);
  }
  s = run(s, 120);
  const v = s.vehicles.find((x) => x.kind === "clean" && x.status === "idle");
  if (v) s = dispatchService(s, id, "clean", v.id);
  s = run(s, 120);
  return s;
}

console.log("— 测试 1：完整进港→保障→离港链路 —");
{
  let s = createShift();
  s = assignStand(s, "MU2451", "A01");
  ok(flight(s, "MU2451").standId === "A01", "机位已分配");
  s = clearArrival(s, "MU2451", "full");
  ok(flight(s, "MU2451").status === "arriving", "落地许可已签发");
  s = run(s, 30);
  ok(flight(s, "MU2451").move?.entered === true, "已落地进入跑道");
  s = run(s, 200);
  ok(flight(s, "MU2451").status === "parked", "滑入机位停靠");
  s = serviceAll(s, "MU2451");
  ok(flightReady(s, "MU2451"), "地勤全部完成");
  s = clearDeparture(s, "MU2451", "full");
  ok(flight(s, "MU2451").status === "departing", "离港许可已签发");
  s = run(s, 260);
  const f = flight(s, "MU2451");
  ok(f.status === "departed", "已起飞离港");
  ok(s.score > 0, `计分 ${s.score} > 0`);
  ok(f.departureAt !== undefined && f.departureAt > 0, "记录起飞时刻");
}

console.log("— 测试 2：分段放行与区块互斥（全航班自动运行） —");
{
  let s = createShift();
  let maxActive = 0;
  const stands = ["A01", "A02", "A03", "B01", "B02", "B03"];
  for (let t = 0; t < 2600 && s.flights.some((f) => f.status !== "departed"); t += 1) {
    // 自动管制员
    for (const f of s.flights) {
      if (f.status === "approach" && !f.standId) {
        const free = stands.find(
          (id) =>
            !s.flights.some(
              (g) =>
                g.standId === id &&
                g.status !== "departed" &&
                !(g.status === "departing" && g.move && g.move.index >= 1),
            ) && (f.size === "narrow" || s.stands.find((x) => x.id === id)?.size === "wide"),
        );
        if (free) s = assignStand(s, f.id, free);
      }
      if (f.status === "approach" && f.standId) {
        const before = s;
        s = clearArrival(s, f.id, "segment");
        if (s === before || flight(s, f.id).status !== "arriving")
          s = before; // 未批准则下拍再试（clearArrival 返回新状态但状态未变也算失败）
      }
      if (f.status === "parked") {
        for (const task of s.services.filter(
          (x) => x.flightId === f.id && x.status === "pending",
        )) {
          if (serviceBlockReason(s, f.id, task.kind)) continue;
          const v = s.vehicles.find((x) => x.kind === task.kind && x.status === "idle");
          if (v) s = dispatchService(s, f.id, task.kind, v.id);
        }
        if (flightReady(s, f.id)) s = clearDeparture(s, f.id, "segment");
      }
    }
    s = tick(s, 1);
    checkInvariants(s);
    maxActive = Math.max(
      maxActive,
      s.flights.filter((f) => f.move?.entered).length,
    );
  }
  ok(s.flights.every((f) => f.status === "departed"), "6 架全部离港");
  ok(maxActive >= 2, `高峰同时在场 ${maxActive} 架 ≥ 2`);
  ok(s.conflicts === 0, `无指令冲突（${s.conflicts}）`);
}

console.log("— 测试 3：临时关闭的三类结果 —");
{
  let s = createShift();
  // (a) 机位保障中的航班：航路含封闭段 → 许可被拒
  s = assignStand(s, "MU2451", "A01");
  s = clearArrival(s, "MU2451", "full");
  s = run(s, 240);
  ok(flight(s, "MU2451").status === "parked", "前提：MU2451 已停靠 A01");
  s = serviceAll(s, "MU2451");
  s = toggleClosure(s, "A1");
  s = clearDeparture(s, "MU2451", "full");
  ok(
    flight(s, "MU2451").status === "parked",
    "封闭 A1 后离港许可被拒，航班留在机位",
  );
  s = toggleClosure(s, "A1");
  s = clearDeparture(s, "MU2451", "full");
  ok(flight(s, "MU2451").status === "departing", "重开后许可恢复");
  s = run(s, 300);
  ok(flight(s, "MU2451").status === "departed", "前提：MU2451 已起飞");

  // (b) 已获许可但未进入：许可冻结，等待重开
  s = assignStand(s, "CZ3088", "A03");
  s = clearArrival(s, "CZ3088", "full");
  s = toggleClosure(s, "RWY"); // 许可后、进入前立即关闭
  s = run(s, 10);
  ok(
    flight(s, "CZ3088").status === "arriving" &&
      !flight(s, "CZ3088").move!.entered,
    "跑道关闭后进港航班未进入，等待重开",
  );
  ok(
    (waitInfoFor(s, flight(s, "CZ3088"))?.reason ?? "").includes("关闭"),
    "等待原因显示为临时关闭",
  );
  s = toggleClosure(s, "RWY");
  s = run(s, 300);
  ok(flight(s, "CZ3088").status === "parked", "重开后继续滑行至机位");

  // (c) 已经进入封闭段：继续驶离
  s = assignStand(s, "CA1833", "B02");
  s = clearArrival(s, "CA1833", "full");
  // 等它进入 A1（路径 RWY→TW→A0→A1→C_B02）
  let entered = false;
  for (let t = 0; t < 200 && !entered; t += 0.5) {
    s = tick(s, 0.5);
    const mv = flight(s, "CA1833").move;
    if (mv?.entered && mv.route[mv.index].block === "A1") entered = true;
  }
  ok(entered, "前提：CA1833 已在 A1 段内");
  s = toggleClosure(s, "A1");
  s = run(s, 120);
  ok(
    flight(s, "CA1833").status === "parked",
    "段内航空器继续驶离并停靠",
  );
  s = toggleClosure(s, "A1");
}

console.log("— 测试 4：尾流间隔 —");
{
  let s = createShift();
  s = assignStand(s, "CZ3088", "A03"); // 宽体
  s = clearArrival(s, "CZ3088", "full");
  s = run(s, 40); // 宽体已落地在跑道上或刚脱离
  // 等它脱离跑道
  let vacatedAt = -1;
  for (let t = 0; t < 120 && vacatedAt < 0; t += 0.5) {
    s = tick(s, 0.5);
    if (s.wake["RWY"]) vacatedAt = s.wake["RWY"].time;
  }
  ok(vacatedAt >= 0, "宽体机已脱离跑道并留下尾流");
  s = assignStand(s, "MU2451", "A01"); // 窄体跟随
  const before = s;
  s = clearArrival(s, "MU2451", "full");
  ok(
    flight(s, "MU2451").status === "approach" || s === before,
    "宽体脱离后 24s 内窄体落地许可被拒",
  );
  // 宽体在跑道与滑行道留下的尾流都满足后，许可应放行
  let granted = false;
  for (let t = 0; t < 120 && !granted; t += 1) {
    s = tick(s, 1);
    s = clearArrival(s, "MU2451", "full");
    granted = flight(s, "MU2451").status === "arriving";
  }
  ok(granted, "尾流间隔满足后许可放行");
  s = run(s, 400);
}

console.log("— 测试 5：互相等待与安全解围 —");
{
  let s = createShift();
  // MU2451 停 A02 并完成保障
  s = assignStand(s, "MU2451", "A02");
  s = clearArrival(s, "MU2451", "full");
  s = run(s, 240);
  s = serviceAll(s, "MU2451");
  ok(flightReady(s, "MU2451"), "前提：MU2451 保障完成");
  // CA1833 分段放行至 A03
  s = assignStand(s, "CA1833", "A03");
  s = clearArrival(s, "CA1833", "segment");
  // 等 CA1833 进入 A1 末段附近
  for (let t = 0; t < 200; t += 0.5) {
    s = tick(s, 0.5);
    const mv = flight(s, "CA1833").move;
    if (mv?.entered && mv.route[mv.index].block === "A1" && mv.dist > 150) break;
  }
  // MU2451 全程许可（预留 C_A02→A2→A3→TE→RWY）
  s = clearDeparture(s, "MU2451", "full");
  ok(flight(s, "MU2451").status === "departing", "MU2451 已获离港许可");
  // 推进直到形成互相等待
  let cycle: string[][] = [];
  for (let t = 0; t < 120 && cycle.length === 0; t += 0.5) {
    s = tick(s, 0.5);
    checkInvariants(s);
    cycle = findDeadlocks(s);
  }
  ok(cycle.length > 0, "检测到互相等待的环");
  if (cycle.length > 0) {
    const members = cycle[0];
    ok(
      members.includes("MU2451") && members.includes("CA1833"),
      `环成员 ${members.join("⇄")}`,
    );
    const res = resolutionsFor(s, members);
    ok(res.length > 0, `提供 ${res.length} 个安全解围选项`);
    for (const r of res) console.log(`    可选：${r.label}`);
    // 应用第一个解围，环应消失，且随后两机都能完成
    const cmd = res[0];
    const { releaseForward, returnToStand, revokeClearance } = await import(
      "./src/features/movement"
    );
    const apply =
      cmd.action === "revoke"
        ? revokeClearance
        : cmd.action === "return"
          ? returnToStand
          : releaseForward;
    s = apply(s, cmd.flightId);
    ok(findDeadlocks(s).length === 0, "解围后互相等待消失");
    s = run(s, 400);
    ok(
      flight(s, "CA1833").status === "parked" ||
        flight(s, "CA1833").status === "departing" ||
        flight(s, "CA1833").status === "departed",
      "CA1833 继续进位",
    );
  }
}

console.log("— 测试 6：加速与存档恢复一致性 —");
{
  let s = createShift();
  s = assignStand(s, "MU2451", "A01");
  s = clearArrival(s, "MU2451", "full");
  s = assignStand(s, "CZ3088", "B03");
  s = run(s, 30);
  s = clearArrival(s, "CZ3088", "segment");
  // 大步长（4× 加速）推进到滑行中途
  s = run(s, 60, 4);
  checkInvariants(s);
  // 存档 → 恢复
  const saved = JSON.parse(JSON.stringify(s)) as unknown;
  ok(validShift(saved), "存档通过严格校验");
  const restored = saved as Shift;
  // 双跑对比：恢复后继续应与原状态继续一致
  let a = s,
    b = restored;
  for (let t = 0; t < 200; t += 1) {
    a = tick(a, 1);
    b = tick(b, 1);
  }
  const pa = a.flights.map((f) => `${f.id}:${f.status}:${f.move ? `${f.move.index}:${f.move.dist.toFixed(3)}` : "-"}`).join("|");
  const pb = b.flights.map((f) => `${f.id}:${f.status}:${f.move ? `${f.move.index}:${f.move.dist.toFixed(3)}` : "-"}`).join("|");
  ok(pa === pb, "恢复后继续推进与原状态完全一致");
  ok(
    JSON.stringify(a.wake) === JSON.stringify(b.wake),
    "尾流释放时刻一致",
  );
}

console.log(failures === 0 ? "\n全部通过 ✓" : `\n${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
