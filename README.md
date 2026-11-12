# Forkcast

**Every fork in your decision, mapped.**

Paste any written decision, from a one-line executive choice to a multi-page SOP. Forkcast turns it into a decision-grade flowchart that shows every gate, actor, loop, dead end and gap. It runs on the **Decision-Forge** engine and draws with the **Ink & Signal** design language.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsnj3vpaul%2FForkCast&env=ANTHROPIC_API_KEY&envDescription=Anthropic%20API%20key%20used%20by%20the%20Decision-Forge%20engine&project-name=forkcast)

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

## How it works

```
prose ──► /api/forge ──► Claude (Decision-Forge system prompt + forced tool call)
                           └─► typed logic graph (nodes, edges, flags, ledger)
                                 └─► lib/validate.ts  (§7 quality bar: dead ends, unlabelled gates, loop exits)
                                       └─► lib/layout.ts (spine/lateral layout, lanes, loops, Judgment Line)
                                             └─► components/Diagram.tsx (Ink & Signal SVG)
```

The model handles the *logic*. Forkcast's own renderer handles the *look*, so every chart follows the same design language instead of the model's default styling.

- System prompt: [`prompts/decision-forge.md`](prompts/decision-forge.md)
- Output contract and JSON schema: [`lib/schema.ts`](lib/schema.ts)

## Run locally

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev
```

On first load the page shows a pre-rendered demo, so you can see the design without making an API call.

## Deploy on Vercel

1. Import this repo at [vercel.com/new](https://vercel.com/new), or use the button above.
2. Add the environment variable `ANTHROPIC_API_KEY`. `ANTHROPIC_MODEL` is optional and defaults to `claude-sonnet-5-5`.
3. Deploy. The API route runs on the Node runtime with `maxDuration = 120`.

## Stack

Next.js 15 (App Router) · TypeScript · `@anthropic-ai/sdk` · no UI framework (the SVG is hand-built).
