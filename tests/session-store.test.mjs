import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createD1SessionStore,MAX_SESSIONS,MAX_REVISION,MAX_RECEIPTS,MAX_ACTIVE_TICKETS,MAX_RETAINED_BYTES} from '../remote/d1-session-store.mjs';
import {canonicalJson,hashValue,readKeyFor,referenceSchema,SessionError} from '../src/session-store.mjs';
import {createSqliteD1} from './support/d1-sqlite.mjs';
import {savePhase,confirmPhase} from '../src/workshop.mjs';
import {group,answers} from '../examples/shared-services.mjs';

const operation=async (id,payload=id)=>({operationId:id,operationHash:await hashValue(canonicalJson(payload))});
const code=expected=>error=>error instanceof SessionError&&error.code===expected;
async function fixture(t,options={}) {
  const db=createSqliteD1();t.after(()=>db.close());
  const store=createD1SessionStore(db,options),reference=await store.prepare();
  await store.activate(reference,group);
  return {db,store,reference};
}
const counts=db=>Object.fromEntries(['workshop_sessions','workshop_revisions','workshop_operations','workshop_file_tickets'].map(table=>[table,db.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]));
const budget=db=>db.sqlite.prepare('SELECT used_bytes,limit_bytes FROM workshop_storage_budget WHERE id=1').get();
const lowerBudget=(db,allowance)=>db.sqlite.prepare('UPDATE workshop_storage_budget SET limit_bytes=used_bytes+? WHERE id=1').run(allowance);

test('shared helpers are deterministic, bounded and reject unsupported values',async()=>{
  assert.equal(canonicalJson({b:[2,{z:1,a:true}],a:null}),'{"a":null,"b":[2,{"a":true,"z":1}]}');
  assert.equal(await hashValue('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const key=`ws1_${'A'.repeat(43)}`,readKey=await readKeyFor(key);
  assert.match(readKey,/^wr1_[A-Za-z0-9_-]{43}$/);assert.equal(readKey,await readKeyFor(key));
  assert.equal(referenceSchema.parse({key:readKey,revision:0}).key,readKey);
  assert.equal(referenceSchema.safeParse({key,revision:Number.MAX_SAFE_INTEGER+1}).success,false);
  for (const value of [undefined,NaN,Infinity,new Date(),{a:undefined}]) assert.throws(()=>canonicalJson(value),code('CONFLICT'));
  const cycle={};cycle.self=cycle;assert.throws(()=>canonicalJson(cycle),code('CONFLICT'));
  await assert.rejects(readKeyFor(readKey),code('NOT_FOUND'));
});

test('prepare stores only hashes and pending metadata, never group data or raw credentials',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());const store=createD1SessionStore(db);
  const ref=await store.prepare(),row=db.sqlite.prepare('SELECT * FROM workshop_sessions').get();
  assert.match(ref.key,/^ws1_[A-Za-z0-9_-]{43}$/);assert.equal(ref.revision,0);
  assert.equal(row.state,'pending');assert.equal(row.current_record,null);assert.equal(row.activation_hash,null);
  assert.equal(row.write_hash,await hashValue(ref.key));
  assert.equal(row.read_hash,await hashValue(await readKeyFor(ref.key)));
  assert.equal(JSON.stringify(row).includes(ref.key),false);
  assert.deepEqual(counts(db),{workshop_sessions:1,workshop_revisions:0,workshop_operations:0,workshop_file_tickets:0});
  await assert.rejects(store.load(ref.key),code('PENDING'));
});

