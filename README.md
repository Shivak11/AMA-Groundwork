# AMA-Groundwork

AMA-Groundwork guides a group from one work problem to a set of grounded, prioritised AI use cases. Its completed workbook is titled `AMA-Groundwork: AI Use-Case Portfolio`.

Version 0.10.0 is the account-authentication candidate. It adds open email-and-password registration, MCP OAuth 2.1 with PKCE, account-owned workbooks and `list_my_workbooks` for recovery in a later chat. Passwords, browser sessions, authorisation codes and OAuth tokens are stored only as salted or one-way hashes in D1. Existing private workbooks can be claimed by a signed-in user who has the old private reference, and their old read-only links continue to work. See AUTHENTICATION-PLAN.md and RELEASE-0.10.0.md.

The current public endpoint still runs the verified 0.9.0 release without account authentication. The 0.10.0 source must pass its local checks and a separate Cloudflare preview before it can replace the current connector.

Version 0.9.0 introduces the AMA-Groundwork name across the connector and workbook. The existing Cloudflare Worker, endpoint, tool names, saved records, access references and retention rules remain unchanged so existing Claude and ChatGPT connector installations continue to work. See AMA-GROUNDWORK-RENAME-PLAN.md and RELEASE-0.9.0.md for the rename scope and verification boundary.

Version 0.8.1 uses one visual system across the connector, saved reader and PDF. It adds grounded use-case requirements and a proposed implementation, full wrapping text, named decision choices and automatic date capture. The completed workbook opens with Download PDF prominent and retains all identified cases even when implementation is deferred. It includes the original and agreed underlying problem, current and proposed workflow diagrams, and the technical proposal. See USABILITY-REVISION-PLAN.md and RELEASE-0.8.1.md for scope and proof.

Version 0.6.0 adds private persistent workbook storage on Cloudflare D1. Workbooks and revision history have no automatic expiry; explicit group deletion is required. A short private reference resumes editing in another chat, and a separate stable reading link supports later feedback and downloads. It retains conversational questions, read-only visual cards, step-first hierarchy and ordinary-chat fallback. See PERSISTENT-RECOVERY-PLAN.md for the current contract. Source, deployed runtime and actual-host evidence remain separate.

## Participant journey

