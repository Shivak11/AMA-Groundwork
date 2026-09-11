# Cloudflare deployment and client installation

## Scope agreed on 8 September 2026

Deploy the existing AI Use-Case Workshop on Shiva's Cloudflare account identified by the user as `shivak11`, and install the connector in the available clients. Keep the existing consultant connector and local workshop working unchanged. Use a separate Worker. Do not introduce automatic group persistence or copy private source recordings.

Remote access policy required a user decision before exposure. Cloudflare's default saved login was expired at the first check and was refreshed with device login. The user subsequently approved public publication. The separate Worker was deployed from reviewed source `8435220`; live results and client-specific limits are recorded in `remote/verification.md`.

## Implementation

1. Add runtime injection to the server. Keep the existing local entry point, public exports and test contracts. Separate pure HTML from local asset reads and Playwright. Worker bundles the exact existing teaching references, CSS, font and checkpoint view.
2. Add a Cloudflare Streamable HTTP endpoint and Browser Run PDF adapter. Preserve validation, HTML escaping, network blocking, size limits and generate-before-confirm semantics. Do not retain participant data or log bodies. Require explicit configured access policy and fail closed otherwise. Bound request size and PDF requests. Keep the native Prefab exercise if it can be compiled into a reusable data template without a Python process; otherwise disclose the remote view limitation, never claim parity without testing.
3. Run original regression checks, transport checks and local remote-bundle checks. Independently review changed trust boundaries. Verify the Cloudflare account before any deployment. Do not create infrastructure in a different account.
4. Deploy only the reviewed separate Worker after the required live-action approval. Verify real remote initialize, resources, tools, group journey and PDF signature. No fake deployed URL or implied client proof.
5. Back up relevant client config before installation, preserve all existing entries, and add only this connector. Test discovery and actual protocol calls independently from UI/client installation. ChatGPT web and Claude connectors may require user sign-in or account-level UI setup.

## Ownership

Orchestrator owns DEPLOYMENT-PLAN.md, src/server.mjs, src/stdio.mjs, shared dependencies/lock, remote/worker.mjs, remote/assets.mjs, remote access controls, tests, configuration, account checks, installation, verification records and release commits.

Renderer builder owns only src/render-workbook.mjs, new src/workbook-html.mjs and remote/render-pdf.mjs. It must preserve public local exports and HTML output exactly, using injected CSS and font in the new pure module. No unrelated changes.

Prefab builder, if assigned, owns only prefab/compiled-view.mjs and scripts/build-prefab-remote.mjs. Generated assets are build outputs, never contain participant records. No changes to shared files without acknowledgement.

All builders are not alone. Stat owned files before writing. On unexpected changes, snapshot with cp and git diff immediately, stop and report. Do not revert another worker's changes. Orchestrator verifies from disk and commits reviewed units with explicit staging and full-status audit.

## Delivery evidence and recovery

Record source commit, tested bundle, remote deployment identity, URL, account alias, remote protocol result, PDF result and client discovery separately. Record missing CI and actual app journeys as unproved. Never print credentials. Only fictional groups may be used for remote tests.

The existing service is unaffected. Before activating a replacement revision of this new Worker, retain its prior deployment identifier. Containment is disabling this new service or rolling it back, not deleting existing infrastructure. Configuration backups allow removing only the new client entry.
