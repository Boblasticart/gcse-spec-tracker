/* GCSE Spec Tracker: GitHub Pages adapter.
 *
 * The tracker code in index.html is the same code as the claude.ai version. On claude.ai it calls
 * claude.use('db') for saving and claude.use('sample') for AI marking. This file provides those
 * same two things here, using:
 *   - Firebase Authentication (Google sign-in) and Cloud Firestore for each person's own data
 *   - a Cloudflare Worker (worker/worker.js) that holds the Gemini key and does the AI work
 * plus repo files for shared content: data/notes/*.json, data/questions.json, data/updates.json.
 *
 * Every Firestore document is stored as {j: "<JSON text>", u: <time>} so any shape the tracker
 * saves (including the nested arrays in note tables, which Firestore can't store natively) works.
 */
(function () {
  'use strict';
  var CFG = window.TRACKER_CONFIG || {};
  var FB = 'https://www.gstatic.com/firebasejs/12.19.0/';
  var isSet = function (v) { return typeof v === 'string' && v && !/^PASTE/.test(v); };
  var fbReady = !!(CFG.firebase && isSet(CFG.firebase.apiKey) && isSet(CFG.firebase.projectId));
  var markReady = isSet(CFG.markingUrl);

  var F = null, auth = null, fs = null, user = null, first = true;
  var resolveSignedIn;
  var signedIn = new Promise(function (r) { resolveSignedIn = r; });

  /* ---------- small helpers ---------- */
  var LAST_UID = 'gcse-tracker-last-uid';
  function clearLocal() { try { localStorage.removeItem('gcse-spec-tracker-v2'); localStorage.removeItem('gcse-papers-v1'); } catch (e) {} }
  function wrap(data) { return { j: JSON.stringify(data === undefined ? null : data), u: Date.now() }; }
  function unwrap(raw) {
    if (!raw) return undefined;
    if (typeof raw.j === 'string') { try { return JSON.parse(raw.j); } catch (e) { return undefined; } }
    return raw;
  }
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
  function dref(path) { return F.doc.apply(null, [fs, 'users', user.uid].concat(path.split('/'))); }
  function cref(name) { return F.collection(fs, 'users', user.uid, name); }
  function snapOf(s) {
    var d = s.exists() ? unwrap(s.data()) : undefined;
    return { id: s.id, exists: s.exists(), data: function () { return d; }, metadata: s.metadata };
  }

  /* ---------- account bar (lives in the page header) ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.acct{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:.8rem;color:var(--muted)}' +
    '.acct .chip{font-size:.8rem;padding:4px 10px}' +
    '.acct .who{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
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
      note('Setup needed: add your Firebase settings and marking server address to firebase-config.js (see the README). Until then progress saves on this device only.');
      if (sync) sync.textContent = 'Saved on this device only';
    } else if (state === 'out') {
      barEl.innerHTML = '<button class="chip" data-acct="in">Sign in with Google</button>';
      if (sync) sync.textContent = 'Sign in to save to your account';
    } else if (state === 'in') {
      barEl.innerHTML = '<span class="who" title="Signed in">' + esc(user.email || user.displayName || 'Signed in') + '</span>' +
        '<button class="chip" data-acct="import">Import</button>' +
        '<button class="chip" data-acct="backup">Back up</button>' +
        '<button class="chip" data-acct="out">Sign out</button>';
      if (!markReady) note('AI marking is not set up yet: add your Cloudflare Worker address as markingUrl in firebase-config.js (see the README).');
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
    var b = barEl && barEl.querySelector('[data-acct="in"]');
    if (b) { b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); b.scrollIntoView({ block: 'nearest' }); }
    toast('Sign in with Google first, then try again.');
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-acct]'); if (!b) return;
    var a = b.getAttribute('data-acct');
    if (a === 'in') signIn();
    else if (a === 'out') { clearLocal(); F.signOut(auth); }
    else if (a === 'import') pickImport();
    else if (a === 'backup') backup().catch(function (err) { toast('Back up failed: ' + (err && err.message || err)); });
  });

  function signIn() {
    if (!F) return;
    var p = new F.GoogleAuthProvider();
    F.signInWithPopup(auth, p).catch(function (err) {
      var c = (err && err.code) || '';
      if (/popup-blocked|operation-not-supported/.test(c)) F.signInWithRedirect(auth, p);
      else if (!/popup-closed|cancelled-popup/.test(c)) toast('Sign-in failed: ' + (err.message || c));
    });
  }

  /* ---------- updates Claude pushes to the repo (data/updates.json) ----------
   * Each entry: {"id":"unique-id","sid":"phy","needsWork":["phy.4.0",...],"daily":{"2026-11-02-phy":{...}}}
   * Applied once per account. needsWork only sets points that are currently Not done. */
  function applyUpdates() {
    return fetchJSON('data/updates.json', true).then(function (ups) {
      if (!Array.isArray(ups) || !ups.length) return;
      var mref = dref('meta/applied');
      return F.getDoc(mref).then(function (ms) {
        var done = new Set(((ms.exists() && unwrap(ms.data())) || {}).ids || []);
        var todo = ups.filter(function (u) { return u && u.id && !done.has(u.id); });
        if (!todo.length) return;
        var chain = Promise.resolve();
        todo.forEach(function (u) {
          chain = chain.then(function () {
            var steps = [];
            if (u.sid && Array.isArray(u.needsWork) && u.needsWork.length) {
              var pref = dref('progress/' + u.sid);
              steps.push(F.getDoc(pref).then(function (ps) {
                var p = (ps.exists() && unwrap(ps.data())) || { s: {}, c: {}, m: {}, w: {}, v: 2 };
                p.s = p.s || {}; var changed = false;
                u.needsWork.forEach(function (pid) { if (!p.s[pid]) { p.s[pid] = 1; changed = true; } });
                return changed ? F.setDoc(pref, wrap(p)) : null;
              }));
            }
            Object.keys(u.daily || {}).forEach(function (id) {
              var r = dref('daily/' + id);
              steps.push(F.getDoc(r).then(function (s) { return s.exists() ? null : F.setDoc(r, wrap(u.daily[id])); }));
            });
            return Promise.all(steps).then(function () { done.add(u.id); });
          });
        });
        return chain.then(function () { return F.setDoc(mref, wrap({ ids: Array.from(done) })); });
      });
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
      var writes = [];
      Object.keys(exp.collections).forEach(function (c) {
        if (COLLS.indexOf(c) < 0) return;
        var docs = exp.collections[c] || {};
        Object.keys(docs).forEach(function (id) { writes.push([c + '/' + id, docs[id]]); });
      });
      if (!writes.length) throw new Error('The file has nothing to import.');
      if (!confirm('Import ' + writes.length + ' saved items into ' + (user.email || 'this account') + '? Anything with the same name is replaced.')) return;
      toast('Importing ' + writes.length + ' items...');
      var chain = Promise.resolve();
      for (var i = 0; i < writes.length; i += 400) (function (part) {
        chain = chain.then(function () {
          var b = F.writeBatch(fs);
          part.forEach(function (w) { b.set(dref(w[0]), wrap(w[1])); });
          return b.commit();
        });
      })(writes.slice(i, i + 400));
      return chain
        .then(function () { return F.deleteDoc(dref('meta/applied')); }) // re-apply repo updates on top
        .then(function () { location.reload(); });
    });
  }
  function backup() {
    var out = { format: 'gcse-spec-tracker-export', version: 1, exported: new Date().toISOString(), collections: {} };
    return Promise.all(COLLS.map(function (c) {
      return F.getDocs(cref(c)).then(function (sn) {
        var o = {}; sn.docs.forEach(function (d) { o[d.id] = unwrap(d.data()); }); out.collections[c] = o;
      });
    })).then(function () {
      var blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'gcse-tracker-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
  }

  /* ---------- the db object the tracker expects ---------- */
  function makeDb() {
    return {
      doc: function (path) {
        return {
          get: function () {
            if (path.indexOf('notes/') === 0) {
              var pid = path.slice(6);
              return fetchJSON('data/notes/' + encodeURIComponent(pid) + '.json').then(function (n) {
                if (n) return { id: pid, exists: true, data: function () { return n; }, metadata: {} };
                return F.getDoc(dref(path)).then(snapOf);
              });
            }
            return F.getDoc(dref(path)).then(snapOf);
          },
          set: function (data) { return F.setDoc(dref(path), wrap(data)); },
          onSnapshot: function (cb, err) {
            return F.onSnapshot(dref(path), function (s) { cb(snapOf(s)); }, err);
          }
        };
      },
      collection: function (name) {
        return {
          onSnapshot: function (cb, err) {
            var stop = null, dead = false;
            var mergeBank = name === 'q';
            bank.then(function (b) {
              if (dead) return;
              stop = F.onSnapshot(cref(name), function (sn) {
                var mine = {};
                sn.docs.forEach(function (d) { mine[d.id] = unwrap(d.data()); });
                var all = mergeBank ? Object.assign({}, b, mine) : mine;
                cb({ docs: Object.keys(all).map(function (id) { return { id: id, data: function () { return all[id]; } }; }) });
              }, err);
            });
            return function () { dead = true; if (stop) stop(); };
          }
        };
      }
    };
  }

  /* ---------- AI writing and marking, through the Worker ---------- */
  var sampler = {
    json: function (prompt, opts) {
      if (!user) { nudge(); return Promise.reject({ code: 'signin' }); }
      return user.getIdToken().then(function (tok) {
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
      if (name === 'db') return fbReady ? signedIn.then(makeDb) : Promise.resolve(null);
      if (name === 'sample') return Promise.resolve(fbReady && markReady ? sampler : null);
      return Promise.resolve(null); // 'permissions' and anything else: not needed here
    }
  };

  /* ---------- start ---------- */
  if (!fbReady) { bar('setup'); return; }
  Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')])
    .then(function (m) {
      F = Object.assign({}, m[1], m[2]);
      var app = m[0].initializeApp(CFG.firebase);
      auth = F.getAuth(app);
      fs = F.getFirestore(app);
      F.getRedirectResult(auth).catch(function () {});
      F.onAuthStateChanged(auth, function (u) {
        var was = user ? user.uid : null, now = u ? u.uid : null;
        if (!first && was !== now) { location.reload(); return; } // switching accounts: start clean
        first = false; user = u;
        if (!u) { bar('out'); return; }
        // This browser's offline copy belongs to whoever signed in last; never hand it to someone else.
        var last = null; try { last = localStorage.getItem(LAST_UID); } catch (e) {}
        try { localStorage.setItem(LAST_UID, u.uid); } catch (e) {}
        if (last && last !== u.uid) { clearLocal(); location.reload(); return; }
        bar('in');
        applyUpdates().catch(function (e) { console.warn('Could not apply updates.json', e); })
          .then(function () { resolveSignedIn(u); });
      });
    })
    .catch(function (e) {
      console.error(e);
      note('Could not load Firebase. Check your connection and the settings in firebase-config.js.');
    });
})();
