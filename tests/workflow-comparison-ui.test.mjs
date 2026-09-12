import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {buildSync,transformSync} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {buildWorkflowComparisons} from '../src/workflow-comparison.mjs';
import {group,answers} from '../examples/remote-team.mjs';

function load(path) {
  const compiled=buildSync({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,external:['react','react/jsx-runtime'],loader:{'.css':'empty'}}).outputFiles[0].text;
  const module={exports:{}};
  new Function('require','module','exports',compiled)(createRequire(import.meta.url),module,module.exports);
  return module.exports;
}
const {WorkflowComparisons,WorkflowComparison}=load('../src/workflow-comparison.tsx');
const {CompactVisual}=load('../src/compact-visual.tsx');
const render=record=>renderToStaticMarkup(createElement(WorkflowComparisons,{record}));
function fixture() {
  let record=createRecord(group);
  for(let id=1;id<=6;id++)record=confirmPhase(savePhase(record,id,answers[id-1]),id,'Our group approves the saved wording.');
  record.phases[2].answers.tasks=[
    {id:'t1',actor:'Requester',work:'Supply the permitted update.',friction:'The update may be incomplete.'},
    {id:'t2',actor:'Coordinator',work:'Check the update against agreed fields.',friction:'Missing details require clarification.'},
    {id:'t3',actor:'Manager',work:'Decide what action is needed.',friction:'A decision still needs authority.'},
  ];
  const original=record.phases[3].answers.candidates[0];
  record.phases[3].answers.candidates=[
    {...original,id:'c1',title:'Check an agreed update',taskIds:['t1','t2','t3'],workflow:[{actor:'Person',action:'Submit the permitted update.'},{actor:'AI',action:'Suggest which agreed details are missing.'},{actor:'Person',action:'Check the suggestion and decide the next action.'}]},
    {...original,id:'c2',title:'Prepare a manager brief',taskIds:['t2'],workflow:[{actor:'AI',action:'Draft a brief from the permitted update.'},{actor:'Person',action:'Verify every statement against its source.'}]},
  ];
  record.phases[4].answers.choices=[{candidateId:'c1',decision:'Later',reason:'Check permission first.',evidenceGap:'Permission is unconfirmed.'},{candidateId:'c2',decision:'Do not pursue',reason:'A manual brief is sufficient.',evidenceGap:'No additional evidence requested.'}];
  record.phases[5].answers={recommendation:'Keep both documented cases. Do not begin implementation now.',decision:'Do not pilot yet',candidateId:null};
  return record;
}
const aligned=record=>{
  record.phases[5].answers.workflowComparisons=[{candidateId:'c1',stages:[{taskIds:['t1'],proposedStepIndices:[0]},{taskIds:['t2'],proposedStepIndices:[1]},{taskIds:['t3'],proposedStepIndices:[2]}]}];
  return record;
};
const rows=html=>[...html.matchAll(/<tr role="row" data-comparison-stage="\d+">([\s\S]*?)<\/tr>/g)].map(match=>match[1]);

test('explicit saved alignment puts related full current and proposed actions in the same row',()=>{
  const record=aligned(fixture()),before=JSON.stringify(record),html=render(record),pairs=rows(html);
  assert.equal(pairs.length,3);
  for(let i=0;i<3;i++) {
    assert(pairs[i].includes(record.phases[2].answers.tasks[i].work));
    assert(pairs[i].includes(record.phases[3].answers.candidates[0].workflow[i].action));
  }
  assert.match(html,/scope="col" role="columnheader">Related current work/);
  assert.match(html,/scope="col" role="columnheader">Proposed work/);
  assert.match(html,/Each row compares related current tasks with the proposed activities/);
  assert.equal(JSON.stringify(record),before);
});

