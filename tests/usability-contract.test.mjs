import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {createRecord,savePhase,confirmPhase,validateRecord,phaseReadiness,currentPhase,readableSummary} from '../src/workshop.mjs';
import {nextConversationQuestion} from '../src/conversation.mjs';
import {validatePresentation} from '../src/presentation.mjs';
import {group,answers,deferredAnswers,rejectedAnswers,approval} from '../examples/remote-team.mjs';
import {group as hiringGroup,answers as hiringAnswers} from '../examples/hiring.mjs';

// Behavioural contracts and real local MCP calls. The small PDF below is an
// explicit test stub; these tests do not establish host rendering or delivery.
const newFields=['inputs','output','trigger','knowledge','format','access','implementation','workflow'];
function advance(source=answers,count=6,initial=createRecord(group)) {
  let record=initial;
  for(let phase=1;phase<=count;phase++) {
    record=savePhase(record,phase,structuredClone(source[phase-1]));
    record=confirmPhase(record,phase,approval);
  }
  return record;
}
function legacySource(source=answers) {
  const legacy=structuredClone(source);
  delete legacy[2].underlyingProblem;
  for(const candidate of legacy[3].candidates)for(const field of newFields)delete candidate[field];
  return legacy;
}
async function session() {
  const server=await createWorkshopServer({pdfRenderer:async()=>Buffer.from('%PDF-usability-contract-STUB')});
  const client=new Client({name:'usability-contract-test',version:'1'}, {capabilities:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a),client.connect(b)]);
  return {client,call:(name,args)=>client.callTool({name,arguments:args}),close:async()=>{await client.close();await server.close();}};
}

test('new exercise captures its date automatically and resume or member corrections preserve it',()=>{
  const {date,...withoutDate}=group;
  const before=new Date().toISOString().slice(0,10);
  let record=createRecord(withoutDate);
  const after=new Date().toISOString().slice(0,10);
  assert.equal(record.experienceVersion,2);
  assert([before,after].includes(record.group.date));
  const captured=record.group.date;
  record=savePhase(record,1,{outcome:answers[0].outcome},{members:['Shiva','Chirag','Fictional reviewer']});
  assert.equal(validateRecord(structuredClone(record)).group.date,captured);
  assert.equal(createRecord({...group,date:'2025-10-20'}).group.date,'2025-10-20');
});

test('new exercise asks for and requires the agreed underlying problem before phase 3 approval',()=>{
  let record=advance(answers,2);
  const phase=structuredClone(answers[2]);delete phase.underlyingProblem;
  record=savePhase(record,3,phase);
  assert.equal(phaseReadiness(record,3).complete,false);
  assert.equal(nextConversationQuestion(record).field,'underlyingProblem');
  assert.throws(()=>confirmPhase(record,3,approval));
  record=savePhase(record,3,{underlyingProblem:answers[2].underlyingProblem});
  assert.equal(phaseReadiness(record,3).complete,true);
  assert.equal(confirmPhase(record,3,approval).phases[2].answers.underlyingProblem,answers[2].underlyingProblem);
});

test('each new use case requires behavioural detail, a grounded proposal and a workflow before approval',()=>{
  for(const field of newFields) {
    const candidate=structuredClone(answers[3].candidates[0]);delete candidate[field];
    const record=savePhase(advance(answers,3),4,{candidates:[candidate]});
    assert.equal(phaseReadiness(record,4).complete,false,`Missing ${field} was accepted as complete.`);
    assert.throws(()=>confirmPhase(record,4,approval),`Missing ${field} bypassed approval validation.`);
  }
  const record=savePhase(advance(answers,3),4,answers[3]);
  assert.equal(phaseReadiness(record,4).complete,true);
  assert.equal(confirmPhase(record,4,approval).phases[3].status,'confirmed');
});

test('direct canonical input cannot bypass new-experience approval requirements',()=>{
  const record=advance();
  const missingDiagnosis=structuredClone(record);delete missingDiagnosis.phases[2].answers.underlyingProblem;
  assert.throws(()=>validateRecord(missingDiagnosis));
  for(const field of newFields) {
    const malformed=structuredClone(record);delete malformed.phases[3].answers.candidates[0][field];
    assert.throws(()=>validateRecord(malformed),`Canonical approval accepted a candidate without ${field}.`);
  }
});

