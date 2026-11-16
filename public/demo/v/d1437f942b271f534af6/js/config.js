/* Flight Day — namespace, settings store, clock, small helpers.
 * Settings persist in localStorage (app-private inside the Android WebView).
 * No credentials live in code: the Home Assistant URL/token and API keys are
 * entered in the settings screen and stored only on the device. */
(function () {
  'use strict';
  const OW = (window.OW = window.OW || {});
  // Paired-screen transport boundary; metadata comes only from flightday/model.
  OW.screenCommandAllowed=message=>{const m=typeof message==='string'?{type:message}:message;return !!m&&typeof m.type==='string'&&(m.type.startsWith('flightday/')||['auth','get_states','subscribe_entities'].includes(m.type)||m.type==='subscribe_events'&&m.event_type==='state_changed');};
  // ONBOARDING §6 crew keys also belong to the core/static demo, which omits setup.
  OW.crewCopy = Object.freeze({
  "crew.title": "Crew",
  "crew.everyone": "Everyone",
  "crew.member": "crew member",
  "crew.members": "crew members",
  "crew.add": "Add a crew member in Home Assistant → People",
  "crew.wakes": "Joins Everyone launches",
  "crew.phone": "{name}'s phone wakes them on quiet launches",
  "crew.private": "Only in {name}'s briefing",
  "crew.quiet_fallback": "Quiet launch · needs {name}'s phone · full launch instead",
  });
  OW.crewText = (key, params = {}) => String(OW.onboardingCopy?.['crew.' + key] || OW.crewCopy['crew.' + key] || '').replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
  const params = new URLSearchParams(location.search);
  OW.params = params;

  /** panel | tv | dream | web (plain browser) */
  OW.mode = params.get('mode') || 'web';
  OW.isDream = OW.mode === 'dream';
  OW.isTV = OW.mode === 'tv';

  // ---- clock (supports ?now=2026-11-14T06:30 for testing dayparts) --------------
  let offset = 0;
  if (params.get('now')) {
    const t = Date.parse(params.get('now'));
    if (!isNaN(t)) offset = t - Date.now();
  }
  OW.now = () => new Date(Date.now() + offset);
  OW.nowMs = () => Date.now() + offset;

  // ---- settings -----------------------------------------------------------------
  const DEFAULTS = {
    theme: 'tokyo-night',            // tokyo-night | starship
    provider: 'local',               // local (real sources only) | ha
    demo: false,                     // legacy key; demo transport is selected by ?demo=1
    units: 'f',                      // f | c
    display: { timeFormat: 'shared' }, // per-screen override; shared HA defaults to 12h
    brightness: 0,                   // 0 = leave Android's auto-brightness alone
    ambient: { idleMin: 5, mode: OW.mode === 'panel' ? 'animated' : 'still', wallpaper: {source:'auto',scene:'auto',pack:null}, pause_on_battery:true },   // mode: still | animated | live (per screen)
    schedule: { offEnabled: true, off: '23:00', launchEnabled: true, launch: '06:30', nightMode: 'blackout' },
    bg: {
      mode: 'living',                // living = rotation engine, theme = fixed theme wallpaper
      intervalMin: 10,               // dashboard rotation
      ambientIntervalMin: 2,         // ambient / screensaver rotation
      apod: true,
      nasa: true,
      apodKey: 'DEMO_KEY',           // public demo key; put your own in settings
    },
    launch: {
      api: 'prod',                   // prod = ll.thespacedevs.com, dev = lldev.thespacedevs.com
      hours: 12,                     // launch-day mode window for any launch
      featuredHours: 72,             // ...and for featured vehicles/missions
      featured: ['starship', 'artemis', 'crew', 'new glenn', 'falcon heavy', 'sls', 'starliner'],
      chime: false,
      track: '',                     // pinned mission: 'l<launch id>' | 'e<event id>' ('' = automatic)
      // favourite order, best first; each entry may list alternatives with |
      // "@usa" matches any launch by a US provider or from a US pad. Within a tier the more popular mission leads.
      priority: ['spacex|starship|falcon|dragon|nasa|artemis|sls', 'blue origin|new glenn|new shepard|amazon|kuiper', '@usa'],
      hide: [],                      // providers / vehicles that should never lead (still listed)
    },
    home: { name: '', lat: null, lon: null, source: '' },   // from Home Assistant's config (or typed in settings); never hardcoded
    visible: { km: 320, alerts: true },          // launches within this distance of home count as "visible from home"
    ha: { url: '', token: '', lights: [], scenes: [], machines: [], hidden: [] },
    tv: { appleTvInput: '', autoReturn: true, hideApps: [], appleApps: [] },   // appleApps: Apple TV app names to pin on the home row   // TV mode: HDMI input id of the Apple TV ('' = auto-detect)
    people: { partner: { name: '' } },
    sounds: { notice: 'off' },
    sleep: { liftoffDb: 0, weekday: '06:30', weekend: '08:30', last: '', sound: 'Thunderstorm', timer: 0, alarm: true, audio: 'auto', urls: {}, look: 'auto', alarmMax: 0, behavior: 'off', nightBrightness: 1 },   // alarmMax: loudest the alarm gets on the bedroom speaker (0 = night volume + 10, at most 25)   // audio: which screen plays the sleep sound (auto = the bedroom TV)   // Goodnight picker presets
    // cameras: go2rtc base URL for H.264 live (streams are named <camera object id>_h264); battery cams are tap-only / 60 s
    cams: { go2rtc: '', liveMinutes: 10, autoLive: true, battery: ['doorbell', "Camera"] },
    areas: { space: true, house: true, night: true, status: true },   // which areas the top bar offers on this screen
    wallhub: { url: '', token: '' },
    house: null,
    screen: { id: '', name: '' },
    room: '',                        // which room this screen is in (TV handoff): 'bedroom', 'living room'
    usage: { url: '' },              // where usage.json is published (empty = the file pushed onto this device)
  };
  const KEY = OW.demo?.active ? 'ow.demo.settings.v1' : 'ow.settings.v1';
  const listeners = [];

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!isObj(over)) return out;
    for (const k of Object.keys(over)) {
      out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
    }
    return out;
  }
  // Only the private native house adapter may retain its pre-v3 televisionAdapter credential.
  let tvNativeBridge = null, tvNativeFlavor = null;
  function legacyTvPskAllowed(value) {
    if (OW.demo?.active || value.ha?.paired || OW.data?.contract === 3) return false;
    const native = window.flightdayNative;
    if (typeof native?.tvAdapter !== 'function') return false;
    if (native !== tvNativeBridge) {
      tvNativeBridge = native; tvNativeFlavor = null;
      try { tvNativeFlavor = JSON.parse(native.info?.() || '{}')?.flavor; } catch (_) {}
    }
    const flavor = OW.host?.info?.flavor || tvNativeFlavor;
    return flavor !== 'public' && (value.ha?.flavor === 'house' || value.house?.screens?.some(s => s.legacy_id));
  }
  function stripTvPsk(value) {
    if (!legacyTvPskAllowed(value) && value.tv) delete value.tv.tvAdapterPsk;
    return value;
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}'), value = stripTvPsk(merge(DEFAULTS, raw));
      if (raw.tv && Object.hasOwn(raw.tv, "tvAdapterPsk") && !Object.hasOwn(value.tv, "tvAdapterPsk")) {
        try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (_) {}
      }
      return value;
    }
    catch (e) { return merge(DEFAULTS, {}); }
  }
  let state = load();
  if (state.ambient.mode === 'live') state.ambient.mode = 'stream';
  if (OW.demo?.active) state = merge(DEFAULTS, {ambient:{mode:'wallpaper',wallpaper:{source:'scenes',scene:'auto',pack:null},pause_on_battery:true},provider:'ha',demo:false,ha:{url:'https://demo.invalid',token:'sample'},wallhub:{url:'https://demo.invalid',token:'sample'},home:{name:'',lat:null,lon:null,source:''},people:{partner:{name:'Riley'}},schedule:{offEnabled:false,launchEnabled:false},cams:{autoLive:false},usage:{url:''}});

  OW.config = {
    defaults: DEFAULTS,
    legacyTvPskAllowed: () => legacyTvPskAllowed(state),
    clearLegacyTvPsk() {
      if (state.tv) delete state.tv.tvAdapterPsk;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    },
    get(path) {
      stripTvPsk(state);
      return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state);
    },
    set(path, value) {
      if (path === "tv.tvAdapterPsk" && !legacyTvPskAllowed(state)) return;
      const keys = path.split('.');
      let o = state;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!isObj(o[keys[i]])) o[keys[i]] = {};
        o = o[keys[i]];
      }
      if (o[keys[keys.length - 1]] === value) return;
      o[keys[keys.length - 1]] = value;
      stripTvPsk(state);
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
      listeners.forEach((fn) => { try { fn(path, value); } catch (e) { console.error(e); } });
    },
    on(fn) { listeners.push(fn); },
    reload() { state = load(); },
  };

  // URL overrides (not persisted): ?theme=starship&lldev=1
  if (params.get('theme')) state.theme = params.get('theme');
  if (params.get('lldev')) state.launch.api = 'dev';

  // ---- tiny state store for UI toggles (tasks, lights...) ------------------------
  OW.store = {
    get(key, fallback) {
      try { const v = localStorage.getItem((OW.demo?.active ? 'ow.demo.' : 'ow.') + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem((OW.demo?.active ? 'ow.demo.' : 'ow.') + key, JSON.stringify(value)); } catch (e) { /* ignore */ } },
  };

  // ---- event emitter mixin ---------------------------------------------------------
  OW.emitter = function (target) {
    const subs = [];
    target.on = (fn) => { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; };
    target.emit = (topic, payload) => subs.slice().forEach((fn) => { try { fn(topic, payload); } catch (e) { console.error(e); } });
    return target;
  };

  // ---- formatting ------------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  OW.fmt = {
    pad,
    /** Signed milliseconds until an event; alarm clocks use T-0:09 below a minute. */
    count(ms, alarm) {
      const before = ms >= 0, sec = Math.floor(Math.abs(ms) / 1000);
      const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = pad(sec % 60);
      let value;
      if (before && sec >= 86400) value = Math.floor(sec / 86400) + 'd ' + (h % 24) + 'h';
      else if (h) value = (before ? pad(h) : h) + ':' + pad(m) + ':' + s;
      else if (!before && sec < 60) value = s;
      else value = (!before ? m : sec < 60 && alarm ? '0' : pad(m)) + ':' + s;
      return 'T' + (before ? '-' : '+') + value;
    },
    hm(d) { d = new Date(d); return pad(d.getHours()) + ':' + pad(d.getMinutes()); },
    dateLong(d) { d = new Date(d); return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); },
    dateBar(d) { d = new Date(d); return DAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); },
    dayShort(d) { d = new Date(d); return DAYS[d.getDay()].slice(0, 3); },
    monthDay(d) { d = new Date(d); return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); },
    /** "42 min", "2 h 14 min", "3 d 4 h" */
    span(ms) {
      const m = Math.max(0, Math.round(Math.abs(ms) / 60000));
      if (m < 60) return m + ' min';
      const h = Math.floor(m / 60);
      if (h < 24) return h + ' h ' + pad(m % 60) + ' min';
      const d = Math.floor(h / 24);
      return d + ' d ' + (h % 24) + ' h';
    },
    /** mission clock: "02:14:37", "3d 04:12:09" */
    hms(ms) {
      let s = Math.floor(Math.abs(ms) / 1000);
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      return (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
    },
    /** elapsed: "4 y 323 d", "212 d 04 h" */
    elapsed(ms) {
      const d = Math.floor(Math.abs(ms) / 86400000);
      if (d >= 365) return Math.floor(d / 365.25) + ' y ' + Math.round(d % 365.25) + ' d';
      const h = Math.floor((Math.abs(ms) % 86400000) / 3600000);
      return d + ' d ' + pad(h) + ' h';
    },
    /** relative day label for a date: "today 20:57", "Sat 03:12", "Nov 30" */
    when(t, precise) {
      const d = new Date(t), n = OW.now();
      const day0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
      const diff = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day0) / 86400000);
      const time = precise === false ? '' : ' ' + OW.fmt.hm(d);
      if (diff === 0) return 'today' + time;
      if (diff === 1) return 'tomorrow' + time;
      if (diff > 1 && diff < 7) return OW.fmt.dayShort(d) + time;
      return OW.fmt.monthDay(d) + (precise === false ? '' : time);
    },
    tokens(n) {
      if (n == null) return '–';
      if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k';
      return String(n);
    },
    usd(n) { return n == null ? '–' : '$' + (n >= 100 ? n.toFixed(0) : n.toFixed(2)); },
    ago(t) {
      const m = Math.round((OW.nowMs() - new Date(t).getTime()) / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      if (m < 1440) return Math.round(m / 60) + 'h ago';
      return Math.round(m / 1440) + 'd ago';
    },
  };

  // PARITY §4.3: foreign tile lists are ordering hints; visibility is explicit.
  OW.homeTileOrder = (ids, all, local) => {
    const legacy = { launch: 'now', scenes: 'house' }, retired = ['orbit', 'wire', 'manifest'];
    const order = [];
    (ids || []).forEach(id => {
      if (retired.includes(id)) return;
      id = local[legacy[id] || id] || id;
      if (all.includes(id) && !order.includes(id)) order.push(id);
    });
    if (!order.includes('hero')) order.unshift('hero');
    return order.concat(all.filter(id => !order.includes(id)));
  };
  // PARITY §5: after 20:00, or once today's last event ends, tomorrow leads.
  OW.agendaDay = a => {
    const today = a.today || [], tomorrow = OW.now().getHours() >= 20 || (today.length > 0 && today.every(e => e.end <= OW.nowMs()));
    const events = tomorrow ? (a.tomorrow || []) : today;
    return { tomorrow, label: tomorrow ? 'Tomorrow' : 'Today', events, next: tomorrow ? events.find(e => !e.allDay && e.end > OW.nowMs()) || a.next : a.next };
  };

  OW.reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  OW.ambientDirectorWindow = (l, now) => l && l.precise && now >= l.net - 60 * 60000 && now < l.net + 20 * 60000 && !/Hold|Failure/.test(l.status);

  OW.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  OW.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  OW.hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
})();