test('activation response loss retries safely, even after later edits and a group rename',async t=>{
  const {store,reference:ref}=await fixture(t);
  assert.equal((await store.activate(ref,group)).replayed,true);
  const saved=await store.transact(ref,await operation('rename'),r=>savePhase(r,1,{}, {name:'Another group name'}));
  const replay=await store.activate(ref,group);
  assert.equal(replay.replayed,true);assert.equal(replay.appliedRevision,0);assert.equal(replay.record.group.name,'Another group name');
  assert.equal(replay.reference.revision,saved.reference.revision);
  await assert.rejects(store.activate(ref,{...group,name:'Different activation'}),code('CONFLICT'));
  await assert.rejects(store.activate({key:`ws1_${'B'.repeat(43)}`,revision:0},group),code('NOT_FOUND'));
});

test('activation snapshot failure leaves the prepared reference pending',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());const store=createD1SessionStore(db),ref=await store.prepare();
  db.sqlite.exec("CREATE TRIGGER fail_activation BEFORE INSERT ON workshop_revisions BEGIN SELECT RAISE(ABORT,'private detail'); END;");
  await assert.rejects(store.activate(ref,group),error=>code('UNAVAILABLE')(error)&&!error.message.includes('private detail'));
  assert.equal(db.sqlite.prepare('SELECT state FROM workshop_sessions').get().state,'pending');
  assert.equal(counts(db).workshop_revisions,0);
  db.sqlite.exec('DROP TRIGGER fail_activation');assert.equal((await store.activate(ref,group)).record.revision,0);
});

test('automatic workshop date survives activation retry across midnight and later resumption',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());
  let now=new Date('2026-09-12T23:59:58Z');
  const store=createD1SessionStore(db,{now:()=>now}),ref=await store.prepare();
  const {date,...undated}=group;
  const started=await store.activate(ref,undated);
  assert.equal(started.record.group.date,'2026-09-12');
  now=new Date('2026-09-13T00:00:04Z');
  const retry=await store.activate(ref,undated);
  assert.equal(retry.replayed,true);assert.deepEqual(retry.record,started.record);
  now=new Date('2026-12-15T10:00:00Z');
  assert.equal((await store.load(ref.key)).record.group.date,'2026-09-12');
  const explicit=await store.activate(await store.prepare(),{...undated,date});
  assert.equal(explicit.record.group.date,date);
});

test('data, snapshots and preference survive restart and a 100-day time advance',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'workshop-store-test-')),filename=join(directory,'test.sqlite');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  let clock=Date.parse('2026-09-11T10:00:00Z'),db=createSqliteD1(filename),store=createD1SessionStore(db,{now:()=>clock});
  const ref=await store.prepare();await store.activate(ref,group);
  const saved=await store.transact(ref,await operation('first'),r=>savePhase(r,1,{outcome:'Fewer avoidable delays'}));
  await store.setPreference(saved.reference,'text');db.close();clock+=100*24*60*60*1000;
  db=createSqliteD1(filename);t.after(()=>db.close());store=createD1SessionStore(db,{now:()=>clock});
  assert.equal((await store.load(ref.key)).record.phases[0].answers.outcome,'Fewer avoidable delays');
  assert.equal((await store.load(ref.key,0)).record.phases[0].answers.outcome,undefined);
  assert.equal(await store.getPreference(ref.key),'text');
  assert.equal((await store.history(ref.key)).length,2);
  assert.equal((await store.transact(ref,await operation('first'),()=>{throw new Error('Receipt must survive restart');})).replayed,true);
});

