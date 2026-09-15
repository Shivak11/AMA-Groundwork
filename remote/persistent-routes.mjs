import { protectedResponse } from './access.mjs';
import { READ_KEY, ACCOUNT_READ_KEY, FILE_TICKET } from '../src/session-store.mjs';
import { workspacePage, workspaceCsp } from './workspace.mjs';

const json=value=>protectedResponse(JSON.stringify(value),{headers:{'Content-Type':'application/json','X-Robots-Tag':'noindex, nofollow'}});
const revisionFrom=url=>{
  const value=url.searchParams.get('revision');
  if(value===null)return undefined;
  if(!/^(0|[1-9]\d{0,8})$/.test(value))throw new Error('Invalid revision.');
  return Number(value);
};
export async function persistentRoute(request,{store,bookRenderer,pdfRenderer,baseUrl}) {
  const url=new URL(request.url);
  if(!['/workbook','/api/workbook','/api/file','/api/download'].includes(url.pathname)&&!url.pathname.startsWith('/files/'))return null;
  if(request.method!=='GET')return protectedResponse('Method is not allowed.',{status:405});
  if(url.pathname==='/workbook')return protectedResponse(workspacePage,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':workspaceCsp,'X-Robots-Tag':'noindex, nofollow'}});
  // APIs require a read-only key header; neither cookies nor an MCP session ID
  // grant workbook access. Cross-origin browser requests are rejected.
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return protectedResponse('Origin is not allowed.',{status:403});
  try {
    if(url.pathname.startsWith('/files/')) {
      const ticket=url.pathname.slice('/files/'.length);
      if(!FILE_TICKET.test(ticket))return protectedResponse('File link is unavailable.',{status:404});
      const {record,kind,revision}=await store.resolveFileTicket(ticket);
      const body=kind==='json'?JSON.stringify(record,null,2):await pdfRenderer(record);
      if(kind==='pdf'&&(!Buffer.isBuffer(body)||body.subarray(0,5).toString()!=='%PDF-'||body.length>5_000_000))throw new Error('Invalid PDF.');
      const filename=kind==='pdf'?`ama-groundwork-r${revision}.pdf`:`ama-groundwork-revision-${revision}.json`;
      return protectedResponse(body,{headers:{'Content-Type':kind==='pdf'?'application/pdf':'application/json','Content-Disposition':`attachment; filename="${filename}"`,'X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    const key=(request.headers.get('authorization')??'').replace(/^Bearer /,'');
    if(!READ_KEY.test(key)&&!ACCOUNT_READ_KEY.test(key))return protectedResponse('Private reading access is required.',{status:404});
    const revision=revisionFrom(url),loaded=await store.loadShared(key,revision);
    if(url.pathname==='/api/workbook')return json({revision:loaded.record.revision,currentRevision:loaded.currentRevision,groupName:loaded.record.group.name,approved:loaded.record.phases.filter(p=>p.status==='confirmed').length,html:await bookRenderer(loaded.record)});
    const kind=url.searchParams.get('kind');
    if(!['pdf','json'].includes(kind))throw new Error('Invalid file kind.');
    let pdf;
    if(kind==='pdf') {
      if(!loaded.record.phases.some(p=>p.status!=='draft'))return protectedResponse('Approve the first step before exporting a PDF.',{status:409});
      // Check readiness before returning a file link. A later render can still
      // fail; its ticket remains reusable and approval is never changed.
      pdf=await pdfRenderer(loaded.record);
      if(!Buffer.isBuffer(pdf)||pdf.subarray(0,5).toString()!=='%PDF-'||pdf.length>5_000_000)throw new Error('Invalid PDF.');
    }
    if(url.pathname==='/api/download'){
      const filename=kind==='pdf'?`ama-groundwork-r${loaded.record.revision}.pdf`:`ama-groundwork-revision-${loaded.record.revision}.json`;
      return protectedResponse(kind==='json'?JSON.stringify(loaded.record,null,2):pdf,{headers:{'Content-Type':kind==='pdf'?'application/pdf':'application/json','Content-Disposition':`attachment; filename="${filename}"`,'Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    const file=await store.createFileTicket(key,loaded.record.revision,kind);
    return json({url:`${baseUrl}/files/${file.ticket}`,expiresAt:file.expiresAt,revision:loaded.record.revision});
  }catch(error) {
    const missing=['NOT_FOUND','PENDING'].includes(error.code);
    return protectedResponse(missing?'This private workbook or file link is unavailable.':'The request could not complete. Your saved workbook is unchanged.',{status:missing?404:503});
  }
}
