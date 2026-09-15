import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pbkdf2Sync} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createSqliteD1} from './support/d1-sqlite.mjs';
import {createD1AuthStore} from '../remote/d1-auth-store.mjs';
import {authRoute,authorizationServerMetadata,canonicalBaseUrl,oauthChallenge,protectedResourceMetadata} from '../remote/auth-routes.mjs';
import {renderAuthPage} from '../remote/auth-page.mjs';
import {createPasswordRecord,pkceChallenge,verifyPassword,PASSWORD_ITERATIONS} from '../remote/auth-crypto.mjs';
import {createD1SessionStore} from '../remote/d1-session-store.mjs';
import {createWorkshopServer} from '../src/server-core.mjs';
import {readKeyFor} from '../src/session-store.mjs';
import {group} from '../examples/persistent-remote-team.mjs';

const baseUrl='https://workshop.example';
const resource=`${baseUrl}/mcp`;
const secret='account-link-secret-for-tests-32-characters-minimum';
const pdfStub=async()=>Buffer.from('%PDF-authentication-test');
const assetLoader=async path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const form=values=>new URLSearchParams(values).toString();
const cookiePair=response=>response.headers.get('set-cookie')?.split(';')[0]??'';

function authStore(db,options={}) {
  return createD1AuthStore(db,{passwordIterations:1_000,...options});
}

test('password records use a random salt and reject a different password',async()=>{
  const first=await createPasswordRecord('correct horse battery',{iterations:1_000});
  const second=await createPasswordRecord('correct horse battery',{iterations:1_000});
  assert.notEqual(first.salt,second.salt);
  assert.notEqual(first.hash,second.hash);
  assert.equal(await verifyPassword('correct horse battery',first),true);
  assert.equal(await verifyPassword('incorrect password',first),false);
});

test('the portable password implementation matches native PBKDF2 at the full production work factor',async()=>{
  const password='Synthetic compatibility check',salt=new Uint8Array(16).fill(7);
  const record=await createPasswordRecord(password,{randomBytes:()=>salt});
  assert.equal(record.iterations,600_000);
  assert.equal(record.hash,pbkdf2Sync(password,salt,PASSWORD_ITERATIONS,32,'sha256').toString('base64url'));
  assert.equal(await verifyPassword(password,record),true);
});

test('the public connector address is HTTPS while local development may use loopback HTTP',()=>{
  assert.equal(canonicalBaseUrl('https://workshop.example/'),'https://workshop.example');
  assert.equal(canonicalBaseUrl('http://127.0.0.1:8787/'),'http://127.0.0.1:8787');
  for(const value of ['http://workshop.example/','https://workshop.example/path','https://user:password@workshop.example/'])assert.throws(()=>canonicalBaseUrl(value),error=>error.code==='server_error');
});

test('the account page uses plain participant language and escapes client details',()=>{
  const attack='<img src=x onerror=alert(1)>';
  const html=renderAuthPage({clientName:attack});
  assert(!html.includes(attack));
  assert.match(html,/Sign in to AMA-Groundwork/);
  assert.match(html,/Email address/);
  assert.match(html,/Create an account/);
  for(const term of ['OAuth','PKCE','Cloudflare','D1','access token','private key'])assert(!html.includes(term),term);
});

test('cancelling sign-in or registration does not require completed account fields',()=>{
  for(const view of ['signin','create']) {
    const html=renderAuthPage({view});
    assert.match(html,/<button\b[^>]*value="cancel"[^>]*\bformnovalidate[^>]*>Cancel<\/button>/);
    assert.doesNotMatch(html,/<button\b[^>]*class="primary"[^>]*\bformnovalidate/);
  }
});

