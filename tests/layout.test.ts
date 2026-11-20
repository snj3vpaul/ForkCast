import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { layout, reachable, wrap } from "@/lib/layout";
import { normalizeForge } from "@/lib/normalize";
import { validateForge } from "@/lib/validate";
import { toMermaid } from "@/lib/mermaid";
import { Diagram } from "@/components/Diagram";
import { SAMPLE_FORGE } from "@/lib/sample";
import type { Forge } from "@/lib/types";
import { g, rng } from "./helpers";

const finite = (n: number) => Number.isFinite(n);

function assertSane(f: Forge, lanes = false) {
  const L = layout(f, lanes);
  expect(finite(L.width) && finite(L.height) && L.width > 0 && L.height > 0).toBe(true);
  for (const n of L.nodes) expect([n.x, n.y, n.w, n.h].every(finite), `node ${n.id} coords`).toBe(true);
  for (const e of L.edges) {
    expect(e.points.length).toBeGreaterThanOrEqual(2);
    expect(e.points.flat().every(finite), `edge ${e.from}->${e.to}`).toBe(true);
    if (!e.back) expect(L.byId.get(e.to)!.rank, `forward edge ${e.from}->${e.to} must go down`).toBeGreaterThan(L.byId.get(e.from)!.rank);
  }
  // node boxes never overlap
  for (let i = 0; i < L.nodes.length; i++)
    for (let j = i + 1; j < L.nodes.length; j++) {
      const a = L.nodes[i], b = L.nodes[j];
      const overlap = Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  for (const t of L.ticks) expect(finite(t.y)).toBe(true);
  expect([L.rail.x, L.rail.y1, L.rail.y2].every(finite)).toBe(true);
  return L;
}

describe("layout", () => {
  test("sample: spine, lanes, Judgment Line", () => {
    const L = assertSane(SAMPLE_FORGE);
    expect(L.lanes.map((l) => l.name)).toEqual(["Procurement", "Finance", "CTO"]);
    expect(L.rail.gates).toBe(2); // G1 and G2 sit on the happy path; G3 is lateral
    const spine = ["START", "PULL", "G1", "QUOTE", "G2", "APPROVE", "SIGN", "END-1"].map((id) => L.byId.get(id)!);
    expect(spine.every((n) => n.col === 0)).toBe(true);
    expect(L.edges.filter((e) => e.back).map((e) => `${e.from}->${e.to}`)).toEqual(["G3->NEG"]);
    expect(L.edges.some((e) => e.handoff)).toBe(true);
  });
  test("single node", () => assertSane(g([{ id: "S", kind: "start", label: "only", lateral: 0 }], [])));
  test("no START: root falls back to the first node nothing points at", () => {
    const L = assertSane(g([{ id: "B", kind: "end", label: "b", lateral: 0 }, { id: "A", kind: "action", label: "a", lateral: 0 }], [{ from: "A", to: "B" }]));
    expect(L.byId.get("A")!.rank).toBe(0);
  });
  test("self-loop renders as a visible hook, not a flat line", () => {
    const L = assertSane(g([{ id: "S", kind: "start", label: "s", lateral: 0 }, { id: "A", kind: "action", label: "retry", lateral: 0 }, { id: "E", kind: "end", label: "e", lateral: 0 }], [{ from: "S", to: "A" }, { from: "A", to: "A", kind: "loop", label: "again" }, { from: "A", to: "E", label: "done" }]));
    const self = L.edges.find((e) => e.from === "A" && e.to === "A")!;
    expect(self.back).toBe(true);
    expect(new Set(self.points.map((p) => p[1])).size).toBeGreaterThan(1);
  });
  test("many nodes at the same rank and lateral are bumped apart", () => {
    const kids = Array.from({ length: 8 }, (_, i) => ({ id: `E${i}`, kind: "end", label: `outcome ${i}`, lateral: 1 }));
    assertSane(g([{ id: "S", kind: "start", label: "s", lateral: 0 }, { id: "G", kind: "gate", label: "g", question: "which?", lateral: 0 }, ...kids], [{ from: "S", to: "G" }, ...kids.map((k) => ({ from: "G", to: k.id, label: k.label }))]));
  });
  test("forced swimlanes with a single actor; nodes with no actor among actors", () => {
    assertSane(g([{ id: "S", kind: "start", label: "s", lateral: 0, actor: "Ops" }, { id: "E", kind: "end", label: "e", lateral: 0 }], [{ from: "S", to: "E" }]), true);
  });
  test("wrap never returns an empty array and keeps long words whole", () => {
    expect(wrap("", 10)).toEqual([""]);
    expect(wrap("supercalifragilistic a", 5)).toEqual(["supercalifragilistic", "a"]);
  });
  test("reachable follows loops without hanging", () => {
    expect([...reachable(SAMPLE_FORGE, "G2")].sort()).toEqual(["APPROVE", "END-1", "G2", "G3", "NEG", "SIGN", "U1", "END-2"].sort());
  });
});

describe("fuzz: random model output never crashes ingestion, layout, mermaid or render", () => {
  const kinds = ["start", "action", "gate", "commit", "split", "join", "contradiction", "unstated", "end", "decision", "???", undefined];
  const actors = [undefined, "Ops", "Finance", " Finance ", "Legal", ""];
  test.each(Array.from({ length: 300 }, (_, i) => i))("seed %i", (seed) => {
    const r = rng(seed + 1);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const n = 1 + Math.floor(r() * 30);
    const nodes = Array.from({ length: n }, (_, i) => ({
      id: r() < 0.05 ? "dup" : r() < 0.03 ? undefined : i === 0 ? "START" : `N-${i}`,
      kind: i === 0 ? "start" : pick(kinds),
      label: r() < 0.1 ? undefined : "word ".repeat(Math.floor(r() * 12)) + i,
      question: r() < 0.3 ? "Is it the case that " + "x ".repeat(Math.floor(r() * 20)) + "?" : undefined,
      lateral: pick([0, 0, 0, 1, 2, 3, 4, -1, 9, "2", "x", 1.5, null]),
      actor: pick(actors),
      outcome: pick(["positive", "negative", "undefined", "neutral", "bogus", undefined]),
      phase: pick([undefined, "p1", "p2"]),
    }));
    const m = Math.floor(r() * n * 2);
    const edges = Array.from({ length: m }, () => ({
      from: r() < 0.03 ? "ghost" : pick(nodes).id ?? "N1",
      to: pick(nodes).id ?? "N2",
      label: r() < 0.5 ? pick(["yes", "no", "a|b", 'say "hi"', "line\nbreak", "`code`"]) : undefined,
      kind: pick([undefined, "loop", "unstated", "exception", "parallel", "nonsense"]),
      loopExit: r() < 0.2,
      maxIterations: r() < 0.1 ? 3 : undefined,
    }));
    const { forge } = normalizeForge({
      title: "Fuzz " + seed, nodes, edges, ledger: [],
      phases: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }],
      parseReport: { actors: ["Ops", "Finance"], flags: [{ code: "A2", text: "x", nodeIds: [pick(nodes).id] }] },
    });
    validateForge(forge);
    assertSane(forge, r() < 0.3);
    const mm = toMermaid(forge);
    expect(mm).not.toMatch(/\|"[^"\n]*\|[^"\n]*"\|/); // no raw pipe inside an edge label
    for (const line of mm.split("\n")) expect((line.match(/"/g) ?? []).length % 2, line).toBe(0);
    const html = renderToStaticMarkup(createElement(Diagram, { forge, forceLanes: false, annotate: true, zoom: 1 }));
    expect(html).not.toMatch(/NaN|undefined/);
  });
});
