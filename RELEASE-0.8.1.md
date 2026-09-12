# AI Use-Case Workshop 0.8.1

Release date: 12 September 2026

## What changed

Version 0.8.1 uses one visual system across the inline connector view, saved workbook reader and generated PDF. Current or person-led work uses neutral panels, AI activity uses teal, human checks and decisions use amber, and confirmed work uses green. The active surfaces use the same spacing, four-pixel card radius, typography roles and flat treatment. The unused legacy widget stylesheet was removed so it cannot reintroduce the earlier beige and terracotta styling.

The final workbook retains every identified use case, including cases that the group decides not to pilot. It shows the original problem, the underlying problem agreed by the group, how AI could help, the current and proposed workflows, the person who checks or decides, and the proposed implementation components. The completed view opens the workbook and makes Download PDF the primary action.

Question ownership remains with the host conversation. Claude may use its native question cards. ChatGPT and any host without that capability use the same single question in ordinary chat. The read-only MCP view does not ask or save answers.

## Release identity

- Reviewed source commit: `767cf9239c6d17041289ba466af54461460635c6`
- Connector and plugin version: `0.8.1`
- Built widget SHA-256: `70de41e37a266432fa268303bb6123edb29d768fb60866416c4627f09943c0dd`
- Cloudflare Worker: `ai-use-case-workshop`
- Endpoint: `https://ai-use-case-workshop.shiva-research11.workers.dev/mcp`
- Deployed Cloudflare version: `e1a0d0b8-9e2e-441f-b743-5553c729ffa8`
- Deployment time reported by Wrangler: `2026-09-12T06:58:35.855Z`

The deployment command retained the existing Cloudflare bindings and explicitly enabled the workshop, public connector access and workshop writes. No database migration or retention change was required.

## Local verification

The checks below ran from the clean reviewed source commit.

- `npm test`: 261 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; the self-contained widget is 932,620 bytes.
- The controlled browser journey passed at widths 1180, 600 and 320 pixels in light and dark modes. It covered all six steps, the completed state, full wrapping and the final workbook opening with Download PDF.
- The visual-system regression verifies the shared palette and card treatment across the connector, saved reader, local PDF renderer, Cloudflare PDF renderer and plugin metadata. It also rejects the retired colours and a restored legacy stylesheet.

## Live connector verification

The full live SDK journey used fictional data and the deployed endpoint. It completed and approved all six steps, saved explicit workflow mappings, rejected an invalid duplicate mapping, retained immutable history, resumed through a fresh client, downloaded the final PDF and JSON, and deleted only its own fictional record. All 17 checks passed.

Live example files:

- PDF SHA-256: `a1f10105ca63ec64aef506127ccfa7ce57bb6c859032836be1b9caa005992e96`
- JSON SHA-256: `0ced0bdaf74a89cf518fd931f26af732845762e3524ecd6d096906d512c0c3d7`

The live PDF has 21 tagged A4 pages, selectable text and no PDF syntax or stream errors. Author-profile links are present on every page. The cover, problem-and-use-cases page, workflow comparison pages and final page were rendered to images and inspected. No clipping, overlap, truncated text, broken glyph or accidental blank page was found. The last page keeps the human check, output and proposed components together.

## Actual host verification

Claude started a new fictional workshop without asking for a date. It used native question cards, saved each selected answer, showed the Step 1 read-only visual, confirmed the step, generated its PDF checkpoint and advanced to Step 2. The inline view used the host background and typography while retaining the shared AI, human and confirmed-work semantics. The fictional Claude record and its history were deleted after the check.

ChatGPT initially used a cached start schema that still required a date. The installed development plugin was refreshed through its management screen. The refreshed schema required only the group name, members and problem; date remained optional. A fresh chat then started a fictional workbook without asking for or supplying a date and asked the first question through the ordinary-chat fallback. The fictional ChatGPT records were deleted after the checks.

Any ChatGPT installation that predates this release must be refreshed once after deployment so it receives the current tool descriptions and optional-date schema. The Cloudflare deployment alone cannot replace a host's cached tool catalogue.

## Persistence and recovery

Workbook records and revision history remain until explicit deletion. A reading link does not grant editing access. Temporary file tickets expire independently of the workbook. If a live problem occurs, set `WORKSHOP_WRITES_ENABLED=false` to pause changes while retaining reading and exports. Do not delete the D1 database or return to an incompatible stateless Worker.

## Proof boundaries

The six-phase live SDK journey proves the deployed protocol and generated files. The actual-host checks prove discovery, activation, question routing, saving and a confirmed Step 1 in Claude, plus refreshed activation and text fallback in ChatGPT. A complete six-phase model-led journey in each host and an external CI run were not performed in this release check.

Prepared by Dr. Shiva Kakkar. [Click here to access the author's profile](https://www.shivakakkar.com/).
