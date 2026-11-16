/* AI usage & T3 Code activity feed.
 *
 * The dashboard reads one JSON document (schema: web/usage.schema.json) from a
 * configurable URL — settings → "usage.json URL". It is written by
 * collector/usage-collector on each machine (and merged with `--merge`).
 * With no URL configured it reads the report pushed onto the device
 * (files/usage.json). No report = the tile says so; sample numbers only
 * appear when "demo data" is switched on in settings.
 *
 * Privacy contract: counts, costs, limits, model names and thread titles only.
 * Prompt / response content is never collected, transported or shown.
 */
(function () {
  'use strict';
  const OW = window.OW;
  const TONE = { claude: 'org', codex: 'grn', gemini: 'acc' };
  const LABEL = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };

  const U = OW.emitter({ data: null, source: 'none', error: null, updated: 0 });

  // ---- normalise the wire format (single host or merged) into the UI shape ------
  function sumTokens(t) { return t ? (t.total != null ? t.total : (t.input || 0) + (t.output || 0) + (t.cache_read || 0) + (t.cache_write || 0)) : 0; }

  /** claude-fable-5-2 -> Fable 5.2 · gpt-6.1-sol -> GPT-6.1 Sol */
  function modelLabel(id) {
    let m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id); if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1) + ' ' + m[2] + '.' + m[3];
    m = /^gpt-([\d.]+)(?:-([a-z]+))?/.exec(id); if (m) return 'GPT-' + m[1] + (m[2] ? ' ' + m[2].charAt(0).toUpperCase() + m[2].slice(1) : '');
    m = /^gemini-(.+)/.exec(id); if (m) return 'Gemini ' + m[1].replace(/-/g, ' ');
    return id;
  }

  function normalise(doc) {
    const hosts = Array.isArray(doc.hosts) ? doc.hosts : [doc];
    const byId = new Map();
    const threads = [];
    const machines = [];
    const prs = [];
    const t3 = { running: 0, idle: 0, finishedToday: 0, hosts: 0 };
    hosts.forEach((h) => {
      if (h.machine) machines.push({ host: h.host, os: h.machine.os || '', load1: h.machine.load1, cpuCount: h.machine.cpu_count, memPct: h.machine.mem_used_pct, diskFreeGb: h.machine.disk_free_gb, uptimeS: h.machine.uptime_s, seenAt: Date.parse(h.generated_at || doc.generated_at || 0) || 0 });
      (h.providers || []).forEach((p) => {
        let o = byId.get(p.id);
        if (!o) {
          o = { id: p.id, label: p.label || LABEL[p.id] || p.id, tone: TONE[p.id] || 'acc', via: new Set(), models: new Map(), tokensToday: 0, tokensWeek: 0, costToday: 0, costWeek: 0, fiveHour: null, weekly: null, limitHit: false, limitUntil: null, estimated: false, seenAt: 0 };
          byId.set(p.id, o);
        }
        (p.sources || (p.source ? [p.source] : [])).forEach((s) => o.via.add(s));
        (p.models || []).forEach((m) => {
          const k = m.model;
          const mm = o.models.get(k) || { model: k, label: m.label || modelLabel(k), tokensToday: 0, tokensWeek: 0, costToday: 0, costWeek: 0 };
          mm.tokensToday += sumTokens(m.tokens_today); mm.tokensWeek += sumTokens(m.tokens_week);
          mm.costToday += m.cost_today_usd || 0; mm.costWeek += m.cost_week_usd || 0;
          o.models.set(k, mm);
        });
        // limits are per account, so the freshest host report wins
        const seen = Date.parse(h.generated_at || doc.generated_at || 0) || 0;
        const lim = p.limits || {};
        if (seen >= o.seenAt && (lim.five_hour || lim.weekly)) {
          o.seenAt = seen;
          const win = (w) => (w ? { pct: w.used_pct, resetsAt: w.resets_at ? Date.parse(w.resets_at) : null } : null);
          o.fiveHour = win(lim.five_hour); o.weekly = win(lim.weekly);
          o.limitHit = !!lim.limit_hit; o.limitUntil = lim.limit_hit_until ? Date.parse(lim.limit_hit_until) : null;
          o.estimated = !!lim.estimated;
        }
      });
      // T3 Code activity as the hub reports it: agent runs (titles only) and the pull requests they opened
      if (h.t3) {
        t3.hosts++; t3.running += h.t3.running || 0; t3.idle += h.t3.idle || 0; t3.finishedToday += h.t3.finished_today || 0;
        const day = OW.nowMs() - 36 * 3600000;
        (h.t3.agents || []).forEach((a) => {
          const started = a.started_at ? Date.parse(a.started_at) : null, ended = a.ended_at ? Date.parse(a.ended_at) : null;
          if (a.status !== 'running' && (ended || started || 0) < day) return;       // the board shows what is going on, not the archive
          threads.push({ id: a.id, threadId: a.thread_id, title: a.title || 'untitled thread', provider: /codex/i.test(a.provider || '') ? 'codex' : /claude/i.test(a.provider || '') ? 'claude' : a.provider, model: a.model, machine: a.machine || h.host || '',
            project: a.project_title && a.project_title !== 'No project' ? a.project_title : '', status: a.status || 'finished', startedAt: started, endedAt: ended, durationSec: started && ended ? Math.max(0, Math.round((ended - started) / 1000)) : 0 });
        });
        (h.t3.prs || []).forEach((p) => { if (prs.some((x) => x.url === p.url)) return; const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(p.url || ''); prs.push({ url: p.url, state: p.state || '', repo: m ? m[2] : '', number: m ? +m[3] : null, owner: m ? m[1] : '', host: h.host || '', threadId: p.thread_id }); });
      }
      (h.threads || []).forEach((t) => threads.push({
        id: t.id, title: t.title || 'untitled thread', provider: t.provider, model: t.model, machine: t.machine || h.host || '',
        status: t.status || 'finished', startedAt: t.started_at ? Date.parse(t.started_at) : null,
        endedAt: t.ended_at ? Date.parse(t.ended_at) : null, durationSec: t.duration_s || 0,
      }));
    });
    const providers = Array.from(byId.values()).map((o) => {
      o.models = Array.from(o.models.values()).sort((a, b) => b.tokensWeek - a.tokensWeek);
      o.via = Array.from(o.via);
      o.models.forEach((m) => { o.tokensToday += m.tokensToday; o.tokensWeek += m.tokensWeek; o.costToday += m.costToday; o.costWeek += m.costWeek; });
      // a reset time in the past means the window rolled over
      const now = OW.nowMs();
      [o.fiveHour, o.weekly].forEach((w) => { if (w && w.resetsAt && w.resetsAt < now) { w.pct = 0; w.resetsAt = null; } });
      if (o.limitHit && o.limitUntil && o.limitUntil < now) o.limitHit = false;
      return o;
    });
    const order = ['claude', 'codex', 'gemini'];
    providers.sort((a, b) => (order.indexOf(a.id) + 9) % 9 - (order.indexOf(b.id) + 9) % 9);
    const rank = { running: 0, error: 1, finished: 2, idle: 3 };
    threads.sort((a, b) => (rank[a.status] - rank[b.status]) || ((b.endedAt || b.startedAt || 0) - (a.endedAt || a.startedAt || 0)));
    return {
      generatedAt: Date.parse(doc.generated_at || 0) || OW.nowMs(),
      hosts: hosts.map((h) => h.host).filter(Boolean),
      providers, threads, machines, prs, hasCost: providers.some((p) => p.costWeek > 0 || p.costToday > 0), hasLimits: providers.some((p) => p.fiveHour || p.weekly), t3: t3.hosts ? t3 : null, mock: !!doc.mock,
    };
  }
  U.normalise = normalise;

  // ---- mock document in the real wire format (so the same code path is exercised) ----
  function mockDoc() {
    const now = OW.now();
    const iso = (ms) => new Date(ms).toISOString();
    const t = now.getTime();
    const dayFrac = (now.getHours() * 60 + now.getMinutes()) / 1440;          // tokens accumulate through the day
    const tok = (weekM, share) => {
      const week = weekM * 1e6, today = Math.round(week * 0.19 * (0.15 + dayFrac) * share);
      return { today: { input: Math.round(today * 0.06), output: Math.round(today * 0.04), cache_read: Math.round(today * 0.82), cache_write: Math.round(today * 0.08), total: today },
        week: { input: Math.round(week * 0.06), output: Math.round(week * 0.04), cache_read: Math.round(week * 0.82), cache_write: Math.round(week * 0.08), total: week } };
    };
    const model = (id, label, weekM, share, usdPerM) => {
      const k = tok(weekM, share);
      return { model: id, label, tokens_today: k.today, tokens_week: k.week, cost_today_usd: +(k.today.total / 1e6 * usdPerM).toFixed(2), cost_week_usd: +(k.week.total / 1e6 * usdPerM).toFixed(2), requests_today: Math.round(k.today.total / 42000), requests_week: Math.round(k.week.total / 42000) };
    };
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((8 - now.getDay()) % 7 || 7), 9, 0).getTime();
    const fiveLeft = (108 - (now.getMinutes() % 60)) * 60000;
    const hostDoc = (host, scale, threads) => ({
      host, generated_at: iso(t - 40000),
      providers: [
        { id: 'claude', label: 'Claude', sources: ['claude-code', 't3-code'],
          models: [model('claude-fable-5-2', 'Fable 5.2', 310 * scale, 1.2, 1.9), model('claude-opus-5-5', 'Opus 5.5', 140 * scale, 0.8, 1.4), model('claude-sonnet-5-5', 'Sonnet 5.5', 60 * scale, 1, 0.5)],
          limits: { five_hour: { used_pct: Math.round(38 + 40 * ((now.getMinutes() % 60) / 60)), resets_at: iso(t + fiveLeft) }, weekly: { used_pct: 41, resets_at: iso(monday) }, limit_hit: false, limit_hit_until: null, estimated: true } },
        { id: 'codex', label: 'Codex', sources: ['codex-cli'],
          models: [model('gpt-6-astra', 'GPT-6 Astra', 96 * scale, 1, 0.9)],
          limits: { five_hour: { used_pct: 23, resets_at: iso(t + 3.4 * 3600000) }, weekly: { used_pct: 68, resets_at: iso(monday + 2 * 86400000) }, limit_hit: false, limit_hit_until: null, estimated: false } },
        { id: 'gemini', label: 'Gemini', sources: ['cursor', 'antigravity'],
          models: [model('gemini-hydrogen', 'Gemini Hydrogen', 44 * scale, 1.4, 0.35)],
          limits: { five_hour: { used_pct: 100, resets_at: iso(t + 37 * 60000) }, weekly: { used_pct: 77, resets_at: iso(monday + 86400000) }, limit_hit: true, limit_hit_until: iso(t + 37 * 60000), estimated: false } },
      ],
      threads,
    });
    const th = (id, title, provider, model, status, startMin, durMin) => ({ id, title, provider, model, status, started_at: iso(t - startMin * 60000), ended_at: status === 'running' ? null : iso(t - (startMin - durMin) * 60000), duration_s: Math.round((status === 'running' ? startMin : durMin) * 60) });
    return {
      schema: "flightday-wall.usage/1", generated_at: iso(t - 20000), mock: true,
      hosts: [
        hostDoc('studio-mac', 0.62, [
          th('m2', 'Sample screen check', 'claude', 'claude-opus-5-5', 'finished', 310, 74),
          th('m3', 'Sample app review', 'codex', 'gpt-6-astra', 'finished', 205, 22),
        ]),
        hostDoc('home-server', 0.3, [
          th('k1', 'Home network setup', 'claude', 'claude-fable-5-2', 'running', 47, 0),
          th('k2', 'Nightly backup audit', 'codex', 'gpt-6-astra', 'finished', 960, 9),
        ]),
        hostDoc('home-server', 0.08, [
          th('s1', 'Sample model check', 'gemini', 'gemini-hydrogen', 'error', 88, 31),
        ]),
      ],
    };
  }
  U.mockDoc = mockDoc;

  /**
   * /v1/limits (5-hour / weekly windows per provider), folded into the report when the hub has it.
   * Accepts {providers:[{id, limits}|{id, five_hour, weekly…}]} or a map {claude: {...}}.
   */
  async function mergeLimits(doc) {
    let r;
    try { r = await OW.hub.get('/v1/limits', 5000); } catch (e) { return; }
    const rows = r.ok && r.data && Array.isArray(r.data.limits) ? r.data.limits : null;
    if (!rows) return;
    // {provider, window: five_hour | seven_day | …, used_percent, resets_at, stale}; providers listed under
    // `unavailable` simply have no gauge
    const by = new Map();
    rows.forEach((x) => {
      if (!x || !x.provider || typeof x.used_percent !== 'number') return;
      const slot = /five|5/.test(x.window || '') ? 'five_hour' : /seven|week|7/.test(x.window || '') ? 'weekly' : null;
      if (!slot) return;
      const o = by.get(x.provider) || { five_hour: null, weekly: null, limit_hit: false, limit_hit_until: null, estimated: false };
      o[slot] = { used_pct: x.used_percent, resets_at: x.resets_at || null };
      if (x.used_percent >= 100) { o.limit_hit = true; o.limit_hit_until = x.resets_at || null; }
      by.set(x.provider, o);
    });
    const provs = Array.from(by.keys()).map((id) => ({ id, models: [], limits: by.get(id) }));
    if (provs.length) doc.hosts.push({ host: '', generated_at: r.data.generated_at || new Date().toISOString(), providers: provs });
  }

  async function refresh() {
    const url = (OW.config.get('usage.url') || '').trim();
    let doc = null, stale = false;
    U.via = '';
    try {
      // wallhub's merged report first (every host that publishes to it); a pushed file is the fallback
      if (!url && OW.hub && OW.hub.enabled()) {
        try {
          const r = await OW.hub.get('/usage.json');
          if (r.ok && r.data && Array.isArray(r.data.hosts)) { doc = r.data; U.via = 'wallhub'; await mergeLimits(doc); }
        } catch (e) { /* hub unreachable: fall through to the local report */ }
      }
      if (doc) { /* from the hub */ }
      else if (url) { const r = await OW.net.json(url, 30); doc = r.data; stale = r.stale; U.via = 'url'; }
      else if (OW.net.native) {
        // no URL: use the report a machine pushed onto this device (see collector/README)
        const r = await fetch('/net/local?f=usage.json', { cache: 'no-store' });
        if (r.ok) { doc = await r.json(); U.via = 'pushed file'; }
      }
      U.error = null;
    } catch (e) { U.error = String(e.message || e); }
    if (doc) {
      U.data = normalise(doc);
      // a report nobody refreshed for 15 minutes is shown as stale, never as live
      U.source = stale || OW.nowMs() - U.data.generatedAt > 15 * 60000 ? 'stale' : 'live';
    } else if (OW.demo?.active && OW.app?.developer) {
      U.data = normalise(mockDoc()); U.source = 'demo';
    } else if (!U.data || U.source === 'demo') {
      U.data = null; U.source = 'none';
    } else U.source = 'stale';
    U.updated = OW.nowMs();
    U.emit('usage');
  }
  U.refresh = refresh;

  /** worst state across the two windows: {pct, level: ok|warn|hot|hit} */
  U.level = function (p) {
    const pct = Math.max((p.fiveHour && p.fiveHour.pct) || 0, (!p.fiveHour && p.weekly && p.weekly.pct) || 0, 0);
    const level = p.limitHit ? 'hit' : pct >= 90 ? 'hot' : pct >= 70 ? 'warn' : 'ok';
    return { pct, level };
  };

  U.start = function () {
    refresh();
    setInterval(refresh, 60000);
    OW.config.on((path) => { if (path === 'usage.url' || path === 'demo' || path === 'wallhub.url') refresh(); });
    let soon = null;
    if (OW.hub) OW.hub.on((topic) => { if (topic === 'usage' || topic === 't3' || topic === 'limits' || topic === 'up' || topic === 'down') { clearTimeout(soon); soon = setTimeout(refresh, 400); } });
  };

  OW.usage = U;
})();
