import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderWorkbookHtml } from '../src/render-workbook.mjs';
import { escapeBookText, renderBookVisual, renderBookVisualParts, renderBookWorkflowComparisons } from '../src/book-visuals.mjs';

function fixture() {
  const tasks = [
    {id:'t1',actor:'Team member',work:'Write the current update',friction:'Missing detail'},
    {id:'t2',actor:'Manager',work:'Ask for the missing detail',friction:'Repeated follow-up'},
    {id:'t3',actor:'Manager',work:'Read the clarification',friction:'Time to review'},
    {id:'t4',actor:'Finance',work:'Approve an unrelated purchase',friction:'Unknown'},
  ];
  const candidate = (id, title) => ({
    id,title,taskIds:['t1','t2','t3'],aiWork:'Prepare an agreed update',humanCheck:'The member checks the update before it is shared.',
    nonAiAlternative:'Use a shared form',value:'Unknown improvement',assumption:'The agreed format helps',output:'An employee-correctable update',
    workflow:[{actor:'Person',action:'Provide the first update'},{actor:'AI',action:'Ask one agreed clarification'},{actor:'Person',action:'Check the proposed wording'},{actor:'System',action:'Save the approved wording'}],
    implementation:{approach:'An untested proposal',components:[{kind:'Skill',purpose:'Apply the agreed update format',basis:'The group uses a repeated format',status:'Proposed'},{kind:'Connector',purpose:'Read permitted updates',basis:'Source access is unresolved',status:'Needs confirmation'}],checks:'Confirm permission'},
  });
  const phaseAnswers = [
    {outcome:'Fewer repeated follow-ups',kpi:'Usefulness of agreed updates',baseline:'Unknown',guardrail:'No covert monitoring',hypothesis:'Agree one checkpoint'},
    {blockers:[],firstGap:'Unknown'},
    {tasks,underlyingProblem:'Updates omit the detail needed for a decision',workflows:['Team update'],chosenWorkflow:'Team update',recentCase:'A fictional delayed update',zeroSecond:'A dependency remains',redesign:'One agreed checkpoint'},
    {candidates:[candidate('c1','Clarify an agreed update')]},
    {choices:[{candidateId:'c1',decision:'Later',reason:'Permission is unresolved',evidenceGap:'Unknown'}],challenge:'Compare with a form',costs:'Unknown'},
    {recommendation:'Retain the comparison for review.',decision:'Do not pilot yet',candidateId:null,workflowComparisons:[{candidateId:'c1',stages:[
      {taskIds:['t1','t2'],proposedStepIndices:[0]},
      {taskIds:['t3'],proposedStepIndices:[]},
      {taskIds:[],proposedStepIndices:[1,2]},
      {taskIds:[],proposedStepIndices:[3]},
    ]}]},
  ];
  return {schemaVersion:1,experienceVersion:2,revision:12,group:{name:'Fictional comparison group',members:['Shiva','Chirag'],problem:'Repeated follow-ups',date:'2026-09-12'},phases:phaseAnswers.map((answers,index)=>({id:index+1,status:'confirmed',answers}))};
}

