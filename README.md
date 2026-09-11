# AI Use-Case Workshop

Version 0.3.0 implements the approved inline conversation interface using the real workshop record and tools. One question or visual decision is shown at a time, beside a growing workbook. See INLINE-LIVE-PLAN.md for scope. Deployment identity and actual remote evidence are recorded separately in the programme release record.

## Participant journey

| Step | Interaction | Book chapter |
| --- | --- | --- |
| 1 | Refine one goal and its success measure (KPI); choose Unknown when appropriate. | Goal, measure and safeguard diagram. |
| 2 | Classify actual information or authority barriers. | What is needed, who holds it and what could change. |
| 3 | Examine recorded tasks and select one for the zero-second thought experiment. Discuss sequence changes in chat. | Workflow and what would still constrain it. |
| 4 | Compare AI with the simpler alternative; Keep or Reconsider. | Task, AI work, human check and alternative. |
| 5 | Move candidates between First, Later and Do not pursue. | Priorities, reasons, unknowns, challenge and recurring effort. |
| 6 | Refine a bounded comparison or no-pilot recommendation. | Owner, evidence, test, human responsibility and stop rule. |

Group details and answers can come from conversation. Empty views ask for one missing item, not a full form. Completed wording remains editable. Groups approve their own step summaries and continue without an instructor release. Proposed use cases, unknown baselines and unaccepted responsibilities remain explicit.

## One connector

The HTML/SVG activity components, book template, licensed font and PDF generation are packaged together. Participants do not install another MCP, Python, Mermaid, tldraw or pdfcn. The old Prefab files remain as historical source but are not imported into the runtime or remote build. show_shortlist now uses the same standard activity.

pdfcn was evaluated as a component/design reference; it is not installed or integrated. The implementation keeps the existing self-contained HTML-to-PDF path. No external rendering service or licence purchase is required by the new code.

## Run and verify locally

Requires Node 22 or later and the locked dependencies:

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run build
npm test
npm run build:remote
```

The last command packages the Cloudflare Worker with a dry run; it does not deploy it. The default Worker remains disabled/unconfigured unless explicitly activated later.

```sh
node scripts/verify-inline-live.mjs
node scripts/verify-inline-remote.mjs
node scripts/connector-config.mjs
```

The journey checks use fictional hiring data in examples/hiring.mjs. The local inline harness writes output/inline-live with screenshots and results. Its PDF payload is a deliberate protocol stub. The separate remote check writes output/inline-remote with six actual Cloudflare PDF checkpoints and evidence. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH may point to an already installed compatible browser. Run the remote check only after deploying the exact built source to the authorised endpoint.

The journey harness runs the actual in-memory MCP server and returned widget. It forwards real tools/call and model-context messages; the host and conversation answers are controlled test fixtures. It is not proof of Claude/ChatGPT installation, model behaviour, host download delivery or classroom usability.

## State and recovery

Every call carries and returns a complete validated record. workshop_action handles typed visual choices and equivalent chat choices. The app adopts the result, then shares the complete structured record with the host model before accepting further edits. A rejected context update blocks silent continuation and exposes retry/backup.

There is no participant database. Revision checks compare the action with its supplied record, not an authoritative server-held latest version. Use one conversation and the latest view per group; competing old widgets are not automatically merged. JSON remains a manual recovery mechanism.

A selected priority is separate from its previous reasoning. The group must reconcile it before confirmation. Reconsider also requires resolution. Earlier corrections retain downstream answers and mark dependent chapters for review. One eligible visual action can be undone; later saves or approvals invalidate that undo.

present_workshop_question proposes up to four scalar answer choices without changing the record. A participant reviews and saves the wording through workshop_action. Structured cases, task lists and candidates are gathered in conversation. An unfinished local draft remains visible when a newer host answer arrives and can be cancelled without changing saved work.

Confirmation validates and retains group approval, then attempts its PDF. A renderer failure returns the confirmed record with export.status=failed and no PDF; retry export_workbook without asking for approval again. Generated files and successful downloads are different outcomes. Use normal host file controls if an embedded download is declined.

## Presentation and delivery boundaries

Inline activities inherit host colours and typography. The book preview and PDF use the shared Terracotta contract. Open workbook shows the cumulative document; there are no separate activity/book/layout navigation tabs. The host determines where the app appears and whether it receives later tool updates.

All steps, corrections, approvals and PDF requests have text equivalents in the same conversation. A separate browser app is not required. No claim of pinned hot reload, automatic cross-client resumption or live replacement is made.

The canonical public endpoint is https://ai-use-case-workshop.shiva-research11.workers.dev/mcp. Shiva authorised this interface replacement at the existing endpoint. Historical live/ChatGPT reports in remote/ describe older versions. Confirm the server version and widget hash against the latest release record; a source archive or local test alone is not proof of live deployment or Claude/ChatGPT rendering.

Prepared by Dr. Shiva Kakkar. [Click here to access the author's profile](https://www.shivakakkar.com/).
