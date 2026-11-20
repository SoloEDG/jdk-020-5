import type { Shift } from "../../../shared/types";
import { flightReady } from "../../flights/lib/readiness";
import {
  arrivalRoute,
  blocks,
  departureRoute,
} from "../model/network";
import {
  clearArrival,
  clearDeparture,
  releaseForward,
  returnToStand,
  revokeClearance,
  toggleHold,
} from "../model/clearance";
import {
  findDeadlocks,
  resolutionsFor,
  waitChain,
  waitInfoFor,
} from "../lib/conflicts";

function RouteChips({ state }: { state: Shift }) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId)!;
  const mv = f.move;
  const route =
    mv?.route ??
    (f.status === "approach" && f.standId
      ? arrivalRoute(f.standId)
      : f.status === "parked" && f.standId
        ? departureRoute(f.standId)
        : []);
  if (!route.length) return null;
  return (
    <div className="route-chips">
      {route.map((leg, i) => {
        const stateClass = mv
          ? i < mv.index
            ? "passed"
            : i === mv.index
              ? "current"
              : i <= mv.clearedThrough
                ? "cleared"
                : "pending"
          : "pending";
        return (
          <span key={i} className={`route-chip ${stateClass}`}>
            {blocks[leg.block].label}
          </span>
        );
      })}
    </div>
  );
}

export function FlowPanel({
  state,
  onChange,
}: {
  state: Shift;
  onChange: (s: Shift) => void;
}) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId)!;
  const mv = f.move;

  if (f.status === "approach") {
    return (
      <div className="flow-panel">
        <div className="subheading">
          <h3>落地与滑入</h3>
          <span>ARRIVAL CLEARANCE</span>
        </div>
        {f.standId ? (
          <>
            <RouteChips state={state} />
            <div className="flow-buttons">
              <button
                className="primary"
                data-testid="clear-arrival-full"
                onClick={() => onChange(clearArrival(state, f.id, "full"))}
              >
                全程许可 <span>→ {f.standId}</span>
              </button>
              <button
                className="secondary"
                data-testid="clear-arrival-segment"
                onClick={() => onChange(clearArrival(state, f.id, "segment"))}
              >
                分段放行
              </button>
            </div>
            <p className="flow-note">
              ↳ 全程许可预留整条航路（占用更久）；分段放行逐段申请，可能中途等待。
            </p>
          </>
        ) : (
          <p className="flow-note">先在上方分配机位，再签发落地许可。</p>
        )}
      </div>
    );
  }

  if ((f.status === "arriving" || f.status === "departing") && mv) {
    const wait = waitInfoFor(state, f);
    const chain = wait ? waitChain(state, f.id) : [];
    const cycle = findDeadlocks(state).find((c) => c.includes(f.id));
    const resolutions = cycle ? resolutionsFor(state, cycle) : [];
    const blk = blocks[mv.route[mv.index].block];
    const pct = mv.entered
      ? Math.min(100, Math.round((mv.dist / blk.length) * 100))
      : 0;
    return (
      <div className="flow-panel">
        <div className="subheading">
          <h3>{f.status === "arriving" ? "滑行进位" : "推出滑出"}</h3>
          <span>{mv.mode === "full" ? "全程许可" : "分段放行"}</span>
        </div>
        <RouteChips state={state} />
        <div className="move-status">
          <span>
            {mv.entered ? `${blk.label} · ${pct}%` : "尚未进入路网"}
          </span>
          {mv.holding && <b className="hold-tag">保持中</b>}
        </div>
        <div className="task-track">
          <i style={{ width: `${pct}%` }} />
        </div>
        {wait && (
          <div className={`wait-box ${cycle ? "deadlock" : ""}`}>
            <strong>{cycle ? "⚠ 互相等待" : "等待中"}</strong>
            <p>{wait.reason}</p>
            {chain.length > 0 && (
              <div className="wait-chain">
                {chain.map((c, i) => (
                  <span key={i}>
                    {c.id}：{c.reason}
                  </span>
                ))}
              </div>
            )}
            {resolutions.length > 0 && (
              <div className="resolution-list">
                {resolutions.map((r) => (
                  <button
                    key={r.action + r.flightId}
                    className="resolve"
                    data-testid={`resolve-${r.action}-${r.flightId}`}
                    onClick={() => {
                      const cmd =
                        r.action === "revoke"
                          ? revokeClearance
                          : r.action === "return"
                            ? returnToStand
                            : releaseForward;
                      onChange(cmd(state, r.flightId));
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flow-buttons">
          <button className="secondary" onClick={() => onChange(toggleHold(state, f.id))}>
            {mv.holding ? "继续滑行" : "保持等待"}
          </button>
          {!mv.entered && (
            <button
              className="secondary"
              onClick={() => onChange(revokeClearance(state, f.id))}
            >
              撤销许可
            </button>
          )}
          {f.status === "departing" && mv.entered && mv.index === 0 && (
            <button
              className="secondary"
              onClick={() => onChange(returnToStand(state, f.id))}
            >
              滑回机位
            </button>
          )}
          {mv.clearedThrough > mv.index && (
            <button
              className="secondary"
              onClick={() => onChange(releaseForward(state, f.id))}
            >
              解除后续预留
            </button>
          )}
        </div>
      </div>
    );
  }

  if (f.status === "parked") {
    const ready = flightReady(state, f.id);
    return (
      <div className="flow-panel">
        <div className="subheading">
          <h3>离港放行</h3>
          <span>DEPARTURE CLEARANCE</span>
        </div>
        <RouteChips state={state} />
        <div className="flow-buttons">
          <button
            className="primary"
            data-testid="depart"
            disabled={!ready}
            onClick={() => onChange(clearDeparture(state, f.id, "full"))}
          >
            批准推出 · 全程 <span>→</span>
          </button>
          <button
            className="secondary"
            data-testid="depart-segment"
            disabled={!ready}
            onClick={() => onChange(clearDeparture(state, f.id, "segment"))}
          >
            分段滑出
          </button>
        </div>
        {!ready && <p className="flow-note">↳ 完成全部地勤任务后方可推出。</p>}
      </div>
    );
  }

  if (f.status === "departed")
    return (
      <div className="flow-panel">
        <div className="subheading">
          <h3>已离港</h3>
          <span>DEPARTED</span>
        </div>
        <p className="flow-note">本航班已完成全部通行过程。</p>
      </div>
    );

  return null;
}
