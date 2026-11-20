import type { EdgeKind, Flag, FlowEdge, FlowNode, Forge, NodeKind, Outcome, ParseReport } from "./types";

/* Model output is untrusted shape-wise: chat replies get hand-copied, tool calls
 * occasionally stringify nested arrays, and models drift on enum names. This
 * coerces whatever arrived into a Forge the renderer can always draw, and
 * reports every repair it made (shown under the chart as audit lines).      */

const KINDS: NodeKind[] = ["start", "action", "gate", "commit", "split", "join", "contradiction", "unstated", "end"];
const KIND_ALIASES: Record<string, NodeKind> = {
  begin: "start", entry: "start", trigger: "start",
  decision: "gate", condition: "gate", question: "gate", branch: "gate", diamond: "gate", choice: "gate",
  step: "action", task: "action", process: "action", activity: "action",
  irreversible: "commit", commitpoint: "commit",
  fork: "split", parallel: "split",
  merge: "join", sync: "join", synchronize: "join", synchronise: "join",
  conflict: "contradiction",
  gap: "unstated", undefined: "unstated",
  terminal: "end", terminator: "end", outcome: "end", stop: "end", finish: "end", result: "end",
};
const EDGE_KINDS: EdgeKind[] = ["normal", "unstated", "loop", "exception", "parallel"];
const OUTCOMES: Outcome[] = ["positive", "negative", "neutral", "undefined"];
const INPUT_TYPES = ["single decision", "branching process", "multi-actor workflow", "conditional SOP", "hybrid", "procedure", "wish"];

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : typeof v === "object" ? "" : String(v)).trim();
const optStr = (v: unknown): string | undefined => str(v) || undefined;
const bool = (v: unknown) => v === true || v === "true";
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Arrays sometimes arrive JSON-encoded as strings. */
function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p;
    } catch {
      /* fall through */
    }
  }
  return [];
}

function toKind(v: unknown, id: string): { kind: NodeKind; known: boolean } {
  const k = squash(str(v));
  if ((KINDS as string[]).includes(k)) return { kind: k as NodeKind, known: true };
  if (KIND_ALIASES[k]) return { kind: KIND_ALIASES[k], known: true };
  if (!k && /^start$/i.test(id)) return { kind: "start", known: true };
  if (!k && /^end\b/i.test(id)) return { kind: "end", known: true };
  return { kind: "action", known: false };
}

function toLateral(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(str(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round(n))) : 0;
}

