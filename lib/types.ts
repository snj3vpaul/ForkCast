export type NodeKind =
  | "start"
  | "action"
  | "gate"
  | "commit"
  | "split"
  | "join"
  | "contradiction"
  | "unstated"
  | "end";

export type Outcome = "positive" | "negative" | "neutral" | "undefined";

export interface FlowNode {
  id: string;
  kind: NodeKind;
  /** Action: verb-first ≤ 8 words. End: named outcome. Gate: short gate name. */
  label: string;
  /** Gates only: the condition question, rendered OUTSIDE the rhombus. */
  question?: string;
  actor?: string;
  /** 0 = happy-path spine; 1..4 = distance of deviation from normal. */
  lateral: number;
  inferred?: boolean;
  /** Verbatim source sentence backing this node. */
  sourceQuote?: string;
  phase?: string;
  outcome?: Outcome;
}

export type EdgeKind = "normal" | "unstated" | "loop" | "exception" | "parallel";

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
  /** True when this edge is the exit condition of a loop. */
  loopExit?: boolean;
  maxIterations?: string;
}

export interface Flag {
  code: string; // A1..A10
  text: string;
  nodeIds?: string[];
}

export interface ParseReport {
  inputType: string;
  actors: { name: string; implied: boolean }[];
  decisionCount: number;
  stepCount: number;
  flags: Flag[];
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  note?: string;
}

export interface Forge {
  title: string;
  mode: "parsed" | "procedure" | "proposed";
  parseReport: ParseReport;
  phases?: { id: string; name: string }[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  ledger: { added: string; why: string }[];
  challenge?: string | null;
}

export interface Modifiers {
  mermaid: boolean;
  svgStatic: boolean;
  swimlanes: boolean;
  collapse: boolean;
  annotate: boolean;
}
