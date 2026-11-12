// JSON schema for the forced tool call. The model emits the logic graph;
// Forkcast's own renderer applies the Ink & Signal visual system, so the
// look is deterministic and never template-styled by the model.

export const FORGE_TOOL = {
  name: "emit_forkcast",
  description:
    "Emit the Parse Report, logic graph, Assumption Ledger and one-line challenge for the pasted decision text.",
  input_schema: {
    type: "object" as const,
    required: ["title", "mode", "parseReport", "nodes", "edges", "ledger"],
    properties: {
      title: { type: "string", description: "Short title of the decision process (≤ 6 words)." },
      mode: {
        type: "string",
        enum: ["parsed", "procedure", "proposed"],
        description:
          "parsed = normal decision flow; procedure = 0 decision points; proposed = input was a wish, this is a candidate framework.",
      },
      parseReport: {
        type: "object",
        required: ["inputType", "actors", "decisionCount", "stepCount", "flags", "confidence", "confidenceReason"],
        properties: {
          inputType: {
            type: "string",
            enum: ["single decision", "branching process", "multi-actor workflow", "conditional SOP", "hybrid", "procedure", "wish"],
          },
          actors: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "implied"],
              properties: { name: { type: "string" }, implied: { type: "boolean" } },
            },
          },
          decisionCount: { type: "integer" },
          stepCount: { type: "integer" },
          flags: {
            type: "array",
            items: {
              type: "object",
              required: ["code", "text"],
              properties: {
                code: { type: "string", enum: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] },
                text: { type: "string" },
                nodeIds: { type: "array", items: { type: "string" } },
              },
            },
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          confidenceReason: { type: "string" },
          note: { type: "string", description: "e.g. '0 decision points — this is a procedure, not a decision.'" },
        },
      },
      phases: {
        type: "array",
        description: "Only when > ~40 nodes or --collapse: 2–4 phases.",
        items: {
          type: "object",
          required: ["id", "name"],
          properties: { id: { type: "string" }, name: { type: "string" } },
        },
      },
      nodes: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "kind", "label", "lateral"],
          properties: {
            id: { type: "string", description: "Short id. Start = 'START'; ends = 'END-1', 'END-2'…" },
            kind: {
              type: "string",
              enum: ["start", "action", "gate", "commit", "split", "join", "contradiction", "unstated", "end"],
            },
            label: {
              type: "string",
              description:
                "Action/commit: verb-first, ≤ 8 words. End: named outcome ('Vendor renewed ✓'). Gate: 2–4 word gate name. Unstated end: '⚠ undefined in source'.",
            },
            question: { type: "string", description: "Gates/contradiction only: the yes/no or enumerated question." },
            actor: { type: "string" },
            lateral: {
              type: "integer",
              minimum: 0,
              maximum: 4,
              description: "0 = happy-path spine. Higher = more abnormal (exception, failure, unstated paths).",
            },
            inferred: { type: "boolean", description: "True if sequenced/split/derived beyond literal text (✎ inferred)." },
            sourceQuote: { type: "string", description: "Exact source sentence this node comes from, verbatim." },
            phase: { type: "string" },
            outcome: { type: "string", enum: ["positive", "negative", "neutral", "undefined"] },
          },
        },
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          required: ["from", "to"],
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            label: { type: "string", description: "Required on every gate exit: exact condition, quoting source wording." },
            kind: { type: "string", enum: ["normal", "unstated", "loop", "exception", "parallel"] },
            loopExit: { type: "boolean" },
            maxIterations: { type: "string" },
          },
        },
      },
      ledger: {
        type: "array",
        items: {
          type: "object",
          required: ["added", "why"],
          properties: { added: { type: "string" }, why: { type: "string" } },
        },
      },
      challenge: { type: ["string", "null"], description: "The single question the flow exposes. Max one." },
    },
  },
};

export const OUTPUT_CONTRACT = `
## FORKCAST OUTPUT CONTRACT (overrides §5 delivery mechanics only)

You are running inside the Forkcast app. Do not write prose, HTML, SVG or Mermaid yourself.
Call the \`emit_forkcast\` tool exactly once. The app renders your graph with the Ink & Signal
visual system (spine, lateral consequence, swimlanes, Judgment Line, commit padlocks,
dashed UNSTATED paths, interactive hover/click) and generates Mermaid / static SVG exports.

Graph rules to encode:
- Exactly one node of kind "start" (id "START"). Every outcome is its own "end" node (END-1, END-2…) with a named label and an outcome value.
- Happy path nodes get lateral 0. Deviations get lateral 1–4 by abnormality. Unstated (A2) branches: a "unstated" node (lateral ≥ 2) followed by an "end" node with outcome "undefined" and label "⚠ undefined in source"; edges into them use kind "unstated".
- Irreversible actions (sign, publish, delete, pay, terminate, submit) are kind "commit".
- Parallel work: a "split" node, parallel branches (edge kind "parallel"), and a "join" node.
- A10 contradictions: both paths drawn, converging on a "contradiction" node with question "⚔ source conflicts here".
- Loop back-edges use kind "loop"; at least one edge leaving each loop has loopExit true and a label naming the exit condition; add maxIterations when the source implies a bound.
- Every gate has ≥ 2 labelled outgoing edges. No dead ends: every non-end node has ≥ 1 outgoing edge.
- Set "actor" on every node when ≥ 2 actors exist (implied actors included, e.g. "Approver (implied)").
- Fill sourceQuote verbatim for every node backed by source text. Mark derived nodes inferred: true and explain each in the ledger.
- The parse report is ≤ 150 words in total. Sensitive domains (legal, medical, HR) add the ledger line "Not legal/medical advice; parsed as written."
`;