export function normalizeForge(input: unknown): { forge: Forge; repairs: string[] } {
  const raw = obj(input);
  if (!raw) throw new Error("The reply wasn't a flowchart object.");
  const repairs: string[] = [];

  // ── nodes ──
  const seen = new Map<string, number>();
  const nodes: FlowNode[] = [];
  let unknownKinds = 0;
  arr(raw.nodes).forEach((item, i) => {
    const n = obj(item);
    if (!n) return;
    let id = str(n.id) || `N${i + 1}`;
    const base = id;
    if (seen.has(base)) {
      let k = seen.get(base)! + 1;
      while (seen.has(`${base}~${k}`)) k++;
      seen.set(base, k);
      id = `${base}~${k}`;
      repairs.push(`Duplicate node id "${base}" renamed to "${id}".`);
    }
    seen.set(id, seen.get(id) ?? 1);
    const { kind, known } = toKind(n.kind ?? n.type, id);
    if (!known) unknownKinds++;
    const question = optStr(n.question);
    const label = str(n.label) || str(n.text) || question || id;
    let outcome = OUTCOMES.find((o) => o === str(n.outcome).toLowerCase());
    if (kind === "end" && !outcome && /undefined in source/i.test(label)) outcome = "undefined";
    nodes.push({
      id,
      kind,
      label,
      question,
      actor: optStr(n.actor),
      lateral: toLateral(n.lateral),
      inferred: bool(n.inferred) || undefined,
      sourceQuote: optStr(n.sourceQuote),
      phase: optStr(n.phase),
      outcome,
    });
  });
  if (!nodes.length) throw new Error("The reply has no flowchart nodes. If it was cut off, ask the chat to “continue” and paste both parts.");
  if (unknownKinds) repairs.push(`${unknownKinds} node(s) had an unknown kind and are drawn as actions.`);

  // ── id resolution: exact → case-insensitive → punctuation-insensitive ──
  const exact = new Set(nodes.map((n) => n.id));
  const lower = new Map<string, string>();
  const loose = new Map<string, string>();
  for (const n of nodes) {
    if (!lower.has(n.id.toLowerCase())) lower.set(n.id.toLowerCase(), n.id);
    if (!loose.has(squash(n.id))) loose.set(squash(n.id), n.id);
  }
  const resolve = (v: unknown): string => {
    const s = str(v);
    return exact.has(s) ? s : (lower.get(s.toLowerCase()) ?? loose.get(squash(s)) ?? s);
  };

  // ── edges ──
  const edgeKeys = new Set<string>();
  const edges: FlowEdge[] = [];
  let dupEdges = 0;
  for (const item of arr(raw.edges)) {
    const e = obj(item);
    if (!e) continue;
    const from = resolve(e.from ?? e.source);
    const to = resolve(e.to ?? e.target);
    const label = optStr(e.label ?? e.condition);
    const key = `${from}\u0000${to}\u0000${label ?? ""}`;
    if (edgeKeys.has(key)) {
      dupEdges++;
      continue;
    }
    edgeKeys.add(key);
    const kind = EDGE_KINDS.find((k) => k === str(e.kind).toLowerCase());
    edges.push({
      from,
      to,
      label,
      kind,
      loopExit: bool(e.loopExit) || undefined,
      maxIterations: optStr(e.maxIterations),
    });
  }
  if (dupEdges) repairs.push(`${dupEdges} duplicate edge(s) removed.`);

  // ── parse report ──
  const pr = obj(raw.parseReport) ?? {};
  let actorsRaw: unknown[] = arr(pr.actors);
  if (!actorsRaw.length && typeof pr.actors === "string") actorsRaw = pr.actors.split(/[,;·]/);
  const actors = actorsRaw
    .map((a) => {
      if (typeof a === "string") {
        const name = a.replace(/\(implied\)/i, "").trim();
        return name ? { name, implied: /\(implied\)/i.test(a) } : null;
      }
      const o = obj(a);
      const name = o ? str(o.name) : "";
      return name ? { name, implied: bool(o!.implied) } : null;
    })
    .filter(Boolean) as ParseReport["actors"];
  const flags: Flag[] = arr(pr.flags)
    .map((f) => {
      const o = obj(f);
      if (!o) return null;
      const code = str(o.code).toUpperCase() || "A?";
      const ids = arr(o.nodeIds).map(resolve).filter((id) => exact.has(id));
      return { code, text: str(o.text), nodeIds: ids.length ? ids : undefined };
    })
    .filter(Boolean) as Flag[];
  const count = (v: unknown, fallback: number) => {
    const n = typeof v === "number" ? v : parseInt(str(v), 10);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  };
  const conf = str(pr.confidence).toLowerCase();
  const parseReport: ParseReport = {
    inputType: INPUT_TYPES.includes(str(pr.inputType)) ? str(pr.inputType) : str(pr.inputType) || "hybrid",
    actors,
    decisionCount: count(pr.decisionCount, nodes.filter((n) => n.kind === "gate").length),
    stepCount: count(pr.stepCount, nodes.filter((n) => n.kind === "action" || n.kind === "commit").length),
    flags,
    confidence: conf === "high" || conf === "low" ? conf : "medium",
    confidenceReason: str(pr.confidenceReason),
    note: optStr(pr.note),
  };

  // ── everything else ──
  const mode = str(raw.mode).toLowerCase();
  const phases = arr(raw.phases)
    .map((p, i) => {
      const o = obj(p);
      const name = o ? str(o.name) || str(o.id) : str(p);
      return name ? { id: (o && str(o.id)) || name, name } : null;
    })
    .filter(Boolean) as Forge["phases"];
  const ledger = arr(raw.ledger)
    .map((l) => {
      if (typeof l === "string") return l.trim() ? { added: l.trim(), why: "" } : null;
      const o = obj(l);
      return o && (str(o.added) || str(o.why)) ? { added: str(o.added), why: str(o.why) } : null;
    })
    .filter(Boolean) as Forge["ledger"];

  return {
    forge: {
      title: str(raw.title) || "Untitled decision",
      mode: mode === "procedure" || mode === "proposed" ? mode : "parsed",
      parseReport,
      phases: phases?.length ? phases : undefined,
      nodes,
      edges,
      ledger,
      challenge: optStr(raw.challenge) ?? null,
    },
    repairs,
  };
}
