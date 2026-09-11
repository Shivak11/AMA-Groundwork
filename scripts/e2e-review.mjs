import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { group, answers } from '../examples/shared-services.mjs';

// Run only against a URL whose deployment and access policy have been approved.
// Screens come from returned resources, not recreated versions of the interface.
if (!process.argv[2]) throw new Error('Supply the verified MCP URL or --stdio: node scripts/e2e-review.mjs --stdio');
const isStdio = process.argv[2] === '--stdio';
const endpoint = isStdio ? null : new URL(process.argv[2]);
if (endpoint) {
  assert(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, 'Use a URL without credentials, a query or a fragment.');
  assert(endpoint.protocol === 'https:' || (endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)), 'Remote endpoints must use HTTPS.');
}
const isLoopback = endpoint && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
const connectionLabel = isStdio ? 'the local stdio server' : isLoopback ? `the local HTTP Worker at ${endpoint.origin}` : `the remote HTTP connector at ${endpoint.origin}`;
const proofBoundary = `Actual responses from ${connectionLabel} and returned resources in a controlled MCP Apps protocol harness. Fictional group answers and deterministic message parsing. Not ChatGPT or Claude installation, conversation or download proof. No participant usability study.`;
const runName = new Date().toISOString().replace(/[:.]/g, '-');
const output = new URL(`../output/review/${runName}/`, import.meta.url);
await mkdir(new URL('screens/', output), { recursive: true });
await mkdir(new URL('checkpoints/', output), { recursive: true });
await mkdir(new URL('evidence/', output), { recursive: true });
const headers = process.env.WORKSHOP_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.WORKSHOP_ACCESS_TOKEN}` } : {};
const client = new Client({ name: 'workshop-screen-review-harness', version: '1.0.0' }, {
  capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
});
const transport = isStdio ? new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../src/stdio.mjs', import.meta.url))],
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
  stderr: 'pipe',
}) : new StreamableHTTPClientTransport(endpoint, { requestInit: { headers } });
const screens = [];
const checkpoints = [];
const checks = [];
const errors = [];
const externalRequests = [];
let browser;
let page;
let record;
let failure;
let toolSequence = 0;
let currentFrame;
let currentTitle;
let checkpointHtml;
let prefabHtml;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = text => String(text ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const textContent = result => (result.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n');

async function tool(name, args, { expectedError = false } = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 90_000 });
  const evidenceName = `${String(++toolSequence).padStart(2, '0')}-${name}.json`;
  await writeFile(new URL(`evidence/${evidenceName}`, output), JSON.stringify({ name, arguments: args, result }, null, 2));
  assert.equal(Boolean(result.isError), expectedError, textContent(result));
  return result;
}

async function resource(uri) {
  const response = await client.readResource({ uri });
  const item = response.contents.find(item => item.uri === uri && typeof item.text === 'string');
  assert(item?.text.includes('<html'), `The server did not return the HTML resource ${uri}.`);
  checks.push({ check: 'Returned UI resource', uri, bytes: Buffer.byteLength(item.text), sha256: digest(item.text) });
  return item.text;
}

async function mount(html, payload, title) {
  currentTitle = title;
  await page.setViewportSize({ width: 1280, height: 1050 });
  await page.setContent(`<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><style>body{margin:0;background:#F3E9D8;color:#3A241C;font:16px/1.45 Arial,sans-serif}header{padding:16px 24px;border-bottom:1px solid #BCA48E}header p{margin:0}header p+p{margin-top:4px;color:#6F5A4E;font-size:14px}iframe{display:block;width:100%;height:900px;border:0;background:white}</style></head><body><header><p>${escape(title)}</p><p>MCP Apps protocol harness. This is not a ChatGPT or Claude screen.</p></header><iframe title="Returned workshop view" sandbox="allow-scripts allow-same-origin"></iframe></body></html>`);
  await page.evaluate(({ html, payload }) => {
    window.reviewCalls = [];
    window.reviewDeny = false;
    if (window.reviewListener) window.removeEventListener('message', window.reviewListener);
    window.reviewListener = event => {
      const request = event.data;
      if (!request || request.jsonrpc !== '2.0') return;
      if (request.id !== undefined) window.reviewCalls.push(request);
      if (request.method === 'ui/initialize') {
        event.source.postMessage({ jsonrpc: '2.0', id: request.id, result: {
          protocolVersion: request.params.protocolVersion,
          hostInfo: { name: 'Screen review protocol harness', version: '1.0.0' },
          hostCapabilities: { message: { text: {} }, downloadFile: {}, logging: {} },
          hostContext: { theme: 'light', displayMode: 'inline', containerDimensions: { width: 1280 } },
        } }, '*');
      } else if (request.method === 'ui/notifications/initialized') {
        event.source.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: payload }, '*');
      } else if (request.id !== undefined) {
        event.source.postMessage({ jsonrpc: '2.0', id: request.id, result: window.reviewDeny ? { isError: true } : {} }, '*');
      }
    };
    window.addEventListener('message', window.reviewListener);
    document.querySelector('iframe').srcdoc = html;
  }, { html, payload });
  currentFrame = page.frameLocator('iframe');
  await currentFrame.locator('h1').waitFor();
  const expected = payload.structuredContent?.record?.revision;
  if (expected !== undefined) await currentFrame.getByText(`${record?.group.name ?? group.name} · record revision ${expected}`, { exact: true }).waitFor();
  else await currentFrame.getByRole('heading', { name: 'Which should we pursue first?', exact: true }).waitFor();
  await currentFrame.locator('body').evaluate(() => document.fonts.ready);
  return currentFrame;
}

