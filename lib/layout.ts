import type { Forge, FlowEdge, FlowNode } from "./types";

/* ───────────── Ink & Signal layout engine ─────────────
 * Vertical spine, lateral consequence: rank = longest forward path from START,
 * column = node.lateral (distance from normal). Back-edges become loops routed
 * through a right-hand channel. ≥ 2 actors → left-to-right swimlanes.        */

export const COL_W = 330;
const GUTTER = 300; // Judgment Line rail + gate question tags on the spine
const LANE_PAD_L = 250;
const LANE_PAD_R = 150;
const TOP = 120;
const ROW_GAP = 70;
const LABEL_CHARS = 26;

export interface PNode extends FlowNode {
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
  col: number;
  lines: string[];
  qLines: string[];
  lane: number;
}

export interface PEdge extends FlowEdge {
  idx: number;
  points: [number, number][];
  labelAt: [number, number];
  back: boolean;
  handoff?: [number, number];
  dashed: boolean;
}

export interface Lane {
  name: string;
  x: number;
  w: number;
}

export interface Tick {
  y: number;
  n: number;
  onPath: boolean;
  id: string;
}

export interface Layout {
  nodes: PNode[];
  edges: PEdge[];
  lanes: Lane[];
  ticks: Tick[];
  rail: { x: number; y1: number; y2: number; gates: number };
  phases: { name: string; y1: number; y2: number }[];
  width: number;
  height: number;
  byId: Map<string, PNode>;
}

