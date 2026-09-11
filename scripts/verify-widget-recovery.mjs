import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createRecord, savePhase, confirmPhase, phaseGuide, readableSummary, recordSchema, validateRecord } from '../src/workshop.mjs';
import { applyWorkshopAction } from '../src/actions.mjs';
import { group, answers } from '../examples/shared-services.mjs';

// Actual dist/widget.html; controlled MCP Apps host with actual domain actions.
// No network, model, accounts, PDF engine or deployment is involved in this test.
const html = await readFile(new URL('../dist/widget.html', import.meta.url), 'utf8');
const output = new URL(`../output/widget-recovery/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
const bookHtml = '<!doctype html><html><head><meta charset="utf-8"></head><body style="height:2600px"><h1>Fictional group book</h1><p>Retained reading position.</p></body></html>';
const checks = [], errors = [], network = [], calls = [], syncs = [];
let browser, page, frame, latestResult, holdNext = false, held = null, rejectSync = false, alterGroupReply = false;
const resultFor = record => ({ content: [{ type: 'text', text: readableSummary(record) }], structuredContent: { record, phase: phaseGuide(record), summary: readableSummary(record), mode: 'ui-available' }, _meta: { bookHtml, artifacts: { checkpoint: { name: `record-${record.revision}.json`, text: JSON.stringify(record) } } } });
const partial = () => savePhase(createRecord(group), 1, { outcome: answers[0].outcome, kpi: answers[0].kpi });
const full = () => savePhase(createRecord(group), 1, answers[0]);
const stamp = name => checks.push({ name, result: 'pass' });
async function tick() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function emit(payload) { await page.evaluate(result => document.querySelector('#app').contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result }, '*'), payload); await tick(); }
async function shownRecord() { return JSON.parse(await frame.getByLabel('Complete JSON record', { exact: true }).first().inputValue()); }
async function waitRevision(revision) { await frame.getByLabel('Complete JSON record', { exact: true }).first().evaluate((node, expected) => new Promise((resolve, reject) => { const start = performance.now(); function poll() { const current = document.querySelector('textarea[aria-label="Complete JSON record"]'); if (current && JSON.parse(current.value).revision === expected) return resolve(); if (performance.now() - start > 7000) return reject(new Error(`Expected revision ${expected}`)); requestAnimationFrame(poll); } poll(); }), revision); }
async function waitIdle() { await frame.locator('#workshop-root[aria-busy="false"]').waitFor(); }
async function mount(record) {
  rejectSync = false; alterGroupReply = false; holdNext = false; held = null; latestResult = resultFor(record);
  await page.setContent('<!doctype html><html><body style="margin:0"><iframe id="app" title="Controlled workshop host" sandbox="allow-scripts" style="width:100%;height:1200px;border:0"></iframe></body></html>');
  await page.evaluate(({ html, initial }) => {
    if (window.recoveryListener) window.removeEventListener('message', window.recoveryListener);
    window.recoveryContexts = [];
    window.recoveryListener = async event => {
      if (event.source !== document.querySelector('#app')?.contentWindow) return;
      const req = event.data; if (req?.jsonrpc !== '2.0') return;
      const reply = result => event.source.postMessage({ jsonrpc: '2.0', id: req.id, result }, '*');
      try {
        if (req.method === 'ui/initialize') reply({ protocolVersion: req.params.protocolVersion, hostInfo: { name: 'Recovery regression host', version: '1' }, hostCapabilities: { serverTools: {}, updateModelContext: {}, message: { text: {} }, logging: {}, downloadFile: {} }, hostContext: { theme: 'light', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'], styles: { variables: { '--color-text-primary': '#202020', '--color-background-primary': '#ffffff' } } } });
        else if (req.method === 'ui/notifications/initialized') event.source.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: initial }, '*');
        else if (req.method === 'tools/call') reply(await window.recoveryCall(req.params));
        else if (req.method === 'ui/update-model-context') { await window.recoverySync(req.params); window.recoveryContexts.push(req.params); reply({}); }
        else if (req.method === 'ui/request-display-mode') reply({ mode: req.params.mode });
        else if (req.id !== undefined) reply({});
      } catch (error) { event.source.postMessage({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: error.message } }, '*'); }
    };
    window.addEventListener('message', window.recoveryListener); document.querySelector('#app').srcdoc = html;
  }, { html, initial: latestResult });
  frame = page.frameLocator('#app'); await frame.locator('.activity').waitFor(); await waitIdle();
}
async function edit(field, text) { const node = frame.locator(`[data-field="${field}"]`); await node.getByRole('button', { name: /^Edit |^Add / }).click(); await node.locator('textarea').fill(text); return node; }
async function chooseUnknown() { await frame.getByRole('button', { name: 'We do not know it yet', exact: true }).click(); }
async function waitHeld() { for (let attempt = 0; attempt < 50 && !held; attempt++) await tick(); assert(held, 'The mocked host should be holding one action reply.'); }
function releaseHeld() { assert(held); const entry = held; held = null; entry.resolve(entry.result); return entry.result; }

let failure;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }); page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, route => { network.push(route.request().url()); return route.abort(); });
  await page.exposeFunction('recoveryCall', async params => {
    assert.equal(params.name, 'workshop_action', 'This bounded test must not invoke unrelated tools.');
    calls.push({ kind: params.arguments.action.kind, revision: params.arguments.record.revision });
    latestResult = resultFor(applyWorkshopAction(params.arguments.record, params.arguments.action));
    const reply = structuredClone(latestResult);
    if (alterGroupReply) reply.structuredContent.record.group.name = 'An unrelated fictional group';
    if (holdNext) { holdNext = false; return new Promise(resolve => { held = { resolve, result: reply }; }); }
    return reply;
  });
  await page.exposeFunction('recoverySync', params => { syncs.push({ revision: params.structuredContent?.record?.revision, accepted: !rejectSync }); if (rejectSync) throw new Error('Controlled context rejection.'); return {}; });

  // A successful save and failed sync must remain blocked after an idle host echo.
  const start = partial(); await mount(start); rejectSync = true; await chooseUnknown();
  await frame.getByRole('button', { name: 'Retry sharing with the conversation', exact: true }).waitFor(); await waitIdle();
  const saved = latestResult; assert.equal((await shownRecord()).revision, start.revision + 1);
  await emit(saved);
  assert(await frame.getByRole('button', { name: 'Continue in the conversation', exact: true }).isDisabled());
  assert.equal(await frame.locator('.sync-recovery').count(), 1);
  assert(await frame.locator('[data-field="baseline"] .text-control').isDisabled());
  rejectSync = false; await frame.getByRole('button', { name: 'Retry sharing with the conversation', exact: true }).click(); await waitIdle();
  assert.equal(await frame.locator('.sync-recovery').count(), 0); assert.equal(await frame.getByRole('button', { name: 'Continue in the conversation', exact: true }).isDisabled(), false);
  stamp('Failed context sync remains blocked after identical idle host echo, then recovers after an acknowledged retry');

  // Draft fields, open editor and ordinary disclosure survive tab and host rerenders.
  const drafted = full(); await mount(drafted);
  await frame.getByText('Review and approve Step 1', { exact: true }).click();
  await frame.getByLabel('Our group approves this saved summary.', { exact: true }).check();
  assert.equal(await frame.getByRole('button', { name: 'Confirm and add chapter', exact: true }).isDisabled(), false);
  await frame.getByText('Read the full saved wording', { exact: true }).click();
  const draftText = 'Reduce repeated requests while keeping the equipment approval checks.';
  await edit('outcome', draftText); await edit('guardrail', 'Keep this second unsaved safeguard draft.');
  assert(await frame.getByRole('button', { name: 'Confirm and add chapter', exact: true }).isDisabled());
  await frame.getByText('Save or cancel your unsaved wording before approving this chapter.', { exact: true }).waitFor();
  stamp('Unsaved wording prevents chapter approval even after its saved summary was checked');
  await frame.getByRole('button', { name: 'Our book', exact: true }).click();
  await frame.frameLocator('.book-frame').getByRole('heading', { name: 'Fictional group book', exact: true }).waitFor();
  await frame.locator('.book-frame').evaluate(node => { node.dataset.continuity = 'retained'; });
  await frame.frameLocator('.book-frame').locator('body').evaluate(node => { node.dataset.continuity = 'retained'; document.scrollingElement.scrollTop = 450; });
  await frame.getByRole('button', { name: 'Activity', exact: true }).click();
  assert.equal(await frame.locator('#edit-outcome').inputValue(), draftText);
  assert.equal(await frame.locator('#edit-guardrail').inputValue(), 'Keep this second unsaved safeguard draft.');
  await emit(resultFor(drafted));
  assert.equal(await frame.locator('#edit-outcome').inputValue(), draftText);
  assert(await frame.getByText('Read the full saved wording', { exact: true }).evaluate(node => node.parentElement.open));
  assert.equal(await frame.locator('.book-frame').getAttribute('data-continuity'), 'retained');
  await frame.getByRole('button', { name: 'Our book', exact: true }).click();
  assert.equal(await frame.frameLocator('.book-frame').locator('body').getAttribute('data-continuity'), 'retained');
  assert.equal(await frame.frameLocator('.book-frame').locator('body').evaluate(() => document.scrollingElement.scrollTop), 450);
  await frame.getByRole('button', { name: 'Activity', exact: true }).click();
  await frame.locator('[data-field="outcome"]').getByRole('button', { name: 'Save wording', exact: true }).click(); await waitRevision(drafted.revision + 1); await waitIdle();
  assert.equal(await frame.locator('#edit-outcome').count(), 0, 'Only the accepted submitted draft should close.');
  assert.equal(await frame.locator('#edit-guardrail').inputValue(), 'Keep this second unsaved safeguard draft.');
  assert.equal((await shownRecord()).phases[0].answers.outcome, draftText);
  stamp('Keyed unsaved drafts and disclosures survive tabs/identical echo; own accepted save clears only that field');
  stamp('Unchanged book iframe DOM, document and scroll position survive activity and host rerenders');

  // Same name and revision do not make conflicting contents safe to accept.
  const conflictBase = partial(); await mount(conflictBase);
  const conflict = structuredClone(conflictBase); conflict.phases[0].answers.outcome = 'A conflicting saved outcome with the same group name.';
  await emit(resultFor(conflict)); await frame.locator('#record-conflict').waitFor();
  assert(await frame.getByRole('button', { name: 'We do not know it yet', exact: true }).isDisabled());
  assert.deepEqual(await shownRecord(), conflictBase);
  await emit(resultFor(conflictBase)); assert.equal(await frame.locator('#record-conflict').count(), 1);
  await frame.getByRole('button', { name: 'Keep this view’s record', exact: true }).click(); await waitIdle();
  assert.equal(await frame.locator('#record-conflict').count(), 0); assert.deepEqual(await shownRecord(), conflictBase);
  assert.equal(await frame.getByRole('button', { name: 'We do not know it yet', exact: true }).isDisabled(), false);
  stamp('Same-revision different contents block edits until an explicit record choice and successful context sync');
  await edit('outcome', 'Retain this unsaved alternative while reviewing the incoming record.');
  await emit(resultFor(conflict)); await frame.locator('#record-conflict').waitFor();
  await frame.getByRole('button', { name: 'Use the conversation’s record', exact: true }).click(); await waitIdle();
  assert.deepEqual(await shownRecord(), conflict);
  assert.equal(await frame.locator('#edit-outcome').inputValue(), 'Retain this unsaved alternative while reviewing the incoming record.');
  await frame.getByText(/The saved wording changed while this draft was open/).waitFor();
  assert.match(await frame.locator('[data-field="outcome"] .phase-note').innerText(), /A conflicting saved outcome/);
  stamp('Explicit conflict adoption retains an unsaved draft and displays the changed authoritative wording before a possible overwrite');

  // Old v1 records support a name/date edit, but it is never an automatic group switch.
  const renameBase = partial(); await mount(renameBase);
  const renamed = savePhase(renameBase, 1, {}, { name: 'Renamed Service Group', date: '2026-09-12' });
  await emit(resultFor(renamed)); await frame.locator('#record-conflict').waitFor();
  assert.deepEqual(await shownRecord(), renameBase); assert(await frame.getByRole('button', { name: 'We do not know it yet', exact: true }).isDisabled());
  await frame.getByRole('button', { name: 'Use updated details for our group', exact: true }).click(); await waitIdle();
  assert.deepEqual(await shownRecord(), renamed); assert.equal(await frame.locator('#record-conflict').count(), 0);
  stamp('Legacy group name/date change is staged and adopted only after participant confirmation and context sync');
  await mount(partial()); alterGroupReply = true; await chooseUnknown();
  await frame.getByText(/An action reply unexpectedly changed the group details/).waitFor(); await waitIdle();
  assert.deepEqual(await shownRecord(), partial());
  stamp('Unexpected group metadata in a direct action response is not adopted');

  // Structural success alone is insufficient: references must pass the domain validator.
  let workRecord = createRecord(group);
  for (let phase = 1; phase <= 2; phase++) { workRecord = savePhase(workRecord, phase, answers[phase - 1]); workRecord = confirmPhase(workRecord, phase, 'The fictional group approves.'); }
  workRecord = savePhase(workRecord, 3, answers[2]); await mount(workRecord);
  const invalid = structuredClone(workRecord); invalid.revision += 1; invalid.interaction = { barrierCategories: {}, candidateDispositions: {}, priorities: {}, zeroTaskId: 'missing-task' };
  assert(recordSchema.safeParse(invalid).success); assert.throws(() => validateRecord(invalid));
  await emit(resultFor(invalid)); await frame.getByText(/did not return a complete valid group record/).waitFor();
  assert.deepEqual(await shownRecord(), workRecord);
  stamp('Semantically invalid zeroTaskId is rejected despite structural recordSchema success');

  // No-op replies are accepted, while duplicate echoes cannot release an active request.
  const noOp = full(); await mount(noOp); await edit('outcome', noOp.phases[0].answers.outcome);
  await frame.locator('[data-field="outcome"]').getByRole('button', { name: 'Save wording', exact: true }).click(); await waitIdle();
  assert.equal((await shownRecord()).revision, noOp.revision); assert.equal(await frame.locator('#edit-outcome').count(), 0);
  stamp('Exact no-op same-revision action result is accepted and shared');
  const pendingBase = partial(); await mount(pendingBase); holdNext = true; await chooseUnknown(); await waitHeld();
  await emit(resultFor(pendingBase)); assert(await frame.getByRole('button', { name: 'We do not know it yet', exact: true }).isDisabled());
  const released = releaseHeld(); await waitRevision(released.structuredContent.record.revision); await waitIdle();
  assert.deepEqual(await shownRecord(), released.structuredContent.record);
  stamp('Duplicate pending host result does not cancel the awaited direct action response');

  const lateBase = partial(); await mount(lateBase); holdNext = true; await chooseUnknown(); await waitHeld();
  const newer = savePhase(held.result.structuredContent.record, 1, { guardrail: 'A newer safeguard from the conversation.' });
  await emit(resultFor(newer)); await waitRevision(newer.revision); releaseHeld(); await tick(); await tick();
  assert.deepEqual(await shownRecord(), newer);
  await emit(resultFor(lateBase)); await frame.getByText(/An older reply arrived and was ignored/).waitFor(); assert.deepEqual(await shownRecord(), newer);
  stamp('Late direct reply and older idle notification cannot overwrite a newer host record');

  assert.deepEqual(errors, []); assert.deepEqual(network, []);
} catch (error) { failure = error; console.error(error.stack); }
finally {
  if (held) releaseHeld();
  await browser?.close(); await mkdir(output, { recursive: true });
  const evidence = { result: failure ? 'fail' : 'pass', boundary: 'Actual bundled widget in a controlled local MCP Apps host with actual domain actions. No external network, Claude/ChatGPT client, model, PDF or deployment proof.', widgetSha256: createHash('sha256').update(html).digest('hex'), checks, calls, syncs, errors, network, failure: failure?.message ?? null };
  await writeFile(new URL('evidence.json', output), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ result: evidence.result, checks: checks.length, evidence: fileURLToPath(new URL('evidence.json', output)) }));
}
if (failure) process.exitCode = 1;
