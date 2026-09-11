import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildPrefabView, loadPrefabRenderer } from './adapter.mjs';
import { group, answers } from '../examples/shared-services.mjs';
import { createRecord, savePhase, confirmPhase } from '../src/workshop.mjs';
import { createWorkshopServer } from '../src/server.mjs';

let record = createRecord(group);
for (let id = 1; id <= 4; id++) {
  record = savePhase(record, id, answers[id - 1]);
  record = confirmPhase(record, id, 'The fictional group approves.');
}
record = savePhase(record, 5, answers[4]);
const server = await createWorkshopServer({ capabilitiesOverride: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } } });
const client = new Client({ name: 'View verification host', version: '1.0.0' }, { capabilities: {} });
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const externalRequests = [];
page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });

async function mount(html, payload) {
  await page.setContent('<iframe title="Workshop exercise" style="width:100%;height:900px;border:0" sandbox="allow-scripts allow-same-origin"></iframe>');
  await page.evaluate(({ html, payload }) => {
    window.calls = [];
    window.deny = false;
    if (window.workshopListener) window.removeEventListener('message', window.workshopListener);
    window.workshopListener = event => {
      const request = event.data;
      if (!request || request.jsonrpc !== '2.0') return;
      if (request.id !== undefined) window.calls.push(request);
      if (request.method === 'ui/initialize') {
        event.source.postMessage({ jsonrpc: '2.0', id: request.id, result: {
          protocolVersion: request.params.protocolVersion,
          hostInfo: { name: 'Local verification harness', version: '1.0.0' },
          hostCapabilities: { message: { text: {} }, downloadFile: {}, logging: {} },
          hostContext: { theme: 'light', displayMode: 'inline', containerDimensions: { width: 1060 } },
        } }, '*');
      } else if (request.method === 'ui/notifications/initialized') {
        event.source.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: payload }, '*');
      } else if (request.id !== undefined) {
        event.source.postMessage({ jsonrpc: '2.0', id: request.id, result: window.deny ? { isError: true } : {} }, '*');
      }
    };
    window.addEventListener('message', window.workshopListener);
    document.querySelector('iframe').srcdoc = html;
  }, { html, payload });
  return page.frameLocator('iframe');
}

