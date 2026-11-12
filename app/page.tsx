"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Diagram } from "@/components/Diagram";
import { SAMPLE_FORGE, SAMPLE_TEXT } from "@/lib/sample";
import { toMermaid } from "@/lib/mermaid";
import { buildCorrectionPrompt, buildPastePrompt, extractForge, forgeWithKey, type ForgeResult } from "@/lib/engine";
import type { Forge, Modifiers } from "@/lib/types";

const MODS: { key: keyof Modifiers; flag: string; hint: string }[] = [
  { key: "mermaid", flag: "--mermaid", hint: "Mermaid output" },
  { key: "svgStatic", flag: "--svg-static", hint: "Static SVG, no interaction" },
  { key: "swimlanes", flag: "--swimlanes", hint: "Force swimlanes" },
  { key: "collapse", flag: "--collapse", hint: "Cluster into phases" },
  { key: "annotate", flag: "--annotate", hint: "Pin source quotes on click" },
];

const EMPTY: Modifiers = { mermaid: false, svgStatic: false, swimlanes: false, collapse: false, annotate: false };

export default function Home() {
  const [text, setText] = useState("");
  const [mods, setMods] = useState<Modifiers>(EMPTY);
  const [forge, setForge] = useState<Forge>(SAMPLE_FORGE);
  const [isDemo, setIsDemo] = useState(true);
  const [audit, setAudit] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [corrections, setCorrections] = useState("");
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [engine, setEngine] = useState<"paste" | "key">("paste");
  const [reply, setReply] = useState("");
  const [promptCopied, setPromptCopied] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-5-5");
  const [remember, setRemember] = useState(false);
  const [correctionSent, setCorrectionSent] = useState(false);

  useEffect(() => {
    try {
      const k = localStorage.getItem("forkcast:key");
      const m = localStorage.getItem("forkcast:model");
      const e = localStorage.getItem("forkcast:engine");
      if (k) (setApiKey(k), setRemember(true));
      if (m) setModel(m);
      if (e === "key" || e === "paste") setEngine(e);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("forkcast:engine", engine);
      localStorage.setItem("forkcast:model", model);
      if (remember && apiKey) localStorage.setItem("forkcast:key", apiKey);
      else localStorage.removeItem("forkcast:key");
    } catch {}
  }, [engine, model, remember, apiKey]);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastInput = useRef<{ text: string; flags: string[] }>({ text: "", flags: [] });

  const mermaid = useMemo(() => toMermaid(forge), [forge]);
  const pr = forge.parseReport;

  function accept(r: ForgeResult & { truncated?: boolean }, corrected: boolean) {
    setForge(r.forge);
    setIsDemo(false);
    setAudit([...r.audit, ...(r.truncated ? ["Response hit the token limit; the graph may be incomplete."] : [])]);
    const needs = !corrected && ((r.forge.parseReport?.flags?.length ?? 0) >= 3 || r.forge.parseReport?.confidence === "low");
    setAwaitingConfirm(needs);
    setCorrections("");
  }

  async function run(input: string, flags: string[], corr?: string) {
    if (!apiKey.trim()) return setError("Add your Anthropic API key first, or switch to “Paste from Claude”.");
    setLoading(true);
    setError(null);
    try {
      accept(await forgeWithKey({ apiKey, model, text: input, flags, corrections: corr }), !!corr);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function readInput() {
    // Accept bare modifiers typed into the text, per the message template.
    const typed = MODS.filter((m) => new RegExp(`(^|\\s)${m.flag}(\\s|$)`).test(text));
    const next = { ...mods };
    typed.forEach((m) => (next[m.key] = true));
    setMods(next);
    const clean = MODS.reduce((t, m) => t.replace(new RegExp(`(^|\\s)${m.flag}(?=\\s|$)`, "g"), " "), text).trim();
    const flags = MODS.filter((m) => next[m.key]).map((m) => m.flag);
    lastInput.current = { text: clean, flags };
    return { clean, flags };
  }

  async function copyText(t: string, tag: string) {
    try {
      await navigator.clipboard.writeText(t);
      setPromptCopied(tag);
      setTimeout(() => setPromptCopied(null), 2500);
    } catch {
      setError("Clipboard blocked by the browser. Select and copy manually.");
    }
  }

  function copyPrompt() {
    const { clean, flags } = readInput();
    setError(null);
    copyText(buildPastePrompt(clean, flags), "prompt");
  }

  function renderReply() {
    setError(null);
    try {
      accept(extractForge(reply), correctionSent);
      setCorrectionSent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function forgeIt() {
    const { clean, flags } = readInput();
    run(clean, flags);
  }

  function downloadSvg() {
    if (!svgRef.current) return;
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svgRef.current.outerHTML}`], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(forge.title || "forkcast").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyMermaid() {
    await navigator.clipboard.writeText(mermaid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main>
      <header className="masthead">
        <div className="wordmark">
          FORKCAST<span className="cursor">_</span>
        </div>
        <div className="tagline">Every fork in your decision, mapped. Paste prose — get a decision-grade flowchart.</div>
      </header>

      <div className="grid">
        <section className="panel input">
          <label className="kicker" htmlFor="src">
            01 · SOURCE TEXT
          </label>
          <textarea
            id="src"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Paste a decision, a process, or a full SOP.\n\ne.g. “decide whether to renew the vendor contract”"}
            spellCheck={false}
          />
          <div className="kicker">02 · MODIFIERS</div>
          <div className="mods">
            {MODS.map((m) => (
              <button
                key={m.key}
                className={`mod ${mods[m.key] ? "on" : ""}`}
                title={m.hint}
                onClick={() => setMods({ ...mods, [m.key]: !mods[m.key] })}
              >
                {m.flag}
              </button>
            ))}
          </div>
          <div className="kicker">03 · ENGINE</div>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={engine === "paste"} className={engine === "paste" ? "on" : ""} onClick={() => setEngine("paste")}>
              Paste from Claude <span className="free">FREE</span>
            </button>
            <button role="tab" aria-selected={engine === "key"} className={engine === "key" ? "on" : ""} onClick={() => setEngine("key")}>
              My API key
            </button>
          </div>

          {engine === "paste" ? (
            <div className="engine">
              <ol className="steps">
                <li>
                  <button className="primary" disabled={!text.trim()} onClick={copyPrompt}>
                    {promptCopied === "prompt" ? "Prompt copied ✓" : "Copy prompt"}
                  </button>
                </li>
                <li>
                  Paste it into a new chat at{" "}
                  <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
                    claude.ai ↗
                  </a>
                  . The free plan works too.
                </li>
                <li>
                  Copy Claude&apos;s whole reply and paste it here:
                  <textarea
                    className="reply"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={"```json\n{ \"title\": … }\n```"}
                    spellCheck={false}
                  />
                  <div className="actions">
                    <button className="primary" disabled={!reply.trim()} onClick={() => renderReply()}>
                      Render flowchart →
                    </button>
                    <button className="ghost" onClick={() => setText(SAMPLE_TEXT)}>
                      Load sample
                    </button>
                  </div>
                </li>
              </ol>
            </div>
          ) : (
            <div className="engine">
              <label className="field">
                <span>Anthropic API key</span>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
              </label>
              <label className="field">
                <span>Model</span>
                <input value={model} onChange={(e) => setModel(e.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember key in this browser
              </label>
              <div className="actions">
                <button className="primary" disabled={loading || !text.trim()} onClick={forgeIt}>
                  {loading ? "Forging…" : "Forge the flowchart →"}
                </button>
                <button className="ghost" onClick={() => setText(SAMPLE_TEXT)}>
                  Load sample
                </button>
              </div>
              <p className="fine">Your key goes straight from this browser to api.anthropic.com. Forkcast has no server that sees it.</p>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          <p className="fine">
            Fidelity before beauty: gaps become dashed <em>UNSTATED</em> paths, never silent inventions. Anything derived is marked ✎ and
            explained in the Ledger.
          </p>
        </section>

        <section className="panel output">
          {isDemo && <div className="demo-ribbon">DEMO — rendered from the sample text. Paste your own to forge a new one.</div>}

          <div className="report">
            <div className="kicker">PARSE REPORT</div>
            <dl>
              <dt>Input type</dt>
              <dd>{pr?.inputType}</dd>
              <dt>Actors</dt>
              <dd>{pr?.actors?.map((a) => a.name + (a.implied ? " (implied)" : "")).join(" · ") || "—"}</dd>
              <dt>Decisions</dt>
              <dd>
                {pr?.decisionCount} branch points vs. {pr?.stepCount} sequential steps
              </dd>
              <dt>Confidence</dt>
              <dd>
                <strong>{pr?.confidence}</strong> — {pr?.confidenceReason}
              </dd>
            </dl>
            {pr?.note && <p className="note">{pr.note}</p>}
            {pr?.flags?.length ? (
              <ol className="flags">
                {pr.flags.map((f, i) => (
                  <li key={i}>
                    <span className="code">{f.code}</span> {f.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="note">No ambiguity flags.</p>
            )}
          </div>

          {awaitingConfirm ? (
            <div className="confirm">
              <div className="kicker">CONFIRM BEFORE RENDERING</div>
              <p>
                {pr.flags.length} ambiguity flags{pr.confidence === "low" ? " and low confidence" : ""}. Confirm the reading above, or
                correct it — e.g. “the CFO signs”, “after 3 failed rounds, walk away”.
              </p>
              <textarea value={corrections} onChange={(e) => setCorrections(e.target.value)} placeholder="Corrections (optional)" />
              <div className="actions">
                {corrections.trim() && engine === "paste" ? (
                  <button className="primary" onClick={() => (copyText(buildCorrectionPrompt(corrections), "corr"), setCorrectionSent(true), setReply(""))}>
                    {promptCopied === "corr" ? "Copied ✓ Send it in the same chat" : "Copy correction message"}
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={loading}
                    onClick={() =>
                      corrections.trim() ? run(lastInput.current.text, lastInput.current.flags, corrections) : setAwaitingConfirm(false)
                    }
                  >
                    {loading ? "Re-forging…" : corrections.trim() ? "Apply corrections & render" : "Confirm & render"}
                  </button>
                )}
              </div>
              {corrections.trim() && engine === "paste" && (
                <p className="fine">
                  Send that message in the same Claude chat, paste the new reply into step 3, and click Render. The corrected chart opens
                  without asking again.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="toolbar">
                <div className="kicker">DIAGRAM · INK &amp; SIGNAL</div>
                <div className="tools">
                  {[0.5, 0.75, 1].map((z) => (
                    <button key={z} className={`ghost sm ${zoom === z ? "on" : ""}`} onClick={() => setZoom(z)}>
                      {z * 100}%
                    </button>
                  ))}
                  <button className="ghost sm" onClick={downloadSvg}>
                    Export SVG
                  </button>
                  <button className="ghost sm" onClick={copyMermaid}>
                    {copied ? "Copied ✓" : "Copy Mermaid"}
                  </button>
                </div>
              </div>
              <div className="canvas">
                <Diagram
                  ref={svgRef}
                  forge={forge}
                  forceLanes={mods.swimlanes}
                  annotate={mods.annotate}
                  staticMode={mods.svgStatic}
                  zoom={zoom}
                />
              </div>
              {audit.length > 0 && (
                <ul className="audit">
                  {audit.map((a, i) => (
                    <li key={i}>⚠ Quality bar: {a}</li>
                  ))}
                </ul>
              )}

              {mods.mermaid && (
                <div className="mermaid-out">
                  <div className="kicker">MERMAID</div>
                  <pre>{mermaid}</pre>
                </div>
              )}

              <div className="ledger">
                <div className="kicker">ASSUMPTION LEDGER</div>
                <table>
                  <thead>
                    <tr>
                      <th>Added by me</th>
                      <th>Why / based on what</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forge.ledger?.length ? (
                      forge.ledger.map((l, i) => (
                        <tr key={i}>
                          <td>{l.added}</td>
                          <td>{l.why}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2}>Nothing added — chart is a literal parse.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {forge.challenge && (
                <div className="challenge">
                  <span className="kicker">THE OPEN QUESTION</span>
                  <p>{forge.challenge}</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <footer>Forkcast · Decision-Forge engine · Ink &amp; Signal design language</footer>
    </main>
  );
}
