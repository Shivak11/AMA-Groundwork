import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {renderWorkbookHtml} from '../src/render-workbook.mjs';
import {escapeBookText} from '../src/book-visuals.mjs';
import {group,answers} from '../examples/hiring.mjs';
function completed(n=6){let r=createRecord(group);for(let i=1;i<=n;i++)r=confirmPhase(savePhase(r,i,answers[i-1]),i,'Approved');return r;}
const strings=(value,key='')=>typeof value==='string'?(['id','candidateId','taskIds'].includes(key)?[]:[value]):Array.isArray(value)?value.flatMap(item=>strings(item,key)):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>strings(v,k)):[];
test('every confirmed answer is retained in the semantic book, with six distinct visual structures',()=>{
  const html=renderWorkbookHtml(completed());
  for(const word of strings(answers))assert(html.includes(escapeBookText(word)),`Missing group wording: ${word}`);
  for(const kind of ['goal','gap-map','task-journey','candidate-work-map','priority-comparison','test-plan'])assert(html.includes(`data-book-visual="${kind}"`));
  for(let i=1;i<=6;i++)assert(html.includes(`Step ${i}.`));
  assert(html.includes('Prepared by Dr. Shiva Kakkar'));assert(html.includes('https://www.shivakakkar.com/'));
});
test('draft answers do not leak into the book or dependent cross-references',()=>{
  let r=completed();r=savePhase(r,3,{tasks:answers[2].tasks.map((t,i)=>i? t:{...t,work:'NEW_UNCONFIRMED_WORK'})});
  const html=renderWorkbookHtml(r);assert(!html.includes('NEW_UNCONFIRMED_WORK'));assert(!html.includes('id="phase-3"'));assert(html.includes('This phase needs your review'));
});
test('untrusted wording is escaped in the cover and answers, including markup-shaped text',()=>{
  const hostile='<img src=x onerror=alert(1)> & "words"';
  let r=createRecord({...group,problem:hostile});r=confirmPhase(savePhase(r,1,{...answers[0],outcome:hostile}),1,'Approved');
  const html=renderWorkbookHtml(r);assert(!html.includes('<img'));assert(html.includes(escapeBookText(hostile)));assert(!html.includes('<script'));
});
test('empty and no-pilot books preserve their truthful position',()=>{
  let r=createRecord(group);let html=renderWorkbookHtml(r);assert(html.includes('not confirmed an outcome'));assert(!html.includes('id="phase-1"'));
  r=completed(5);r=confirmPhase(savePhase(r,6,{...answers[5],decision:'Do not pilot yet',candidateId:null}),6,'Approved');
  html=renderWorkbookHtml(r);assert(html.includes('Do not pilot yet'));assert(!html.includes('class="book-field test-candidate"'));
});
