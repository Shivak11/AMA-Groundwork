import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWorkbookHtml } from '../src/render-workbook.mjs';
import { renderBookOverview, renderBookVisual, escapeBookText } from '../src/book-visuals.mjs';

function fixture() {
  const candidate = id => ({
    id, title: `Named use case ${id}`, taskIds: ['t2', 't1'],
    aiWork: `AI work for ${id}`, value: `An untested benefit for ${id}`, humanCheck: `Human judgement for ${id}`,
    nonAiAlternative: `Manual alternative for ${id}`, assumption: `Unknown assumption for ${id}`,
    inputs: `Permitted input for ${id}`, output: `Output for ${id}`, trigger: `User request for ${id}`,
    knowledge: 'Unknown', format: `Agreed format for ${id}`, access: `Restricted access for ${id}`,
    workflow: [{actor: 'Person', action: `Provide permitted material for ${id}`}, {actor: 'AI', action: `Prepare draft for ${id}`}, {actor: 'Person', action: `Review before sharing for ${id}`}],
    implementation: {approach: `Proposed approach for ${id}`, components: [{kind:'Skill',purpose:`Use the agreed instructions for ${id}`,basis:`The group repeats this format for ${id}`,status:'Proposed'}, {kind:'Connector',purpose:`Read permitted input for ${id}`,basis:`Approved source access is needed for ${id}`,status:'Needs confirmation'}], checks: `Permission and usefulness remain unverified for ${id}`},
  });
  const phaseAnswers = [
    {outcome:'Our desired outcome',kpi:'Our actual recorded measure',baseline:'Unknown',guardrail:'Preserve human control',hypothesis:'Untested hypothesis'},
    {blockers:[],firstGap:'Unknown'},
    {underlyingProblem:'Our confirmed underlying problem',workflows:['The named current workflow'],chosenWorkflow:'The named current workflow',recentCase:'The actual recorded case',tasks:[{id:'t1',actor:'Manager',work:'The first recorded task',friction:'Unknown'},{id:'t2',actor:'Reviewer',work:'The second recorded task',friction:'Unknown'}],zeroSecond:'A decision still remains',redesign:'A proposed change'},
    {candidates:[candidate('c1'),candidate('c2')]},
    {choices:[{candidateId:'c1',decision:'Later',reason:'Not ready yet',evidenceGap:'Unknown'},{candidateId:'c2',decision:'Do not pursue',reason:'A manual method suffices',evidenceGap:'Unknown'}],challenge:'Question the added value',costs:'Unknown'},
    {decision:'Do not pilot yet',candidateId:null,recommendation:'Read the completed comparison before considering any implementation.'},
  ];
  return {schemaVersion:1,experienceVersion:2,revision:12,group:{name:'Fictional 1A',members:['Shiva','Chirag'],problem:'The original problem supplied by the group',context:'Fictional renderer test',date:'2026-09-12'},phases:phaseAnswers.map((answers,index)=>({id:index+1,status:'confirmed',answers}))};
}

test('overview follows cover and distinguishes original problem, agreed diagnosis and named use cases', () => {
  const record = fixture();
  const html = renderWorkbookHtml(record);
  assert(html.indexOf('id="book-title"') < html.indexOf('id="workbook-overview"'));
  assert(html.indexOf('id="workbook-overview"') < html.indexOf('id="phase-1"'));
  const overview = renderBookOverview(record);
  for (const text of [record.group.problem, record.phases[2].answers.underlyingProblem, ...record.phases[3].answers.candidates.flatMap(candidate=>[candidate.title,candidate.aiWork])]) assert(overview.includes(escapeBookText(text)));
  assert.match(overview,/The underlying problem confirmed by the group/);
});

test('legacy or reopened diagnosis is not invented or presented as a new agreement', () => {
  const record = fixture();
  delete record.phases[2].answers.underlyingProblem;
  assert.match(renderBookOverview(record),/Not recorded in this workbook\./);
  assert(!renderBookOverview(record).includes('Our desired outcome'));
  record.phases[2].answers.underlyingProblem = 'SAVED_DIAGNOSIS';
  record.phases[2].status = 'needs_review';
  assert.match(renderBookOverview(record),/SAVED_DIAGNOSIS/);
  assert.match(renderBookOverview(record),/This diagnosis needs review/);
  assert(!renderBookOverview(record).includes('The underlying problem confirmed by the group'));
  record.phases[2].status = 'draft';
  assert(!renderBookOverview(record).includes('SAVED_DIAGNOSIS'));
});

