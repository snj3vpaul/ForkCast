# Forkcast

**Every fork in your decision, mapped.**

Paste any written decision, from a one-line executive choice to a multi-page SOP. Forkcast turns it into a decision-grade flowchart that shows every gate, actor, loop, dead end and gap. It runs on the **Decision-Forge** engine and draws with the **Ink & Signal** design language.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsnj3vpaul%2FForkCast&project-name=forkcast)

**No server secrets and no running costs.** Forkcast has no backend, and the owner never pays for anyone's model usage.

## What you get

| Output | What it is |
|---|---|
| **Parse Report** | The input type, the actors (stated and implied), how many steps are real decisions, ambiguity flags A1–A10 and a confidence rating. With ≥ 3 flags or low confidence, it asks you to confirm before it renders. |
| **Diagram** | An interactive SVG. Hover a node to see its source quote. Click a gate to light up every outcome it can reach. |
| **Assumption Ledger** | Everything the engine inferred, sequenced or bounded, with the reason for each. Nothing is edited in silently. |
| **The Open Question** | The one question the flow raises that the source text doesn't answer. |

### Ink & Signal

- **Vertical spine, lateral consequence.** The happy path runs straight down. The further right a node sits, the more abnormal the situation.
- **Swimlanes** appear when there are 2 or more actors. Hand-offs show a `⇢` glyph where they cross between lanes.
- **Gates** are slim rhombi. The condition question sits *outside* the shape.
- **Commit points** (irreversible actions) get a double border and a padlock.
- **UNSTATED paths** are dashed and hollow. Missing fallbacks end in a red `⚠ undefined in source` capsule.
- **The Judgment Line** is a numbered rail beside the spine that ticks off every gate on the happy path.
- Terminators show meaning through fill weight, not colour, so charts still read in greyscale.

### Modifiers

Toggle these in the UI, or type them into the text:
`--mermaid` · `--svg-static` · `--swimlanes` · `--collapse` · `--annotate`

Every chart can also be exported as **SVG** or copied as **Mermaid**, with the Ink & Signal styling carried over as classDefs.

## Engines: who runs the model?

| Engine | Cost to you | How it works |
|---|---|---|
| **Paste from Claude** (default) | Free | Forkcast builds the full Decision-Forge prompt with your text. You paste it into a chat at claude.ai (the free plan works), then paste Claude's JSON reply back. Forkcast validates it and draws the chart. |
| **My API key** (optional) | The user's own key | The browser calls `api.anthropic.com` directly using the visitor's key. The key can be saved in localStorage if the visitor chooses. It never reaches a Forkcast server, because there isn't one. |

## How it works

```
prose ──► Decision-Forge prompt (lib/prompt.ts + lib/schema.ts)
            ├─ paste mode: user's Claude chat ──► JSON reply ──► lib/engine.ts extractForge()
            └─ key mode:   browser ──► api.anthropic.com (forced tool call)
                 └─► lib/validate.ts  (§7 quality bar: dead ends, unlabelled gates, loop exits)
                       └─► lib/layout.ts (spine/lateral layout, lanes, loops, Judgment Line)
                             └─► components/Diagram.tsx (Ink & Signal SVG)
```

The model handles the *logic*. Forkcast's own renderer handles the *look*, so every chart follows the same design language instead of the model's default styling.

- System prompt (verbatim): [`lib/prompt.ts`](lib/prompt.ts)
- Output contract and JSON schema: [`lib/schema.ts`](lib/schema.ts)

## Run locally

```bash
npm install
npm run dev
```

On first load the page shows a pre-rendered demo. No environment variables are needed.

## Deploy on Vercel

Import the repo at [vercel.com/new](https://vercel.com/new) and click **Deploy**. There's nothing to configure. If you added `ANTHROPIC_API_KEY` earlier, you can delete it; it's no longer used.

## Stack

Next.js 15 (App Router, fully static) · TypeScript · no backend, no SDK, no UI framework (the SVG is hand-built).
