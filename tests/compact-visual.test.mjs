import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {group,answers} from '../examples/remote-team.mjs';

const compiled=buildSync({entryPoints:[fileURLToPath(new URL('../src/compact-visual.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,external:['react','react/jsx-runtime'],loader:{'.css':'empty'}}).outputFiles[0].text;
const module={exports:{}};
new Function('require','module','exports',compiled)(createRequire(import.meta.url),module,module.exports);
const {CompactVisual}=module.exports;
const render=(record,phaseId)=>renderToStaticMarkup(createElement(CompactVisual,{record,phaseId}));
function completed() {
  let record=createRecord(group);
  for(let id=1;id<=6;id++)record=confirmPhase(savePhase(record,id,answers[id-1]),id,'Our group approves the saved wording.');
  return record;
}
function lane(html,priority) {
  return html.match(new RegExp(`<section[^>]*data-priority="${priority}"[^>]*>.*?<\\/section>`,'s'))?.[0]??'';
}
function freeze(value) {if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}

test('six compact readbacks preserve distinct decision relationships without inputs or record mutation',()=>{
  const record=freeze(completed()),before=JSON.stringify(record);
  const expected=[['goal','Measured by'],['blockers','Who holds it'],['workflow','cv-task-path'],['candidates','Human check'],['priorities','data-priority="First"'],['test','Proposed owner']];
  for(const [index,[kind,marker]] of expected.entries()) {
    const html=render(record,index+1);
    assert(html.includes(`data-visual="${kind}" data-compact="true"`));
    assert(html.includes(marker));
    assert(!/<(?:button|input|textarea|select|form|a|canvas)\b/.test(html));
    assert(!/role="(?:slider|checkbox|radio|textbox)"/.test(html));
    assert(!html.includes('Expected change'), 'The compact readback repeated the hypothesis paragraph.');
  }
  assert.equal(JSON.stringify(record),before);
});

test('long visible answers retain their complete wording, whitespace and Unicode',()=>{
  const record=completed();
  record.phases[0].answers={outcome:'🌿'.repeat(150),kpi:'Measure '.repeat(100),baseline:'Unknown',guardrail:'Safeguard\n'.repeat(100),hypothesis:'The full hypothesis remains in the workbook.'};
  const html=render(record,1);
  const extracts=[...html.matchAll(/data-full-text="true">([^<]*)<\/span>/g)];
  assert.equal(extracts.length,4);
  assert.deepEqual(extracts.map(match=>match[1]),['outcome','kpi','baseline','guardrail'].map(field=>record.phases[0].answers[field]));
  assert(!/data-abbreviated|data-excerpt|…/.test(html));
  assert(html.includes('>Unknown</span>'));
  assert(!html.includes(record.phases[0].answers.hypothesis));
  assert(!/<canvas\b|role="(?:meter|progressbar)"|aria-valuenow|data-(?:value|percent)=/.test(html),'An unknown baseline acquired a numerical chart.');
});

test('every recorded blocker, task and candidate remains visible in the saved order',()=>{
  const record=completed();
  record.phases[1].answers.blockers=Array.from({length:5},(_,i)=>({...answers[1].blockers[0],holder:`Holder ${i+1}`}));
  record.phases[2].answers.tasks=Array.from({length:6},(_,i)=>({...answers[2].tasks[0],id:`t${i+1}`,work:`Recorded task ${i+1}`}));
  record.interaction={zeroTaskId:'t6'};
  record.phases[3].answers.candidates=Array.from({length:5},(_,i)=>({...answers[3].candidates[0],id:`c${i+1}`,title:`Recorded candidate ${i+1}`}));
  const blockers=render(record,2),workflow=render(record,3),candidates=render(record,4);
  assert.equal((blockers.match(/class="cv-holder"/g)??[]).length,5);
  assert.deepEqual([...workflow.matchAll(/data-task-id="([^"]+)"/g)].map(match=>match[1]),['t1','t2','t3','t4','t5','t6']);
  assert.match(workflow,/If “Recorded task 6” \(t6\) took no time/);
  assert.deepEqual([...candidates.matchAll(/data-candidate-id="([^"]+)"/g)].map(match=>match[1]),['c1','c2','c3','c4','c5']);
  assert(!/data-remaining/.test(blockers+workflow+candidates));
});

test('candidate comparisons retain the non-AI option, human check and unresolved reconsideration',()=>{
  const record=completed();record.interaction={candidateDispositions:{c1:'Reconsider'}};
  const html=render(record,4);
  assert.match(html,/With AI/);assert.match(html,/Without AI/);assert.match(html,/Human check/);
  assert.match(html,/Needs reconsideration/);
  assert(html.includes(answers[3].candidates[0].humanCheck));
  assert(html.includes(answers[3].candidates[0].nonAiAlternative));
});

test('pending proposals never replace saved priorities or mislabel ambiguous choices as decided',()=>{
  const record=completed();record.interaction={priorities:{c1:'Later',c2:'First'}};
  let html=render(record,5);
  assert.match(lane(html,'First'),/data-candidate-id="c1"/);
  assert(!lane(html,'First').includes('data-candidate-id="c2"'));
  assert.match(lane(html,'Later'),/data-candidate-id="c2"/);
  assert.match(html,/Proposed changes still need reasons/);
  assert.match(html,/cv-proposed-decision">Later/);
  assert.match(html,/cv-proposed-decision">First/);
  record.phases[4].answers.choices.push({...record.phases[4].answers.choices[0],decision:'Later'});
  html=render(record,5);
  assert(!lane(html,'First').includes('data-candidate-id="c1"'));
  assert.match(lane(html,'Needs a decision'),/data-candidate-id="c1"/);
});

test('the no-pilot decision is a next evidence check, not an implied selected AI test',()=>{
  const record=completed();record.phases[5].answers={...record.phases[5].answers,decision:'Do not pilot yet',candidateId:null,test:'Confirm that a shared form is insufficient before considering AI.'};
  const html=render(record,6);
  assert.match(html,/Do not begin an implementation test yet/);assert.match(html,/Next evidence check/);
  for(const candidate of record.phases[3].answers.candidates) {
    assert(html.includes(candidate.title));assert(html.includes(`(${candidate.id})`));
  }
  assert(html.includes(record.phases[5].answers.test));
  assert(!html.includes('cv-selected-candidate'));
  assert(!html.includes('Test a use case'));
});

test('empty phases do not manufacture example answers or progress values',()=>{
  const record=createRecord(group);
  for(let phase=1;phase<=6;phase++) {
    const html=render(record,phase);
    assert.match(html,/Not recorded|not recorded|No .* recorded yet/);
    assert(!html.includes(answers[0].outcome));
    assert(!/<canvas\b|aria-valuenow|role="(?:meter|progressbar)"/.test(html));
  }
});
