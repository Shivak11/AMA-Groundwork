# AMA-Groundwork 0.9.0

Release date: 14 September 2026

## What changed

Version 0.9.0 renames the participant-facing connector to `AMA-Groundwork` and the completed workbook to `AMA-Groundwork: AI Use-Case Portfolio`. The six-step use-case identification method, questions, saved answers, diagrams, recommendations and PDF content structure remain unchanged.

The new name appears across the current connector interface, workbook, PDF and documentation. Historical release files retain the names used when those versions were tested and deployed.

## Compatibility

The existing Cloudflare Worker and public endpoint remain unchanged:

- Worker: `ai-use-case-workshop`
- Endpoint: `https://ai-use-case-workshop.shiva-research11.workers.dev/mcp`

Existing Claude and ChatGPT installations can continue using this endpoint. Version 0.9.0 does not rename tool operations, skill and folder paths, saved record fields, D1 storage keys, resource URIs, private write references or stable reading links. It does not change public access, retention, deletion or migration behaviour.

The internal skill identifier remains `ai-use-case-workshop` because the published skill folder keeps that compatibility path. Package or repository labels may use `ama-groundwork` when they do not affect stored data or installed connector contracts.

## Verification required for the release

The release is complete only after the exact source revision passes these checks:

- Run the complete test suite, TypeScript check, widget build and Cloudflare Worker dry-run build.
- Generate a completed fictional workbook and confirm the AMA-Groundwork connector name, cover title and PDF filename.
- Verify A4 output, selectable text and working profile links.
- Render and inspect the cover, overview, one dense workflow comparison and the final page.
- Deploy the tested revision to the existing Worker and verify discovery, health, one fictional six-step journey and PDF export.
- Confirm that the live connector reports AMA-Groundwork while the endpoint remains unchanged.
- Push the verified source to the public `Shivak11/AMA-Groundwork` repository and confirm that its `main` branch points to the reviewed revision.

Source checks, deployment, connector installation, actual-host behaviour and successful PDF receipt are separate results. Record each result only after it is observed.

## Local verification completed

The 14 September 2026 candidate passed 262 source tests and the TypeScript check. The Cloudflare dry-run build completed with the existing D1, browser and rate-limit bindings; its bundle was 3,046.22 KiB before compression and 706.57 KiB after compression.

The completed fictional hiring exercise generated six cumulative PDF checkpoints. Its final AMA-Groundwork PDF is a 27-page A4 document with selectable text, tagged structure and the author-profile link on every page. The cover, problem overview, dense workflow comparison pages and final page were rendered and inspected. A separate long-answer check preserved the full text, escaped hostile markup, made no external requests and produced no horizontal overflow at widths of 320, 390, 768 and 1,280 pixels.

The clean-commit release check, public Cloudflare deployment, live six-step protocol check and public GitHub revision remain separate release gates until they are observed.

## Historical continuity

Release 0.8.1 established the shared visual system, grounded implementation proposal, full text wrapping, automatic completed-workbook opening and prominent PDF download. Release 0.6.0 established persistent D1 storage without automatic workbook expiry. Version 0.9.0 keeps those behaviours and changes the current public name.

Prepared by Dr. Shiva Kakkar. [Click here to access the author's profile](https://www.shivakakkar.com/).
