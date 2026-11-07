/* GCSE Spec Tracker: GitHub Pages adapter (Supabase + Gemini marking server).
 *
 * The tracker code in index.html is the same code as the claude.ai version. On claude.ai it calls
 * claude.use('db') for saving and claude.use('sample') for AI marking. This file provides those
 * same two things here, using:
 *   - Supabase Auth (Google or email-link sign-in) and one Supabase table, tracker_docs, where each
 *     row is one saved item {user_id, path, data}. Row-level security means people only ever see
 *     their own rows (see supabase/setup.sql).
 *   - a Cloudflare Worker (worker/worker.js) that holds the Gemini key and does the AI work
 * plus repo files for shared content: data/notes/*.json, data/questions.json, data/updates.json.
 */
(function () {
  'use strict';
  var CFG = window.TRACKER_CONFIG || {};
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';
  var TABLE = 'tracker_docs';
  var isSet = function (v) { return typeof v === 'string' && v && !/^PASTE/.test(v); };
  var dbReady = isSet(CFG.supabaseUrl) && isSet(CFG.supabaseKey);
  var markReady = isSet(CFG.markingUrl);

  var sb = null, user = null, first = true;
  var resolveSignedIn;
  var signedIn = new Promise(function (r) { resolveSignedIn = r; });

  /* ---------- small helpers ---------- */
  var LAST_UID = 'gcse-tracker-last-uid';
  function clearLocal() { try { localStorage.removeItem('gcse-spec-tracker-v2'); localStorage.removeItem('gcse-papers-v1'); } catch (e) {} }
  var clone = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
  var jsonCache = {};
  function fetchJSON(url, fresh) {
    if (!fresh && jsonCache[url]) return jsonCache[url];
    var p = fetch(url, { cache: fresh ? 'no-cache' : 'default' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    if (!fresh) jsonCache[url] = p;
    return p;
  }
  var bank = fetchJSON('data/questions.json', true).then(function (b) { return b || {}; });

  /* ---------- account bar (lives in the page header) ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.acct{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:.8rem;color:var(--muted)}' +
    '.acct .chip{font-size:.8rem;padding:4px 10px}' +
    '.acct .who{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.acct input{font:inherit;font-size:.82rem;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:4px 10px;min-width:0;width:200px}' +
    '.acct-note{flex-basis:100%;margin:6px 0 0;padding:8px 12px;border-radius:10px;background:var(--work-bg);color:var(--work-fg);font-size:.82rem}' +
    '.acct .nudge{animation:acctPulse 1s ease 2}' +
    '@keyframes acctPulse{50%{box-shadow:0 0 0 4px var(--accent)}}';
  document.head.appendChild(css);
  var barEl = null, noteEl = null;
  function header() { return document.querySelector('header.top'); }
  function bar(state) {
    var h = header(); if (!h) { document.addEventListener('DOMContentLoaded', function () { bar(state); }); return; }
    if (!barEl) { barEl = document.createElement('div'); barEl.className = 'acct'; h.appendChild(barEl); }
    var sync = document.getElementById('sync');
    if (state === 'setup') {
      barEl.innerHTML = '';
      note('Setup needed: add your Supabase project URL, publishable key and marking server address to supabase-config.js (see the README). Until then progress saves on this device only.');
      if (sync) sync.textContent = 'Saved on this device only';
    } else if (state === 'out') {
      barEl.innerHTML = (CFG.googleSignIn ? '<button class="chip" data-acct="google">Sign in with Google</button>' : '') +
        '<button class="chip" data-acct="email">Sign in with email</button>';
      if (sync) sync.textContent = 'Sign in to save to your account';
    } else if (state === 'email') {
      barEl.innerHTML = '<input type="email" id="acct-email" placeholder="you@example.com" autocomplete="email" aria-label="Email address">' +
        '<button class="chip" data-acct="send">Send sign-in link</button><button class="chip" data-acct="cancel">Cancel</button>';
      var inp = document.getElementById('acct-email'); if (inp) inp.focus();
    } else if (state === 'in') {
      barEl.innerHTML = '<span class="who" title="Signed in">' + esc(user.email || 'Signed in') + '</span>' +
        '<button class="chip" data-acct="import">Import</button>' +
        '<button class="chip" data-acct="backup">Back up</button>' +
        '<button class="chip" data-acct="out">Sign out</button>';
      if (!markReady) note('AI marking is not set up yet: add your Cloudflare Worker address as markingUrl in supabase-config.js (see the README).');
    }
  }
  function note(text) {
    var h = header(); if (!h) return;
    if (!noteEl) { noteEl = document.createElement('p'); noteEl.className = 'acct-note'; h.appendChild(noteEl); }
    noteEl.textContent = text; noteEl.hidden = !text;
    clearTimeout(note.t);
  }
  function toast(text) { note(text); note.t = setTimeout(function () { if (noteEl) noteEl.hidden = true; }, 9000); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nudge() {
    var b = barEl && barEl.querySelector('[data-acct="google"],[data-acct="email"]');
    if (b) { b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); b.scrollIntoView({ block: 'nearest' }); }
    toast('Sign in first, then try again.');
  }

  var back = function () { return location.origin + location.pathname; };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-acct]'); if (!b || !sb) return;
    var a = b.getAttribute('data-acct');
    if (a === 'google') {
      sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back() } })
        .then(function (r) { if (r && r.error) toast('Google sign-in failed: ' + r.error.message); });
    } else if (a === 'email') bar('email');
    else if (a === 'cancel') bar('out');
    else if (a === 'send') sendLink();
    else if (a === 'out') { clearLocal(); sb.auth.signOut(); }
    else if (a === 'import') pickImport();
    else if (a === 'backup') backup();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'acct-email') sendLink(); });
  function sendLink() {
    var inp = document.getElementById('acct-email'); var email = inp ? inp.value.trim() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Type your email address first.'); return; }
    sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: back() } }).then(function (r) {
      if (r && r.error) { toast('Could not send the link: ' + r.error.message); return; }
      bar('out'); note('Check ' + email + ' for a sign-in link, then open it on this device.');
    });
  }

  /* ---------- the signed-in person's rows, kept in memory ---------- */
  var store = new Map();            // path -> data
  var docL = new Map(), colL = new Map();
  function on(map, key, cb) { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(cb); return function () { map.get(key).delete(cb); }; }
  function notify(path) {
    var c = path.split('/')[0];
    (docL.get(path) || []).forEach(function (cb) { setTimeout(function () { cb(docSnap(path)); }, 0); });
    (colL.get(c) || []).forEach(function (cb) { setTimeout(function () { cb(colSnap(c)); }, 0); });
  }
  function docSnap(path) {
    var d = clone(store.get(path)); var id = path.split('/').pop();
    return { id: id, exists: store.has(path), data: function () { return d; }, metadata: { hasPendingWrites: false } };
  }
  function colSnap(c, extra) {
    var all = Object.assign({}, extra || {});
    store.forEach(function (v, k) { if (k.indexOf(c + '/') === 0 && k.indexOf('/', c.length + 1) < 0) all[k.slice(c.length + 1)] = v; });
    return { docs: Object.keys(all).map(function (id) { var d = clone(all[id]); return { id: id, data: function () { return d; } }; }) };
  }
  function loadAll() {
    store.clear();
    var page = 1000, out = [];
    function next(from) {
      return sb.from(TABLE).select('path,data').order('path').range(from, from + page - 1).then(function (r) {
        if (r.error) throw r.error;
        out = out.concat(r.data || []);
        return (r.data || []).length === page ? next(from + page) : out;
      });
    }
    return next(0).then(function (rows) { rows.forEach(function (r) { store.set(r.path, r.data); }); });
  }
  function save(rows) {
    rows.forEach(function (r) { store.set(r[0], clone(r[1])); notify(r[0]); });
    var chain = Promise.resolve();
    for (var i = 0; i < rows.length; i += 500) (function (part) {
      chain = chain.then(function () {
        return sb.from(TABLE).upsert(part.map(function (r) { return { user_id: user.id, path: r[0], data: r[1] === undefined ? null : r[1] }; }), { onConflict: 'user_id,path' })
          .then(function (res) { if (res.error) { toast('Could not save: ' + res.error.message); throw res.error; } });
      });
    })(rows.slice(i, i + 500));
    return chain;
  }
  function remove(path) {
    store.delete(path); notify(path);
    return sb.from(TABLE).delete().eq('path', path).then(function (res) { if (res.error) throw res.error; });
  }

  /* ---------- updates Claude pushes to the repo (data/updates.json) ----------
   * Each entry: {"id":"unique-id","sid":"phy","needsWork":["phy.4.0",...],"daily":{"2026-11-02-phy":{...}}}
   * Applied once per account. needsWork only sets points that are currently Not done. */
  function applyUpdates() {
    return fetchJSON('data/updates.json', true).then(function (ups) {
      if (!Array.isArray(ups) || !ups.length) return;
      var done = new Set(((store.get('meta/applied')) || {}).ids || []);
      var todo = ups.filter(function (u) { return u && u.id && !done.has(u.id); });
      if (!todo.length) return;
      var rows = [], prog = {};
      todo.forEach(function (u) {
        if (u.sid && Array.isArray(u.needsWork) && u.needsWork.length) {
          var key = 'progress/' + u.sid;
          var p = prog[key] || clone(store.get(key)) || { s: {}, c: {}, m: {}, w: {}, v: 2 };
          p.s = p.s || {};
          u.needsWork.forEach(function (pid) { if (!p.s[pid]) p.s[pid] = 1; });
          prog[key] = p;
        }
        Object.keys(u.daily || {}).forEach(function (id) { if (!store.has('daily/' + id)) rows.push(['daily/' + id, u.daily[id]]); });
        done.add(u.id);
      });
      Object.keys(prog).forEach(function (k) { rows.push([k, prog[k]]); });
      rows.push(['meta/applied', { ids: Array.from(done) }]);
      return save(rows);
    });
  }

  /* ---------- import and back up ---------- */
  var COLLS = ['progress', 'a', 'daily', 'rv', 'quiz', 'qr', 'q', 'notes'];
  function pickImport() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () { if (inp.files[0]) importFile(inp.files[0]).catch(function (err) { toast('Import failed: ' + (err && err.message || err)); }); };
    inp.click();
  }
  function importFile(file) {
    return file.text().then(function (txt) {
      var exp = JSON.parse(txt);
      if (!exp || exp.format !== 'gcse-spec-tracker-export' || !exp.collections) throw new Error('That is not a tracker export file.');
      var rows = [];
      Object.keys(exp.collections).forEach(function (c) {
        if (COLLS.indexOf(c) < 0) return;
        var docs = exp.collections[c] || {};
        Object.keys(docs).forEach(function (id) { rows.push([c + '/' + id, docs[id]]); });
      });
      if (!rows.length) throw new Error('The file has nothing to import.');
      if (!confirm('Import ' + rows.length + ' saved items into ' + (user.email || 'this account') + '? Anything with the same name is replaced.')) return;
      toast('Importing ' + rows.length + ' items...');
      return save(rows)
        .then(function () { return remove('meta/applied'); }) // re-apply repo updates on top
        .then(function () { location.reload(); });
    });
  }
  function backup() {
    var out = { format: 'gcse-spec-tracker-export', version: 1, exported: new Date().toISOString(), collections: {} };
    COLLS.forEach(function (c) { out.collections[c] = {}; });
    store.forEach(function (v, k) { var c = k.split('/')[0]; if (out.collections[c]) out.collections[c][k.slice(c.length + 1)] = v; });
    var blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'gcse-tracker-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  /* ---------- the db object the tracker expects ---------- */
  var db = {
    doc: function (path) {
      return {
        get: function () {
          if (path.indexOf('notes/') === 0) {
            var pid = path.slice(6);
            return fetchJSON('data/notes/' + encodeURIComponent(pid) + '.json').then(function (n) {
              if (n) return { id: pid, exists: true, data: function () { return n; }, metadata: {} };
              return docSnap(path);
            });
          }
          return Promise.resolve(docSnap(path));
        },
        set: function (data) { return save([[path, data]]); },
        onSnapshot: function (cb) { setTimeout(function () { cb(docSnap(path)); }, 0); return on(docL, path, cb); }
      };
    },
    collection: function (name) {
      return {
        onSnapshot: function (cb) {
          if (name !== 'q') { setTimeout(function () { cb(colSnap(name)); }, 0); return on(colL, name, cb); }
          // questions: the repo's question bank plus anything saved to this account
          var wrapped = function () { bank.then(function (b) { cb(colSnap('q', b)); }); };
          wrapped();
          return on(colL, 'q', wrapped);
        }
      };
    }
  };

  /* ---------- AI writing and marking, through the Worker ---------- */
  var sampler = {
    json: function (prompt, opts) {
      if (!user) { nudge(); return Promise.reject({ code: 'signin' }); }
      return sb.auth.getSession().then(function (r) {
        var tok = r && r.data && r.data.session && r.data.session.access_token;
        if (!tok) { nudge(); throw { code: 'signin' }; }
        return fetch(CFG.markingUrl.replace(/\/+$/, '') + '/json', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok },
          body: JSON.stringify({ prompt: prompt, tier: (opts && opts.modelTier) || '' })
        });
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok || !j || j.result === undefined) {
            var msg = (j && j.error) || ('HTTP ' + r.status);
            toast('Marking server: ' + msg);
            throw { code: 'marking', message: msg };
          }
          return j.result;
        });
      });
    }
  };

  window.claude = {
    use: function (name) {
      if (name === 'db') return dbReady ? signedIn.then(function () { return db; }) : Promise.resolve(null);
      if (name === 'sample') return Promise.resolve(dbReady && markReady ? sampler : null);
      return Promise.resolve(null); // 'permissions' and anything else: not needed here
    }
  };

  /* ---------- start ---------- */
  if (!dbReady) { bar('setup'); return; }
  import(SUPABASE_JS)
    .then(function (m) {
      sb = m.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
      });
      sb.auth.onAuthStateChange(function (event, session) {
        var u = session ? session.user : null;
        var was = user ? user.id : null, now = u ? u.id : null;
        if (!first && was === now) return;                       // token refreshes etc.
        if (!first && was !== now) { location.reload(); return; } // switching accounts: start clean
        first = false; user = u;
        if (!u) { bar('out'); return; }
        // This browser's offline copy belongs to whoever signed in last; never hand it to someone else.
        var last = null; try { last = localStorage.getItem(LAST_UID); } catch (e) {}
        try { localStorage.setItem(LAST_UID, u.id); } catch (e) {}
        if (last && last !== u.id) { clearLocal(); location.reload(); return; }
        if (/access_token=|error_description=/.test(location.hash)) history.replaceState(null, '', back());
        bar('in');
        setTimeout(function () {   // let Supabase finish its own sign-in work before querying
          loadAll()
            .then(applyUpdates)
            .catch(function (e) { console.error(e); note('Could not load your saved data: ' + (e && e.message || e) + '. Has supabase/setup.sql been run?'); })
            .then(function () { resolveSignedIn(u); });
        }, 0);
      });
    })
    .catch(function (e) {
      console.error(e);
      note('Could not load Supabase. Check your connection and the settings in supabase-config.js.');
    });
})();
