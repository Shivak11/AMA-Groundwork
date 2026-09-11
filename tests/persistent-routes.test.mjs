import test from 'node:test';
import assert from 'node:assert/strict';
import {persistentRoute} from '../remote/persistent-routes.mjs';
import {workspacePage,workspaceCsp} from '../remote/workspace.mjs';
import {createD1SessionStore} from '../remote/d1-session-store.mjs';
import {createSqliteD1} from './support/d1-sqlite.mjs';
import {savePhase,confirmPhase} from '../src/workshop.mjs';
import {canonicalJson,hashValue,readKeyFor} from '../src/session-store.mjs';
import {group,answers,approval} from '../examples/persistent-remote-team.mjs';

const baseUrl='https://workshop.example';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
// These renderers expose exactly which saved revision reaches a route. Their
// output is test data, not proof of PDF layout or a participant download.
const bookStub=record=>`<!doctype html><article data-revision="${record.revision}"><pre>${escape(canonicalJson(record))}</pre></article>`;
const pdfStub=record=>Buffer.from(`%PDF-persistent-route-test-stub\n${canonicalJson(record)}`);
const operation=async(id,payload=id)=>({operationId:id,operationHash:await hashValue(canonicalJson(payload))});

async function fixture(t,{bookRenderer=bookStub,pdfRenderer=pdfStub}={}) {
  const db=createSqliteD1();t.after(()=>db.close());
  let now=Date.parse('2026-09-11T12:00:00Z');
  const store=createD1SessionStore(db,{now:()=>now});
  const route=(path,{key,method='GET',headers={}}={})=>persistentRoute(new Request(new URL(path,baseUrl),{
    method,headers:{...(key?{Authorization:`Bearer ${key}`}:{ }),...headers},
  }),{store,bookRenderer,pdfRenderer,baseUrl});
  return {db,store,route,advance:milliseconds=>{now+=milliseconds;}};
}
async function seed(store,{name=group.name,through=1}={}) {
  let loaded=await store.activate(await store.prepare(),{...group,name});
  for(let phase=1;phase<=through;phase++) {
    loaded=await store.transact(loaded.reference,await operation(`save-${phase}`,answers[phase-1]),record=>savePhase(record,phase,answers[phase-1]));
    loaded=await store.transact(loaded.reference,await operation(`approve-${phase}`),record=>confirmPhase(record,phase,approval,'2026-09-11T12:00:00.000Z'));
  }
  return {...loaded,readKey:await readKeyFor(loaded.reference.key)};
}
function protection(response,{noindex=true}={}) {
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  if(noindex)assert.match(response.headers.get('X-Robots-Tag')??'',/noindex/i);
  assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
}
function assertNoSecret(text,...values) {for(const value of values)assert(!text.includes(value),'Responses must not reflect private credentials or unrelated group content.');}
function ticketOf(url) {const parsed=new URL(url);assert.equal(parsed.origin,baseUrl);assert.equal(parsed.search,'');assert.equal(parsed.hash,'');assert.match(parsed.pathname,/^\/files\/wf1_[A-Za-z0-9_-]{43}$/);return parsed.pathname.slice('/files/'.length);}

