export type ServiceKind = "baggage" | "fuel" | "clean";
export type FlightStatus =
  | "scheduled"
  | "approach"
  | "arriving"
  | "parked"
  | "departing"
  | "departed";
export interface Point {
  x: number;
  y: number;
}
export type ClearanceMode = "full" | "segment";
export interface RouteLeg {
  block: string;
  rev: boolean;
}
export interface MoveState {
  route: RouteLeg[];
  index: number;
  dist: number;
  mode: ClearanceMode;
  clearedThrough: number;
  holding: boolean;
  entered: boolean;
  waitReason?: string;
  waitBlockers?: string[];
}
export interface Flight {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  arrival: number;
  deadline: number;
  passengers: number;
  status: FlightStatus;
  standId?: string;
  departureAt?: number;
  departedAt?: number;
  move?: MoveState;
  color: string;
}
export interface Stand extends Point {
  id: string;
  size: "narrow" | "wide";
  terminal: string;
}
export interface Service {
  id: string;
  flightId: string;
  kind: ServiceKind;
  status: "pending" | "travel" | "working" | "done";
  progress: number;
  duration: number;
  vehicleId?: string;
}
export interface Vehicle {
  id: string;
  kind: ServiceKind;
  status: "idle" | "travel" | "working" | "returning";
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  serviceId?: string;
}
export interface Event {
  id: number;
  time: number;
  text: string;
  tone: "info" | "success" | "warning";
}
export interface WakeMark {
  time: number;
  size: "narrow" | "wide";
}
export interface Shift {
  version: 1;
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  score: number;
  conflicts: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  events: Event[];
  closures: string[];
  wake: Record<string, WakeMark>;
  selectedFlightId: string;
  selectedStandId?: string;
  selectedVehicleId?: string;
  selectedBlockId?: string;
  nextEventId: number;
}
export type CommandResult = (state: Shift) => Shift;
