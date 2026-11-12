import { DECISION_FORGE_PROMPT } from "./prompt";
import { FORGE_TOOL, GRAPH_RULES, PASTE_DELIVERY, TOOL_DELIVERY } from "./schema";
import type { Forge } from "./types";
import { validateForge } from "./validate";

/* Two engines, zero server secrets:
 *  1. Paste mode — the user runs the prompt in their own chat app (any Claude plan,
 *     or another capable assistant) and pastes the JSON reply back.
 *  2. Own-key mode — the browser calls api.anthropic.com directly with the user's
 *     key. The key never touches Forkcast's servers.                                  */

const userBlock = (text: string, flags: string[]) => text.trim() + (flags.length ? `\n\n${flags.join(" ")}` : "");

export function buildPastePrompt(text: string, flags: string[]): string {
  return [
    DECISION_FORGE_PROMPT,
    GRAPH_RULES,
    PASTE_DELIVERY,
    "════════════════════════════════════════",
    "USER INPUT (parse this):",
    "",
    userBlock(text, flags),
  ].join("\n");
}

export function buildCorrectionPrompt(corrections: string): string {
  return `The Parse Report is confirmed with these corrections — apply them, do not re-ask, and reply again with the complete JSON code block only:\n\n${corrections.trim()}`;
}

export interface ForgeResult {
  forge: Forge;
  audit: string[];
}

/** Pull the Forge JSON out of whatever the user pasted (fenced or bare, with chatter around it). */
export function extractForge(raw: string): ForgeResult {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(raw))) candidates.push(m[1]);
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a !== -1 && b > a) candidates.push(raw.slice(a, b + 1));

  const tries = candidates.sort((x, y) => y.length - x.length).flatMap((c) => [c, c.replace(/,\s*([}\]])/g, "$1")]);
  for (const c of tries) {
    try {
      let obj = JSON.parse(c);
      if (obj && !obj.nodes && obj.input?.nodes) obj = obj.input;
      if (obj && Array.isArray(obj.nodes) && Array.isArray(obj.edges)) return finish(obj as Forge);
    } catch {
      /* try next candidate */
    }
  }
  throw new Error(
    "Couldn't find the flowchart JSON in that reply. Copy the whole reply, including the ```json block. If the reply was cut off, ask the chat to “continue”, then paste both parts.",
  );
}

function finish(forge: Forge): ForgeResult {
  forge.parseReport ??= {
    inputType: "hybrid",
    actors: [],
    decisionCount: 0,
    stepCount: 0,
    flags: [],
    confidence: "medium",
    confidenceReason: "",
  };
  forge.parseReport.flags ??= [];
  forge.parseReport.actors ??= [];
  forge.mode ??= "parsed";
  forge.title ??= "Untitled decision";
  return { forge, audit: validateForge(forge) };
}

export async function forgeWithKey(opts: {
  apiKey: string;
  model: string;
  text: string;
  flags: string[];
  corrections?: string;
}): Promise<ForgeResult & { truncated: boolean }> {
  let content = userBlock(opts.text, opts.flags);
  if (opts.corrections?.trim()) content += "\n\n---\n" + buildCorrectionPrompt(opts.corrections);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: opts.model.trim() || "claude-sonnet-5-5",
      max_tokens: 16000,
      system: DECISION_FORGE_PROMPT + "\n" + GRAPH_RULES + TOOL_DELIVERY,
      tools: [FORGE_TOOL],
      tool_choice: { type: "tool", name: FORGE_TOOL.name },
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(res.status === 401 ? "That API key was rejected. Check it in console.anthropic.com." : msg);
  }
  const block = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!block) throw new Error("The model returned no graph. Try again.");
  return { ...finish(block.input as Forge), truncated: data.stop_reason === "max_tokens" };
}
