import type { Shift } from "../../../shared/types";
import { compatibleStand, standReserved } from "../lib/geometry";
export function StandPicker({
  state,
  onAssign,
  onSelect,
}: {
  state: Shift;
  onAssign: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId);
  if (!f || f.status !== "approach") return null;
  const valid = state.stands.find((s) => s.id === state.selectedStandId);
  return (
    <div className="stand-picker">
      <div className="hint-label">01 / 为航班分配机位</div>
      <div className="stand-choices">
        {state.stands.map((s) => (
          <button
            key={s.id}
            disabled={standReserved(state, s.id) || !compatibleStand(s, f)}
            className={s.id === state.selectedStandId ? "chosen" : ""}
            onClick={() => onSelect(s.id)}
          >
            {s.id}
            {s.size === "wide" && <small>W</small>}
          </button>
        ))}
      </div>
      <button
        className="primary full"
        data-testid="assign-stand"
        disabled={
          !valid ||
          standReserved(state, valid.id) ||
          !compatibleStand(valid, f)
        }
        onClick={() => valid && onAssign(valid.id)}
      >
        分配至 {valid?.id ?? "所选机位"} <span>↗</span>
      </button>
    </div>
  );
}
