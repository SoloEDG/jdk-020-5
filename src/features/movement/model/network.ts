import type { Flight, Point, RouteLeg, Shift } from "../../../shared/types";

export type BlockKind = "runway" | "link" | "taxiway" | "connector";
export interface BlockDef {
  id: string;
  kind: BlockKind;
  label: string;
  path: [Point, Point];
  length: number;
  speed: number;
  nodes: [string, string];
  oneWay: boolean;
}
export const NODE_ZONE = 18;

function def(
  id: string,
  kind: BlockKind,
  label: string,
  a: Point,
  b: Point,
  speed: number,
  nodes: [string, string],
  oneWay = false,
): BlockDef {
  return {
    id,
    kind,
    label,
    path: [a, b],
    length: Math.hypot(b.x - a.x, b.y - a.y),
    speed,
    nodes,
    oneWay,
  };
}

export const nodes: Record<string, Point> = {
  W: { x: 75, y: 355 },
  N1: { x: 220, y: 355 },
  N2: { x: 420, y: 355 },
  N3: { x: 650, y: 355 },
  E: { x: 740, y: 355 },
  RW: { x: 75, y: 606 },
  RE: { x: 740, y: 606 },
  ST_A01: { x: 220, y: 250 },
  ST_A02: { x: 420, y: 250 },
  ST_A03: { x: 650, y: 250 },
  ST_B01: { x: 220, y: 495 },
  ST_B02: { x: 420, y: 495 },
  ST_B03: { x: 650, y: 495 },
};

const b = (
  id: string,
  kind: BlockKind,
  label: string,
  from: string,
  to: string,
  speed: number,
  oneWay = false,
) => def(id, kind, label, nodes[from], nodes[to], speed, [from, to], oneWay);

export const blocks: Record<string, BlockDef> = Object.fromEntries(
  [
    b("RWY", "runway", "跑道 24", "RE", "RW", 26),
    b("TW", "link", "联络道 W", "RW", "W", 11, true),
    b("TE", "link", "联络道 E", "E", "RE", 11, true),
    b("A0", "taxiway", "A0 段", "W", "N1", 11),
    b("A1", "taxiway", "A1 段", "N1", "N2", 11),
    b("A2", "taxiway", "A2 段", "N2", "N3", 11),
    b("A3", "taxiway", "A3 段", "N3", "E", 11),
    b("C_A01", "connector", "联络线 A01", "N1", "ST_A01", 5),
    b("C_A02", "connector", "联络线 A02", "N2", "ST_A02", 5),
    b("C_A03", "connector", "联络线 A03", "N3", "ST_A03", 5),
    b("C_B01", "connector", "联络线 B01", "N1", "ST_B01", 5),
    b("C_B02", "connector", "联络线 B02", "N2", "ST_B02", 5),
    b("C_B03", "connector", "联络线 B03", "N3", "ST_B03", 5),
  ].map((x) => [x.id, x]),
);

export const blockIds = Object.keys(blocks);

const ARRIVAL_ROUTES: Record<string, string[]> = {
  A01: ["RWY", "TW", "A0", "C_A01"],
  A02: ["RWY", "TW", "A0", "A1", "C_A02"],
  A03: ["RWY", "TW", "A0", "A1", "A2", "C_A03"],
  B01: ["RWY", "TW", "A0", "C_B01"],
  B02: ["RWY", "TW", "A0", "A1", "C_B02"],
  B03: ["RWY", "TW", "A0", "A1", "A2", "C_B03"],
};
const DEPARTURE_ROUTES: Record<string, string[]> = {
  A01: ["C_A01", "A1", "A2", "A3", "TE", "RWY"],
  A02: ["C_A02", "A2", "A3", "TE", "RWY"],
  A03: ["C_A03", "A3", "TE", "RWY"],
  B01: ["C_B01", "A1", "A2", "A3", "TE", "RWY"],
  B02: ["C_B02", "A2", "A3", "TE", "RWY"],
  B03: ["C_B03", "A3", "TE", "RWY"],
};

export function arrivalRoute(standId: string): RouteLeg[] {
  return (ARRIVAL_ROUTES[standId] ?? []).map((block) => ({ block, rev: false }));
}
export function departureRoute(standId: string): RouteLeg[] {
  return (DEPARTURE_ROUTES[standId] ?? []).map((block, i) => ({
    block,
    rev: i === 0,
  }));
}

export function geoStart(leg: RouteLeg): string {
  const blk = blocks[leg.block];
  return leg.rev ? blk.nodes[1] : blk.nodes[0];
}
export function geoEnd(leg: RouteLeg): string {
  const blk = blocks[leg.block];
  return leg.rev ? blk.nodes[0] : blk.nodes[1];
}

export function legPose(leg: RouteLeg, dist: number): { p: Point; heading: number } {
  const blk = blocks[leg.block];
  const t = Math.min(1, Math.max(0, dist / blk.length));
  const [a, z] = leg.rev ? [blk.path[1], blk.path[0]] : blk.path;
  return {
    p: { x: a.x + (z.x - a.x) * t, y: a.y + (z.y - a.y) * t },
    heading: (Math.atan2(z.y - a.y, z.x - a.x) * 180) / Math.PI,
  };
}

export function occupiedNodes(f: Flight): string[] {
  const mv = f.move;
  if (!mv || !mv.entered) return [];
  const leg = mv.route[mv.index];
  const blk = blocks[leg.block];
  const out: string[] = [];
  if (mv.dist < NODE_ZONE) out.push(geoStart(leg));
  if (mv.dist > blk.length - NODE_ZONE) out.push(geoEnd(leg));
  return out;
}

export function blockOfFlight(f: Flight): string | undefined {
  return f.move && f.move.entered ? f.move.route[f.move.index].block : undefined;
}

export function blockReservedBy(f: Flight, blockId: string): boolean {
  const mv = f.move;
  if (!mv) return false;
  for (let i = mv.index; i <= mv.clearedThrough && i < mv.route.length; i++)
    if (mv.route[i].block === blockId) return true;
  return false;
}

export function wakeSep(
  prev: "narrow" | "wide",
  next: "narrow" | "wide",
  kind: BlockKind,
): number {
  const runway = kind === "runway";
  if (prev === "wide" && next === "narrow") return runway ? 24 : 10;
  if (prev === "wide" && next === "wide") return runway ? 15 : 8;
  return runway ? 8 : 4;
}

export function wakeLeft(
  state: Shift,
  blockId: string,
  size: "narrow" | "wide",
): number {
  const w = state.wake[blockId];
  if (!w) return 0;
  return Math.max(0, w.time + wakeSep(w.size, size, blocks[blockId].kind) - state.time);
}
