import type { Forge } from "@/lib/types";
export const fence = (o: unknown) => "```json\n" + JSON.stringify(o, null, 2) + "\n```";
export const report = { inputType: "hybrid", actors: [], decisionCount: 0, stepCount: 0, flags: [], confidence: "high", confidenceReason: "" };
export function g(nodes: unknown[], edges: unknown[], extra: Record<string, unknown> = {}): Forge {
  return { title: "t", mode: "parsed", parseReport: report, nodes, edges, ledger: [], ...extra } as unknown as Forge;
}
/** Deterministic PRNG so fuzz failures are reproducible. */
export function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
