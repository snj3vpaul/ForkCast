import type { Forge } from "./types";

/**
 * §7 Quality Bar, enforced in code. Returns human-readable audit issues
 * (shown under the chart) and repairs only what is unsafe to render
 * (edges pointing at nodes that do not exist).
 */
export function validateForge(f: Forge): string[] {
  const issues: string[] = [];
  f.nodes ??= [];
  f.edges ??= [];
  f.ledger ??= [];
  const ids = new Set(f.nodes.map((n) => n.id));

  const before = f.edges.length;
  f.edges = f.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  if (f.edges.length < before) issues.push(`${before - f.edges.length} edge(s) referenced missing nodes and were dropped.`);

  const starts = f.nodes.filter((n) => n.kind === "start");
  if (starts.length !== 1) issues.push(`Expected exactly one START, found ${starts.length}.`);

  const out = new Map<string, typeof f.edges>();
  for (const e of f.edges) out.set(e.from, [...(out.get(e.from) ?? []), e]);

  for (const n of f.nodes) {
    const exits = out.get(n.id) ?? [];
    if (n.kind !== "end" && exits.length === 0) issues.push(`Dead end: "${n.label}" has no outgoing edge.`);
    if (n.kind === "gate") {
      if (exits.length < 2) issues.push(`Gate "${n.label}" has fewer than 2 exits.`);
      const unlabelled = exits.filter((e) => !e.label?.trim()).length;
      if (unlabelled) issues.push(`Gate "${n.label}" has ${unlabelled} unlabelled exit(s).`);
    }
  }

  const loops = f.edges.filter((e) => e.kind === "loop");
  if (loops.length && !f.edges.some((e) => e.loopExit)) issues.push("A loop exists with no labelled exit condition.");

  return issues;
}