try {
  const envelope = await buildPrefabView(record);
  assert.equal(envelope.$prefab.version, '0.3');
  const renderer = await loadPrefabRenderer();
  let frame = await mount(renderer, { content: [], structuredContent: envelope });
  await frame.getByRole('heading', { name: 'Which should we pursue first?', exact: true }).waitFor();
  assert.equal(await frame.locator('.shortlist-card').count(), 3);
  await frame.getByRole('combobox').first().click();
  await frame.getByRole('option',{name:'First',exact:true}).click();
  await frame.getByText('More than one candidate is marked First.',{exact:false}).waitFor();
  await frame.getByRole('combobox').first().click();
  await frame.getByRole('option',{name:'Later',exact:true}).click();
  await frame.getByLabel('What evidence is missing?',{exact:true}).first().fill('A measured sample after the form change.');
  await frame.getByLabel('Why this choice?', { exact: true }).first().fill('A changed reason.');
  await mkdir(new URL('../previews/',import.meta.url),{recursive:true});
  await frame.locator('body').evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:fileURLToPath(new URL('../previews/prefab-shortlist.png',import.meta.url))});
  await frame.getByRole('button', { name: 'Review these choices', exact: true }).click();
  assert.match(await frame.locator('.review-card').innerText(), /A changed reason\./);
  assert.equal(await frame.getByRole('button', { name: 'Confirm the saved shortlist', exact: true }).isDisabled(), true);
  await frame.getByRole('button', { name: 'Send choices for review', exact: true }).click();
  await page.waitForFunction(() => window.calls.some(call => call.method === 'ui/message'));
  const message = await page.evaluate(() => window.calls.find(call => call.method === 'ui/message').params.content[0].text);
  assert.match(message, /A changed reason\./);
  assert.match(message, /Record revision: 9/);
  assert.match(message, /Do not confirm yet/);
  assert.match(message, /A measured sample after the form change/);
  // A deterministic host adapter parses this exercise's visible message.
  // It does not simulate an LLM or bypass the MCP state/confirmation tools.
  const choiceBlocks = [...message.matchAll(/Candidate ID: ([^\n]+)\nDecision: ([^\n]+)\nReason: ([\s\S]*?)\nEvidence gap: ([\s\S]*?)(?=\n\nCandidate ID:|\n\nDissent or challenge:)/g)];
  assert.equal(choiceBlocks.length, 3);
  const parsedAnswers = {
    choices: choiceBlocks.map(([, candidateId, decision, reason, evidenceGap]) => ({ candidateId, decision, reason: reason.trim(), evidenceGap: evidenceGap.trim() })),
    challenge: message.match(/Dissent or challenge: ([\s\S]*?)\nRecurring costs and effort:/)[1].trim(),
    costs: message.split('\nRecurring costs and effort:')[1].trim(),
  };
  const saved = await client.callTool({ name: 'save_workshop_phase', arguments: { record, phase: 5, answers: parsedAnswers } });
  assert(!saved.isError, saved.content?.[0]?.text);
  const savedRecord = saved.structuredContent.record;
  assert.equal(savedRecord.revision, 10);
  assert.equal(savedRecord.phases[4].answers.choices[0].reason, 'A changed reason.');
  assert.equal(savedRecord.phases[4].answers.choices[0].evidenceGap,'A measured sample after the form change.');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewportSize({ width: 1100, height: 950 });
  frame = await mount(renderer, {content:[],structuredContent:envelope});
  await frame.getByText('Edit the assumption',{exact:true}).first().click();
  await frame.getByLabel('Assumption to change',{exact:true}).first().fill('The group has not yet confirmed permission for this sample.');
  await frame.getByRole('button',{name:'Request assumption change',exact:true}).first().click();
  await page.waitForFunction(()=>window.calls.some(call=>call.method==='ui/message'));
  const assumptionRequest=await page.evaluate(()=>window.calls.find(call=>call.method==='ui/message').params.content[0].text);
  assert.match(assumptionRequest,/phase 4 candidate c1/);
  assert.match(assumptionRequest,/not yet confirmed permission/);
  const revisedCandidates=structuredClone(record.phases[3].answers.candidates);
  revisedCandidates[0].assumption='The group has not yet confirmed permission for this sample.';
  const revised=await client.callTool({name:'save_workshop_phase',arguments:{record,phase:4,answers:{candidates:revisedCandidates}}});
  assert.equal(revised.structuredContent.record.phases[3].status,'draft');
  assert.deepEqual(revised.structuredContent.record.phases[4].answers,record.phases[4].answers);
  frame = await mount(renderer, { content: [], structuredContent: envelope });
  await frame.getByRole('heading', { name: 'Which should we pursue first?', exact: true }).waitFor();
  await page.evaluate(() => { window.deny = true; });
  await frame.getByRole('button', { name: 'Review these choices', exact: true }).click();
  await frame.getByRole('button', { name: 'Confirm the saved shortlist', exact: true }).click();
  await frame.getByText('The host did not accept the request.', { exact: false }).waitFor();
  const shortlist = await client.callTool({ name: 'show_shortlist', arguments: { record: savedRecord } });
  assert(!shortlist.isError, shortlist.content?.[0]?.text);
  frame = await mount(renderer, shortlist);
  await frame.getByRole('heading', { name: 'Which should we pursue first?', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Review these choices', exact: true }).click();
  assert.match(await frame.locator('.review-card').innerText(), /A changed reason\./);
  assert.equal(await frame.getByRole('button', { name: 'Confirm the saved shortlist', exact: true }).isDisabled(), false);
  await frame.getByRole('button', { name: 'Confirm the saved shortlist', exact: true }).click();
  await page.waitForFunction(() => window.calls.some(call => call.method === 'ui/message'));
  const approval = await page.evaluate(() => window.calls.find(call => call.method === 'ui/message').params.content[0].text);
  assert.match(approval, /Record revision: 10/);
  assert.match(approval, /approved:true/);
  const quotedApproval = approval.match(/confirmation: "([^"]+)"/)[1];
  const confirmed = await client.callTool({ name: 'confirm_workshop_phase', arguments: { record: savedRecord, phase: 5, approved: true, confirmation: quotedApproval } });
  assert(!confirmed.isError, confirmed.content?.[0]?.text);
  assert.equal(confirmed.structuredContent.record.phases[4].status, 'confirmed');
  const actualPdf = Buffer.from(confirmed._meta.artifacts.pdf.blob, 'base64');
  assert.equal(actualPdf.subarray(0, 5).toString(), '%PDF-');
  assert(actualPdf.length > 5000, 'The confirmation must create the real PDF, not a signature stub.');
  const checkpointHtml = await readFile(new URL('../dist/widget.html', import.meta.url), 'utf8');
  frame = await mount(checkpointHtml, confirmed);
  await frame.getByRole('button', { name: 'Download workbook PDF', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Download workbook PDF', exact: true }).click();
  await frame.getByText('The host accepted the download request.', { exact: false }).waitFor();
  const download = await page.evaluate(() => window.calls.find(call => call.method === 'ui/download-file').params);
  assert.equal(download.contents[0].resource.mimeType, 'application/pdf');
  assert.equal(download.contents[0].resource.blob, confirmed._meta.artifacts.pdf.blob);
  await page.evaluate(() => { window.deny = true; });
  await frame.getByRole('button', { name: 'Download JSON checkpoint', exact: true }).click();
  await frame.getByText('The download was declined or cancelled.', { exact: false }).waitFor();
  assert.equal(externalRequests.length, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'pass', prefab: '0.20.2', protocol: '0.3', pdfBytes: actualPdf.length, checked: ['real bundled renderer', 'three candidate cards', 'priority selection and multiple-First warning', 'evidence-gap edit', 'assumption correction and retained later work', 'input to review and SendMessage', 'host-normalised MCP save', 'unsaved confirmation blocked', 'saved revision review and explicit approval', 'actual confirmation PDF', 'revision label', 'message denial', '320px and 390px', 'exact PDF download payload', 'JSON denial', 'zero external requests', 'no runtime errors'], boundary: 'Local SDK protocol harness with a deterministic message parser and real MCP server/PDF renderer; not ChatGPT or Claude runtime proof.' }, null, 2));
} finally {
  await browser.close();
  await client.close();
  await server.close();
}