test('final chapter pairs only explicitly mapped related work in separate pagination units', () => {
  const record = fixture();
  const parts = renderBookWorkflowComparisons(record);
  const pairs = parts.filter(part=>part.includes('class="book-comparison-pair'));
  assert.equal(pairs.length,4);
  assert(pairs.every(part=>(part.match(/class="book-comparison-pair/g)||[]).length===1));
  assert.match(pairs[0],/Write the current update[\s\S]*Ask for the missing detail[\s\S]*Provide the first update/);
  assert(!pairs[0].includes('Ask one agreed clarification'));
  assert.match(pairs[1],/Read the clarification/);
  assert.match(pairs[1],/This current step is not included in the proposal\./);
  assert.match(pairs[2],/This is an added step in the proposal\./);
  assert.match(pairs[2],/Ask one agreed clarification[\s\S]*Check the proposed wording/);
  assert(!parts.join('').includes('Approve an unrelated purchase'));
  assert.match(pairs[0],/<th scope="col">Current work<\/th><th scope="col">Proposed work<\/th>/);
  assert.match(pairs[0],/current tasks linked to this use case/);
});

test('missing or invalid alignment shows separate sequences without invented positional pairs', () => {
  const record = fixture();
  delete record.phases[5].answers.workflowComparisons;
  const separate = renderBookWorkflowComparisons(record).join('');
  assert(!separate.includes('class="book-comparison-pair'));
  assert.match(separate,/no exact stage mapping is confirmed/);
  assert.equal((separate.match(/data-sequence="current"/g)||[]).length,3);
  assert.equal((separate.match(/data-sequence="proposed"/g)||[]).length,4);
  assert(separate.indexOf('Read the clarification')<separate.indexOf('Provide the first update'));
  record.phases[5].answers.workflowComparisons = [{candidateId:'c1',stages:[{taskIds:['t4'],proposedStepIndices:[0]}]}];
  const invalid = renderBookWorkflowComparisons(record).join('');
  assert(!invalid.includes('class="book-comparison-pair'));
  assert.match(invalid,/no exact stage mapping is confirmed/);
  assert(!invalid.includes('Approve an unrelated purchase'));
});

test('every deferred or rejected use case retains its own workflow and case-level components without a pilot', () => {
  const record = fixture();
  const second = structuredClone(record.phases[3].answers.candidates[0]);
  second.id='c2';second.title='Prepare the manager brief';second.taskIds=['t3'];
  second.workflow=[{actor:'AI',action:'Draft the manager brief'},{actor:'Person',action:'Approve the manager brief'}];
  second.implementation.components=[{kind:'RAG',purpose:'Find permitted guidance',basis:'The group needs current policy',status:'Needs confirmation'}];
  record.phases[3].answers.candidates.push(second);
  record.phases[4].answers.choices.push({candidateId:'c2',decision:'Do not pursue',reason:'Use the manual option',evidenceGap:'Unknown'});
  const parts=renderBookWorkflowComparisons(record), html=renderBookVisual(record,6);
  assert.match(html,/Clarify an agreed update/);
  assert.match(html,/Prepare the manager brief/);
  assert.match(html,/Recorded priority: Later/);
  assert.match(html,/Recorded priority: Do not pursue/);
  assert.match(html,/Do not pilot yet/);
  assert.equal((html.match(/Apply the agreed update format/g)||[]).length,1);
  assert(!html.includes('The group uses a repeated format'));
  assert.match(renderBookVisual(record,4),/The group uses a repeated format/);
  assert(parts.filter(part=>part.includes('class="book-comparison-pair')).every(part=>!part.includes('Read permitted updates')));
  assert(parts.some(part=>part.includes('Proposed components for Prepare the manager brief')&&part.includes('Find permitted guidance')));
  assert(!html.includes('The use case we would test'));
  assert(!/start building|would you like|shall we/i.test(html));
});

test('review status is written and stale source mappings are not presented as approved pairs', () => {
  const record=fixture();
  record.phases[2].status='needs_review';
  record.phases[4].status='needs_review';
  record.phases[5].status='needs_review';
  const html=renderBookVisual(record,6);
  assert.match(html,/This comparison needs review/);
  assert.match(html,/This priority needs review/);
  assert(!html.includes('class="book-comparison-pair'));
  assert.match(html,/Write the current update/);
  assert.match(html,/Ask one agreed clarification/);
});

test('legacy candidates show their actual work without inventing a proposed workflow or component', () => {
  const record=fixture();
  delete record.experienceVersion;
  delete record.phases[5].answers.workflowComparisons;
  for(const candidate of record.phases[3].answers.candidates){delete candidate.workflow;delete candidate.implementation;delete candidate.output;}
  const html=renderBookVisual(record,6);
  assert.match(html,/Write the current update/);
  assert.match(html,/No proposed sequence is recorded in this workbook\./);
  assert(!html.includes('book-comparison-component"'));
  assert(!html.includes('Retrieval-augmented'));
});

test('long, Unicode, hostile and unsupported role text is preserved and escaped without mutation', () => {
  const record=fixture();
  const hostile='<script>alert("bad")</script><img src=x> & '+ 'अ'.repeat(800);
  const unbroken='X'.repeat(1200);
  record.phases[2].answers.tasks[0].work=hostile;
  record.phases[3].answers.candidates[0].workflow[0]={actor:'Unrecognised <role>',action:unbroken};
  record.phases[3].answers.candidates[0].title=hostile;
  record.phases[3].answers.candidates[0].implementation.components[0].basis=hostile;
  const before=JSON.stringify(record),html=renderBookVisual(record,6);
  assert.equal(JSON.stringify(record),before);
  assert(html.includes(escapeBookText(hostile)));
  assert(html.includes(unbroken));
  assert(html.includes('Unrecognised &lt;role&gt;'));
  assert(!html.includes('<script>'));
  assert(!html.includes('<img'));
  assert(!html.includes('foreignObject'));
  assert.match(html,/book-comparison-long/);
  assert.match(html,/book-comparison-activity"><h4>Unrecognised &lt;role&gt;/);
});

test('AI and human-check colours describe recorded roles and do not infer a check for every person', () => {
  const html=renderBookVisual(fixture(),6);
  assert.match(html,/book-comparison-activity book-comparison-ai"><h4>AI<\/h4>/);
  assert.match(html,/book-comparison-activity"><h4>Person<\/h4>/);
  assert.match(html,/book-comparison-human"><h4>What a person must check or decide/);
  assert.equal((html.match(/class="book-comparison-human"/g)||[]).length,1);
});

test('SVG arrows follow each sequence and stop before another sequence or use case', () => {
  const record=fixture();
  const arrows=html=>(html.match(/class="book-comparison-arrow"/g)||[]).length;
  const parts=renderBookWorkflowComparisons(record);
  // Three current and four proposed activities have two and three links.
  assert.equal(arrows(parts.join('')),5);
  assert.match(parts[0],/<\/p><\/div><span class="book-comparison-arrow" aria-hidden="true"><svg viewBox="0 0 24 28" focusable="false">/);
  const finalStage=parts.filter(part=>part.includes('class="book-comparison-pair')).at(-1);
  assert.equal(arrows(finalStage),0);
  assert(parts.filter(part=>part.includes('book-comparison-human')||part.includes('book-comparison-component"')).every(part=>arrows(part)===0));
  delete record.phases[5].answers.workflowComparisons;
  const separate=renderBookWorkflowComparisons(record);
  assert.equal(arrows(separate.join('')),5);
  assert.equal(arrows(separate.filter(part=>part.includes('data-sequence="current"')).at(-1)),0);
  assert.equal(arrows(separate.filter(part=>part.includes('data-sequence="proposed"')).at(-1)),0);
  const second=structuredClone(record.phases[3].answers.candidates[0]);
  second.id='c2';second.title='A second independent proposal';
  record.phases[3].answers.candidates.push(second);
  assert.equal(arrows(renderBookWorkflowComparisons(record).join('')),10);
});

test('overview, detailed implementation and chapter headers stay in the cumulative self-contained book', () => {
  const record=fixture(),html=renderWorkbookHtml(record);
  assert(html.indexOf('id="book-title"')<html.indexOf('id="workbook-overview"'));
  assert(html.indexOf('id="workbook-overview"')<html.indexOf('id="phase-1"'));
  assert.match(html,/Proposed implementation for Clarify an agreed update/);
  assert.match(html,/Step 6\. What do we recommend\?/);
  assert.match(html,/Click here to access the author’s profile/);
  assert(!/<script|src="https?:|<iframe/.test(html));
  const parts=renderBookVisualParts(record,6);
  assert(parts.filter(part=>part.includes('data-book-visual="workflow-comparison"')).length>4);
  record.phases[5].status='draft';
  assert.deepEqual(renderBookVisualParts(record,6),[]);
});

test('comparison CSS retains full wrapping, flat semantic colours and per-stage print pagination', () => {
  const css=readFileSync(new URL('../skills/ai-use-case-workshop/assets/workbook.css',import.meta.url),'utf8');
  const comparisonCss=css.slice(css.indexOf('.book-workflow-comparison {'),css.indexOf('@page'));
  assert.match(comparisonCss,/font-family: inherit/);
  assert.match(comparisonCss,/var\(--cw-ink, var\(--ink\)\)/);
  assert.match(comparisonCss,/overflow-wrap: anywhere/);
  assert.match(comparisonCss,/padding: 4\.25mm/);
  assert(!/line-clamp|text-overflow|overflow:\s*hidden|box-shadow|linear-gradient|position:\s*absolute/.test(comparisonCss));
  const activityRule=comparisonCss.match(/\.book-comparison-activity \{([^}]+)\}/)?.[1];
  assert(activityRule&&!/(?:min-|max-)?height:/.test(activityRule));
  assert.match(comparisonCss,/\.book-comparison-arrow \{[^}]*width: 24px; height: 28px; line-height: 0; margin: 2mm auto/);
  assert.match(comparisonCss,/--comparison-ai: #1AA7B8/);
  assert.match(comparisonCss,/--comparison-check: #F5B335/);
  assert.match(css,/#phase-6 \.chapter-block:has\(\.book-workflow-comparison\) \{ break-inside: auto; \}/);
  assert.match(css,/\.book-comparison-pair > thead \{ display: table-header-group; \}/);
  assert.match(css,/@media screen and \(max-width: 380px\)/);
  assert.match(css,/content: attr\(data-label\)/);
});
