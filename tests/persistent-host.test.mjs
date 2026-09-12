import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {phaseAnswerSchema,validateRecord} from '../src/workshop.mjs';
import {readKeyFor} from '../src/session-store.mjs';
import {createD1SessionStore} from '../remote/d1-session-store.mjs';
import {createSqliteD1} from './support/d1-sqlite.mjs';
import {group,answers,approval,candidateCorrection,renamedGroup,noPilotAnswers} from '../examples/persistent-remote-team.mjs';

// These are protocol and persistence tests. This stub is not a rendered PDF,
// and an MCP result or ticket is not evidence of delivery in ChatGPT or Claude.
const pdfStub=async()=>Buffer.from('%PDF-persistent-protocol-test-stub-not-a-rendered-workbook');
const visualTools=new Set(['show_workbook','show_shortlist','confirm_workshop_phase','export_workbook']);
const baseUrl='https://workshop.example';

async function session({filename=':memory:',now,serverOptions={}}={}) {
  const db=createSqliteD1(filename);
  const store=createD1SessionStore(db,now?{now}:{});
  let server,client,closed=false;
  try {
    server=await createWorkshopServer({sessionStore:store,baseUrl,writesEnabled:true,pdfRenderer:pdfStub,...serverOptions});
    client=new Client({name:'persistent-workbook-regression',version:'1'},{capabilities:{}});
    const [a,b]=InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a),client.connect(b)]);
  } catch(error) {db.close();throw error;}
  return {
    db,store,client,
    call:async(name,args={})=>{
      const result=await client.callTool({name,arguments:args});
      assert(!result.content.some(item=>item.type==='resource'),'Normal tools must not materialise an attached checkpoint or PDF.');
      if(!result.isError && result.structuredContent?.view)assert.equal(result.structuredContent.view.display,visualTools.has(name),name);
      return result;
    },
    close:async()=>{if(closed)return;closed=true;await client.close();await server.close();db.close();},
  };
}
function textOf(result) {return result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');}
function referenceOf(value) {
  assert.deepEqual(Object.keys(value).sort(),['key','revision'],'Only the short reference belongs in model-visible record.');
  assert.match(value.key,/^ws1_[A-Za-z0-9_-]{43}$/);
  assert(Number.isSafeInteger(value.revision)&&value.revision>=0);
  return structuredClone(value);
}
function success(result) {
  assert.notEqual(result.isError,true,textOf(result));
  const data=result.structuredContent;assert(data,'Successful tools need a structured result.');
  referenceOf(data.record);
  const ordinary=result.content.filter(item=>item.type==='text'&&item.text.trim().startsWith('{')).map(item=>JSON.parse(item.text));
  assert.equal(ordinary.length,1,'The short model result must also be available as ordinary JSON text.');
  // InMemoryTransport can retain undefined object members that JSON transport
  // drops. Compare the actual JSON representation rather than those members.
  assert.deepEqual(ordinary[0],JSON.parse(JSON.stringify(data)));
  assert.equal(data.record.phases,undefined);assert.equal(data.record.group,undefined);
  assert.equal(result._meta?.artifacts?.pdf,undefined);assert.equal(result._meta?.bookHtml,undefined);
  if(data.phase?.answerSchema)assert.deepEqual(data.phase.answerSchema,z.toJSONSchema(phaseAnswerSchema(result._meta.workbook,data.phase.id)));
  return data;
}
function workbook(result) {
  success(result);
  const record=validateRecord(result._meta?.workbook);
  assert.equal(record.revision,result.structuredContent.record.revision);
  return record;
}
async function start(s,{mode='auto'}={}) {
  const prepared=success(await s.call('start_workshop',{}));
  assert.equal(prepared.pending,true);assert.equal(prepared.record.revision,0);
  const result=await s.call('start_workshop',{record:prepared.record,group,mode});
  const activated=success(result);assert.equal(activated.pending,false);
  assert.equal(activated.record.key,prepared.record.key);
  return result;
}
async function complete(s,{through=6,mode='text'}={}) {
  let result=await start(s,{mode});
  for(let phase=1;phase<=through;phase++) {
    result=await s.call('save_workshop_phase',{record:success(result).record,phase,answers:answers[phase-1]});
    result=await s.call('confirm_workshop_phase',{record:success(result).record,phase,approved:true,confirmation:approval,requestId:`approve-step-${phase}`});
    assert.equal(workbook(result).phases[phase-1].status,'confirmed');
  }
  return result;
}
function assertFiles(data) {
  assert.equal(data.export.status,'ready');assert.equal(data.export.revision,data.record.revision);
  for(const field of ['pdfUrl','jsonUrl']) {
    const url=new URL(data.export[field]);assert.equal(url.origin,baseUrl);
    assert.equal(url.protocol,'https:');assert(!url.href.includes(data.record.key));
    assert(!/w[rs]1_/.test(url.pathname+url.search),'File URLs may carry a temporary ticket, never an edit or workspace key.');
  }
  if('bytes' in data.export)assert.equal(typeof data.export.bytes,'number','Only a byte count, not PDF bytes, may appear in ordinary output.');
}
function ticketFrom(url) {
  const match=new URL(url).href.match(/wf1_[A-Za-z0-9_-]{43}/);
  assert(match,'The file link must contain a revision-bound opaque ticket.');return match[0];
}

test('persistent Group 1A fixture keeps unknowns and labels every added case detail as fictional',()=>{
  assert.equal(group.name,'1A');assert.deepEqual(group.members,['Shiva','Chirag']);
  assert.match(group.context,/fictional/i);assert(group.problem.length<=400);
  assert.equal(answers[0].baseline,'Unknown');assert.match(answers[2].recentCase,/Fictional case/);
  assert.match(answers[2].zeroSecond,/missing Finance figure/);
  assert.match(candidateCorrection.humanCheck,/employee checks and corrects/i);
  assert.match(candidateCorrection.humanCheck,/Do not send messages, rank people or escalate automatically/);
});

test('prepared start stores no group data and activation can be retried without resetting later work',async t=>{
  const s=await session();t.after(()=>s.close());
  const preparedResult=await s.call('start_workshop',{}),prepared=success(preparedResult);
  assert.equal(prepared.pending,true);assert.equal(preparedResult._meta?.workbook,undefined);
  const rows=s.db.sqlite.prepare('SELECT * FROM workshop_sessions').all();
  assert.equal(rows.length,1);assert.equal(rows[0].state,'pending');assert.equal(rows[0].current_record,null);
  assert(!JSON.stringify(rows).includes(prepared.record.key));
  assert(!JSON.stringify(rows).includes(group.problem));
  const activated=await s.call('start_workshop',{record:prepared.record,group,mode:'text'});
  assert.equal(success(activated).pending,false);assert.deepEqual(workbook(activated).group,group);
  const saved=await s.call('save_workshop_phase',{record:success(activated).record,phase:1,answers:{outcome:answers[0].outcome}});
  const retried=await s.call('start_workshop',{record:prepared.record,group});
  assert.deepEqual(workbook(retried),workbook(saved));assert.deepEqual(success(retried).record,success(saved).record);
  const different=await s.call('start_workshop',{record:prepared.record,group:{...group,name:'A different group'}});
  assert.equal(different.isError,true);assert.deepEqual((await s.store.load(prepared.record.key)).record,workbook(saved));
});

test('tool inputs publish short references and safe item patches while outputs keep the full record outside normal content',async t=>{
  const s=await session();t.after(()=>s.close());
  const {tools}=await s.client.listTools();
  for(const name of ['start_workshop','workshop_next','save_workshop_phase','confirm_workshop_phase','resume_workshop','show_workbook','export_workbook'])assert(tools.some(tool=>tool.name===name),name);
  for(const tool of tools) {
    const ref=tool.inputSchema.properties?.record;
    if(ref) {
      assert.deepEqual(Object.keys(ref.properties).sort(),['key','revision'],tool.name);
      assert.equal(ref.additionalProperties,false);assert.equal(ref.properties.key.type,'string');
      assert.equal(ref.properties.revision.type,'integer');
    }
    if(visualTools.has(tool.name))assert.equal(tool._meta?.ui?.resourceUri,'ui://workshop/checkpoint.html');
    else assert.equal(tool._meta?.ui?.resourceUri,undefined,tool.name);
  }
  const save=tools.find(tool=>tool.name==='save_workshop_phase');
  assert.equal(tools.length,15);
  for(const tool of tools)assert(tool.description.length<1000,`${tool.name} description should stay concise for deferred discovery.`);
  assert.match(save.description,/After the participant answers/i);
  assert.match(save.description,/before asking another question/i);
  assert(JSON.stringify(save).length<9000,'The complete save tool definition should stay within the deferred-discovery budget.');
  assert.equal(save.inputSchema.properties.arrayEdits.type,'array');
  assert.equal(save.annotations.readOnlyHint,false);
  assert.equal(tools.find(tool=>tool.name==='show_workbook').annotations.readOnlyHint,true);
  const result=await start(s);const data=success(result);
  assert.equal(data.questionTurn.owner,'chat');assert.equal(data.questionTurn.preferredInput,'native_question_tool');
  assert.equal(data.questionTurn.fallbackInput,'plain_chat');assert.equal(data.view.display,false);
  assert.deepEqual({tool:data.questionTurn.afterReply.tool,phaseId:data.questionTurn.afterReply.phaseId,field:data.questionTurn.afterReply.field},{tool:'save_workshop_phase',phaseId:1,field:'outcome'});
  assert.match(data.questionTurn.afterReply.instruction,/saveReceipt/);
  assert.equal(data.phase.questionField,'outcome');assert.equal(workbook(result).phases.length,6);
  const url=new URL(data.workspace.url);assert.equal(url.origin,baseUrl);assert(!/w[rs]1_/.test(url.pathname+url.search));
  assert(url.hash.includes(await readKeyFor(data.record.key)));
});

test('a text-only host completes six phases using short references and partial answers, with six explicit approvals',async t=>{
  const rendered=[];const s=await session({serverOptions:{pdfRenderer:async record=>{rendered.push(structuredClone(record));return pdfStub();}}});t.after(()=>s.close());
  let result=await start(s,{mode:'text'});const key=success(result).record.key;
  for(let phase=1;phase<=6;phase++) {
    const retained={};
    for(const [field,value] of Object.entries(answers[phase-1])) {
      retained[field]=value;
      result=await s.call('save_workshop_phase',{record:success(result).record,phase,answers:{[field]:value}});
      const data=success(result),record=workbook(result);
      assert.equal(data.record.key,key);assert.equal(data.mode,'text');assert.equal(data.questionTurn.preferredInput,'plain_chat');
      assert.equal(data.questionTurn.fallbackInput,'plain_chat');assert.equal(data.view.display,false);
      assert.deepEqual(record.phases[phase-1].answers,retained);assert.equal(record.phases[phase-1].status,'draft');
      if(data.phase.questionField)assert(!Object.hasOwn(retained,data.phase.questionField),'Saved fields must not be asked again.');
      assert.equal(rendered.length,phase-1);
    }
    assert.equal(success(result).completeness.complete,true);assert.equal(success(result).phase.question,null);
    assert.equal(success(result).nextQuestion.kind,'approval');
    result=await s.call('confirm_workshop_phase',{record:success(result).record,phase,approved:true,confirmation:approval});
    const record=workbook(result);assert.equal(record.phases[phase-1].status,'confirmed');assert.equal(record.phases[phase-1].approvalNote,approval);
    assert.equal(rendered.length,phase);assert.equal(rendered.at(-1).revision,record.revision);assertFiles(success(result));
  }
  const final=workbook(result);assert(final.phases.every(phase=>phase.status==='confirmed'));
  assert.equal(final.phases[0].answers.baseline,'Unknown');assert.equal(final.phases[2].answers.zeroSecond,answers[2].zeroSecond);
  assert.equal(final.phases[2].answers.recentCase,answers[2].recentCase);assert.equal(success(result).nextQuestion.kind,'complete');
});

test('missing guardrail and invalid task references block approval without losing stored wording',async t=>{
  let renders=0;const s=await session({serverOptions:{pdfRenderer:async()=>{renders++;return pdfStub();}}});t.after(()=>s.close());
  let result=await start(s,{mode:'text'});const {guardrail,...partial}=answers[0];
  result=await s.call('save_workshop_phase',{record:success(result).record,phase:1,answers:partial});
  const before=workbook(result);assert.equal(success(result).phase.questionField,'guardrail');
  const rejected=await s.call('confirm_workshop_phase',{record:success(result).record,phase:1,approved:true,confirmation:approval});
  assert.equal(rejected.isError,true);assert.match(textOf(rejected),/guardrail/);assert.equal(renders,0);
  assert.deepEqual((await s.store.load(success(result).record.key)).record,before);
  result=await s.call('save_workshop_phase',{record:success(result).record,phase:1,answers:{guardrail}});
  result=await s.call('confirm_workshop_phase',{record:success(result).record,phase:1,approved:true,confirmation:approval});
  for(const phase of [2,3]) {
    result=await s.call('save_workshop_phase',{record:success(result).record,phase,answers:answers[phase-1]});
    result=await s.call('confirm_workshop_phase',{record:success(result).record,phase,approved:true,confirmation:approval});
  }
  result=await s.call('save_workshop_phase',{record:success(result).record,phase:4,answers:{candidates:[{...answers[3].candidates[0],taskIds:['missing-task']}]}});
  assert.equal(success(result).completeness.complete,false);
  const invalid=await s.call('confirm_workshop_phase',{record:success(result).record,phase:4,approved:true,confirmation:approval});
  assert.equal(invalid.isError,true);assert.equal(renders,3);
  assert.equal((await s.store.load(success(result).record.key)).record.phases[3].status,'draft');
});

test('closing and reopening SQLite and the MCP server preserves approvals, current references and text preference after 100 days',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'workshop-persistent-host-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const filename=join(directory,'workshop.sqlite');let now=new Date('2026-09-11T08:00:00Z');
  const first=await session({filename,now:()=>now});t.after(()=>first.close());
  const result=await complete(first,{through:3}),saved=workbook(result),oldReference={key:success(result).record.key,revision:0};
  await first.close();now=new Date('2026-12-20T08:00:00Z');
  const reopened=await session({filename,now:()=>now});t.after(()=>reopened.close());
  const resumed=await reopened.call('resume_workshop',{record:oldReference});const data=success(resumed);
  assert.deepEqual(workbook(resumed),saved);assert.equal(data.currentRevision,saved.revision);assert.equal(data.record.revision,saved.revision);
  assert.equal(data.mode,'text');assert.equal(data.questionTurn.preferredInput,'plain_chat');assert.equal(data.phase.id,4);
  const history=await reopened.store.history(data.record.key);assert(history.some(item=>item.revision===0));assert(history.some(item=>item.revision===saved.revision));
  const context=await reopened.call('workshop_next',{record:oldReference,phase:2});
  assert.deepEqual(success(context).phase.answers,answers[1]);assert.deepEqual(workbook(context),saved);
});