test('two different concurrent writes at one revision have exactly one winner',async t=>{
  const {db,store,reference:ref}=await fixture(t),ops=await Promise.all([operation('a'),operation('b')]);
  const results=await Promise.allSettled(ops.map((op,i)=>store.transact(ref,op,r=>savePhase(r,1,{outcome:`Choice ${i}`}))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const rejected=results.find(r=>r.status==='rejected');assert.equal(rejected.reason.code,'CONFLICT');
  assert.equal((await store.load(ref.key)).record.revision,1);
  assert.equal(counts(db).workshop_revisions,2);assert.equal(counts(db).workshop_operations,1);
});

test('lost approval response is replayed without changing timestamp and returns latest record',async t=>{
  const {store,reference:ref}=await fixture(t);
  const saved=await store.transact(ref,await operation('answers'),r=>savePhase(r,1,answers[0]));
  const approve=await operation('approve',{phase:1,confirmation:'Our group approves.'});let calls=0;
  const original=await store.transact(saved.reference,approve,r=>{calls++;return confirmPhase(r,1,'Our group approves.','2026-09-11T10:00:00.000Z');});
  await store.transact(original.reference,await operation('phase2'),r=>savePhase(r,2,{firstGap:'Find the missing record'}));
  const replay=await store.transact(saved.reference,approve,()=>{throw new Error('Must not run');});
  assert.equal(calls,1);assert.equal(replay.replayed,true);assert.equal(replay.appliedRevision,2);
  assert.equal(replay.record.revision,3);assert.equal(replay.record.phases[0].approvedAt,'2026-09-11T10:00:00.000Z');
  await assert.rejects(store.transact(saved.reference,await operation('approve','different payload'),r=>r),code('OPERATION_CONFLICT'));
  await assert.rejects(store.transact(original.reference,approve,r=>r),code('OPERATION_CONFLICT'));
});

test('concurrent identical retries create one revision and one durable receipt',async t=>{
  const {db,store,reference:ref}=await fixture(t),op=await operation('same');
  const results=await Promise.all([1,2].map(()=>store.transact(ref,op,r=>savePhase(r,1,{outcome:'Same answer'}))));
  assert.equal(results.filter(r=>r.replayed).length,1);
  assert.equal(counts(db).workshop_revisions,2);assert.equal(counts(db).workshop_operations,1);
});

for (const table of ['workshop_revisions','workshop_operations']) test(`${table} insert failure rolls back the head, snapshot and receipt together`,async t=>{
  const {db,store,reference:ref}=await fixture(t),op=await operation('fail');
  db.sqlite.exec(`CREATE TRIGGER injected_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'private storage detail'); END;`);
  await assert.rejects(store.transact(ref,op,r=>savePhase(r,1,{outcome:'Must not persist'})),code('UNAVAILABLE'));
  const loaded=await store.load(ref.key);assert.equal(loaded.record.revision,0);assert.deepEqual(loaded.record.phases[0].answers,{});
  assert.equal(counts(db).workshop_revisions,1);assert.equal(counts(db).workshop_operations,0);
  db.sqlite.exec('DROP TRIGGER injected_failure');
  assert.equal((await store.transact(ref,op,r=>savePhase(r,1,{outcome:'Now saved'}))).replayed,false);
});

test('no-op save preserves approval and revision, while its retry receipt persists',async t=>{
  const {db,store,reference:ref}=await fixture(t);
  const saved=await store.transact(ref,await operation('save'),r=>savePhase(r,1,answers[0]));
  const approved=await store.transact(saved.reference,await operation('confirm'),r=>confirmPhase(r,1,'Approved by our group.'));
  const op=await operation('noop'),noOp=await store.transact(approved.reference,op,r=>savePhase(r,1,answers[0]));
  assert.deepEqual(noOp.record,approved.record);assert.equal(noOp.appliedRevision,approved.reference.revision);
  assert.equal(counts(db).workshop_revisions,3);assert.equal(counts(db).workshop_operations,3);
  assert.equal((await store.transact(approved.reference,op,r=>r)).replayed,true);
});

test('concurrent identical no-ops also return one fresh receipt and one replay',async t=>{
  const {db,store,reference:ref}=await fixture(t),op=await operation('noop');
  const results=await Promise.all([1,2].map(()=>store.transact(ref,op,r=>r)));
  assert.equal(results.filter(r=>r.replayed).length,1);
  assert.equal(counts(db).workshop_revisions,1);assert.equal(counts(db).workshop_operations,1);
});

test('historical snapshots stay immutable after later changes',async t=>{
  const {db,store,reference:ref}=await fixture(t);
  await store.transact(ref,await operation('one'),r=>savePhase(r,1,{outcome:'New wording'}));
  const earlier=await store.load(ref.key,0);assert.equal(earlier.reference.revision,0);assert.equal(earlier.currentRevision,1);
  assert.deepEqual(earlier.record.phases[0].answers,{});
  assert.throws(()=>db.sqlite.exec("UPDATE workshop_revisions SET record_json='{}'"),/Immutable/);
  assert.throws(()=>db.sqlite.exec("UPDATE workshop_operations SET operation_hash='x'"),/Immutable/);
  await assert.rejects(store.load(ref.key,99),code('NOT_FOUND'));
});

test('read access can load, view history and create tickets without exposing or promoting the write key',async t=>{
  const {store,reference:ref}=await fixture(t),readKey=await readKeyFor(ref.key),readRef={key:readKey,revision:0};
  const loaded=await store.loadShared(readKey);assert.equal(loaded.reference.key,readKey);assert.equal(JSON.stringify(loaded).includes(ref.key),false);
  assert.equal((await store.load(readKey)).reference.key,readKey);
  assert.equal((await store.history(readKey)).length,1);assert.equal(await store.getPreference(readKey),'auto');
  const file=await store.createFileTicket(readKey,0,'json');assert.equal((await store.resolveFileTicket(file.ticket)).revision,0);
  assert.equal(JSON.stringify(file).includes(ref.key),false);
  for (const call of [()=>store.activate(readRef,group),()=>store.transact(readRef,{},r=>r),()=>store.remove(readRef),()=>store.setPreference(readRef,'text'),()=>store.loadShared(ref.key)]) await assert.rejects(call(),code('NOT_FOUND'));
});

test('separate sessions and their operation IDs, history and files stay isolated',async t=>{
  const {store,reference:a}=await fixture(t),b=await store.prepare();await store.activate(b,{...group,name:'Second group'});
  await store.transact(a,await operation('same-id'),r=>savePhase(r,1,{outcome:'Group A only'}));
  await store.transact(b,await operation('same-id'),r=>savePhase(r,1,{outcome:'Group B only'}));
  assert.equal((await store.load(await readKeyFor(a.key))).record.phases[0].answers.outcome,'Group A only');
  assert.equal((await store.load(await readKeyFor(b.key))).record.phases[0].answers.outcome,'Group B only');
  assert.equal((await store.history(b.key)).length,2);
  const ticket=await store.createFileTicket(b.key,1,'pdf');assert.equal((await store.resolveFileTicket(ticket.ticket)).record.group.name,'Second group');
});

test('tickets are hashed, revision-bound, reusable and expire without expiring the workbook',async t=>{
  let clock=Date.parse('2026-09-11T10:00:00Z');const {db,store,reference:ref}=await fixture(t,{now:()=>clock});
  const ticket=await store.createFileTicket(ref.key,0,'pdf');
  assert.equal(ticket.expiresAt,'2026-09-11T10:15:00.000Z');
  assert.equal(db.sqlite.prepare('SELECT ticket_hash FROM workshop_file_tickets').get().ticket_hash,await hashValue(ticket.ticket));
  await store.transact(ref,await operation('later'),r=>savePhase(r,1,{outcome:'Later feedback'}));
  for (let i=0;i<2;i++) assert.equal((await store.resolveFileTicket(ticket.ticket)).record.revision,0);
  clock+=15*60*1000-1;assert.equal((await store.resolveFileTicket(ticket.ticket)).kind,'pdf');
  clock++;await assert.rejects(store.resolveFileTicket(ticket.ticket),code('NOT_FOUND'));
  clock+=100*24*60*60*1000;assert.equal((await store.load(ref.key)).record.revision,1);
});

test('deletion checks revision, cascades every child, and cannot resurrect old references',async t=>{
  const {db,store,reference:ref}=await fixture(t),readKey=await readKeyFor(ref.key);
  const saved=await store.transact(ref,await operation('one'),r=>savePhase(r,1,{outcome:'Saved'}));
  const ticket=await store.createFileTicket(readKey,0,'json');
  await assert.rejects(store.remove(ref),code('CONFLICT'));assert.equal(counts(db).workshop_file_tickets,1);
  assert.deepEqual(await store.remove(saved.reference),{deleted:true});
  assert.deepEqual(counts(db),{workshop_sessions:0,workshop_revisions:0,workshop_operations:0,workshop_file_tickets:0});
  for (const call of [()=>store.load(ref.key),()=>store.loadShared(readKey),()=>store.resolveFileTicket(ticket.ticket),()=>store.activate(ref,group),()=>store.transact(ref,{},r=>r),()=>store.history(readKey),()=>store.createFileTicket(ref.key,0,'pdf')]) {
    await assert.rejects(call(),error=>error instanceof SessionError&&['NOT_FOUND','OPERATION_CONFLICT'].includes(error.code));
  }
  assert.equal(counts(db).workshop_sessions,0);
});

test('preference is metadata only and rejects stale, invalid and read-only writes',async t=>{
  const {db,store,reference:ref}=await fixture(t),before=(await store.load(ref.key)).record;
  const result=await store.setPreference(ref,'text');assert.deepEqual(result.record,before);assert.equal(result.reference.revision,0);
  assert.equal(counts(db).workshop_revisions,1);assert.equal(counts(db).workshop_operations,0);
  await store.transact(ref,await operation('save'),r=>savePhase(r,1,{outcome:'Changed'}));
  await assert.rejects(store.setPreference(ref,'auto'),code('CONFLICT'));assert.equal(await store.getPreference(ref.key),'text');
  await assert.rejects(store.setPreference({key:ref.key,revision:1},'other'),code('CONFLICT'));
});

test('invalid or asynchronous reducers cannot write partial or unversioned changes',async t=>{
  const {db,store,reference:ref}=await fixture(t);
  const reducers=[r=>({...r,revision:2}),r=>({...r,revision:1}),r=>({...r,group:{...r.group,name:'Unversioned'}}),async r=>r,r=>({...r,group:{...r.group,problem:'x'.repeat(150001)}})];
  for (let i=0;i<reducers.length;i++) await assert.rejects(store.transact(ref,await operation(`invalid-${i}`),reducers[i]));
  assert.equal((await store.load(ref.key)).record.revision,0);assert.equal(counts(db).workshop_operations,0);
});

test('query parameters preserve literal punctuation and failures disclose no SQL or credentials',async t=>{
  const {store,reference:ref}=await fixture(t);
  const text="Review O'Brien's request; DROP TABLE workshop_sessions; --";
  await store.transact(ref,await operation('literal'),r=>savePhase(r,1,{outcome:text}));
  assert.equal((await store.load(ref.key)).record.phases[0].answers.outcome,text);
  const invalid="ws1_' OR 1=1 --";
  await assert.rejects(store.load(invalid),error=>code('NOT_FOUND')(error)&&!error.message.includes(invalid));
  const broken=createD1SessionStore({prepare(){throw new Error(`private SQL ${ref.key}`);}});
  await assert.rejects(broken.load(ref.key),error=>code('UNAVAILABLE')(error)&&!error.message.includes(ref.key)&&!error.message.includes('SQL'));
});

test('history is bounded to the latest 100 metadata rows',async t=>{
  const {store,reference:ref}=await fixture(t);let latest=ref;
  for(let i=1;i<=102;i++) latest=(await store.transact(latest,await operation(`revision-${i}`),r=>savePhase(r,1,{outcome:`Answer ${i}`}))).reference;
  const history=await store.history(await readKeyFor(ref.key));
  assert.equal(history.length,100);assert.equal(history[0].revision,102);assert.equal(history.at(-1).revision,3);
  assert.deepEqual(Object.keys(history[0]).sort(),['createdAt','revision']);
  assert.equal((await store.load(ref.key,0)).record.revision,0);
});

test('atomic preparation limit counts active and pending rows without removing either',async t=>{
  const {db,store,reference:ref}=await fixture(t);
  for (let i=1;i<MAX_SESSIONS-1;i++) await store.prepare();
  const attempts=await Promise.allSettled([store.prepare(),store.prepare()]);
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(attempts.find(item=>item.status==='rejected').reason.code,'LIMIT');
  assert.equal(counts(db).workshop_sessions,MAX_SESSIONS);
  assert.equal((await store.load(ref.key)).record.revision,0);
  assert.equal((await store.history(ref.key)).length,1);
  const pending=attempts.find(item=>item.status==='fulfilled').value;
  await store.remove(pending);
  assert.equal((await store.prepare()).revision,0);
  assert.equal(counts(db).workshop_sessions,MAX_SESSIONS);
});

test('revision limit retains the workbook, historical exports, receipt replay and deletion',async t=>{
  const {db,store,reference:ref}=await fixture(t);let latest=ref,prior,finalOperation;
  for (let i=1;i<=MAX_REVISION;i++) {
    prior=latest;finalOperation=await operation(`bounded-${i}`);
    latest=(await store.transact(latest,finalOperation,r=>savePhase(r,1,{outcome:`Revision ${i}`}))).reference;
  }
  await assert.rejects(store.transact(latest,await operation('over-limit'),r=>savePhase(r,1,{outcome:'One too many'})),code('LIMIT'));
  assert.equal((await store.load(ref.key)).record.revision,MAX_REVISION);
  assert.equal(counts(db).workshop_revisions,MAX_REVISION+1);
  assert.equal((await store.transact(prior,finalOperation,()=>{throw new Error('Do not replay');})).replayed,true);
  const ticket=await store.createFileTicket(await readKeyFor(ref.key),0,'json');
  assert.equal((await store.resolveFileTicket(ticket.ticket)).revision,0);
  assert.equal((await store.setPreference(latest,'text')).record.revision,MAX_REVISION);
  assert.equal((await store.transact(latest,await operation('bounded-noop'),r=>r)).record.revision,MAX_REVISION);
  await store.remove(latest);assert.equal(counts(db).workshop_sessions,0);
});

test('D1-compatible row counts include trigger and cascade effects without false conflicts',async t=>{
  const {db,store,reference:ref}=await fixture(t);
  const result=await db.prepare('UPDATE workshop_sessions SET current_record=current_record WHERE write_hash=?').bind(await hashValue(ref.key)).run();
  assert.ok(result.meta.changes>1,'D1 total_changes includes the budget trigger');
  const saved=await store.transact(ref,await operation('check'),r=>savePhase(r,1,{outcome:'Trigger-safe'}));
  assert.equal(saved.replayed,false);
  await store.createFileTicket(ref.key,0,'json');assert.deepEqual(await store.remove(saved.reference),{deleted:true});
  assert.equal(budget(db).used_bytes,0);
});

test('receipt admission bounds no-op growth and allows durable replays at the limit',async t=>{
  const {db,store,reference:ref}=await fixture(t);let last;
  for(let i=0;i<MAX_RECEIPTS;i++) {last=await operation(`noop-${i}`);await store.transact(ref,last,r=>r);}
  assert.equal(counts(db).workshop_operations,MAX_RECEIPTS);assert.equal(counts(db).workshop_revisions,1);
  assert.equal((await store.transact(ref,last,()=>{throw new Error('Must not run');})).replayed,true);
  const before=budget(db).used_bytes;
  await assert.rejects(store.transact(ref,await operation('no-more-receipts'),r=>savePhase(r,1,{outcome:'Must roll back'})),code('LIMIT'));
  assert.equal((await store.load(ref.key)).record.revision,0);assert.equal(budget(db).used_bytes,before);
  await store.remove(ref);assert.equal(budget(db).used_bytes,0);
});

test('ticket admission is atomic and expiry cleanup does not touch workbooks or history',async t=>{
  let clock=Date.parse('2026-09-11T10:00:00Z');const {db,store,reference:ref}=await fixture(t,{now:()=>clock});
  const earlier=[];for(let i=0;i<MAX_ACTIVE_TICKETS-1;i++) earlier.push(await store.createFileTicket(ref.key,0,'json'));
  const attempts=await Promise.allSettled([store.createFileTicket(ref.key,0,'pdf'),store.createFileTicket(await readKeyFor(ref.key),0,'pdf')]);
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(attempts.find(item=>item.status==='rejected').reason.code,'LIMIT');
  assert.equal(counts(db).workshop_file_tickets,MAX_ACTIVE_TICKETS);
  const before=budget(db).used_bytes;
  clock+=15*60*1000;const latest=await store.createFileTicket(ref.key,0,'json');
  assert.equal(counts(db).workshop_file_tickets,1);assert.equal((await store.resolveFileTicket(latest.ticket)).revision,0);
  await assert.rejects(store.resolveFileTicket(earlier[0].ticket),code('NOT_FOUND'));
  assert.equal(counts(db).workshop_sessions,1);assert.equal(counts(db).workshop_revisions,1);
  assert.equal(budget(db).used_bytes,before-(MAX_ACTIVE_TICKETS-1)*2048);
});

test('byte budget counts UTF-8 head and immutable snapshots plus conservative row allowances',async t=>{
  const {db,store,reference:ref}=await fixture(t),record=(await store.load(ref.key)).record;
  const bytes=new TextEncoder().encode(canonicalJson(record)).byteLength;
  assert.equal(budget(db).limit_bytes,MAX_RETAINED_BYTES);assert.equal(budget(db).used_bytes,4096+bytes+4096+bytes);
  const saved=await store.transact(ref,await operation('unicode'),r=>savePhase(r,1,{outcome:'जवाब और निर्णय'}));
  const nextBytes=new TextEncoder().encode(canonicalJson(saved.record)).byteLength;
  assert.equal(budget(db).used_bytes,4096+nextBytes+4096+bytes+4096+nextBytes+2048);
  await store.createFileTicket(ref.key,0,'json');assert.equal(budget(db).used_bytes,4096+nextBytes+4096+bytes+4096+nextBytes+2048+2048);
  await store.remove(saved.reference);assert.equal(budget(db).used_bytes,0);
});

test('byte budget refuses preparation and activation atomically without losing a prepared reference',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());const store=createD1SessionStore(db);
  db.sqlite.prepare('UPDATE workshop_storage_budget SET limit_bytes=4096').run();
  const ref=await store.prepare();assert.equal(budget(db).used_bytes,4096);
  await assert.rejects(store.prepare(),code('LIMIT'));assert.equal(counts(db).workshop_sessions,1);
  await assert.rejects(store.activate(ref,group),code('LIMIT'));
  assert.equal(db.sqlite.prepare('SELECT state FROM workshop_sessions').get().state,'pending');
  assert.equal(counts(db).workshop_revisions,0);assert.equal(budget(db).used_bytes,4096);
  await store.remove(ref);assert.equal(budget(db).used_bytes,0);
});