| Step | Interaction | Book chapter |
| --- | --- | --- |
| 1 | Refine one goal and its success measure (KPI); choose Unknown when appropriate. | Goal, measure and safeguard diagram. |
| 2 | Classify actual information or authority barriers. | What is needed, who holds it and what could change. |
| 3 | Examine recorded tasks and select one for the zero-second thought experiment. Discuss sequence changes in chat. | Workflow and what would still constrain it. |
| 4 | Compare AI with the simpler alternative; Keep or Reconsider. | Task, AI work, human check and alternative. |
| 5 | Move candidates between First, Later and Do not pursue. | Priorities, reasons, unknowns, challenge and recurring effort. |
| 6 | Approve the recap and group recommendation. No additional pilot questionnaire. | All identified cases, recommendation and reading/download access. |

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
node scripts/verify-usability-browser.mjs
node scripts/verify-persistent-remote.mjs
node scripts/connector-config.mjs
```

The journey checks use fictional hiring data in examples/hiring.mjs. The local harness writes output/chat-workbook with screenshots and results. Its PDF payload is a deliberate protocol stub. The separate remote check writes output/chat-workbook-remote with six actual Cloudflare PDF checkpoints and evidence. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH may point to an already installed compatible browser. Run the remote check only after deploying the exact built source to the authorised endpoint. Older verify-inline scripts document the retired form-based interface.

The journey harness runs the actual in-memory MCP server and returned widget. It checks that workbook controls never call record-changing tools or write model context. The host and conversation answers are controlled fixtures, not proof of Claude/ChatGPT model behaviour, host download delivery or classroom usability.

## State and recovery

In the account-authentication candidate, an OAuth access token identifies the signed-in user before any MCP tool runs. New workbooks are attached to that account. `list_my_workbooks` returns concise group names, problems, progress and private account references so the user can select a workbook and reopen it with `resume_workshop`. A second account cannot read or change those references.

The server carries a short record reference; D1 owns the complete validated record. A two-call creation handshake prepares access before storing participant data. Revision checks and operation receipts protect against stale overwrites and lost-response retries. The app never saves answers, writes model context or restores an old record. workshop_action remains a compatibility route for specific conversational choices.

Workbooks, approvals and immutable snapshots remain until explicit deletion, including after three months. Signed-in users can list only their own workbooks. A private account reference grants editing inside that account; a separate read-only link grants reading and exports to anyone who has the link. Old widgets remain read-only. JSON import is explicit and creates a new workbook; it never overwrites a current one. Temporary file tickets expire after 15 minutes, independently of workbook retention. The stable reading page can generate new PDF/JSON links.

A selected priority is separate from its previous reasoning. The group must reconcile it before confirmation. Reconsider also requires resolution. Earlier corrections retain downstream answers and mark dependent chapters for review. One eligible visual action can be undone; later saves or approvals invalidate that undo.

present_workshop_question prepares up to four grounded scalar choices for the host's native question tool or plain chat, without changing the record. Structured cases, task lists and candidates are gathered conversationally. Partial saves preserve omitted fields; arrayEdits update one item without discarding siblings. Explicit list removal or replacement is separate. set_workshop_preference remembers an ordinary-chat choice without changing answers or approval.

questionTurn always assigns ownership to chat and specifies native-first questions with a plain-chat fallback. nextQuestion identifies the next missing answer or the explicit approval step. Legacy mode arguments remain accepted but cannot restore UI ownership. The connector cannot guarantee a host-native question tool exists or force a model to call it; those instructions and actual host compliance are separate evidence.

Confirmation validates and retains group approval, then attempts its PDF. A renderer failure returns the confirmed record with export.status=failed and no PDF; retry export_workbook without asking for approval again. Generated files and successful downloads are different outcomes. Use normal host file controls if an embedded download is declined.

## Presentation and delivery boundaries

Inline snapshots inherit host colours and typography. The inline views, saved reader and PDF share one component system: neutral for current or person-led work, teal for AI activity and amber for a human check or decision. Open workbook shows the cumulative document. Only show_workbook, show_shortlist, confirm_workshop_phase and export_workbook advertise visual resources. Routine starts, questions and saves do not open more cards. The host determines where each snapshot appears and whether an existing card receives updates.

Routine results remain explicitly non-visual, so a host that reuses a previous visual resource does not show an empty workbook. Normal content carries the short reference and relevant step context; _meta.workbook carries the canonical visual record. Large visuals can fall back to the stable reading link. Manual checkpoint downloads remain available. Changed tool definitions require persistent installation refresh or reinstall; both hosts retained old definitions during the 11 September checks. A transient tool-list update is not proof of installation repair.

The full-record server remains available only for explicit local compatibility. It is never an automatic fallback when persistent storage fails. The live Worker fails closed without its D1 binding. WORKSHOP_WRITES_ENABLED=false pauses mutations while retaining reads and exports; WORKSHOP_ENABLED=false stops the service. Version 0.6.1 cannot validate new experience-version-2 fields: after new workbooks exist, retain the compatible 0.7 reader during containment and apply a forward correction. Do not roll back to an incompatible or stateless-only Worker.

All steps, corrections, approvals and PDF requests have text equivalents in the same conversation. A separate browser app is not required. The optional stable reader supports later delivery and exports. Version 0.10.0 adds account-based cross-client recovery; the user selects a workbook by group name and problem, while the model uses its private account reference internally. No claim of pinned hot reload or live card replacement is made.

AMA-Groundwork retains the canonical public endpoint at https://ai-use-case-workshop.shiva-research11.workers.dev/mcp. The existing Worker and URL keep their earlier technical identity so installed connectors do not need to change. Historical live and ChatGPT reports in remote/ describe older versions under their original release names. Confirm the server version and widget hash against the latest release record; a source archive or local test alone is not proof of live deployment or Claude/ChatGPT rendering.

Prepared by Dr. Shiva Kakkar. [Click here to access the author's profile](https://www.shivakakkar.com/).