test('added, omitted and combined mapped stages preserve the explicit comparison without false activities',()=>{
  const record=fixture();
  record.phases[5].answers.workflowComparisons=[{candidateId:'c1',stages:[{taskIds:['t1'],proposedStepIndices:[0]},{taskIds:['t2'],proposedStepIndices:[]},{taskIds:[],proposedStepIndices:[1]},{taskIds:['t3'],proposedStepIndices:[2]}]}];
  let pairs=rows(render(record));assert.equal(pairs.length,4);
  assert(pairs[1].includes('Not included in this proposal'));assert(pairs[2].includes('Added step'));
  assert(!pairs[2].includes('Check the update against agreed fields.'));
  record.phases[5].answers.workflowComparisons[0].stages=[{taskIds:['t1','t2'],proposedStepIndices:[0,1]},{taskIds:['t3'],proposedStepIndices:[2]}];
  pairs=rows(render(record));assert.equal(pairs.length,2);
  for(const text of ['Supply the permitted update.','Check the update against agreed fields.','Submit the permitted update.','Suggest which agreed details are missing.'])assert(pairs[0].includes(text));
});

test('absent or invalid alignment shows independent sequences and never pairs by array index',()=>{
  for(const invalid of [false,true]) {
    const record=fixture();
    if(invalid)record.phases[5].answers.workflowComparisons=[{candidateId:'c1',stages:[{taskIds:['t3','t1','t2'],proposedStepIndices:[0,1,2]}]}];
    const html=render(record);
    assert(!html.includes('data-comparison-stage'));
    assert(!html.includes('wfc-matrix'));
    assert.match(html,/Related current tasks and proposed work are shown as separate sequences/);
    assert.match(html,/aria-label="Related current sequence"/);
    assert.match(html,/aria-label="Proposed sequence"/);
    for(const task of record.phases[2].answers.tasks)assert(html.includes(task.work));
  }
});

test('every documented case remains on the no-pilot final readback with its recommendation and priority',()=>{
  const record=fixture(),html=renderToStaticMarkup(createElement(CompactVisual,{record,phaseId:6}));
  for(const candidate of record.phases[3].answers.candidates) {
    assert(html.includes(candidate.title));assert(html.includes(`(${candidate.id})`));assert(html.includes(candidate.aiWork));
    assert.equal((html.match(new RegExp(`data-comparison-candidate="${candidate.id}"`,'g'))??[]).length,1);
  }
  assert(html.includes('Recorded priority: Later'));assert(html.includes('Recorded priority: Do not pursue'));
  assert(html.includes(record.phases[5].answers.recommendation));
  assert(html.includes('Do not begin an implementation test yet.'));
  assert(!/<(?:input|textarea|button|select|form|a)\b/.test(html));
  assert(!html.includes('cw-use-case-flow'),'The final readback must not repeat the old proposed-only flow.');
});

test('legacy and needs-review records remain honest about missing details and unapproved correspondence',()=>{
  const record=aligned(fixture());delete record.experienceVersion;
  record.phases[2].status='needs_review';
  let html=render(record);assert(!html.includes('data-comparison-stage'));assert(html.includes("This comparison needs the group&#x27;s review."));
  delete record.phases[3].answers.candidates[0].workflow;
  html=render(record);assert(html.includes('A proposed sequence is not recorded in this workbook.'));
  assert(html.includes(record.phases[3].answers.candidates[0].aiWork));
});

test('full long text and unsupported actor labels render as text, while components stay at use-case level',()=>{
  const record=aligned(fixture()),comparison=buildWorkflowComparisons(record)[0];
  const text='🌿 '.repeat(80)+'<script>not executed</script>\n'+ 'X'.repeat(500);
  comparison.stages[0].current[0].action=text;
  comparison.stages[1].proposed[0].actor='Recorded external service';
  comparison.components=[{kind:'Connector',purpose:'Read only the permitted source.',basis:'The group recorded source access as unconfirmed.',status:'Needs confirmation'}];
  const html=renderToStaticMarkup(createElement(WorkflowComparison,{comparison}));
  assert(html.includes('🌿 '.repeat(80)));assert(html.includes('X'.repeat(500)));assert(html.includes('&lt;script&gt;not executed&lt;/script&gt;'));assert(!html.includes('<script>'));
  assert.match(html,/class="wfc-activity" data-actor="Recorded external service"/);
  assert(html.indexOf('wfc-components')>html.lastIndexOf('</table>'));
  assert(html.includes('Needs confirmation'));assert(html.includes(comparison.components[0].purpose));
  assert(!html.includes(comparison.components[0].basis),'The full basis remains in the detailed book instead of being repeated beside every comparison.');
  assert(!/data-abbreviated|…/.test(html));
});