test('byte admission rolls back head, snapshot, receipt and counter while retaining reads and deletion',async t=>{
  const {db,store,reference:ref}=await fixture(t),before=budget(db).used_bytes,op=await operation('budget-block');
  lowerBudget(db,2048);
  await assert.rejects(store.transact(ref,op,r=>savePhase(r,1,{outcome:'This head and its snapshot must not remain'})),code('LIMIT'));
  assert.equal((await store.load(ref.key)).record.revision,0);assert.equal((await store.history(ref.key)).length,1);
  assert.equal(budget(db).used_bytes,before);assert.equal(counts(db).workshop_operations,0);
  db.sqlite.prepare('UPDATE workshop_storage_budget SET limit_bytes=?').run(MAX_RETAINED_BYTES);
  const saved=await store.transact(ref,op,r=>savePhase(r,1,{outcome:'This head and its snapshot must not remain'}));
  assert.equal(saved.replayed,false);assert.equal(saved.record.revision,1);
  lowerBudget(db,0);assert.equal((await store.load(ref.key)).record.revision,1);
  assert.equal((await store.transact(ref,op,()=>{throw new Error('Must not run');})).replayed,true);
  await store.remove(saved.reference);assert.equal(budget(db).used_bytes,0);
});

test('concurrent preparations cannot overrun a one-row byte allowance',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());const store=createD1SessionStore(db);
  db.sqlite.prepare('UPDATE workshop_storage_budget SET limit_bytes=4096').run();
  const attempts=await Promise.allSettled([store.prepare(),store.prepare()]);
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(attempts.find(item=>item.status==='rejected').reason.code,'LIMIT');
  assert.equal(counts(db).workshop_sessions,1);assert.equal(budget(db).used_bytes,4096);
});

