import { createMcpHandler } from '@modelcontextprotocol/server';
import { createWorkshopServer } from '../src/server-core.mjs';
import { renderWorkbookPdf } from './render-pdf.mjs';
import { assetLoader, workbookAssets } from './assets.mjs';
import { accessConfigured, authorised, originAllowed, boundedJson, applyLimit, protectedResponse } from './access.mjs';
import { renderWorkbookHtml } from '../src/workbook-html.mjs';
import { createD1SessionStore } from './d1-session-store.mjs';
import { persistentRoute } from './persistent-routes.mjs';
const uiCapabilities = {extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return protectedResponse(JSON.stringify({service:'ai-use-case-workshop',version:'0.6.0', enabled:env.WORKSHOP_ENABLED === 'true', configured:accessConfigured(env), storage:env.WORKSHOP_DB?'persistent-d1':'unconfigured',writesEnabled:env.WORKSHOP_WRITES_ENABLED!=='false',retention:'until-explicit-deletion'}), {headers:{'Content-Type':'application/json'}});
    if (env.WORKSHOP_ENABLED !== 'true') return protectedResponse('The workshop connector is not active.', {status:503});
    if (!originAllowed(request)) return protectedResponse('Origin is not allowed.', {status:403});
    if (request.method === 'OPTIONS') return protectedResponse(null, {status:204, headers:{'Access-Control-Allow-Origin':request.headers.get('origin') ?? url.origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id'}});
    if (!accessConfigured(env)) return protectedResponse('The workshop connector has not been configured.', {status:503});
    if (!env.WORKSHOP_DB) return protectedResponse('Saved workbook storage is unavailable. Please retry later.',{status:503});
    if (url.pathname === '/mcp' && !await authorised(request, env)) return protectedResponse('Workshop access is required.', {status:401, headers:{'WWW-Authenticate':'Bearer realm="ai-use-case-workshop"'}});
    if (!['POST','GET','DELETE'].includes(request.method)) return protectedResponse('Method is not allowed.', {status:405});
    try {
      const caller = request.headers.get('cf-connecting-ip') ?? 'unknown';
      await applyLimit(env.REQUEST_LIMIT, caller);
      const sessionStore=createD1SessionStore(env.WORKSHOP_DB);
      const baseUrl='https://ai-use-case-workshop.shiva-research11.workers.dev';
      const pdfRenderer=async record=>{
        await applyLimit(env.PDF_LIMIT,caller);
        await applyLimit(env.PDF_REGIONAL_LIMIT,'workshop');
        try{return await renderWorkbookPdf(record,{binding:env.BROWSER,...workbookAssets});}
        catch{throw new Error('The PDF service could not complete this export. Your saved workbook is retained.');}
      };
      if(url.pathname!=='/mcp') {
        const route=await persistentRoute(request,{store:sessionStore,bookRenderer:record=>renderWorkbookHtml(record,workbookAssets),pdfRenderer,baseUrl});
        return route??protectedResponse('AI Use-Case Workshop\nConnect a compatible MCP client to /mcp.\nPrepared by Dr. Shiva Kakkar.\n',{status:url.pathname==='/'?200:404});
      }
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
        sessionStore,baseUrl,writesEnabled:env.WORKSHOP_WRITES_ENABLED!=='false',
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
