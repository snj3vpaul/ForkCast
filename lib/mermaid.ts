import type { Forge, FlowNode } from "./types";

// Mermaid labels: no raw quotes, newlines, pipes (edge-label delimiters), backticks (markdown strings) or angle brackets.
const esc = (s: string | undefined) =>
  (s ?? "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(/"/g, "'")
    .replace(/`/g, "'")
    .replace(/\|/g, "/")
    .replace(/[<>]/g, "")
    .trim();

/** Stable, collision-free Mermaid ids: "END-1" and "END_1" must not merge into one node. */
function idMap(ids: string[], prefix: string): Map<string, string> {
  const m = new Map<string, string>();
  const used = new Set<string>();
  for (const id of ids) {
    if (m.has(id)) continue;
    const base = prefix + (id.replace(/[^A-Za-z0-9_]/g, "_") || "x");
    let out = base;
    for (let k = 2; used.has(out); k++) out = `${base}_${k}`;
    used.add(out);
    m.set(id, out);
  }
  return m;
}

function shape(n: FlowNode): string {
  const kindName = n.kind === "split" || n.kind === "join" ? n.kind : "";
  const tag = n.inferred ? " ✎" : "";
  const L = esc(n.label) + tag;
  switch (n.kind) {
    case "start":
    case "end":
      return `([" ${L} "])`;
    case "gate":
      return `{"${esc(n.question || n.label)}"}`;
    case "contradiction":
      return `{"⚔ ${esc(n.question || "source conflicts here")}"}`;
    case "commit":
      return `[["🔒 ${L}"]]`;
    case "split":
    case "join":
      return `[/"${L || kindName}"/]`;
    default:
      return `["${L}"]`;
  }
}

/** Ports the Ink & Signal system into Mermaid as far as classDefs allow. */
export function toMermaid(f: Forge): string {
  const lines = [
    "%%{init: {'theme':'base','themeVariables':{'fontFamily':'JetBrains Mono, monospace','primaryColor':'#f4efe6','primaryBorderColor':'#1b1a17','lineColor':'#1b1a17','primaryTextColor':'#1b1a17'}}}%%",
    "flowchart TD",
  ];
  const ids = idMap(f.nodes.map((n) => n.id), "n_");
  const sid = (id: string) => ids.get(id) ?? "n_missing";
  const actors = [...new Set(f.nodes.map((n) => n.actor?.trim()).filter(Boolean))] as string[];
  const lanes = idMap(actors, "lane_");
  const decl = (n: FlowNode) => `    ${sid(n.id)}${shape(n)}`;
  if (actors.length >= 2) {
    for (const a of actors) {
      lines.push(`  subgraph ${lanes.get(a)}["${esc(a)}"]`);
      f.nodes.filter((n) => n.actor?.trim() === a).forEach((n) => lines.push(decl(n)));
      lines.push("  end");
    }
    f.nodes.filter((n) => !n.actor?.trim()).forEach((n) => lines.push(decl(n)));
  } else f.nodes.forEach((n) => lines.push(decl(n)));

  f.edges.forEach((e) => {
    if (!ids.has(e.from) || !ids.has(e.to)) return;
    const arrow = e.kind === "unstated" ? "-.->" : e.kind === "loop" ? "==>" : "-->";
    const label = [e.label, e.maxIterations && `max ${e.maxIterations}`].filter(Boolean).join(" · ");
    lines.push(`  ${sid(e.from)} ${arrow}${label ? `|"${esc(label)}"|` : ""} ${sid(e.to)}`);
  });

  lines.push(
    "  classDef action fill:#f4efe6,stroke:#1b1a17,stroke-width:1.5px,font-family:JetBrains Mono",
    "  classDef gate fill:#1b1a17,stroke:#1b1a17,color:#f4efe6",
    "  classDef commit fill:#e8dfcf,stroke:#1b1a17,stroke-width:4px",
    "  classDef unstated fill:none,stroke:#8a857c,stroke-dasharray:4 3,color:#8a857c",
    "  classDef undefinedEnd fill:none,stroke:#c2410c,stroke-dasharray:4 3,color:#c2410c",
    "  classDef term fill:#1b1a17,color:#f4efe6,stroke:#1b1a17",
    "  classDef inferred stroke-dasharray:2 2",
  );
  const cls: Record<string, string[]> = {};
  for (const n of f.nodes) {
    const c =
      n.kind === "end" && n.outcome === "undefined"
        ? "undefinedEnd"
        : n.kind === "start" || n.kind === "end"
          ? "term"
          : n.kind === "gate" || n.kind === "contradiction"
            ? "gate"
            : n.kind === "commit"
              ? "commit"
              : n.kind === "unstated"
                ? "unstated"
                : "action";
    (cls[c] ??= []).push(sid(n.id));
  }
  for (const [c, ids] of Object.entries(cls)) lines.push(`  class ${ids.join(",")} ${c}`);
  return lines.join("\n");
}
