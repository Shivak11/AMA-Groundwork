import {createRecord,groupInputSchema,datedGroup,validateRecord} from '../src/workshop.mjs';
import {WRITE_KEY,ACCOUNT_KEY,READ_KEY,ACCOUNT_READ_KEY,FILE_TICKET,referenceSchema,SessionError,canonicalJson,hashValue,readKeyFor,accountReadKeyFor,base64url} from '../src/session-store.mjs';

const operationIdPattern=/^[A-Za-z0-9_.:-]{1,160}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const revisionValid=revision=>Number.isSafeInteger(revision)&&revision>=0;
export const MAX_SESSIONS=500;
export const MAX_REVISION=1000;
export const MAX_RECEIPTS=2000;
export const MAX_ACTIVE_TICKETS=256;
export const MAX_RETAINED_BYTES=200_000_000;

export function createD1SessionStore(db,{now=()=>new Date(),randomBytes=size=>crypto.getRandomValues(new Uint8Array(size)),ownerUserId=null,accountLinkSecret=null}={}) {
  if(!db?.prepare)throw new SessionError('UNAVAILABLE');
  if(ownerUserId!==null&&!/^au1_[A-Za-z0-9_-]{43}$/.test(ownerUserId))throw new SessionError('UNAVAILABLE');
  const accountMode=ownerUserId!==null;
  if(accountMode&&(typeof accountLinkSecret!=='string'||accountLinkSecret.length<32))throw new SessionError('UNAVAILABLE');
  const time=()=>{const value=new Date(now());if(!Number.isFinite(value.getTime()))throw new SessionError('UNAVAILABLE');return value;};
  const storageError=error=>new SessionError(/WORKSHOP_(?:STORAGE|RECEIPT)_LIMIT/.test(String(error?.message??''))?'LIMIT':'UNAVAILABLE');
  const sql=async(query,params=[],method='first')=>{try{return await db.prepare(query).bind(...params)[method]();}catch(error){throw storageError(error);}};
  const fresh=async prefix=>{const bytes=await randomBytes(32);if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw new SessionError('UNAVAILABLE');return prefix+base64url(bytes);};
  function reference(value,write=false) {
    const parsed=referenceSchema.safeParse(value);
    if(!parsed.success||(write&&!WRITE_KEY.test(parsed.data.key)&&!ACCOUNT_KEY.test(parsed.data.key)))throw new SessionError('NOT_FOUND');
    return parsed.data;
  }
  async function authority(key,write=false) {
    if(typeof key!=='string')throw new SessionError('NOT_FOUND');
    if(WRITE_KEY.test(key))return {column:'write_hash',value:await hashValue(key),private:true,legacy:true};
    if(ACCOUNT_KEY.test(key)) {
      if(!accountMode)throw new SessionError('NOT_FOUND');
      return {column:'account_reference',value:key,private:true,legacy:false};
    }
    if(write)throw new SessionError('NOT_FOUND');
    if(READ_KEY.test(key))return {column:'read_hash',value:await hashValue(key),private:false,legacy:true};
    if(ACCOUNT_READ_KEY.test(key))return {column:'account_read_hash',value:await hashValue(key),private:false,legacy:false};
    throw new SessionError('NOT_FOUND');
  }
  async function claimLegacy(row) {
    if(!accountMode||row.owner_user_id&&row.owner_user_id!==ownerUserId)throw new SessionError('NOT_FOUND');
    if(row.owner_user_id===ownerUserId&&row.account_reference)return row;
    const accountReference=await fresh('wa1_'),accountReadHash=await hashValue(await accountReadKeyFor(accountReference,accountLinkSecret));
    const result=await sql(`UPDATE workshop_sessions SET owner_user_id=?,account_reference=?,account_read_hash=?,updated_at=?
      WHERE session_id=? AND (owner_user_id IS NULL OR owner_user_id=?) AND account_reference IS NULL`,[ownerUserId,accountReference,accountReadHash,time().toISOString(),row.session_id,ownerUserId],'run');
    if(result.meta.changes>0)return {...row,owner_user_id:ownerUserId,account_reference:accountReference,account_read_hash:accountReadHash};
    const latest=await sql('SELECT * FROM workshop_sessions WHERE session_id=?',[row.session_id]);
    if(latest?.owner_user_id!==ownerUserId||!latest.account_reference)throw new SessionError('NOT_FOUND');
    return latest;
  }
  async function session(key,write=false,{shared=false}={}) {
    const auth=await authority(key,write);
    let row=await sql(`SELECT * FROM workshop_sessions WHERE ${auth.column}=?`,[auth.value]);
    if(!row)throw new SessionError('NOT_FOUND');
    if(shared||!auth.private)return row;
    if(accountMode) {
      if(auth.legacy)row=await claimLegacy(row);
      else if(row.owner_user_id!==ownerUserId)throw new SessionError('NOT_FOUND');
    }else if(row.owner_user_id!==null)throw new SessionError('NOT_FOUND');
    return row;
  }
  function decode(value){try{return validateRecord(JSON.parse(value));}catch{throw new SessionError('UNAVAILABLE');}}
  function active(row){if(row.state!=='active')throw new SessionError('PENDING');return row;}
  async function load(key,revision,{shared=false}={}) {
    if(revision!==undefined&&!revisionValid(revision))throw new SessionError('NOT_FOUND');
    const row=active(await session(key,false,{shared}));
    const chosen=revision===undefined?row.current_revision:revision;
    const snapshot=await sql('SELECT record_json,revision FROM workshop_revisions WHERE session_id=? AND revision=?',[row.session_id,chosen]);
    if(!snapshot?.record_json)throw new SessionError('NOT_FOUND');
    const returnedKey=accountMode&&!shared&&(WRITE_KEY.test(key)||ACCOUNT_KEY.test(key))?row.account_reference??key:key;
    return {record:decode(snapshot.record_json),reference:{key:returnedKey,revision:snapshot.revision},currentRevision:row.current_revision};
  }
  async function receipt(row,operation,ref) {
    const saved=await sql('SELECT * FROM workshop_operations WHERE session_id=? AND operation_id=?',[row.session_id,operation.operationId]);
    if(!saved)return null;
    if(saved.operation_hash!==operation.operationHash||saved.expected_revision!==ref.revision)throw new SessionError('OPERATION_CONFLICT');
    return {...await load(ref.key),replayed:true,appliedRevision:saved.applied_revision};
  }
  return {
    async prepare() {
      const key=await fresh(accountMode?'wa1_':'ws1_'),writeHash=await hashValue(key);
      const readingKey=accountMode?await accountReadKeyFor(key,accountLinkSecret):await readKeyFor(key);
      const readHash=await hashValue(readingKey),stamp=time().toISOString();
      const admitted=await sql(`INSERT INTO workshop_sessions(session_id,write_hash,read_hash,owner_user_id,account_reference,account_read_hash,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM workshop_sessions)<?`,[writeHash,writeHash,readHash,ownerUserId,accountMode?key:null,accountMode?readHash:null,stamp,stamp,MAX_SESSIONS],'run');
      if(!(admitted.meta.changes>0))throw new SessionError('LIMIT');
      return {key,revision:0};
    },
    async activate(input,group) {
      const ref=reference(input,true);
      if(ref.revision!==0)throw new SessionError('CONFLICT');
      const row=await session(ref.key,true);
      const parsed=datedGroup(groupInputSchema.parse(group),new Date(row.created_at)),record=validateRecord(createRecord(parsed)),activationHash=await hashValue(canonicalJson(parsed));
      const replay=async saved=>{if(saved.activation_hash!==activationHash)throw new SessionError('CONFLICT');return {...await load(ref.key),replayed:true,appliedRevision:0};};
      if(row.state==='active')return replay(row);
      const result=await sql(`UPDATE workshop_sessions SET state='active',current_record=?,activation_hash=?,updated_at=?
        WHERE session_id=? AND state='pending' AND current_revision=0`,[canonicalJson(record),activationHash,time().toISOString(),row.session_id],'run');
      if(!(result.meta.changes>0))return replay(active(await session(ref.key,true)));
      return {...await load(ref.key),replayed:false,appliedRevision:0};
    },
    load,
    async loadShared(key,revision){if(!READ_KEY.test(key)&&!ACCOUNT_READ_KEY.test(key))throw new SessionError('NOT_FOUND');return load(key,revision,{shared:true});},
    async readKey(key) {
      const row=active(await session(key));
      if(row.account_reference)return accountReadKeyFor(row.account_reference,accountLinkSecret);
      return readKeyFor(key);
    },
    async listOwner({limit=20,offset=0}={}) {
      if(!accountMode)throw new SessionError('NOT_FOUND');
      if(!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(offset)||offset<0)throw new SessionError('CONFLICT');
      const result=await sql(`SELECT account_reference,current_revision,current_record,updated_at FROM workshop_sessions
        WHERE owner_user_id=? AND state='active' AND account_reference IS NOT NULL ORDER BY updated_at DESC LIMIT ? OFFSET ?`,[ownerUserId,limit,offset],'all');
      return result.results.map(row=>{
        const record=decode(row.current_record);
        return {record:{key:row.account_reference,revision:row.current_revision},groupName:record.group.name,problem:record.group.problem,approvedSteps:record.phases.filter(phase=>phase.status==='confirmed').length,updatedAt:row.updated_at};
      });
    },
    async transact(input,operation,reducer) {
      const ref=reference(input,true);
      if(!operation||typeof operation.operationId!=='string'||typeof operation.operationHash!=='string'||!operationIdPattern.test(operation.operationId)||!hashPattern.test(operation.operationHash))throw new SessionError('OPERATION_CONFLICT');
      const row=active(await session(ref.key,true)),previous=await receipt(row,operation,ref);
      if(previous)return previous;
      if(row.current_revision!==ref.revision)throw new SessionError('CONFLICT');
      const before=decode(row.current_record),nextInput=reducer(structuredClone(before));
      if(nextInput?.then)throw new SessionError('CONFLICT');
      const next=validateRecord(nextInput),beforeJson=canonicalJson(before),nextJson=canonicalJson(next);
      if(next.revision===before.revision){if(nextJson!==beforeJson)throw new SessionError('CONFLICT');}
      else if(next.revision!==before.revision+1||canonicalJson({...next,revision:before.revision})===beforeJson)throw new SessionError('CONFLICT');
      if(next.revision>MAX_REVISION&&next.revision!==before.revision)throw new SessionError('LIMIT');
      const result=await sql(`UPDATE workshop_sessions SET current_record=?,current_revision=?,updated_at=?,operation_id=?,operation_hash=?,operation_expected=?
        WHERE session_id=? AND state='active' AND current_revision=?
        AND NOT EXISTS(SELECT 1 FROM workshop_operations WHERE session_id=? AND operation_id=?)`,[nextJson,next.revision,time().toISOString(),operation.operationId,operation.operationHash,ref.revision,row.session_id,ref.revision,row.session_id,operation.operationId],'run');
      if(!(result.meta.changes>0)) {
        const replayed=await receipt(row,operation,ref);
        if(replayed)return replayed;
        await session(ref.key,true);throw new SessionError('CONFLICT');
      }
      return {...await load(ref.key),replayed:false,appliedRevision:next.revision};
    },
    async remove(input) {
      const ref=reference(input,true),row=await session(ref.key,true);
      const result=await sql('DELETE FROM workshop_sessions WHERE session_id=? AND current_revision=?',[row.session_id,ref.revision],'run');
      if(!(result.meta.changes>0)){await session(ref.key,true);throw new SessionError('CONFLICT');}
      return {deleted:true};
    },
    async createFileTicket(key,revision,kind) {
      if(!revisionValid(revision)||!['pdf','json'].includes(kind))throw new SessionError('NOT_FOUND');
      const row=active(await session(key)),ticket=await fresh('wf1_'),ticketHash=await hashValue(ticket),stamp=time(),expiresAt=new Date(stamp.getTime()+15*60*1000).toISOString();
      let result;
      try{
        const results=await db.batch([
          db.prepare('DELETE FROM workshop_file_tickets WHERE expires_at<=? AND session_id=?').bind(stamp.getTime(),row.session_id),
          db.prepare(`INSERT INTO workshop_file_tickets(ticket_hash,session_id,revision,kind,expires_at,created_at)
            SELECT ?,s.session_id,r.revision,?,?,? FROM workshop_sessions s JOIN workshop_revisions r ON r.session_id=s.session_id
            WHERE s.session_id=? AND s.state='active' AND r.revision=?
            AND (SELECT count(*) FROM workshop_file_tickets t WHERE t.session_id=s.session_id AND t.expires_at>?)<?`)
            .bind(ticketHash,kind,Date.parse(expiresAt),stamp.toISOString(),row.session_id,revision,stamp.getTime(),MAX_ACTIVE_TICKETS),
        ]);
        result=results[1];
      }catch(error){throw storageError(error);}
      if(!(result.meta.changes>0)){await load(key,revision);throw new SessionError('LIMIT');}
      return {ticket,expiresAt};
    },
    async resolveFileTicket(ticket) {
      if(typeof ticket!=='string'||!FILE_TICKET.test(ticket))throw new SessionError('NOT_FOUND');
      const row=await sql(`SELECT r.record_json,t.kind,t.revision FROM workshop_file_tickets t
        JOIN workshop_sessions s ON s.session_id=t.session_id AND s.state='active'
        JOIN workshop_revisions r ON r.session_id=t.session_id AND r.revision=t.revision
        WHERE t.ticket_hash=? AND t.expires_at>?`,[await hashValue(ticket),time().getTime()]);
      if(!row)throw new SessionError('NOT_FOUND');
      return {record:decode(row.record_json),kind:row.kind,revision:row.revision};
    },
    async history(key) {
      const row=active(await session(key));
      const result=await sql('SELECT revision,created_at FROM workshop_revisions WHERE session_id=? ORDER BY revision DESC LIMIT 100',[row.session_id],'all');
      return result.results.map(item=>({revision:item.revision,createdAt:item.created_at}));
    },
    async getPreference(key){return active(await session(key)).preference;},
    async setPreference(input,mode) {
      const ref=reference(input,true);
      if(!['auto','text'].includes(mode))throw new SessionError('CONFLICT');
      const row=active(await session(ref.key,true));
      const result=await sql('UPDATE workshop_sessions SET preference=?,updated_at=? WHERE session_id=? AND current_revision=?',[mode,time().toISOString(),row.session_id,ref.revision],'run');
      if(!(result.meta.changes>0)){await session(ref.key,true);throw new SessionError('CONFLICT');}
      return load(ref.key);
    },
  };
}
