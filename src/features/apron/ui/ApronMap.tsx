import type { Shift } from "../../../shared/types";
import { standFlight, occupiedFlight, compatibleStand } from "../lib/geometry";
import { Aircraft } from "./Aircraft";
import { blocks, nodes } from "../../movement/model/network";
import { TrafficLayer, RouteHighlight } from "../../movement";
interface Props {
  state: Shift;
  onStand: (id: string) => void;
  onFlight: (id: string) => void;
  onBlock: (id: string) => void;
}
export function ApronMap({ state, onStand, onFlight, onBlock }: Props) {
  const selected = state.flights.find((f) => f.id === state.selectedFlightId);
  return (
    <section className="map-shell">
      <div className="map-toolbar">
        <div>
          <span className="live-dot" />
          实时机坪 <span className="toolbar-en">APRON OVERVIEW</span>
        </div>
        <div className="weather">
          ↗ 240° / 06 KT <span>☀ 24°C</span>
        </div>
      </div>
      <svg
        viewBox="0 0 940 660"
        className="apron-svg"
        aria-label="交互机场机坪地图"
      >
        <defs>
          <pattern
            id="concrete"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M80 0H0V80"
              fill="none"
              stroke="#b7bcad"
              strokeWidth=".7"
            />
          </pattern>
          <pattern
            id="grass"
            width="13"
            height="13"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="3" cy="4" r=".8" fill="#a1aa8c" />
          </pattern>
          <filter id="shadow">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity=".13" />
          </filter>
        </defs>
        <rect width="940" height="660" fill="#c9cebd" />
        <rect width="940" height="660" fill="url(#grass)" />
        <path d="M0 140H940V565H0Z" fill="#d5d6c9" />
        <path d="M0 140H940V565H0Z" fill="url(#concrete)" />
        <path d="M0 355H940" stroke="#aab0a5" strokeWidth="64" />
        <path
          d="M0 355H940"
          stroke="#e7d48e"
          strokeWidth="2"
          strokeDasharray="14 10"
        />
        <text x="400" y="338" className="taxiway-label">
          TAXIWAY A →
        </text>
        <path d="M0 606H940" stroke="#858f87" strokeWidth="65" />
        <path
          d="M40 606H900"
          stroke="#eeeade"
          strokeWidth="2"
          strokeDasharray="25 16"
        />
        {[700, 730, 760].map((x) => (
          <path
            key={x}
            d={`M${x} 588V624`}
            stroke="#eeeade"
            strokeWidth="6"
          />
        ))}
        <text x="45" y="612" className="runway-label">
          RWY 24 →
        </text>
        <path
          d="M75 355V605M740 355V605"
          stroke="#e6cd79"
          strokeWidth="2"
          fill="none"
        />
        <text x="66" y="480" className="link-label" transform="rotate(-90 66 480)">
          W 单向 ↑
        </text>
        <text x="752" y="480" className="link-label" transform="rotate(90 752 480)">
          E 单向 ↓
        </text>
        {["N1", "N2", "N3", "W", "E"].map((n) => (
          <circle
            key={n}
            cx={nodes[n].x}
            cy={nodes[n].y}
            r="3.2"
            fill="#8d9a8b"
            stroke="#e9e7d8"
            strokeWidth="1"
          />
        ))}
        <path d="M150 118H730V144H150Z" fill="#949f99" />
        <rect
          x="120"
          y="35"
          width="640"
          height="86"
          rx="5"
          fill="#f0eee3"
          filter="url(#shadow)"
        />
        <path d="M130 105H750" stroke="#b0c0be" strokeWidth="20" />
        <path
          d="M130 105H750"
          stroke="#d9e4df"
          strokeWidth="12"
          strokeDasharray="25 4"
        />
        <text x="155" y="77" className="terminal-label">
          TERMINAL 01
        </text>
        <text x="634" y="77" className="terminal-sub">
          国内出发
        </text>
        {[220, 420, 650].map((x) => (
          <g key={x}>
            <path
              d={`M${x - 36} 119V155L${x - 9} 173`}
              stroke="#a8b3ab"
              strokeWidth="12"
              fill="none"
            />
            <path
              d={`M${x - 36} 119V155L${x - 9} 173`}
              stroke="#e9e8dc"
              strokeWidth="8"
              fill="none"
            />
          </g>
        ))}
        {["C_A01", "C_A02", "C_A03", "C_B01", "C_B02", "C_B03"].map((id) => {
          const [a, z] = blocks[id].path;
          return (
            <line
              key={id}
              x1={a.x}
              y1={a.y}
              x2={z.x}
              y2={z.y}
              stroke="#c9c0a4"
              strokeWidth="2"
              strokeDasharray="6 5"
            />
          );
        })}
        <RouteHighlight state={state} />
        {Object.values(blocks).map((blk) => {
          const [a, z] = blk.path;
          return (
            <line
              key={blk.id}
              x1={a.x}
              y1={a.y}
              x2={z.x}
              y2={z.y}
              stroke={
                state.selectedBlockId === blk.id ? "#cf8b4a" : "transparent"
              }
              strokeWidth={blk.kind === "runway" ? 40 : 20}
              strokeOpacity={state.selectedBlockId === blk.id ? 0.35 : 0}
              className="block-hit"
              onClick={() => onBlock(blk.id)}
            >
              <title>{blk.label}</title>
            </line>
          );
        })}
        {state.stands.map((stand) => {
          const f = standFlight(state, stand.id),
            reserved = occupiedFlight(state, stand.id),
            active = state.selectedStandId === stand.id;
          const compatible = selected && compatibleStand(stand, selected);
          return (
            <g
              key={stand.id}
              className="stand-group"
              role="button"
              tabIndex={0}
              aria-label={`机位 ${stand.id}`}
              data-testid={`stand-${stand.id}`}
              onClick={() => {
                onStand(stand.id);
                if (f) onFlight(f.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onStand(stand.id);
              }}
            >
              <rect
                x={stand.x - 82}
                y={stand.y - 80}
                width="164"
                height="155"
                rx="11"
                fill={active ? "#efc78c" : f ? "#c3ccbf" : "#cfd3c4"}
                fillOpacity={active ? 0.42 : 0.25}
                stroke={active ? "#cf7b3c" : f ? "#99ac9c" : "#b2b9a7"}
                strokeWidth={active ? 2 : 1}
                strokeDasharray={f ? undefined : "5 5"}
              />
              <path
                d={`M${stand.x} ${stand.y + 79}V${stand.y - 48}M${stand.x - 15} ${stand.y - 48}H${stand.x + 15}`}
                fill="none"
                stroke="#e9c76a"
                strokeWidth="2"
              />
              {f ? (
                <Aircraft
                  x={stand.x}
                  y={stand.y - 2}
                  color={f.color}
                  wide={f.size === "wide"}
                  departing={false}
                />
              ) : (
                <text
                  x={stand.x}
                  y={stand.y}
                  textAnchor="middle"
                  className="stand-empty"
                >
                  ＋
                </text>
              )}
              <rect
                x={stand.x - 31}
                y={stand.y + 85}
                width="62"
                height="24"
                rx="4"
                fill={active ? "#293f46" : "#e9e7d9"}
              />
              <text
                x={stand.x}
                y={stand.y + 101}
                textAnchor="middle"
                fill={active ? "#fff" : "#546356"}
                className="stand-label"
              >
                {stand.id} {stand.size === "wide" ? "W" : ""}
              </text>
              {f && (
                <text
                  x={stand.x}
                  y={stand.y + 126}
                  textAnchor="middle"
                  className="plane-label"
                >
                  {f.id}
                </text>
              )}
              {!f && reserved && (
                <text
                  x={stand.x}
                  y={stand.y + 4}
                  textAnchor="middle"
                  className="stand-reserved"
                >
                  ⇢ {reserved.id}
                </text>
              )}
              {!f && selected?.status === "approach" && compatible && (
                <circle
                  cx={stand.x + 67}
                  cy={stand.y - 65}
                  r="4"
                  fill="#639b84"
                />
              )}
            </g>
          );
        })}
        <rect
          x="780"
          y="387"
          width="131"
          height="161"
          rx="5"
          fill="#bfC5b5"
          stroke="#a7af9d"
        />
        <text x="795" y="411" className="depot-label">
          GSE STATION
        </text>
        {[0, 1, 2].map((n) => (
          <path
            key={n}
            d={`M792 ${441 + n * 32}H897`}
            stroke="#e8e4d2"
            strokeWidth="1"
          />
        ))}
        {state.vehicles.map((v) => (
          <g
            key={v.id}
            transform={`translate(${v.position.x} ${v.position.y})`}
            className="vehicle-marker"
          >
            <rect
              x="-10"
              y="-6"
              width="22"
              height="13"
              rx="3"
              fill={
                v.kind === "fuel"
                  ? "#dda24d"
                  : v.kind === "baggage"
                    ? "#4b9392"
                    : "#798cab"
              }
              stroke="#f3f0df"
              strokeWidth="1.5"
            />
            <rect x="6" y="-4" width="4" height="8" rx="1" fill="#e5e9df" />
            <circle cx="-5" cy="7" r="2" fill="#3a4644" />
            <circle cx="7" cy="7" r="2" fill="#3a4644" />
            {v.status === "travel" && (
              <circle
                r="18"
                fill="none"
                stroke="#fff"
                strokeOpacity=".5"
                className="moving-ring"
              />
            )}
          </g>
        ))}
        <TrafficLayer state={state} onFlight={onFlight} />
        <g transform="translate(880 60)">
          <circle r="25" fill="#f3f1e8" fillOpacity=".8" />
          <path d="M0 -17L6 10L0 5L-6 10Z" fill="#334d50" />
          <text y="-32" textAnchor="middle" className="compass">
            N
          </text>
        </g>
        <text
          x="37"
          y="520"
          transform="rotate(-90 37 520)"
          className="map-side-label"
        >
          APRON 07 / EAST FIELD
        </text>
      </svg>
      <div className="map-legend">
        <span>
          <i className="legend-idle" />
          空闲机位
        </span>
        <span>
          <i className="legend-occupied" />
          保障中
        </span>
        <span>
          <i className="legend-selected" />
          当前选择
        </span>
        <span>
          <i className="legend-wait" />
          等待
        </span>
        <span>
          <i className="legend-closed" />
          封闭段
        </span>
        <span className="map-scale">0 ━━━━━ 100 m</span>
      </div>
    </section>
  );
}
