import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { compatibleStand, standReserved } from "../../apron/lib/geometry";
export function assignStand(state: Shift, id: string, standId: string): Shift {
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id),
    stand = s.stands.find((x) => x.id === standId);
  if (!f || !stand) return state;
  if (
    f.status !== "approach" ||
    standReserved(s, standId) ||
    !compatibleStand(stand, f)
  ) {
    s.conflicts++;
    s.score -= 10;
    record(s, "机位指令冲突：请检查尺寸、占用与航班状态", "warning");
    return s;
  }
  f.standId = standId;
  s.selectedStandId = standId;
  record(s, `${id} 已分配 ${standId} · 等待落地许可`, "success");
  return s;
}
export function selectFlight(state: Shift, id: string): Shift {
  return {
    ...state,
    selectedFlightId: id,
    selectedStandId: state.flights.find((f) => f.id === id)?.standId,
  };
}
