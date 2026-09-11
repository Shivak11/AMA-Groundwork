import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPrefabView, loadPrefabRenderer } from '../prefab/adapter.mjs';
import { createCompiledPrefabAdapter } from '../prefab/compiled-view.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinel = 'BUILD_ONLY_SAMPLE_71f3';
const phaseTitles = [
  'What should improve?', 'What prevents progress?', 'What actually happens?',
  'Where could AI help?', 'Which should we pursue first?', 'What do we recommend?',
];

// Build-only records select component branches. Their state is never emitted as a default.
function sample(count, { complete = false, status5 = 'draft', status6 = 'draft', rich = false } = {}) {
  const text = rich ? `${sentinel} <script>void 0</script> & "quotes" {{ source.0.title }}\nनमस्ते` : sentinel;
  const candidates = Array.from({ length: count }, (_, index) => ({
    id: `candidate_${index}`, title: `${text} ${index}`, taskIds: index ? ['step_1'] : [],
    aiWork: text, value: text, humanCheck: text, nonAiAlternative: text, assumption: text,
  }));
  const phaseAnswers = [
    { outcome: text, kpi: text, baseline: text, guardrail: text, hypothesis: text },
    { blockers: [{ information: text, holder: text, barrier: text, unlock: text }], firstGap: text },
    { workflows: [text], chosenWorkflow: text, recentCase: text,
      tasks: [{ id: 'step_1', actor: text, work: text, friction: text }], zeroSecond: text, redesign: text },
    { candidates },
    { ...(complete ? { choices: candidates.map((candidate, index) => ({
      candidateId: candidate.id, decision: index === 0 ? 'First' : index % 2 ? 'Later' : 'Do not pursue', reason: text, evidenceGap: text,
    })), challenge: text, costs: text } : { challenge: '  ', costs: '' }) },
    { decision: 'Do not pilot yet', candidateId: null, owner: text, evidence: text,
      peopleChange: text, test: text, stopRule: text, recommendation: text },
  ];
  return {
    schemaVersion: 1, group: { name: text, problem: text, members: [text], context: text, date: '2026-09-08' }, revision: 19,
    phases: phaseAnswers.map((answers, index) => ({ id: index + 1,
      status: index < 4 ? 'confirmed' : index === 4 ? status5 : status6, answers })),
  };
}

function uniquePath(value, match) {
  const found = [];
  function walk(node, keys = []) {
    if (!node || typeof node !== 'object') return;
    if (match(node)) found.push(keys);
    for (const [key, child] of Object.entries(node)) walk(child, [...keys, key]);
  }
  walk(value);
  assert.equal(found.length, 1, 'The pinned Prefab structure changed. Review the compiler before rebuilding.');
  return found[0];
}
const atPath = (value, keys) => keys.reduce((current, key) => current[key], value);
const reviewPath = envelope => [...uniquePath(envelope, node => node.type === 'Card' && node.cssClass === 'review-card'), 'children'];
const chapterPath = envelope => [...uniquePath(envelope, node => node.type === 'AccordionItem' && node.title === 'Review the accumulated workbook'), 'children'];

const templates = { schemaVersion: 1, prefabVersion: '0.20.2', protocolVersion: '0.3', layouts: {}, chapters: {} };
for (let count = 1; count <= 5; count++) {
  const envelope = await buildPrefabView(sample(count));
  assert.equal(envelope.$prefab.version, templates.protocolVersion);
  const { dirty, reviewed, pending, notice } = envelope.state;
  const initialState = { dirty, reviewed, pending, notice };
  if (templates.initialState) assert.deepEqual(templates.initialState, initialState);
  else templates.initialState = initialState;
  delete envelope.state;
  const reviewChildrenPath = reviewPath(envelope);
  const chapterChildrenPath = chapterPath(envelope);
  atPath(envelope, chapterChildrenPath).length = 0;
  templates.layouts[count] = { envelope, reviewChildrenPath, chapterChildrenPath };
}
const complete = await buildPrefabView(sample(1, { complete: true }));
templates.confirmationButton = structuredClone(atPath(complete, uniquePath(complete, node => node.type === 'Button' && node.label === 'Confirm the saved shortlist')));

for (const status of ['confirmed', 'needs_review']) {
  const envelope = await buildPrefabView(sample(1, { complete: true, status5: status, status6: status }));
  const children = atPath(envelope, chapterPath(envelope));
  for (let id = 1; id <= 6; id++) {
    if (id < 5 && status === 'needs_review') continue;
    const start = children.findIndex(node => node.type === 'Heading' && node.level === 3 && node.content === phaseTitles[id - 1]);
    assert(start >= 0);
    const nextHeading = children.findIndex((node, index) => index > start && node.type === 'Heading' && node.level === 3);
    templates.chapters[id] ??= {};
    templates.chapters[id][id < 5 ? 'confirmed' : status] = children.slice(start, nextHeading < 0 ? undefined : nextHeading);
  }
}

const json = JSON.stringify(templates);
assert(!json.includes(sentinel), 'Build-only sample data must not be emitted in live assets.');
assert(!json.includes('"state":'), 'The template must not contain an example group state.');
const renderer = await loadPrefabRenderer();
const adapter = createCompiledPrefabAdapter({ templates: JSON.parse(json), rendererHtml: renderer });
let equivalentCases = 0;
for (let count = 1; count <= 5; count++) {
  for (const status5 of ['draft', 'confirmed', 'needs_review']) {
    for (const status6 of ['draft', 'confirmed', 'needs_review']) {
      for (const complete of [false, true]) {
        const record = sample(count, { complete, status5, status6, rich: true });
        const before = structuredClone(record);
        const actual = await adapter.buildPrefabView(record);
        assert.deepEqual(actual, await buildPrefabView(record), `Python parity failed for ${count}/${status5}/${status6}/${complete}`);
        assert.deepEqual(record, before, 'View generation must not change the group record.');
        equivalentCases++;
      }
    }
  }
}
for (const count of [0, 6]) {
  await assert.rejects(adapter.buildPrefabView(sample(count)), /at least one candidate/);
}
for (const whitespace of ['\u0085', '\u001c', '\ufeff']) {
  const record = sample(2, { complete: true });
  record.phases[4].answers.challenge = whitespace;
  assert.deepEqual(await adapter.buildPrefabView(record), await buildPrefabView(record), 'Python whitespace parity');
}
const unconfirmed = sample(1);
unconfirmed.phases[3].status = 'draft';
await assert.rejects(adapter.buildPrefabView(unconfirmed), /Confirm phases 1–4/);
await assert.rejects(adapter.buildPrefabView({ ...sample(1), padding: 'x'.repeat(1_000_000) }), /too large/);
assert.equal(await adapter.loadPrefabRenderer(), renderer);

await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', 'prefab-templates.json'), `${json}\n`);
await writeFile(path.join(root, 'dist', 'prefab-renderer.html'), renderer);
console.log(JSON.stringify({
  result: 'pass', prefab: templates.prefabVersion, protocol: templates.protocolVersion,
  equivalentCases, templateBytes: Buffer.byteLength(json), rendererBytes: Buffer.byteLength(renderer),
  checks: ['all candidate counts', 'complete and incomplete answers', 'draft, confirmed and needs-review chapters',
    'identical controls and action messages', 'HTML and template-like text remains record state',
    'Python whitespace parity', 'no record mutation', 'missing candidates and unconfirmed phase rejection', 'input size limit', 'no sample data in bundled templates'],
  boundary: 'Exact envelope equality to the pinned Python builder; client rendering remains a separate test.',
}, null, 2));
