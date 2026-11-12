"use client";

import { forwardRef, useMemo, useState } from "react";
import type { Forge } from "@/lib/types";
import { layout, reachable, type PNode, type PEdge } from "@/lib/layout";

export const INK = "#1b1a17";
export const PAPER = "#f4efe6";
const PAPER2 = "#e9e0cf";
const GREY = "#8a857c";
const SIGNAL = "#c2410c";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SANS = "'Source Sans 3', 'Gill Sans', 'Segoe UI', sans-serif";

interface Props {
  forge: Forge;
  forceLanes: boolean;
  annotate: boolean;
  staticMode?: boolean;
  zoom: number;
}

const tagW = (s: string, px = 5.9) => s.length * px + 14;

export const Diagram = forwardRef<SVGSVGElement, Props>(function Diagram({ forge, forceLanes, annotate, staticMode = false, zoom }, ref) {
  const L = useMemo(() => layout(forge, forceLanes), [forge, forceLanes]);
  const [hover, setHover] = useState<{ n: PNode; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<PNode | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const lit = useMemo(() => (focus ? reachable(forge, focus) : null), [focus, forge]);

  const flagged = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const fl of forge.parseReport?.flags ?? [])
      for (const id of fl.nodeIds ?? []) m.set(id, [...(m.get(id) ?? []), fl.code]);
    return m;
  }, [forge]);
  const gateNo = new Map(L.ticks.filter((t) => t.onPath).map((t) => [t.id, t.n]));

  const legendY = L.height + 10;
  const H = legendY + 70;
  const W = Math.max(L.width, 980);
  const tip = pinned ? { n: pinned, x: pinned.x * zoom, y: (pinned.y - pinned.h / 2) * zoom } : hover;

  const dim = (id: string) => (lit && !lit.has(id) ? 0.14 : 1);
  const dimEdge = (e: PEdge) => (lit && !(lit.has(e.from) && lit.has(e.to)) ? 0.1 : 1);

  return (
    <div className="diagram-wrap" onClick={() => (setFocus(null), setPinned(null))}>
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={W * zoom}
        height={H * zoom}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
        role="img"
        aria-label={`Flowchart: ${forge.title}`}
      >
        <defs>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap');`}</style>
          <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.9" fill="#cbc1ae" />
          </pattern>
          {[
            ["ink", INK],
            ["grey", GREY],
            ["signal", SIGNAL],
          ].map(([id, c]) => (
            <marker key={id} id={`arr-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,1 L10,5 L0,9 z" fill={c} />
            </marker>
          ))}
        </defs>

        <rect width={W} height={H} fill={PAPER} />
        <rect width={W} height={H} fill="url(#dots)" />

        {/* Title block */}
        <g fontFamily={MONO} fill={INK}>
          <text x={28} y={40} fontSize={18} fontWeight={700} letterSpacing="0.02em">
            {forge.title?.toUpperCase()}
          </text>
          <text x={28} y={60} fontSize={10.5} fill={GREY} letterSpacing="0.12em">
            {forge.mode === "proposed"
              ? "PROPOSED FRAMEWORK — NOT PARSED FROM SOURCE"
              : forge.mode === "procedure"
                ? "0 DECISION POINTS — THIS IS A PROCEDURE, NOT A DECISION"
                : `PARSED · ${forge.parseReport?.decisionCount ?? 0} DECISIONS · ${forge.parseReport?.stepCount ?? 0} STEPS · CONFIDENCE ${(forge.parseReport?.confidence ?? "").toUpperCase()}`}
          </text>
        </g>

        {/* Swimlanes */}
        {L.lanes.length > 1 &&
          L.lanes.map((ln, i) => (
            <g key={ln.name}>
              {i > 0 && <line x1={ln.x} y1={96} x2={ln.x} y2={L.height} stroke={INK} strokeOpacity={0.35} strokeDasharray="2 5" />}
              <rect x={ln.x + 10} y={96} width={ln.w - 20} height={26} fill={i % 2 ? PAPER : PAPER2} stroke={INK} strokeWidth={1} />
              <text x={ln.x + 20} y={113} fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing="0.08em" fill={INK}>
                {String(i + 1).padStart(2, "0")} · {ln.name.toUpperCase()}
              </text>
            </g>
          ))}

        {/* Judgment Line */}
        <g>
          <text x={L.rail.x - 26} y={L.rail.y1 - 34} fontFamily={MONO} fontSize={9} letterSpacing="0.14em" fill={GREY}>
            JUDGMENT
          </text>
          <text x={L.rail.x - 26} y={L.rail.y1 - 22} fontFamily={MONO} fontSize={9} letterSpacing="0.14em" fill={GREY}>
            LINE · {L.rail.gates}
          </text>
          <line x1={L.rail.x} y1={L.rail.y1} x2={L.rail.x} y2={L.rail.y2} stroke={INK} strokeWidth={1} />
          <line x1={L.rail.x - 5} y1={L.rail.y1} x2={L.rail.x + 5} y2={L.rail.y1} stroke={INK} strokeWidth={1.4} />
          <line x1={L.rail.x - 5} y1={L.rail.y2} x2={L.rail.x + 5} y2={L.rail.y2} stroke={INK} strokeWidth={1.4} />
          {L.ticks.map((t) =>
            t.onPath ? (
              <g key={t.id}>
                <line x1={L.rail.x} y1={t.y} x2={L.rail.x + 16} y2={t.y} stroke={INK} strokeWidth={1.4} />
                <circle cx={L.rail.x} cy={t.y} r={8} fill={INK} />
                <text x={L.rail.x} y={t.y + 3.5} textAnchor="middle" fontFamily={MONO} fontSize={9} fontWeight={700} fill={PAPER}>
                  {t.n}
                </text>
              </g>
            ) : (
              <circle key={t.id} cx={L.rail.x} cy={t.y} r={3} fill={PAPER} stroke={GREY} />
            ),
          )}
        </g>

        {/* Phase brackets */}
        {L.phases.map((p) => (
          <g key={p.name}>
            <path d={`M${W - 34},${p.y1} h8 V${p.y2} h-8`} fill="none" stroke={INK} />
            <text transform={`translate(${W - 14},${(p.y1 + p.y2) / 2}) rotate(90)`} textAnchor="middle" fontFamily={MONO} fontSize={10} letterSpacing="0.12em" fill={INK}>
              {p.name.toUpperCase()}
            </text>
          </g>
        ))}

        {/* Edges */}
        {L.edges.map((e) => {
          const target = L.byId.get(e.to)!;
          const sig = target.kind === "end" && target.outcome === "undefined";
          const color = sig ? SIGNAL : e.dashed ? GREY : INK;
          const d = "M" + e.points.map((p) => p.join(",")).join(" L");
          const raw = [e.back ? "↻" : "", e.label ?? "", e.maxIterations ? `· max ${e.maxIterations}` : ""].filter(Boolean).join(" ");
          const w = tagW(raw);
          return (
            <g key={e.idx} opacity={dimEdge(e)}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={e.dashed ? 1 : e.back ? 1.2 : 1.4}
                strokeDasharray={e.dashed ? "5 4" : e.kind === "exception" ? "8 3 2 3" : undefined}
                markerEnd={`url(#arr-${sig ? "signal" : e.dashed ? "grey" : "ink"})`}
              />
              {e.kind === "parallel" && <path d={d} fill="none" stroke={PAPER} strokeWidth={0.6} transform="translate(2.2,0)" />}
              {e.handoff && (
                <g>
                  <circle cx={e.handoff[0]} cy={e.handoff[1]} r={9} fill={PAPER} stroke={INK} />
                  <text x={e.handoff[0]} y={e.handoff[1] + 4} textAnchor="middle" fontSize={11} fill={INK} fontFamily={SANS}>
                    ⇢
                  </text>
                </g>
              )}
              {raw && (
                <g>
                  <rect x={e.labelAt[0] - w / 2} y={e.labelAt[1] - 9} width={w} height={18} fill={PAPER} stroke={color} strokeWidth={0.7} rx={2} />
                  <text x={e.labelAt[0]} y={e.labelAt[1] + 4} textAnchor="middle" fontFamily={SANS} fontStyle="italic" fontSize={11.5} fill={color}>
                    {raw}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {L.nodes.map((n) => (
          <g
            key={n.id}
            opacity={dim(n.id)}
            style={{ cursor: staticMode ? "default" : n.kind === "gate" || n.kind === "contradiction" || annotate ? "pointer" : "default" }}
            onMouseMove={(ev) => {
              if (staticMode) return;
              const box = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setHover({ n, x: ev.clientX - box.left, y: ev.clientY - box.top });
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(ev) => {
              ev.stopPropagation();
              if (staticMode) return;
              if (n.kind === "gate" || n.kind === "contradiction" || n.kind === "split") setFocus(focus === n.id ? null : n.id);
              if (annotate) setPinned(pinned?.id === n.id ? null : n);
            }}
          >
            <NodeShape n={n} gateNo={gateNo.get(n.id)} />
            {n.inferred && (
              <text x={n.x + n.w / 2} y={n.y - n.h / 2 - 5} textAnchor="end" fontFamily={SANS} fontStyle="italic" fontSize={10.5} fill={GREY}>
                ✎ inferred
              </text>
            )}
            {flagged.get(n.id)?.map((code, i) => (
              <g key={code + i} transform={`translate(${n.x - n.w / 2 - 32},${n.y - n.h / 2 + i * 16})`}>
                <rect width={26} height={13} fill={PAPER} stroke={SIGNAL} strokeWidth={0.8} />
                <text x={13} y={9.8} textAnchor="middle" fontFamily={MONO} fontSize={8.5} fill={SIGNAL}>
                  {code}
                </text>
              </g>
            ))}
          </g>
        ))}

        {/* Legend */}
        <Legend y={legendY} />
      </svg>

      {tip && (tip.n.sourceQuote || tip.n.inferred || tip.n.actor || tip.n.question) && (
        <div className="tip" style={{ left: tip.x + 14, top: tip.y + 14 }} onClick={(e) => e.stopPropagation()}>
          <div className="tip-id">
            {tip.n.id}
            {tip.n.actor ? ` · ${tip.n.actor}` : ""}
          </div>
          {tip.n.question && <div className="tip-q">{tip.n.question}</div>}
          {tip.n.sourceQuote ? (
            <blockquote>“{tip.n.sourceQuote}”</blockquote>
          ) : (
            <div className="tip-none">No source sentence — derived by Decision-Forge.</div>
          )}
          {tip.n.inferred && <div className="tip-inf">✎ inferred — see Assumption Ledger</div>}
        </div>
      )}
    </div>
  );
});

function Label({ n, color = INK }: { n: PNode; color?: string }) {
  const y0 = n.y - ((n.lines.length - 1) * 16) / 2 + 4;
  return (
    <text textAnchor="middle" fontFamily={MONO} fontSize={12} fill={color}>
      {n.lines.map((line, i) => {
        if (i === 0 && (n.kind === "action" || n.kind === "commit" || n.kind === "unstated")) {
          const [verb, ...rest] = line.split(" ");
          return (
            <tspan key={i} x={n.x} y={y0 + i * 16}>
              <tspan fontWeight={700}>{verb.toUpperCase()}</tspan>
              {rest.length ? " " + rest.join(" ") : ""}
            </tspan>
          );
        }
        return (
          <tspan key={i} x={n.x} y={y0 + i * 16}>
            {line}
          </tspan>
        );
      })}
    </text>
  );
}

function Kicker({ x, y, text, color = GREY, anchor = "start" }: { x: number; y: number; text: string; color?: string; anchor?: "start" | "end" | "middle" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={8.5} letterSpacing="0.14em" fill={color}>
      {text}
    </text>
  );
}

function NodeShape({ n, gateNo }: { n: PNode; gateNo?: number }) {
  const x0 = n.x - n.w / 2;
  const y0 = n.y - n.h / 2;
  switch (n.kind) {
    case "start":
      return (
        <g>
          <Kicker x={n.x} y={y0 - 6} text="START" anchor="middle" />
          <rect x={x0} y={y0} width={n.w} height={n.h} rx={n.h / 2} fill={INK} />
          <Label n={n} color={PAPER} />
        </g>
      );
    case "end": {
      const und = n.outcome === "undefined";
      const pos = n.outcome === "positive";
      const neg = n.outcome === "negative";
      return (
        <g>
          <Kicker x={x0 + n.w + 8} y={n.y + 3} text={n.id.toUpperCase()} color={und ? SIGNAL : GREY} />
          <rect
            x={x0}
            y={y0}
            width={n.w}
            height={n.h}
            rx={n.h / 2}
            fill={pos ? INK : und ? "none" : PAPER}
            stroke={und ? SIGNAL : INK}
            strokeWidth={neg ? 3.2 : und ? 1.2 : 1.5}
            strokeDasharray={und ? "5 4" : undefined}
          />
          {neg && <rect x={x0 + 5} y={y0 + 5} width={n.w - 10} height={n.h - 10} rx={(n.h - 10) / 2} fill="none" stroke={INK} strokeWidth={0.6} />}
          <Label n={n} color={pos ? PAPER : und ? SIGNAL : INK} />
        </g>
      );
    }
    case "gate":
    case "contradiction": {
      const conflict = n.kind === "contradiction";
      const r = 22;
      const q = n.qLines.length ? n.qLines : [n.label];
      const tw = Math.max(...q.map((l) => l.length)) * 6.3 + 18;
      const th = q.length * 15 + 22;
      const tx = n.x - r - 14 - tw;
      const ty = n.y - th / 2;
      return (
        <g>
          <polygon
            points={`${n.x},${n.y - r} ${n.x + r},${n.y} ${n.x},${n.y + r} ${n.x - r},${n.y}`}
            fill={conflict ? PAPER : INK}
            stroke={conflict ? SIGNAL : INK}
            strokeWidth={conflict ? 1.6 : 1}
            strokeDasharray={conflict ? "4 3" : undefined}
          />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontFamily={MONO} fontSize={conflict ? 13 : 9.5} fontWeight={700} fill={conflict ? SIGNAL : PAPER}>
            {conflict ? "⚔" : gateNo ? `G${gateNo}` : "?"}
          </text>
          {/* condition question lives OUTSIDE the rhombus */}
          <line x1={tx + tw} y1={n.y} x2={n.x - r} y2={n.y} stroke={INK} strokeWidth={0.7} strokeDasharray="1 2" />
          <rect x={tx} y={ty} width={tw} height={th} fill={PAPER} stroke={conflict ? SIGNAL : INK} strokeWidth={0.8} />
          <text x={tx + 9} y={ty + 12} fontFamily={MONO} fontSize={8.5} letterSpacing="0.12em" fill={conflict ? SIGNAL : GREY}>
            {conflict ? "SOURCE CONFLICTS HERE" : n.label.toUpperCase().slice(0, Math.floor(tw / 6))}
          </text>
          <text fontFamily={SANS} fontSize={12.5} fill={INK}>
            {q.map((l, i) => (
              <tspan key={i} x={tx + 9} y={ty + 28 + i * 15}>
                {l}
              </tspan>
            ))}
          </text>
        </g>
      );
    }
    case "commit":
      return (
        <g>
          <Kicker x={x0} y={y0 - 6} text="COMMIT · IRREVERSIBLE" color={INK} />
          <rect x={x0} y={y0} width={n.w} height={n.h} rx={4} fill={PAPER2} stroke={INK} strokeWidth={2.6} />
          <rect x={x0 + 4} y={y0 + 4} width={n.w - 8} height={n.h - 8} rx={2} fill="none" stroke={INK} strokeWidth={1} />
          <Padlock x={x0 + n.w - 12} y={n.y - 2} />
          <Label n={n} />
        </g>
      );
    case "unstated":
      return (
        <g>
          <Kicker x={x0} y={y0 - 6} text="UNSTATED PATH" />
          <rect x={x0} y={y0} width={n.w} height={n.h} rx={6} fill="none" stroke={GREY} strokeWidth={1} strokeDasharray="5 4" />
          <Label n={n} color={GREY} />
        </g>
      );
    case "split":
    case "join":
      return (
        <g>
          <rect x={x0} y={y0} width={n.w} height={n.h} fill={INK} />
          <Kicker x={x0 + n.w + 8} y={n.y + 3} text={`${n.kind.toUpperCase()} ∥${n.label && n.label.toLowerCase() !== n.kind ? " " + n.label.toUpperCase() : ""}`} color={INK} />
        </g>
      );
    default:
      return (
        <g>
          <rect x={x0} y={y0} width={n.w} height={n.h} rx={6} fill={PAPER} stroke={INK} strokeWidth={1.5} />
          <Label n={n} />
        </g>
      );
  }
}

function Padlock({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 8},${y - 10}) scale(0.8)`}>
      <path d="M4,8 V5 a4,4 0 0 1 8,0 V8" fill="none" stroke={INK} strokeWidth={1.6} />
      <rect x={2} y={8} width={12} height={9} rx={1} fill={INK} />
    </g>
  );
}

function Legend({ y }: { y: number }) {
  const items: [string, React.ReactNode][] = [
    ["ACTION", <rect key="a" x={0} y={-8} width={26} height={16} rx={4} fill={PAPER} stroke={INK} strokeWidth={1.4} />],
    ["GATE", <polygon key="g" points="13,-9 22,0 13,9 4,0" fill={INK} />],
    [
      "COMMIT",
      <g key="c">
        <rect x={0} y={-8} width={26} height={16} rx={3} fill={PAPER2} stroke={INK} strokeWidth={2.4} />
        <rect x={3} y={-5} width={20} height={10} fill="none" stroke={INK} strokeWidth={0.8} />
      </g>,
    ],
    ["UNSTATED", <rect key="u" x={0} y={-8} width={26} height={16} rx={4} fill="none" stroke={GREY} strokeDasharray="4 3" />],
    ["OUTCOME ✓", <rect key="p" x={0} y={-8} width={26} height={16} rx={8} fill={INK} />],
    ["OUTCOME ✗", <rect key="n" x={0} y={-8} width={26} height={16} rx={8} fill={PAPER} stroke={INK} strokeWidth={3} />],
    ["UNDEFINED", <rect key="x" x={0} y={-8} width={26} height={16} rx={8} fill="none" stroke={SIGNAL} strokeDasharray="4 3" />],
  ];
  return (
    <g transform={`translate(28,${y + 26})`}>
      <line x1={0} y1={-22} x2={900} y2={-22} stroke={INK} strokeOpacity={0.25} />
      {items.map(([label, glyph], i) => (
        <g key={label} transform={`translate(${i * 128},0)`}>
          {glyph}
          <text x={34} y={3.5} fontFamily={MONO} fontSize={9} letterSpacing="0.1em" fill={INK}>
            {label}
          </text>
        </g>
      ))}
      <text x={0} y={30} fontFamily={SANS} fontStyle="italic" fontSize={11} fill={GREY}>
        Spine = happy path · distance right = abnormality · ↻ loop · ⇢ hand-off · ✎ inferred · A# ambiguity flag · click a gate to trace its outcomes
      </text>
    </g>
  );
}
