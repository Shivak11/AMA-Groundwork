# AI Use-Case Workshop

This package guides a group through six short conversations and generates `Our AI Use-Case Portfolio` after every approved phase. It supports local stdio and a deployed Cloudflare MCP connector for business and functional teams across industries. It keeps the teaching method from the six-phase workbook and gives the group a completed document instead of asking it to fill every box itself.

The group supplies its name, members' first names or aliases and one problem. It can speak or type using its chat client's capabilities. The server itself does not transcribe audio.

| Phase | Group activity | What enters the book |
| --- | --- | --- |
| 1. What should improve? | Complete an outcome statement. | Outcome, measure, baseline or unknown, safeguard and hypothesis. |
| 2. What prevents progress? | Sort missing information and authority barriers. | Holders, barriers and an initial practical change. |
| 3. What actually happens? | Replay a difficult case and test what would remain if a task took no time. | Work, hand-offs, friction and possible workflow changes. |
| 4. Where could AI help? | Keep, change or reject grounded candidate proposals. | AI work, human checks, assumptions and non-AI alternatives. |
| 5. Which should we pursue first? | Compare candidates and invite a dissenting member. | Priorities, reasons, missing evidence and recurring effort. |
| 6. What do we recommend? | Agree a test or a reason not to pilot yet. | Proposed owner, changes to work, evidence and a stop rule. |

Groups approve and continue themselves. Unknowns remain visible. Suggested pacing is two or three focused exchanges per phase, adjusted to the group; this has not yet been timed with a classroom cohort.

## What is ready locally

The package includes a portable skill, MCP tools and resources, strict phase rules, cumulative A4 PDF rendering, the shared Terracotta design contract and a fictional example. The optional Prefab evaluation covers one complete shortlist activity. The entire workshop also works through text, including edits, approval, manual backup restore and PDF generation. No separate browser app is required as a fallback.

The skill manifest does not silently install or configure an MCP connection. A host can load the skill as a plugin, or obtain the method from the server's prompt and resources. Start and continuation tools also return phase instructions, so the implementation does not assume identical SKILL.md loading in each client.

## Run locally

Requires Node 22 or later. Install the exact locked Node dependencies and Chromium:

```sh
npm ci
npx playwright install chromium
npm run build
```

Prefab is optional for the conversation and PDF tools. For the real comparison view, create a project-local Python environment and install the exact tested package set:

```sh
python3 -m venv .venv
.venv/bin/pip install -r prefab/requirements.txt
.venv/bin/prefab version
```

The evaluated Prefab version is 0.20.2. Its installed API and renderer are used together. Do not update the Python package without rechecking its JSON envelope and the complete comparison journey. The toolkit is still pre-1.0; its [official installation guide](https://prefab.prefect.io/docs/getting-started/installation) recommends exact version pins.

Print the local MCP configuration for this actual installation path:

```sh
node scripts/connector-config.mjs
```

Add the returned configuration only to a client that supports local stdio servers. No settings are modified by this command. Start directly with `npm start` when using a compatible MCP development client. There must be no non-protocol output on stdout.

Generate an example or export a group-supplied checkpoint:

```sh
npm run examples
node src/cli.mjs output/phase-6.json group-portfolio.pdf
```

The CLI refuses to overwrite an existing output. Normal PDF generation takes place on the server. An HTML preview is not passed off as a generated PDF.

## ChatGPT and Claude delivery boundary

The public connector is available at https://ai-use-case-workshop.shiva-research11.workers.dev/mcp. Codex registration and a real first-turn model/tool call passed. ChatGPT is connected on the user-selected ailabs2 Free account, with Developer mode and CSP enforcement enabled. Its actual embedded checkpoint view, phase-1 draft, explicit confirmation and returned PDF/JSON attachments have been verified. Claude Code reports Connected, but its model login has expired. Claude Desktop's configured bridge passed an independent SDK test; loading and using it in the Desktop UI remain unverified. No complete ChatGPT or Claude six-phase conversation is claimed. See [the release verification](remote/verification.md) and [actual ChatGPT observations](remote/chatgpt-verification.md).

The approved Cloudflare deployment provides HTTPS transport, server-generated PDFs and request limits, with public access. It does not provide OAuth or durable group storage. Downloadable JSON remains the manual recovery mechanism; automatic cross-client resumption is not implemented. The existing consultant connector and Hyundai workbook are unchanged.

## Progress and recovery

Every tool returns the complete record and a JSON backup. Save means a new record was returned; it does not mean an account database was updated. Download the backup after each phase. If the conversation is lost, a group can explicitly supply its checkpoint to `resume_workshop`. This is manual restore, not seamless cross-client resumption.

Use one conversation and the latest record per group. Conflicting copies are not merged automatically. A visual edit includes its originating revision; the host must reconfirm a stale request before applying it. Earlier corrections retain later answers and mark dependent chapters for review.

Confirmation produces an actual PDF before the approved record is returned. If rendering fails, keep the draft and retry. A generated PDF and a successful download are separate outcomes: embedded file resources and optional host-mediated downloads depend on the host's file support. If delivery is denied or unsupported, report that limitation and offer re-export; never invent a public download link.

In the verified ChatGPT account, normal chat links and ChatGPT's file controls delivered both the PDF and JSON. The embedded PDF download button failed. If that happens, ask: "Give me clickable download links to the existing workbook PDF and JSON checkpoint." Use the standard chat file controls; this fallback does not require approving another phase.

## Files and verification

- `skills/ai-use-case-workshop/` contains the operating skill, short references, `assets/DESIGN.md`, CSS and licensed font.
- `src/workshop.mjs` owns phase rules. Both conversation and views use these rules.
- `src/server-core.mjs` defines shared prompts, resources and tools. `src/server.mjs` supplies local adapters; `remote/worker.mjs` supplies Cloudflare adapters. Remote calls send the supplied group answers to Cloudflare for processing and PDF rendering without creating an application group database.
- `prefab/` contains the single-exercise adapter and developer-authored components.
- `examples/` contains fictional group data; it must never be substituted for a real group's answers.
- `verification.md` separates state, protocol, PDF and UI evidence from untested client delivery.

Run `npm test` for state and protocol checks, `node scripts/verify-stdio.mjs` for an actual server-generated PDF, and the visual verification scripts listed in the verification record. Browser execution may need the local operating system's normal permissions.

Prepared by Dr. Shiva Kakkar. [Click here to access the author's profile](https://www.shivakakkar.com/).