test('OAuth metadata, registration, browser sign-in, PKCE exchange, refresh rotation and revocation form one complete flow',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());const store=authStore(db);
  assert.deepEqual(protectedResourceMetadata(baseUrl).authorization_servers,[baseUrl]);
  assert.deepEqual(authorizationServerMetadata(baseUrl).code_challenge_methods_supported,['S256']);
  const registration=await authRoute(new Request(`${baseUrl}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Claude',redirect_uris:['https://claude.ai/api/mcp/auth_callback'],token_endpoint_auth_method:'none'})}),{store,baseUrl});
  assert.equal(registration.status,201);const client=await registration.json();assert.match(client.client_id,/^oc1_/);
  const verifier='a'.repeat(64),challenge=await pkceChallenge(verifier),state='client-state-1';
  const authorize=new URL(`${baseUrl}/authorize`);
  for(const [key,value] of Object.entries({response_type:'code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],code_challenge:challenge,code_challenge_method:'S256',resource,scope:'workbooks',state}))authorize.searchParams.set(key,value);
  const page=await authRoute(new Request(authorize),{store,baseUrl});
  assert.equal(page.status,200);assert.match(await page.text(),/Sign in to AMA-Groundwork/);
  assert.equal(page.headers.get('referrer-policy'),'same-origin','Same-origin forms must keep a usable Origin header.');
  assert.match(page.headers.get('content-security-policy'),/form-action 'self' https:\/\/claude\.ai;/,'The registered OAuth callback must remain reachable after form submission.');
  const requestCookie=cookiePair(page);assert.match(requestCookie,/__Host-ama_auth_request=ar1_/);
  const completed=await authRoute(new Request(`${baseUrl}/authorize`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:baseUrl,cookie:requestCookie},body:form({action:'register',display_name:'Shiva',email:'shiva@example.com',password:'a secure password'})}),{store,baseUrl});
  assert.equal(completed.status,302);const callback=new URL(completed.headers.get('location'));
  assert.equal(completed.headers.get('referrer-policy'),'no-referrer','The redirect must not disclose the authorisation page URL.');
  assert.equal(callback.origin,'https://claude.ai');assert.equal(callback.searchParams.get('state'),state);assert.match(callback.searchParams.get('code'),/^ac1_/);
  const codeExchange=()=>authRoute(new Request(`${baseUrl}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],code:callback.searchParams.get('code'),code_verifier:verifier,resource})}),{store,baseUrl});
  const codeResults=await Promise.all([codeExchange(),codeExchange()]);assert.deepEqual(codeResults.map(result=>result.status).sort(),[200,400]);
  const token=codeResults.find(result=>result.status===200),replay=codeResults.find(result=>result.status===400);
  const issued=await token.json();assert.match(issued.access_token,/^at1_/);assert.match(issued.refresh_token,/^rt1_/);assert.equal((await replay.json()).error,'invalid_grant');
  const identity=await store.verifyAccessToken(issued.access_token,resource);assert.equal(identity.email,'shiva@example.com');
  assert.equal(await store.verifyAccessToken(issued.access_token,'https://other.example/mcp'),null);
  const refreshExchange=()=>authRoute(new Request(`${baseUrl}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({grant_type:'refresh_token',client_id:client.client_id,refresh_token:issued.refresh_token,resource})}),{store,baseUrl});
  const refreshResults=await Promise.all([refreshExchange(),refreshExchange()]);assert.deepEqual(refreshResults.map(result=>result.status).sort(),[200,400]);
  const refreshed=refreshResults.find(result=>result.status===200);const rotated=await refreshed.json();assert.notEqual(rotated.refresh_token,issued.refresh_token);
  assert.equal(await store.verifyAccessToken(rotated.access_token,resource),null,'Concurrent reuse revokes the related sign-in family immediately.');
  const refreshReplay=await authRoute(new Request(`${baseUrl}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({grant_type:'refresh_token',client_id:client.client_id,refresh_token:issued.refresh_token,resource})}),{store,baseUrl});
  assert.equal(refreshReplay.status,400);assert.equal((await refreshReplay.json()).error,'invalid_grant');
  assert.equal(await store.verifyAccessToken(rotated.access_token,resource),null,'A replayed refresh token revokes access tokens in the same sign-in family.');
  const revoke=await authRoute(new Request(`${baseUrl}/oauth/revoke`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({token:rotated.access_token})}),{store,baseUrl});
  assert.equal(revoke.status,200);assert.equal(await store.verifyAccessToken(rotated.access_token,resource),null);
});

