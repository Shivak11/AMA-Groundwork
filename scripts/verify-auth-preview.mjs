import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash, randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {pkceChallenge} from '../remote/auth-crypto.mjs';
import {group, answers, approval} from '../examples/persistent-remote-team.mjs';

// This writes only synthetic accounts and workbooks in the named preview.
const baseUrl='https://ama-groundwork-auth-preview.shiva-research11.workers.dev';
const resource=`${baseUrl}/mcp`, redirectUri='http://localhost:3210/callback';
const out=new URL('../output/auth-preview/',import.meta.url);
await mkdir(out,{recursive:true});
const checks=[], clients=[];
const evidence={sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),endpoint:baseUrl,startedAt:new Date().toISOString(),checks,boundary:'Live Cloudflare OAuth, D1, MCP SDK and downloaded PDF checks. Native client checks are recorded separately. All data created by this script is fictional.'};
const form=values=>new URLSearchParams(values).toString();
const post=(path,values,extra={})=>fetch(`${baseUrl}${path}`,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',origin:baseUrl,...extra},body:form(values)});
const cookie=(response,name)=>{
  const match=new RegExp(`(?:^|, )${name}=([^;]+)`).exec(response.headers.get('set-cookie')??'');
  assert(match,`The ${name} cookie was not set.`);return `${name}=${match[1]}`;
};
const recordCheck=name=>{checks.push(name);console.log(`PASS: ${name}`);};
const freshAccount=label=>({display_name:`Preview ${label}`,email:`preview-${Date.now()}-${randomBytes(6).toString('hex')}@example.com`,password:randomBytes(24).toString('base64url')});
async function authorize(registration,account,action='register') {
  const verifier=randomBytes(48).toString('base64url'), state=randomBytes(16).toString('hex');
  const url=new URL(`${baseUrl}/authorize`);
  for(const [key,value] of Object.entries({client_id:registration.client_id,response_type:'code',redirect_uri:redirectUri,code_challenge:await pkceChallenge(verifier),code_challenge_method:'S256',resource,scope:'workbooks',state}))url.searchParams.set(key,value);
  const page=await fetch(url,{redirect:'manual'});assert.equal(page.status,200);
  assert.match(await page.text(),/Sign in to AMA-Groundwork/);
  const requestCookie=cookie(page,'__Host-ama_auth_request');
  if(action==='signin') {
    const wrong=await post('/authorize',{...account,action,password:'incorrect test password'},{cookie:requestCookie});
    assert.equal(wrong.status,401);recordCheck('An incorrect password is rejected');
  }
  const result=await post('/authorize',{...account,action},{cookie:requestCookie});
  assert.equal(result.status,302,'Account creation or sign-in must redirect to the registered client.');
  assert.match(result.headers.get('set-cookie')??'',/Secure; HttpOnly; SameSite=Lax/);
  const callback=new URL(result.headers.get('location'));assert.equal(callback.origin,new URL(redirectUri).origin);assert.equal(callback.searchParams.get('state'),state);
  const token=await post('/oauth/token',{grant_type:'authorization_code',client_id:registration.client_id,redirect_uri:redirectUri,code:callback.searchParams.get('code'),code_verifier:verifier,resource});
  assert.equal(token.status,200);return token.json();
}
async function connect(tokens,visual=true) {
  const client=new Client({name:'ama-groundwork-preview-check',version:'0.10.0'},{capabilities:visual?{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}:{}});
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:`Bearer ${tokens.access_token}`}}}));
  clients.push(client);assert.equal(client.getServerVersion().version,'0.10.0');return client;
}
async function call(client,name,args={}) {
  const result=await client.callTool({name,arguments:args},undefined,{timeout:60000});
  assert(!result.isError,`${name} failed; participant content is intentionally excluded from this error.`);return result;
}
let failure;
try {
  const health=await (await fetch(`${baseUrl}/healthz`)).json();assert.equal(health.configured,true);assert.equal(health.authentication,'oauth-account');
  const unauth=await fetch(resource);assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate')??'',/oauth-protected-resource/);recordCheck('Anonymous MCP access is rejected with OAuth discovery');
  const metadata=await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`)).json();assert.equal(metadata.resource,resource);
  const registrationResponse=await fetch(`${baseUrl}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'AMA-Groundwork preview verification',redirect_uris:[redirectUri],token_endpoint_auth_method:'none',response_types:['code'],grant_types:['authorization_code','refresh_token']})});
  assert.equal(registrationResponse.status,201);const registration=await registrationResponse.json();
  const owner=freshAccount('owner'), stranger=freshAccount('second account');
  const ownerTokens=await authorize(registration,owner), otherTokens=await authorize(registration,stranger);recordCheck('Two separate accounts complete registration and PKCE on Cloudflare');
  const first=await connect(ownerTokens),second=await connect(otherTokens);
  const tools=await first.listTools();assert.equal(tools.tools.length,16);assert(tools.tools.some(tool=>tool.name==='list_my_workbooks'));
  const widget=await first.readResource({uri:'ui://workshop/checkpoint.html'}), expectedWidget=await readFile(new URL('../dist/widget.html',import.meta.url),'utf8');assert.equal(widget.contents[0].text,expectedWidget);recordCheck('The live client receives all 16 tools and the exact built MCP App');
  let result=await call(first,'start_workshop');
  const {date,...undated}=group;
  result=await call(first,'start_workshop',{record:result.structuredContent.record,group:{...undated,name:'Preview 1A — Remote team updates'},mode:'text'});
  assert.match(result.structuredContent.record.key,/^wa1_/);assert.match(result._meta.workbook.group.date,/^\d{4}-\d{2}-\d{2}$/);
  const otherList=await call(second,'list_my_workbooks');assert.equal(otherList.structuredContent.workbooks.length,0);
  const crossRead=await second.callTool({name:'resume_workshop',arguments:{record:result.structuredContent.record}});assert.equal(crossRead.isError,true);
  const crossWrite=await second.callTool({name:'save_workshop_phase',arguments:{record:result.structuredContent.record,phase:1,answers:{outcome:'A forbidden change'}}});assert.equal(crossWrite.isError,true);recordCheck('A second account cannot list, reopen or change the owner’s workbook');
  for(let phase=1;phase<=6;phase++) {
    result=await call(first,'save_workshop_phase',{record:result.structuredContent.record,phase,answers:phase===6?{recommendation:answers[5].recommendation}:answers[phase-1]});
    result=await call(first,'confirm_workshop_phase',{record:result.structuredContent.record,phase,approved:true,confirmation:approval,requestId:`preview-approved-${phase}`});
    assert.equal(result._meta.workbook.phases[phase-1].status,'confirmed');recordCheck(`Step ${phase} is saved and approved in D1`);
  }
  const completed=result._meta.workbook,originalRef=result.structuredContent.record;
  await first.close();
  const returningTokens=await authorize(registration,owner,'signin'), returning=await connect(returningTokens,false);
  const list=await call(returning,'list_my_workbooks');assert.equal(list.structuredContent.workbooks.length,1);
  result=await call(returning,'resume_workshop',{record:{key:originalRef.key,revision:0}});assert.deepEqual(result._meta.workbook,completed);recordCheck('A fresh sign-in and client recover all six approved steps');
  result=await call(returning,'export_workbook',{record:result.structuredContent.record});
  if(result.structuredContent.export.status!=='ready') {
    console.log('Waiting 21 seconds for the shared PDF browser slot.');
    await new Promise(resolve=>setTimeout(resolve,21000));
    result=await call(returning,'export_workbook',{record:result.structuredContent.record});
  }
  assert.equal(result.structuredContent.export.status,'ready');
  const pdfUrl=new URL(result.structuredContent.export.pdfUrl);assert.equal(pdfUrl.origin,baseUrl);
  const pdf=await fetch(pdfUrl);assert.equal(pdf.status,200);const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>10000);
  await writeFile(new URL('completed-workbook.pdf',out),bytes);
  evidence.pdf={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};recordCheck('The completed workbook downloads as a real PDF');
  const readingUrl=new URL(result.structuredContent.workspace.url),readKey=readingUrl.hash.slice(1);
  const read=await fetch(`${baseUrl}/api/workbook`,{headers:{Authorization:`Bearer ${readKey}`}});assert.equal(read.status,200);assert.equal((await read.json()).revision,originalRef.revision);
  const writeWithReadKey=await returning.callTool({name:'save_workshop_phase',arguments:{record:{key:readKey,revision:originalRef.revision},phase:1,answers:{outcome:'A forbidden change'}}});assert.equal(writeWithReadKey.isError,true);recordCheck('The reading link works and cannot be used to edit');
  const refreshBody={grant_type:'refresh_token',client_id:registration.client_id,refresh_token:otherTokens.refresh_token,resource};
  const refreshed=await post('/oauth/token',refreshBody);assert.equal(refreshed.status,200);const rotated=await refreshed.json();
  assert.equal((await post('/oauth/token',refreshBody)).status,400);
  assert.equal((await fetch(resource,{headers:{Authorization:`Bearer ${rotated.access_token}`}})).status,401);recordCheck('Reusing a refresh token revokes its sign-in family');
  assert.equal((await post('/oauth/revoke',{token:returningTokens.access_token})).status,200);
  assert.equal((await fetch(resource,{headers:{Authorization:`Bearer ${returningTokens.access_token}`}})).status,401);recordCheck('Revoked access is rejected immediately');
  // Retain this synthetic workbook for preview review; no real account is touched.
  evidence.syntheticWorkbookRetained=true;
}catch(error){failure=error;}
finally {
  await Promise.allSettled(clients.map(client=>client.close()));
  evidence.result=failure?'failed':'passed';evidence.finishedAt=new Date().toISOString();
  if(failure)evidence.failure=String(failure.message);
  await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));
}
if(failure)throw failure;
console.log(JSON.stringify({result:evidence.result,checks:checks.length,evidence:new URL('evidence.json',out).pathname}));