test('lost-response confirmation replay preserves its timestamp and returns newer saved feedback without applying the approval again',async t=>{
  const s=await session();t.after(()=>s.close());
  let result=await start(s,{mode:'text'});
  result=await s.call('save_workshop_phase',{record:success(result).record,phase:1,answers:answers[0]});
  const request={record:success(result).record,phase:1,approved:true,confirmation:approval,requestId:'lost-response-phase-one'};
  const confirmed=await s.call('confirm_workshop_phase',request),approved=workbook(confirmed);
  const retry=await s.call('confirm_workshop_phase',request);assert.deepEqual(workbook(retry),approved);
  const feedback=await s.call('save_workshop_phase',{record:success(confirmed).record,phase:1,answers:{hypothesis:'Fictional correction: compare the agreed form before considering an AI clarification.'}});
  const latest=workbook(feedback);
  assert.equal(latest.phases[0].status,'draft');assert.equal(latest.phases[0].approvedAt,undefined);
  const lateRetry=await s.call('confirm_workshop_phase',request);
  assert.deepEqual(workbook(lateRetry),latest);assert.equal(success(lateRetry).currentRevision,latest.revision);
  assert.equal(workbook(lateRetry).phases[0].status,'draft','An old approval retry must not approve corrected wording.');
  assert.equal(success(lateRetry).saveReceipt.appliedRevision,approved.revision);
  assert.equal(success(lateRetry).export.revision,approved.revision);
  assert.match(lateRetry.content[0].text,/earlier approved version/i);
  assert.deepEqual((await s.store.resolveFileTicket(ticketFrom(success(lateRetry).export.pdfUrl))).record,approved);
  const conflict=await s.call('confirm_workshop_phase',{...request,confirmation:'Different approval wording for the same request ID.'});
  assert.equal(conflict.isError,true);assert.match(textOf(conflict),/operation|request|different/i);
  assert.deepEqual((await s.store.load(request.record.key)).record,latest);
});