test('dynamic client registration rejects unsupported flows and unsafe redirects',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());const store=authStore(db);
  const register=value=>authRoute(new Request(`${baseUrl}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)}),{store,baseUrl});
  for(const input of [
    {client_name:'Unsafe',redirect_uris:['javascript:alert(1)']},
    {client_name:'Implicit',redirect_uris:['https://client.example/callback'],response_types:['token']},
    {client_name:'Password',redirect_uris:['https://client.example/callback'],grant_types:['password']},
  ])assert.equal((await register(input)).status,400);
  assert.equal((await register({client_name:'Loopback',redirect_uris:['http://localhost:3210/callback'],response_types:['code'],grant_types:['authorization_code','refresh_token']})).status,201);
});

test('sign-in rejects cross-origin and missing-origin form submissions before account access',async()=>{
  let touched=false;
  const store={authorizationRequest(){touched=true;throw new Error('Must not be called');}};
  for(const origin of ['https://other.example','null',null]) {
    const headers={'content-type':'application/x-www-form-urlencoded',...(origin?{origin}:{})};
    const response=await authRoute(new Request(`${baseUrl}/authorize`,{method:'POST',headers,body:form({action:'continue'})}),{store,baseUrl});
    assert.equal(response.status,403);
  }
  assert.equal(touched,false);
});

test('expired authorisation requests and browser sessions cannot be reused',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());
  let now=new Date('2026-09-15T00:00:00Z');const store=authStore(db,{now:()=>now});
  const client=await store.registerClient({clientName:'Expiry test',redirectUris:['https://client.example/callback']});
  const user=await store.registerUser({displayName:'Expiry test',email:'expiry@example.com',password:'synthetic expiry password'});
  const browserSession=await store.createBrowserSession(user.userId);
  const request=await store.createAuthorizationRequest({clientId:client.clientId,redirectUri:client.redirectUris[0],state:'expiry-test',codeChallenge:await pkceChallenge('v'.repeat(64)),resource,scope:'workbooks'});
  now=new Date('2026-09-15T00:11:00Z');
  await assert.rejects(store.authorizationRequest(request),error=>error.code==='invalid_request');
  assert.equal((await store.browserUser(browserSession.token)).userId,user.userId);
  now=new Date('2026-10-16T00:00:00Z');
  assert.equal(await store.browserUser(browserSession.token),null);
});

test('account workbooks are recoverable by their owner and unavailable to another account',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());const accounts=authStore(db);
  const first=await accounts.registerUser({displayName:'First owner',email:'first@example.com',password:'first secure password'});
  const second=await accounts.registerUser({displayName:'Second owner',email:'second@example.com',password:'second secure password'});
  const firstStore=createD1SessionStore(db,{ownerUserId:first.userId,accountLinkSecret:secret});
  const secondStore=createD1SessionStore(db,{ownerUserId:second.userId,accountLinkSecret:secret});
  const prepared=await firstStore.prepare();assert.match(prepared.key,/^wa1_/);
  const activated=await firstStore.activate(prepared,group);assert.equal(activated.record.group.name,group.name);
  const listed=await firstStore.listOwner();assert.equal(listed.length,1);assert.deepEqual(listed[0].record,activated.reference);
  await assert.rejects(secondStore.load(activated.reference.key),error=>error.code==='NOT_FOUND');
  const readingKey=await firstStore.readKey(activated.reference.key);assert.match(readingKey,/^wr2_/);
  const shared=createD1SessionStore(db);assert.equal((await shared.loadShared(readingKey)).record.group.name,group.name);
});

test('an existing private workbook can be claimed once without breaking its old reading link',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());
  const legacy=createD1SessionStore(db),prepared=await legacy.prepare(),activated=await legacy.activate(prepared,group),oldRead=await readKeyFor(prepared.key);
  const accounts=authStore(db),owner=await accounts.registerUser({displayName:'Owner',email:'owner@example.com',password:'owner secure password'});
  const ownerStore=createD1SessionStore(db,{ownerUserId:owner.userId,accountLinkSecret:secret});
  const claimed=await ownerStore.load(activated.reference.key);assert.match(claimed.reference.key,/^wa1_/);
  assert.equal((await legacy.loadShared(oldRead)).record.group.name,group.name);
  assert.equal((await ownerStore.listOwner())[0].record.key,claimed.reference.key);
  const other=await accounts.registerUser({displayName:'Other',email:'other@example.com',password:'other secure password'});
  await assert.rejects(createD1SessionStore(db,{ownerUserId:other.userId,accountLinkSecret:secret}).load(activated.reference.key),error=>error.code==='NOT_FOUND');
});

test('the signed-in MCP server lists only account-owned workbooks with concise references',async t=>{
  const db=createSqliteD1();t.after(()=>db.close());const accounts=authStore(db);
  const owner=await accounts.registerUser({displayName:'Shiva',email:'shiva@example.com',password:'a secure password'});
  const store=createD1SessionStore(db,{ownerUserId:owner.userId,accountLinkSecret:secret});
  const server=await createWorkshopServer({sessionStore:store,baseUrl,pdfRenderer:pdfStub,assetLoader,accountContext:{...owner,clientId:'oc1_test',scopes:['workbooks']}});
  const client=new Client({name:'account-test',version:'1'},{capabilities:{}}),[serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport),client.connect(clientTransport)]);t.after(async()=>{await client.close();await server.close();});
  const tools=await client.listTools();assert.equal(tools.tools.length,16);assert(tools.tools.some(tool=>tool.name==='list_my_workbooks'));
  let result=await client.callTool({name:'start_workshop',arguments:{}});const reference=result.structuredContent.record;
  await client.callTool({name:'start_workshop',arguments:{record:reference,group,mode:'text'}});
  result=await client.callTool({name:'list_my_workbooks',arguments:{}});assert.notEqual(result.isError,true);assert.equal(result.structuredContent.workbooks.length,1);assert.match(result.structuredContent.workbooks[0].record.key,/^wa1_/);
});

test('the MCP authentication challenge points clients to protected-resource discovery',()=>{
  assert.equal(oauthChallenge(baseUrl),`Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp", scope="workbooks"`);
});
