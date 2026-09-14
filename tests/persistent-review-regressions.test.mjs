import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {createD1SessionStore} from '../remote/d1-session-store.mjs';
import {createSqliteD1} from './support/d1-sqlite.mjs';
import {persistentRoute} from '../remote/persistent-routes.mjs';
import {createRecord,savePhase,confirmPhase,validateRecord} from '../src/workshop.mjs';
import {canonicalJson,hashValue,readKeyFor} from '../src/session-store.mjs';
import {group,answers,approval} from '../examples/persistent-remote-team.mjs';

const baseUrl='https://workshop.example';
// These are transport and recovery checks, not a real PDF or host download.
const pdfStub=record=>Buffer.from(`%PDF-persistent-review-protocol-stub\n${record.revision}`);
const operation=async id=>({operationId:id,operationHash:await hashValue(id)});
const encodedBytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const textOf=result=>result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');
function dataOf(result) {assert.notEqual(result.isError,true,textOf(result));return result.structuredContent;}

async function fixture(t) {
  const db=createSqliteD1(),store=createD1SessionStore(db);
  const server=await createWorkshopServer({sessionStore:store,baseUrl,pdfRenderer:pdfStub,writesEnabled:true});
  const client=new Client({name:'persistent-review-regressions',version:'1'},{capabilities:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
  t.after(async()=>{await client.close();await server.close();db.close();});
  return {db,store,call:(name,args={})=>client.callTool({name,arguments:args}),route:(path,key)=>persistentRoute(new Request(new URL(path,baseUrl),{
    headers:key?{Authorization:`Bearer ${key}`}:{},
  }),{store,baseUrl,pdfRenderer:pdfStub,bookRenderer:record=>`<p>Fictional route fixture, revision ${record.revision}</p>`})};
}
async function seed(store,through=6) {
  let loaded=await store.activate(await store.prepare(),group);
  for(let phase=1;phase<=through;phase++) {
    loaded=await store.transact(loaded.reference,await operation(`save-${phase}`),record=>savePhase(record,phase,answers[phase-1]));
    loaded=await store.transact(loaded.reference,await operation(`confirm-${phase}`),record=>confirmPhase(record,phase,approval,'2026-09-11T12:00:00.000Z'));
  }
  return loaded;
}
function richRecord(accentPerThousand) {
  const content=structuredClone(answers);
  content[1].blockers=Array.from({length:5},(_,index)=>({...content[1].blockers[index%2],information:`Fictional blocker ${index+1}`}));
  content[2].workflows=Array.from({length:3},(_,index)=>`Fictional workflow ${index+1}`);
  content[2].tasks=Array.from({length:6},(_,index)=>({...content[2].tasks[index%5],id:`t${index+1}`}));
  content[3].candidates=Array.from({length:5},(_,index)=>({...content[3].candidates[index%2],id:`c${index+1}`,title:`Fictional candidate ${index+1}`,taskIds:[`t${index+1}`,`t${index+2}`]}));
  content[4].choices=Array.from({length:5},(_,index)=>({...content[4].choices[index%2],candidateId:`c${index+1}`,decision:index===0?'First':'Later'}));
  const literal=new Set(['id','candidateId','decision','kind','status']);
  function fill(value,key='') {
    if(Array.isArray(value))return key==='taskIds'?value:value.map(item=>fill(item,key));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,fill(item,name)]));
    if(typeof value!=='string'||literal.has(key)||(key==='actor'&&['Person','AI','System'].includes(value)))return value;
    const limit=key==='title'?120:600;
    const prefix=`Fictional size-test wording for ${key}: ${value} `;
    const base=prefix.slice(0,Math.min(prefix.length,limit-1)),remaining=limit-base.length;
    const accented=Math.floor(remaining*accentPerThousand/1000);
    return base+'é'.repeat(accented)+'x'.repeat(remaining-accented);
  }
  const expanded=content.map(item=>fill(item));expanded[2].chosenWorkflow=expanded[2].workflows[0];
  let record=createRecord(group);
  for(let phase=1;phase<=6;phase++)record=confirmPhase(savePhase(record,phase,expanded[phase-1]),phase,approval,'2026-09-11T12:00:00.000Z');
  return {...record,revision:1};
}
function nearLimitRecord() {
  let best;
  for(let fraction=0;fraction<=1000;fraction++) {
    let candidate;
    try {candidate=richRecord(fraction);}catch(error) {
      if(/record is too large/i.test(error.message))break;
      throw error;
    }
    if(encodedBytes(candidate)>149000)break;
    best=candidate;
  }
  assert(best);assert(encodedBytes(best)>=145000,'The transport fixture must exercise a valid record near the 150 KB storage boundary.');
  return validateRecord(best);
}