async function capture(name, note, { phase, pdf, width = 1280 } = {}) {
  await page.locator('header p').first().evaluate((node, title) => { node.textContent = title; }, currentTitle);
  await page.setViewportSize({ width, height: 1050 });
  const height = await currentFrame.locator('body').evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  await page.locator('iframe').evaluate((frame, height) => { frame.style.height = `${Math.min(14_000, Math.max(650, height + 20))}px`; }, height);
  await currentFrame.locator('body').evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, 0));
  const file = `screens/${String(screens.length + 1).padStart(2, '0')}-${name}.png`;
  const bytes = await page.screenshot({ path: fileURLToPath(new URL(file, output)), fullPage: true });
  screens.push({ title: currentTitle, note, phase, pdf, file, width, sha256: digest(bytes), image: bytes.toString('base64') });
}

async function checkpoint(result, phase) {
  const pdf = result.content.find(item => item.type === 'resource' && item.resource.mimeType === 'application/pdf')?.resource;
  assert.equal(typeof pdf?.blob, 'string', `Phase ${phase} did not return PDF bytes.`);
  const bytes = Buffer.from(pdf.blob, 'base64');
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert(bytes.length > 10_000, 'The workbook must be a complete PDF, not a signature stub.');
  assert.equal(result._meta.artifacts.pdf.blob, pdf.blob, 'The visible download must contain the actual generated PDF.');
  const checkpointResource = result.content.find(item => item.type === 'resource' && item.resource.mimeType === 'application/json')?.resource;
  assert.deepEqual(JSON.parse(checkpointResource.text), result.structuredContent.record);
  const pdfPath = `checkpoints/phase-${phase}.pdf`;
  const jsonPath = `checkpoints/phase-${phase}.json`;
  await writeFile(new URL(pdfPath, output), bytes);
  await writeFile(new URL(jsonPath, output), checkpointResource.text);
  checkpoints.push({ phase, revision: result.structuredContent.record.revision, bytes: bytes.length, sha256: digest(bytes), pdfPath, jsonPath });
  return pdfPath;
}

async function message() {
  await page.waitForFunction(() => window.reviewCalls.some(call => call.method === 'ui/message'));
  return page.evaluate(() => window.reviewCalls.find(call => call.method === 'ui/message').params.content[0].text);
}

