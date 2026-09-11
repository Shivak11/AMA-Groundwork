# AI Use-Case Workshop

Version 0.6.0 adds private persistent workbook storage on Cloudflare D1. Workbooks and revision history have no automatic expiry; explicit group deletion is required. A short private reference resumes editing in another chat, and a separate stable reading link supports later feedback and downloads. It retains conversational questions, read-only visual cards, step-first hierarchy and ordinary-chat fallback. See PERSISTENT-RECOVERY-PLAN.md for the current contract. Source, deployed runtime and actual-host evidence remain separate.

## Participant journey

| Step | Interaction | Book chapter |
| --- | --- | --- |
| 1 | Refine one goal and its success measure (KPI); choose Unknown when appropriate. | Goal, measure and safeguard diagram. |
| 2 | Classify actual information or authority barriers. | What is needed, who holds it and what could change. |
| 3 | Examine recorded tasks and select one for the zero-second thought experiment. Discuss sequence changes in chat. | Workflow and what would still constrain it. |
| 4 | Compare AI with the simpler alternative; Keep or Reconsider. | Task, AI work, human check and alternative. |
| 5 | Move candidates between First, Later and Do not pursue. | Priorities, reasons, unknowns, challenge and recurring effort. |
| 6 | Refine a bounded comparison or no-pilot recommendation. | Owner, evidence, test, human responsibility and stop rule. |

Group details, answers and corrections come through conversation. The server returns the next missing question and skips saved fields. Groups approve their own step summaries without an instructor release. Views contain no answer forms or approval controls. Proposed use cases, unknown baselines and unaccepted responsibilities remain explicit.

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
node scripts/verify-chat-workbook.mjs
node scripts/verify-chat-workbook-remote.mjs
node scripts/connector-config.mjs
```

The journey checks use fictional hiring data in examples/hiring.mjs. The local harness writes output/chat-workbook with screenshots and results. Its PDF payload is a deliberate protocol stub. The separate remote check writes output/chat-workbook-remote with six actual Cloudflare PDF checkpoints and evidence. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH may point to an already installed compatible browser. Run the remote check only after deploying the exact built source to the authorised endpoint. Older verify-inline scripts document the retired form-based interface.

The journey harness runs the actual in-memory MCP server and returned widget. It checks that workbook controls never call record-changing tools or write model context. The host and conversation answers are controlled fixtures, not proof of Claude/ChatGPT model behaviour, host download delivery or classroom usability.

## State and recovery

The deployed connector carries a short private record reference; D1 owns the complete validated record. A two-call creation handshake prepares access before storing participant data. Revision checks and operation receipts protect against stale overwrites and lost-response retries. The app never saves answers, writes model context or restores an old record. workshop_action remains a compatibility route for specific conversational choices.

Workbooks, approvals and immutable snapshots remain until explicit deletion, including after three months. A write reference grants editing and deletion; a separate read-only link grants reading and exports. Credentials are stored only as hashes. No group listing or name search exists. Old widgets remain read-only. JSON import is explicit and creates a new workbook; it never overwrites a current one. Temporary file tickets expire after 15 minutes, independently of workbook retention. The stable reading page can generate new PDF/JSON links.

A selected priority is separate from its previous reasoning. The group must reconcile it before confirmation. Reconsider also requires resolution. Earlier corrections retain downstream answers and mark dependent chapters for review. One eligible visual action can be undone; later saves or approvals invalidate that undo.

present_workshop_question prepares up to four grounded scalar choices for the host's native question tool or plain chat, without changing the record. Structured cases, task lists and candidates are gathered conversationally. Partial saves preserve omitted fields; arrayEdits update one item without discarding siblings. Explicit list removal or replacement is separate. set_workshop_preference remembers an ordinary-chat choice without changing answers or approval.

questionTurn always assigns ownership to chat and specifies native-first questions with a plain-chat fallback. nextQuestion identifies the next missing answer or the explicit approval step. Legacy mode arguments remain accepted but cannot restore UI ownership. The connector cannot guarantee a host-native question tool exists or force a model to call it; those instructions and actual host compliance are separate evidence.

Confirmation validates and retains group approval, then attempts its PDF. A renderer failure returns the confirmed record with export.status=failed and no PDF; retry export_workbook without asking for approval again. Generated files and successful downloads are different outcomes. Use normal host file controls if an embedded download is declined.

## Presentation and delivery boundaries

Inline snapshots inherit host colours and typography. The book preview and PDF use the shared Terracotta contract. Open workbook shows the cumulative document. Only show_workbook, show_shortlist, confirm_workshop_phase and export_workbook advertise visual resources. Routine starts, questions and saves do not open more cards. The host determines where each snapshot appears and whether an existing card receives updates.

Routine results remain explicitly non-visual, so a host that reuses a previous visual resource does not show an empty workbook. Normal content carries the short reference and relevant step context; _meta.workbook carries the canonical visual record. Large visuals can fall back to the stable reading link. Manual checkpoint downloads remain available. Changed tool definitions require persistent installation refresh or reinstall; both hosts retained old definitions during the 11 September checks. A transient tool-list update is not proof of installation repair.

The full-record v0.5.2 server remains available only for explicit local compatibility. It is never an automatic fallback when persistent storage fails. The live Worker fails closed without its D1 binding. WORKSHOP_WRITES_ENABLED=false pauses mutations while retaining reads and exports; WORKSHOP_ENABLED=false stops the service. Never roll back to a stateless-only Worker without retaining a persistent reader or exporting the stored records.

All steps, corrections, approvals and PDF requests have text equivalents in the same conversation. A separate browser app is not required. The optional stable reader supports later delivery and exports. Cross-client resumption requires the group's private reference; it is not account/name-based recovery. No claim of pinned hot reload or live card replacement is made.

The canonical public endpoint is https://ai-use-case-workshop.shiva-research11.workers.dev/mcp. Shiva authorised this interface replacement at the existing endpoint. Historical live/ChatGPT reports in remote/ describe older versions. Confirm the server version and widget hash against the latest release record; a source archive or local test alone is not proof of live deployment or Claude/ChatGPT rendering.

Prepared by Dr. Shiva Kakkar. [Click here to access the author's profile](https://www.shivakakkar.com/).