test('PDF failure happens after durable approval and export retry needs no new approval',async t=>{
  let fail=true,renders=0;const s=await session({serverOptions:{pdfRenderer:async()=>{renders++;if(fail)throw new Error('Fictional PDF renderer failure');return pdfStub();}}});t.after(()=>s.close());
  let result=await start(s,{mode:'text'});
  result=await s.call('save_workshop_phase',{record:success(result).record,phase:1,answers:answers[0]});
  result=await s.call('confirm_workshop_phase',{record:success(result).record,phase:1,approved:true,confirmation:approval,requestId:'approval-before-render'});
  const data=success(result),approved=workbook(result);assert.equal(data.export.status,'failed');assert.equal(approved.phases[0].status,'confirmed');
  assert.deepEqual((await s.store.load(data.record.key)).record,approved);assert.equal(renders,1);
  fail=false;const exported=await s.call('export_workbook',{record:data.record});
  assert.deepEqual(workbook(exported),approved);assert.equal(renders,2);assertFiles(success(exported));
  assert.equal(success(exported).questionTurn.hostAction,'deliver_files');assert.equal(success(exported).questionTurn.question,null);
  assert.equal(success(exported).nextQuestion,null);
});

test('a candidate item correction preserves its sibling and earlier snapshots, while dependent answers remain for review',async t=>{
  const s=await session();t.after(()=>s.close());
  const completed=await complete(s),before=workbook(completed),reference=success(completed).record;
  const context=await s.call('workshop_next',{record:reference,phase:4});
  assert.deepEqual(success(context).phase.answers,answers[3]);assert.deepEqual(workbook(context),before);
  const changed=await s.call('save_workshop_phase',{record:reference,phase:4,arrayEdits:[{field:'candidates',op:'update',id:'c1',value:candidateCorrection}],requestId:'correct-candidate-human-check'});
  const after=workbook(changed);assert.equal(after.revision,before.revision+1);
  assert.deepEqual(after.phases[3].answers.candidates[0],{...before.phases[3].answers.candidates[0],...candidateCorrection});
  assert.deepEqual(after.phases[3].answers.candidates[1],before.phases[3].answers.candidates[1]);
  assert.deepEqual(after.phases.slice(0,3),before.phases.slice(0,3));assert.equal(after.phases[3].status,'draft');
  for(const index of [4,5]) {assert.equal(after.phases[index].status,'needs_review');assert.deepEqual(after.phases[index].answers,before.phases[index].answers);}
  assert.deepEqual((await s.store.load(reference.key,reference.revision)).record,before);
  const implicit=await s.call('save_workshop_phase',{record:success(changed).record,phase:4,answers:{candidates:[after.phases[3].answers.candidates[0]]}});
  assert.equal(implicit.isError,true,'Omitting c2 from an answer patch must not remove it.');
  assert.deepEqual((await s.store.load(reference.key)).record,after);
  const groupOnly=await s.call('save_workshop_phase',{record:success(changed).record,phase:4,group:renamedGroup});
  assert.equal(success(groupOnly).record.key,reference.key);assert.equal(workbook(groupOnly).group.name,renamedGroup.name);
  assert.equal(workbook(groupOnly).group.context,after.group.context,'A name correction must not insert an empty default context.');
  assert.deepEqual(workbook(groupOnly).phases,after.phases);assert.equal(success(groupOnly).workspace.url,success(changed).workspace.url);
});

