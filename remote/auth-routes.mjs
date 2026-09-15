import {BROWSER_SESSION_SECONDS} from './auth-crypto.mjs';
import {AuthError} from './d1-auth-store.mjs';
import {renderAuthPage} from './auth-page.mjs';
import {protectedResponse} from './access.mjs';

const REQUEST_COOKIE='__Host-ama_auth_request';
const SESSION_COOKIE='__Host-ama_session';
const SUPPORTED_SCOPE='workbooks';
const MAX_FORM_BYTES=16_000;

const jsonResponse=(body,{status=200,headers={}}={})=>protectedResponse(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*',...headers}});
const htmlResponse=(body,{status=200,headers={}}={})=>protectedResponse(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",...headers}});
const safeError=error=>error instanceof AuthError?error:new AuthError('server_error','Account sign-in is temporarily unavailable.',503);
const authError=(error,status=400)=>{const safe=safeError(error);return jsonResponse({error:safe.code,error_description:safe.message},{status:safe.status??status});};
const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const clearCookie=name=>cookie(name,'',0);
const cookieValue=(request,name)=>{
  const values=(request.headers.get('cookie')??'').split(';').map(item=>item.trim());
  const found=values.find(item=>item.startsWith(`${name}=`));
  return found?found.slice(name.length+1):'';
};
const exactResource=baseUrl=>`${baseUrl}/mcp`;

export function canonicalBaseUrl(value) {
  let url;
  try{url=new URL(value);}catch{throw new AuthError('server_error','The connector address is not configured.',503);}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&local)))throw new AuthError('server_error','The connector address is not configured.',503);
  return url.origin;
}

function validRedirectUri(value) {
  try{
    const url=new URL(value);
    if(url.username||url.password||url.hash)return false;
    if(url.protocol==='https:')return true;
    return url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  }catch{return false;}
}

function validateClientRegistration(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new AuthError('invalid_client_metadata','Client details are missing.');
  const clientName=typeof value.client_name==='string'?value.client_name.trim():'';
  const redirectUris=value.redirect_uris;
  if(!clientName||clientName.length>100)throw new AuthError('invalid_client_metadata','The client name is invalid.');
  if(!Array.isArray(redirectUris)||redirectUris.length<1||redirectUris.length>10||redirectUris.some(uri=>typeof uri!=='string'||uri.length>500||!validRedirectUri(uri)))throw new AuthError('invalid_redirect_uri','A valid HTTPS or local redirect address is required.');
  if(new Set(redirectUris).size!==redirectUris.length)throw new AuthError('invalid_redirect_uri','Redirect addresses must be unique.');
  if(value.token_endpoint_auth_method!==undefined&&value.token_endpoint_auth_method!=='none')throw new AuthError('invalid_client_metadata','This server supports public clients with PKCE.');
  if(value.response_types!==undefined&&(!Array.isArray(value.response_types)||value.response_types.length!==1||value.response_types[0]!=='code'))throw new AuthError('invalid_client_metadata','This server supports the authorisation code flow.');
  if(value.grant_types!==undefined&&(!Array.isArray(value.grant_types)||value.grant_types.length<1||value.grant_types.some(grant=>!['authorization_code','refresh_token'].includes(grant))||!value.grant_types.includes('authorization_code')))throw new AuthError('invalid_client_metadata','This server supports authorization_code and refresh_token grants.');
  return {clientName,redirectUris};
}

async function readJson(request) {
  const type=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(type!=='application/json')throw new AuthError('invalid_request','Use application/json.',415);
  const text=await request.text();
  if(new TextEncoder().encode(text).length>MAX_FORM_BYTES)throw new AuthError('invalid_request','The request is too large.',413);
  try{return JSON.parse(text);}catch{throw new AuthError('invalid_request','The JSON request is invalid.');}
}

async function readForm(request) {
  const type=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(type!=='application/x-www-form-urlencoded')throw new AuthError('invalid_request','Use a form-encoded request.',415);
  const text=await request.text();
  if(new TextEncoder().encode(text).length>MAX_FORM_BYTES)throw new AuthError('invalid_request','The request is too large.',413);
  return new URLSearchParams(text);
}

