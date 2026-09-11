# Cloudflare connector

The Cloudflare adapter uses the same workshop rules and HTML as local stdio. It bundles the teaching resources, licensed font, checkpoint view and compiled Prefab layouts. Python is needed only when rebuilding Prefab assets. Cloudflare Browser Run generates PDFs.

The separate Worker is deployed at https://ai-use-case-workshop.shiva-research11.workers.dev/mcp on the verified shiva.research11 account. The approved live deployment is enabled with public access. The committed configuration still starts disabled and unconfigured to prevent accidental exposure during a new deployment. The existing consultant Worker is unchanged.

## Build and check

Install the locked dependencies and the pinned Prefab environment described in the main README. Run `npm test`, `npm run build:remote`, and `node scripts/verify-stdio.mjs`. Use `PREFAB_PYTHON` when the isolated Python interpreter is elsewhere.

For a loopback-only protocol check:

```sh
npx wrangler dev --local --ip 127.0.0.1 --port 8876 --var WORKSHOP_ENABLED:true --var ACCESS_MODE:public
node scripts/verify-http.mjs http://127.0.0.1:8876/mcp
```

Run `node scripts/verify-http.mjs https://ai-use-case-workshop.shiva-research11.workers.dev/mcp --pdf` to check the deployed connector. The script uses fictional groups and generates an actual PDF only when `--pdf` is supplied. Private deployments require `WORKSHOP_ACCESS_TOKEN` through a protected environment; never put it in a URL or command argument.

For the screen-by-screen exercise, run `node scripts/e2e-review.mjs https://THE-VERIFIED-HOST/mcp`. This uses a fictional shared-services group, confirms all six phases, saves each returned PDF and JSON checkpoint, and captures the returned interfaces in an MCP Apps protocol harness. It also checks shortlist edits, declined downloads and the consequences of correcting an earlier answer. Results are written to a timestamped folder under `output/review/`; open its `index.html` alongside the linked checkpoint files. A failed run still writes an explicitly incomplete report.

The same runner accepts the loopback development URL or `--stdio` for local verification. Local results do not establish a public deployment. The harness forwards scripted messages and accepts download requests; it does not establish natural conversation quality, installation, actual downloads or widget compatibility in ChatGPT and Claude.

## Client installation after deployment

Do not register the expected URL before verifying that the deployed endpoint returns the intended server and tools. Back up existing client configurations and preserve their other connectors.

For ChatGPT, enable Developer mode in Settings under Security and login, then register the verified server through the plus button in Plugins. Plugin packaging uses the technical connection ID returned after registration; never invent that ID. See [OpenAI's MCP plugin setup](https://developers.openai.com/plugins/build/plugins#create-and-test-a-plugin-locally-with-an-mcp-server).

For Claude, register the verified URL as a custom remote connector. Account registration is separate from editing a local Claude Desktop configuration, and remote requests originate from Anthropic's infrastructure. See [Claude's custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Record actual host tests separately from SDK checks: discovery, starting a fictional group, reviewing and confirming a phase, receiving its PDF, restoring JSON and using the optional shortlist view. Any host or interaction not exercised remains unverified.

## Access and privacy

`WORKSHOP_ENABLED=false` is the containment switch. `ACCESS_MODE=public` permits anyone to use the stateless connector. `ACCESS_MODE=private` requires a `WORKSHOP_ACCESS_TOKEN` of at least 32 characters stored as a Worker secret. This private bearer option is for clients that support headers; it is not an OAuth implementation or an assertion of compatibility with ChatGPT's custom-connector authentication screen.

No group database or application request-body log is created. Participants' supplied text is processed by Cloudflare for the requested tool call and PDF rendering, then returned to their chat client. Chat providers and Cloudflare retain their own platform-level policies. This is not a promise of zero platform retention. Downloadable JSON remains the recovery mechanism.

The `Mcp-Session-Id` header carries only the client's declared rendering capability. It never grants access, identifies a group owner or refers to stored answers. Every private request still needs the access credential. Clients may edit this rendering preference without changing authorisation.

Request and PDF rate limits reduce bursts. They are per-location, eventually consistent guards, not a global spend cap. Shared classroom networks and chat-provider egress may combine many groups. Classroom concurrency and Browser Run capacity need a cohort-sized test before claiming load readiness. See [Cloudflare rate-limit behaviour](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Dependencies and release boundary

The pinned Cloudflare Puppeteer package has a transitive `extract-zip` advisory through its browser-download tooling. The Worker uses Cloudflare's browser binding and does not download/extract browser archives. The inspected Worker bundle contains neither that extraction code nor local Playwright/Python. This is a reachability limitation, not a clean dependency-audit claim. Do not run dependency archive-download helpers on untrusted inputs. Recheck the advisory on upgrades.

The live endpoint and six-phase Cloudflare PDF journey passed separate checks. Codex has first-turn host evidence. ChatGPT installation, the embedded checkpoint view, phase-1 drafting, explicit confirmation and PDF/JSON attachment materialisation have been observed in the actual account. Claude Code connection and the Claude Desktop bridge are verified, but their model/UI journeys remain incomplete. See [the release verification](verification.md) for exact boundaries. A complete six-phase ChatGPT or Claude conversation and classroom-load readiness remain unverified.