test('stale writes return current references and wording, and identical patches do not manufacture revisions',async t=>{
  const s=await session();t.after(()=>s.close());
  const initial=await start(s,{mode:'text'}),stale=success(initial).record;
  const saved=await s.call('save_workshop_phase',{record:stale,phase:1,answers:{outcome:answers[0].outcome},requestId:'first-outcome'});
  const rejected=await s.call('save_workshop_phase',{record:stale,phase:1,answers:{kpi:answers[0].kpi},requestId:'concurrent-kpi'});
  assert.equal(rejected.isError,true);assert.deepEqual(rejected.structuredContent.record,success(saved).record);
  assert.match(textOf(rejected),/latest|changed|revision/i);assert(textOf(rejected).includes(answers[0].outcome));
  const resumed=await s.call('resume_workshop',{record:stale});assert.deepEqual(workbook(resumed),workbook(saved));
  const repaired=await s.call('save_workshop_phase',{record:success(resumed).record,phase:1,answers:{kpi:answers[0].kpi},requestId:'repaired-kpi'});
  assert.deepEqual(workbook(repaired).phases[0].answers,{outcome:answers[0].outcome,kpi:answers[0].kpi});
  const noop=await s.call('save_workshop_phase',{record:success(repaired).record,phase:1,answers:{outcome:answers[0].outcome}});
  assert.deepEqual(workbook(noop),workbook(repaired));assert.deepEqual(success(noop).record,success(repaired).record);
});

