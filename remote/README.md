# Cloudflare connector

Version 0.7.0 retains private D1 storage, immutable history and persistent recovery. New workbooks capture their date automatically, confirm a grounded use case, show its workflow and proposed implementation, and open the finished workbook with Download PDF prominent. Existing workbooks remain readable. No schema migration or retention change is needed. See RELEASE-0.7.0.md in the repository root for verification.

The authorised endpoint remains https://ai-use-case-workshop.shiva-research11.workers.dev/mcp. The dedicated database is ai-use-case-workshop-sessions, bound as WORKSHOP_DB. The committed configuration starts disabled and unconfigured; deployment and actual-host proof belong in the release record. Other Workers and databases are outside this change.

## Build and check

Install the locked Node dependencies described in the main README. Run `npm test`, `npm run build:remote`, and `node scripts/verify-stdio.mjs`. The remote build is a dry run, not deployment. Local PDF tests require Chromium; an existing executable can be provided through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

For a loopback-only persistent protocol check:

```sh
npx wrangler d1 migrations apply ai-use-case-workshop-sessions --local
npx wrangler dev --local --ip 127.0.0.1 --port 8876 --var WORKSHOP_ENABLED:true --var ACCESS_MODE:public
node scripts/verify-persistent-remote.mjs http://127.0.0.1:8876/mcp --skip-pdf
```

Run `node scripts/verify-persistent-remote.mjs` after deploying the exact reviewed build. It creates a fictional group, verifies six real PDF checkpoints and recovery/correction, then explicitly deletes only that run's session. Its report excludes credentials and file-ticket URLs. Private deployments require connector authentication in addition to per-workbook keys; never put a connector token in a URL or command argument.

For this candidate's screen-by-screen exercise, run `node scripts/verify-visual-journey.mjs`. It uses the actual local MCP tools and returned widget with a fictional hiring group, confirms all six phases and writes the review HTML plus PDF checkpoints to `output/visual-review/`. Run `node scripts/verify-widget-recovery.mjs` for adversarial local view-state checks.

The older `e2e-review.mjs` runner contains historical Prefab assumptions and is not the acceptance runner for 0.2.0. Local tests do not establish a public deployment, natural conversation quality, installation, actual host downloads or compatibility in ChatGPT and Claude.

## Client installation after deployment — historical instructions to recheck

Do not register the expected URL before verifying that the deployed endpoint returns the intended server and tools. Back up existing client configurations and preserve their other connectors.

For ChatGPT, enable Developer mode in Settings under Security and login, then register the verified server through the plus button in Plugins. Plugin packaging uses the technical connection ID returned after registration; never invent that ID. See [OpenAI's MCP plugin setup](https://developers.openai.com/plugins/build/plugins#create-and-test-a-plugin-locally-with-an-mcp-server).

For Claude, register the verified URL as a custom remote connector. Account registration is separate from editing a local Claude Desktop configuration, and remote requests originate from Anthropic's infrastructure. See [Claude's custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Record actual host tests separately from SDK checks: discovery, starting a fictional group, reviewing and confirming a phase, receiving its PDF, restoring JSON and using the optional shortlist view. Any host or interaction not exercised remains unverified.

## Access and privacy

`WORKSHOP_ENABLED=false` stops the service. `WORKSHOP_WRITES_ENABLED=false` pauses workshop mutations while retaining saved reads and exports. `ACCESS_MODE=public` opens MCP discovery and preparation, not access to other groups' data. `ACCESS_MODE=private` adds a connector bearer credential; this is not OAuth. Every workbook read/write still requires its own private key. The separate reading page accepts only read keys and cannot mutate a workbook.

Group summaries, aliases, approvals and snapshots stay in D1 until explicit deletion. No application request-body logging is enabled. Write/read credentials and temporary file tickets are stored only as hashes. The stable reading credential stays in a URL fragment and is sent only to same-origin APIs in an authorisation header. No external page assets, analytics or fonts are requested. Chat providers and Cloudflare retain their own platform policies; application deletion does not erase downloaded copies or provider backups.

The `Mcp-Session-Id` header carries only the client's declared rendering capability. It never grants access, identifies a group owner or refers to stored answers. Every private request still needs the access credential. Clients may edit this rendering preference without changing authorisation.

The request parser permits at most 350,000 bytes; the canonical record remains limited to 150,000 UTF-8 bytes. Preparation and mutation rate limits reduce bursts but are per-location, not global spend caps. Atomic database admission limits refuse excess writes without deleting retained work: 500 sessions, 1000 revisions, 2000 operation receipts per session and a conservative 200 MB logical byte budget. There may be 256 unexpired tickets per group; only expired file tickets are cleaned. The reading page offers direct authenticated downloads without allocating a ticket, including at the application byte cap. Physical Cloudflare quotas can still limit service; no unlimited-capacity claim is made. See [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [rate-limit behaviour](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Migration and rollback

Apply the additive migration locally and run protocol/SQLite checks before remote migration. Apply the remote migration only to ai-use-case-workshop-sessions, then deploy the reviewed source. A missing binding fails closed. Never delete the database during rollback. Prefer write-disabled containment so participants retain reading and downloads. Returning directly to the old stateless Worker would strand short references; retain the persistent reader or export affected records before such a rollback. Old v0.1–v0.5 verification files are historical evidence, not this release's runtime proof.

## Dependencies and release boundary

The pinned Cloudflare Puppeteer package has a transitive `extract-zip` advisory through its browser-download tooling. The Worker uses Cloudflare's browser binding and does not download/extract browser archives. The inspected Worker bundle contains neither that extraction code nor local Playwright/Python. This is a reachability limitation, not a clean dependency-audit claim. Do not run dependency archive-download helpers on untrusted inputs. Recheck the advisory on upgrades.

Historical version 0.1.0 endpoint, Cloudflare PDF and partial host tests are recorded in [the earlier release verification](verification.md). They do not prove this candidate. The current source and local evidence are recorded in [candidate verification](../verification.md). Actual Cloudflare rendering, target-client journeys and classroom load must be verified before release.
