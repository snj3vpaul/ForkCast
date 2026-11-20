import type { FlowEdge, Forge } from "./types";

/** The node the chart starts from: the START node, else the first node nothing points at, else the first node. */
export function rootOf(f: Forge) {
  const targets = new Set(f.edges.map((e) => e.to));
  return f.nodes.find((n) => n.kind === "start") ?? f.nodes.find((n) => !targets.has(n.id)) ?? f.nodes[0];
}

/** Tarjan SCC — every component with >1 node, or a self-loop, is a loop. */
function loops(f: Forge): string[][] {
  const out = new Map<string, string[]>();
  for (const e of f.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];
  let i = 0;
  for (const root of f.nodes) {
    if (index.has(root.id)) continue;
    // iterative Tarjan so long chains can't blow the call stack
    const work: { id: string; k: number }[] = [{ id: root.id, k: 0 }];
    index.set(root.id, i);
    low.set(root.id, i++);
    stack.push(root.id);
    onStack.add(root.id);
    while (work.length) {
      const top = work[work.length - 1];
      const next = out.get(top.id) ?? [];
      if (top.k < next.length) {
        const w = next[top.k++];
        if (!index.has(w)) {
          index.set(w, i);
          low.set(w, i++);
          stack.push(w);
          onStack.add(w);
          work.push({ id: w, k: 0 });
        } else if (onStack.has(w)) low.set(top.id, Math.min(low.get(top.id)!, index.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(top.id)!));
      }
      if (low.get(top.id) === index.get(top.id)) {
        const comp: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.push(w);
        } while (w !== top.id);
        const selfLoop = comp.length === 1 && (out.get(comp[0]) ?? []).includes(comp[0]);
        if (comp.length > 1 || selfLoop) result.push(comp);
      }
    }
  }
  return result;
}

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

  const out = new Map<string, FlowEdge[]>();
  for (const e of f.edges) out.set(e.from, [...(out.get(e.from) ?? []), e]);

  for (const n of f.nodes) {
    const exits = out.get(n.id) ?? [];
    if (n.kind !== "end" && exits.length === 0) issues.push(`Dead end: "${n.label}" has no outgoing edge.`);
    if (n.kind === "end" && exits.length) issues.push(`Outcome "${n.label}" has outgoing edges; outcomes should be terminal.`);
    if (n.kind === "gate") {
      if (exits.length < 2) issues.push(`Gate "${n.label}" has fewer than 2 exits.`);
      const unlabelled = exits.filter((e) => !e.label?.trim()).length;
      if (unlabelled) issues.push(`Gate "${n.label}" has ${unlabelled} unlabelled exit(s).`);
    }
  }

  // Reachability from the root
  const root = rootOf(f);
  if (root) {
    const seen = new Set([root.id]);
    const q = [root.id];
    while (q.length) for (const e of out.get(q.shift()!) ?? []) if (!seen.has(e.to)) (seen.add(e.to), q.push(e.to));
    const orphans = f.nodes.filter((n) => !seen.has(n.id));
    if (orphans.length)
      issues.push(
        `${orphans.length} node(s) can't be reached from START: ${orphans
          .slice(0, 4)
          .map((n) => `"${n.label}"`)
          .join(", ")}${orphans.length > 4 ? "…" : ""}.`,
      );
  }

  // Every loop needs a way out, and that way out needs a stated condition.
  for (const comp of loops(f)) {
    const inLoop = new Set(comp);
    const exits = f.edges.filter((e) => inLoop.has(e.from) && !inLoop.has(e.to));
    const members = f.nodes.filter((n) => inLoop.has(n.id)); // source order, so messages are stable
    const name = `"${(members.find((n) => n.kind === "gate") ?? members[0]).label}"`;
    if (!exits.length) issues.push(`Infinite loop: the cycle through ${name} has no exit.`);
    else if (!exits.some((e) => e.loopExit || e.label?.trim())) issues.push(`The loop through ${name} has no labelled exit condition.`);
  }

  return issues;
}