test('a no-pilot recommendation can be saved and later changed without inventing a candidate or discarding the recommendation',async t=>{
  const s=await session();t.after(()=>s.close());
  let result=await complete(s,{through:5});
  result=await s.call('save_workshop_phase',{record:success(result).record,phase:6,answers:{decision:'Do not pilot yet'}});
  assert.equal(workbook(result).phases[5].answers.candidateId,null);assert.equal(success(result).phase.questionField,'recommendation');
  result=await s.call('save_workshop_phase',{record:success(result).record,phase:6,answers:noPilotAnswers});
  result=await s.call('confirm_workshop_phase',{record:success(result).record,phase:6,approved:true,confirmation:approval});
  assert(workbook(result).phases.every(phase=>phase.status==='confirmed'));
  const changed=await s.call('save_workshop_phase',{record:success(result).record,phase:6,answers:{decision:'Test a use case'}});
  assert.equal(success(changed).phase.questionField,'candidateId');assert.equal(success(changed).completeness.complete,false);
  assert.equal(workbook(changed).phases[5].answers.recommendation,noPilotAnswers.recommendation);
  const rejected=await s.call('confirm_workshop_phase',{record:success(changed).record,phase:6,approved:true,confirmation:approval});
  assert.equal(rejected.isError,true);assert.equal((await s.store.load(success(changed).record.key)).record.phases[5].status,'draft');
});

