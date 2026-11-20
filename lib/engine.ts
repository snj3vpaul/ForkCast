import { DECISION_FORGE_PROMPT } from "./prompt";
import { FORGE_TOOL, GRAPH_RULES, PASTE_DELIVERY, TOOL_DELIVERY } from "./schema";
import type { Forge } from "./types";
import { normalizeForge } from "./normalize";
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
  return `The Parse Report is confirmed with these corrections. Apply them, do not re-ask, and reply again with the complete JSON in one \`\`\`json code block in your message (no artifact, no commentary):\n\n${corrections.trim()}`;
}

export interface ForgeResult {
  forge: Forge;
  audit: string[];
}

/** Drop trailing commas outside of strings (a common hand-edit / model slip). */
function stripTrailingCommas(src: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === "\\") out += src[++i] ?? "";
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    if (c === ",") {
      let j = i + 1;
      while (/\s/.test(src[j] ?? "")) j++;
      if (src[j] === "}" || src[j] === "]") continue;
    }
    out += c;
  }
  return out;
}

/** Trailing prose after a cut-off fragment ("continue", "Here's the rest:") — lines with no JSON punctuation. */
const dropTrailingProse = (s: string) => {
  const lines = s.split("\n");
  while (lines.length && !/[{}[\]"]/.test(lines[lines.length - 1])) lines.pop();
  return lines.join("\n");
};

/**
 * Fenced chunks in order. A fence with a language tag always opens; a bare fence closes
 * an open one. An opener arriving while a fence is still open means the earlier reply
 * was cut off, so that chunk ends there (minus any prose between the two replies).
 */
function fencedChunks(raw: string): string[] {
  const chunks: string[] = [];
  const re = /```([a-zA-Z]*)[ \t]*\n?/g;
  let open: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const tagged = m[1].length > 0;
    if (open === null) open = m.index + m[0].length;
    else if (tagged) {
      chunks.push(dropTrailingProse(raw.slice(open, m.index)));
      open = m.index + m[0].length;
    } else {
      chunks.push(raw.slice(open, m.index));
      open = null;
    }
  }
  if (open !== null) chunks.push(raw.slice(open));
  return chunks;
}

/** Peel the common wrappers: tool calls, content blocks, single-item arrays, JSON-in-a-string. */
function unwrap(v: unknown, depth = 0): unknown {
  if (depth > 4) return v;
  if (typeof v === "string") {
    try {
      return unwrap(JSON.parse(v), depth + 1);
    } catch {
      return v;
    }
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      const u = unwrap(item, depth + 1);
      if (u && typeof u === "object" && "nodes" in (u as object)) return u;
    }
    return v;
  }
  if (v && typeof v === "object" && !("nodes" in v)) {
    const o = v as Record<string, unknown>;
    for (const k of ["input", "arguments", "parameters", "tool_input", "forge", "data", "result", "content"]) {
      if (k in o) {
        const u = unwrap(o[k], depth + 1);
        if (u && typeof u === "object" && "nodes" in (u as object)) return u;
      }
    }
  }
  return v;
}

/** Pull the Forge JSON out of whatever the user pasted (fenced or bare, chatter around it, split across replies). */
export function extractForge(raw: string): ForgeResult {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const fenced = fencedChunks(text);
  const unfenced = text.replace(/```[a-zA-Z]*/g, "");
  const candidates = new Set<string>();
  const braceSlice = (s: string) => {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    return a !== -1 && b > a ? s.slice(a, b + 1) : "";
  };
  for (const c of fenced) candidates.add(c);
  if (fenced.length > 1) {
    candidates.add(fenced.join(""));
    candidates.add(fenced.map((c) => c.replace(/^\s+|\s+$/g, "")).join(""));
  }
  candidates.add(text.trim());
  candidates.add(braceSlice(text));
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a !== -1 && b > a && a < text.indexOf("{")) candidates.add(text.slice(a, b + 1));
  candidates.add(braceSlice(unfenced));
  candidates.delete("");

  const tries = [...candidates].sort((x, y) => y.length - x.length).flatMap((c) => [c, stripTrailingCommas(c)]);
  let lastShapeError: Error | null = null;
  for (const c of tries) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(c);
    } catch {
      continue;
    }
    const obj = unwrap(parsed);
    if (obj && typeof obj === "object" && "nodes" in (obj as object)) {
      try {
        return finish(obj);
      } catch (e) {
        lastShapeError = e as Error;
      }
    }
  }
  if (lastShapeError) throw lastShapeError;

  if (!/[{[]/.test(text))
    throw new Error(
      "That reply has no JSON in it. Claude may have asked a question or put the result in an artifact. Reply in the same chat: “Send the complete JSON in a ```json code block in your message.”",
    );
  const opens = (text.match(/{/g) ?? []).length;
  const closes = (text.match(/}/g) ?? []).length;
  if (/"nodes"\s*:/.test(text) && opens > closes)
    throw new Error(
      "The JSON looks cut off. In the same chat, ask Claude to “continue”, then paste the first reply and the continuation here together.",
    );
  throw new Error(
    "Couldn't find the flowchart JSON in that reply. Copy the whole reply, including the ```json block. If the reply was cut off, ask the chat to “continue”, then paste both parts.",
  );
}

function finish(input: unknown): ForgeResult {
  const { forge, repairs } = normalizeForge(input);
  return { forge, audit: [...repairs, ...validateForge(forge)] };
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

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: opts.model.trim() || DEFAULT_MODEL,
        max_tokens: 16000,
        system: DECISION_FORGE_PROMPT + "\n" + GRAPH_RULES + TOOL_DELIVERY,
        tools: [FORGE_TOOL],
        tool_choice: { type: "tool", name: FORGE_TOOL.name },
        messages: [{ role: "user", content }],
      }),
    });
  } catch {
    throw new Error(
      "Couldn't reach api.anthropic.com. Check your connection; a privacy extension or corporate network may be blocking it. “Paste from Claude” works without it.",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiError(res.status, data?.error?.message, opts.model));
  const block = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  const truncated = data.stop_reason === "max_tokens";
  if (!block) throw new Error(truncated ? "The response hit the token limit before the graph started. Try a shorter input." : "The model returned no graph. Try again.");
  try {
    return { ...finish(block.input), truncated };
  } catch (e) {
    if (truncated) throw new Error("The response hit the token limit before the graph was complete. Split the input or add --collapse.");
    throw e;
  }
}

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export function apiError(status: number, message: string | undefined, model: string): string {
  switch (status) {
    case 401:
      return "That API key was rejected. Check it in the Claude Console under Settings → API keys.";
    case 403:
      return message || "This key isn't allowed to use that model or workspace.";
    case 404:
      return `Model “${model.trim()}” wasn't found. Check the model name.`;
    case 429:
      return "Rate limited by the API. Wait a moment and try again.";
    case 529:
      return "The API is overloaded right now. Try again in a minute.";
    default:
      return message || `The API returned HTTP ${status}.`;
  }
}
