import type { Flight, Shift } from "../../../shared/types";
import {
  arrivalRoute,
  blocks,
  departureRoute,
  legPose,
} from "../model/network";
import { waitInfoFor } from "../lib/conflicts";

function PlaneMarker({
  f,
  x,
  y,
  heading,
  waiting,
  onClick,
}: {
  f: Flight;
  x: number;
  y: number;
  heading: number;
  waiting: boolean;
  onClick: () => void;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="traffic-marker"
      data-testid={`traffic-${f.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {waiting && <circle r="17" className="wait-ring" />}
      <g transform={`rotate(${heading + 90}) scale(0.3)`}>
        <path
          d="M0 -67 C-8 -63 -10 -47 -10 -21 L-65 10 L-65 20 L-10 6 L-8 44 L-26 57 L-26 63 L0 55 L26 63 L26 57 L8 44 L10 6 L65 20 L65 10 L10 -21 C10 -47 8 -63 0 -67Z"
          fill="#fbfaf4"
          stroke="#5d6d6a"
          strokeWidth="4"
        />
        <path d="M-7 26 L7 26 L6 50 L0 55 L-6 50Z" fill={f.color} />
      </g>
      <text y="30" textAnchor="middle" className="traffic-label">
        {f.id}
      </text>
      {waiting && (
        <text y="-20" textAnchor="middle" className="traffic-wait">
          ⏸
        </text>
      )}
    </g>
  );
}

export function TrafficLayer({
  state,
  onFlight,
}: {
  state: Shift;
  onFlight: (id: string) => void;
}) {
  const moving = state.flights.filter((f) => f.move && f.move.entered);
  const holdingOut = state.flights.filter(
    (f) => f.move && !f.move.entered && f.status === "arriving",
  );
  const approach = state.flights.filter((f) => f.status === "approach");
  const climbing = state.flights.filter(
    (f) =>
      f.status === "departed" &&
      f.departedAt !== undefined &&
      state.time - f.departedAt < 8,
  );
  return (
    <g>
      {state.closures.map((id) => {
        const blk = blocks[id];
        if (!blk) return null;
        const [a, z] = blk.path;
        const mx = (a.x + z.x) / 2;
        const my = (a.y + z.y) / 2;
        return (
          <g key={id} className="closure-marker">
            <line
              x1={a.x}
              y1={a.y}
              x2={z.x}
              y2={z.y}
              stroke="#c0554a"
              strokeWidth="14"
              strokeOpacity="0.35"
              strokeDasharray="10 8"
            />
            <text x={mx} y={my - 12} textAnchor="middle" className="closure-label">
              ⛔ 封闭
            </text>
          </g>
        );
      })}
      {[...holdingOut, ...approach].map((f, i) => {
        const x = 786 + i * 34;
        const y = 648;
        const cleared = !!f.move;
        return (
          <g key={f.id}>
            {i === 0 && (
              <line
                x1={762}
                y1={612}
                x2={x}
                y2={y}
                stroke="#8fa39b"
                strokeWidth="1"
                strokeDasharray="4 5"
              />
            )}
            <PlaneMarker
              f={f}
              x={x}
              y={y}
              heading={-90}
              waiting={cleared}
              onClick={() => onFlight(f.id)}
            />
            <text x={x} y={y + 42} textAnchor="middle" className="approach-tag">
              {cleared ? "五边" : "进近"}
            </text>
          </g>
        );
      })}
      {moving.map((f) => {
        const mv = f.move!;
        const leg = mv.route[mv.index];
        const { p, heading } = legPose(leg, mv.dist);
        return (
          <PlaneMarker
            key={f.id}
            f={f}
            x={p.x}
            y={p.y}
            heading={heading}
            waiting={!!waitInfoFor(state, f)}
            onClick={() => onFlight(f.id)}
          />
        );
      })}
      {climbing.map((f) => {
        const t = state.time - f.departedAt!;
        return (
          <g key={f.id} opacity={Math.max(0, 1 - t / 8)}>
            <PlaneMarker
              f={f}
              x={75 - t * 26}
              y={606 - t * 52}
              heading={-117}
              waiting={false}
              onClick={() => onFlight(f.id)}
            />
          </g>
        );
      })}
    </g>
  );
}

/** 选中航班的航路高亮：绿=已许可，橙=当前段，灰=待许可（含计划航路预览）。 */
export function RouteHighlight({ state }: { state: Shift }) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId);
  if (!f) return null;
  const mv = f.move;
  const route =
    mv?.route ??
    (f.status === "approach" && f.standId
      ? arrivalRoute(f.standId)
      : f.status === "parked" && f.standId
        ? departureRoute(f.standId)
        : null);
  if (!route) return null;
  return (
    <g pointerEvents="none">
      {route.map((leg, i) => {
        const blk = blocks[leg.block];
        const [a, z] = blk.path;
        const cleared = !!mv && i <= mv.clearedThrough;
        const current = !!mv && i === mv.index;
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={z.x}
            y2={z.y}
            stroke={current ? "#d79a4e" : cleared ? "#6fa287" : "#9aa39a"}
            strokeWidth={current ? 9 : 6}
            strokeOpacity={current ? 0.55 : 0.35}
            strokeDasharray={cleared ? undefined : "6 6"}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}