test('ticket links keep the approved revision after later feedback, and read-only credentials cannot save',async t=>{
  const s=await session();t.after(()=>s.close());
  const approvedResult=await complete(s,{through:1}),data=success(approvedResult),approved=workbook(approvedResult);assertFiles(data);
  const pdfTicket=ticketFrom(data.export.pdfUrl),jsonTicket=ticketFrom(data.export.jsonUrl);
  const feedback=await s.call('save_workshop_phase',{record:data.record,phase:1,answers:{hypothesis:'Fictional feedback: test the agreed form before adding AI.'}});
  assert.equal(workbook(feedback).phases[0].status,'draft');
  for(const [ticket,kind] of [[pdfTicket,'pdf'],[jsonTicket,'json']]) {
    const file=await s.store.resolveFileTicket(ticket);assert.equal(file.kind,kind);assert.equal(file.revision,approved.revision);assert.deepEqual(file.record,approved);
  }
  const readKey=await readKeyFor(data.record.key);
  const denied=await s.call('save_workshop_phase',{record:{key:readKey,revision:success(feedback).record.revision},phase:1,answers:{baseline:'An unauthorised edit'}});
  assert.equal(denied.isError,true);assert.deepEqual((await s.store.load(data.record.key)).record,workbook(feedback));
  assert(!textOf(denied).includes(data.record.key));
});

test('read-only containment permits recovery and file export while refusing writes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'workshop-persistent-readonly-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const filename=join(directory,'workshop.sqlite'),first=await session({filename});t.after(()=>first.close());
  const approved=await complete(first,{through:1}),before=workbook(approved),reference=success(approved).record;await first.close();
  const readOnly=await session({filename,serverOptions:{writesEnabled:false}});t.after(()=>readOnly.close());
  const resumed=await readOnly.call('resume_workshop',{record:reference});assert.deepEqual(workbook(resumed),before);
  const denied=await readOnly.call('save_workshop_phase',{record:reference,phase:2,answers:{firstGap:answers[1].firstGap}});
  assert.equal(denied.isError,true);assert.deepEqual((await readOnly.store.load(reference.key)).record,before);
  const exported=await readOnly.call('export_workbook',{record:reference});assertFiles(success(exported));assert.deepEqual(workbook(exported),before);
});

test('an explicit text preference is remembered separately from turn-local overrides without changing answers or revisions',async t=>{
  const s=await session();t.after(()=>s.close());
  const initial=await start(s),reference=success(initial).record,before=workbook(initial);
  const turnOnly=await s.call('workshop_next',{record:reference,mode:'text'});
  assert.equal(success(turnOnly).questionTurn.preferredInput,'plain_chat');
  const next=await s.call('workshop_next',{record:reference});
  assert.equal(success(next).questionTurn.preferredInput,'native_question_tool');
  const preferred=await s.call('set_workshop_preference',{record:reference,mode:'text'});
  assert.deepEqual(workbook(preferred),before);assert.deepEqual(success(preferred).record,reference);
  const resumed=await s.call('resume_workshop',{record:reference});
  assert.equal(success(resumed).questionTurn.preferredInput,'plain_chat');assert.equal(success(resumed).mode,'text');
  assert.deepEqual(workbook(resumed),before);
});
