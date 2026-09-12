# Workshop usability revision 0.7.0

Approved scope: USABILITY-REVISION-PLAN.md. Live endpoint remains https://ai-use-case-workshop.shiva-research11.workers.dev/mcp. No new service, database, data permission or automatic expiry is introduced.

## Source and local proof

- Isolated branch: workshop-usability-20260912; base d7b70aa1becbee8052728ff8d0c659e44bd4738d.
- Full suite: 218 tests passed before final source commit. Typecheck and self-contained widget build passed.
- Controlled browser: 50 captures at desktop, 600 and 320 pixels in light/dark modes; six steps, full Unicode text, visible workflow diagrams, final auto-open, deliberate Close, stale replies, reordered historical metadata and duplicate notifications during PDF delivery checked. Evidence: output/usability-browser/evidence.json. Downloads in this harness are explicit PDF stubs, not rendered workbook proof. Widget: 906336 bytes, SHA-256 702ddeeb1d89e32bfcd29fae66fa93190e0e8c4beb720bb3e6036eb08695f498.
- Local rendered PDFs: recommendation-only, no-pilot, legacy and long-answer cases; A4, selectable text, links and selected dense pages inspected. Evidence: output/usability-workbook/pdf-evidence.json.
- New date-capture regression covers a lost activation reply retried across midnight and resumption three months later.
- Exact implementation head: d2df38a16322cf7cbd3e8ce953db79e0e1665e91. A fresh read-only verifier independently passed 27 focused tests and typechecking, and reproduced the widget bytes with an in-memory rebuild. It found no source blocker in the reviewed paths. The full suite was rerun successfully at this head by the implementing agent.
- A separate failure scout reproduced an out-of-order metadata notification that incorrectly reopened a historical workbook. The correction preserves the newest known revision; the scout reran the reproducer successfully after the fix. The controlled-browser suite also includes that sequence.

## Deployment and actual-host proof

Blocked before execution by the environment approval reviewer on 12 September 2026. No new Worker was deployed and no migration ran. The existing live connector remains version 0.6.1. The reviewer classified replacement of the public, write-enabled production Worker as requiring explicit approval. The next live action requires APPROVE SUPER-OUTER WORKSHOP-USABILITY-LIVE; do not use another deployment route to bypass the rejection.

Local tests do not establish live deployment or Claude/ChatGPT compliance. After approval, preserve the existing public access configuration and D1 binding, confirm the exact widget hash and server version, run the six-phase persistent SDK journey with real Cloudflare PDFs, then test real host conversations and downloads. Independent release verification remains UNPROVED for those live gates and operational recovery.

## Recovery

Current pre-release Worker: df35410f-bf22-40c9-a50e-a84d509daa7a, checked through Wrangler on 12 September 2026. It is not a safe rollback after a new experience-version-2 workbook is created because its strict validator does not recognise the additional fields. Keep the compatible reader and pause mutations with WORKSHOP_WRITES_ENABLED=false if containment is needed; apply a forward correction. Never delete or transform participant records during recovery.