test('every use case has named current work, accessible proposed workflow and grounded requirements', () => {
  const record = fixture();
  const html = renderBookVisual(record,4);
  assert.equal((html.match(/data-flow="current"/g)||[]).length,2);
  assert.equal((html.match(/data-flow="proposed"/g)||[]).length,2);
  assert(html.indexOf('The first recorded task') < html.indexOf('The second recorded task'));
  assert.match(html,/<figure class="use-case-flow"[^>]*aria-label=/);
  assert.match(html,/<svg class="flow-arrow"[^>]*aria-hidden="true"/);
  for (const candidate of record.phases[3].answers.candidates) {
    for (const key of ['inputs','output','trigger','knowledge','format','access','humanCheck','nonAiAlternative','value','assumption']) assert(html.includes(escapeBookText(candidate[key])),key);
    for (const step of candidate.workflow) assert(html.includes(escapeBookText(step.action)));
  }
  assert.match(html,/Our actual recorded measure/);
});

test('implementation terms are explained once while proposals and unresolved checks stay explicit', () => {
  const html = renderBookVisual(fixture(),4);
  assert.equal((html.match(/Reusable instructions and an output format for a repeated task\./g)||[]).length,1);
  assert.equal((html.match(/A permitted connection for reading or passing information between tools\./g)||[]).length,1);
  for (const text of ['Proposed approach for c1','Use the agreed instructions for c1','The group repeats this format for c1','Needs confirmation','Permission and usefulness remain unverified for c1','not a verified or deployed integration']) assert(html.includes(text));
});

test('no-pilot completion retains every candidate and does not create missing pilot fields or build offers', () => {
  const record = fixture();
  const html = renderBookVisual(record,6);
  for (const text of ['Do not pilot yet','Named use case c1','Named use case c2','Later','Do not pursue']) assert(html.includes(text));
  assert(!html.includes('Not recorded'));
  assert(!html.includes('test-candidate'));
  assert(!/shall we|would you like|start building|let.s build/i.test(html));
  record.phases[5].answers = {recommendation:'Keep both documented use cases for later reflection.'};
  const recommendationOnly = renderBookVisual(record,6);
  assert(recommendationOnly.includes('Keep both documented use cases for later reflection.'));
  assert(recommendationOnly.includes('Named use case c2'));
  assert(!recommendationOnly.includes('Not recorded'));
  assert(!recommendationOnly.includes('test-accountability'));
});

test('legacy candidates remain exportable with honest absent implementation and workflow labels', () => {
  const record = fixture();
  for(const candidate of record.phases[3].answers.candidates) for(const key of ['inputs','output','trigger','knowledge','format','access','workflow','implementation']) delete candidate[key];
  const html = renderBookVisual(record,4);
  assert.match(html,/No implementation proposal is recorded in this workbook\./);
  assert.match(html,/No proposed sequence is recorded in this workbook\./);
  assert.match(html,/The first recorded task/);
  assert(!html.includes('Retrieval-augmented'));
});

test('all new text is escaped without truncation and render leaves the canonical record untouched', () => {
  const record = fixture();
  const hostile = '<script>alert("bad")</script> & <img src=x onerror=bad()> ' + 'अ'.repeat(700);
  record.phases[2].answers.underlyingProblem = hostile;
  const candidate = record.phases[3].answers.candidates[0];
  candidate.inputs = hostile;
  candidate.workflow[0].action = hostile;
  candidate.implementation.components[0].basis = hostile;
  const before = JSON.stringify(record);
  const html = renderWorkbookHtml(record);
  assert.equal(JSON.stringify(record),before);
  assert(html.includes(escapeBookText(hostile)));
  assert(!html.includes('<script>'));
  assert(!html.includes('<img'));
  assert(!html.includes('<foreignObject'));
  assert(!html.includes('src="http'));
});
