/* Abelon Manual sync: mirrors the manual's tracker data (Where we are now,
   prep steps, payments, encounter status tags) into state.json in the
   coldsnapdev/abelon-manual repo, so every device shares it.
   Pages keep using localStorage as before; this script keeps it in step
   with the repo. Only the GitHub token stays local to each device. */
(function () {
  var REPO = 'coldsnapdev/abelon-manual', BRANCH = 'main', PATH = 'state.json';
  var API = 'https://api.github.com/repos/' + REPO + '/contents/' + PATH;
  var TOKEN_KEY = 'abelonSyncToken', REV_KEY = 'abelonSyncRev', DIRTY_KEY = 'abelonSyncDirty';

  function synced(k) {
    return k === 'abelonCurrentState' || k === 'abelonPrepSteps' || k === 'abelonPaymentAdhoc' ||
      k.indexOf('abelonPayment:') === 0 || k.indexOf('abelonStatus:') === 0;
  }

  var ls = window.localStorage, origSet, origRemove;
  try { origSet = ls.setItem.bind(ls); origRemove = ls.removeItem.bind(ls); } catch (e) { return; }
  function get(k) { try { return ls.getItem(k); } catch (e) { return null; } }
  function token() { return get(TOKEN_KEY); }
  function dirty() { try { return JSON.parse(get(DIRTY_KEY) || '[]'); } catch (e) { return []; } }
  function markDirty(k) { var d = dirty(); if (d.indexOf(k) < 0) { d.push(k); origSet(DIRTY_KEY, JSON.stringify(d)); } }

  function localData() {
    var out = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (synced(k)) out[k] = ls.getItem(k); }
    return out;
  }
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64dec(s) { return decodeURIComponent(escape(atob(s.replace(/\n/g, '')))); }

  // ---- status badge ----
  var badge, latest = null, waiting = false;
  function show(text, tone) {
    latest = [text, tone];
    if (!document.body) {
      if (!waiting) { waiting = true; document.addEventListener('DOMContentLoaded', function () { show(latest[0], latest[1]); }); }
      return;
    }
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10000;font:12px "Crimson Pro",Georgia,serif;' +
        'padding:5px 10px;border-radius:14px;border:1px solid #c4a882;background:#241f16;color:#e8d9bc;cursor:pointer;opacity:.85;';
      badge.title = 'Abelon sync — click to connect or change the GitHub token';
      badge.onclick = connect;
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.borderColor = tone === 'bad' ? '#c0614a' : tone === 'good' ? '#5DCAA5' : '#c4a882';
  }

  function connect() {
    var t = window.prompt('Paste your GitHub token (fine-grained, abelon-manual repo, Contents: read and write). Leave empty to disconnect this device.', token() || '');
    if (t === null) return;
    t = t.trim();
    if (t) origSet(TOKEN_KEY, t); else origRemove(TOKEN_KEY);
    location.reload();
  }

  function headers() {
    var h = { 'Accept': 'application/vnd.github+json' };
    if (token()) h.Authorization = 'Bearer ' + token();
    return h;
  }

  function fetchRemote() {
    return fetch(API + '?ref=' + BRANCH + '&t=' + Date.now(), { headers: headers(), cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return { exists: false };
      if (!r.ok) throw new Error('read ' + r.status);
      return r.json().then(function (j) {
        var body = JSON.parse(b64dec(j.content));
        return { exists: true, sha: j.sha, rev: body.rev || 0, data: body.data || {} };
      });
    });
  }

  function apply(data) {
    // replace all synced keys with the repo's copy
    var drop = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (synced(k) && !(k in data)) drop.push(k); }
    drop.forEach(function (k) { origRemove(k); });
    Object.keys(data).forEach(function (k) { if (synced(k)) origSet(k, data[k]); });
  }

  var pushing = false, again = false, timer = null;
  function push() {
    if (!token()) { show('Saved on this device only — connect', 'bad'); return; }
    if (pushing) { again = true; return; }
    pushing = true; show('Saving…');
    fetchRemote().then(function (remote) {
      // start from the repo's copy (keeps changes made elsewhere), overlay what changed here;
      // if the repo has no file yet, this device's data seeds it
      var mine = remote.exists ? Object.assign({}, remote.data) : localData();
      dirty().forEach(function (k) { var v = get(k); if (v === null) delete mine[k]; else mine[k] = v; });
      var rev = Date.now();
      var body = { message: 'Manual tracker update', branch: BRANCH,
        content: b64enc(JSON.stringify({ rev: rev, data: mine }, null, 1) + '\n') };
      if (remote.sha) body.sha = remote.sha;
      return fetch(API, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()), body: JSON.stringify(body) })
        .then(function (r) {
          if (r.status === 409 || r.status === 422) { again = true; return; }
          if (!r.ok) throw new Error('save ' + r.status);
          apply(mine);
          origSet(REV_KEY, String(rev)); origRemove(DIRTY_KEY);
          show('Synced ✓', 'good');
        });
    }).catch(function (e) {
      show('Not saved to GitHub (' + e.message + ') — click', 'bad');
    }).then(function () {
      pushing = false;
      if (again) { again = false; schedule(); }
    });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(push, 1200); }

  // watch the pages' own writes
  ls.setItem = function (k, v) { origSet(k, v); if (synced(k)) { markDirty(k); schedule(); } };
  ls.removeItem = function (k) { origRemove(k); if (synced(k)) { markDirty(k); schedule(); } };

  // ---- on load: pull newer data from the repo ----
  show(token() ? 'Checking…' : 'Saved on this device only — connect', token() ? null : 'bad');
  fetchRemote().then(function (remote) {
    var localRev = +(get(REV_KEY) || 0), d = dirty();
    if (!remote.exists) {
      // first connection: this device's data seeds the repo
      if (token()) { Object.keys(localData()).forEach(markDirty); push(); }
      return;
    }
    if (remote.rev > localRev) {
      var merged = remote.data;
      d.forEach(function (k) { var v = get(k); if (v === null) delete merged[k]; else merged[k] = v; });
      apply(merged);
      origSet(REV_KEY, String(remote.rev));
      // re-render with the repo's data; next load's revs match (so no loop) and
      // any unsaved local edits, kept in the merge, are pushed then
      location.reload();
      return;
    }
    if (d.length) push(); else if (token()) show('Synced ✓', 'good');
  }).catch(function (e) {
    show('Offline — saved on this device (' + e.message + ')', 'bad');
  });
})();
