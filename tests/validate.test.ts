import { describe, expect, test } from "vitest";
import { validateForge } from "@/lib/validate";
import { SAMPLE_FORGE } from "@/lib/sample";
import { g } from "./helpers";

const S = { id: "S", kind: "start", label: "s", lateral: 0 };
const E = { id: "E", kind: "end", label: "e", lateral: 0 };

describe("validateForge — §7 quality bar", () => {
  test("sample is clean", () => expect(validateForge(structuredClone(SAMPLE_FORGE))).toEqual([]));
  test("dangling edges dropped and reported", () => {
    const f = g([S, E], [{ from: "S", to: "E" }, { from: "S", to: "ghost" }]);
    expect(validateForge(f)).toEqual(["1 edge(s) referenced missing nodes and were dropped."]);
    expect(f.edges).toHaveLength(1);
  });
  test("dead ends, gates with one or unlabelled exits", () => {
    const issues = validateForge(g([S, { id: "G", kind: "gate", label: "gate", lateral: 0 }, { id: "A", kind: "action", label: "act", lateral: 0 }], [{ from: "S", to: "G" }, { from: "G", to: "A" }]));
    expect(issues.join("\n")).toMatch(/Dead end: "act"/);
    expect(issues.join("\n")).toMatch(/fewer than 2 exits/);
    expect(issues.join("\n")).toMatch(/1 unlabelled exit/);
  });
  test("no START / two STARTs", () => {
    expect(validateForge(g([E], [])).join()).toMatch(/found 0/);
    expect(validateForge(g([S, { ...S, id: "S2" }, E], [{ from: "S", to: "E" }, { from: "S2", to: "E" }])).join()).toMatch(/found 2/);
  });
  test("unreachable nodes", () => {
    const issues = validateForge(g([S, E, { id: "X", kind: "action", label: "orphan", lateral: 1 }, { id: "E2", kind: "end", label: "e2", lateral: 1 }], [{ from: "S", to: "E" }, { from: "X", to: "E2" }]));
    expect(issues.join()).toMatch(/2 node\(s\) can't be reached from START: "orphan", "e2"/);
  });
  test("infinite loop with no exit", () => {
    const issues = validateForge(g([S, { id: "A", kind: "action", label: "a", lateral: 0 }, { id: "B", kind: "action", label: "b", lateral: 0 }, E], [{ from: "S", to: "A" }, { from: "A", to: "B" }, { from: "B", to: "A", kind: "loop" }]));
    expect(issues.join()).toMatch(/Infinite loop/);
  });
  test("loop has an exit but it's unlabelled", () => {
    const issues = validateForge(g([S, { id: "A", kind: "action", label: "a", lateral: 0 }, E], [{ from: "S", to: "A" }, { from: "A", to: "A", kind: "loop" }, { from: "A", to: "E" }]));
    expect(issues.join()).toMatch(/no labelled exit condition/);
  });
  test("one labelled loop no longer masks another unlabelled loop", () => {
    const nodes = [S, ...["A", "B", "C", "D"].map((id) => ({ id, kind: "action", label: id, lateral: 0 })), E];
    const edges = [
      { from: "S", to: "A" }, { from: "A", to: "B" }, { from: "B", to: "A", kind: "loop" }, { from: "B", to: "C", label: "done", loopExit: true },
      { from: "C", to: "D" }, { from: "D", to: "C", kind: "loop" }, { from: "D", to: "E" },
    ];
    const issues = validateForge(g(nodes, edges));
    expect(issues.filter((i) => /loop/i.test(i))).toEqual(['The loop through "C" has no labelled exit condition.']);
  });
  test("outcome with outgoing edges", () => {
    expect(validateForge(g([S, E, { ...E, id: "E2" }], [{ from: "S", to: "E" }, { from: "E", to: "E2" }])).join()).toMatch(/should be terminal/);
  });
  test("a 5,000-node chain doesn't overflow the stack", () => {
    const nodes = [S, ...Array.from({ length: 5000 }, (_, i) => ({ id: `n${i}`, kind: "action", label: `${i}`, lateral: 0 })), E];
    const edges = [{ from: "S", to: "n0" }, ...Array.from({ length: 4999 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })), { from: "n4999", to: "E" }, { from: "n4999", to: "n0", label: "again" }];
    expect(() => validateForge(g(nodes, edges))).not.toThrow();
  });
});
