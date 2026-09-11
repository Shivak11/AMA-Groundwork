# Cloudflare connector

Version 0.2.0 is a local review candidate. The Cloudflare adapter uses the same workshop rules and book composition as local stdio. It bundles the teaching resources, licensed font and interactive activity/book view. Prefab and Python are no longer imported into this runtime or required by its build. Cloudflare Browser Run generates remote PDFs.

The previously approved Worker is at https://ai-use-case-workshop.shiva-research11.workers.dev/mcp on the shiva.research11 account. This candidate has not replaced it. The committed configuration starts disabled and unconfigured. The existing consultant Worker is unchanged.

## Build and check

Install the locked Node dependencies described in the main README. Run `npm test`, `npm run build:remote`, and `node scripts/verify-stdio.mjs`. The remote build is a dry run, not deployment. Local PDF tests require Chromium; an existing executable can be provided through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

For a loopback-only protocol check:

```sh
npx wrangler dev --local --ip 127.0.0.1 --port 8876 --var WORKSHOP_ENABLED:true --var ACCESS_MODE:public
node scripts/verify-http.mjs http://127.0.0.1:8876/mcp
```

Run `node scripts/verify-http.mjs https://ai-use-case-workshop.shiva-research11.workers.dev/mcp --pdf` to check the deployed connector. The script uses fictional groups and generates an actual PDF only when `--pdf` is supplied. Private deployments require `WORKSHOP_ACCESS_TOKEN` through a protected environment; never put it in a URL or command argument.

For this candidate's screen-by-screen exercise, run `node scripts/verify-visual-journey.mjs`. It uses the actual local MCP tools and returned widget with a fictional hiring group, confirms all six phases and writes the review HTML plus PDF checkpoints to `output/visual-review/`. Run `node scripts/verify-widget-recovery.mjs` for adversarial local view-state checks.

The older `e2e-review.mjs` runner contains historical Prefab assumptions and is not the acceptance runner for 0.2.0. Local tests do not establish a public deployment, natural conversation quality, installation, actual host downloads or compatibility in ChatGPT and Claude.

## Client installation after deployment — historical instructions to recheck

Do not register the expected URL before verifying that the deployed endpoint returns the intended server and tools. Back up existing client configurations and preserve their other connectors.

For ChatGPT, enable Developer mode in Settings under Security and login, then register the verified server through the plus button in Plugins. Plugin packaging uses the technical connection ID returned after registration; never invent that ID. See [OpenAI's MCP plugin setup](https://developers.openai.com/plugins/build/plugins#create-and-test-a-plugin-locally-with-an-mcp-server).

For Claude, register the verified URL as a custom remote connector. Account registration is separate from editing a local Claude Desktop configuration, and remote requests originate from Anthropic's infrastructure. See [Claude's custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Record actual host tests separately from SDK checks: discovery, starting a fictional group, reviewing and confirming a phase, receiving its PDF, restoring JSON and using the optional shortlist view. Any host or interaction not exercised remains unverified.

## Access and privacy

`WORKSHOP_ENABLED=false` is the containment switch. `ACCESS_MODE=public` permits anyone to use the stateless connector. `ACCESS_MODE=private` requires a `WORKSHOP_ACCESS_TOKEN` of at least 32 characters stored as a Worker secret. This private bearer option is for clients that support headers; it is not an OAuth implementation or an assertion of compatibility with ChatGPT's custom-connector authentication screen.

No group database or application request-body log is created. Participants' supplied text is processed by Cloudflare for the requested tool call and PDF rendering, then returned to their chat client. Chat providers and Cloudflare retain their own platform-level policies. This is not a promise of zero platform retention. Downloadable JSON remains the recovery mechanism.

The `Mcp-Session-Id` header carries only the client's declared rendering capability. It never grants access, identifies a group owner or refers to stored answers. Every private request still needs the access credential. Clients may edit this rendering preference without changing authorisation.

The request parser permits at most 350,000 raw bytes for the complete record, replacement patch and JSON-RPC envelope. The domain record remains limited to 150,000 UTF-8 bytes, including undo. Oversized requests fail before tool handling. Request and PDF rate limits reduce bursts. They are per-location, eventually consistent guards, not a global spend cap. Shared classroom networks and chat-provider egress may combine many groups. Classroom concurrency and Browser Run capacity need a cohort-sized test before claiming load readiness. See [Cloudflare rate-limit behaviour](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Dependencies and release boundary

The pinned Cloudflare Puppeteer package has a transitive `extract-zip` advisory through its browser-download tooling. The Worker uses Cloudflare's browser binding and does not download/extract browser archives. The inspected Worker bundle contains neither that extraction code nor local Playwright/Python. This is a reachability limitation, not a clean dependency-audit claim. Do not run dependency archive-download helpers on untrusted inputs. Recheck the advisory on upgrades.

Historical version 0.1.0 endpoint, Cloudflare PDF and partial host tests are recorded in [the earlier release verification](verification.md). They do not prove this candidate. The current source and local evidence are recorded in [candidate verification](../verification.md). Actual Cloudflare rendering, target-client journeys and classroom load must be verified before release.
