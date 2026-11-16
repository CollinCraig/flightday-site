/* wallhub client.
 *
 * wallhub (settings `wallhub.url`, e.g. http://<host>:8787) is the house's cached space-data hub:
 * launches + featured selection, events, news, crew, tracked objects, background director,
 * mission pin / preferences and the merged AI-usage report. Every wall and the Apple apps read
 * the same answers from it, so they always agree — and the public APIs see one client, not five.
 *
 *   REST       GET  /v1/...            (CORS is open for this origin; the native proxy is the fallback path)
 *   stream     WS   /v1/stream         first message {topic:"snapshot", data:{featured, background, prefs, usage, t3, …}},
 *                                      then {topic, data} whenever a topic changes
 *   prefs      PATCH /v1/prefs         JSON merge patch, bearer `wallhub.token`: pin, per-screen settings (screens[id]), global
 *
 * Rule for the rest of the app: when the hub ANSWERS (even with "no data yet") it is the source
 * of truth. Only when it cannot be reached at all do the modules talk to the public APIs directly.
 */
(function () {
  'use strict';
  const OW = window.OW;
  const H = OW.emitter({ up: false, lastOk: 0, lastTry: 0, prefs: null, error: null, streaming: false });
  let ws = null, retry = null, backoff = 2000, poll = null;

  const base = () => String(OW.config.get('wallhub.url') || '').trim().replace(/\/+$/, '');
  H.base = base;
  H.enabled = () => !!base();
  /** absolute URL for a hub path (media files are served by the hub too) */
  H.url = (p) => (/^https?:/.test(p) ? p : base() + (p.charAt(0) === '/' ? p : '/' + p));
  /** did the hub answer recently? (stream open, or an HTTP reply within the last 3 minutes) */
  H.reachable = () => H.enabled() && (H.streaming || OW.nowMs() - H.lastOk < 180000);

  function mark(ok, err) {
    const was = H.up;
    H.lastTry = OW.nowMs();
    if (ok) { H.lastOk = H.lastTry; H.error = null; } else H.error = String(err || 'unreachable');
    H.up = H.reachable();
    if (was !== H.up) H.emit(H.up ? 'up' : 'down');
  }

  /**
   * GET a hub path. Resolves {ok, status, data}: `ok` is true for a 2xx with a JSON body.
   * Rejects only when the hub cannot be reached (that is the signal to fall back to direct APIs).
   */
  H.get = async function (path, timeoutMs) {
    if (!H.enabled()) throw new Error('wallhub not configured');
    const url = H.url(path);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs || 7000);
      let r;
      try { r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); } finally { clearTimeout(timer); }
      let data = null;
      try { data = await r.json(); } catch (e) { /* empty or non-JSON body */ }
      mark(true);
      return { ok: r.ok && data != null, status: r.status, data };
    } catch (direct) {
      // some WebViews refuse the plain-http request from the https page: go through the native proxy once
      if (OW.net.native) {
        try { const r = await OW.net.json(url, 5); if (!r.stale) { mark(true); return { ok: true, status: 200, data: r.data }; } } catch (e) { /* same verdict */ }
      }
      mark(false, direct && direct.message);
      throw new Error('wallhub unreachable');
    }
  };

  /** GET that needs the prefs token (health data). Resolves {ok, status, data}; never throws for a refusal. */
  H.getPrivate = async function (path, timeoutMs) {
    if(OW.data?.client?.contract===3&&OW.data.client.info?.principal==='screen')return {ok:false,status:403,data:null};
    const token = String(OW.config.get('wallhub.token') || '').trim();
    if (!H.enabled() || !token) return { ok: false, status: 0, data: null };
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs || 7000);
      let r;
      try { r = await fetch(H.url(path), { signal: ctl.signal, cache: 'no-store', headers: { Authorization: 'Bearer ' + token } }); } finally { clearTimeout(timer); }
      let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
      return { ok: r.ok && data != null, status: r.status, data };
    } catch (e) { return { ok: false, status: 0, data: null }; }
  };

  /** unwrap the hub's cache envelope {data, error, fetched_at, stale, ttl_seconds}; null when it holds nothing yet */
  H.unwrap = function (env) {
    if (!env || typeof env !== 'object' || !('data' in env) || env.data == null) return null;
    if (env.data && typeof env.data === 'object' && 'results' in env.data && env.data.results == null) return null;
    return { data: env.data, stale: !!env.stale, at: env.fetched_at ? Date.parse(env.fetched_at) : 0, error: env.error || null };
  };

  /**
   * Change preferences with a JSON merge patch (null deletes a key; unknown keys are refused by the hub).
   * Needs `wallhub.token`. Resolves the stored prefs or throws.
   */
  H.patchPrefs = async function (patch) {
    if(OW.data?.client?.contract===3&&OW.data.client.info?.principal==='screen')throw Error('Use Flight Day screen settings');
    const token = String(OW.config.get('wallhub.token') || '').trim();
    if (!H.enabled()) throw new Error('wallhub not configured');
    if (!token) throw new Error('no prefs token');
    const r = await fetch(H.url('/v1/prefs'), { method: 'PATCH', headers: { 'Content-Type': 'application/merge-patch+json', Authorization: 'Bearer ' + token }, body: JSON.stringify(patch) });
    if (!r.ok) {
      // the hub names the field it refused: keep that in the message
      let why = ''; try { const e = await r.json(); why = [e.error, e.detail].filter(Boolean).join(': '); } catch (e) { /* no body */ }
      throw new Error(r.status === 401 ? 'prefs token rejected' : 'prefs ' + r.status + (why ? ' — ' + String(why).slice(0, 160) : ''));
    }
    H.prefs = await r.json();
    mark(true);
    H.emit('prefs', H.prefs);
    return H.prefs;
  };
  H.putPrefs = H.patchPrefs;

  function deliver(topic, data) {
    if (topic === 'prefs' && data) H.prefs = data;
    H.emit(topic, data);
  }

  function connect() {
    clearTimeout(retry);
    if (ws) { try { ws.onclose = ws.onerror = ws.onmessage = null; ws.close(); } catch (e) { /* gone */ } ws = null; }
    H.streaming = false;
    if (!H.enabled()) { mark(false, 'not configured'); return; }
    let sock;
    try { sock = new WebSocket(base().replace(/^http/, 'ws') + '/v1/stream'); } catch (e) { retry = setTimeout(connect, backoff); return; }
    ws = sock;
    sock.onopen = () => { backoff = 2000; H.streaming = true; mark(true); };
    sock.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || !m.topic) return;
      H.lastOk = OW.nowMs();
      if (m.topic === 'snapshot' && m.data) Object.keys(m.data).forEach((k) => deliver(k, m.data[k]));
      else deliver(m.topic, m.data);
    };
    const lost = () => {
      if (ws !== sock) return;
      ws = null; H.streaming = false;
      mark(H.reachable(), 'stream closed');
      backoff = Math.min(backoff * 1.7, 60000);
      retry = setTimeout(connect, backoff);
    };
    sock.onclose = lost;
    sock.onerror = lost;
  }

  /** belt and braces: the few answers the walls must agree on are also polled (LAN, tiny) */
  async function refresh() {
    if (!H.enabled()) return;
    try {
      const p = await H.get('/v1/prefs'); if (p.ok) deliver('prefs', p.data);
      const f = await H.get('/v1/launches/featured'); if (f.ok) deliver('featured', f.data);
    } catch (e) { /* marked down; the modules fall back on their own timers */ }
  }
  H.refresh = refresh;

  H.start = function () {
    connect();
    clearInterval(poll);
    poll = setInterval(refresh, 60000);
    setTimeout(refresh, 300);
    OW.config.on((path) => { if (path === 'wallhub.url') { H.prefs = null; H.lastOk = 0; connect(); setTimeout(refresh, 300); H.emit('config'); } });
  };

  OW.hub = H;
})();
