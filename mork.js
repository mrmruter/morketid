/* Mørketid: Oslo clock, the next bus on the info screen, today's sun in one sentence, self-service gates,
   remembered stages, the corrected delivery on stage 3, and copy buttons on prompts. The page works without JS;
   only the gates need it. */
(function () {
  'use strict';
  var LAT = 59.91, LON = 10.75, R = Math.PI / 180;
  // Site root, from where this script was loaded (works on the hidden stage pages too).
  var ROOT = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src).href : './';

  // Solar altitude in degrees (low-precision almanac formula; good to a fraction of a degree).
  function alt(ms) {
    var d = ms / 86400000 - 10957.5;
    var g = (357.529 + 0.98560028 * d) * R;
    var L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R;
    var e = (23.439 - 0.00000036 * d) * R;
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    var dec = Math.asin(Math.sin(e) * Math.sin(L));
    var ha = ((18.697374558 + 24.06570982441908 * d) % 24) * 15 * R + LON * R - ra;
    return Math.asin(Math.sin(LAT * R) * Math.sin(dec) + Math.cos(LAT * R) * Math.cos(dec) * Math.cos(ha)) / R;
  }

  var fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', hour: '2-digit',
                                             minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  } catch (err) { /* old browser: fall back to local time */ }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function oslo(now) {
    var p = {};
    if (fmt) fmt.formatToParts(now).forEach(function (x) { p[x.type] = x.value; });
    else p = { day: pad(now.getDate()), month: pad(now.getMonth() + 1), hour: pad(now.getHours()),
               minute: pad(now.getMinutes()), second: pad(now.getSeconds()) };
    return { secs: +p.hour * 3600 + +p.minute * 60 + +p.second,
             time: p.hour + ':' + p.minute + ':' + p.second, date: p.day + '.' + p.month };
  }
  function $(id) { return document.getElementById(id); }

  function hm(min) { return pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60); }

  // Today's sun over Oslo in one sentence.
  function sun() {
    var host = $('sol');
    if (!host) return;
    var now = new Date(), o = oslo(now), start = now.getTime() - o.secs * 1000, rise = null, set = null, prev = alt(start);
    for (var m = 1; m < 1440; m++) {
      var a = alt(start + m * 60000);
      if (prev <= -0.833 && a > -0.833) rise = m;
      if (prev > -0.833 && a <= -0.833) set = m;
      prev = a;
    }
    var nowM = Math.floor(o.secs / 60), s;
    if (rise == null || set == null) s = 'Sola står ikke opp over Oslo i dag.';
    else if (nowM < rise) s = 'Sola står opp over Oslo kl. ' + hm(rise) + ' og går ned kl. ' + hm(set) + '.';
    else if (nowM < set) s = 'Sola går ned over Oslo kl. ' + hm(set) + '. Det er ' + Math.floor((set - nowM) / 60) + ' t ' + ((set - nowM) % 60) + ' min igjen.';
    else s = 'Sola gikk ned over Oslo kl. ' + hm(set) + '. Det var lyst i ' + Math.floor((set - rise) / 60) + ' t ' + ((set - rise) % 60) + ' min i dag.';
    host.textContent = s;
  }

  function tick() {
    var o = oslo(new Date());
    if ($('klokke')) $('klokke').textContent = o.time.slice(0, 5);
    if ($('neste')) $('neste').textContent = oslo(new Date(Date.now() + 12 * 60000)).time.slice(0, 5);
  }
  sun(); tick();
  setInterval(tick, 15000);
  setInterval(sun, 60000);

  // ---- Gates: the answer is the key. The page hashes the answer and opens r/<hash>/ if it exists. ----
  var SALT = 'morketid-2026-12';                                   // filled in by tools/publish.py
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('morketid-' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('morketid-' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  function norm(kind, s) {
    if (kind === 'dato') {                                 // "0610", "6.10", "06/10/2026" -> "0610"
      var g = s.match(/\d+/g);
      if (!g) return '';
      if (g.length === 1) return g[0].length <= 4 ? ('000' + g[0]).slice(-4) : g[0].slice(0, 4);
      return ('0' + g[0]).slice(-2) + ('0' + g[1]).slice(-2);
    }
    if (kind === 'kw-dato') {                              // "84 3009", "83,9 kW 30.9.2026" -> "84-3009"
      var m = s.match(/^\D*(\d+(?:[.,]\d+)?)(.*)$/);
      if (!m) return '';
      var d = norm('dato', m[2]);
      return d ? Math.round(parseFloat(m[1].replace(',', '.'))) + '-' + d : '';
    }
    return s.trim().toUpperCase();
  }
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  Array.prototype.forEach.call(document.querySelectorAll('form.gate'), function (form) {
    var stage = form.getAttribute('data-gate'), kind = form.getAttribute('data-norm');
    var input = form.querySelector('input'), msg = form.querySelector('.msg'), btn = form.querySelector('button');
    var LOCK = 'laas-' + stage;
    function locked() {
      var l = store.get(LOCK);
      return l && l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0;
    }
    function say(text, cls) { msg.textContent = text; msg.className = 'msg ' + (cls || ''); }
    function showLock() {
      var s = locked();
      if (!s) { btn.disabled = false; return; }
      btn.disabled = true;
      say('For mange forsøk. Vent ' + Math.floor(s / 60) + ':' + pad(s % 60) + '.', 'r');
      setTimeout(showLock, 1000);
    }
    showLock();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (locked()) return showLock();
      var k = norm(kind, input.value);
      if (!k) return say('Skriv svaret slik det står over.', 'r');
      if (!(window.crypto && crypto.subtle)) return say('Siden må åpnes med https.', 'r');
      say('Sjekker …', 'c');
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + '|' + stage + '|' + k)).then(function (buf) {
        var url = ROOT + 'r/' + hex(buf).slice(0, 12) + '/';
        return fetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
          if (r.ok) { say('Riktig. Åpner neste etappe …', 'g'); location.href = url; return; }
          var l = store.get(LOCK) || { fails: 0 };
          l.fails = (l.fails || 0) + 1;
          if (l.fails >= 3) { l = { fails: 0, until: Date.now() + 120000 }; store.set(LOCK, l); return showLock(); }
          store.set(LOCK, l);
          say('Ingen etappe bak det svaret.', 'r');
        });
      }).catch(function () { say('Ingen forbindelse. Prøv igjen.', 'r'); });
    });
  });

  // ---- When was this stage first opened? Shown on the page, written on the bingo card. ----
  var opened = null, apnet = $('apnet');
  if (apnet) {
    var sk = 'apnet-' + apnet.getAttribute('data-stage');
    opened = store.get(sk);
    if (!opened) { opened = Date.now(); store.set(sk, opened); }
    apnet.textContent = oslo(new Date(opened)).time.slice(0, 5);
    store.set('side-' + apnet.getAttribute('data-stage'),
              { url: location.origin + location.pathname, name: apnet.getAttribute('data-name') || '' });
  }

  // ---- The stage list remembers stages you have opened, so a closed tab is not a lost stage. ----
  // Names of locked stages are never in this page; they come from this browser's own visits.
  Array.prototype.forEach.call(document.querySelectorAll('.tr li[data-stage]'), function (li) {
    var k = parseInt(li.getAttribute('data-stage'), 10);
    var next = store.get('side-' + (k + 1));
    var me = k === 1 ? (next ? { url: ROOT, name: 'Hvorfor står bussene?' } : null) : store.get('side-' + k);
    if (!me || !me.url) return;
    var first = li.firstElementChild, last = li.lastElementChild;
    first.textContent = k + ' · ';
    var a = document.createElement('a');
    a.href = me.url; a.textContent = me.name || 'Etappe ' + k;
    first.appendChild(a);
    last.textContent = next ? 'bestått' : 'åpen';
    li.className = next ? 'done' : 'open';
  });

  // ---- The corrected delivery arrives by itself some minutes after stage 3 was first opened. ----
  var rettet = $('rettet');
  if (rettet && rettet.getAttribute('data-href')) {
    var due = (opened || Date.now()) + (parseFloat(rettet.getAttribute('data-min')) || 8) * 60000;
    var reveal = function () {
      if (Date.now() < due) return setTimeout(reveal, 5000);
      var a = rettet.querySelector('a');
      a.href = atob(rettet.getAttribute('data-href'));
      rettet.hidden = false;
    };
    reveal();
  }

  // A link to index.html#regler (or any fold-out) opens that fold-out.
  function openFold() {
    var el = location.hash && document.getElementById(location.hash.slice(1));
    if (el && el.tagName === 'DETAILS') { el.open = true; el.scrollIntoView(); }
  }
  openFold();
  window.addEventListener('hashchange', openFold);

  // Copy buttons on suggested prompts.
  Array.prototype.forEach.call(document.querySelectorAll('.prompt'), function (p) {
    var text = p.textContent.trim();
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'copy'; b.textContent = 'Kopier';
    b.addEventListener('click', function () {
      if (!navigator.clipboard || !window.isSecureContext) return;
      navigator.clipboard.writeText(text).then(function () {
        b.textContent = 'Kopiert';
        setTimeout(function () { b.textContent = 'Kopier'; }, 1400);
      }, function () {});
    });
    p.appendChild(document.createTextNode(' '));
    p.appendChild(b);
  });

  if (window.console && console.log) {
    console.log('%c# MØRKETID', 'font: 700 15px monospace; color: #ffb627; background: #0e0e0f; padding: 3px 8px');
    console.log('Du leter. Bra. Men svaret står ikke i kildekoden til denne siden.');
  }
})();
