import type { Shift } from "../../../shared/types";
import { blocks } from "../../movement/model/network";
const kinds = ["fuel", "baggage", "clean"];
const flightStates = [
  "scheduled",
  "approach",
  "arriving",
  "parked",
  "departing",
  "departed",
];
const serviceStates = ["pending", "travel", "working", "done"];
const vehicleStates = ["idle", "travel", "working", "returning"];
const blockIdSet = new Set(Object.keys(blocks));
type Row = Record<string, unknown>;
function row(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function point(value: unknown): boolean {
  return row(value) && finite(value.x) && finite(value.y);
}
function unique(values: Row[]): boolean {
  return (
    values.every((x) => text(x.id)) &&
    new Set(values.map((x) => x.id)).size === values.length
  );
}
function collection(value: unknown, length: number): value is Row[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(row) &&
    unique(value)
  );
}
function validMove(value: unknown): boolean {
  if (!row(value)) return false;
  const route = value.route;
  if (
    !Array.isArray(route) ||
    route.length === 0 ||
    !route.every(
      (leg) =>
        row(leg) &&
        typeof leg.block === "string" &&
        blockIdSet.has(leg.block) &&
        typeof leg.rev === "boolean",
    )
  )
    return false;
  const legs = route as { block: string; rev: boolean }[];
  if (
    !Number.isInteger(value.index) ||
    (value.index as number) < 0 ||
    (value.index as number) >= legs.length ||
    !finite(value.dist) ||
    value.dist < 0 ||
    value.dist > blocks[legs[value.index as number].block].length + 1e-6 ||
    !["full", "segment"].includes(value.mode as string) ||
    !Number.isInteger(value.clearedThrough) ||
    (value.clearedThrough as number) < (value.index as number) ||
    (value.clearedThrough as number) >= legs.length ||
    typeof value.holding !== "boolean" ||
    typeof value.entered !== "boolean"
  )
    return false;
  return (
    (value.waitReason === undefined || typeof value.waitReason === "string") &&
    (value.waitBlockers === undefined ||
      (Array.isArray(value.waitBlockers) &&
        value.waitBlockers.every((b) => typeof b === "string")))
  );
}
export function validShift(value: unknown): value is Shift {
  if (
    !row(value) ||
    value.version !== 1 ||
    !finite(value.time) ||
    value.time < 0 ||
    !finite(value.score) ||
    !finite(value.conflicts) ||
    value.conflicts < 0 ||
    typeof value.paused !== "boolean" ||
    ![1, 2, 4].includes(value.speed as number) ||
    !finite(value.nextEventId)
  )
    return false;
  if (
    !collection(value.flights, 6) ||
    !collection(value.stands, 6) ||
    !collection(value.vehicles, 6) ||
    !collection(value.services, 18) ||
    !Array.isArray(value.events) ||
    value.events.length > 30
  )
    return false;
  if (
    !Array.isArray(value.closures) ||
    !value.closures.every((c) => typeof c === "string" && blockIdSet.has(c)) ||
    new Set(value.closures).size !== value.closures.length
  )
    return false;
  if (!row(value.wake)) return false;
  const wake = value.wake as Row;
  if (
    !Object.entries(wake).every(
      ([k, w]) =>
        blockIdSet.has(k) &&
        row(w) &&
        finite(w.time) &&
        w.time >= 0 &&
        ["narrow", "wide"].includes(w.size as string),
    )
  )
    return false;
  const flights = value.flights,
    stands = value.stands,
    vehicles = value.vehicles,
    services = value.services;
  const flightIds = new Set(flights.map((x) => x.id)),
    standIds = new Set(stands.map((x) => x.id)),
    vehicleIds = new Set(vehicles.map((x) => x.id)),
    serviceIds = new Set(services.map((x) => x.id));
  if (
    !flights.every(
      (f) =>
        text(f.airline) &&
        text(f.from) &&
        text(f.destination) &&
        text(f.aircraft) &&
        ["narrow", "wide"].includes(f.size as string) &&
        flightStates.includes(f.status as string) &&
        finite(f.arrival) &&
        finite(f.deadline) &&
        finite(f.passengers) &&
        f.passengers > 0 &&
        text(f.color) &&
        (f.departureAt === undefined || finite(f.departureAt)) &&
        (f.departedAt === undefined || finite(f.departedAt)) &&
        (f.standId === undefined || standIds.has(f.standId)) &&
        (f.move === undefined || validMove(f.move)),
    )
  )
    return false;
  // 移动状态只出现在滑行中的航班上
  if (
    !flights.every(
      (f) =>
        (f.move !== undefined) ===
        ["arriving", "departing"].includes(f.status as string),
    )
  )
    return false;
  if (
    !stands.every(
      (s) =>
        point(s) &&
        ["narrow", "wide"].includes(s.size as string) &&
        text(s.terminal),
    )
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        kinds.includes(v.kind as string) &&
        vehicleStates.includes(v.status as string) &&
        point(v.position) &&
        point(v.origin) &&
        point(v.target) &&
        finite(v.progress) &&
        v.progress >= 0 &&
        v.progress <= 100 &&
        finite(v.tripDuration) &&
        v.tripDuration > 0 &&
        (v.serviceId === undefined || serviceIds.has(v.serviceId)),
    )
  )
    return false;
  if (
    !services.every(
      (s) =>
        flightIds.has(s.flightId) &&
        kinds.includes(s.kind as string) &&
        serviceStates.includes(s.status as string) &&
        finite(s.progress) &&
        s.progress >= 0 &&
        s.progress <= 100 &&
        finite(s.duration) &&
        s.duration > 0 &&
        (s.vehicleId === undefined || vehicleIds.has(s.vehicleId)),
    )
  )
    return false;
  if (
    !flights.every((f) =>
      kinds.every(
        (k) =>
          services.filter((t) => t.flightId === f.id && t.kind === k).length ===
          1,
      ),
    )
  )
    return false;
  // 机位占用唯一：已分配未离港、且尚未滑出联络线的航班
  const occupied = flights
    .filter(
      (f) =>
        f.standId !== undefined &&
        f.status !== "departed" &&
        !(
          f.status === "departing" &&
          row(f.move) &&
          (f.move.index as number) >= 1
        ),
    )
    .map((f) => f.standId);
  if (new Set(occupied).size !== occupied.length) return false;
  if (
    !flights.every(
      (f) =>
        !["parked", "departing", "departed"].includes(f.status as string) ||
        f.standId === undefined ||
        (standIds.has(f.standId) &&
          (f.size === "narrow" ||
            stands.find((s) => s.id === f.standId)?.size === "wide")),
    )
  )
    return false;
  if (!flights.every((f) => f.status !== "parked" || standIds.has(f.standId)))
    return false;
  if (
    !services.every((s) => {
      if (s.status === "pending")
        return s.progress === 0 && s.vehicleId === undefined;
      const v = vehicles.find((x) => x.id === s.vehicleId);
      if (!v || v.kind !== s.kind) return false;
      if (s.status === "done") return s.progress === 100;
      return (
        v.serviceId === s.id &&
        v.status === s.status &&
        flights.find((f) => f.id === s.flightId)?.status === "parked"
      );
    })
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        !["travel", "working"].includes(v.status as string) ||
        services.some(
          (s) =>
            s.id === v.serviceId &&
            s.vehicleId === v.id &&
            s.status === v.status,
        ),
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        services.filter(
          (t) =>
            t.flightId === f.id &&
            ["travel", "working"].includes(t.status as string),
        ).length <= 2,
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        !["departing", "departed"].includes(f.status as string) ||
        services
          .filter((t) => t.flightId === f.id)
          .every((t) => t.status === "done"),
    )
  )
    return false;
  if (
    !value.events.every(
      (e) =>
        row(e) &&
        finite(e.id) &&
        finite(e.time) &&
        text(e.text) &&
        ["info", "success", "warning"].includes(e.tone as string),
    )
  )
    return false;
  const events = value.events as Row[];
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) => (e.id as number) >= (value.nextEventId as number))
  )
    return false;
  return (
    flightIds.has(value.selectedFlightId) &&
    (value.selectedStandId === undefined ||
      standIds.has(value.selectedStandId)) &&
    (value.selectedVehicleId === undefined ||
      vehicleIds.has(value.selectedVehicleId)) &&
    (value.selectedBlockId === undefined ||
      (typeof value.selectedBlockId === "string" &&
        blockIdSet.has(value.selectedBlockId)))
  );
}
