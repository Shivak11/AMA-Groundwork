import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {group,answers} from '../examples/shared-services.mjs';

const endpoint = new URL(process.argv[2] ?? 'http://127.0.0.1:8876/mcp');
const withPdf = process.argv.includes('--pdf');
const headers = process.env.WORKSHOP_ACCESS_TOKEN ? {Authorization:`Bearer ${process.env.WORKSHOP_ACCESS_TOKEN}`} : {};
let record = createRecord(group);
for(let id=1;id<=4;id++) record=confirmPhase(savePhase(record,id,answers[id-1]),id,'Fictional protocol test approval.');
const results=[];
for (const visual of [false,true]) {
  const client=new Client({name:'workshop-http-verification',version:'1.0.0'},{capabilities:visual?{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}:{}});
  const transport=new StreamableHTTPClientTransport(endpoint,{requestInit:{headers}});
  try {
    await client.connect(transport);
    assert.match(transport.sessionId,new RegExp(`^workshop-ui${visual?1:0}-`));
    const tools=await client.listTools();assert.equal(tools.tools.length,7);
    const resources=await client.listResources();assert.equal(resources.resources.length,7);
    const method=await client.readResource({uri:'workshop://method'});assert.match(method.contents[0].text,/AMA-Groundwork/);
    const start=await client.callTool({name:'start_workshop',arguments:{group}});
    assert.equal(start.structuredContent.mode,visual?'ui-available':'text');
    const shortlist=await client.callTool({name:'show_shortlist',arguments:{record}});
    assert(!shortlist.isError);
    if(visual) {
      assert.equal(shortlist.structuredContent.$prefab.version,'0.3');
      assert.equal(shortlist.structuredContent.state.source.length,3);
      const view=await client.readResource({uri:'ui://prefab/renderer.html'});
      assert(view.contents[0].text.length>1_000_000);
    } else assert.equal(shortlist.structuredContent.mode,'text');
    const text=await client.callTool({name:'show_shortlist',arguments:{record,mode:'text'}});
    assert.equal(text.structuredContent.mode,'text');
    let pdfBytes=null;
    if(withPdf && !visual) {
      let draft=start.structuredContent.record;
      draft=(await client.callTool({name:'save_workshop_phase',arguments:{record:draft,phase:1,answers:answers[0],mode:'text'}})).structuredContent.record;
      const done=await client.callTool({name:'confirm_workshop_phase',arguments:{record:draft,phase:1,approved:true,confirmation:'The fictional test group approves this summary.',mode:'text'}},undefined,{timeout:60000});
      assert(!done.isError,done.content?.[0]?.text);
      assert.equal(done.structuredContent.record.phases[0].status,'confirmed');
      const pdf=done.content.find(item=>item.type==='resource'&&item.resource.mimeType==='application/pdf');
      const bytes=Buffer.from(pdf.resource.blob,'base64');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>10000);pdfBytes=bytes.length;
    }
    results.push({visual,tools:tools.tools.length,resources:resources.resources.length,pdfBytes});
  } finally {await client.close();}
}
const preflight=await fetch(endpoint,{method:'OPTIONS',headers:{Origin:'https://chatgpt.com','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
assert.equal(preflight.status,204);
const denied=await fetch(endpoint,{method:'POST',headers:{...headers,Origin:'https://hostile.example','Content-Type':'application/json'},body:'{}'});
assert.equal(denied.status,403);
const oversized=await fetch(endpoint,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(180001)})});
assert.equal(oversized.status,413);
console.log(JSON.stringify({endpoint:endpoint.origin,result:'pass',results,checks:['legacy capability retention','separate UI and text clients','explicit text override','compiled Prefab delivery','CORS preflight','hostile origin','streamed body bound'],pdfBoundary:withPdf?'actual server PDF':'PDF not requested; run with --pdf for remote PDF proof'}));