function parseChoices(message) {
  const blocks = [...message.matchAll(/Candidate ID: ([^\n]+)\nDecision: ([^\n]+)\nReason: ([\s\S]*?)\nEvidence gap: ([\s\S]*?)(?=\n\nCandidate ID:|\n\nDissent or challenge:)/g)];
  assert.equal(blocks.length, 3);
  return {
    choices: blocks.map(([, candidateId, decision, reason, evidenceGap]) => ({ candidateId, decision, reason: reason.trim(), evidenceGap: evidenceGap.trim() })),
    challenge: message.match(/Dissent or challenge: ([\s\S]*?)\nRecurring costs and effort:/)[1].trim(),
    costs: message.split('\nRecurring costs and effort:')[1].trim(),
  };
}

async function shortlistExercise() {
  const result = await tool('show_shortlist', { record });
  assert.equal(result.structuredContent?.$prefab?.version, '0.3', 'The connector’s optional view did not return the Prefab envelope.');
  let frame = await mount(prefabHtml, result, 'Phase 5: compare the candidate use cases');
  assert.equal(await frame.locator('.shortlist-card').count(), 3);
  await frame.getByText('Review the candidate', { exact: true }).first().click();
  await capture('phase-5-candidates', 'The returned Prefab view shows the three recorded candidates. The first candidate is expanded so its human check and non-AI alternative can be reviewed.', { phase: 5 });
  await frame.getByRole('combobox').first().click();
  await frame.getByRole('option', { name: 'First', exact: true }).click();
  await frame.getByText('More than one candidate is marked First.', { exact: false }).waitFor();
  currentTitle = 'Phase 5: conflicting priorities are visible';
  await capture('phase-5-priority-warning', 'Selecting a second First candidate produces a visible warning. This test changes the current view only; it has not saved the conflict in the group record.', { phase: 5 });
  await frame.getByRole('combobox').first().click();
  await frame.getByRole('option', { name: 'Later', exact: true }).click();
  await frame.getByLabel('Why this choice?', { exact: true }).first().fill('Test the mandatory form first and compare the remaining omissions before adding AI.');
  await frame.getByLabel('What evidence is missing?', { exact: true }).first().fill('A measured sample of omissions after introducing the mandatory form.');
  await frame.getByRole('button', { name: 'Review these choices', exact: true }).click();
  assert.equal(await frame.getByRole('button', { name: 'Confirm the saved shortlist', exact: true }).isDisabled(), true);
  currentTitle = 'Phase 5: review edits before saving';
  await capture('phase-5-review-unsaved', 'The review contains the edited reason and evidence gap. Confirmation is disabled while those edits have not been returned by the connector as a saved draft.', { phase: 5 });
  await frame.getByRole('button', { name: 'Send choices for review', exact: true }).click();
  const saveMessage = await message();
  assert(saveMessage.includes(`Record revision: ${record.revision}`));
  assert.match(saveMessage, /Do not confirm yet/);
  await writeFile(new URL('evidence/shortlist-save-message.txt', output), saveMessage);
  const parsed = parseChoices(saveMessage);
  const saved = await tool('save_workshop_phase', { record, phase: 5, answers: parsed });
  record = saved.structuredContent.record;
  assert.equal(record.phases[4].answers.choices[0].evidenceGap, parsed.choices[0].evidenceGap);
  const review = await tool('show_shortlist', { record });
  frame = await mount(prefabHtml, review, 'Phase 5: approve the returned saved revision');
  await frame.getByRole('button', { name: 'Review these choices', exact: true }).click();
  assert.equal(await frame.getByRole('button', { name: 'Confirm the saved shortlist', exact: true }).isDisabled(), false);
  await capture('phase-5-review-saved', 'The connector has returned the saved revision, so the explicit confirmation action is now available. The harness will forward the visible approval to the same confirmation tool.', { phase: 5 });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Shortlist overflow at ${width}px.`);
  }
  await capture('phase-5-mobile', 'The actual returned shortlist reflows at 390 pixels without horizontal overflow. This is a browser layout check, not a mobile chat-client test.', { phase: 5, width: 390 });
  await page.setViewportSize({ width: 1280, height: 1050 });
  await frame.getByRole('button', { name: 'Confirm the saved shortlist', exact: true }).click();
  const approval = await message();
  assert(approval.includes(`Record revision: ${record.revision}`));
  const confirmation = approval.match(/confirmation: "([^"]+)"/)[1];
  await writeFile(new URL('evidence/shortlist-approval-message.txt', output), approval);
  checks.push({ check: 'Prefab edit, review, revision-labelled save and approval', result: 'pass' });
  return tool('confirm_workshop_phase', { record, phase: 5, approved: true, confirmation });
}

async function writeReport() {
  const font = (await readFile(new URL('../skills/ai-use-case-workshop/assets/fonts/DMSerifDisplay-Regular.ttf', import.meta.url))).toString('base64');
  const evidence = { endpoint: endpoint?.href ?? null, transport: isStdio ? 'stdio' : 'http', connection: connectionLabel, createdAt: new Date().toISOString(), status: failure ? 'incomplete' : 'passed', failure: failure?.message ?? null, checkpoints, checks, browserErrors: errors, externalBrowserRequests: externalRequests, screens: screens.map(({ image, ...screen }) => screen), boundary: proofBoundary };
  await writeFile(new URL('evidence.json', output), JSON.stringify(evidence, null, 2));
  const rows = checkpoints.map(item => `<tr><td>Phase ${item.phase}</td><td>${item.revision}</td><td>${item.bytes.toLocaleString('en-IN')} bytes</td><td><a href="${item.pdfPath}">Open cumulative PDF</a><br><a href="${item.jsonPath}">Open JSON checkpoint</a></td></tr>`).join('');
  const html = `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workshop connector screen review</title><style>@font-face{font-family:DMSerif;src:url(data:font/ttf;base64,${font}) format('truetype');font-style:normal;font-weight:400}:root{color:#3A241C;background:#F3E9D8;font:17px/1.55 'Avenir Next','Segoe UI',Arial,sans-serif}*{box-sizing:border-box}body{margin:0}main{max-width:1140px;margin:36px auto;padding:0 24px}h1,h2{font-family:DMSerif,Georgia,serif;font-weight:400;line-height:1.12}h1{font-size:clamp(40px,6vw,64px);margin:0 0 24px}h2{font-size:32px;margin:0 0 16px}p{margin:0 0 16px;overflow-wrap:anywhere}a{color:#9B4625;text-decoration:underline;text-underline-offset:3px}a:focus-visible{outline:3px solid #9B4625;outline-offset:4px}header,.files,article{padding:32px;background:#fff;margin-bottom:28px}header{border-top:7px solid #C56A3C;background:#F8F0E4}.boundary{border-left:4px solid #9B4625;padding:12px 18px;margin:24px 0;background:#F3E9D8}.muted{color:#6F5A4E}table{border-collapse:collapse;width:100%;margin:22px 0}th,td{border-bottom:1px solid #BCA48E;text-align:left;vertical-align:top;padding:12px}th{background:#F8F0E4}article{border-top:3px solid #C56A3C;scroll-margin-top:24px}article img{display:block;width:100%;height:auto;border:1px solid #BCA48E;margin:24px 0 12px}article.mobile img{max-width:430px;margin-right:auto;margin-left:auto}nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 24px;margin:24px 0}footer{border-top:1px solid #BCA48E;padding:24px 0;color:#6F5A4E}code{font-size:.9em;overflow-wrap:anywhere}@media(max-width:640px){main{margin:16px auto;padding:0 12px}header,.files,article{padding:20px}nav{grid-template-columns:1fr}table,tbody,tr,td{display:block}thead{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}td{padding:6px 0;border:0}tr{padding:12px 0;border-bottom:1px solid #BCA48E}}@media print{main{max-width:none;margin:0;padding:0}article{break-before:page}a{color:#3A241C}}</style></head><body><main><header><h1>Workshop connector screen review</h1><p>This review follows a fictional group through the six-phase AI use-case exercise using ${escape(connectionLabel)}.</p><p>${failure ? `The run stopped before completion: ${escape(failure.message)}` : `All six phases returned a cumulative PDF. The review contains ${screens.length} captured screens.`}</p><div class="boundary"><p>The screens below show actual returned resources and records in a controlled MCP Apps protocol harness. The harness supplies fictional answers and forwards visible button messages to the same connector tools.</p><p>These results do not establish installation or behaviour inside ChatGPT or Claude. A host accepting a download request is also separate from a person receiving the file.</p></div><p class="muted">Prepared by Dr. Shiva Kakkar<br>${escape(new Date().toISOString())}</p><nav aria-label="Captured screens">${screens.map((screen, i) => `<a href="#screen-${i + 1}">${escape(screen.title)}</a>`).join('')}</nav></header><section class="files"><h2>Returned files and checks</h2><p>The PDF links point to bytes returned by the connector after each explicit fictional approval. JSON backups preserve the same returned group records.</p><table><thead><tr><th scope="col">Checkpoint</th><th scope="col">Revision</th><th scope="col">PDF size</th><th scope="col">Files</th></tr></thead><tbody>${rows}</tbody></table><p><a href="evidence.json">Open the verification record</a></p><p>Browser runtime errors recorded: ${errors.length}. External requests made by the embedded views: ${externalRequests.length}.</p></section>${screens.map((screen, i) => `<article id="screen-${i + 1}" class="${screen.width < 640 ? 'mobile' : ''}"><h2>${escape(screen.title)}</h2><p>${escape(screen.note)}</p>${screen.pdf ? `<p><a href="${screen.pdf}">Open the PDF returned for this phase</a></p>` : ''}<img src="data:image/png;base64,${screen.image}" alt="${escape(screen.title)} in the labelled MCP Apps protocol harness" loading="lazy"><p class="muted">Captured at ${screen.width} pixels wide. The image is embedded in this review.</p></article>`).join('')}<footer><p>Prepared by Dr. Shiva Kakkar</p><a href="https://www.shivakakkar.com/">Click here to access the author’s profile</a></footer></main></body></html>`;
  await writeFile(new URL('index.html', output), html);
  return evidence;
}

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const resources = await client.listResources();
  checks.push({ check: isStdio ? 'MCP stdio discovery' : 'MCP HTTP discovery', tools: listed.tools.length, resources: resources.resources.length, server: client.getServerVersion() });
  for (const name of ['start_workshop', 'save_workshop_phase', 'confirm_workshop_phase', 'show_shortlist', 'resume_workshop']) assert(listed.tools.some(tool => tool.name === name));
  checkpointHtml = await resource('ui://workshop/checkpoint.html');
  prefabHtml = await resource('ui://prefab/renderer.html');
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, route => { externalRequests.push(route.request().url()); return route.abort(); });
  const started = await tool('start_workshop', { group });
  record = started.structuredContent.record;
  assert.equal(started.structuredContent.mode, 'ui-available');
  await mount(checkpointHtml, started, 'The group starts its workbook');
  await capture('start', 'The group details and first question come from the returned start record. No phase has been confirmed and no PDF is presented.');

  for (let phase = 1; phase <= 6; phase++) {
    const draft = await tool('save_workshop_phase', { record, phase, answers: answers[phase - 1] });
    record = draft.structuredContent.record;
    assert.equal(record.phases[phase - 1].status, 'draft');
    await mount(checkpointHtml, draft, `Phase ${phase}: review the draft summary`);
    await currentFrame.getByText('Review the returned summary', { exact: true }).click();
    await capture(`phase-${phase}-draft`, 'The readable summary shows the fictional group’s recorded answers before approval. The draft does not create a new PDF.', { phase });
    const confirmed = phase === 5 ? await shortlistExercise() : await tool('confirm_workshop_phase', {
      record, phase, approved: true, confirmation: `The fictional test group approves the displayed phase ${phase} summary.`,
    });
    record = confirmed.structuredContent.record;
    assert.equal(record.phases[phase - 1].status, 'confirmed');
    assert.equal(record.phases.filter(item => item.status === 'confirmed').length, phase);
    const pdf = await checkpoint(confirmed, phase);
    await mount(checkpointHtml, confirmed, `Phase ${phase}: the cumulative workbook is ready`);
    await currentFrame.getByRole('button', { name: 'Download workbook PDF', exact: true }).click();
    await currentFrame.getByText('The host accepted the download request.', { exact: false }).waitFor();
    const download = await page.evaluate(() => window.reviewCalls.find(call => call.method === 'ui/download-file').params);
    assert.equal(download.contents[0].resource.blob, confirmed._meta.artifacts.pdf.blob);
    checks.push({ check: `Phase ${phase} download payload`, result: 'matches actual returned PDF' });
    await capture(`phase-${phase}-confirmed`, `Phase ${phase} is confirmed in the returned record. The view sends the same generated PDF bytes to the harness download handler. The adjacent file link opens the saved copy of those bytes.`, { phase, pdf });
  }

  await page.evaluate(() => { window.reviewDeny = true; });
  await currentFrame.getByRole('button', { name: 'Download JSON checkpoint', exact: true }).click();
  await currentFrame.getByText('The download was declined or cancelled.', { exact: false }).waitFor();
  currentTitle = 'A declined download leaves a retry route';
  await capture('download-declined', 'The harness deliberately declines the JSON download. The view states that it was declined or cancelled and keeps the conversation fallback available.');

  const restored = await tool('resume_workshop', { checkpoint: record, mode: 'text' });
  assert.deepEqual(restored.structuredContent.record, record);
  assert.equal(restored.structuredContent.mode, 'text');
  checks.push({ check: 'Manual JSON restore with explicit text mode', result: 'same completed record returned' });
  const original = structuredClone(record);
  const corrected = await tool('save_workshop_phase', { record, phase: 1, answers: { baseline: 'Unknown. A permitted sample must be measured before a baseline is agreed.' } });
  record = corrected.structuredContent.record;
  assert.equal(record.phases[0].status, 'draft');
  assert(record.phases.slice(1).every(phase => phase.status === 'needs_review'));
  for (let i = 1; i < 6; i++) assert.deepEqual(record.phases[i].answers, original.phases[i].answers);
  await mount(checkpointHtml, corrected, 'An earlier correction reopens dependent work');
  await currentFrame.getByText('Review the returned summary', { exact: true }).click();
  await capture('earlier-correction', 'Changing the baseline reopens phase 1. The server retains the later answers and marks phases 2–6 for review; the old approvals are not silently reused.');
  const invalid = await tool('confirm_workshop_phase', { record, phase: 6, approved: true, confirmation: 'The fictional test group approves phase 6.' }, { expectedError: true });
  await page.evaluate(result => document.querySelector('iframe').contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result }, '*'), invalid);
  await currentFrame.getByText('The workshop action did not complete.', { exact: false }).waitFor();
  currentTitle = 'A premature confirmation does not advance the record';
  await capture('confirmation-rejected', 'The real server rejects phase 6 confirmation while earlier work needs approval. The checkpoint view reports the failed action and retains the last returned record.');
  checks.push({ check: 'Earlier correction and invalid confirmation', result: 'later answers preserved, dependent approval required, invalid confirmation rejected' });
  assert.deepEqual(errors, [], 'The rendered views produced browser runtime errors.');
  assert.deepEqual(externalRequests, [], 'The rendered views attempted external requests.');
  assert.equal(checkpoints.length, 6);
} catch (error) {
  failure = error;
} finally {
  if (browser) await browser.close();
  await client.close().catch(() => {});
  const evidence = await writeReport();
  console.log(JSON.stringify({ status: evidence.status, report: fileURLToPath(new URL('index.html', output)), screens: screens.length, pdfs: checkpoints.length, error: failure?.message ?? null, boundary: proofBoundary }));
}
if (failure) process.exitCode = 1;
