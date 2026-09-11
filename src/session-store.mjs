import {z} from 'zod';

export const WRITE_KEY = /^ws1_[A-Za-z0-9_-]{43}$/;
export const READ_KEY = /^wr1_[A-Za-z0-9_-]{43}$/;
export const FILE_TICKET = /^wf1_[A-Za-z0-9_-]{43}$/;
export const referenceSchema = z.object({
  key:z.string().regex(/^(?:ws1_|wr1_)[A-Za-z0-9_-]{43}$/),
  revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

const messages = {
  NOT_FOUND:'This private workbook reference is unavailable.',
  PENDING:'This workbook reference is prepared but has not been activated.',
  CONFLICT:'The saved workbook changed. Load its latest revision before trying again.',
  OPERATION_CONFLICT:'This operation ID was already used for a different request.',
  LIMIT:'A workbook storage limit has been reached. Saved work has not been removed; you can still read it or explicitly delete it.',
  UNAVAILABLE:'Persistent workbook storage is temporarily unavailable. Retry with the same reference and operation ID.',
};
export class SessionError extends Error {
  constructor(code) { super(messages[code] ?? messages.UNAVAILABLE); this.name='SessionError'; this.code=Object.hasOwn(messages,code)?code:'UNAVAILABLE'; }
}

export function canonicalJson(value) {
  const seen = new Set();
  function visit(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object' || seen.has(item)) throw new SessionError('CONFLICT');
    if (!Array.isArray(item) && Object.getPrototypeOf(item)!==Object.prototype && Object.getPrototypeOf(item)!==null) throw new SessionError('CONFLICT');
    seen.add(item);
    const result = Array.isArray(item) ? item.map(visit) : Object.fromEntries(Object.keys(item).sort().map(key=>[key,visit(item[key])]));
    seen.delete(item);
    return result;
  }
  return JSON.stringify(visit(value));
}

async function digest(value) {
  if (typeof value !== 'string') throw new SessionError('CONFLICT');
  return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
}
export async function hashValue(value) { return Array.from(await digest(value),byte=>byte.toString(16).padStart(2,'0')).join(''); }
export function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
export async function readKeyFor(writeKey) {
  if (!WRITE_KEY.test(writeKey)) throw new SessionError('NOT_FOUND');
  return `wr1_${base64url(await digest(`ai-use-case-workshop/read/v1\0${writeKey}`))}`;
}
