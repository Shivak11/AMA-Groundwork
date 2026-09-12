import test from 'node:test';
import assert from 'node:assert/strict';
import {accessConfigured, authorised, originAllowed, boundedJson, applyLimit, protectedResponse} from '../remote/access.mjs';
import {createRecord, savePhase, confirmPhase, validateRecord} from '../src/workshop.mjs';
import {applyWorkshopAction} from '../src/actions.mjs';
import {group, answers} from '../examples/hiring.mjs';

test('remote access fails closed until a policy is configured', async () => {
  const request = new Request('https://example.com/mcp');
  for (const env of [{}, {ACCESS_MODE:'unconfigured'}, {ACCESS_MODE:'private'}, {ACCESS_MODE:'private',WORKSHOP_ACCESS_TOKEN:'short'}]) {
    assert.equal(accessConfigured(env), false);
    assert.equal(await authorised(request,env), false);
  }
  assert.equal(await authorised(request,{ACCESS_MODE:'public'}), true);
});

test('private access validates credentials independently of the UI capability marker', async () => {
  const env = {ACCESS_MODE:'private',WORKSHOP_ACCESS_TOKEN:'a'.repeat(40)};
  for (const header of ['', 'Bearer wrong', 'Bearer ' + 'a'.repeat(39)]) {
    assert.equal(await authorised(new Request('https://example.com/mcp',{headers:{authorization:header,'mcp-session-id':'workshop-ui1-00000000-0000-0000-0000-000000000000'}}),env), false);
  }
  assert.equal(await authorised(new Request('https://example.com/mcp',{headers:{authorization:'Bearer '+env.WORKSHOP_ACCESS_TOKEN}}),env), true);
});

test('origin restriction accepts known chat hosts and rejects unrelated sites', () => {
  for (const origin of ['https://chatgpt.com','https://claude.ai','https://example.com']) assert(originAllowed(new Request('https://example.com/mcp',{headers:{origin}})));
  for (const origin of ['https://example.com.evil.test','null','https://arbitrary.test']) assert.equal(originAllowed(new Request('https://example.com/mcp',{headers:{origin}})),false);
});

test('JSON input is bounded even without Content-Length', async () => {
  const make = body => new Request('https://example.com/mcp',{method:'POST',headers:{'content-type':'application/json'},body});
  const body = JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'});
  assert.equal((await boundedJson(make(body))).message.method,'tools/list');
  await assert.rejects(boundedJson(make('x'.repeat(350001))),e=>e.status===413);
  await assert.rejects(boundedJson(make('[{}]')),e=>e.status===400);
  await assert.rejects(boundedJson(make('{invalid}')),e=>e.status===400);
  await assert.rejects(boundedJson(new Request('https://example.com/mcp',{method:'POST',body:'{}'})),e=>e.status===415);
});

test('limits fail closed and rejection offers a retry without losing the record', async () => {
  await assert.rejects(applyLimit(undefined,'key'),e=>e.status===503);
  await assert.rejects(applyLimit({limit:async()=>({success:false})},'key'),e=>e.status===429);
  await applyLimit({limit:async({key})=>({success:key==='expected'})},'expected');
});

test('all protected responses avoid caches and content sniffing', () => {
  const response = protectedResponse('test');
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});

test('a valid multilingual record with undo and a replacement patch fits the remote envelope', async () => {
  const data=structuredClone(answers);
  data[1].blockers=Array.from({length:5},()=>Object.fromEntries(['information','holder','barrier','unlock'].map(key=>[key,'क'.repeat(800)])));
  data[3].candidates=Array.from({length:5},(_,index)=>({...data[3].candidates[0],id:`c${index+1}`,title:`Candidate ${index+1}`,...Object.fromEntries(['aiWork','value','humanCheck','nonAiAlternative','assumption'].map(key=>[key,'क'.repeat(450)]))}));
  let record=createRecord(group);
  for(let phase=1;phase<=3;phase++) record=confirmPhase(savePhase(record,phase,data[phase-1]),phase,'Our group approves this saved summary.');
  record=savePhase(record,4,data[3]);
  let value=structuredClone(record.phases[3].answers.candidates);value[0].title='First correction';
  record=applyWorkshopAction(record,{expectedRevision:record.revision,phaseId:4,kind:'set_answer',field:'candidates',value});
  validateRecord(record);
  value=structuredClone(record.phases[3].answers.candidates);value[0].title='Second correction';
  const action={expectedRevision:record.revision,phaseId:4,kind:'set_answer',field:'candidates',value};
  assert(applyWorkshopAction(record,action).revision>record.revision);
  const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'workshop_action',arguments:{record,action}}});
  assert(Buffer.byteLength(body)>180000, 'The fixture must exceed the former request limit');
  const parsed=await boundedJson(new Request('https://example.com/mcp',{method:'POST',headers:{'content-type':'application/json'},body}));
  assert.deepEqual(parsed.message.params.arguments.action,action);
});
