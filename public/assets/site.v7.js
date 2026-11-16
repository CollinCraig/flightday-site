/* Flight Day site: theme toggle, scroll reveal, feature clips, the hero countdown and docs search.
 * Loaded in <head> so the saved theme applies before first paint. Every part is optional: without this script the
 * page is complete (system theme, clips with native controls, nothing hidden). Reduced motion turns off the reveal,
 * keeps clips on their poster until a tap, and slows the countdown to once a minute. */
(function () {
  var KEY = 'fd-theme', root = document.documentElement;
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } }
  var saved = read();
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  var rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function calm() { return !!(rm && rm.matches); }
  var hasIO = 'IntersectionObserver' in window;
  // The reveal hides content, so it is armed only here, where it will also be undone.
  if (hasIO && !calm()) root.classList.add('fd-motion');

  function current() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function label(btn) {
    var next = current() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.setAttribute('title', 'Switch to ' + next + ' theme');
  }
  function theme() {
    var btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    btn.hidden = false;
    label(btn);
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      write(next);
      label(btn);
    });
  }

  function reveal() {
    var items = [];
    document.querySelectorAll('.rv-kids').forEach(function (g) { for (var i = 0; i < g.children.length; i++) { g.children[i].classList.add('rv'); } });
    document.querySelectorAll('.rv').forEach(function (el) { items.push(el); });
    if (!root.classList.contains('fd-motion')) { items.forEach(function (el) { el.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });   // any edge in view counts, so even a very tall block reveals
    items.forEach(function (el) { io.observe(el); });
    function all() { items.forEach(function (el) { el.classList.add('in'); }); io.disconnect(); }
    if (rm && rm.addEventListener) rm.addEventListener('change', function () { if (calm()) all(); });
    window.addEventListener('beforeprint', all);
  }

  function clips() {
    var list = document.querySelectorAll('.clip');
    if (!list.length) return;
    var io = hasIO ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { var c = e.target.fdClip; if (c) { c.visible = e.isIntersecting; c.sync(); } });
    }, { threshold: 0.35 }) : null;
    list.forEach(function (fig) {
      var v = fig.querySelector('video'), btn = fig.querySelector('.clip-btn');
      if (!v || !btn) return;
      var name = btn.getAttribute('data-name') || 'clip';
      var c = { visible: !io, held: calm() };
      function show(playing) {
        fig.classList.toggle('paused', !playing);
        btn.setAttribute('aria-label', (playing ? 'Pause' : 'Play') + ' video: ' + name);
        btn.setAttribute('aria-pressed', playing ? 'false' : 'true');
      }
      c.sync = function () {
        if (c.visible && !c.held) {
          var p = v.play();
          if (p && p.catch) p.catch(function () { c.held = true; show(false); });
        } else if (!v.paused) v.pause();
      };
      v.removeAttribute('controls');
      v.muted = true;
      btn.hidden = false;
      v.addEventListener('play', function () { show(true); });
      v.addEventListener('pause', function () { show(false); });
      btn.addEventListener('click', function () {
        c.held = !v.paused;
        if (c.held) v.pause(); else { c.visible = true; c.sync(); }
      });
      show(false);
      fig.fdClip = c;
      if (io) io.observe(fig); else c.sync();
    });
    if (rm && rm.addEventListener) rm.addEventListener('change', function () {
      if (calm()) list.forEach(function (fig) { var c = fig.fdClip; if (c) { c.held = true; c.sync(); } });
    });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // The hero chip counts down to the next 6:30 AM on the viewer's own clock: a sample alarm, labelled as one.
  function tminus() {
    var chips = document.querySelectorAll('[data-tminus]'), ticks = document.querySelectorAll('[data-tick]');
    if (!chips.length && !ticks.length) return;
    var started = Date.now();
    function nextAt(hm) {
      var p = hm.split(':'), now = new Date(), t = new Date(now);
      t.setHours(+p[0], +p[1], 0, 0);
      if (t <= now) t.setDate(t.getDate() + 1);
      return t;
    }
    function render() {
      chips.forEach(function (chip) {
        var left = Math.max(0, Math.floor((nextAt(chip.getAttribute('data-tminus')) - Date.now()) / 1000));
        var h = Math.floor(left / 3600), m = Math.floor(left / 60) % 60, s = left % 60;
        chip.querySelector('b').textContent = 'T−' + pad(h) + ':' + pad(m) + (calm() ? '' : ':' + pad(s));
        chip.hidden = false;
      });
      if (!calm()) ticks.forEach(function (el) {
        var span = +el.getAttribute('data-tick') || 300, left = span - Math.floor((Date.now() - started) / 1000) % span;
        el.textContent = 'T-' + pad(Math.floor(left / 60)) + ':' + pad(left % 60);
      });
    }
    render();
    var timer = null;
    function start() { clearInterval(timer); timer = setInterval(render, calm() ? 60000 : 1000); }
    start();
    if (rm && rm.addEventListener) rm.addEventListener('change', function () { render(); start(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) clearInterval(timer); else { render(); start(); } });
  }


  // Docs search over window.FD_DOCS (written by tools/build-pages.py into /assets/docs-index.js). Without the script
  // the sidebar still lists every page; the search box stays hidden.
  function docsSearch() {
    var boxes = document.querySelectorAll('[data-docs-search]'), docs = window.FD_DOCS;
    if (!boxes.length || !docs || !docs.length) return;
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'"); }
    var idx = docs.map(function (d) {
      return { d: d, t: norm(d.t), s: norm(d.s), x: norm(d.x), h: (d.h || []).map(function (h) { return { id: h[0], label: h[1], n: norm(h[1]) }; }) };
    });
    function find(q) {
      var words = norm(q).split(/[^a-z0-9'+−-]+/).filter(function (w) { return w.length > 1; });
      if (!words.length) return null;
      var hits = [];
      idx.forEach(function (e) {
        var score = 0, head = null, ok = words.every(function (w) {
          var got = 0;
          if (e.t.indexOf(w) >= 0) got += 8;
          e.h.forEach(function (h) { if (h.n.indexOf(w) >= 0) { got += 4; if (!head) head = h; } });
          if (e.s.indexOf(w) >= 0) got += 3;
          var at = e.x.indexOf(w); if (at >= 0) got += 1 + (e.x.indexOf(w, at + 1) >= 0 ? 1 : 0);
          score += got; return got > 0;
        });
        if (ok) hits.push({ e: e, score: score, head: head });
      });
      return hits.sort(function (a, b) { return b.score - a.score; }).slice(0, 8);
    }
    boxes.forEach(function (box) {
      var input = box.querySelector('input'), list = box.querySelector('.docs-results'), live = box.querySelector('.docs-hits'), timer = null;
      box.hidden = false;
      function render() {
        var hits = find(input.value);
        if (!hits) { list.innerHTML = ''; live.textContent = ''; return; }
        list.innerHTML = hits.length ? hits.map(function (h) {
          var url = h.e.d.u + (h.head ? '#' + h.head.id : '');
          return '<li><a href="' + esc(url) + '"><span>' + esc(h.e.d.t) + '</span><small>' + esc(h.head ? h.head.label : h.e.d.g) + '</small></a></li>';
        }).join('') : '<li class="none">No matches. Try another word.</li>';
        live.textContent = hits.length + (hits.length === 1 ? ' result' : ' results');
      }
      input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(render, 80); });
      input.addEventListener('keydown', function (ev) {
        var first = list.querySelector('a');
        if (ev.key === 'Enter' && first) { ev.preventDefault(); location.href = first.getAttribute('href'); }
        else if (ev.key === 'ArrowDown' && first) { ev.preventDefault(); first.focus(); }
        else if (ev.key === 'Escape') { input.value = ''; render(); }
      });
      list.addEventListener('keydown', function (ev) {
        var links = [].slice.call(list.querySelectorAll('a')), i = links.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown' && i < links.length - 1) { ev.preventDefault(); links[i + 1].focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); (i > 0 ? links[i - 1] : input).focus(); }
        else if (ev.key === 'Escape') { input.focus(); }
      });
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    try { theme(); } catch (e) { /* the toggle stays hidden */ }
    try { reveal(); } catch (e) { root.classList.remove('fd-motion'); }
    try { clips(); } catch (e) { /* clips keep their native controls */ }
    try { tminus(); } catch (e) { /* the chip stays hidden */ }
    try { docsSearch(); } catch (e) { /* the sidebar still lists every page */ }
  });
})();