function validateAuthorize(url,client,baseUrl) {
  const responseType=url.searchParams.get('response_type');
  const redirectUri=url.searchParams.get('redirect_uri');
  const codeChallenge=url.searchParams.get('code_challenge');
  const method=url.searchParams.get('code_challenge_method');
  const resource=url.searchParams.get('resource');
  const scope=url.searchParams.get('scope')||SUPPORTED_SCOPE;
  const state=url.searchParams.get('state');
  if(responseType!=='code')throw new AuthError('unsupported_response_type','Use the authorisation code flow.');
  if(!client.redirectUris.includes(redirectUri))throw new AuthError('invalid_request','The redirect address is not registered.');
  if(method!=='S256'||!codeChallenge||!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge))throw new AuthError('invalid_request','PKCE with S256 is required.');
  if(resource!==exactResource(baseUrl))throw new AuthError('invalid_target','The requested connector address is invalid.');
  if(scope!==SUPPORTED_SCOPE)throw new AuthError('invalid_scope','This connector uses the workbooks permission.');
  if(state&&state.length>500)throw new AuthError('invalid_request','The state value is too long.');
  return {clientId:client.clientId,redirectUri,state,codeChallenge,resource,scope};
}

function redirectWith(url,values) {
  const target=new URL(url);
  for(const [key,value] of Object.entries(values))if(value!==null&&value!==undefined)target.searchParams.set(key,value);
  return protectedResponse(null,{status:302,headers:{Location:target.href}});
}

export function protectedResourceMetadata(baseUrl) {
  return {resource:exactResource(baseUrl),authorization_servers:[baseUrl],bearer_methods_supported:['header'],scopes_supported:[SUPPORTED_SCOPE],resource_name:'AMA-Groundwork'};
}

export function authorizationServerMetadata(baseUrl) {
  return {
    issuer:baseUrl,
    authorization_endpoint:`${baseUrl}/authorize`,
    token_endpoint:`${baseUrl}/oauth/token`,
    registration_endpoint:`${baseUrl}/oauth/register`,
    revocation_endpoint:`${baseUrl}/oauth/revoke`,
    response_types_supported:['code'],
    grant_types_supported:['authorization_code','refresh_token'],
    token_endpoint_auth_methods_supported:['none'],
    code_challenge_methods_supported:['S256'],
    scopes_supported:[SUPPORTED_SCOPE],
  };
}

