/* Flight Day — living backgrounds ("mission control feed").
 *
 * A rotation engine with pluggable sources and a context-aware scheduler. The
 * same engine drives the dashboard, ambient mode and the TV screensaver.
 *
 * Sources (OW.bg.register to add more):
 *   flightday   bundled Liftoff + Starship wallpapers (always available, offline)
 *   apod      NASA Astronomy Picture of the Day, last ~8 days (key configurable, DEMO_KEY default)
 *   nasa      curated NASA Image Library picks (js/bgsets.js)
 *   launch    the rocket of the launch that put the wall in launch-day mode (Launch Library 2)
 *
 * Scheduler: every candidate gets a weight from the current context —
 *   launch-day > calendar event set > holiday/season > weather > time of day > source.
 * The pick is a weighted draw that avoids recent repeats, so the wall follows
 * the day without ever feeling scripted.
 *
 * Legibility: each image is sampled on a small canvas; the scrim and tile
 * opacity adapt to its luminance, and a pre-blurred copy is produced once per
 * image for the frosted tiles (no live backdrop-filter — cheap on the panel SoC).
 */
(function () {
  'use strict';
  const OW = window.OW;
  OW.bgBundled = window.FLIGHTDAY_HOUSE_WALLPAPERS || [];
  const DAYPARTS = ['dawn', 'day', 'dusk', 'night'];
  const WEATHER_TAGS = ['rain', 'storm'];

  const B = OW.emitter({
    current: null,        // item on screen
    reason: '',           // why it was chosen ("launch day", "dinner", "night", …)
    context: null,
    sources: [],
    pool: [],
  });

  // ---------------------------------------------------------------------------
  // sources
  // ---------------------------------------------------------------------------
  B.register = function (source) { B.sources.push(Object.assign({ items: [], loadedAt: 0, ttlMin: 720 }, source)); };

  B.register({ id: "flightday", label: "Gradient", ttlMin: 1e9, load: async () => OW.bgBundled });

  B.register({
    id: 'nasa', label: 'NASA Image Library', ttlMin: 1e9,
    enabled: () => OW.config.get('bg.nasa') !== false,
    load: async () => OW.bgCurated.map((c) => Object.assign({ source: 'nasa' }, c)),
  });

  B.register({
    id: 'apod', label: 'NASA APOD', ttlMin: 360,
    enabled: () => OW.config.get('bg.apod') !== false,
    load: async () => {
      const key = OW.config.get('bg.apodKey') || 'DEMO_KEY';
      const d = new Date(Date.now() - 8 * 86400000);
      const start = d.getUTCFullYear() + '-' + OW.fmt.pad(d.getUTCMonth() + 1) + '-' + OW.fmt.pad(d.getUTCDate());
      const r = await OW.net.json('https://api.nasa.gov/planetary/apod?api_key=' + encodeURIComponent(key) + '&start_date=' + start + '&thumbs=false', 6 * 3600);
      const list = Array.isArray(r.data) ? r.data : [r.data];
      const today = list.length ? list[list.length - 1].date : '';
      return list
        // the API sometimes degrades to placeholder entries (a NASA logo): only real APOD images pass
        .filter((a) => a && a.media_type === 'image' && /apod\.nasa\.gov\/apod\/image\//.test(a.hdurl || a.url || '') && !/logo/i.test(a.url || ''))
        .map((a) => ({
          id: 'apod:' + a.date, source: 'apod', title: a.title, credit: 'APOD · ' + (a.copyright ? a.copyright.replace(/\s+/g, ' ').trim() : 'NASA'),
          tags: ['night', 'deepspace'], src: a.url, srcHi: a.hdurl || a.url, fresh: a.date === today,
        }));
    },
  });

  B.register({
    id: 'launch', label: 'Launch Library 2', ttlMin: 0,
    load: async () => {
      const f = OW.space && OW.space.focus;
      if (!f || !f.image) return [];
      return [{ id: 'launch:' + f.id, source: 'launch', title: f.rocket + ' · ' + f.mission, credit: (f.credit || f.provider || 'Launch Library 2'), tags: ['rockets'], src: f.image, srcHi: f.image, launchId: f.id }];
    },
  });

  async function refreshSources() {
    const now = Date.now();
    await Promise.all(B.sources.map(async (s) => {
      if (s.enabled && !s.enabled()) { s.items = []; return; }
      if (s.loadedAt && now - s.loadedAt < s.ttlMin * 60000) return;
      try { s.items = (await s.load()) || []; s.loadedAt = now; s.error = null; }
      catch (e) { s.error = String(e.message || e); s.loadedAt = now - (s.ttlMin - 20) * 60000; /* retry in ~20 min, keep old items */ }
    }));
    B.pool = B.sources.reduce((all, s) => all.concat(s.items), []);
  }

  // ---------------------------------------------------------------------------
  // context: time of day, weather, season, calendar, launches
  // ---------------------------------------------------------------------------
  function computeContext() {
    const now = OW.nowMs(), date = OW.now();
    const w = (OW.data && OW.data.state && OW.data.state.weather) || {};
    const sun = (w.sunrise && w.sunset) ? w : OW.sunTimes(date, OW.config.get('home.lat'));
    // sun times may be "next rising/setting" (HA) — fold them onto today
    const onToday = (t) => { const d = new Date(t); return new Date(date.getFullYear(), date.getMonth(), date.getDate(), d.getHours(), d.getMinutes()).getTime(); };
    const rise = onToday(sun.sunrise), set = onToday(sun.sunset);
    let daypart = 'night';
    if (now >= rise - 45 * 60000 && now < rise + 75 * 60000) daypart = 'dawn';
    else if (now >= rise + 75 * 60000 && now < set - 75 * 60000) daypart = 'day';
    else if (now >= set - 75 * 60000 && now < set + 45 * 60000) daypart = 'dusk';

    const weather = WEATHER_TAGS.includes(w.condition) ? w.condition : w.condition === 'snow' ? 'snow' : null;
    const m = date.getMonth() + 1, d = date.getDate();
    const seasonal = OW.bgSeasonal.filter((s) => s.on(m, d, date));
    const holiday = seasonal.find((s) => !s.season) || null;
    const season = seasonal.find((s) => s.season) || null;

    // calendar event that maps to a background set and is inside its lead window
    let event = null;
    const events = (OW.data && OW.data.state && OW.data.state.events) || [];
    events.slice().sort((a, b) => a.start - b.start).some((e) => {
      if (e.end <= now) return false;
      const rule = OW.bgEventRules.find((r) => r.match.test(e.title));
      if (!rule || e.start - now > rule.lead * 60000) return false;
      event = { rule, title: e.title, start: e.start };
      return true;
    });

    const launch = (OW.space && OW.space.focus) || null;
    const live = (OW.space && OW.space.live) || null;
    return { daypart, weather, holiday, season, event, launch, live, rise, set };
  }

  function weigh(item, ctx) {
    const tags = item.tags || [];
    const has = (t) => tags.includes(t);
    let w = item.source === "flightday" ? 4 : item.source === 'apod' ? (item.fresh ? 6 : 3) : 1;
    let why = null;

    if (item.source === "flightday" && (item.themes || [item.theme]).includes(OW.config.get('theme'))) w *= 1.6;

    // time of day
    const parts = tags.filter((t) => DAYPARTS.includes(t));
    if (parts.length) {
      if (has(ctx.daypart)) { w *= 3; why = ctx.daypart; }
      else if (item.source !== "flightday") w *= 0.15;
    }
    // weather
    const wx = tags.filter((t) => WEATHER_TAGS.includes(t));
    if (ctx.weather === 'rain' || ctx.weather === 'storm') {
      if (has(ctx.weather) || (ctx.weather === 'storm' && has('rain'))) { w *= 6; why = ctx.weather === 'storm' ? 'stormy' : 'rainy'; }
    } else if (ctx.weather === 'snow' && has('winter')) { w *= 5; why = 'snow'; }
    else if (wx.length) w *= 0.3;
    // season + holidays
    if (ctx.season && ctx.season.tags.some(has)) { w *= 2; why = why || ctx.season.label; }
    if (ctx.holiday && ctx.holiday.tags.some(has)) { w *= 6; why = ctx.holiday.label; }
    // calendar event set
    if (ctx.event && ctx.event.rule.tags.some(has)) { w *= 8; why = ctx.event.rule.label; }
    // launch day
    if (ctx.launch) {
      if (item.source === 'launch') { w = 400; why = 'launch day'; }
      else if (has('rockets')) { w *= 4; why = 'launch day'; }
    } else if (item.source === 'launch') w = 0;

    return { w, why: why || (item.source === 'apod' ? 'apod' : item.source === "flightday" ? "flightday" : 'nasa') };
  }

  const recent = [];
  const failed = new Map();
  function pick(ctx) {
    const now = Date.now();
    // inside the final hour (or while live) the launch vehicle stays up
    const pin = ctx.launch && (ctx.live || ctx.launch.net - OW.nowMs() < 60 * 60000) && B.pool.find((i) => i.source === 'launch' && !(failed.get(i.id) > now));
    if (pin) return { item: pin, why: ctx.live && ctx.live.id === 'l' + ctx.launch.id ? 'live' : 'launch day' };

    const themeOnly = OW.config.get('bg.mode') === 'theme';
    const cands = [];
    let total = 0;
    B.pool.forEach((item) => {
      if (failed.get(item.id) > now) return;
      if (themeOnly && !(item.source === "flightday" && (item.themes || [item.theme]).includes(OW.config.get('theme')))) return;
      if (!themeOnly && recent.includes(item.id) && B.pool.length > recent.length + 1) return;
      const r = weigh(item, ctx);
      if (r.w <= 0) return;
      cands.push({ item, w: r.w, why: r.why });
      total += r.w;
    });
    if (!cands.length) {
      const fallback = OW.bgBundled.find((b) => (b.themes || [b.theme]).includes(OW.config.get('theme'))) || OW.bgBundled[0];
      return { item: fallback, why: "flightday" };
    }
    let r = Math.random() * total;
    for (const c of cands) { r -= c.w; if (r <= 0) return c; }
    return cands[cands.length - 1];
  }

  // ---------------------------------------------------------------------------
  // rendering: two crossfading layers + per-image blur and luminance
  // ---------------------------------------------------------------------------
  let stage, layers, active = 0, timer = null, busy = false, seq = 0;
  const blurUrls = [null, null];

  function wantWidth() {
    const px = (stage ? stage.clientWidth : window.innerWidth) * (window.devicePixelRatio || 1);
    return px > 2300 ? 3840 : 1920;
  }
  function urlFor(item) {
    const w = wantWidth();
    if (item.source === "flightday") return w > 1920 ? item.srcHi : item.src;
    // the native proxy downsizes; in a browser stick to the ~1920px rendition
    if (OW.net.native) return OW.net.img(w > 1920 || !/~large\./.test(item.src) ? item.srcHi || item.src : item.src, w);
    return item.src;
  }

  /** Cover-crop rectangle of an image for a 16:9 frame around a focus point (percent). */
  function coverRect(im, focus) {
    const iw = im.naturalWidth, ih = im.naturalHeight, ar = 16 / 9;
    let sw = iw, sh = iw / ar;
    if (sh > ih) { sh = ih; sw = ih * ar; }
    const fx = (focus ? focus[0] : 50) / 100, fy = (focus ? focus[1] : 50) / 100;
    return { sx: (iw - sw) * fx, sy: (ih - sh) * fy, sw, sh };
  }

  /** Returns {lum:{all,top,bottom,left}, blurUrl} — or neutral defaults if the canvas is tainted. */
  function analyse(im, item) {
    const out = { lum: { all: 0.42, top: 0.42, bottom: 0.42, left: 0.42 }, blurUrl: null };
    try {
      const r = coverRect(im, item.focus);
      const c = document.createElement('canvas');
      c.width = 48; c.height = 27;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, r.sx, r.sy, r.sw, r.sh, 0, 0, 48, 27);
      const px = g.getImageData(0, 0, 48, 27).data;
      const acc = { all: [0, 0], top: [0, 0], bottom: [0, 0], left: [0, 0] };
      for (let y = 0; y < 27; y++) for (let x = 0; x < 48; x++) {
        const i = (y * 48 + x) * 4;
        const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        const add = (k) => { acc[k][0] += l; acc[k][1]++; };
        add('all');
        if (y < 5) add('top');
        if (y >= 19) add('bottom');
        if (x < 26 && y >= 12) add('left');
      }
      Object.keys(acc).forEach((k) => { out.lum[k] = acc[k][0] / acc[k][1]; });

      // frosted-glass copy for the tiles
      const b = document.createElement('canvas');
      b.width = 320; b.height = 180;
      const bg = b.getContext('2d');
      bg.filter = 'blur(9px) saturate(1.2)';
      bg.drawImage(im, r.sx, r.sy, r.sw, r.sh, -14, -8, 348, 196);
      out.blurData = b;
    } catch (e) { /* cross-origin image without CORS: keep defaults, tiles fall back to flat tint */ }
    return out;
  }
  function canvasUrl(canvas) {
    return new Promise((resolve) => {
      if (!canvas) return resolve(null);
      try { canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/webp', 0.82); }
      catch (e) { resolve(null); }
    });
  }

  function applyLuminance(lum) {
    const c = OW.clamp, s = stage.style;
    // dashboard scrim: keep the bar, feed line and tile gaps calm on bright images
    s.setProperty('--scrim-top', c(0.50 + 0.42 * lum.top, 0.5, 0.9).toFixed(3));
    s.setProperty('--scrim-mid', c(0.22 + 0.42 * lum.all, 0.24, 0.62).toFixed(3));
    s.setProperty('--scrim-bot', c(0.58 + 0.36 * lum.bottom, 0.6, 0.92).toFixed(3));
    s.setProperty('--tile-a', c(0.70 + 0.24 * lum.all, 0.74, 0.9).toFixed(3));
    // ambient: text lives bottom-left, so that corner decides
    s.setProperty('--amb-scrim', c(0.46 + 0.5 * lum.left, 0.5, 0.92).toFixed(3));
    s.setProperty('--lum', c(lum.all, 0, 1).toFixed(3));
    s.setProperty('--amb-dim', c((lum.all - 0.38) * 0.75, 0, 0.42).toFixed(3));
  }

  async function show(item, why, instant) {
    const my = ++seq;
    const im = await OW.net.load(urlFor(item), 60000);
    if (im.naturalWidth < 900 || im.naturalWidth / im.naturalHeight < 1.15 || im.naturalWidth / im.naturalHeight > 3.2) throw new Error('unsuitable image');
    if (im.decode) { try { await im.decode(); } catch (e) { /* fine */ } }
    const info = analyse(im, item);
    const blurUrl = item.blur || (await canvasUrl(info.blurData));
    if (my !== seq) return;                         // a newer request won

    const next = 1 - active;
    const el = layers[next];
    el.style.backgroundImage = 'url("' + im.src + '")';
    B.currentUrl = im.src;
    el.style.backgroundPosition = (item.focus ? item.focus[0] : 50) + '% ' + (item.focus ? item.focus[1] : 50) + '%';
    stage.style.setProperty(next ? '--blur-b' : '--blur-a', blurUrl ? 'url("' + blurUrl + '")' : 'none');
    stage.classList.toggle('bg-instant', !!instant);
    // commit on the next frame so the fade always runs
    requestAnimationFrame(() => {
      layers[next].classList.add('show');
      layers[active === next ? 1 - next : active].classList.remove('show');
      stage.classList.toggle('bg-b', next === 1);
      stage.classList.toggle('no-blur', !blurUrl);
      applyLuminance(info.lum);
      const old = blurUrls[next];
      blurUrls[next] = blurUrl && blurUrl.startsWith('blob:') ? blurUrl : null;
      if (old) setTimeout(() => URL.revokeObjectURL(old), 4000);
      active = next;
    });

    B.current = item;
    B.reason = why;
    B.lum = info.lum;
    recent.push(item.id);
    while (recent.length > Math.min(10, Math.max(1, B.pool.length - 2))) recent.shift();
    OW.store.set('bg.last', { id: item.id, why });
    B.emit('change', item);
  }

  /**
   * wallhub's background director (/v1/background/now): one answer for every screen in the house.
   * Returns {item, why, nextAt} or null (no hub, hub down, nothing chosen, or backgrounds set to theme only).
   */
  let hubNextAt = 0;
  async function hubChoice() {
    if (!OW.hub || !OW.hub.enabled() || OW.config.get('bg.mode') === 'theme') return null;
    let r;
    try { r = await OW.hub.get('/v1/background/now', 6000); } catch (e) { return null; }
    const d = r.ok && r.data, it = d && d.item;
    if (!it || !(it.cached_src || it.src)) return null;
    const src = it.cached_src ? OW.hub.url(it.cached_src) : it.src;
    const m = /^launch:(.+)$/.exec(it.id || '');
    hubNextAt = d.next_rotation_at ? Date.parse(d.next_rotation_at) : 0;
    B.hubNow = d;                       // the director's whole answer (a live-stream pick rides along when it has one)
    return {
      item: { id: 'hub:' + it.id, source: it.source || 'wallhub', title: it.title || '', credit: it.credit || '', src, srcHi: src, hub: true, launchId: m ? m[1] : null, live: !!it.live },
      why: String(d.reason || it.source || 'wallhub').replace(/_/g, ' '),
    };
  }

  /** Advance to a new image (weighted by context). Safe to call any time. */
  B.next = async function (opts) {
    if (OW.demo?.active) return;
    if (busy) return;
    busy = true;
    try {
      await refreshSources();
      B.context = computeContext();
      B.via = 'local';
      // the hub's pick first (a manual "next image" or an explicit item stays local until the hub rotates again)
      if (!(opts && (opts.item || opts.local))) {
        const hc = await hubChoice();
        if (hc && !(failed.get(hc.item.id) > Date.now())) {
          B.via = 'wallhub';
          if (B.current && B.current.id === hc.item.id) { B.reason = hc.why; B.emit('change', B.current); return; }
          try { await show(hc.item, hc.why, opts && opts.instant); return; }
          catch (e) { failed.set(hc.item.id, Date.now() + 30 * 60000); B.via = 'local'; }   // unsuitable or unreachable image: local pick this round
        }
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const choice = (opts && opts.item) ? { item: opts.item, why: opts.why || 'manual' } : pick(B.context);
        if (!choice || !choice.item) break;
        if (B.current && choice.item.id === B.current.id && attempt < 2 && !(opts && opts.force) && B.pool.length > 2 && OW.config.get('bg.mode') !== 'theme' && !(B.context.launch && choice.why !== "flightday")) continue;
        if (B.current && choice.item.id === B.current.id) { B.reason = choice.why; B.emit('change', B.current); break; }
        try { await show(choice.item, choice.why, opts && opts.instant); break; }
        catch (e) {
          failed.set(choice.item.id, Date.now() + 60 * 60000);   // skip for an hour
          if (opts && opts.item) opts = null;
        }
      }
    } finally {
      busy = false;
      schedule();
    }
  };

  function intervalMs() {
    const ambient = OW.isDream || (stage && stage.classList.contains('amb-on'));
    const min = ambient ? OW.config.get('bg.ambientIntervalMin') : OW.config.get('bg.intervalMin');
    return OW.clamp(+min || 10, 0.25, 720) * 60000;
  }
  function schedule() {
    if (OW.demo?.active) return;
    clearTimeout(timer);
    // with the hub directing, turn the page when it does (plus a beat), not on our own clock
    const untilHub = hubNextAt - Date.now() + 1500;
    timer = setTimeout(() => B.next(), B.via === 'wallhub' && untilHub > 5000 ? Math.min(untilHub, 30 * 60000) : intervalMs());
  }
  B.reschedule = schedule;

  /** Re-evaluate now because the context changed (launch window opened, theme switched, …). */
  B.retarget = function () { B.next({ force: false }); };

  B.start = function () {
    stage = document.getElementById('stage');
    layers = [document.getElementById('bgA'), document.getElementById('bgB')];
    if (OW.demo?.active) {
      // Owned CSS sky, BRAND.md night/surface/raised; never load a wallpaper in demo.
      layers[0].style.backgroundImage = 'radial-gradient(ellipse at 50% 100%, #1A2238 0%, #11172A 45%, #0A0E1A 100%)';
      layers[0].classList.add('show');
      B.current = null; B.currentUrl = ''; B.reason = ''; B.via = 'demo';
      B.emit('change', null);
      return;
    }
    // Public first paint uses the owned sky; house-only art retains its credit.
    const theme = OW.bgBundled.find((b) => (b.themes || [b.theme]).includes(OW.config.get('theme'))) || OW.bgBundled[0];
    if (theme) {
      layers[0].style.backgroundImage = 'url("' + (wantWidth() > 1920 ? theme.srcHi : theme.src) + '")';
      layers[0].style.backgroundPosition = theme.focus[0] + '% ' + theme.focus[1] + '%';
      stage.style.setProperty('--blur-a', 'url("' + theme.blur + '")');
    } else {
      layers[0].style.backgroundImage = 'radial-gradient(ellipse at 50% 100%, #1A2238 0%, #11172A 45%, #0A0E1A 100%)';
    }
    layers[0].classList.add('show');
    B.current = theme || null; B.reason = theme ? "flightday" : ''; B.currentUrl = theme ? theme.src : '';
    B.emit('change', B.current);

    setTimeout(() => B.next({ instant: false }), OW.isDream ? 600 : 1800);

    // context changes that should not wait for the next tick
    if (OW.space) OW.space.on((topic) => {
      if (topic !== 'launches' && topic !== 'live-start') return;
      const f = OW.space.focus, cur = B.current;
      const wantLaunch = !!(f && f.image), showing = cur && cur.source === 'launch' && f && cur.launchId === f.id;
      if (topic === 'live-start' || (wantLaunch && !showing && f.net - OW.nowMs() < 60 * 60000) || (!wantLaunch && cur && cur.source === 'launch')) {
        const src = B.sources.find((s) => s.id === 'launch'); if (src) src.loadedAt = 0;
        B.next({ force: true });
      } else { const src = B.sources.find((s) => s.id === 'launch'); if (src) src.loadedAt = 0; }
    });
    let hubSoon = null;
    if (OW.hub) OW.hub.on((topic) => { if (topic === 'background' || topic === 'up') { clearTimeout(hubSoon); hubSoon = setTimeout(() => B.next({ force: true }), 600); } });
    OW.config.on((path) => {
      if (path === 'theme' || path.startsWith('bg.')) {
        B.sources.forEach((s) => { if (s.id === 'apod') s.loadedAt = 0; });
        if (path === 'bg.intervalMin' || path === 'bg.ambientIntervalMin') schedule(); else B.next({ force: true });
      }
    });
  };

  OW.bg = B;
})();
