import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {createD1SessionStore} from '../remote/d1-session-store.mjs';
import {createSqliteD1} from './support/d1-sqlite.mjs';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {group,answers,approval} from '../examples/persistent-remote-team.mjs';

test('an imported backup retry cannot overwrite later wording or question preference',async()=>{
  const db=createSqliteD1(),store=createD1SessionStore(db);
  const server=await createWorkshopServer({sessionStore:store,baseUrl:'https://workshop.example',pdfRenderer:async()=>Buffer.from('%PDF-import-test-stub')});
  const client=new Client({name:'import-recovery-test',version:'1'},{capabilities:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
  const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});assert(!result.isError);return result;};
  try {
    let checkpoint=createRecord(group);
    for(let phase=1;phase<=2;phase++)checkpoint=confirmPhase(savePhase(checkpoint,phase,answers[phase-1]),phase,approval);
    const prepared=await call('start_workshop');
    const request={record:prepared.structuredContent.record,checkpoint,approved:true,mode:'auto'};
    let result=await call('import_workshop',request);
    assert.deepEqual(result._meta.workbook.phases,checkpoint.phases);
    result=await call('set_workshop_preference',{record:result.structuredContent.record,mode:'text'});
    result=await call('save_workshop_phase',{record:result.structuredContent.record,phase:3,answers:{workflows:answers[2].workflows}});
    const saved=structuredClone(result._meta.workbook);
    const replay=await call('import_workshop',request);
    assert.deepEqual(replay._meta.workbook,saved);
    assert.equal(await store.getPreference(request.record.key),'text');
    assert.equal(replay.structuredContent.questionTurn.preferredInput,'plain_chat');
    assert.equal((await store.history(request.record.key)).length,3);
  }finally{await client.close();await server.close();db.close();}
});