test('independent database connections still have one winner for competing changes',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'workshop-cas-test-')),filename=join(directory,'test.sqlite');
  const firstDb=createSqliteD1(filename),secondDb=createSqliteD1(filename);
  t.after(()=>{firstDb.close();secondDb.close();rmSync(directory,{recursive:true,force:true});});
  const first=createD1SessionStore(firstDb),second=createD1SessionStore(secondDb),ref=await first.prepare();await first.activate(ref,group);
  const ops=await Promise.all([operation('connection-a'),operation('connection-b')]);
  const attempts=await Promise.allSettled([first.transact(ref,ops[0],r=>savePhase(r,1,{outcome:'First connection'})),second.transact(ref,ops[1],r=>savePhase(r,1,{outcome:'Second connection'}))]);
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(attempts.find(item=>item.status==='rejected').reason.code,'CONFLICT');
  assert.deepEqual((await first.load(ref.key)).record,(await second.load(ref.key)).record);
  assert.equal(counts(firstDb).workshop_revisions,2);
});

test('a failed cascade deletion leaves all records and its budget intact',async t=>{
  const {db,store,reference:ref}=await fixture(t);
  const saved=await store.transact(ref,await operation('saved'),r=>savePhase(r,1,{outcome:'Retain after failed deletion'}));
  const ticket=await store.createFileTicket(ref.key,0,'json'),beforeCounts=counts(db),beforeBudget=budget(db).used_bytes;
  db.sqlite.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON workshop_revisions BEGIN SELECT RAISE(ABORT,'private failure'); END;");
  await assert.rejects(store.remove(saved.reference),code('UNAVAILABLE'));
  assert.deepEqual(counts(db),beforeCounts);assert.equal(budget(db).used_bytes,beforeBudget);
  assert.equal((await store.resolveFileTicket(ticket.ticket)).revision,0);
  db.sqlite.exec('DROP TRIGGER fail_delete');await store.remove(saved.reference);assert.equal(budget(db).used_bytes,0);
});

test('failed ticket creation rolls back only-expired cleanup in the same D1 batch',async t=>{
  let clock=Date.parse('2026-09-11T10:00:00Z');const {db,store,reference:ref}=await fixture(t,{now:()=>clock});
  await store.createFileTicket(ref.key,0,'json');const before=budget(db).used_bytes;
  clock+=15*60*1000;
  db.sqlite.exec("CREATE TRIGGER fail_ticket BEFORE INSERT ON workshop_file_tickets BEGIN SELECT RAISE(ABORT,'private failure'); END;");
  await assert.rejects(store.createFileTicket(ref.key,0,'pdf'),code('UNAVAILABLE'));
  assert.equal(counts(db).workshop_file_tickets,1);assert.equal(budget(db).used_bytes,before);
  assert.equal((await store.load(ref.key)).record.revision,0);
});
