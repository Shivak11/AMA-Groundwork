# AI Use-Case Workshop

Version 0.2.0 is a local review candidate. It rebuilds the connector around conversation, specific visual decisions and a cumulative illustrated workbook. The installed/live version is unchanged. See VISUAL-REBUILD-PLAN.md for scope and verification.md for evidence.

## Participant journey

| Step | Interaction | Book chapter |
| --- | --- | --- |
| 1 | Refine one goal and its success measure (KPI); choose Unknown when appropriate. | Goal, measure and safeguard diagram. |
| 2 | Classify actual information or authority barriers. | What is needed, who holds it and what could change. |
| 3 | Reorder recorded tasks and select a zero-second counterfactual. | Workflow and what would still constrain it. |
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
npm run build
npm test
npm run build:remote
```

The last command packages the Cloudflare Worker with a dry run; it does not deploy it. The default Worker remains disabled/unconfigured unless explicitly activated later.

```sh
node scripts/verify-visual-pdfs.mjs
node scripts/verify-visual-journey.mjs
node scripts/verify-widget-recovery.mjs
node scripts/verify-visual-long.mjs
node scripts/connector-config.mjs
```

The PDF and journey checks use fictional hiring data in examples/hiring.mjs. They create output/visual-review/index.html, captured screens and six actual PDF checkpoints. The script needs local Chromium permission. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH may point to an already installed compatible browser.

The journey harness runs the actual in-memory MCP server and returned widget. It forwards real tools/call and model-context messages; the host and conversation answers are controlled test fixtures. It is not proof of Claude/ChatGPT installation, model behaviour, host download delivery or classroom usability.

## State and recovery

Every call carries and returns a complete validated record. workshop_action handles typed visual choices and equivalent chat choices. The app adopts the result, then shares the complete structured record with the host model before accepting further edits. A rejected context update blocks silent continuation and exposes retry/backup.

There is no participant database. Revision checks compare the action with its supplied record, not an authoritative server-held latest version. Use one conversation and the latest view per group; competing old widgets are not automatically merged. JSON remains a manual recovery mechanism.

A selected priority is separate from its previous reasoning. The group must reconcile it before confirmation. Reconsider also requires resolution. Earlier corrections retain downstream answers and mark dependent chapters for review. One eligible visual action can be undone; later saves or approvals invalidate that undo.

Confirmation validates and retains group approval, then attempts its PDF. A renderer failure returns the confirmed record with export.status=failed and no PDF; retry export_workbook without asking for approval again. Generated files and successful downloads are different outcomes. Use normal host file controls if an embedded download is declined.

## Presentation and delivery boundaries

Inline activities inherit host colours and typography. The book view and PDF use the shared Terracotta contract. Activity, Our book and Side by side are view choices inside the MCP App. Expand view is requested only if advertised. The host determines whether the app can remain beside the conversation or receive later tool updates.

All steps, corrections, approvals and PDF requests have text equivalents in the same conversation. A separate browser app is not required. No claim of pinned hot reload, automatic cross-client resumption or live replacement is made.

The canonical public endpoint remains https://ai-use-case-workshop.shiva-research11.workers.dev/mcp and still serves the previously approved version. Historical live/ChatGPT reports in remote/ describe that version, not this candidate. Production replacement requires review and explicit activation approval.

Prepared by Dr. Shiva Kakkar. [Click here to access the author's profile](https://www.shivakakkar.com/).
