import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import { group,answers } from '../examples/shared-services.mjs';
const client=new Client({name:'classroom-stdio-verification',version:'1.0.0'},{capabilities:{}});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/stdio.mjs',import.meta.url))]});
try {
  await client.connect(transport);
  const resources=await client.listResources();assert(resources.resources.some(r=>r.uri==='workshop://method'));
  const method=await client.readResource({uri:'workshop://method'});assert.match(method.contents[0].text,/AMA-Groundwork/);
  let result=await client.callTool({name:'start_workshop',arguments:{group,mode:'text'}});
  let record=result.structuredContent.record;
  result=await client.callTool({name:'save_workshop_phase',arguments:{record,phase:1,answers:answers[0],mode:'text'}});record=result.structuredContent.record;
  result=await client.callTool({name:'confirm_workshop_phase',arguments:{record,phase:1,approved:true,confirmation:'The test group approves this summary.',mode:'text'}},undefined,{timeout:60000});
  assert(!result.isError,JSON.stringify(result));
  const file=await client.callTool({name:'download_workbook_file',arguments:{record:result.structuredContent.record}},undefined,{timeout:60000});
  assert(!file.isError,JSON.stringify(file));
  const pdf=file.content.find(b=>b.type==='resource'&&b.resource.mimeType==='application/gzip');
  const bytes=gunzipSync(Buffer.from(pdf.resource.blob,'base64'));assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>10000);
  console.log(JSON.stringify({transport:'stdio',uiCapabilities:false,resources:resources.resources.length,pdfBytes:bytes.length,phase:result.structuredContent.record.phases[0].status}));
} finally {await client.close();await transport.close();}