test('responsive CSS keeps paired columns, full text and a consistent inset without overflow workarounds',()=>{
  const all=readFileSync(new URL('../src/compact-visual.css',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../src/inline-view.css',import.meta.url),'utf8');
  assert.doesNotThrow(()=>transformSync(all,{loader:'css'}));
  const css=all.slice(all.indexOf('.wfc-comparison {'),all.lastIndexOf('@container compact-visual'));
  assert.match(css,/container: workflow-comparison \/ inline-size/);
  assert.match(css,/table-layout: fixed/);assert.match(css,/width: 50%/);
  assert.match(css,/@container workflow-comparison \(max-width: 420px\)/);
  assert.match(css,/grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css,/padding: var\(--cw-content-card-padding\)/);assert.match(css,/white-space: pre-wrap/);assert.match(css,/overflow-wrap: anywhere/);
  const visibleCss=css.replace(/(?:\.wfc-matrix caption|\.wfc-arrow)\s*\{[^}]*\}/g,'');
  assert(!/line-clamp|text-overflow|overflow:\s*hidden|overflow-x|(?:^|[;{])\s*height:\s*\d|repeat\(6/.test(visibleCss));
  assert.match(css,/font: inherit/);assert.match(css,/background: transparent/);
  assert(!/:root(?:\.|\[)|@media \(prefers-color-scheme/.test(css),'Content semantics must not define a second theme layer.');
  for(const color of ['#1AA7B8','#102D32','#F5B335','#352409'])assert(shell.includes(color));
  assert(!/color-text-success|color-background-success|color-background-warning/.test(css));
  assert.match(css,/\.wfc-matrix caption.*clip-path: inset\(50%\)/);
  assert.match(css,/\.wfc-activity \{ padding: var\(--cw-content-card-padding\)/);
  assert.match(css,/\.wfc-action \{ font-size: 14px/);
  assert.match(css,/\.wfc-arrow \{[^}]*margin: 6px auto/);
});

test('arrows connect consecutive actions within a sequence and stay outside filled panels',()=>{
  const record=fixture();
  let html=render(record);
  assert.equal((html.match(/class="wfc-arrow"/g)??[]).length,5);
  assert.match(html,/<\/p><\/div><svg class="wfc-arrow"/);
  assert.match(html,/<svg class="wfc-arrow"[^>]*aria-hidden="true" focusable="false"/);
  // A single current action never acquires an arrow into another use case.
  const secondCase=html.slice(html.indexOf('data-comparison-candidate="c2"'));
  const current=secondCase.match(/aria-label="Related current sequence">([\s\S]*?)<\/ol>/)?.[1]??'';
  assert(current);assert(!current.includes('wfc-arrow'));
  record.phases[5].answers.workflowComparisons=[{candidateId:'c1',stages:[{taskIds:['t1','t2'],proposedStepIndices:[0,1]},{taskIds:['t3'],proposedStepIndices:[2]}]}];
  html=render(record);
  assert.equal((rows(html)[0].match(/class="wfc-arrow"/g)??[]).length,2);
  assert.equal((rows(html)[1].match(/class="wfc-arrow"/g)??[]).length,0);
});

test('the fixed AI and human-check colours keep readable contrast in both themes',()=>{
  const luminance=hex=>{
    const [r,g,b]=hex.match(/\w\w/g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return .2126*r+.7152*g+.0722*b;
  };
  for(const [ink,fill] of [['102D32','1AA7B8'],['352409','F5B335']])assert((luminance(fill)+.05)/(luminance(ink)+.05)>=4.5,`${ink} on ${fill}`);
});
