import type { Shift } from "../../../shared/types";
import {
  blockOfFlight,
  blockReservedBy,
  blocks,
  wakeLeft,
} from "../model/network";
import { selectBlock, toggleClosure } from "../model/clearance";

export function BlockPanel({
  state,
  onChange,
}: {
  state: Shift;
  onChange: (s: Shift) => void;
}) {
  const id = state.selectedBlockId;
  if (!id) return null;
  const blk = blocks[id];
  if (!blk) return null;
  const closed = state.closures.includes(id);
  const occupant = state.flights.find((f) => blockOfFlight(f) === id);
  const reserver = state.flights.find(
    (f) => f.id !== occupant?.id && blockReservedBy(f, id),
  );
  const wake = state.flights
    .map((f) => wakeLeft(state, id, f.size))
    .reduce((a, b) => Math.max(a, b), 0);
  return (
    <div className="block-panel">
      <div className="subheading">
        <h3>{blk.label}</h3>
        <button
          className="panel-close"
          aria-label="关闭面板"
          onClick={() => onChange(selectBlock(state, undefined))}
        >
          ✕
        </button>
      </div>
      <div className="block-facts">
        <span>
          {blk.kind === "runway"
            ? "跑道"
            : blk.kind === "link"
              ? "单向联络道"
              : blk.kind === "connector"
                ? "机位联络线"
                : "滑行道"}
          {blk.oneWay ? " · 单向" : ""}
        </span>
        <span>
          {closed
            ? "⛔ 已临时关闭"
            : occupant
              ? `占用：${occupant.id}`
              : reserver
                ? `预留：${reserver.id}`
                : "空闲"}
          {wake > 0 ? ` · 尾流 ${Math.ceil(wake)}s` : ""}
        </span>
      </div>
      <button
        className={closed ? "primary full" : "secondary full"}
        data-testid={`closure-${id}`}
        onClick={() => onChange(toggleClosure(state, id))}
      >
        {closed ? "重新开放" : "临时关闭"}
      </button>
      <p className="flow-note">
        ↳ 关闭后：段内航空器继续驶离；已获许可未进入者等待重开；机位保障中的航班将拿不到含此段的许可。
      </p>
    </div>
  );
}
