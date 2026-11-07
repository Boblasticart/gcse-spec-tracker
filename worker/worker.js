/* GCSE Spec Tracker marking server (Cloudflare Worker).
 *
 * POST /json  with  Authorization: Bearer <Supabase access token>  and body {"prompt": "..."}
 * -> asks Gemini for a JSON answer and returns {"result": <parsed JSON>}.
 *
 * Settings (Cloudflare dashboard > your Worker > Settings > Variables and Secrets):
 *   GEMINI_API_KEY       secret   your Gemini API key (never put this in the website)
 *   SUPABASE_URL         text     your Supabase project URL, e.g. https://abcdefghijklmnop.supabase.co
 *   SUPABASE_KEY         text     your Supabase publishable key (sb_publishable_...), the same one as the website
 *   ALLOWED_ORIGINS      text     your site, e.g. https://boblasticart.github.io  (comma-separate several)
 *   ALLOWED_EMAILS       text     optional: only these accounts' emails may use marking (comma-separated).
 *                                 Leave empty to let anyone who signs in use it (they use YOUR Gemini quota).
 *   GEMINI_MODEL         text     optional, default gemini-flash-latest
 */

const MAX_PROMPT = 60000; // characters

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
    if (!env.GEMINI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_KEY) return reply(500, { error: 'Marking server is missing GEMINI_API_KEY, SUPABASE_URL or SUPABASE_KEY.' });

    let who;
    try {
      const tok = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      who = await supabaseUser(tok, env);
    } catch (e) {
      return reply(401, { error: 'Please sign in again.' });
    }
    const emails = list(env.ALLOWED_EMAILS).map((x) => x.toLowerCase());
    if (emails.length && !(who.email_confirmed_at && emails.includes(String(who.email || '').toLowerCase()))) {
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

/* ---------- Supabase sign-in check ----------
 * Asks Supabase Auth who the token belongs to. Supabase rejects expired, forged or signed-out tokens,
 * so this works whichever kind of signing key the project uses. */
export async function supabaseUser(token, env) {
  if (!token || token.split('.').length !== 3) throw new Error('no token');
  const res = await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_KEY, authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('not signed in');
  const u = await res.json();
  if (!u || !u.id) throw new Error('not signed in');
  return u;
}