test('workshop_action set_answer cannot remove siblings from any saved list',async t=>{
  const f=await fixture(t),saved=await seed(f.store),before=saved.record;
  for(const [phaseId,field] of [[2,'blockers'],[3,'workflows'],[3,'tasks'],[4,'candidates'],[5,'choices']]) {
    const old=before.phases[phaseId-1].answers[field],value=old.slice(0,-1);
    const rejected=await f.call('workshop_action',{record:saved.reference,action:{kind:'set_answer',phaseId,expectedRevision:saved.reference.revision,field,value}});
    assert.equal(rejected.isError,true,`${field} must not bypass the explicit list-removal contract.`);
    assert.deepEqual((await f.store.load(saved.reference.key)).record,before);
    assert.equal((await f.store.history(saved.reference.key)).length,13);
  }
});

test('activation replay cannot overwrite a later saved ordinary-chat preference',async t=>{
  const f=await fixture(t),prepared=dataOf(await f.call('start_workshop'));
  const activation={record:prepared.record,group,mode:'auto'};
  const initial=dataOf(await f.call('start_workshop',activation));
  const updated=dataOf(await f.call('set_workshop_preference',{record:initial.record,mode:'text'}));
  const saved=(await f.store.load(initial.record.key)).record;
  const replay=dataOf(await f.call('start_workshop',activation));assert.deepEqual(replay.record,updated.record);
  assert.equal(replay.questionTurn.preferredInput,'plain_chat','Replaying the old activation must respect the group’s later text preference in this response too.');
  assert.equal(await f.store.getPreference(initial.record.key),'text');
  const resumed=dataOf(await f.call('resume_workshop',{record:prepared.record}));
  assert.equal(resumed.questionTurn.preferredInput,'plain_chat');assert.equal(resumed.mode,'text');
  assert.deepEqual((await f.store.load(initial.record.key)).record,saved);
});

test('a valid near-limit six-step record produces final encoded tool results below 140 KB without shortening saved wording',async t=>{
  const f=await fixture(t),record=nearLimitRecord();
  t.diagnostic(JSON.stringify({recordBytes:encodedBytes(record),phaseAnswerBytes:record.phases.map(phase=>({phase:phase.id,bytes:encodedBytes(phase.answers)}))}));
  const initial=await f.store.activate(await f.store.prepare(),group);
  const saved=await f.store.transact(initial.reference,await operation('rich-record-fixture'),()=>record);
  const sizes=[];
  for(let phase=1;phase<=6;phase++)for(const tool of ['workshop_next','show_workbook']) {
    const result=await f.call(tool,{record:saved.reference,phase});const data=dataOf(result);
    sizes.push({tool,phase,bytes:encodedBytes(result)});
    if(data.phase.answerAccess) {
      const reconstructed={};
      for(const {field,items} of data.phase.answerAccess.fields) {
        if(items===null) reconstructed[field]=dataOf(await f.call('workshop_next',{record:saved.reference,phase,field})).phase.answers[field];
        else {reconstructed[field]=[];for(let itemIndex=0;itemIndex<items;itemIndex++)reconstructed[field].push(...dataOf(await f.call('workshop_next',{record:saved.reference,phase,field,itemIndex})).phase.answers[field]);}
      }
      assert.deepEqual(reconstructed,record.phases[phase-1].answers,'Every oversized answer must remain available in explicit windows.');
    } else assert.deepEqual(data.phase.answers,record.phases[phase-1].answers,'Current-step wording must be complete in the model result.');
    assert.equal(data.record.key,saved.reference.key);assert.equal(data.currentRevision,record.revision);
    assert.equal(new URL(data.workspace.url).hash,`#${await readKeyFor(saved.reference.key)}`);
    if(!result._meta?.workbook)assert.equal(data.view.display,false,'An omitted inline record must not leave a blank visual enabled.');
    else assert.deepEqual(result._meta.workbook,record);
  }
  for(const tool of ['show_shortlist','export_workbook']) {
    const result=await f.call(tool,{record:saved.reference});dataOf(result);sizes.push({tool,phase:tool==='show_shortlist'?5:6,bytes:encodedBytes(result)});
  }
  assert.deepEqual((await f.store.load(saved.reference.key)).record,record);
  assert.deepEqual((await f.store.load(saved.reference.key,record.revision)).record,record);
  const oversized=sizes.filter(item=>item.bytes>=140000);
  t.diagnostic(JSON.stringify({largestResultBytes:Math.max(...sizes.map(item=>item.bytes)),resultsChecked:sizes.length}));
  assert.deepEqual(oversized,[],`Final encoded responses exceed the host limit: ${JSON.stringify(oversized)}; canonical record bytes=${encodedBytes(record)}.`);
});