export async function authRoute(request,{store,baseUrl}) {
  const url=new URL(request.url);
  if(url.pathname==='/.well-known/oauth-protected-resource'||url.pathname==='/.well-known/oauth-protected-resource/mcp')return jsonResponse(protectedResourceMetadata(baseUrl));
  if(url.pathname==='/.well-known/oauth-authorization-server')return jsonResponse(authorizationServerMetadata(baseUrl));
  if(url.pathname==='/oauth/register') {
    if(request.method==='OPTIONS')return protectedResponse(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
    if(request.method!=='POST')return authError(new AuthError('invalid_request','Use POST.'),405);
    try{
      const input=validateClientRegistration(await readJson(request));
      const client=await store.registerClient(input);
      return jsonResponse({client_id:client.clientId,client_name:client.clientName,redirect_uris:client.redirectUris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']},{status:201});
    }catch(error){return authError(error);}
  }
  if(url.pathname==='/authorize'&&request.method==='GET') {
    try{
      let requestToken=cookieValue(request,REQUEST_COOKIE),flow;
      if(url.searchParams.has('client_id')) {
        const client=await store.client(url.searchParams.get('client_id'));
        if(!client)throw new AuthError('invalid_request','The requesting client is not registered.');
        flow=validateAuthorize(url,client,baseUrl);
        requestToken=await store.createAuthorizationRequest(flow);
      }else flow=await store.authorizationRequest(requestToken);
      const client=await store.client(flow.client_id??flow.clientId);
      if(!client)throw new AuthError('invalid_request','The requesting client is unavailable.');
      const user=await store.browserUser(cookieValue(request,SESSION_COOKIE));
      const view=url.searchParams.get('view')==='create'?'create':'signin';
      return htmlResponse(renderAuthPage({clientName:client.clientName,view,user}),{headers:{'Set-Cookie':cookie(REQUEST_COOKIE,requestToken,10*60)}});
    }catch(error){const safe=safeError(error);return htmlResponse(renderAuthPage({error:safe.message}),{status:safe.status??400});}
  }
  if(url.pathname==='/authorize'&&request.method==='POST') {
    if(request.headers.get('origin')!==baseUrl)return htmlResponse(renderAuthPage({error:'Return to the connector and try signing in again.'}),{status:403});
    const requestToken=cookieValue(request,REQUEST_COOKIE);
    let flow,client,action='signin';
    try{
      flow=await store.authorizationRequest(requestToken);
      client=await store.client(flow.client_id);
      if(!client)throw new AuthError('invalid_request','The requesting client is unavailable.');
      const form=await readForm(request);action=form.get('action');
      if(action==='cancel')return redirectWith(flow.redirect_uri,{error:'access_denied',error_description:'The request was cancelled.',state:flow.state});
      if(action==='signout') {
        await store.deleteBrowserSession(cookieValue(request,SESSION_COOKIE));
        return htmlResponse(renderAuthPage({clientName:client.clientName}),{headers:{'Set-Cookie':clearCookie(SESSION_COOKIE)}});
      }
      let user=await store.browserUser(cookieValue(request,SESSION_COOKIE)),sessionCookie='';
      if(action==='register')user=await store.registerUser({email:form.get('email'),password:form.get('password'),displayName:form.get('display_name')});
      else if(action==='signin')user=await store.authenticateUser({email:form.get('email'),password:form.get('password')});
      else if(action!=='continue')throw new AuthError('invalid_request','Choose sign in, create account, continue or cancel.');
      if(!user)throw new AuthError('invalid_request','Sign in to continue.');
      if(['register','signin'].includes(action)) {
        const browser=await store.createBrowserSession(user.userId);
        sessionCookie=cookie(SESSION_COOKIE,browser.token,BROWSER_SESSION_SECONDS);
      }
      const issued=await store.issueAuthorizationCode(requestToken,user.userId);
      const response=redirectWith(issued.redirectUri,{code:issued.code,state:issued.state});
      response.headers.append('Set-Cookie',clearCookie(REQUEST_COOKIE));
      if(sessionCookie)response.headers.append('Set-Cookie',sessionCookie);
      return response;
    }catch(error){
      const safe=safeError(error);
      const view=action==='register'?'create':'signin';
      return htmlResponse(renderAuthPage({clientName:client?.clientName,view,error:safe.message}),{status:safe.status===401?401:safe.status??400,headers:{'Set-Cookie':requestToken?cookie(REQUEST_COOKIE,requestToken,10*60):clearCookie(REQUEST_COOKIE)}});
    }
  }
  if(url.pathname==='/oauth/token') {
    if(request.method==='OPTIONS')return protectedResponse(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
    if(request.method!=='POST')return authError(new AuthError('invalid_request','Use POST.'),405);
    try{
      const form=await readForm(request),grantType=form.get('grant_type'),clientId=form.get('client_id'),resource=form.get('resource');
      const client=await store.client(clientId);
      if(!client)throw new AuthError('invalid_client','The client is not registered.',401);
      if(resource!==exactResource(baseUrl))throw new AuthError('invalid_target','The requested connector address is invalid.');
      const tokens=grantType==='authorization_code'
        ?await store.exchangeAuthorizationCode({code:form.get('code'),clientId,redirectUri:form.get('redirect_uri'),codeVerifier:form.get('code_verifier'),resource})
        :grantType==='refresh_token'
          ?await store.exchangeRefreshToken({refreshToken:form.get('refresh_token'),clientId,resource})
          :null;
      if(!tokens)throw new AuthError('unsupported_grant_type','Use authorization_code or refresh_token.');
      return jsonResponse(tokens);
    }catch(error){return authError(error);}
  }
  if(url.pathname==='/oauth/revoke') {
    if(request.method!=='POST')return authError(new AuthError('invalid_request','Use POST.'),405);
    try{const form=await readForm(request);await store.revokeToken(form.get('token'));return protectedResponse(null,{status:200,headers:{'Access-Control-Allow-Origin':'*'}});}
    catch(error){return authError(error);}
  }
  return null;
}

export function bearerToken(request) {
  const header=request.headers.get('authorization')??'';
  const match=/^Bearer ([^\s]+)$/.exec(header);
  return match?.[1]??'';
}

export function oauthChallenge(baseUrl) {
  return `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp", scope="${SUPPORTED_SCOPE}"`;
}
