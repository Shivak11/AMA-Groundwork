import test from 'node:test';
import assert from 'node:assert/strict';
import {accessConfigured, authorised, originAllowed, boundedJson, applyLimit, protectedResponse} from '../remote/access.mjs';

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
  await assert.rejects(boundedJson(make('x'.repeat(180001))),e=>e.status===413);
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