test('read-key direct PDF and JSON downloads work at the storage budget cap without allocating tickets',async t=>{
  const f=await fixture(t),saved=await seed(f.store,2),readKey=await readKeyFor(saved.reference.key);
  f.db.sqlite.prepare('UPDATE workshop_storage_budget SET limit_bytes=used_bytes WHERE id=1').run();
  const budgetBefore={...f.db.sqlite.prepare('SELECT * FROM workshop_storage_budget WHERE id=1').get()};
  const countBefore=f.db.sqlite.prepare('SELECT count(*) AS count FROM workshop_file_tickets').get().count;
  const rejected=await f.route('/api/file?kind=json',readKey);assert.equal(rejected.status,503,'The fixture must actually refuse new ticket storage.');
  for(const kind of ['pdf','json']) {
    const response=await f.route(`/api/download?kind=${kind}&revision=${saved.record.revision}`,readKey);assert.equal(response.status,200);
    assert.equal(response.headers.get('Content-Type'),kind==='pdf'?'application/pdf':'application/json');
    const filename=kind==='pdf'?`ama-groundwork-r${saved.record.revision}.pdf`:`ama-groundwork-revision-${saved.record.revision}.json`;
    assert.equal(response.headers.get('Content-Disposition'),`attachment; filename="${filename}"`);
    assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(kind==='pdf')assert.deepEqual(bytes,pdfStub(saved.record));else assert.deepEqual(JSON.parse(bytes),saved.record);
  }
  assert.equal(f.db.sqlite.prepare('SELECT count(*) AS count FROM workshop_file_tickets').get().count,countBefore);
  assert.deepEqual({...f.db.sqlite.prepare('SELECT * FROM workshop_storage_budget WHERE id=1').get()},budgetBefore);
  assert.deepEqual((await f.store.load(saved.reference.key)).record,saved.record);
  assert.equal((await f.route('/api/download?kind=json')).status,404);
  assert.equal((await f.route('/api/download?kind=json',saved.reference.key)).status,404);
});

test('ticket allocation failure after confirmation returns the durable approval and stable reading link with export failed',async t=>{
  const f=await fixture(t),initial=await seed(f.store,0);
  const draft=await f.store.transact(initial.reference,await operation('draft-before-ticket-failure'),record=>savePhase(record,1,answers[0]));
  f.db.sqlite.exec("CREATE TRIGGER fail_review_ticket BEFORE INSERT ON workshop_file_tickets BEGIN SELECT RAISE(ABORT,'private injected ticket failure'); END;");
  const request={record:draft.reference,phase:1,approved:true,confirmation:approval,requestId:'approve-with-ticket-failure'};
  const result=await f.call('confirm_workshop_phase',request),data=dataOf(result),saved=(await f.store.load(draft.reference.key)).record;
  assert.equal(saved.revision,draft.record.revision+1);assert.equal(saved.phases[0].status,'confirmed');assert.equal(saved.phases[0].approvalNote,approval);
  assert.equal(data.export.status,'failed');assert.equal(data.export.retryTool,'export_workbook');assert.equal(data.record.revision,saved.revision);
  assert.equal(data.workspace.url,`${baseUrl}/workbook#${await readKeyFor(draft.reference.key)}`);assert(textOf(result).includes(data.workspace.url));
  assert(!textOf(result).includes('private injected ticket failure'));assert.deepEqual(result._meta.workbook,saved);
  assert.deepEqual((await f.store.load(draft.reference.key,draft.record.revision)).record,draft.record);
  f.db.sqlite.exec('DROP TRIGGER fail_review_ticket');
  const retry=dataOf(await f.call('export_workbook',{record:data.record}));assert.equal(retry.export.status,'ready');
  assert.equal(retry.workspace.url,data.workspace.url);assert.deepEqual((await f.store.load(draft.reference.key)).record,saved);
});

