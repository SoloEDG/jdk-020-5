import type { Shift } from "../../../shared/types";
import { initialFlights } from "../../flights";
import { initialStands } from "../../apron";
import { initialServices } from "../../services";
import { initialVehicles } from "../../fleet";
export function createShift(): Shift {
  const flights = initialFlights();
  return {
    version: 1,
    time: 0,
    paused: false,
    speed: 1,
    score: 0,
    conflicts: 0,
    flights,
    stands: initialStands(),
    services: initialServices(flights),
    vehicles: initialVehicles(),
    events: [
      { id: 0, time: 0, text: "早班开始 · 3 架航班进近，等待落地许可", tone: "info" },
    ],
    closures: [],
    wake: {},
    selectedFlightId: "MU2451",
    nextEventId: 1,
  };
}
