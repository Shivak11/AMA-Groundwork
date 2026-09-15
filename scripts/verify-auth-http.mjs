import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {pkceChallenge} from '../remote/auth-crypto.mjs';

const baseUrl=new URL(process.argv[2]??'http://127.0.0.1:8790').origin;
const resource=`${baseUrl}/mcp`;
const form=values=>new URLSearchParams(values).toString();
const cookie=(response,name)=>{
  const match=new RegExp(`(?:^|, )${name}=([^;]+)`).exec(response.headers.get('set-cookie')??'');
  assert(match,`${name} was not set.`);
  return `${name}=${match[1]}`;
};

const healthResponse=await fetch(`${baseUrl}/healthz`);
assert.equal(healthResponse.status,200);
const health=await healthResponse.json();
assert.equal(health.enabled,true);
assert.equal(health.configured,true);

const protectedMetadata=await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`)).json();
assert.equal(protectedMetadata.resource,resource);
const serverMetadata=await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)).json();
assert.equal(serverMetadata.authorization_endpoint,`${baseUrl}/authorize`);

const redirectUri='http://localhost:3210/callback';
const registrationResponse=await fetch(`${baseUrl}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'AMA-Groundwork local verification',redirect_uris:[redirectUri],response_types:['code'],grant_types:['authorization_code','refresh_token'],token_endpoint_auth_method:'none'})});
assert.equal(registrationResponse.status,201);
const registration=await registrationResponse.json();

const verifier='local-verification-code-verifier-'.padEnd(64,'v');
const authorizeUrl=new URL(`${baseUrl}/authorize`);
for(const [name,value] of Object.entries({response_type:'code',client_id:registration.client_id,redirect_uri:redirectUri,code_challenge:await pkceChallenge(verifier),code_challenge_method:'S256',resource,scope:'workbooks',state:'local-verification-state'}))authorizeUrl.searchParams.set(name,value);
const authorizePage=await fetch(authorizeUrl,{redirect:'manual'});
assert.equal(authorizePage.status,200);
assert.match(await authorizePage.text(),/Sign in to AMA-Groundwork/);
const requestCookie=cookie(authorizePage,'__Host-ama_auth_request');

const unique=Date.now();
const approval=await fetch(`${baseUrl}/authorize`,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',cookie:requestCookie},body:form({action:'register',display_name:'Local verification',email:`local-${unique}@example.com`,password:'local verification password'})});
assert.equal(approval.status,302);
const callback=new URL(approval.headers.get('location'));
assert.equal(callback.origin,'http://localhost:3210');
assert.equal(callback.searchParams.get('state'),'local-verification-state');

const tokenResponse=await fetch(`${baseUrl}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({grant_type:'authorization_code',client_id:registration.client_id,redirect_uri:redirectUri,code:callback.searchParams.get('code'),code_verifier:verifier,resource})});
assert.equal(tokenResponse.status,200);
const tokens=await tokenResponse.json();
assert.match(tokens.access_token,/^at1_/);
assert.match(tokens.refresh_token,/^rt1_/);

const client=new Client({name:'ama-groundwork-auth-http-verification',version:'1.0.0'},{capabilities:{}});
const transport=new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:`Bearer ${tokens.access_token}`}}});
let workbook;
try{
  await client.connect(transport);
  const tools=await client.listTools();
  assert.equal(tools.tools.length,16);
  assert(tools.tools.some(tool=>tool.name==='list_my_workbooks'));
  const prepared=await client.callTool({name:'start_workshop',arguments:{}});
  const activated=await client.callTool({name:'start_workshop',arguments:{record:prepared.structuredContent.record,group:{name:'Local verification group',members:['Shiva'],problem:'Confirm that an account can create and reopen its own workbook.'},mode:'text'}});
  workbook=activated.structuredContent.record;
  assert.match(workbook.key,/^wa1_/);
  const list=await client.callTool({name:'list_my_workbooks',arguments:{}});
  assert.equal(list.structuredContent.workbooks.length,1);
  assert.deepEqual(list.structuredContent.workbooks[0].record,workbook);
  const resumed=await client.callTool({name:'resume_workshop',arguments:{record:workbook,mode:'text'}});
  assert.equal(resumed.structuredContent.group.name,'Local verification group');
}finally{await client.close();}

const revoke=await fetch(`${baseUrl}/oauth/revoke`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({token:tokens.access_token})});
assert.equal(revoke.status,200);
const denied=await fetch(resource,{method:'POST',headers:{authorization:`Bearer ${tokens.access_token}`,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
assert.equal(denied.status,401);
assert.match(denied.headers.get('www-authenticate')??'',/oauth-protected-resource\/mcp/);

const output=new URL('../output/auth-http/',import.meta.url);
await mkdir(output,{recursive:true});
const evidence={result:'pass',createdAt:new Date().toISOString(),endpoint:baseUrl,checks:['OAuth discovery','dynamic client registration','account creation','PKCE token exchange','authenticated MCP connection','account-owned workbook creation','account workbook listing','workbook resumption','token revocation','401 discovery challenge'],workbookPrefix:workbook.key.slice(0,4),boundary:'Disposable local Wrangler Worker and local D1 only. This does not prove Cloudflare deployment or native ChatGPT and Claude sign-in.'};
await writeFile(new URL('evidence.json',output),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
