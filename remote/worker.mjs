import { createMcpHandler } from '@modelcontextprotocol/server';
import { createWorkshopServer } from '../src/server-core.mjs';
import { renderWorkbookPdf } from './render-pdf.mjs';
import { assetLoader, workbookAssets } from './assets.mjs';
import { accountAuthConfigured, originAllowed, boundedJson, applyLimit, protectedResponse } from './access.mjs';
import { renderWorkbookHtml } from '../src/workbook-html.mjs';
import { createD1SessionStore } from './d1-session-store.mjs';
import { createD1AuthStore } from './d1-auth-store.mjs';
import { authRoute, bearerToken, canonicalBaseUrl, oauthChallenge } from './auth-routes.mjs';
import { persistentRoute } from './persistent-routes.mjs';
const uiCapabilities = {extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let baseUrl;
    try{baseUrl=canonicalBaseUrl(env.PUBLIC_BASE_URL??url.origin);}catch{return protectedResponse('The connector address is not configured.',{status:503});}
    if (url.pathname === '/healthz') return protectedResponse(JSON.stringify({service:'ama-groundwork',version:'0.10.0', enabled:env.WORKSHOP_ENABLED === 'true',configured:accountAuthConfigured(env),authentication:'oauth-account',storage:env.WORKSHOP_DB?'persistent-d1':'unconfigured',writesEnabled:env.WORKSHOP_WRITES_ENABLED!=='false',retention:'until-explicit-deletion'}), {headers:{'Content-Type':'application/json'}});
    if (env.WORKSHOP_ENABLED !== 'true') return protectedResponse('The workshop connector is not active.', {status:503});
    if (!accountAuthConfigured(env)) return protectedResponse('Account sign-in has not been configured.', {status:503});
    if (!env.WORKSHOP_DB) return protectedResponse('Saved workbook storage is unavailable. Please retry later.',{status:503});
    try {
      const caller = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const authStore=createD1AuthStore(env.WORKSHOP_DB);
      if(['/authorize','/oauth/register','/oauth/token','/oauth/revoke'].includes(url.pathname))await applyLimit(env.AUTH_LIMIT,caller);
      const oauth=await authRoute(request,{store:authStore,baseUrl});
      if(oauth)return oauth;
      if (!originAllowed(request)) return protectedResponse('Origin is not allowed.', {status:403});
      if (request.method === 'OPTIONS') return protectedResponse(null, {status:204, headers:{'Access-Control-Allow-Origin':request.headers.get('origin') ?? url.origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id'}});
      if (!['POST','GET','DELETE'].includes(request.method)) return protectedResponse('Method is not allowed.', {status:405});
      await applyLimit(env.REQUEST_LIMIT, caller);
      const sharedStore=createD1SessionStore(env.WORKSHOP_DB);
      const pdfRenderer=async record=>{
        await applyLimit(env.PDF_LIMIT,caller);
        await applyLimit(env.PDF_REGIONAL_LIMIT,'workshop');
        try{return await renderWorkbookPdf(record,{binding:env.BROWSER,...workbookAssets});}
        catch{throw new Error('The PDF service could not complete this export. Your saved workbook is retained.');}
      };
      if(url.pathname!=='/mcp') {
        const route=await persistentRoute(request,{store:sharedStore,bookRenderer:record=>renderWorkbookHtml(record,workbookAssets),pdfRenderer,baseUrl});
        return route??protectedResponse('AMA-Groundwork\nConnect a compatible MCP client to /mcp.\nPrepared by Dr. Shiva Kakkar.\n',{status:url.pathname==='/'?200:404});
      }
      const account=await authStore.verifyAccessToken(bearerToken(request),`${baseUrl}/mcp`);
      if(!account)return protectedResponse('Sign in to use AMA-Groundwork.',{status:401,headers:{'WWW-Authenticate':oauthChallenge(baseUrl)}});
      const sessionStore=createD1SessionStore(env.WORKSHOP_DB,{ownerUserId:account.userId,accountLinkSecret:env.ACCOUNT_LINK_SECRET});
      let message;
      if (request.method === 'POST') {
        const parsed = await boundedJson(request);
        message = parsed.message;
        request = new Request(request, {body:parsed.bytes});
        if(message.method==='tools/call') {
          const name=message.params?.name;
          if(name==='start_workshop')await applyLimit(env.CREATION_LIMIT,'workshop');
          if(['start_workshop','save_workshop_phase','workshop_action','confirm_workshop_phase','set_workshop_preference','import_workshop'].includes(name))await applyLimit(env.WRITE_LIMIT,'workshop');
        }
      }
      // This carries a client-declared rendering capability, never access or group ownership.
      const uiMarker = /^workshop-ui([01])-[a-f0-9-]{36}$/.exec(request.headers.get('mcp-session-id') ?? '');
      const handler = createMcpHandler(() => createWorkshopServer({
        assetLoader,
        sessionStore,baseUrl,writesEnabled:env.WORKSHOP_WRITES_ENABLED!=='false',accountContext:account,
        bookRenderer:record=>renderWorkbookHtml(record,workbookAssets),
        ...(uiMarker ? {capabilitiesOverride:uiMarker[1] === '1' ? uiCapabilities : {}} : {}),
        pdfRenderer,
      }), {legacy:'stateless', responseMode:'auto'});
      const response = await handler.fetch(request);
      const result = new Response(response.body, response);
      result.headers.set('Cache-Control', 'no-store');
      result.headers.set('X-Content-Type-Options', 'nosniff');
      result.headers.set('Referrer-Policy','no-referrer');
      result.headers.set('X-Robots-Tag','noindex, nofollow');
      if (message?.method === 'initialize' && response.ok) {
        const ui = message.params?.capabilities?.extensions?.['io.modelcontextprotocol/ui']?.mimeTypes?.includes('text/html;profile=mcp-app');
        result.headers.set('Mcp-Session-Id', `workshop-ui${ui ? 1 : 0}-${crypto.randomUUID()}`);
      }
      result.headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
      if (request.headers.has('origin')) result.headers.set('Access-Control-Allow-Origin', request.headers.get('origin'));
      return result;
    } catch (error) {
      return protectedResponse(error.status ? error.message : 'The request did not complete. Keep your latest checkpoint and retry.', {status:error.status ?? 500, headers:error.status === 429 ? {'Retry-After':'60'} : {}});
    }
  },
};
