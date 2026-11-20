import { describe, expect, test } from "vitest";
import { extractForge } from "@/lib/engine";
import { SAMPLE_FORGE } from "@/lib/sample";
import { fence, report } from "./helpers";

const S = JSON.stringify(SAMPLE_FORGE);

describe("extractForge — what users actually paste", () => {
  test("clean fenced reply", () => {
    expect(extractForge(fence(SAMPLE_FORGE)).forge.nodes).toHaveLength(SAMPLE_FORGE.nodes.length);
  });
  test("chatter around the fence, CRLF line endings, BOM", () => {
    const r = extractForge("﻿Here you go:\r\n\r\n" + fence(SAMPLE_FORGE).replace(/\n/g, "\r\n") + "\r\nLet me know!");
    expect(r.forge.title).toBe(SAMPLE_FORGE.title);
  });
  test("bare JSON, no fence", () => expect(extractForge(S).forge.edges.length).toBe(SAMPLE_FORGE.edges.length));
  test("fence without a language tag", () => expect(extractForge("```\n" + S + "\n```").forge.title).toBe(SAMPLE_FORGE.title));
  test("trailing commas", () => {
    const sloppy = S.replace(/\]\}$/, "],}").replace('"edges":[', '"edges":[ ').replace(/\}\]/, "},]");
    expect(extractForge(sloppy).forge.nodes.length).toBe(SAMPLE_FORGE.nodes.length);
  });
  test("trailing-comma repair leaves commas inside strings alone", () => {
    const f = { ...SAMPLE_FORGE, title: "a ,} b ,]" };
    expect(extractForge(JSON.stringify(f).replace(/\}$/, ",}")).forge.title).toBe("a ,} b ,]");
  });
  test("reply split across two messages with a fresh fence and prose between", () => {
    const k = Math.floor(S.length / 2);
    const two = "```json\n" + S.slice(0, k) + "\n\nContinuing from where I stopped:\n\n```json\n" + S.slice(k) + "\n```";
    expect(extractForge(two).forge.nodes.length).toBe(SAMPLE_FORGE.nodes.length);
  });
  test("prompt + reply pasted together: the schema block is skipped", () => {
    const withSchema = "```json\n" + JSON.stringify({ type: "object", properties: { nodes: { type: "array" } } }) + "\n```\n\n" + fence(SAMPLE_FORGE);
    expect(extractForge(withSchema).forge.title).toBe(SAMPLE_FORGE.title);
  });
  test.each([
    ["tool_use block", { type: "tool_use", name: "emit_forkcast", input: SAMPLE_FORGE }],
    ["arguments as a string", { name: "emit_forkcast", arguments: S }],
    ["array of content blocks", [{ type: "text", text: "hi" }, { type: "tool_use", input: SAMPLE_FORGE }]],
    ["JSON-encoded string", S],
  ])("unwraps %s", (_, wrapped) => {
    expect(extractForge(JSON.stringify(wrapped)).forge.nodes.length).toBe(SAMPLE_FORGE.nodes.length);
  });
  test("a question instead of JSON gets a specific error", () => {
    expect(() => extractForge("Before I render this, can you confirm who signs the contract?")).toThrow(/no JSON/);
  });
  test("a cut-off reply gets the continue advice", () => {
    expect(() => extractForge("```json\n" + S.slice(0, 900))).toThrow(/cut off/);
  });
  test("empty graph is rejected, not drawn blank", () => {
    expect(() => extractForge(fence({ title: "x", parseReport: report, nodes: [], edges: [], ledger: [] }))).toThrow(/no flowchart nodes/);
  });
  test("garbage", () => expect(() => extractForge("{ not json at all }")).toThrow());
});
