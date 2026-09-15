import {
  ACCESS_TOKEN_SECONDS,
  AUTH_CODE_SECONDS,
  AUTH_REQUEST_SECONDS,
  BROWSER_SESSION_SECONDS,
  PASSWORD_ITERATIONS,
  REFRESH_TOKEN_SECONDS,
  createPasswordRecord,
  normaliseEmail,
  nowSeconds,
  pkceChallenge,
  randomToken,
  sha256,
  validDisplayName,
  validEmail,
  validPassword,
  verifyPassword,
} from './auth-crypto.mjs';

export class AuthError extends Error {
  constructor(code,message,status=400) {
    super(message);
    this.name='AuthError';
    this.code=code;
    this.status=status;
  }
}

const iso=seconds=>new Date(seconds*1000).toISOString();
const json=value=>JSON.stringify(value);

export function createD1AuthStore(db,{now=()=>new Date(),randomBytes=size=>crypto.getRandomValues(new Uint8Array(size)),passwordIterations=PASSWORD_ITERATIONS}={}) {
  if(!db?.prepare)throw new AuthError('server_error','Account storage is unavailable.',503);
  const current=()=>nowSeconds(now);
  const fresh=(prefix,size=32)=>randomToken(prefix,size,randomBytes);
  const sql=async(query,params=[],method='first')=>{
    try{return await db.prepare(query).bind(...params)[method]();}
    catch(error){throw Object.assign(new AuthError('server_error','Account storage is temporarily unavailable.',503),{cause:error});}
  };
  const userView=row=>row?{userId:row.user_id,email:row.email,displayName:row.display_name}:null;
  const tokenBundle=async row=>{
    const issued=current(),accessToken=fresh('at1_'),refreshToken=fresh('rt1_'),familyId=fresh('rf1_',16);
    const accessHash=await sha256(accessToken),refreshHash=await sha256(refreshToken);
    return {issued,accessToken,refreshToken,familyId,accessHash,refreshHash,row};
  };
  const authorizationRequest=async token=>{
    if(typeof token!=='string'||!/^ar1_[A-Za-z0-9_-]{43}$/.test(token))throw new AuthError('invalid_request','This sign-in request is unavailable.');
    const row=await sql('SELECT r.*,c.client_name FROM oauth_authorization_requests r JOIN oauth_clients c ON c.client_id=r.client_id WHERE r.request_hash=? AND r.expires_at>? AND r.completed_at IS NULL',[await sha256(token),current()]);
    if(!row)throw new AuthError('invalid_request','This sign-in request has expired. Return to the connector and try again.');
    return row;
  };
  const insertTokens=async(bundle,{rotateHash=null}={})=>{
    const {issued,accessToken,refreshToken,familyId,accessHash,refreshHash,row}=bundle;
    const exchangeId=fresh('ox1_',16);
    const statements=[
      db.prepare('UPDATE oauth_refresh_tokens SET used_at=?,exchange_id=? WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL').bind(iso(issued),exchangeId,rotateHash),
      db.prepare(`INSERT INTO oauth_access_tokens(token_hash,family_id,user_id,client_id,resource,scope,expires_at,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM oauth_refresh_tokens WHERE token_hash=? AND exchange_id=?)`).bind(accessHash,row.family_id,row.user_id,row.client_id,row.resource,row.scope,issued+ACCESS_TOKEN_SECONDS,iso(issued),rotateHash,exchangeId),
      db.prepare(`INSERT INTO oauth_refresh_tokens(token_hash,family_id,user_id,client_id,resource,scope,expires_at,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM oauth_refresh_tokens WHERE token_hash=? AND exchange_id=?)`).bind(refreshHash,rotateHash?row.family_id:familyId,row.user_id,row.client_id,row.resource,row.scope,issued+REFRESH_TOKEN_SECONDS,iso(issued),rotateHash,exchangeId),
    ];
    let results;
    try{results=await db.batch(statements);}catch(error){throw Object.assign(new AuthError('server_error','Token creation did not complete.',503),{cause:error});}
    if(!(results[0]?.meta?.changes>0)||!(results[1]?.meta?.changes>0)||!(results[2]?.meta?.changes>0)){
      if(rotateHash){
        const reused=await sql('SELECT family_id FROM oauth_refresh_tokens WHERE token_hash=?',[rotateHash]);
        if(reused)try{
          await db.batch([
            db.prepare('UPDATE oauth_refresh_tokens SET revoked_at=coalesce(revoked_at,?) WHERE family_id=?').bind(iso(issued),reused.family_id),
            db.prepare('UPDATE oauth_access_tokens SET revoked_at=coalesce(revoked_at,?) WHERE family_id=?').bind(iso(issued),reused.family_id),
          ]);
        }catch(error){throw Object.assign(new AuthError('server_error','Account sign-in is temporarily unavailable.',503),{cause:error});}
      }
      throw new AuthError('invalid_grant','This sign-in session has already been used. Sign in again.');
    }
    return {access_token:accessToken,token_type:'Bearer',expires_in:ACCESS_TOKEN_SECONDS,refresh_token:refreshToken,scope:row.scope};
  };

  return {
    async registerClient({clientName,redirectUris}) {
      const clientId=fresh('oc1_'),stamp=iso(current());
      await sql('INSERT INTO oauth_clients(client_id,client_name,redirect_uris_json,created_at) VALUES(?,?,?,?)',[clientId,clientName,json(redirectUris),stamp],'run');
      return {clientId,clientName,redirectUris};
    },
    async client(clientId) {
      if(typeof clientId!=='string'||clientId.length>200)return null;
      const row=await sql('SELECT * FROM oauth_clients WHERE client_id=?',[clientId]);
      if(!row)return null;
      try{return {clientId:row.client_id,clientName:row.client_name,redirectUris:JSON.parse(row.redirect_uris_json)};}catch{return null;}
    },
    async registerUser({email,password,displayName}) {
      const normalised=normaliseEmail(email),name=typeof displayName==='string'?displayName.trim():'';
      if(!validEmail(normalised))throw new AuthError('invalid_request','Enter a valid email address.');
      if(!validDisplayName(name))throw new AuthError('invalid_request','Enter your name.');
      if(!validPassword(password))throw new AuthError('invalid_request','Use at least 10 characters for the password.');
      const passwordRecord=await createPasswordRecord(password,{iterations:passwordIterations,randomBytes});
      const userId=fresh('au1_'),stamp=iso(current());
      try{
        await db.prepare(`INSERT INTO users(user_id,email,email_normalized,display_name,password_salt,password_hash,password_iterations,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?)`).bind(userId,email.trim(),normalised,name,passwordRecord.salt,passwordRecord.hash,passwordRecord.iterations,stamp,stamp).run();
      }catch(error){
        if(/unique|constraint/i.test(String(error?.message??'')))throw new AuthError('email_exists','An account already uses this email address.',409);
        throw Object.assign(new AuthError('server_error','The account could not be created.',503),{cause:error});
      }
      return {userId,email:email.trim(),displayName:name};
    },
    async authenticateUser({email,password}) {
      const normalised=normaliseEmail(email);
      const row=validEmail(normalised)?await sql('SELECT * FROM users WHERE email_normalized=?',[normalised]):null;
      const fallback={salt:'AAAAAAAAAAAAAAAAAAAAAA',hash:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',iterations:passwordIterations};
      const valid=await verifyPassword(password,row?{salt:row.password_salt,hash:row.password_hash,iterations:row.password_iterations}:fallback);
      if(!row||!valid)throw new AuthError('invalid_credentials','The email address or password is incorrect.',401);
      return userView(row);
    },
    async createBrowserSession(userId) {
      const token=fresh('bs1_'),stamp=current();
      await sql('INSERT INTO browser_sessions(session_hash,user_id,expires_at,created_at,last_used_at) VALUES(?,?,?,?,?)',[await sha256(token),userId,stamp+BROWSER_SESSION_SECONDS,iso(stamp),iso(stamp)],'run');
      return {token,expiresAt:stamp+BROWSER_SESSION_SECONDS};
    },
    async browserUser(token) {
      if(typeof token!=='string'||!/^bs1_[A-Za-z0-9_-]{43}$/.test(token))return null;
      const stamp=current(),hash=await sha256(token);
      const row=await sql(`SELECT u.* FROM browser_sessions b JOIN users u ON u.user_id=b.user_id
        WHERE b.session_hash=? AND b.expires_at>?`,[hash,stamp]);
      if(!row)return null;
      await sql('UPDATE browser_sessions SET last_used_at=? WHERE session_hash=?',[iso(stamp),hash],'run');
      return userView(row);
    },
    async deleteBrowserSession(token) {
      if(typeof token==='string'&&token.length<=100)await sql('DELETE FROM browser_sessions WHERE session_hash=?',[await sha256(token)],'run');
    },
    async createAuthorizationRequest({clientId,redirectUri,state,codeChallenge,resource,scope}) {
      const token=fresh('ar1_'),stamp=current();
      await sql(`INSERT INTO oauth_authorization_requests(request_hash,client_id,redirect_uri,state,code_challenge,resource,scope,expires_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`,[await sha256(token),clientId,redirectUri,state??null,codeChallenge,resource,scope,stamp+AUTH_REQUEST_SECONDS,iso(stamp)],'run');
      return token;
    },
    authorizationRequest,
    async issueAuthorizationCode(requestToken,userId) {
      const requestHash=await sha256(requestToken),row=await authorizationRequest(requestToken);
      const code=fresh('ac1_'),exchangeId=fresh('ox1_',16),stamp=current();
      let results;
      try{
        results=await db.batch([
          db.prepare('UPDATE oauth_authorization_requests SET completed_at=?,exchange_id=? WHERE request_hash=? AND completed_at IS NULL AND expires_at>?').bind(iso(stamp),exchangeId,requestHash,stamp),
          db.prepare(`INSERT INTO oauth_authorization_codes(code_hash,user_id,client_id,redirect_uri,code_challenge,resource,scope,expires_at,created_at)
            SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM oauth_authorization_requests WHERE request_hash=? AND exchange_id=?)`).bind(await sha256(code),userId,row.client_id,row.redirect_uri,row.code_challenge,row.resource,row.scope,stamp+AUTH_CODE_SECONDS,iso(stamp),requestHash,exchangeId),
          db.prepare('INSERT OR REPLACE INTO oauth_consents(user_id,client_id,scope,granted_at) VALUES(?,?,?,?)').bind(userId,row.client_id,row.scope,iso(stamp)),
          db.prepare('DELETE FROM oauth_authorization_requests WHERE request_hash=?').bind(requestHash),
        ]);
      }catch(error){throw Object.assign(new AuthError('server_error','The connector could not complete sign-in.',503),{cause:error});}
      if(!(results[0]?.meta?.changes>0)||!(results[1]?.meta?.changes>0))throw new AuthError('invalid_request','This sign-in request has already been completed.');
      return {code,clientId:row.client_id,redirectUri:row.redirect_uri,state:row.state,resource:row.resource};
    },
    async exchangeAuthorizationCode({code,clientId,redirectUri,codeVerifier,resource}) {
      if(typeof code!=='string'||typeof codeVerifier!=='string')throw new AuthError('invalid_grant','The authorisation code is invalid.');
      const codeHash=await sha256(code),stamp=current();
      const row=await sql(`SELECT * FROM oauth_authorization_codes WHERE code_hash=? AND client_id=? AND redirect_uri=?
        AND resource=? AND expires_at>? AND used_at IS NULL`,[codeHash,clientId,redirectUri,resource,stamp]);
      if(!row||await pkceChallenge(codeVerifier)!==row.code_challenge)throw new AuthError('invalid_grant','The authorisation code is invalid or has expired.');
      const bundle=await tokenBundle(row),exchangeId=fresh('ox1_',16);
      let results;
      try{
        results=await db.batch([
          db.prepare('UPDATE oauth_authorization_codes SET used_at=?,exchange_id=? WHERE code_hash=? AND used_at IS NULL').bind(iso(stamp),exchangeId,codeHash),
          db.prepare(`INSERT INTO oauth_access_tokens(token_hash,family_id,user_id,client_id,resource,scope,expires_at,created_at)
            SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM oauth_authorization_codes WHERE code_hash=? AND exchange_id=?)`).bind(bundle.accessHash,bundle.familyId,row.user_id,row.client_id,row.resource,row.scope,stamp+ACCESS_TOKEN_SECONDS,iso(stamp),codeHash,exchangeId),
          db.prepare(`INSERT INTO oauth_refresh_tokens(token_hash,family_id,user_id,client_id,resource,scope,expires_at,created_at)
            SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM oauth_authorization_codes WHERE code_hash=? AND exchange_id=?)`).bind(bundle.refreshHash,bundle.familyId,row.user_id,row.client_id,row.resource,row.scope,stamp+REFRESH_TOKEN_SECONDS,iso(stamp),codeHash,exchangeId),
        ]);
      }catch(error){throw Object.assign(new AuthError('server_error','Token creation did not complete.',503),{cause:error});}
      if(!(results[0]?.meta?.changes>0)||!(results[1]?.meta?.changes>0)||!(results[2]?.meta?.changes>0))throw new AuthError('invalid_grant','The authorisation code has already been used.');
      return {access_token:bundle.accessToken,token_type:'Bearer',expires_in:ACCESS_TOKEN_SECONDS,refresh_token:bundle.refreshToken,scope:row.scope};
    },
    async exchangeRefreshToken({refreshToken,clientId,resource}) {
      if(typeof refreshToken!=='string')throw new AuthError('invalid_grant','The refresh token is invalid.');
      const tokenHash=await sha256(refreshToken),stamp=current();
      const row=await sql('SELECT * FROM oauth_refresh_tokens WHERE token_hash=? AND client_id=? AND resource=?',[tokenHash,clientId,resource]);
      if(!row)throw new AuthError('invalid_grant','The refresh token is invalid.');
      if(row.used_at||row.revoked_at){
        try{
          await db.batch([
            db.prepare('UPDATE oauth_refresh_tokens SET revoked_at=coalesce(revoked_at,?) WHERE family_id=?').bind(iso(stamp),row.family_id),
            db.prepare('UPDATE oauth_access_tokens SET revoked_at=coalesce(revoked_at,?) WHERE family_id=?').bind(iso(stamp),row.family_id),
          ]);
        }catch(error){throw Object.assign(new AuthError('server_error','Account sign-in is temporarily unavailable.',503),{cause:error});}
        throw new AuthError('invalid_grant','This sign-in session is no longer valid. Sign in again.');
      }
      if(row.expires_at<=stamp)throw new AuthError('invalid_grant','This sign-in session has expired. Sign in again.');
      return insertTokens(await tokenBundle(row),{rotateHash:tokenHash});
    },
    async verifyAccessToken(token,resource) {
      if(typeof token!=='string'||!/^at1_[A-Za-z0-9_-]{43}$/.test(token))return null;
      const row=await sql(`SELECT t.user_id,t.client_id,t.resource,t.scope,u.email,u.display_name FROM oauth_access_tokens t
        JOIN users u ON u.user_id=t.user_id WHERE t.token_hash=? AND t.resource=? AND t.expires_at>? AND t.revoked_at IS NULL`,[await sha256(token),resource,current()]);
      if(!row)return null;
      return {userId:row.user_id,clientId:row.client_id,resource:row.resource,scopes:row.scope.split(/\s+/).filter(Boolean),email:row.email,displayName:row.display_name};
    },
    async revokeToken(token) {
      if(typeof token!=='string'||token.length>200)return;
      const hash=await sha256(token),stamp=iso(current());
      try{
        await db.batch([
          db.prepare('UPDATE oauth_access_tokens SET revoked_at=coalesce(revoked_at,?) WHERE token_hash=?').bind(stamp,hash),
          db.prepare('UPDATE oauth_refresh_tokens SET revoked_at=coalesce(revoked_at,?) WHERE token_hash=?').bind(stamp,hash),
        ]);
      }catch(error){throw Object.assign(new AuthError('server_error','Account sign-in is temporarily unavailable.',503),{cause:error});}
    },
  };
}
