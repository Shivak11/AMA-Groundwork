import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {group,answers} from '../examples/remote-team.mjs';

const compiled=buildSync({entryPoints:[fileURLToPath(new URL('../src/inline-view.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,external:['react','react/jsx-runtime'],loader:{'.css':'empty'}}).outputFiles[0].text;
const module={exports:{}};
new Function('require','module','exports',compiled)(createRequire(import.meta.url),module,module.exports);
const {InlineWorkshop,shouldOpenCompletedWorkbook}=module.exports;
function completed(through=6) {
  let record=createRecord(group);
  for(let id=1;id<=through;id++)record=confirmPhase(savePhase(record,id,answers[id-1]),id,'Our group approves the saved wording.');
  return record;
}
const base={connected:true,busy:false,hasPdf:true,exportFailed:false,notice:'',noticeError:false,onDownload:async()=>{},onRequestFiles:async()=>{}};
const render=(record,extra={})=>renderToStaticMarkup(createElement(InlineWorkshop,{...base,record,phaseId:6,...extra}));
const sectionTag=html=>html.match(/<section id="workshop-book-dialog"[^>]*>/)?.[0]??'';
const finalOverview=html=>{
  const start=html.indexOf('<section class="cw-final-overview"');
  const end=html.indexOf('<div class="cw-chapters"',start);
  assert(start>=0&&end>start,'The completed overview must precede the saved chapters.');
  return html.slice(start,end);
};

test('a complete current workbook opens on initial load with an immediate PDF control',()=>{
  const record=completed(), html=render(record);
  assert(!sectionTag(html).includes('hidden'));
  assert.match(html,/<div class="cw-card" hidden=""/);
  assert.match(html,/<button[^>]*class="cw-download-primary"[^>]*>Download PDF<\/button>/);
  assert.match(html,/<h2 id="book-dialog-title">AMA-Groundwork: AI Use-Case Portfolio<\/h2>/);
  assert(!html.includes('Our AI Use-Case Portfolio'));
  const overview=finalOverview(html);
  assert(overview.includes(record.group.problem));
  assert(overview.includes(record.phases[2].answers.underlyingProblem));
  for(const candidate of record.phases[3].answers.candidates) assert(overview.includes(candidate.title));
  assert.equal((overview.match(/data-comparison-candidate=/g)??[]).length,record.phases[3].answers.candidates.length);
  for(const candidate of record.phases[3].answers.candidates)for(const step of candidate.workflow)assert(overview.includes(step.action));
});

test('historical, earlier-step and incomplete snapshots do not automatically open',()=>{
  const record=completed();
  for(const extra of [{isHistorical:true},{latestRevision:record.revision+1},{phaseId:3}]) {
    assert.equal(shouldOpenCompletedWorkbook({record,phaseId:6,...extra}),false);
    assert(sectionTag(render(record,extra)).includes('hidden'));
  }
  assert.equal(shouldOpenCompletedWorkbook({record:completed(5),phaseId:6}),false);
  assert(sectionTag(render(completed(5))).includes('hidden'));
});

test('recommendation-only completion shows every use case without a missing pilot question',()=>{
  const record=completed();record.experienceVersion=2;
  record.phases[5].answers={recommendation:'Keep both documented use cases. Gather permission evidence before implementation.'};
  const html=render(record), overview=finalOverview(html);
  for(const candidate of record.phases[3].answers.candidates) {
    assert(overview.includes(candidate.title));assert(overview.includes(`(${candidate.id})`));
  }
  assert(overview.includes(record.phases[5].answers.recommendation));
  assert(!/Decision not recorded|Proposed owner|Next check|pilot|Test a use case/.test(overview));
  assert(!/<(?:input|textarea|select|form)\b/.test(html));
});

test('legacy no-pilot records retain their candidates and do not invent missing diagnosis',()=>{
  const record=completed();delete record.experienceVersion;delete record.phases[2].answers.underlyingProblem;
  record.phases[5].answers={decision:'Do not pilot yet',candidateId:null,recommendation:'Use the manual process until permissions are clear.'};
  const html=render(record);
  assert(html.includes('The group has not recorded a separate diagnosis.'));
  assert(html.includes('Do not begin an implementation test yet.'));
  for(const candidate of record.phases[3].answers.candidates) assert(html.includes(candidate.title));
});

test('full wording is escaped and private metadata stays inside closed disclosures',()=>{
  const record=completed();record.group.problem='<script>alert("not executed")</script>\n'+ 'Long wording '.repeat(100);
  const html=render(record,{workspaceUrl:'https://example.test/workbook#private-read-reference',continuation:{key:'private-write-reference',revision:record.revision}});
  assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
  assert.match(html,/<details class="cw-access"><summary>Save access and files/);
  assert.match(html,/<details class="cw-backup"><summary>Group details/);
  assert.match(html,/<details><summary>Saved data<\/summary><p class="cw-snapshot-note">Saved version/);
  assert(!html.match(/<p class="cw-snapshot-note">[^<]*<\/p>\s*<\/section>/));
});

test('file fallback does not put a private continuation reference into participant chat',()=>{
  const widget=readFileSync(new URL('../src/widget.mjs',import.meta.url),'utf8');
  assert(widget.includes("name:'AMA-Groundwork'"));
  assert(widget.includes('ama-groundwork-revision-${current.record.revision}.json'));
  assert(widget.includes('ama-groundwork-r${current.record.revision}.pdf'));
  assert(!widget.includes("name:'AI Use-Case Workshop'"));
  const request=widget.slice(widget.indexOf('async function requestFiles()'),widget.indexOf('async function download('));
  assert(!request.includes('JSON.stringify'));assert(!request.includes('current.reference'));
  assert(request.includes('our existing workbook PDF'));
  assert(!request.includes('saved record'));
  assert(widget.includes('record:current.reference??current.record'));
  assert(!widget.includes('updateModelContext('));
});
