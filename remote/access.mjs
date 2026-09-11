const MAX_REQUEST_BYTES = 180_000;
const allowedOrigins = new Set(['https://chatgpt.com', 'https://chat.openai.com', 'https://claude.ai']);

export function accessConfigured(env) {
  return env.ACCESS_MODE === 'public' || (env.ACCESS_MODE === 'private' && typeof env.WORKSHOP_ACCESS_TOKEN === 'string' && env.WORKSHOP_ACCESS_TOKEN.length >= 32);
}

export async function authorised(request, env) {
  if (!accessConfigured(env)) return false;
  if (env.ACCESS_MODE === 'public') return true;
  const candidate = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.WORKSHOP_ACCESS_TOKEN}`;
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [left, right] = await Promise.all([digest(candidate), digest(expected)]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function originAllowed(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin || allowedOrigins.has(origin);
}

export async function boundedJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw Object.assign(new Error('Use application/json.'), {status: 415});
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared > MAX_REQUEST_BYTES) throw Object.assign(new Error('Request is too large.'), {status: 413});
  if (!request.body) throw Object.assign(new Error('A JSON-RPC request is required.'), {status: 400});
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) throw Object.assign(new Error('Request is too large.'), {status: 413});
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  let message;
  try {message = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));}
  catch {throw Object.assign(new Error('Invalid JSON.'), {status: 400});}
  if (!message || Array.isArray(message) || typeof message !== 'object') throw Object.assign(new Error('Send one JSON-RPC message at a time.'), {status: 400});
  return {message, bytes};
}

export async function applyLimit(binding, key) {
  if (!binding?.limit) throw Object.assign(new Error('The workshop is temporarily unavailable.'), {status: 503});
  const result = await binding.limit({key});
  if (!result.success) throw Object.assign(new Error('Too many requests. Wait one minute and retry using your latest checkpoint.'), {status: 429});
}

export function protectedResponse(body, {status = 200, headers = {}} = {}) {
  return new Response(body, {status, headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  }});
}
