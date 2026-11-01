/* GCSE Spec Tracker marking server (Cloudflare Worker).
 *
 * POST /json  with  Authorization: Bearer <Firebase ID token>  and body {"prompt": "..."}
 * -> asks Gemini for a JSON answer and returns {"result": <parsed JSON>}.
 *
 * Settings (Cloudflare dashboard > your Worker > Settings > Variables and Secrets):
 *   GEMINI_API_KEY       secret   your Gemini API key (never put this in the website)
 *   FIREBASE_PROJECT_ID  text     your Firebase project id, e.g. gcse-spec-tracker-1a2b3
 *   ALLOWED_ORIGINS      text     your site, e.g. https://boblasticart.github.io  (comma-separate several)
 *   ALLOWED_EMAILS       text     optional: only these Google accounts may use marking (comma-separated).
 *                                 Leave empty to let anyone who signs in use it (they use YOUR Gemini quota).
 *   GEMINI_MODEL         text     optional, default gemini-flash-latest
 */

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_PROMPT = 60000; // characters
let jwksCache = { keys: null, until: 0 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = list(env.ALLOWED_ORIGINS);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || ''),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return reply(200, { ok: true, service: 'gcse-marking' });
    if (request.method !== 'POST' || url.pathname !== '/json') return reply(404, { error: 'Not found' });
    if (allowed.length && !allowed.includes(origin)) return reply(403, { error: 'This site is not allowed to use the marking server (check ALLOWED_ORIGINS).' });
    if (!env.GEMINI_API_KEY || !env.FIREBASE_PROJECT_ID) return reply(500, { error: 'Marking server is missing GEMINI_API_KEY or FIREBASE_PROJECT_ID.' });

    let who;
    try {
      const tok = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      who = await verifyFirebaseToken(tok, env.FIREBASE_PROJECT_ID);
    } catch (e) {
      return reply(401, { error: 'Please sign in again.' });
    }
    const emails = list(env.ALLOWED_EMAILS).map((x) => x.toLowerCase());
    if (emails.length && !(who.email_verified && emails.includes(String(who.email || '').toLowerCase()))) {
      return reply(403, { error: 'This account is not allowed to use AI marking.' });
    }

    let body;
    try { body = await request.json(); } catch (e) { return reply(400, { error: 'Bad request' }); }
    const prompt = body && typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt) return reply(400, { error: 'No prompt' });
    if (prompt.length > MAX_PROMPT) return reply(413, { error: 'Prompt too long' });

    try {
      const result = await askGemini(prompt, env);
      return reply(200, { result });
    } catch (e) {
      return reply(e.status || 502, { error: e.message || 'Gemini request failed' });
    }
  }
};

function list(v) { return String(v || '').split(',').map((s) => s.trim()).filter(Boolean); }

async function askGemini(prompt, env) {
  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Gemini error ${res.status}`;
    throw Object.assign(new Error(res.status === 429 ? 'Gemini rate limit reached. Wait a minute and try again.' : msg), { status: res.status === 429 ? 429 : 502 });
  }
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  if (!text) throw new Error('Gemini sent back an empty answer.');
  return parseJsonLoose(text);
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch (e) { /* fall through */ } }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error('Gemini did not return JSON.');
}

/* ---------- Firebase ID token check (RS256 against Google's public keys) ---------- */
export async function verifyFirebaseToken(token, projectId, now = Math.floor(Date.now() / 1000), getKeys = fetchKeys) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const header = JSON.parse(b64urlText(parts[0]));
  const payload = JSON.parse(b64urlText(parts[1]));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad header');
  const keys = await getKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('bad signature');
  if (payload.aud !== projectId) throw new Error('wrong audience');
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('wrong issuer');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('no subject');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('expired');
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new Error('issued in the future');
  return payload;
}

async function fetchKeys() {
  if (jwksCache.keys && Date.now() < jwksCache.until) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('could not load keys');
  const data = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  jwksCache = { keys: data.keys || [], until: Date.now() + (m ? +m[1] : 3600) * 1000 };
  return jwksCache.keys;
}

function b64urlBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function b64urlText(s) { return new TextDecoder().decode(b64urlBytes(s)); }