test('concentrated Unicode answers use explicit field/item recovery within the host limit without shortening any saved item',async t=>{
  const f=await fixture(t),content=structuredClone(answers);
  content[3].candidates=Array.from({length:5},(_,index)=>({
    ...content[3].candidates[index%2],id:`c${index+1}`,title:`Fictional Unicode candidate ${index+1}`,
    ...Object.fromEntries(['aiWork','value','humanCheck','nonAiAlternative','assumption'].map(field=>[field,'प'.repeat(1200)])),
  }));
  content[4].choices=Array.from({length:5},(_,index)=>({...content[4].choices[index%2],candidateId:`c${index+1}`,decision:index===0?'First':'Later'}));
  let record=createRecord(group);
  for(let phase=1;phase<=6;phase++)record=confirmPhase(savePhase(record,phase,content[phase-1]),phase,approval,'2026-09-11T12:00:00.000Z');
  record=validateRecord({...record,revision:1});
  assert(encodedBytes(record)<150000);assert(encodedBytes(record.phases[3].answers)*2>140000);
  const initial=await f.store.activate(await f.store.prepare(),group);
  const saved=await f.store.transact(initial.reference,await operation('unicode-concentrated-fixture'),()=>record);
  const sizes=[];let access;
  for(let phase=1;phase<=6;phase++) {
    const result=await f.call('workshop_next',{record:saved.reference,phase}),data=dataOf(result);
    sizes.push(encodedBytes(result));
    if(phase!==4)assert.deepEqual(data.phase.answers,record.phases[phase-1].answers);
    else {
      assert.deepEqual(data.phase.answers,{});access=data.phase.answerAccess;
      assert.equal(access.tool,'workshop_next');assert.equal(access.phase,4);
      assert.deepEqual(access.fields,[{field:'candidates',items:5}]);
      assert.match(access.instruction,/all|every|each/i);assert.match(access.instruction,/approv|summar/i);
      assert.equal(data.view.display,false);
    }
  }
  const rebuilt={};
  for(const descriptor of access.fields) {
    if(descriptor.items!==null)rebuilt[descriptor.field]=[];
    for(let index=0;index<(descriptor.items??1);index++) {
      const args={record:saved.reference,phase:access.phase,field:descriptor.field,...(descriptor.items===null?{}:{itemIndex:index})};
      const result=await f.call(access.tool,args),data=dataOf(result);sizes.push(encodedBytes(result));
      assert.equal(data.phase.answerWindow.field,descriptor.field);assert.equal(data.phase.answerWindow.complete,false);
      assert.equal(data.phase.answerWindow.totalItems,descriptor.items);
      assert.equal(data.phase.answerAccess,undefined,'A single bounded item must be returned, not another unresolved large-answer notice.');
      assert.deepEqual(Object.keys(data.phase.answers),[descriptor.field]);
      if(descriptor.items===null)rebuilt[descriptor.field]=data.phase.answers[descriptor.field];
      else {
        assert.equal(data.phase.answerWindow.itemIndex,index);assert.equal(data.phase.answers[descriptor.field].length,1);
        rebuilt[descriptor.field].push(data.phase.answers[descriptor.field][0]);
      }
    }
  }
  assert.deepEqual(rebuilt,record.phases[3].answers);
  assert.deepEqual((await f.store.load(saved.reference.key)).record,record);
  assert.deepEqual((await f.store.load(saved.reference.key,record.revision)).record,record);
  assert(sizes.every(size=>size<=140000),`A Unicode response exceeded the host limit: ${JSON.stringify(sizes)}.`);
  t.diagnostic(JSON.stringify({unicodeRecordBytes:encodedBytes(record),unicodePhase4AnswersBytes:encodedBytes(record.phases[3].answers),reconstructedItems:rebuilt.candidates.length,largestRecoveryResultBytes:Math.max(...sizes)}));
});
