import { describe, expect, test } from "vitest";
import { normalizeForge } from "@/lib/normalize";
import { SAMPLE_FORGE } from "@/lib/sample";
import { report } from "./helpers";

const N = (nodes: unknown[], edges: unknown[] = [], extra = {}) => normalizeForge({ title: "t", parseReport: report, nodes, edges, ledger: [], ...extra });

describe("normalizeForge", () => {
  test("sample passes through unchanged in substance", () => {
    const { forge, repairs } = normalizeForge(structuredClone(SAMPLE_FORGE));
    expect(repairs).toEqual([]);
    expect(forge.nodes.map((n) => [n.id, n.kind, n.lateral])).toEqual(SAMPLE_FORGE.nodes.map((n) => [n.id, n.kind, n.lateral]));
    expect(forge.edges).toHaveLength(SAMPLE_FORGE.edges.length);
  });
  test("stringified nodes/edges arrays", () => {
    const { forge } = normalizeForge({ ...SAMPLE_FORGE, nodes: JSON.stringify(SAMPLE_FORGE.nodes), edges: JSON.stringify(SAMPLE_FORGE.edges) });
    expect(forge.nodes).toHaveLength(SAMPLE_FORGE.nodes.length);
  });
  test("kind aliases and unknown kinds", () => {
    const { forge, repairs } = N([
      { id: "a", kind: "Decision" }, { id: "b", kind: "terminal" }, { id: "c", kind: "PROCESS" }, { id: "d", kind: "wibble" }, { id: "START" }, { id: "END-3" },
    ]);
    expect(forge.nodes.map((n) => n.kind)).toEqual(["gate", "end", "action", "action", "start", "end"]);
    expect(repairs.join()).toMatch(/1 node\(s\) had an unknown kind/);
  });
  test("lateral coercion: strings, NaN, negatives, out of range, fractions", () => {
    const { forge } = N([{ id: "a", lateral: "2" }, { id: "b", lateral: "x" }, { id: "c", lateral: -3 }, { id: "d", lateral: 99 }, { id: "e", lateral: 1.6 }, { id: "f" }]);
    expect(forge.nodes.map((n) => n.lateral)).toEqual([2, 0, 0, 4, 2, 0]);
  });
  test("missing / non-string ids, labels and questions", () => {
    const { forge } = N([{ kind: "gate", question: "Ok?" }, { id: 7, label: 42 }, { id: "x", label: { bad: 1 } }]);
    expect(forge.nodes.map((n) => [n.id, n.label])).toEqual([["N1", "Ok?"], ["7", "42"], ["x", "x"]]);
  });
  test("duplicate ids are renamed, not merged", () => {
    const { forge, repairs } = N([{ id: "A" }, { id: "A" }, { id: "A" }]);
    expect(forge.nodes.map((n) => n.id)).toEqual(["A", "A~2", "A~3"]);
    expect(repairs.filter((r) => /Duplicate/.test(r))).toHaveLength(2);
  });
  test("edge endpoints resolve case- and punctuation-insensitively", () => {
    const { forge } = N([{ id: "START", kind: "start" }, { id: "End-1", kind: "end" }], [{ from: "start", to: "END_1" }, { source: "START", target: "end-1", condition: "alt" }]);
    expect(forge.edges.map((e) => [e.from, e.to])).toEqual([["START", "End-1"], ["START", "End-1"]]);
  });
  test("exact duplicate edges are removed", () => {
    const { forge, repairs } = N([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b", label: "x" }, { from: "a", to: "b", label: "x" }, { from: "a", to: "b", label: "y" }]);
    expect(forge.edges).toHaveLength(2);
    expect(repairs.join()).toMatch(/1 duplicate edge/);
  });
  test("bad enums fall back safely", () => {
    const { forge } = N([{ id: "a", outcome: "great" }], [{ from: "a", to: "a", kind: "weird" }], { mode: "nope", parseReport: { confidence: "HIGH", decisionCount: "3" } });
    expect(forge.mode).toBe("parsed");
    expect(forge.nodes[0].outcome).toBeUndefined();
    expect(forge.edges[0].kind).toBeUndefined();
    expect(forge.parseReport.confidence).toBe("high");
    expect(forge.parseReport.decisionCount).toBe(3);
  });
  test("parse report: actors as a string, flags with dangling node ids, missing counts derived", () => {
    const { forge } = N([{ id: "g", kind: "gate" }, { id: "s", kind: "action" }], [], {
      parseReport: { actors: "Finance, Legal (implied)", flags: [{ code: "a2", text: "x", nodeIds: ["G", "ghost"] }, "junk"] },
    });
    expect(forge.parseReport.actors).toEqual([{ name: "Finance", implied: false }, { name: "Legal", implied: true }]);
    expect(forge.parseReport.flags).toEqual([{ code: "A2", text: "x", nodeIds: ["g"] }]);
    expect([forge.parseReport.decisionCount, forge.parseReport.stepCount]).toEqual([1, 1]);
  });
  test("missing parseReport entirely", () => {
    const { forge } = normalizeForge({ nodes: [{ id: "a" }], edges: [] });
    expect(forge.parseReport.confidence).toBe("medium");
    expect(forge.title).toBe("Untitled decision");
    expect(forge.challenge).toBeNull();
  });
  test("ledger rows as strings, actors trimmed", () => {
    const { forge } = N([{ id: "a", actor: "  Finance " }], [], { ledger: ["Added X", { added: "Y", why: "Z" }, {}] });
    expect(forge.ledger).toEqual([{ added: "Added X", why: "" }, { added: "Y", why: "Z" }]);
    expect(forge.nodes[0].actor).toBe("Finance");
  });
  test("end node labelled 'undefined in source' gets the undefined outcome", () => {
    expect(N([{ id: "E", kind: "end", label: "⚠ undefined in source" }]).forge.nodes[0].outcome).toBe("undefined");
  });
  test("non-object input", () => {
    expect(() => normalizeForge(null)).toThrow();
    expect(() => normalizeForge([1, 2])).toThrow();
  });
});
