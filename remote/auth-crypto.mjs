import {pbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {sha256 as passwordDigest} from '@noble/hashes/sha2.js';

const encoder=new TextEncoder();

export const PASSWORD_ITERATIONS=600_000;
export const ACCESS_TOKEN_SECONDS=60*60;
export const REFRESH_TOKEN_SECONDS=90*24*60*60;
export const BROWSER_SESSION_SECONDS=30*24*60*60;
export const AUTH_REQUEST_SECONDS=10*60;
export const AUTH_CODE_SECONDS=5*60;

export function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

export function randomToken(prefix,size=32,randomBytes=count=>crypto.getRandomValues(new Uint8Array(count))) {
  const bytes=randomBytes(size);
  if(!(bytes instanceof Uint8Array)||bytes.length!==size)throw new Error('Secure random values are unavailable.');
  return `${prefix}${base64url(bytes)}`;
}

export async function sha256(value) {
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function pkceChallenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))));
}

export async function hmacBase64url(secret,value) {
  if(typeof secret!=='string'||secret.length<32)throw new Error('The account link secret is not configured.');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));
}

export function normaliseEmail(value) {
  if(typeof value!=='string')return '';
  return value.trim().normalize('NFKC').toLowerCase();
}

export function validEmail(value) {
  const email=normaliseEmail(value);
  return email.length>=3&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validPassword(value) {
  return typeof value==='string'&&value.length>=10&&value.length<=256;
}

export function validDisplayName(value) {
  return typeof value==='string'&&value.trim().length>=1&&value.trim().length<=100;
}

async function derivePassword(password,salt,iterations) {
  // Workers' native PBKDF2 has a lower iteration cap than the configured
  // password work factor. The portable implementation preserves the exact
  // PBKDF2-SHA256 output and existing password records.
  return pbkdf2Async(passwordDigest,encoder.encode(password),salt,{c:iterations,dkLen:32});
}

function decodeBase64url(value) {
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid encoded value.');
  const base64=value.replaceAll('-','+').replaceAll('_','/')+'==='.slice((value.length+3)%4);
  return Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
}

function constantTimeEqual(left,right) {
  if(!(left instanceof Uint8Array)||!(right instanceof Uint8Array))return false;
  let difference=left.length^right.length;
  const length=Math.max(left.length,right.length);
  for(let index=0;index<length;index++)difference|=(left[index%left.length]??0)^(right[index%right.length]??0);
  return difference===0;
}

export async function createPasswordRecord(password,{iterations=PASSWORD_ITERATIONS,randomBytes=count=>crypto.getRandomValues(new Uint8Array(count))}={}) {
  if(!validPassword(password))throw new Error('Use at least 10 characters for the password.');
  if(!Number.isSafeInteger(iterations)||iterations<1)throw new Error('Invalid password work factor.');
  const salt=randomBytes(16);
  if(!(salt instanceof Uint8Array)||salt.length!==16)throw new Error('Secure random values are unavailable.');
  const hash=await derivePassword(password,salt,iterations);
  return {salt:base64url(salt),hash:base64url(hash),iterations};
}

export async function verifyPassword(password,record) {
  try {
    if(typeof password!=='string'||!record||!Number.isSafeInteger(record.iterations)||record.iterations<1)return false;
    const salt=decodeBase64url(record.salt),expected=decodeBase64url(record.hash);
    return constantTimeEqual(await derivePassword(password,salt,record.iterations),expected);
  }catch{return false;}
}

export function nowSeconds(now=()=>new Date()) {
  const value=new Date(now());
  if(!Number.isFinite(value.getTime()))throw new Error('The current time is unavailable.');
  return Math.floor(value.getTime()/1000);
}
