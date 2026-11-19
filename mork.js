/* Mørketid teletext: clock, today's sun path over Oslo in teletext pixels, sub-pages with coloured keys,
   and copy buttons on prompts. Works without JS too: then every sub-page is shown in sequence. */
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

  // Today as one strip at teletext mosaic resolution: 80 x 6 pixels (2 x 3 per character cell, 2 rows).
  // Columns are 18 minutes. Rows 0-1 hold the "now" marker (a small downward triangle), row 2 is a gap,
  // rows 3-5 are the strip: yellow while the sun is up, red in civil twilight, blue in nautical twilight.
  var COLS = 80, H = 6, STEP = 18, NS = 'http://www.w3.org/2000/svg';
  function rect(x, y, w, h, cls) {
    var r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('class', cls);
    return r;
  }
  function hm(min) { return pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60); }
  function sky() {
    var host = $('sky');
    if (!host) return;
    var now = new Date(Math.floor(Date.now() / 1000) * 1000), o = oslo(now), start = now.getTime() - o.secs * 1000;
    var rise = null, set = null, prev = alt(start);
    for (var m = 1; m < 1440; m++) {
      var a = alt(start + m * 60000);
      if (prev <= -0.833 && a > -0.833) rise = m;
      if (prev > -0.833 && a <= -0.833) set = m;
      prev = a;
    }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + COLS + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('shape-rendering', 'crispEdges');
    for (var c = 0; c < COLS; c++) {
      var a2 = alt(start + (c * STEP + STEP / 2) * 60000);
      var cls = a2 > -0.833 ? 'day' : a2 > -6 ? 'civ' : a2 > -12 ? 'nau' : null;
      if (cls) svg.appendChild(rect(c, 3, 1, 3, cls));
    }
    var nc = Math.max(0, Math.min(COLS - 1, Math.floor(o.secs / 60 / STEP)));
    svg.appendChild(rect(Math.max(0, nc - 1), 0, nc === 0 || nc === COLS - 1 ? 2 : 3, 1, 'mk'));
    svg.appendChild(rect(nc, 1, 1, 1, 'mk'));
    host.replaceChildren(svg);

    if ($('opp')) $('opp').textContent = 'OPP ' + (rise != null ? hm(rise) : '--:--');
    if ($('ned')) $('ned').textContent = 'NED ' + (set != null ? hm(set) : '--:--');
    if ($('lys') && rise != null && set != null) {
      $('lys').textContent = Math.floor((set - rise) / 60) + 'T ' + ((set - rise) % 60) + 'M LYS';
    }
  }

  function tick() {
    var o = oslo(new Date());
    if ($('klokke')) $('klokke').textContent = o.time;
    if ($('dato')) $('dato').textContent = o.date;
  }
  sky(); tick();
  setInterval(tick, 1000);
  setInterval(sky, 60000);

  // Sub-pages: each <section class="sub" data-key="..."> gets a coloured key (red, green, yellow, cyan).
  var subs = Array.prototype.slice.call(document.querySelectorAll('.sub'));
  var nav = document.querySelector('.keys');
  if (subs.length > 1 && nav) {
    document.documentElement.classList.add('paged');
    var keys = subs.map(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span></span>';
      b.firstChild.textContent = s.getAttribute('data-key');
      b.addEventListener('click', function () { show(i + 1, true); });
      nav.appendChild(b);
      return b;
    });
    var show = function (n, push) {
      subs.forEach(function (s, i) { s.classList.toggle('on', i === n - 1); });
      keys.forEach(function (k, i) { k.setAttribute('aria-current', i === n - 1 ? 'page' : 'false'); });
      if ($('subno')) $('subno').textContent = n + '/' + subs.length;
      if (push && history.replaceState) history.replaceState(null, '', '#' + n);
      window.scrollTo(0, 0);
    };
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= subs.length) show(n, true);
    });
    window.addEventListener('hashchange', function () {
      var h = parseInt((location.hash || '').slice(1), 10);
      if (h >= 1 && h <= subs.length) show(h, false);
    });
    var start = parseInt((location.hash || '').slice(1), 10);
    show(start >= 1 && start <= subs.length ? start : 1, false);
  } else if ($('subno')) {
    $('subno').textContent = '1/1';
  }

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
    if (kind === 'kw-dato') {                              // "84 0110", "83,9 kW 1.10.2026" -> "84-0110"
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
      say('FOR MANGE FORSØK. VENT ' + Math.floor(s / 60) + ':' + pad(s % 60), 'r');
      setTimeout(showLock, 1000);
    }
    showLock();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (locked()) return showLock();
      var k = norm(kind, input.value);
      if (!k) return say('SKRIV SVARET SOM VIST', 'r');
      if (!(window.crypto && crypto.subtle)) return say('SIDEN MÅ ÅPNES MED HTTPS', 'r');
      say('SØKER ...', 'c');
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + '|' + stage + '|' + k)).then(function (buf) {
        var url = ROOT + 'r/' + hex(buf).slice(0, 12) + '/';
        return fetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
          if (r.ok) { say('SIDEN FUNNET', 'g'); location.href = url; return; }
          var l = store.get(LOCK) || { fails: 0 };
          l.fails = (l.fails || 0) + 1;
          if (l.fails >= 3) { l = { fails: 0, until: Date.now() + 120000 }; store.set(LOCK, l); return showLock(); }
          store.set(LOCK, l);
          say('SIDEN FINNES IKKE', 'r');
        });
      }).catch(function () { say('INGEN FORBINDELSE. PRØV IGJEN.', 'r'); });
    });
  });

  // ---- When was this stage first opened? Shown on the page, written on the bingo card. ----
  var opened = null, apnet = $('apnet');
  if (apnet) {
    var sk = 'apnet-' + apnet.getAttribute('data-stage');
    opened = store.get(sk);
    if (!opened) { opened = Date.now(); store.set(sk, opened); }
    apnet.textContent = oslo(new Date(opened)).time.slice(0, 5);
  }

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

  // Copy buttons on suggested prompts.
  Array.prototype.forEach.call(document.querySelectorAll('.prompt'), function (p) {
    var text = p.textContent.trim();
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'copy'; b.textContent = '[KOPIER]';
    b.addEventListener('click', function () {
      if (!navigator.clipboard || !window.isSecureContext) return;
      navigator.clipboard.writeText(text).then(function () {
        b.textContent = '[KOPIERT]';
        setTimeout(function () { b.textContent = '[KOPIER]'; }, 1400);
      }, function () {});
    });
    p.appendChild(document.createTextNode(' '));
    p.appendChild(b);
  });

  if (window.console && console.log) {
    console.log('%cP911 MØRKETID', 'font: 700 16px monospace; color: #ff0; background: #00f; padding: 2px 6px');
    console.log('Du leter. Bra. Men svaret står ikke i kildekoden til denne siden.');
  }
})();