test('workspace serves the imported static page and takes its read credential only from the URL fragment',async t=>{
  const f=await fixture(t),saved=await seed(f.store);
  const response=await f.route(`/workbook#${saved.readKey}`);assert.equal(response.status,200);protection(response);
  assert.equal(response.headers.get('Content-Type'),'text/html; charset=utf-8');
  assert.equal(response.headers.get('Content-Security-Policy'),workspaceCsp);
  const html=await response.text();assert.equal(html,workspacePage);assertNoSecret(html,saved.readKey,saved.reference.key,group.problem);
  assert.match(html,/location\.hash\.slice\(1\)/);
  assert.match(html,/Authorization:'Bearer '\+key/);
  assert.match(html,/credentials:'omit'/);assert.match(html,/cache:'no-store'/);assert.match(html,/referrerPolicy:'no-referrer'/);
  assert(!/location\.search|searchParams\.get\(['"](?:key|token)|localStorage|sessionStorage|document\.cookie/.test(html));
  assert(!/<(?:script|link|img)\b[^>]*(?:src|href)=["']https?:/i.test(html));assert(!/@import\b/i.test(html));
  assert.match(html,/<iframe[^>]+sandbox=""/);assert(!/<(?:form|input|textarea)\b/i.test(html));
  assert.match(workspaceCsp,/connect-src 'self'/);assert.match(workspaceCsp,/form-action 'none'/);assert.match(workspaceCsp,/frame-ancestors 'none'/);
  const queryOnly=await f.route(`/api/workbook?key=${saved.readKey}`);assert.equal(queryOnly.status,404);
  const fragmentOnly=await f.route(`/api/workbook#${saved.readKey}`);assert.equal(fragmentOnly.status,404);
});

test('private APIs require the group read key and never infer access from cookies, write keys or MCP session markers',async t=>{
  const f=await fixture(t),saved=await seed(f.store);
  const attempts=[{}, {key:saved.reference.key}, {key:`wr1_${'A'.repeat(43)}`},
    {headers:{Cookie:`workbook=${saved.readKey}`}},
    {headers:{'Mcp-Session-Id':'workshop-ui1-00000000-0000-4000-8000-000000000000'}},
    {headers:{Authorization:`Bearer ${saved.readKey} extra`}},
  ];
  for(const path of ['/api/workbook','/api/file?kind=json'])for(const attempt of attempts) {
    const denied=await f.route(path,attempt);assert.equal(denied.status,404);protection(denied);
    assertNoSecret(await denied.text(),saved.readKey,saved.reference.key,group.problem);
  }
  const allowed=await f.route('/api/workbook',{key:saved.readKey});assert.equal(allowed.status,200);protection(allowed);
  assert.equal((await allowed.json()).groupName,group.name);
});

test('workbook, API and ticket routes are GET-only and unrelated routes are not claimed',async t=>{
  const f=await fixture(t),saved=await seed(f.store),ticket=await f.store.createFileTicket(saved.readKey,saved.record.revision,'json');
  for(const path of ['/workbook','/api/workbook','/api/file?kind=json',`/files/${ticket.ticket}`])for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS']) {
    const denied=await f.route(path,{key:saved.readKey,method});assert.equal(denied.status,405);protection(denied);
  }
  assert.equal(await f.route('/unrelated'),null);assert.equal(await f.route('/api/workbooks'),null);
  assert.deepEqual((await f.store.load(saved.reference.key)).record,saved.record);
});

test('cross-origin API and file requests are rejected before rendering while same-origin and direct requests remain usable',async t=>{
  let renders=0;const f=await fixture(t,{bookRenderer:record=>{renders++;return bookStub(record);},pdfRenderer:record=>{renders++;return pdfStub(record);}});
  const saved=await seed(f.store),ticket=await f.store.createFileTicket(saved.readKey,saved.record.revision,'pdf');
  for(const origin of ['https://different.example','https://chatgpt.com','https://claude.ai','null'])for(const path of ['/api/workbook','/api/file?kind=pdf',`/files/${ticket.ticket}`]) {
    const denied=await f.route(path,{key:saved.readKey,headers:{Origin:origin}});assert.equal(denied.status,403);protection(denied);
  }
  assert.equal(renders,0);
  for(const headers of [{},{Origin:baseUrl}]) {
    const response=await f.route('/api/workbook',{key:saved.readKey,headers});assert.equal(response.status,200);await response.arrayBuffer();
  }
  assert.equal(renders,2);
});

test('each read key returns only its own current and immutable historical snapshots',async t=>{
  const rendered=[];const f=await fixture(t,{bookRenderer:record=>{rendered.push(structuredClone(record));return bookStub(record);}});
  const a=await seed(f.store,{name:'1A remote-team route fixture',through:6}),b=await seed(f.store,{name:'Other fictional group',through:1});
  const changed=await f.store.transact(a.reference,await operation('feedback'),record=>savePhase(record,1,{hypothesis:'Fictional feedback belonging only to Group 1A.'}));
  for(let revision=0;revision<=changed.record.revision;revision++) {
    const response=await f.route(`/api/workbook?revision=${revision}`,{key:a.readKey});assert.equal(response.status,200);protection(response);
    const data=await response.json(),snapshot=(await f.store.load(a.reference.key,revision)).record;
    assert.equal(data.revision,revision);assert.equal(data.currentRevision,changed.record.revision);
    assert.equal(data.groupName,a.record.group.name);assert.equal(data.approved,snapshot.phases.filter(phase=>phase.status==='confirmed').length);
    assert.equal(data.html,bookStub(snapshot));assert.deepEqual(rendered.at(-1),snapshot);
    assertNoSecret(JSON.stringify(data),a.reference.key,a.readKey,b.reference.key,b.readKey,b.record.group.name);
  }
  const second=await f.route(`/api/workbook?key=${a.readKey}`,{key:b.readKey});
  assert.equal(second.status,200);const secondData=await second.json();assert.equal(secondData.groupName,b.record.group.name);
  assert(!secondData.html.includes('Fictional feedback belonging only to Group 1A.'));
  const missing=await f.route(`/api/workbook?revision=${changed.record.revision}`,{key:b.readKey});assert.equal(missing.status,404);
  assert.deepEqual((await f.store.load(b.reference.key)).record,b.record);
});

test('PDF and JSON tickets return exact saved bytes, safe filenames and private-response headers',async t=>{
  const rendered=[];const f=await fixture(t,{pdfRenderer:record=>{rendered.push(structuredClone(record));return pdfStub(record);}});
  const saved=await seed(f.store,{name:'Fictional group with "quotes"',through:2});
  for(const kind of ['pdf','json']) {
    const prepared=await f.route(`/api/file?revision=${saved.record.revision}&kind=${kind}`,{key:saved.readKey});assert.equal(prepared.status,200);protection(prepared);
    assert.equal(prepared.headers.get('Content-Type'),'application/json');const data=await prepared.json();
    assert.equal(data.revision,saved.record.revision);assert.equal(data.expiresAt,'2026-09-11T12:15:00.000Z');
    ticketOf(data.url);assertNoSecret(JSON.stringify(data),saved.reference.key,saved.readKey,saved.record.group.name);
    const response=await f.route(data.url);assert.equal(response.status,200);protection(response);
    assert.equal(response.headers.get('Content-Type'),kind==='pdf'?'application/pdf':'application/json');
    assert.equal(response.headers.get('Content-Disposition'),`attachment; filename="our-ai-use-case-portfolio-r${saved.record.revision}.${kind}"`);
    assert.equal(response.headers.get('Content-Security-Policy'),"default-src 'none'; sandbox");
    const bytes=Buffer.from(await response.arrayBuffer());
    if(kind==='pdf') {assert.deepEqual(bytes,pdfStub(saved.record));assert.deepEqual(rendered.at(-1),saved.record);}
    else {assert.equal(bytes.toString(),JSON.stringify(saved.record,null,2));assert.deepEqual(JSON.parse(bytes),saved.record);}
  }
  assert.deepEqual((await f.store.load(saved.reference.key)).record,saved.record);
});

test('ticket downloads stay attached to their saved revision after later feedback',async t=>{
  const f=await fixture(t),saved=await seed(f.store,{through:2});
  const issued=[];for(const kind of ['pdf','json'])issued.push([kind,await (await f.route(`/api/file?kind=${kind}`,{key:saved.readKey})).json()]);
  const latest=await f.store.transact(saved.reference,await operation('later-feedback'),record=>savePhase(record,1,{baseline:'Still unknown; fictional feedback requests a baseline check.'}));
  for(const [kind,file] of issued) {
    const response=await f.route(file.url);assert.equal(response.status,200);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(kind==='pdf')assert.deepEqual(bytes,pdfStub(saved.record));else assert.deepEqual(JSON.parse(bytes),saved.record);
    assert.equal(file.revision,saved.record.revision);
  }
  const current=await (await f.route('/api/workbook',{key:saved.readKey})).json();assert.equal(current.revision,latest.record.revision);
});

test('file expiry revokes temporary access without expiring the workbook or its earlier snapshots',async t=>{
  const f=await fixture(t),saved=await seed(f.store);
  const file=await (await f.route('/api/file?kind=json',{key:saved.readKey})).json();
  f.advance(15*60*1000-1);assert.equal((await f.route(file.url)).status,200);
  f.advance(1);const expired=await f.route(file.url);assert.equal(expired.status,404);protection(expired);
  f.advance(100*24*60*60*1000);
  const current=await f.route('/api/workbook',{key:saved.readKey});assert.equal(current.status,200);
  assert.equal((await current.json()).revision,saved.record.revision);
  assert.equal((await f.route('/api/workbook?revision=0',{key:saved.readKey})).status,200);
  const fresh=await (await f.route('/api/file?kind=json',{key:saved.readKey})).json();assert.notEqual(fresh.url,file.url);
  assert.equal((await f.route(fresh.url)).status,200);
});

test('deletion invalidates every existing reading link and file ticket without affecting a second group',async t=>{
  const f=await fixture(t),a=await seed(f.store),b=await seed(f.store,{name:'Unaffected fictional group'});
  const links=[];for(const kind of ['pdf','json'])links.push(await (await f.route(`/api/file?kind=${kind}`,{key:a.readKey})).json());
  await f.store.remove(a.reference);
  for(const file of links) {const response=await f.route(file.url);assert.equal(response.status,404);protection(response);}
  for(const path of ['/api/workbook','/api/workbook?revision=0','/api/file?kind=json'])assert.equal((await f.route(path,{key:a.readKey})).status,404);
  const second=await f.route('/api/workbook',{key:b.readKey});assert.equal(second.status,200);assert.equal((await second.json()).groupName,b.record.group.name);
});

test('a failed PDF render leaves the ticket reusable and preserves the saved approval',async t=>{
  let fail=false,renders=0;const f=await fixture(t,{pdfRenderer:record=>{renders++;if(fail)throw new Error('Private renderer detail must not escape.');return pdfStub(record);}});
  const saved=await seed(f.store),issued=await (await f.route('/api/file?kind=pdf',{key:saved.readKey})).json();assert.equal(renders,1);
  const ticket=ticketOf(issued.url);fail=true;
  const failure=await f.route(issued.url);assert.equal(failure.status,503);protection(failure);
  assertNoSecret(await failure.text(),'Private renderer detail',saved.reference.key,saved.readKey,saved.record.group.problem);
  assert.deepEqual((await f.store.resolveFileTicket(ticket)).record,saved.record);
  assert.deepEqual((await f.store.load(saved.reference.key)).record,saved.record);
  fail=false;const retry=await f.route(issued.url);assert.equal(retry.status,200);assert.deepEqual(Buffer.from(await retry.arrayBuffer()),pdfStub(saved.record));
  assert.equal(renders,3);
});

test('draft PDF requests are refused while JSON remains available, and malformed renderer output is never served',async t=>{
  let body=Buffer.from('not a PDF');const f=await fixture(t,{pdfRenderer:()=>body});
  const draft=await seed(f.store,{through:0});
  const denied=await f.route('/api/file?kind=pdf',{key:draft.readKey});assert.equal(denied.status,409);protection(denied);
  const json=await f.route('/api/file?kind=json',{key:draft.readKey});assert.equal(json.status,200);
  const saved=await seed(f.store,{name:'Approved malformed-render fixture'});
  for(const invalid of [Buffer.from('not a PDF'),new Uint8Array([37,80,68,70,45]),Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(5_000_000)])]) {
    body=invalid;const prepared=await f.route('/api/file?kind=pdf',{key:saved.readKey});assert.equal(prepared.status,503);protection(prepared);
    const direct=await f.store.createFileTicket(saved.readKey,saved.record.revision,'pdf');
    const served=await f.route(`/files/${direct.ticket}`);assert.equal(served.status,503);protection(served);
  }
  assert.deepEqual((await f.store.load(saved.reference.key)).record,saved.record);
});

test('malformed revisions, missing snapshots and invalid file kinds never render or return workbook content',async t=>{
  let renders=0;const f=await fixture(t,{bookRenderer:record=>{renders++;return bookStub(record);},pdfRenderer:record=>{renders++;return pdfStub(record);}});
  const saved=await seed(f.store);
  for(const revision of ['', '-1','01','+1','1.5','1e2','NaN','Infinity','undefined','1000000000','9007199254740992']) {
    for(const path of [`/api/workbook?revision=${encodeURIComponent(revision)}`,`/api/file?kind=pdf&revision=${encodeURIComponent(revision)}`]) {
      const rejected=await f.route(path,{key:saved.readKey});assert(rejected.status>=400);protection(rejected);
      assertNoSecret(await rejected.text(),saved.reference.key,saved.readKey,saved.record.group.problem);
    }
  }
  for(const kind of ['', 'html','PDF','../../json'])assert((await f.route(`/api/file?kind=${encodeURIComponent(kind)}`,{key:saved.readKey})).status>=400);
  const missing=await f.route('/api/workbook?revision=999',{key:saved.readKey});assert.equal(missing.status,404);
  assert.equal(renders,0);
  for(const path of ['/files/','/files/not-a-ticket',`/files/${saved.readKey}`,`/files/wf1_${'A'.repeat(43)}`]) {
    const rejected=await f.route(path);assert.equal(rejected.status,404);protection(rejected);
  }
});
