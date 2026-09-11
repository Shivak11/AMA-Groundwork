# ChatGPT connector verification

The following observations were made in the actual ChatGPT interface on 8 September 2026 and supplied by the orchestrator. The account displayed as `ailabs2` on the Free plan. The user authorised enabling Developer mode and Content Security Policy enforcement; both were enabled before the connector was added.

## Installed connection

The connector was registered with `https://ai-use-case-workshop.shiva-research11.workers.dev/mcp` and `No Auth`, then connected through the ChatGPT interface. Its app page reports `Connected` on 8 September 2026, lists all seven tools and two UI templates, and provides `Try in chat`.

| Field | Observed value |
| --- | --- |
| App ID | `asdk_app_6a9f80be50388191889cc0ba57a040ff` |
| Version ID | `asdk_app_v_6a9f80be5040819181e214923144a13b` |
| App page | `https://chatgpt.com/plugins/plugin_asdk_app_6a9f80be50388191889cc0ba57a040ff` |
| Authentication selection | `No Auth` |
| CSP enforcement | On |

This establishes installation and discovery in the actual ChatGPT account. The checkpoint view, first phase confirmation, PDF preview and normal ChatGPT file download have also completed as described below. The embedded PDF download button failed. Completion of all six phases, the Prefab template and installation in Claude remain separate checks. Classroom readiness is not established by this first-phase test.

## Conversation check

A fictional-group request was sent in the actual ChatGPT conversation at `https://chatgpt.com/c/6a9f812b-9778-83e8-a08f-1509979eaa43`. After one `Allow` action, ChatGPT called the tool and materialised `revision-0.json`.

The conversation rendered the actual embedded checkpoint view with `Our AI Use-Case Portfolio`, `Service Improvement Group`, record revision 0 and 0 of 6 phases confirmed. Its visible controls were `Download JSON checkpoint`, `Request current PDF and checkpoint`, and `Continue in the conversation`.

The model asked the group for a phase 1 outcome sentence. It did not invent a baseline or approval in this observed exchange.

The orchestrator then supplied a fictional outcome, KPI, explicitly unknown baseline, guardrail and hypothesis, asking for a draft only. The tool returned `revision-1.json`; the widget still showed 0 of 6 phases confirmed. The model displayed the supplied summary and requested explicit approval.

After the orchestrator explicitly approved that fictional summary and requested the PDF and JSON, one `Allow` action authorised two attachments. ChatGPT visibly materialised `revision-2.json` and `our-ai-use-case-portfolio-r2.pdf`. The returned widget showed revision 2 and 1 of 6 phases confirmed, with `Download workbook PDF` and `Download JSON checkpoint` controls. It also showed the phase 2 heading `What prevents progress?` and a question about missing information or authority.

These observations establish draft-before-approval behaviour, first-phase confirmation, visible PDF and JSON attachments, and progression to phase 2 in actual ChatGPT. ChatGPT then ran a separate export after confirmation, producing duplicate revision 2 PDF and JSON attachment tiles. The confirmation and separate export were each approved individually. No complete six-phase ChatGPT journey is claimed.

## File delivery

The orchestrator clicked the last visible `our-ai-use-case-portfolio-r2.pdf` attachment tile. No immediate PDF preview, new tab or matching saved file in Downloads was observed in that initial check.

Clicking the actual embedded `Download workbook PDF` button displayed this error:

> The download could not be completed through this view. Ask in the conversation: Export our current workbook PDF and JSON checkpoint.

The embedded download failed in that attempt. The cause of that specific failure has not been determined.

The orchestrator then requested ordinary clickable links to the existing files, without regenerating them. ChatGPT produced `Download revision-2 workbook PDF` and a JSON checkpoint link with standard file controls. The PDF opened in the actual ChatGPT Library modal and rendered both pages after loading. The orchestrator visually inspected the group members Asha, Kabir and Leena, 1 of 6 phases confirmed, and the supplied outcome, KPI, unknown baseline, guardrail and hypothesis.

Clicking `Download` in that modal produced an actual browser download event. The file was present at `/Users/shivakakkar/Downloads/our-ai-use-case-portfolio-r2.pdf`. This verifies normal ChatGPT PDF preview and file delivery through its clickable-link and Library route. It does not resolve the failed embedded button.

The PDF was then inspected from disk: 52,576 bytes, two tagged A4 pages, selectable text and no PDF JavaScript. Its SHA256 is `8ba7ba6a6e1df0ffc13ec5db500442528c4995be228de7bf4ece3f5f61aa8b3a`. The extracted text preserves the supplied answers and unknown baseline.

The standard ChatGPT `Download file` control for the JSON checkpoint also produced a browser download event. `/Users/shivakakkar/Downloads/revision-2.json` was present and parsed successfully: revision 2, phase 1 confirmed, phases 2–6 draft, with the explicitly unknown baseline intact. Its SHA256 is `c2d44d1ebce486b4b2c98cf9a0d57e0ff75752f91c33f31d35b161e79fe4d9c0`.

Copies of both downloaded files and this record are kept in the canonical live review's `chatgpt/` directory. These are actual ChatGPT-delivered files, separate from the six-phase harness checkpoints. The downloaded JSON was inspected but was not restored in a second ChatGPT conversation.

The separately completed live HTTP protocol-harness review establishes six returned PDF checkpoints and captured MCP Apps views. Its results remain separate from this ChatGPT conversation check.

## Metadata advisories

ChatGPT displayed the following validation advisories during registration:

- Output schemas are recommended for all tools.
- A widget domain is not set for either UI template.
- The Prefab template is reported as missing a declared Content Security Policy.

CSP enforcement remains on. The observed download failure has not been attributed to these metadata advisories. The connector was added to this account; no public app-directory submission or approval is claimed.