export function wrap(text: string, max: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function size(n: FlowNode): { w: number; h: number; lines: string[]; qLines: string[] } {
  const qLines = n.question ? wrap(n.question, 24) : [];
  switch (n.kind) {
    case "gate":
    case "contradiction":
      return { w: 44, h: 44, lines: wrap(n.label, 22), qLines };
    case "split":
    case "join":
      return { w: 150, h: 8, lines: [n.label], qLines };
    case "start":
    case "end": {
      const lines = wrap(n.label, 28);
      const longest = Math.max(...lines.map((l) => l.length));
      return { w: Math.max(150, longest * 7.4 + 44), h: 20 + lines.length * 16, lines, qLines };
    }
    default: {
      const lines = wrap(n.label, LABEL_CHARS);
      return { w: 236, h: 26 + lines.length * 16 + (n.kind === "commit" ? 6 : 0), lines, qLines };
    }
  }
}

export function layout(f: Forge, forceLanes = false): Layout {
  const nodes = f.nodes;
  const byIdRaw = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, FlowEdge[]>();
  for (const e of f.edges) out.set(e.from, [...(out.get(e.from) ?? []), e]);

  // 1. Back-edge detection (DFS from START, then any unvisited node)
  const back = new Set<FlowEdge>();
  const state = new Map<string, 1 | 2>();
  const start = nodes.find((n) => n.kind === "start") ?? nodes[0];
  const roots = [start, ...nodes.filter((n) => n !== start)];
  for (const root of roots) {
    if (!root || state.has(root.id)) continue;
    const stack: { id: string; i: number }[] = [{ id: root.id, i: 0 }];
    state.set(root.id, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const edges = out.get(top.id) ?? [];
      if (top.i >= edges.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      // visit spine/forward-looking edges first so loops are the true back-edges
      const e = edges[top.i++];
      const s = state.get(e.to);
      if (s === 1) back.add(e);
      else if (!s) {
        state.set(e.to, 1);
        stack.push({ id: e.to, i: 0 });
      }
    }
  }

  // 2. Rank = longest path on forward edges (Kahn)
  const fwd = f.edges.filter((e) => !back.has(e));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of fwd) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of fwd.filter((x) => x.from === id)) {
      rank.set(e.to, Math.max(rank.get(e.to)!, rank.get(id)! + 1));
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  for (const n of nodes) if (!order.includes(n.id)) order.push(n.id);

  // 3. Lanes
  const actorOrder: string[] = [];
  const used = new Set(nodes.map((n) => n.actor?.trim()).filter(Boolean));
  const spineActors = order.map((id) => byIdRaw.get(id)!).filter((n) => (n.lateral ?? 0) === 0).map((n) => n.actor?.trim());
  for (const a of [...spineActors, ...(f.parseReport?.actors ?? []).map((x) => x.name.trim())])
    if (a && used.has(a) && !actorOrder.includes(a)) actorOrder.push(a);
  for (const id of order) {
    const a = byIdRaw.get(id)?.actor?.trim();
    if (a && !actorOrder.includes(a)) actorOrder.push(a);
  }
  const useLanes = actorOrder.length >= 2 || (forceLanes && actorOrder.length >= 1);
  const laneOf = (n: FlowNode) => (useLanes ? Math.max(0, actorOrder.indexOf(n.actor?.trim() ?? "")) : 0);

  // 4. Columns with collision bumping
  const occupied = new Set<string>();
  const col = new Map<string, number>();
  const sorted = [...nodes].sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || (a.lateral ?? 0) - (b.lateral ?? 0));
  const dense = new Map<number, number[]>();
  for (const n of nodes) {
    const ln = laneOf(n);
    const v = Math.round(n.lateral ?? 0);
    const arr = dense.get(ln) ?? [];
    if (!arr.includes(v)) arr.push(v);
    dense.set(ln, arr.sort((a, b) => a - b));
  }
  for (const n of sorted) {
    const raw = Math.round(n.lateral ?? 0);
    let c = Math.max(0, Math.min(6, useLanes ? dense.get(laneOf(n))!.indexOf(raw) : raw));
    const r = rank.get(n.id)!;
    const ln = laneOf(n);
    while (occupied.has(`${ln}:${r}:${c}`)) c++;
    occupied.add(`${ln}:${r}:${c}`);
    col.set(n.id, c);
  }

  // 5. Lane geometry
  const laneCount = useLanes ? actorOrder.length : 1;
  const maxCol = Array.from({ length: laneCount }, () => 0);
  for (const n of nodes) maxCol[laneOf(n)] = Math.max(maxCol[laneOf(n)], col.get(n.id)!);
  const lanes: Lane[] = [];
  let lx = useLanes ? 90 : GUTTER - LANE_PAD_L;
  for (let i = 0; i < laneCount; i++) {
    const w = LANE_PAD_L + maxCol[i] * COL_W + LANE_PAD_R;
    lanes.push({ name: useLanes ? actorOrder[i] : "", x: lx, w });
    lx += w;
  }

  // 6. Row heights
  const maxRank = Math.max(0, ...rank.values());
  const rowH = Array.from({ length: maxRank + 1 }, () => 40);
  const sized = new Map(nodes.map((n) => [n.id, size(n)]));
  for (const n of nodes) {
    const s = sized.get(n.id)!;
    const extra = n.kind === "gate" || n.kind === "contradiction" ? Math.max(0, s.qLines.length * 15 + 14 - s.h) : 0;
    rowH[rank.get(n.id)!] = Math.max(rowH[rank.get(n.id)!], s.h + extra);
  }
  const rowY: number[] = [];
  let y = TOP + (useLanes ? 40 : 0);
  for (let r = 0; r <= maxRank; r++) {
    rowY[r] = y + rowH[r] / 2;
    y += rowH[r] + ROW_GAP;
  }

  const pnodes: PNode[] = nodes.map((n) => {
    const s = sized.get(n.id)!;
    const lane = laneOf(n);
    const c = col.get(n.id)!;
    return {
      ...n,
      ...s,
      rank: rank.get(n.id)!,
      col: c,
      lane,
      x: lanes[lane].x + LANE_PAD_L + c * COL_W,
      y: rowY[rank.get(n.id)!],
    };
  });
  const byId = new Map(pnodes.map((n) => [n.id, n]));

  // 7. Edge routing
  const isDiamond = (n: PNode) => n.kind === "gate" || n.kind === "contradiction";
  const bottom = (n: PNode) => n.y + n.h / 2;
  const topOf = (n: PNode) => n.y - n.h / 2;
  // y offset (from a row's centre) that lands in the empty gap beneath that row
  const rowGapBelow = (r: number) => rowH[r] / 2 + ROW_GAP / 2;
  let rightmost = Math.max(...pnodes.map((n) => n.x + n.w / 2));
  let loopIdx = 0;
  // A gate's nearest rightward exit owns the side vertex; further ones leave from the bottom vertex.
  const sideOwner = new Map<string, FlowEdge>();
  const extraIdx = new Map<FlowEdge, number>();
  for (const n of pnodes) {
    if (!isDiamond(n)) continue;
    const right = f.edges
      .filter((e) => e.from === n.id && !back.has(e) && byId.get(e.to)!.x > n.x)
      .sort((p, q) => byId.get(p.to)!.x - byId.get(q.to)!.x || byId.get(p.to)!.rank - byId.get(q.to)!.rank);
    if (right[0]) sideOwner.set(n.id, right[0]);
    right.slice(1).forEach((e, i) => extraIdx.set(e, i));
  }
  const pedges: PEdge[] = f.edges.map((e, idx) => {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const isBack = back.has(e);
    let pts: [number, number][];
    let labelAt: [number, number];

    if (isBack) {
      const lo = Math.min(a.rank, b.rank);
      const hi = Math.max(a.rank, b.rank);
      const span = pnodes.filter((n) => n.rank >= lo && n.rank <= hi);
      const cx = Math.max(...span.map((n) => n.x + n.w / 2 + (isDiamond(n) ? 60 : 0))) + 46 + loopIdx++ * 18;
      rightmost = Math.max(rightmost, cx);
      pts = [
        [a.x + a.w / 2, a.y],
        [cx, a.y],
        [cx, b.y],
        [b.x + b.w / 2 + 2, b.y],
      ];
      labelAt = [cx, (a.y + b.y) / 2];
    } else if (Math.abs(a.x - b.x) < 1) {
      pts = [
        [a.x, bottom(a)],
        [b.x, topOf(b) - 2],
      ];
      labelAt = [a.x, (bottom(a) + topOf(b)) / 2];
    } else if (isDiamond(a) && b.x > a.x && extraIdx.has(e)) {
      const ym = a.y + rowGapBelow(a.rank) + extraIdx.get(e)! * 12;
      pts = [
        [a.x, a.y + a.h / 2],
        [a.x, ym],
        [b.x, ym],
        [b.x, topOf(b) - 2],
      ];
      labelAt = [(a.x + b.x) / 2, ym];
    } else if (isDiamond(a) && b.x > a.x && b.rank - a.rank > 1) {
      const sx = a.x + a.w / 2 + 34;
      const ym = a.y + rowGapBelow(a.rank);
      pts = [
        [a.x + a.w / 2, a.y],
        [sx, a.y],
        [sx, ym],
        [b.x, ym],
        [b.x, topOf(b) - 2],
      ];
      labelAt = [(sx + b.x) / 2, ym];
    } else if (isDiamond(a) && b.x > a.x) {
      pts = [
        [a.x + a.w / 2, a.y],
        [b.x, a.y],
        [b.x, topOf(b) - 2],
      ];
      labelAt = [(a.x + a.w / 2 + b.x) / 2, a.y];
    } else if (b.x > a.x) {
      const ym = bottom(a) + 24;
      pts = [
        [a.x, bottom(a)],
        [a.x, ym],
        [b.x, ym],
        [b.x, topOf(b) - 2],
      ];
      labelAt = [(a.x + b.x) / 2, ym];
    } else {
      const ym = topOf(b) - 26;
      pts = [
        [a.x, bottom(a)],
        [a.x, ym],
        [b.x, ym],
        [b.x, topOf(b) - 2],
      ];
      labelAt = [(a.x + b.x) / 2, ym];
    }

    let handoff: [number, number] | undefined;
    if (useLanes && a.lane !== b.lane) {
      const seam = a.lane < b.lane ? lanes[a.lane].x + lanes[a.lane].w : lanes[a.lane].x;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        if (y1 === y2 && (x1 - seam) * (x2 - seam) <= 0) handoff = [seam, y1];
      }
    }

    const dashed = e.kind === "unstated" || b.kind === "unstated" || (b.kind === "end" && b.outcome === "undefined");
    return { ...e, idx, points: pts, labelAt, back: isBack, handoff, dashed };
  });

  // 8. Judgment Line: follow the spine from START to its outcome
  const pathIds: string[] = [];
  const seen = new Set<string>();
  let cur: PNode | undefined = byId.get(start?.id ?? "");
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    pathIds.push(cur.id);
    const nexts = pedges
      .filter((e) => e.from === cur!.id && !e.back)
      .map((e) => byId.get(e.to)!)
      .sort((p, q) => p.col - q.col || (p.outcome === "positive" ? -1 : 1));
    cur = nexts[0];
  }
  const gates = pnodes.filter((n) => isDiamond(n)).sort((a, b) => a.y - b.y);
  let k = 0;
  const ticks: Tick[] = gates.map((g) => {
    const onPath = pathIds.includes(g.id);
    return { y: g.y, n: onPath ? ++k : 0, onPath, id: g.id };
  });
  const pathNodes = pathIds.map((id) => byId.get(id)!);
  const rail = {
    x: useLanes ? 46 : 54,
    y1: pathNodes[0]?.y ?? TOP,
    y2: pathNodes[pathNodes.length - 1]?.y ?? TOP,
    gates: k,
  };

  // 9. Phase brackets
  const phases = (f.phases ?? [])
    .map((p) => {
      const ys = pnodes.filter((n) => n.phase === p.id || n.phase === p.name).map((n) => n.y);
      return ys.length ? { name: p.name, y1: Math.min(...ys) - 40, y2: Math.max(...ys) + 40 } : null;
    })
    .filter(Boolean) as Layout["phases"];

  const width = Math.max(lanes[lanes.length - 1].x + lanes[lanes.length - 1].w, rightmost + 120);
  return { nodes: pnodes, edges: pedges, lanes, ticks, rail, phases, width, height: y + 40, byId };
}

/** Every node reachable downstream of `id` (used for click-to-highlight). */
export function reachable(f: Forge, id: string): Set<string> {
  const seen = new Set([id]);
  const q = [id];
  while (q.length) {
    const cur = q.shift()!;
    for (const e of f.edges) if (e.from === cur && !seen.has(e.to)) (seen.add(e.to), q.push(e.to));
  }
  return seen;
}
