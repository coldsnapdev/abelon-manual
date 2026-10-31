/* Abelon combat guides: stat cards are filled from bestiary.json, the single
   source of truth for every NPC and creature. A guide card only carries its
   encounter-specific notes (tag line, priority, tactics) plus
   data-entry="<bestiary id>"; the stats, actions and the Forge JSON that
   "Copy Forge JSON" puts on the clipboard all come from the bestiary. */
(function () {
  var P = 'com.battle-system.forge/';
  var bestiary = {};

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function crText(c) { return c == 0.125 ? '1/8' : c == 0.25 ? '1/4' : c == 0.5 ? '1/2' : String(c); }
  function rich(t) { return esc(t).replace(/\[([^\]]+)\]/g, '<b>$1</b>'); }

  function category(name, list) {
    if (/^tactics/i.test(name)) return 'tactics';
    if (list === 'Z034' || /^trait:|\(trait\)/i.test(name)) return 'trait';
    if (list === 'Z036' || /^bonus action:|\(bonus action\)/i.test(name)) return 'bonus';
    if (list === 'Z037' || /^reaction:|\(reaction\)/i.test(name)) return 'reaction';
    if (list === 'Z038' || /legendary/i.test(name)) return 'legendary';
    return 'action';
  }
  function title(name) {
    return name.replace(/^(trait|bonus action|reaction|legendary( action)?):\s*/i, '').replace(/\s*\((trait|bonus action|reaction)\)/gi, '').trim();
  }

  var DAMAGE = /^(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)$/i;

  function row(a) {
    var hit = a.description.match(/\[1d20\s*([+-]\s*\d+)\]/);
    if (!hit) return '<div class="abl"><span class="abl-name">' + esc(title(a.name)) + ' — </span>' + rich(a.description) + '</div>';
    var dmg = [], re = /\[([^\]]+)\]\s*([A-Za-z]+)?/g, m;
    while ((m = re.exec(a.description))) {
      if (/^1d20/i.test(m[1].replace(/\s+/g, ''))) continue;
      if (m[2] && DAMAGE.test(m[2])) dmg.push('<span class="atk-dmg">' + esc(m[1]) + '</span> ' + esc(m[2].toLowerCase()));
    }
    return '<div class="atk"><span class="atk-name">' + esc(title(a.name)) + ' — </span><span class="atk-hit">' +
      esc(hit[1].replace(/\s+/g, '')) + '</span>' + (dmg.length ? ' / ' + dmg.join(' + ') : '') + '</div>' +
      '<div class="abl" style="opacity:.85">' + rich(a.description) + '</div>';
  }

  function block(f, notes) {
    notes = notes || {};
    var groups = { action: [], bonus: [], reaction: [], legendary: [], trait: [] };
    ['Z034', 'Z035', 'Z036', 'Z037', 'Z038'].forEach(function (k) {
      (f[P + k] || []).forEach(function (a) { var c = category(a.name, k); if (groups[c]) groups[c].push(a); });
    });
    var out = '';
    [['action', 'Each turn'], ['bonus', 'Bonus action'], ['reaction', 'Reaction'], ['legendary', 'Legendary actions'], ['trait', 'Abilities']].forEach(function (g) {
      if (groups[g[0]].length) out += '<div class="section"><span class="section-label">' + g[1] + '</span>' + groups[g[0]].map(function (a) { return row(a) + (notes[a.name] ? '<div class="abl" style="font-style:italic;opacity:.8">DM: ' + esc(notes[a.name]) + '</div>' : ''); }).join('') + '</div>';
    });
    var def = [['Z030', 'Vulnerable'], ['Z031', 'Resists'], ['Z032', 'Immune'], ['Z033', 'Condition immunities'], ['Z013', 'Senses'], ['Z041', 'Notes']]
      .filter(function (x) { return String(f[P + x[0]] || '').trim(); })
      .map(function (x) { return '<div class="abl"><span class="abl-name">' + x[1] + ' — </span>' + esc(f[P + x[0]]) + '</div>'; }).join('');
    if (def) out += '<div class="section"><span class="section-label">Defences and senses</span>' + def + '</div>';
    return out;
  }

  function bestHit(f) {
    var best = null;
    ['Z035', 'Z036'].forEach(function (k) {
      (f[P + k] || []).forEach(function (a) {
        var m = a.description.match(/\[1d20\s*([+-])\s*(\d+)\]/);
        if (m) { var v = (m[1] === '-' ? -1 : 1) * +m[2]; if (best === null || v > best) best = v; }
      });
    });
    return best === null ? '—' : (best >= 0 ? '+' : '') + best;
  }

  function fill(card) {
    var e = bestiary[card.getAttribute('data-entry')];
    if (!e) {
      var b = card.querySelector('.bestiary-block') || card.querySelector('.bestiary-line');
      if (b) b.innerHTML = '<div class="dm-note">No bestiary entry "' + esc(card.getAttribute('data-entry')) + '".</div>';
      return;
    }
    var f = e.forge;
    var name = card.querySelector('.card-name'); if (name) name.textContent = e.name;
    var badge = card.querySelector('.cr-badge'); if (badge) badge.textContent = 'CR ' + crText(e.cr);
    var tag = card.querySelector('.card-tag[data-cr]'); if (tag) tag.textContent = 'CR ' + crText(e.cr) + (tag.getAttribute('data-cr') ? ' — ' + tag.getAttribute('data-cr') : '');
    var qs = card.querySelector('.quick-stats');
    if (qs) qs.innerHTML = '<div class="qs"><span>AC</span>' + esc(f[P + 'Z007']) + '</div><div class="qs"><span>HP</span>' + esc(f[P + 'Z005']) +
      '</div><div class="qs"><span>Atk</span>' + bestHit(f) + '</div><div class="qs"><span>Spd</span>' + esc(f[P + 'Z008']) + '</div>';
    var blk = card.querySelector('.bestiary-block'); if (blk) blk.innerHTML = block(f, e.notes);
    var line = card.querySelector('.bestiary-line'); if (line) line.innerHTML = summary(e);
  }

  // One-paragraph version for the NPC cards on encounter pages.
  function summary(e) {
    var f = e.forge, acts = [], tactics = '';
    ['Z035', 'Z036', 'Z037', 'Z038'].forEach(function (k) {
      (f[P + k] || []).forEach(function (a) {
        var c = category(a.name, k);
        if (c === 'tactics') { tactics = a.description; return; }
        if (c === 'trait' || /^multiattack$/i.test(a.name)) return;
        var hit = a.description.match(/\[1d20\s*([+-]\s*\d+)\]/), dmg = [], re = /\[([^\]]+)\]\s*([A-Za-z]+)?/g, m;
        while ((m = re.exec(a.description))) if (m[2] && DAMAGE.test(m[2])) dmg.push(m[1] + ' ' + m[2].toLowerCase());
        acts.push('<b>' + esc(title(a.name)) + '</b>' + (hit ? ' ' + esc(hit[1].replace(/\s+/g, '')) : '') + (hit && dmg.length ? ' (' + esc(dmg.join(' + ')) + ')' : ''));
      });
    });
    return '<span style="display:block;margin-top:6px;padding:6px 9px;border-left:2px solid currentColor;opacity:.9">' +
      '<b>Bestiary</b>: CR ' + crText(e.cr) + ' · AC ' + esc(f[P + 'Z007']) + ' · HP ' + esc(f[P + 'Z005']) + ' · Speed ' + esc(f[P + 'Z008']) + ' ft. ' +
      acts.join('; ') + (acts.length ? '. ' : '') + (tactics ? '<i>' + esc(tactics) + '</i> ' : '') +
      '<a href="Abelon_Bestiary.html#' + encodeURIComponent(e.id) + '">Full stat block</a></span>';
  }

  window.copyForge = function (btn) {
    var card = btn.closest('[data-entry]'), e = card && bestiary[card.getAttribute('data-entry')];
    if (!e) { btn.textContent = 'Not in bestiary'; return; }
    navigator.clipboard.writeText(JSON.stringify(e.forge)).then(function () {
      btn.textContent = 'Copied!'; btn.classList.add('copied');
      setTimeout(function () { btn.textContent = 'Copy Forge JSON'; btn.classList.remove('copied'); }, 2000);
    });
  };

  var style = document.createElement('style');
  style.textContent = '.bestiary-block .section{margin-top:12px}.bestiary-block .section:first-child{margin-top:4px}';
  document.head.appendChild(style);

  function run() {
    fetch('bestiary.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      j.entries.forEach(function (e) { bestiary[e.id] = e; });
      document.querySelectorAll('[data-entry]').forEach(fill);
    }).catch(function (err) {
      document.querySelectorAll('.bestiary-block, .bestiary-line').forEach(function (b) {
        b.innerHTML = '<div class="dm-note">Couldn\'t load the bestiary (' + esc(err.message) + '). Open the Bestiary page for stats.</div>';
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
