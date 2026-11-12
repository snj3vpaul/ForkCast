import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FORGE_TOOL, OUTPUT_CONTRACT } from "@/lib/schema";
import { validateForge } from "@/lib/validate";
import type { Forge } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_INPUT_CHARS = 40_000;
let promptCache: string | null = null;

async function systemPrompt() {
  if (!promptCache) {
    const file = await readFile(path.join(process.cwd(), "prompts", "decision-forge.md"), "utf8");
    promptCache = file + "\n" + OUTPUT_CONTRACT;
  }
  return promptCache;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables." },
      { status: 500 },
    );
  }

  let body: { text?: string; modifiers?: string[]; corrections?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Paste a decision or process first." }, { status: 400 });
  if (text.length > MAX_INPUT_CHARS)
    return Response.json({ error: `Input too long (max ${MAX_INPUT_CHARS.toLocaleString()} characters).` }, { status: 413 });

  const mods = (body.modifiers ?? []).filter((m) => /^--[a-z-]+$/.test(m)).join(" ");
  let userMessage = mods ? `${text}\n\n${mods}` : text;
  if (body.corrections?.trim()) {
    userMessage += `\n\n---\nUser confirmed the Parse Report with these corrections (apply them, do not re-ask):\n${body.corrections.trim()}`;
  }

  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 16000,
      system: await systemPrompt(),
      tools: [FORGE_TOOL],
      tool_choice: { type: "tool", name: FORGE_TOOL.name },
      messages: [{ role: "user", content: userMessage }],
    });

    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return Response.json({ error: "Model returned no graph." }, { status: 502 });
    }
    const forge = block.input as Forge;
    const audit = validateForge(forge);
    return Response.json({ forge, audit, truncated: msg.stop_reason === "max_tokens" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