test('legacy workbooks retain approvals and do not acquire invented new answers',()=>{
  const initial=createRecord(group);delete initial.experienceVersion;
  const old=advance(legacySource(),6,initial);
  const restored=validateRecord(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(restored,old);
  assert.equal(currentPhase(restored),null);
  assert.equal(restored.phases[2].answers.underlyingProblem,undefined);
  for(const field of newFields)assert.equal(restored.phases[3].answers.candidates[0][field],undefined);
});

test('pilot, deferred and rejected endings all retain their complete identified use cases',()=>{
  for(const source of [answers,deferredAnswers,rejectedAnswers]) {
    const record=advance(source);
    assert.equal(currentPhase(record),null);
    assert.deepEqual(record.phases[3].answers.candidates,source[3].candidates);
    for(const candidate of source[3].candidates)assert(readableSummary(record,6).includes(candidate.title),`The final recap omitted ${candidate.title}.`);
    assert.equal(nextConversationQuestion(record).kind,'complete');
    assert.equal(nextConversationQuestion(record).question,null);
    assert.deepEqual(nextConversationQuestion(record).choices,[]);
    // A private host instruction may name prohibited narration in a negative
    // guardrail. Only its affirmative directions should be participant-facing.
    const affirmative=nextConversationQuestion(record).hint.replace(/Do not [^.]*\./gi,'');
    assert.doesNotMatch(affirmative,/backup|JSON|revision|pilot|build|Cloudflare|ws1_/i);
  }
});

test('new phase 6 completes from an agreed recommendation without manufacturing a pilot decision',()=>{
  let record=advance(answers,5);
  assert.equal(nextConversationQuestion(record).field,'recommendation');
  record=savePhase(record,6,{recommendation:'Keep both use cases in our workbook. Agree the checkpoint and update fields first; revisit AI once the remaining need is measured.'});
  assert.equal(phaseReadiness(record,6).complete,true);
  record=confirmPhase(record,6,approval);
  assert.equal(currentPhase(record),null);
  assert.equal(record.phases[5].answers.decision,undefined);
  assert.equal(record.phases[5].answers.candidateId,undefined);
  assert.equal(record.phases[3].answers.candidates.length,2);
});

test('candidate requirements reject ungrounded components and workflows that cannot describe a sequence',()=>{
  const before=advance(answers,3);
  for(const replacement of [
    {implementation:{approach:'Use AI.',components:[],checks:'Check accuracy.'}},
    {implementation:{...answers[3].candidates[0].implementation,components:[{kind:'Agent',purpose:'Do the task.',basis:'',status:'Proposed'}]}},
    {workflow:[{actor:'AI',action:'Do everything.'}]},
    {workflow:[{actor:'Unknown service',action:'Read information.'},{actor:'Person',action:'Review.'}]},
  ]) {
    const candidate={...structuredClone(answers[3].candidates[0]),...replacement};
    assert.throws(()=>savePhase(before,4,{candidates:[candidate]}));
  }
});

test('explicit unknowns remain valid and mechanism recommendations do not require invented integration access',()=>{
  const candidate=structuredClone(answers[3].candidates[0]);
  candidate.inputs='Unknown. The group needs to decide which employee-approved updates it may use.';
  candidate.access='Unknown. The group has not agreed who may access the chosen workspace.';
  candidate.knowledge='No company-document search is currently proposed. Revisit this if the task needs an agreed policy.';
  candidate.implementation.components=candidate.implementation.components.map(component=>({...component,status:'Needs confirmation'}));
  const record=savePhase(advance(answers,3),4,{candidates:[candidate]});
  assert.equal(phaseReadiness(record,4).complete,true);
  const confirmed=confirmPhase(record,4,approval);
  assert.equal(confirmed.phases[3].answers.candidates[0].inputs,candidate.inputs);
  assert.equal(confirmed.phases[3].answers.candidates[0].access,candidate.access);
});

test('fictional remote-team and hiring fixtures supply grounded mechanisms without assuming every technology is needed',()=>{
  for(const [identity,source] of [[group,answers],[hiringGroup,hiringAnswers]]) {
    const record=advance(source,6,createRecord(identity));
    assert.equal(currentPhase(record),null);
    for(const candidate of record.phases[3].answers.candidates) {
      assert(candidate.implementation.components.every(component=>component.basis&&component.purpose));
      assert(candidate.workflow.some(step=>step.actor==='Person'));
      assert(candidate.workflow.some(step=>step.actor==='AI'));
      assert(!candidate.implementation.components.some(component=>component.kind==='Agent'||component.kind==='RAG'));
      for(const connector of candidate.implementation.components.filter(component=>component.kind==='Connector'))assert.equal(connector.status,'Needs confirmation');
    }
  }
});

test('routine questions use plain participant wording and meaningful reference labels',()=>{
  let record=createRecord(group);
  for(let phase=1;phase<=6;phase++) {
    let count=0;
    while(nextConversationQuestion(record).kind==='answer') {
      assert(++count<=12,`Phase ${phase} repeated an already supplied answer.`);
      const question=nextConversationQuestion(record);
      assert.doesNotMatch(`${question.question??''} ${question.hint??''}`,/stable IDs|JSON|revision|Cloudflare|ws1_|candidateId|taskIds|activate|recorded task IDs/i);
      for(const choice of question.choices)assert.doesNotMatch(choice.label,/^(?:[ct]\d+|both first|neither first)(?:\s|$)/i);
      assert(Object.hasOwn(answers[phase-1],question.field),`No fixture answer for ${question.field}.`);
      record=savePhase(record,phase,{[question.field]:answers[phase-1][question.field]});
    }
    record=confirmPhase(record,phase,approval);
  }
  const recordForSelection=advance(answers,5);
  recordForSelection.experienceVersion=undefined;delete recordForSelection.experienceVersion;
  const legacy=savePhase(recordForSelection,6,{decision:'Test a use case'});
  const selection=nextConversationQuestion(legacy);
  assert.equal(selection.field,'candidateId');
  for(const choice of selection.choices) {
    const candidate=answers[3].candidates.find(candidate=>candidate.id===choice.value);
    assert(candidate);assert(choice.label.includes(candidate.title));
  }
});

test('code-only presentation labels and impossible multiple-first priorities are rejected',()=>{
  const record=createRecord(group);
  assert.throws(()=>validatePresentation(record,{phaseId:1,field:'hypothesis',question:'Which change could help?',choices:[{label:'c1',value:'Agree a useful update format.'},{label:'c2',value:'Condense the updates for the manager.'}]}));
  let prioritising=advance(answers,4);
  const multipleFirst={...answers[4],choices:answers[4].choices.map(choice=>({...choice,decision:'First'}))};
  assert.throws(()=>{prioritising=savePhase(prioritising,5,multipleFirst);confirmPhase(prioritising,5,approval);});
});

test('local MCP accepts onboarding without a date and completed output asks no follow-up',async()=>{
  const s=await session();
  try {
    const {date,...withoutDate}=group;
    const start=await s.call('start_workshop',{group:withoutDate,mode:'text'});
    assert.notEqual(start.isError,true,start.content?.[0]?.text);
    assert.equal(start.structuredContent.record.experienceVersion,2);
    assert.match(start.structuredContent.record.group.date,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(start.structuredContent.questionTurn.preferredInput,'plain_chat');
    for(const source of [deferredAnswers,rejectedAnswers]) {
      const complete=advance(source);
      const result=await s.call('show_workbook',{record:complete});
      assert.notEqual(result.isError,true,result.content?.[0]?.text);
      assert.equal(result.structuredContent.questionTurn.question,null);
      assert.equal(result.structuredContent.nextQuestion.kind,'complete');
      assert.notEqual(result.structuredContent.questionTurn.hostAction,'ask_one_in_host');
      assert.deepEqual(result.structuredContent.record.phases[3].answers.candidates,source[3].candidates);
    }
  }finally {await s.close();}
});
