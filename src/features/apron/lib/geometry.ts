import type { Flight, Point, Stand, Shift } from "../../../shared/types";
export function compatibleStand(stand: Stand, flight: Flight): boolean {
  return flight.size === "narrow" || stand.size === "wide";
}
/** 机位是否已被占用或预留（进港已分配 / 停靠 / 尚未滑出联络线的离港）。 */
export function standReserved(state: Shift, id: string): boolean {
  return state.flights.some(
    (f) =>
      f.standId === id &&
      f.status !== "departed" &&
      !(f.status === "departing" && !!f.move && f.move.index >= 1),
  );
}
/** 实际应画在机位上的航班（停靠中，或已许可但尚未开始推出的离港）。 */
export function standFlight(state: Shift, id: string): Flight | undefined {
  return state.flights.find(
    (f) =>
      f.standId === id &&
      (f.status === "parked" ||
        (f.status === "departing" &&
          !!f.move &&
          f.move.index === 0 &&
          !f.move.entered)),
  );
}
export function occupiedFlight(state: Shift, id: string): Flight | undefined {
  return state.flights.find(
    (f) =>
      f.standId === id &&
      f.status !== "departed" &&
      !(f.status === "departing" && !!f.move && f.move.index >= 1),
  );
}
export function interpolate(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export function selectStand(state: Shift, id: string): Shift {
  return { ...state, selectedStandId: id };
}
