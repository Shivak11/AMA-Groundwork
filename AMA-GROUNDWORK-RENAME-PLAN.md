# AMA-Groundwork public rename

Date: 14 September 2026

## Objective

Rename the public AI use-case identification connector and its participant-facing workbook to `AMA-Groundwork`, retain the existing public Cloudflare endpoint, and publish the verified source to the public `Shivak11/AMA-Groundwork` GitHub repository.

## Locked decisions

- The participant-facing connector name is `AMA-Groundwork`.
- The workbook title is `AMA-Groundwork: AI Use-Case Portfolio`.
- The final artifact remains an AI use-case portfolio, not a generic workshop report.
- The existing Worker name and endpoint remain unchanged so installed Claude and ChatGPT connectors continue to work.
- Tool names, saved record shapes, storage keys, resource URIs and migration history remain compatible.
- Access remains public. No authentication or retention rule changes are in scope.
- Historical release records keep their original names when they describe older releases. Current documentation will identify the rename and explain the stable endpoint.
- Package and server identity may change to `ama-groundwork` where this does not change persisted data or client tool names.

## Implementation ownership

- Orchestrator owns this plan, package metadata, Worker identity and compatibility checks, release documentation, Git commits, deployment and GitHub publication.
- Teaching and documentation worker owns `README.md`, `skills/ai-use-case-workshop/SKILL.md`, `skills/ai-use-case-workshop/references/host-contract.md`, `skills/ai-use-case-workshop/assets/DESIGN.md`, and the new release note.
- Interface and artifact worker owns `src/widget.mjs`, `src/inline-view.tsx`, `src/compact-visual.tsx`, `src/workbook-html.mjs`, `scripts/build-widget.mjs`, and participant-facing title assertions in directly related tests.
- Workers are not alone in the repository. They must inspect file modification times before writing, preserve any unexpected foreign version with a copy and `git diff` immediately, stop on a collision, and never revert another worker's changes.
- Shared integration files and all final reconciliation remain reserved for the orchestrator.

## Verification

1. Search current source for participant-facing uses of the old name and classify historical references separately.
2. Run the complete test suite, TypeScript check and production Worker dry-run build.
3. Generate a completed fictional workbook and verify title, filename, A4 output, selectable text and hyperlinks.
4. Render and inspect the cover, overview, one dense workflow page and final page.
5. Deploy the clean tested commit to the existing public Cloudflare Worker and verify discovery, health, a fictional six-step journey and PDF export.
6. Confirm the live endpoint reports `AMA-Groundwork` while the URL remains unchanged.
7. Create or update the public `Shivak11/AMA-Groundwork` repository, push the verified branch to `main`, and verify the remote head.

## Out of scope

- Changing the six-phase method, questions, saved answers or use-case logic.
- Renaming the existing Cloudflare Worker or forcing users to reinstall the connector.
- Rewriting historical release evidence.
- Changing storage, access, deletion or persistence behaviour.
