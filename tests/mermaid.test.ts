import { describe, expect, test } from "vitest";
import { toMermaid } from "@/lib/mermaid";
import { SAMPLE_FORGE } from "@/lib/sample";
import { g } from "./helpers";

describe("toMermaid", () => {
  test("sample: lanes become subgraphs, every node declared once, every edge emitted", () => {
    const m = toMermaid(SAMPLE_FORGE);
    expect(m.match(/^\s+subgraph /gm)).toHaveLength(3);
    for (const n of SAMPLE_FORGE.nodes) expect(m.match(new RegExp(`^\\s+n_${n.id.replace(/-/g, "_")}[\\[\\(\\{]`, "gm")), n.id).toHaveLength(1);
    expect(m.match(/^\s+n_\S+ (-->|-\.->|==>)/gm)).toHaveLength(SAMPLE_FORGE.edges.length);
    expect(m).toMatch(/==>\|"neither yet · max until day 30"\|/);
  });
  test("ids that sanitize to the same string stay distinct", () => {
    const m = toMermaid(g([{ id: "END-1", kind: "end", label: "a", lateral: 0 }, { id: "END_1", kind: "end", label: "b", lateral: 0 }, { id: "é", kind: "action", label: "c", lateral: 0 }, { id: "è", kind: "action", label: "d", lateral: 0 }], []));
    expect(new Set(m.match(/^\s+(n_\w+)(?=[\[\(\{])/gm)!.map((s) => s.trim())).size).toBe(4);
  });
  test("subgraph ids never collide with node ids", () => {
    const m = toMermaid(g([{ id: "Finance", kind: "start", label: "s", lateral: 0, actor: "Finance" }, { id: "Ops", kind: "end", label: "e", lateral: 0, actor: "Ops" }], [{ from: "Finance", to: "Ops" }]));
    const subs = [...m.matchAll(/subgraph (\S+)\[/g)].map((x) => x[1]);
    const nodes = [...m.matchAll(/^\s+(n_\w+)[\[\(\{]/gm)].map((x) => x[1]);
    expect(subs.filter((s) => nodes.includes(s))).toEqual([]);
  });
  test("labels with newlines, quotes, pipes, backticks and angle brackets", () => {
    const m = toMermaid(g([{ id: "A", kind: "action", label: 'line one\nline "two" <b>|`x`', lateral: 0 }, { id: "B", kind: "end", label: "b", lateral: 0 }], [{ from: "A", to: "B", label: "a|b\nc" }]));
    expect(m).toContain(`["line one line 'two' b/'x'"]`);
    expect(m).toContain(`-->|"a/b c"|`);
  });
});
