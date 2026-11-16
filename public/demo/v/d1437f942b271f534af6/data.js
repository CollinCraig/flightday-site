/* Flight Day — data layer.
 *
 * One adapter interface, real sources first:
 *   LocalProvider          DEFAULT. Only real data: the device's own calendar
 *                          (Android calendar provider), Open-Meteo weather for the
 *                          configured location, live panel telemetry. Everything
 *                          that has no source yet is null and its tile shows an
 *                          honest "standby" state. Nothing is invented.
 *   HomeAssistantProvider  stub: websocket + REST client for Home Assistant
 *                          (lights, scenes, media, cameras), URL + token from settings.
 *   Demo transport         opt-in labelled fictional HA + hub; same provider paths.
 *
 * Adapter interface (what the UI uses, nothing else):
 *   OW.data.state                 current snapshot; a section is null when it has no source
 *   OW.data.has(section)          true when that section has data (real or demo)
 *   OW.data.isDemo(section)       true when the section is sample data
 *   OW.data.on(fn)                fn(topic) whenever something changed
 *   OW.data.call(action, payload) request a change (scene, light, media, ...)
 *   OW.data.status                {provider, connected, detail}
 *
 * No credentials in this file. Ever.
 */
(function () {
  'use strict';
  const OW = window.OW;

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------
  function at(h, m, dayOffset) {
    const n = OW.now();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + (dayOffset || 0), h, m || 0, 0, 0).getTime();
  }
  function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }

  /** Sunrise/sunset (local clock) from date + latitude. Good to a few minutes; no location => 40°N. */
  function sunTimes(date, lat) {
    lat = lat == null ? 40 : lat;
    const rad = Math.PI / 180;
    const decl = -23.44 * Math.cos(rad * (360 / 365) * (dayOfYear(date) + 10));
    const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad));
    const H = Math.acos(OW.clamp(cosH, -1, 1)) / rad / 15; // half day length, hours
    const noon = 12 + (date.getMonth() >= 2 && date.getMonth() <= 9 ? 1 : 0) - 0.1; // rough DST / zone centre
    const toMs = (h) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).getTime() + h * 3600000;
    return { sunrise: toMs(noon - H), sunset: toMs(noon + H) };
  }
  OW.sunTimes = sunTimes;

  // ---------------------------------------------------------------------------
  // Mock provider
  // ---------------------------------------------------------------------------
  class MockProvider {
    constructor(hub) {
      this.hub = hub;
      this.name = 'mock';
      this.status = { provider: 'mock', connected: true, detail: 'sample data' };
    }
    start() {
      this.hub.state = {demo:{}};
      this.hub.emit('all');
      this.startDrift();
    }
    /** demo only: slow drift so sample tiles are not frozen */
    startDrift() {
      this.timer = setInterval(() => {
        const s = this.hub.state;
        if (!s.demo.machines) return;
        (s.machines || []).forEach((m) => { if (m.status !== 'off' && m.id !== 'panel') m.cpu = OW.clamp(Math.round(m.cpu + (Math.random() - 0.5) * 8), 2, 97); });
        this.hub.emit('machines');
      }, 15000);
    }
    stop() { clearInterval(this.timer); clearInterval(this.dayTimer); }

    call(action, p) {
      const s = this.hub.state;
      p = p || {};
      const find = (list, id) => list.find((x) => x.id === id);
      switch (action) {
        case 'scene.activate': {
          s.activeScene = s.activeScene === p.id ? null : p.id;
          OW.store.set('scene', s.activeScene);
          const set = (id, on, level) => { const l = find(s.lights, id); if (l) { l.on = on; if (level != null) l.level = level; } };
          if (s.activeScene === 'morning') { set('living', true, 70); set('kitchen', true, 70); set('bedroom', true, 50); }
          if (s.activeScene === 'movie') { set('living', true, 12); set('kitchen', false); set('porch', false); }
          if (s.activeScene === 'dinner') { set('living', true, 40); set('kitchen', true, 40); }
          if (s.activeScene === 'goodnight') s.lights.forEach((l) => { l.on = false; });
          this.saveLights();
          return this.hub.emit('scenes'), this.hub.emit('lights');
        }
        case 'light.toggle': { const l = find(s.lights, p.id); if (l) l.on = !l.on; this.saveLights(); return this.hub.emit('lights'); }
        case 'light.all': { s.lights.forEach((l) => { l.on = !!p.on; }); this.saveLights(); return this.hub.emit('lights'); }
        case 'task.toggle': {
          const t = find(s.tasks, p.id);
          if (t) { t.done = !t.done; const d = OW.store.get('tasks', {}); d[t.id] = t.done; OW.store.set('tasks', d); }
          return this.hub.emit('tasks');
        }
        case 'media.playpause': {
          const np = s.nowPlaying;
          if (np.state === 'playing') { np.positionSec = this.hub.position(np); np.state = 'paused'; }
          else { np.startedAt = OW.nowMs() - np.positionSec * 1000; np.state = 'playing'; }
          return this.hub.emit('media');
        }
        case 'media.next': case 'media.prev': {
          const tracks = [['Interstellar — Main Theme', 'Hans Zimmer', 254], ['Cornfield Chase', 'Hans Zimmer', 126], ['Time', 'Hans Zimmer', 275], ['Outro', 'M83', 247], ['Space Oddity', 'David Bowie', 318]];
          this.track = ((this.track || 0) + (action === 'media.next' ? 1 : tracks.length - 1)) % tracks.length;
          const t = tracks[this.track];
          Object.assign(s.nowPlaying, { title: t[0], artist: t[1], durationSec: t[2], positionSec: 0, startedAt: OW.nowMs(), state: 'playing' });
          return this.hub.emit('media');
        }
        case 'media.volume': { s.nowPlaying.volume = OW.clamp(s.nowPlaying.volume + (p.delta || 0), 0, 100); s.audioAdapter[0].volume = s.nowPlaying.volume; return this.hub.emit('media'); }
        case 'tv.power': { const tv = p.id === 'bedroom' ? s.bedroomTv : s.tv; tv.power = !tv.power; return this.hub.emit('tv'); }
        case 'tv.mute': { s.tv.muted = !s.tv.muted; return this.hub.emit('tv'); }
        case 'tv.playpause': { s.tv.state = s.tv.state === 'playing' ? 'paused' : 'playing'; return this.hub.emit('tv'); }
        case 'tv.input': { const ins = ['Apple TV', 'HDMI 2 · PS5', 'Google TV']; s.tv.input = ins[(ins.indexOf(s.tv.input) + 1) % ins.length]; return this.hub.emit('tv'); }
        case "audioAdapter.groupAll": { const g = s.audioAdapter.every((r) => r.state !== 'idle'); s.audioAdapter.forEach((r, i) => { r.state = i === 0 ? 'playing' : g ? 'idle' : 'grouped'; }); return this.hub.emit("audioAdapter"); }
        case "audioAdapter.play": { s.nowPlaying.title = p.name || s.nowPlaying.title; s.nowPlaying.artist = 'Speaker favorite'; s.nowPlaying.positionSec = 0; s.nowPlaying.startedAt = OW.nowMs(); s.nowPlaying.state = 'playing'; return this.hub.emit('media'); }
        case 'screensaver.set': { s.screensaver[p.key] = !s.screensaver[p.key]; return this.hub.emit('tv'); }
        case 'machine.wake': { const m = find(s.machines, p.id); if (m) { m.status = 'ok'; m.detail = 'waking…'; m.cpu = 20; } return this.hub.emit('machines'); }
        case 'security.arm': { s.security.armed = s.security.armed === 'away' ? 'home' : 'away'; return this.hub.emit('cams'); }
        case 'chime': return console.log('[mock] chime hook:', p.reason || '');   // stub: audioAdapter chime
        default: console.warn('mock: unknown action', action);
      }
    }
    saveLights() {
      const out = {};
      this.hub.state.lights.forEach((l) => { out[l.id] = { on: l.on, level: l.level }; });
      OW.store.set('lights', out);
    }
  }

  // ---------------------------------------------------------------------------
  // Local provider — real data only
  // ---------------------------------------------------------------------------
  const SECTIONS = ['weather', 'events', 'tasks', 'lights', 'nowPlaying', 'tv', 'bedroomTv', "audioAdapter", 'favorites', 'cameras', 'camEvents', 'security', 'machines', 'builds', 'homelab', 'network', 'voice'];

  /** Scenes the wall can run by itself (no smart-home hub needed). */
  const LOCAL_SCENES = [
    { id: 'morning', name: 'Morning launch', icon: 'rocket', sub: 'wake sequence', tone: 'org', local: true },
    { id: 'ambient', name: 'Ambient', icon: 'orbit', sub: 'clock · living background', tone: 'acc', local: true },
    { id: 'nextimage', name: 'Next image', icon: 'next', sub: 'advance the feed', tone: 'mag', local: true },
    { id: 'goodnight', name: 'Goodnight', icon: 'moon', sub: 'panel screen off', tone: 'yel', local: true },
  ];

  // WMO weather codes (Open-Meteo) -> dashboard condition + text
  function wmo(code) {
    if (code === 0) return ['clear', 'Clear'];
    if (code <= 2) return ['clear', 'Mostly clear'];
    if (code === 3) return ['cloudy', 'Overcast'];
    if (code <= 48) return ['cloudy', 'Fog'];
    if (code <= 57) return ['rain', 'Drizzle'];
    if (code <= 67) return ['rain', 'Rain'];
    if (code <= 77) return ['snow', 'Snow'];
    if (code <= 82) return ['rain', 'Showers'];
    if (code <= 86) return ['snow', 'Snow showers'];
    return ['storm', 'Thunderstorm'];
  }

  class LocalProvider extends MockProvider {
    constructor(hub) {
      super(hub);
      this.name = 'local';
      this.status = { provider: 'local', connected: true, detail: 'calendar · panel · space feeds' };
      this.timers = [];
    }
    start() {
      this.weatherStopped = false;
      this.openMeteoWeather = null;
      this.rainForecast = null;this.appleRainForecast=null;
      this.nowcastUnsubscribe=OW.hub?.on((topic,payload)=>{
        if(topic==='weather_nowcast')this.receiveAppleNowcast(payload);
        if(topic==='config'){this.appleRainForecast=null;this.loadAppleNowcast();this.publishWeather();}
        if(topic==='up')this.loadAppleNowcast();
      });
      this.loadAppleNowcast();
      this.timers.push(setInterval(()=>this.loadAppleNowcast(),5*60000));
      const demo = false;
      const st = { demo: {}, scenes: LOCAL_SCENES.slice(), activeScene: null, screensaver: { ambient: true, adFree: true }, calendar: { available: false, reason: 'loading' } };
      SECTIONS.forEach((k) => { st[k] = null; });
      st.events = [];
      this.hub.state = st;
      this.hub.emit('all');

      this.loadCalendar();
      this.loadWeather();
      this.timers.push(setInterval(() => this.loadCalendar(), 2 * 60000));
      this.timers.push(setInterval(() => this.loadWeather(), 15 * 60000));
      this.timers.push(setInterval(() => this.publishWeather(), 60000));
      if (demo) MockProvider.prototype.startDrift.call(this);
    }
    stop() { this.weatherStopped=true;this.nowcastUnsubscribe?.();this.nowcastUnsubscribe=null;this.appleRainRequest=(this.appleRainRequest||0)+1; clearTimeout(this.wxRetry); this.timers.forEach(clearInterval); this.timers = []; clearInterval(this.timer); clearInterval(this.dayTimer); }

    /** Real calendar from the device (today .. +6 days). */
    loadCalendar() {
      const s = this.hub.state, n = OW.now();
      const from = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
      const res = OW.host.calendar ? OW.host.calendar(from, from + 7 * 86400000) : null;
      if (Array.isArray(res)) {
        s.events = res.map((e) => {
          // all-day events are stored in UTC midnight: pin them to the local day
          let start = e.start, end = e.end;
          if (e.allDay) { const d = new Date(e.start); start = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime(); const d2 = new Date(e.end); end = new Date(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate()).getTime(); }
          return { id: e.id, title: e.title, start, end, allDay: !!e.allDay, where: (e.where || '').split(',')[0].slice(0, 40), css: e.color, calendar: e.calendar };
        }).filter((e) => e.end > from);
        this.deviceEvents = s.events.slice();
        s.calendar = { available: true, count: s.events.length };
        delete s.demo.events;
      } else if (!s.demo.events && !(this.haEvents && this.haEvents.length)) {
        this.deviceEvents = null;
        s.events = [];
        // TVs have no calendar accounts of their own: no permission prompt there, HA calendars fill in
        s.calendar = { available: false, reason: res && res.error === 'permission' && !OW.isTV ? 'permission' : OW.host.available ? 'unavailable' : 'no device calendar here' };
      }
      this.hub.emit('events');
    }

    /**
     * Severe-weather alerts for the home location from the US National Weather Service (api.weather.gov).
     * The most severe active alert is attached to the weather as {event, headline, severity, ends}; none = null.
     * Outside the US the API has nothing for the point and the alert simply stays empty.
     */
    async loadAlerts(lat, lon) {
      const s = this.hub.state;
      try {
        const r = await OW.net.json('https://api.weather.gov/alerts/active?point=' + lat.toFixed(3) + ',' + lon.toFixed(3), 600);
        const order = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
        const list = ((r.data && r.data.features) || []).map((f) => f.properties || {}).filter((p) => p.event && (!p.expires || Date.parse(p.expires) > OW.nowMs()))
          .sort((a, b) => (order[a.severity] == null ? 4 : order[a.severity]) - (order[b.severity] == null ? 4 : order[b.severity]));
        const a = list[0];
        const alert = a ? { event: a.event, headline: String(a.headline || a.event).replace(/\s+/g, ' ').slice(0, 200), severity: a.severity || 'Unknown', ends: Date.parse(a.ends || a.expires) || null, count: list.length } : null;
        if (!this.weatherStopped) { if(Array.isArray(r.data?.features))s.weatherAlerts={source:true,as_of:OW.nowMs()-(r.ageSec||0)*1000,items:list.map(a=>({event:a.event,severity:String(a.severity||'unknown').toLowerCase(),starts:Date.parse(a.onset||a.effective||a.sent||a.starts),ends:Date.parse(a.ends||a.expires)}))};this.weatherAlert=alert; this.publishWeather(); }
      } catch (e) { /* no answer: keep what we knew */ }
    }

    weatherLocation() {
      const zone=this.name==='ha' && this.states?.['zone.home']?.attributes;
      const valid=(lat,lon)=>typeof lat==='number' && Number.isFinite(lat) && Math.abs(lat)<=90 && typeof lon==='number' && Number.isFinite(lon) && Math.abs(lon)<=180;
      if(zone && valid(zone.latitude,zone.longitude))return {lat:zone.latitude,lon:zone.longitude,nowcast:true,source:'zone.home'};
      const lat=OW.config.get('home.lat'),lon=OW.config.get('home.lon');
      return {lat,lon,nowcast:false,source:'configured weather',valid:valid(lat,lon)};
    }
    weatherLocationKey() {
      const l=this.weatherLocation();return [l.source,l.lat,l.lon,l.nowcast].join(',');
    }

    publishWeather(emit = true) {
      if (this.weatherStopped) return;
      const s=this.hub.state, before=JSON.stringify(s.weather);
      const next=OW.weatherSource.select({base:this.openMeteoWeather,states:this.states,forecasts:this.weatherForecasts,
        connected:this.name==='ha' && !!this.status.connected,units:OW.config.get('units'),now:OW.nowMs()});
      if (next) {
        next.nowcast=OW.rainNowcast.select(this.appleRainForecast,this.weatherLocation().nowcast && this.rainLocation===this.weatherLocationKey() ? this.rainForecast : null);
        next.rainSoon=OW.rainNowcast.summary(next.nowcast);
        next.alert=this.weatherAlert || null;
        const sun=this.name==='ha' && this.status.connected && this.states?.['sun.sun'];
        if (sun?.attributes) {next.sunrise=Date.parse(sun.attributes.next_rising);next.sunset=Date.parse(sun.attributes.next_setting);}
        next.rainSoonHidden=OW.rainNowcast.bedroomNight(next);
      }
      if (!s.demo.weather || next) {s.weather=next;if(next)delete s.demo.weather;}
      if (emit && JSON.stringify(s.weather)!==before) this.hub.emit('weather');
    }

    receiveAppleNowcast(payload) {
      if(this.weatherStopped)return;
      // A newer stream value supersedes any in-flight GET, including unavailable/dry.
      this.appleRainRequest=(this.appleRainRequest||0)+1;
      this.appleRainForecast=OW.rainNowcast.adapters.wallhub.fromResponse(payload);
      this.publishWeather();
    }
    async loadAppleNowcast() {
      const request=this.appleRainRequest=(this.appleRainRequest||0)+1;
      if(!OW.hub?.enabled?.()){this.appleRainForecast=null;return;}
      try {
        const response=await OW.hub.get('/v1/weather/nowcast');
        if(this.weatherStopped||request!==this.appleRainRequest)return;
        this.appleRainForecast=response.ok?OW.rainNowcast.adapters.wallhub.fromResponse(response.data):null;
      }catch(_){if(request!==this.appleRainRequest)return;this.appleRainForecast=null;}
      this.publishWeather();
    }

    /** Open-Meteo stays warm as an independent fallback for optional HA weatherProvider. */
    async loadWeather() {
      const s = this.hub.state;
      const location=this.weatherLocation(),lat=location.lat,lon=location.lon;
      if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat)>90 || typeof lon !== 'number' || !Number.isFinite(lon) || Math.abs(lon)>180) {
        this.openMeteoWeather=null;this.rainForecast=null;
        return this.publishWeather();
      }
      const locationKey=this.weatherLocationKey();
      if(this.rainLocation!==locationKey)this.rainForecast=null;
      this.rainLocation=locationKey;
      const f = OW.config.get('units') !== 'c';
      const baseUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
        '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset' +
        '&temperature_unit=' + (f ? 'fahrenheit' : 'celsius') + '&timezone=auto&timeformat=unixtime&forecast_days=2&precipitation_unit=mm';
      const url = probability => baseUrl+(location.nowcast ? '&minutely_15=precipitation'+(probability?',precipitation_probability':'')+'&forecast_minutely_15=12&past_minutely_15=4' : '');
      try {
        let r;
        try {r=await OW.net.json(url(this.rainProbability!==false),900);}
        catch(error){
          if(this.rainProbability===false || !/\b400\b/.test(error.message||''))throw error;
          this.rainProbability=false;
          r=await OW.net.json(url(false),900);
        }
        if (this.weatherStopped || this.weatherLocationKey()!==locationKey) return;
        const d = r.data, c = d.current, cond = wmo(c.weather_code);
        this.rainForecast=location.nowcast ? OW.rainNowcast.adapters.openMeteo.fromResponse(d,{stale:!!r.stale,fetchedAt:Date.now()-(r.ageSec||0)*1000}) : null;
        let note = '';
        const hours = (d.hourly && d.hourly.time) || [];
        const nowMs = OW.nowMs();
        for (let i = 0; i < hours.length; i++) {
          const t = OW.rainNowcast.timestamp(hours[i],d.utc_offset_seconds);
          if (t > nowMs && t < nowMs + 12 * 3600000 && d.hourly.precipitation_probability[i] >= 55 && cond[0] !== 'rain' && cond[0] !== 'storm') { note = 'rain likely after ' + OW.fmt.hm(t); break; }
        }
        // the next twelve hours, and one plain sentence about them
        const next = [];
        for (let i = 0; i < hours.length && next.length < 12; i++) {
          const t = OW.rainNowcast.timestamp(hours[i],d.utc_offset_seconds);
          if (t > nowMs - 30 * 60000) next.push({ t, temp: Math.round(d.hourly.temperature_2m[i]), pop: d.hourly.precipitation_probability[i] || 0, condition: wmo(d.hourly.weather_code[i])[0], night: d.hourly.is_day ? !d.hourly.is_day[i] : false });
        }
        const wet = (h) => h.pop >= 50 || h.condition === 'rain' || h.condition === 'storm';
        const hi = Math.round(d.daily.temperature_2m_max[0]), lo = Math.round(d.daily.temperature_2m_min[0]);
        const evening = OW.now().getHours() >= 17;
        const tail = evening ? 'low ' + lo + '°' : hi + '°';
        const firstWet = next.find(wet), firstDry = next.find((h) => !wet(h));
        const kind = (h) => (h.condition === 'storm' ? 'Storms' : 'Rain');
        let summary;
        if (firstWet && next.indexOf(firstWet) > 0) summary = kind(firstWet) + ' after ' + OW.fmt.hm(firstWet.t) + ', ' + tail;
        else if (firstWet && firstDry) summary = kind(firstWet) + ' until ' + OW.fmt.hm(firstDry.t) + ', ' + tail;
        else if (firstWet) summary = kind(firstWet) + ' for the next twelve hours, ' + tail;
        else summary = cond[1] + (evening ? ' tonight, ' : ' today, ') + tail;
        this.openMeteoWeather = {
          source:'Open-Meteo', temperatureUnit:f?'°F':'°C', feelsLabel:'Feels like',
          observedAt:Number.isFinite(OW.rainNowcast.timestamp(c.time,d.utc_offset_seconds))?OW.rainNowcast.timestamp(c.time,d.utc_offset_seconds):OW.nowMs()-(r.ageSec||0)*1000,forecastAt:OW.nowMs()-(r.ageSec||0)*1000,
          forecastHours:hours.map((value,i)=>({t:OW.rainNowcast.timestamp(value,d.utc_offset_seconds),precip_prob:d.hourly.precipitation_probability?.[i]??null,precip_mm:d.hourly.precipitation?.[i]??null})),
          hours: next, summary, night: c.is_day === 0, feels: c.apparent_temperature != null ? Math.round(c.apparent_temperature) : null,
          alert: (s.weather && s.weather.alert) || null,
          at: Date.now(),
          temp: Math.round(c.temperature_2m), unit: '°', condition: cond[0], text: cond[1],
          high: Math.round(d.daily.temperature_2m_max[0]), low: Math.round(d.daily.temperature_2m_min[0]),
          note, sunrise: OW.rainNowcast.timestamp(d.daily.sunrise[0],d.utc_offset_seconds), sunset: OW.rainNowcast.timestamp(d.daily.sunset[0],d.utc_offset_seconds), stale: !!r.stale,
        };
        delete s.demo.weather;
        this.loadAlerts(lat, lon);
      } catch (e) {
        if (this.weatherStopped) return;
        // a slow answer is not "no weather": ask again shortly instead of waiting for the next regular refresh
        clearTimeout(this.wxRetry); this.wxRetry = setTimeout(() => this.loadWeather(), 45000);
      }
      this.publishWeather();
    }

    /** Live telemetry of the device the dashboard runs on (native event "panel-stats"). */
    panelStats(p) {
      const s = this.hub.state;
      s.panel = p;
      if (!s.demo.network && p.rssi != null) s.network = { live: true, rssi: p.rssi, linkMbps: p.linkMbps, band: p.freqMhz > 4900 ? '5 GHz' : p.freqMhz ? '2.4 GHz' : '', ping: p.pingMs, online: !!p.online };
      this.hub.emit('machines');
    }

    call(action, p) {
      const s = this.hub.state;
      const section = { 'light.toggle': 'lights', 'light.all': 'lights', 'task.toggle': 'tasks', 'media.playpause': 'nowPlaying', 'media.next': 'nowPlaying', 'media.prev': 'nowPlaying', 'media.volume': 'nowPlaying', 'tv.power': 'tv', 'tv.mute': 'tv', 'tv.playpause': 'tv', 'tv.input': 'tv', "audioAdapter.groupAll": "audioAdapter", "audioAdapter.play": 'nowPlaying', 'machine.wake': 'machines', 'security.arm': 'security' }[action];
      if (action === 'chime') return console.log('[chime hook] ' + ((p && p.reason) || ''));   // stub: audioAdapter chime
      if (action === 'scene.activate' && !s.demo.scenes) return;   // local scenes are momentary and run by the app itself
      if (section && !s.demo[section]) return;                      // no source connected: nothing to control
      super.call(action, p);
    }
  }

  // ---------------------------------------------------------------------------
  // Home Assistant provider
  // ---------------------------------------------------------------------------
  // Websocket API only (no CORS setup needed on the HA side). Entities are
  // discovered, not hard-coded: the entity/device/area registries tell us the
  // integration ("platform") and room of every entity, so audioAdapter rooms, Apple
  // TVs, tvAdapter TVs, lights, switches, scenes, calendars and cameras map
  // themselves. Optional overrides live in settings under `ha.*`:
  //   ha.url, ha.token        connection (provisioned with config.json, never in source)
  //   ha.lights               [entity_id,...] to pin/limit the lights tile
  //   ha.scenes               [entity_id,...] to pin/limit the scene buttons
  //   ha.machines             [entity_id,...] binary_sensors shown as machines
  //   room                    this screen's room ("bedroom", "living room") for TV handoff
  // Everything the local provider knows (device calendar, panel telemetry,
  // Open-Meteo weather) stays as the baseline underneath.
  class HomeAssistantProvider extends LocalProvider {
    constructor(hub) {
      super(hub);
      this.name = 'ha';
      this.status = { provider: 'ha', connected: false, detail: 'not configured' };
      this.msgId = 1;
      this.pending = new Map();
      this.states = {};
      this.reg = {};          // entity_id -> {platform, area, hidden, category, name}
      this.haEvents = [];
      this.forecastListeners=new Map();
      this.weatherSubscribed=new Set();
      const cache=OW.store.get('haWeatherForecasts',null);
      this.weatherForecasts=cache?.base===this.base ? cache.items || {} : {};
      if(this.weatherForecasts.hourly||this.weatherForecasts.daily)this.weatherForecasts={[OW.weatherSource.entity]:this.weatherForecasts};
    }
    get base() { return (OW.config.get('ha.url') || '').replace(/\/+$/, ''); }
    get token() { return (this.connectionCredential?.url===this.base?this.connectionCredential.token:OW.config.get('ha.token')) || ''; }

    start() {
      super.start();
      this.closed = false;
      if (!this.base) { this.setStatus(false, 'add the URL in settings'); return; }
      this.connect();
    }
    stop() {
      super.stop();
      this.closed = true;
      this.client?.disconnect();this.cancelCredentialAuth?.();
      clearTimeout(this.retry); clearTimeout(this.applyTimer); clearInterval(this.calTimer);clearTimeout(this.scheduleHistoryTimer);
      if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } }
    }
    setStatus(connected, detail) { const disconnectedAt=connected?null:this.status?.connected?OW.nowMs():this.status?.disconnectedAt??OW.nowMs();this.status = { provider: 'ha', connected, detail, disconnectedAt, at: connected ? Date.now() : (this.status && this.status.at) || 0 }; this.hub.emit('status'); }

    /** Auth-only connection: a positive HA auth_ok, never a TCP open, commits rotation. */
    authenticateCredential(token,issuedAt=Date.now()) {
      const base=this.base,deadline=issuedAt+10000;
      return new Promise((resolve,reject)=>{
        let ws,timer,done=false;
        const cancel=()=>finish('closed');
        const finish=err=>{if(done)return;done=true;if(this.cancelCredentialAuth===cancel)this.cancelCredentialAuth=null;clearTimeout(timer);if(ws){ws.onmessage=null;ws.onerror=null;ws.onclose=null;try{ws.close();}catch(_){}}err?reject(Object.assign(Error('Credential authentication failed'),{code:err})):resolve();};
        this.cancelCredentialAuth=cancel;
        // A suspended WebView may resume before its timers run. Never first-use
        // a candidate hours later, including after a slow native save callback.
        if(!Number.isFinite(deadline)||Date.now()>=deadline){finish('timeout');return;}
        try{ws=new WebSocket(base.replace(/^http/,'ws')+'/api/websocket');}catch(_){finish('unreachable');return;}
        timer=setTimeout(()=>finish('timeout'),Math.min(10000,Math.max(0,deadline-Date.now())));
        ws.onmessage=event=>{let m;try{m=JSON.parse(event.data);}catch(_){return;}if(this.base!==base){finish('closed');return;}if(m.type==='auth_required'){if(Date.now()>=deadline){finish('timeout');return;}try{ws.send(JSON.stringify({type:'auth',access_token:token}));}catch(_){finish('closed');}}else if(m.type==='auth_ok')finish();else if(m.type==='auth_invalid')finish('auth_invalid');};
        ws.onerror=()=>finish('unreachable');ws.onclose=()=>finish('closed');
      });
    }
    // Credential changes reconnect the transport without a native launch, key, display or audio action.
    reconnectCredential(token) {
      this.connectionCredential={url:this.base,token};this.client?.disconnect();
      clearTimeout(this.retry);clearInterval(this.calTimer);
      if(this.ws){this.ws.onclose=null;this.ws.onmessage=null;this.ws.close();}
      this.pending.forEach(p=>p.reject({code:'closed'}));this.pending.clear();
      this.closed=false;this.connect();
    }
    // ---- connection ----------------------------------------------------------------
    connect() {
      let ws;
      try { ws = new WebSocket(this.base.replace(/^http/, 'ws') + '/api/websocket'); }
      catch (e) { return this.setStatus(false, 'bad URL'); }
      this.ws = ws;
      this.forecastListeners.clear();this.weatherSubscribed.clear();
      this.setStatus(false, 'connecting…');
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.type === 'auth_required') {
          if (!this.token) { this.setStatus(false, 'reachable — token needed'); this.closed = true; ws.close(); return; }
          ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
        } else if (m.type === 'auth_ok') this.onReady(m).catch(e=>{this.client?.disconnect();this.setStatus(false,e?.code==='unsupported_contract'?'Update Flight Day':'Flight Day unavailable · '+(e?.code||'connection error'));});
        else if (m.type === 'auth_invalid') {
          const saved=OW.onboardingNative?.credential,candidate=saved?.url===this.base&&saved.principal==='screen'?saved.pendingRotation?.token:null;
          // An auth_ok response can be lost after the server retires the old token.
          // Try the durable candidate once before declaring this screen removed,
          // even after 24 h: an already-used candidate is active, not expiring pending.
          if(typeof candidate==='string'&&candidate&&candidate!==this.token){
            this.client?.disconnect();this.connectionCredential={url:this.base,token:candidate};ws.onmessage=null;ws.onclose=null;ws.close();this.connect();return;
          }
          const principal=this.client?.info?.principal;
          const screen=principal?principal==='screen':saved?.principal==='screen'||OW.config.get('ha.paired')===true;
          this.setStatus(false, screen?'This screen was removed from Flight Day':'token rejected');this.client?.disconnect(); this.closed = true; ws.close();
          if(screen)this.hub.emit('auth-required',{reason:'removed',url:this.base,screen:saved?.screen});
        }
        else if (m.type === 'result' && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.success ? p.resolve(m.result) : p.reject(m.error || {}); }
        else if (m.type === 'event' && this.forecastListeners.has(m.id)) this.forecastListeners.get(m.id)(m.event);
        else if (this.client?.contract!==3 && m.type === 'event' && m.event && m.event.event_type === "flightday_wall") {
          const d = m.event.data || {};
          OW.host.log("flightday_wall event: " + d.action);
          if(d.action==='comfort')this.refreshComfort();
          this.hub.emit('wall-event', Object.assign({}, d, {time_fired:m.event.time_fired}));
        }
        else if (this.client?.contract!==3 && m.type === 'event' && m.event && m.event.event_type === 'state_changed') {
          const d = m.event.data;
          if (d.new_state) this.states[d.entity_id] = d.new_state; else delete this.states[d.entity_id];
          if (d.entity_id==='input_text.launch_last'||d.entity_id==='script.goodnight'||/^input_datetime\.bedtime_/.test(d.entity_id)){clearTimeout(this.scheduleHistoryTimer);this.scheduleHistoryTimer=setTimeout(()=>this.loadMornings(),300);}
          if (OW.weatherSource.entities.includes(d.entity_id)) this.subscribeWeather();
          if(d.entity_id===OW.roles.related(OW.roles.get('vacuum'),'select','selected_map'))this.loadrobotVacuumRooms();
          if (d.entity_id === 'zone.home' && this.rainLocation!==this.weatherLocationKey()) {this.appleRainForecast=null;this.loadWeather();this.loadAppleNowcast();}
          this.scheduleApply();
        }
      };
      ws.onclose = () => {
        this.client?.disconnect();
        this.pending.forEach((p) => p.reject({ message: 'closed' })); this.pending.clear();
        if (this.closed) return;
        this.setStatus(false, 'reconnecting…');
        this.clearHouse();
        this.retry = setTimeout(() => this.connect(), 15000);
      };
      ws.onerror = () => { if (!this.status.connected) this.setStatus(false, 'unreachable'); };
    }
    send(msg, onEvent) {
      if(this.client?.info?.principal==='screen'&&!OW.screenCommandAllowed(msg))return Promise.reject(Object.assign(Error('Paired screens use Flight Day commands and audited reads'),{code:'policy_denied'}));
      if(this.client&&this.client.contract!==2&&['call_service','subscribe_trigger'].includes(msg.type)&&!(['admin','user'].includes(this.client.info?.principal)&&msg.type==='call_service'))return Promise.reject(Object.assign(Error('Read-only screen: use Flight Day commands'),{code:'policy_denied'}));
      return new Promise((resolve, reject) => {
        if (!this.ws || this.ws.readyState !== 1) return reject({ message: 'not connected' });
        const id = this.msgId++;
        if (onEvent) this.forecastListeners.set(id,onEvent);
        this.pending.set(id, { resolve, reject });
        this.ws.send(JSON.stringify(Object.assign({ id }, msg)));
      });
    }
    /** REST helper for one-off calls (needs http.cors_allowed_origins in HA when used from a page). */
    async rest(path, body) {
      if(this.client?.info?.principal==='screen'){const url=new URL(this.base+'/api/'+path);if(body!=null||url.origin!==new URL(this.base).origin||!/^\/api\/calendars\/calendar\.[a-z0-9_]+$/.test(decodeURIComponent(url.pathname)))throw Object.assign(Error('Paired screens use read-only calendar REST'),{code:'policy_denied'});}
      const r = await fetch(this.base + '/api/' + path, { method: body ? 'POST' : 'GET', redirect:this.client?.info?.principal==='screen'?'error':'follow', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error('HA ' + r.status);
      return r.json();
    }

    async onReady(hello) {
      this.client=this.client||OW.haClient.create(this);
      return this.client.open(hello);
    }
    async onLegacyReady(hello) {
      if(this.client?.contract!==2||this.client?.info?.principal==='screen'||OW.config.get('ha.paired')===true)throw Object.assign(Error('Legacy bootstrap is unavailable on paired screens'),{code:'policy_denied'});
      this.setStatus(true, 'HA ' + (hello.ha_version || ''));
      // registries: integration + room of every entity (best effort — a non-admin token just skips them)
      const [ents, devs, areas] = await Promise.all([
        this.send({ type: 'config/entity_registry/list' }).catch(() => []),
        this.send({ type: 'config/device_registry/list' }).catch(() => []),
        this.send({ type: 'config/area_registry/list' }).catch(() => []),
      ]);
      const areaName = {}; areas.forEach((a) => { areaName[a.area_id] = a.name; });
      const devArea = {}; devs.forEach((d) => { devArea[d.id] = d.area_id; });
      this.houseCheckDevices = devs;
      this.roleInput={entities:ents,devices:devs,areas};
      this.reg = {};
      ents.forEach((e) => {
        this.reg[e.entity_id] = { model: devs.find(d=>d.id===e.device_id)?.model||'', platform: e.platform, area: areaName[e.area_id || devArea[e.device_id]] || '', hidden: !!(e.hidden_by || e.disabled_by), category: e.entity_category || null, device: e.device_id };
      });
      // home location comes from Home Assistant's own config (never from source); a manual entry in settings wins
      try {
        const cfg = await this.send({ type: 'get_config' });
        this.temperatureUnit = cfg?.unit_system?.temperature || null;
        this.roleInput.location_name=cfg.location_name;
        if (cfg && typeof cfg.latitude === 'number' && typeof cfg.longitude === 'number' && !(cfg.latitude === 0 && cfg.longitude === 0) && OW.config.get('home.source') !== 'manual') {
          if (OW.config.get('home.lat') !== cfg.latitude || OW.config.get('home.lon') !== cfg.longitude) {
            OW.config.set('home.lat', cfg.latitude); OW.config.set('home.lon', cfg.longitude); OW.config.set('home.name', cfg.location_name || ''); OW.config.set('home.source', 'ha');
          }
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (cfg.time_zone && tz && cfg.time_zone !== tz) OW.host.log('time zone mismatch: this device is ' + tz + ', Home Assistant is ' + cfg.time_zone);
          this.haTimeZone = cfg.time_zone || null;
        }
      } catch (e) { /* older HA or restricted token */ }
      const states = await this.send({ type: 'get_states' });
      this.states = {};
      states.forEach((s) => { this.states[s.entity_id] = s; });
      OW.model.registry=this.reg;
      OW.model.local({...this.roleInput,states,hidden:OW.config.get('ha.hidden')||[]});
      if (this.rainLocation!==this.weatherLocationKey()) this.loadWeather();
      await this.send({ type: 'subscribe_events', event_type: 'state_changed' });
      // the house talks to its screens through one event: flightday_wall {action: goodnight | launch_sequence | wake | blackout | snooze | scrub}
      try { await this.send({ type: 'subscribe_events', event_type: "flightday_wall" }); this.wallEvents = true; }
      catch (e) { this.wallEvents = false; OW.host.log("flightday_wall events not available to this token (" + ((e && e.message) || (e && e.code) || e) + '): following input_boolean.sleep_mode instead'); }
      const byDomain = {};
      states.forEach((s) => { const d = s.entity_id.split('.')[0]; byDomain[d] = (byDomain[d] || 0) + 1; });
      OW.host.log('HA connected: ' + Object.keys(byDomain).sort().map((d) => d + ' ' + byDomain[d]).join(', '));
      OW.host.log('HA media players: ' + states.filter((s) => s.entity_id.startsWith('media_player.')).map((s) => s.entity_id + '[' + ((this.reg[s.entity_id] || {}).platform || '?') + ']').join(' '));
      this.apply();
      this.subscribeWeather();
      this.loadrobotVacuumRooms();
      this.loadMornings();
      this.loadHaCalendars();
      clearInterval(this.calTimer);
      this.calTimer = setInterval(() => {this.loadHaCalendars();this.loadMornings();}, 5 * 60000);
    }

    async refreshComfort() {
      if(this.client?.contract===3)return this.client.refreshReadings();
      try {
        const rows=await this.send({type:'get_states'});
        if(!this.status.connected)return;
        for(const row of rows)if(/^(sensor\.(comfort_|roomSpeaker_)|binary_sensor\.roomSpeaker_|(?:input_boolean|input_number|input_select|input_datetime|input_text)\.(comfort_|fresh_air_))/.test(row.entity_id))this.states[row.entity_id]=row;
        if(!rows.some(s=>s.entity_id==='sensor.comfort_status'))delete this.states['sensor.comfort_status'];
        this.scheduleApply();
      }catch(_){OW.host.log('Comfort refresh unavailable');}
    }
    async loadrobotVacuumRooms() {
      if(this.client?.contract===3)return;
      const request=this.robotVacuumRoomRequest=(this.robotVacuumRoomRequest||0)+1;
      this.robotVacuumRooms=[];
      if(!this.status.connected||!this.states[OW.robotVacuum?.entity]||this.reg?.[OW.robotVacuum?.entity]?.platform!=="robotVacuum")return;
      try {
        const response=await this.send({type:'call_service',domain:"robotVacuum",service:'get_maps',target:{entity_id:OW.robotVacuum.entity},service_data:{},return_response:true});
        if(request!==this.robotVacuumRoomRequest||!this.status.connected)return;
        this.robotVacuumRooms=OW.robotVacuum.rooms(response);this.scheduleApply();
      }catch(_){OW.host.log('Robot vacuum room choices unavailable');this.scheduleApply();}
    }
    subscribeWeather() {
      if(this.client?.contract===3)return;
      if (!this.status.connected) return;
      for(const entity of OW.weatherSource.entities){
        const state=this.states[entity],features=state?.attributes?.supported_features || 0;
        if(!state||['unknown','unavailable'].includes(state.state))continue;
        for(const [type,bit]of [['daily',1],['hourly',2]]){
          const key=entity+':'+type;
          if(!(features&bit)||this.weatherSubscribed.has(key))continue;
          this.weatherSubscribed.add(key);
          this.send({type:'weather/subscribe_forecast',entity_id:entity,forecast_type:type},event=>{
            if(!event||event.type!==type||!Array.isArray(event.forecast))return;
            const cache=this.weatherForecasts[entity]||(this.weatherForecasts[entity]={});
            cache[type]=OW.weatherSource.remember(cache[type],event.forecast,Date.now(),this.states[entity]?.attributes?.temperature_unit);
            OW.store.set('haWeatherForecasts',{base:this.base,items:this.weatherForecasts});this.publishWeather();
          }).catch(()=>{this.weatherSubscribed.delete(key);OW.host.log('Optional HA '+entity+' '+type+' forecast unavailable; using next source');});
        }
      }
    }

    async loadMornings() {
      const request=this.scheduleHistoryRequest=(this.scheduleHistoryRequest||0)+1;
      try {
        const start = new Date(OW.nowMs()-8*86400000).toISOString();
        const groups = await this.send({type:'history/history_during_period',start_time:start,entity_ids:['input_text.launch_last','script.goodnight',...OW.sleepSchedule.days.flatMap(day=>['input_datetime.bedtime_'+day,'input_datetime.launch_time_'+day])],minimal_response:false,no_attributes:true});
        if(request!==this.scheduleHistoryRequest||!this.status.connected)return;
        const rows = groups['input_text.launch_last'] || (Array.isArray(groups) ? groups.flat() : []);
        const byDay = new Map();
        rows.forEach(r => { try { const v=JSON.parse(r.s || r.state); if(v.id && v.outcome)byDay.set(v.id.slice(0,10),v); } catch(_){} });
        try { const v=JSON.parse(this.states['input_text.launch_last']?.state); if(v.id)byDay.set(v.id.slice(0,10),v); }catch(_){}
        const comparison=OW.sleepSchedule.history(groups,this.states,Array.from(byDay.values()).sort((a,b)=>b.id.localeCompare(a.id)).slice(0,7));this.mornings=comparison.mornings;this.scheduleLog=comparison.log;this.apply();
      } catch(_) { OW.host.log('Morning history is unavailable'); }
    }

    scheduleApply() { clearTimeout(this.applyTimer); this.applyTimer = setTimeout(() => this.apply(), 200); }

    clearHouse() {
      const s = this.hub.state;
      ['lights', 'nowPlaying', 'tv', 'bedroomTv', "audioAdapter", 'favorites', 'cameras', 'handoff'].forEach((k) => { if (!s.demo[k]) s[k] = null; });
      this.publishWeather(false);
      if(s.sleepSchedule)s.sleepSchedule=OW.sleepSchedule.read(this.states,false);
      if(s.timeFormat)s.timeFormat={...s.timeFormat,available:false};
      if (s.briefing) s.briefing = {...s.briefing,available:false};
      if(OW.climate)s.climate=OW.climate.read(this.states,false,this.temperatureUnit);
      if(OW.smartComfort)s.smartComfort=OW.smartComfort.read(this.states,false);
      if(OW.robotVacuum)s.robotVacuum=OW.robotVacuum.read(this.states,false);
      if(OW.houseCheck)s.houseCheck=OW.houseCheck.read(this.states,false);
      if (!s.demo.scenes) s.scenes = LOCAL_SCENES.slice();
      this.hub.emit('all');
    }

    // ---- mapping -------------------------------------------------------------------
    ents(domain) {
      return Object.values(this.states).filter((st) => {
        if (!st.entity_id.startsWith(domain + '.')) return false;
        if(this.client?.contract===3&&this.client.info?.principal==='screen'&&!this.reg[st.entity_id])return false;
        if(this.reg[st.entity_id]?.platform==='flightday')return false;
        const listKey={light:'lights',switch:'lights',scene:'scenes',media_player:'speakers'}[domain];
        if(listKey==='lights'&&OW.model.source!=='v3'&&(OW.config.get('ha.paired')||this.client?.info?.principal==='screen'))return false;
        if(OW.model.source==='v3'&&listKey)return [...(OW.model.lists[listKey]||[]),...(domain==='media_player'?OW.model.lists.tvs||[]:[])].includes(st.entity_id);
        const r = this.reg[st.entity_id] || {};
        if ([...(OW.roles.get('hidden') || []),...(OW.config.get('ha.hidden')||[])].includes(st.entity_id)) return false;
        // hidden, diagnostic and disabled entities are not offered; an entity that left Home Assistant has no state and is simply gone
        return !r.hidden && !r.category && !r.disabled_by;
      });
    }
    warmestLightData(st) {
      const a=st?.attributes || {}, modes=a.supported_color_modes || [];
      if (!modes.includes('color_temp')) return {};
      const min=Number(a.min_color_temp_kelvin), mired=Number(a.max_mireds);
      return {color_temp_kelvin:Number.isFinite(min)&&min>0?min:Number.isFinite(mired)&&mired>0?Math.round(1000000/mired):2200};
    }
    turnLightOn(id) {
      const st=this.states[id];
      return id.startsWith('light.') ? this.svc('light','turn_on',id,this.warmestLightData(st)) : this.svc('homeassistant','turn_on',id);
    }
    label(st) {
      let n = (this.client?.contract===3&&this.reg[st.entity_id]?.name) || (st.attributes && st.attributes.friendly_name) || st.entity_id.split('.')[1].replace(/_/g, ' ');
      n = n.replace(/^Unnamed \S+\s+/i, '').replace(/\s+Power Switch$/i, '').trim();
      const w = n.split(/\s+/);
      for (let k = Math.floor(w.length / 2); k >= 1; k--) {
        if (w.slice(0, k).join(' ').toLowerCase() === w.slice(k, 2 * k).join(' ').toLowerCase()) { n = w.slice(k).join(' '); break; }
      }
      return n;
    }
    /** room of an entity: its HA area, else the leading words of its id ("living_room_tv" -> "Living room") */
    room(st) {
      if(this.client?.hasEntityInfo)return this.area(st);
      const a = this.area(st);
      if (a) return a;
      const m = /^(living_room|bedroom|bathroom|kitchen|office|patio|backyard|garage|basement|hallway|dining_room)/.exec(st.entity_id.split('.')[1]);
      return m ? m[1].replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '';
    }
    area(st) { return (this.reg[st.entity_id] || {}).area || ''; }
    platform(st) { return (this.reg[st.entity_id] || {}).platform || ''; }
    /** entity picture (camera frame, album art) — through the native pass-through so an http HA is not mixed content */
    pic(st) {
      const p = st && st.attributes && st.attributes.entity_picture;
      if (!p) return null;
      const url = /^https?:/.test(p) ? p : this.base + p;
      return OW.net.native ? '/net/pass?u=' + encodeURIComponent(url) : url;
    }
    isRoom(st, re) { return re.test(this.area(st)) || re.test(this.label(st)) || re.test(st.entity_id); }

    media(st) {
      const a = st.attributes || {};
      const playing = st.state === 'playing';
      let pos = a.media_position || 0;
      const upd = a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : null;
      return {
        id: st.entity_id, title: a.media_title || (a.app_name || ''), artist: a.media_artist || a.media_series_title || a.media_album_name || a.app_name || '',
        room: this.room(st) || this.label(st), device: this.label(st), app: a.app_name || '', source: a.source || '',
        state: playing ? 'playing' : st.state === 'paused' ? 'paused' : st.state,
        durationSec: a.media_duration || 0, positionSec: pos, startedAt: playing && upd ? upd - pos * 1000 : null,
        volume: a.volume_level != null ? Math.round(a.volume_level * 100) : null, muted: !!a.is_volume_muted, art: this.pic(st),
      };
    }

    briefingModel() {
      const value=this.states['input_select.briefing_hours']?.state;
      const valid=['1','2','3','noon'].includes(value);
      return {hours:valid ? value : '2',available:!!this.status.connected && valid};
    }

    apply() {
      const s = this.hub.state, cfg = (k) => this.client?.contract===3 ? OW.model.lists[k]||[] : OW.config.get('ha.' + k);
      const live = (st) => st.state !== 'unavailable' && st.state !== 'unknown';
      const pinned = (list, all) => (Array.isArray(list) && (this.client?.contract===3||list.length) ? list.map((id) => this.states[id]).filter(Boolean).filter(st=>this.platform(st)!=='flightday') : all);

      s.sleepSchedule=OW.sleepSchedule.read(this.states,this.status.connected);
      s.timeFormat=OW.time.read(this.states,this.status.connected);
      if (OW.climate) s.climate = OW.climate.read(this.states, this.status.connected, this.temperatureUnit);
      if(OW.smartComfort)s.smartComfort=OW.smartComfort.read(this.states,this.status.connected);
      if(OW.houseCheck)s.houseCheck=OW.houseCheck.read(this.states,this.status.connected,this.reg,this.houseCheckDevices);
      if(OW.robotVacuum){s.robotVacuum=OW.robotVacuum.read(this.states,this.status.connected,this.base,this.robotVacuumRooms||[]);const picture=this.states[OW.roles.get('vacuum_map')]?.attributes?.entity_picture;if(picture?.startsWith(location.origin+'/'))s.robotVacuum.mapUrl=picture;}

      s.briefing = this.briefingModel();

      // V3 lists are authoritative. Do not even evaluate Tier 1 discovery on a paired screen.
      const modelLights = this.client?.contract===3 || OW.model.source==='v3' || OW.config.get('ha.paired') || this.client?.info?.principal==='screen';
      const lights = (modelLights ? pinned(OW.model.source==='v3' ? OW.model.lists.lights||[] : [], []) : pinned(cfg('lights'), this.ents('light').concat(this.ents('switch').filter((st) => (st.attributes.device_class || 'outlet') === 'outlet' && !/audioAdapter|apple_tv|cast|androidtv/.test(this.platform(st)) && !/_power_switch$/.test(st.entity_id) && !/_(led|auto_off_enabled|auto_update_enabled|child_lock|crossfade|loudness|night_sound|speech_enhancement|surround_enabled|surround_music_full_volume|subwoofer_enabled|touch_controls|status_light)$/.test(st.entity_id))))).filter(live);
      const now = Date.now();
      this.optimistic = this.optimistic || {};
      const isOn = (st) => { const o = this.optimistic[st.entity_id]; if (o && o.until > now && (st.state === 'on') !== o.on) return o.on; if (o) delete this.optimistic[st.entity_id]; return st.state === 'on'; };
      s.lights = lights.length ? lights.slice(0, 9).map((st) => ({
        id: st.entity_id, name: this.label(st), kind: st.entity_id.startsWith('switch.') ? 'plug' : 'light', on: isOn(st),
        level: st.attributes.brightness != null ? Math.round(st.attributes.brightness / 2.55) : st.state === 'on' ? 100 : 0, area: this.room(st),
      })) : null;
      delete s.demo.lights;

      // scenes + scripts next to the wall's own scenes
      // goodnight and the launch alarm have their own flow on the wall (the picker), so those scripts are not offered as bare buttons
      const scenes = pinned(cfg('scenes'), this.ents('scene').concat(this.ents('script').filter((st) => !/^script\.(goodnight|launch_alarm|sleep_|comfort_|roomSpeaker_)/.test(st.entity_id))));
      const tones = ['org', 'mag', 'yel', 'acc', 'grn', 'cyn'];
      const sceneIcon = (n) => (/movie|film|cinema|tv/i.test(n) ? 'film' : /dinner|eat|cook/i.test(n) ? 'dinner' : /night|sleep|bed/i.test(n) ? 'moon' : /morning|wake|launch/i.test(n) ? 'rocket' : /party/i.test(n) ? 'party' : 'spark');
      s.scenes = scenes.slice(0, 4).map((st, i) => ({ id: st.entity_id, name: this.label(st), icon: sceneIcon(this.label(st)), sub: this.area(st) || st.entity_id.split('.')[0], tone: tones[i % tones.length], ha: true }))
        .concat(LOCAL_SCENES.map((sc) => (sc.id === 'goodnight' && this.states['script.goodnight'] ? Object.assign({}, sc, { sub: 'pick liftoff · house to sleep' }) : sc.id === 'goodnight' && s.lights ? Object.assign({}, sc, { sub: 'lights + panel off' }) : sc))).slice(0, 8);
      delete s.demo.scenes;

      // media players, classified by integration
      const mps = this.ents('media_player').filter(live);
      const by = (re) => mps.filter((st) => re.test(this.platform(st)));
      const audioAdapter = by(/^audioAdapter$/), apple = by(/^apple_tv$/), tvAdapter = by(/^tvAdaptertv$/), remote = by(/^androidtv_remote$/), cast = by(/^cast$/);
      const isPod = (st) => st.attributes.device_class === 'speaker' || /roomSpeaker/i.test(st.entity_id);
      const pods = apple.filter(isPod), appleTvs = apple.filter((st) => !isPod(st));
      const speakers = audioAdapter.concat(pods);
      const HDMI_APP = "com.televisionAdapter.dtv.tvx";   // the tvAdapter's HDMI viewer: "the TV is showing an input"

      // a room's TV = the televisionAdapter (power / app / volume) + its Apple TV (what is on when the televisionAdapter shows HDMI)
      const tvFor = (role) => {
        if(!role)return null;
        const tvSt=this.states[role.media_player],atv=this.states[role.streamer];
        if (!tvSt && !atv) return null;
        const a = (tvSt || atv).attributes, src = tvSt || atv;
        const power = tvSt ? !['off', 'standby', 'unavailable'].includes(tvSt.state) : !['off', 'standby'].includes(atv.state);
        const atvOn = !!atv && !['off', 'standby', 'unavailable'].includes(atv.state);
        const onHdmi = !tvSt || !a.app_id || a.app_id === HDMI_APP;
        const onWall = a.app_id === OW.config.get('tv.appId');
        const showAtv = atv && onHdmi && atvOn;
        const m = showAtv ? this.media(atv) : this.media(src);
        const APPS = { 'com.spocky.projengmenu': 'Home screen', 'com.google.android.apps.tv.launcherx': 'Home screen', 'com.google.android.apps.tv.dreamx': 'Screensaver', 'com.google.android.youtube.tv': 'YouTube', 'com.netflix.ninja': 'Netflix', 'com.android.tv.settings': 'Settings' };
        // the integration reports the package name when it does not know the app: never show a raw package
        const named = a.app_name && !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(a.app_name) ? a.app_name : '';
        const pkg = a.app_id || a.app_name || '';
        const tvApp = named || APPS[pkg] || (pkg ? pkg.split('.').pop().replace(/^./, (c) => c.toUpperCase()) : '');
        const hasMedia = showAtv && m.title && m.title !== m.app;
        const app = onWall ? 'Flight Day' : showAtv ? (m.app || 'Apple TV') : onHdmi ? 'HDMI' : tvApp;
        const title = !power ? 'Off' : onWall ? 'Dashboard' : hasMedia ? m.title : showAtv ? '' : onHdmi ? (atv ? 'Apple TV asleep' : 'HDMI input') : '';
        const sub = !power ? '' : hasMedia ? [m.artist !== m.title && m.artist !== m.app ? m.artist : '', 'Apple TV'].filter(Boolean).join(' · ')
          : showAtv ? 'Apple TV · ' + atv.state : onHdmi ? '' : 'on the TV itself';
        return {
          id: src.entity_id, appleTv: atv ? atv.entity_id : null, name: this.label(src), room: this.room(src), onWall,
          power, input: !power ? '' : onWall ? 'Flight Day' : onHdmi ? (atvOn ? 'Apple TV' : 'HDMI') : (tvApp || 'app'), sources: a.source_list || [],
          app, title, sub, durationSec: showAtv ? m.durationSec : 0, positionSec: showAtv ? m.positionSec : 0, startedAt: showAtv ? m.startedAt : null,
          state: !power ? 'off' : showAtv ? m.state : 'on', muted: !!a.is_volume_muted, volume: a.volume_level != null ? Math.round(a.volume_level * 100) : null,
          art: showAtv ? m.art : null, note: [tvSt ? (this.reg[tvSt.entity_id]?.model || 'TV') : '', atv ? 'Apple TV ' + (atvOn ? atv.state : 'asleep') : ''].filter(Boolean).join(' · '),
        };
      };
      const tvRoles=OW.roles.get('tvs')||[];
      s.tv=tvFor(tvRoles.find(t=>t.area!==OW.roles.get('bedroom')));
      s.bedroomTv=tvFor(tvRoles.find(t=>t.area===OW.roles.get('bedroom')));
      delete s.demo.tv; delete s.demo.bedroomTv;

      // speakers: audioAdapter rooms first, then roomSpeakers that are doing something
      const spk = (st) => {
        const g = st.attributes.group_members || [];
        return { id: st.entity_id, name: this.room(st) || this.label(st), model: this.label(st), kind: /audioAdapter/.test(this.platform(st)) ? "audioAdapter" : "roomSpeaker",
          state: st.state === 'playing' ? 'playing' : g.length > 1 && g[0] !== st.entity_id ? 'grouped' : st.state === 'paused' ? 'paused' : 'idle',
          volume: st.attributes.volume_level != null ? Math.round(st.attributes.volume_level * 100) : null };
      };
      const order = { playing: 0, paused: 1, grouped: 2, idle: 3 };
      // a speaker Home Assistant cannot reach is left out rather than listed as idle
      const up = (st) => st.state !== 'unavailable' && st.state !== 'unknown';
      const rooms = audioAdapter.filter(up).map(spk).concat(pods.filter(up).map(spk).sort((x, y) => order[x.state] - order[y.state])).slice(0, 4);
      s.audioAdapter = rooms.length ? rooms : null;
      delete s.demo.audioAdapter;

      // now playing: whatever is audibly playing, preferring something with a title
      const rank = (st) => (st.state === 'playing' ? 0 : st.state === 'paused' ? 2 : 4) + (st.attributes.media_title ? 0 : 1);
      const tvIdle = (st) => {
        if (!(st.attributes.source === 'TV' || st.attributes.media_title === 'TV')) return false;
        const tv = [s.tv, s.bedroomTv].find((t) => t && t.room && t.room.toLowerCase() === (this.room(st) || '').toLowerCase());
        return !tv || !tv.power || tv.onWall || tv.app === 'Home screen' || tv.app === 'Screensaver' || (tv.app === 'HDMI' && !tv.title) || (!tv.title && /asleep|idle/i.test(tv.sub || ''));
      };
      const audible = speakers.concat(appleTvs, cast).filter((st) => (st.state === 'playing' || st.state === 'paused') && !tvIdle(st)).sort((x, y) => rank(x) - rank(y));
      if (audible.length) {
        const st = audible[0], np = this.media(st);
        if (!st.attributes.media_title || np.source === 'TV' || st.attributes.media_title === 'TV') {
          // a soundbar playing the TV: say what the TV in that room is showing
          const tv = [s.tv, s.bedroomTv].find((t) => t && t.room && t.room.toLowerCase() === (np.room || '').toLowerCase());
          const what = tv && tv.power ? [tv.app, tv.title].filter((x, i, l) => x && l.indexOf(x) === i).join(' — ') : '';
          np.title = what || (np.source ? np.source + ' audio' : 'Playing');
          np.artist = what ? 'TV audio' : '';
          if (tv && tv.art) np.art = tv.art;
        }
        s.nowPlaying = np;
      } else if (speakers.length || appleTvs.length) {
        const st = audioAdapter[0] || speakers[0] || appleTvs[0];
        s.nowPlaying = { id: st.entity_id, title: 'Nothing playing', artist: '', room: this.room(st), device: this.label(st), state: 'idle', durationSec: 0, positionSec: 0, volume: st.attributes.volume_level != null ? Math.round(st.attributes.volume_level * 100) : null, art: null };
      } else s.nowPlaying = null;
      delete s.demo.nowPlaying;

      // Apple TV handoff card for the TV this screen is (settings: room)
      const ownTv=tvRoles.find(t=>this.client?.contract===3?t.media_player===OW.model.screen()?.tv:t.area===OW.model.screen()?.area);
      const mine=this.states[ownTv?.streamer];
      s.handoff = mine ? Object.assign(this.media(mine), { active: mine.state === 'playing', asleep: mine.state === 'off' || mine.state === 'standby' }) : null;
      if (s.handoff) {
        const h = s.handoff;
        h.sources = mine.attributes.source_list || [];      // apps installed on that Apple TV
        h.remote = ownTv?.remote||null;
        h.hasMedia = !!(mine.attributes.media_title && mine.attributes.media_title !== h.app);   // a real title, not just the open app
        if (h.artist === h.app || h.artist === h.title) h.artist = '';
      }

      // Speaker favorites
      const fav = this.states[OW.roles.related(OW.roles.get('sleep_speaker'),'sensor','favorites')];
      const items = fav && fav.attributes && fav.attributes.items;
      s.favorites = items ? Object.keys(items).slice(0, 6).map((id) => ({ id, name: items[id], kind: 'favorite' })) : null;
      delete s.demo.favorites;

      // Only the explicit optional weatherProvider entity can override the independent fallback.
      this.publishWeather(false);

      // cameras: frames through HA's signed camera proxy (refreshed by the page), last-event still as fallback,
      // motion / person sensors as the event list, the alarm panel as status. Live video joins when an
      // H.264 stream URL exists; until then the tile says "snapshot", not "live".
      const cameraRoles=OW.roles.get('cameras')||[];
      const cams=cameraRoles.map(c=>this.states[c.entity]).filter(Boolean);
      const used = new Set();
      const sensorsFor = (key) => Object.values(this.states).filter((x) => x.entity_id.startsWith('binary_sensor.' + key + '_') && /_(motion|person|pet|package|vehicle|doorbell|ringing)$/.test(x.entity_id));
      s.cameras = cams.length ? cams.slice(0, 3).map((st, i) => {
        const role=cameraRoles.find(c=>c.entity===st.entity_id);const sl=role.slot==='indoor'?'living':role.slot;
        const key = st.entity_id.split('.')[1];
        const still = this.states[role.last_event];
        const recent = sensorsFor(key).filter((x) => x.state === 'on' || x.state === 'off').sort((a, b) => Date.parse(b.last_changed) - Date.parse(a.last_changed))[0];
        const off = st.state === 'unavailable';
        // Stills at rest; live video / frames are only requested while a tile is actually showing live view.
        // Battery cameras (the future Camera doorbell) are stricter: tap only, 60 s, never automatic — see app.js camLive.
        const battery=role.battery;
        const stillAt = still && !isNaN(Date.parse(still.state)) ? Date.parse(still.state) : null;
        return { id: st.entity_id, slot: sl, name: this.label(st), model: this.reg[st.entity_id]?.model || st.attributes?.model || 'Camera', state: off ? 'privacy' : 'snapshot', icon: sl === 'front' ? 'door' : sl === 'living' ? 'sofa' : 'camera',
          still: this.pic(still), stillAt, live: off ? null : this.pic(st), battery, last: recent ? { kind: recent.entity_id.replace(/^.*_/, '').replace(/^./, (c) => c.toUpperCase()), at: Date.parse(recent.last_changed) } : null };
      }) : null;
      // events: the latest trigger of every motion / person sensor (HA keeps only the last change per entity)
      const kinds = { motion: 'motion', person: 'person', package: 'package', pet: 'motion', vehicle: 'motion', doorbell: 'person', ringing: 'person' };
      const evs = Object.values(this.states).filter(x=>cams.some(c=>x.entity_id.startsWith('binary_sensor.'+c.entity_id.split('.')[1]+'_'))).filter((x) => /^binary_sensor\..*_(motion|person|pet|package|vehicle|doorbell|ringing)$/.test(x.entity_id) && (x.state === 'on' || x.state === 'off'))
        .map((x) => { const k = x.entity_id.replace(/^.*_/, ''); return { id: x.entity_id, kind: kinds[k] || 'motion', label: k.replace(/^./, (c) => c.toUpperCase()) + (x.state === 'on' ? ' · detected now' : ' · clear'), where: this.label(x).replace(new RegExp('\\s*' + k + '$', 'i'), '') || this.room(x), at: Date.parse(x.last_changed), on: x.state === 'on' }; })
        .sort((a, b) => b.at - a.at).slice(0, 6);
      s.camEvents = evs.length ? evs : null;
      delete s.demo.camEvents;
      const alarm = this.states[OW.roles.get('security')];
      s.security = alarm ? { armed: alarm.state.replace(/^armed_/, ''), raw: alarm.state, name: this.label(alarm), readOnly: true } : null;
      delete s.demo.security;
      // someone at the door: tell the page once per trigger
      evs.filter((e) => e.on && e.kind === 'person').forEach((e) => {
        this.seenPerson = this.seenPerson || {};
        if (this.seenPerson[e.id] !== e.at) { const first = this.seenPerson[e.id] === undefined && Date.now() - e.at > 60000; this.seenPerson[e.id] = e.at; if (!first) this.hub.emit('person', e); }
      });
      const ding=this.states[OW.roles.get('doorbell')],dingAt=Date.parse(ding?.state);
      if(Number.isFinite(dingAt)&&this.lastDoorbell!==dingAt){const initial=this.lastDoorbell===undefined;this.lastDoorbell=dingAt;if(!initial&&OW.nowMs()-dingAt<60000)this.hub.emit('person',{id:ding.entity_id+'_doorbell',where:this.label(ding),at:dingAt});}
      delete s.demo.cameras;

      // machines: pinned binary_sensors, or anything that reports connectivity
      const mach = pinned(cfg('machines'), this.ents('binary_sensor').filter((st) => /^ping$/.test(this.platform(st)) || st.attributes.device_class === 'connectivity' && /mac|pc|laptop|mini|server|nas/i.test(this.label(st))));
      s.machines = mach.length ? mach.slice(0, 5).map((st) => ({ id: st.entity_id, name: this.label(st), status: st.state === 'on' ? 'ok' : 'off', cpu: null, detail: 'home assistant · ' + (st.state === 'on' ? 'online' : 'offline') })) : null;
      delete s.demo.machines;

      // sleep mode + launch alarm. One liftoff time per weekday (input_datetime.launch_time_<day> +
      // input_boolean.launch_alarm_<day>), a master switch, the sleep sound and its volume.
      const on = (id) => !!this.states[id] && this.states[id].state === 'on';
      const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const days = WEEK.map((k) => {
        const t = this.states['input_datetime.launch_time_' + k];
        if (!t || !/^\d\d:\d\d/.test(t.state || '')) return null;
        return { key: k, name: k.charAt(0).toUpperCase() + k.slice(1), short: k.slice(0, 3), bedtime:OW.sleepSchedule.time(this.states['input_datetime.bedtime_'+k]?.state), crew: this.states['input_select.launch_crew_' + k]?.state || 'both', upBy: (this.states['input_datetime.up_by_' + k]?.state || '00:00').slice(0,5), time: t.state.slice(0, 5), on: this.states['input_boolean.launch_alarm_' + k] ? on('input_boolean.launch_alarm_' + k) : true };
      }).filter(Boolean);
      if (days.length) {
        const master = on('input_boolean.launch_alarm_enabled');
        // the morning being planned: today while today's liftoff is still ahead, otherwise tomorrow
        const n = OW.now(), JS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        let target = null;
        for (let off = 0; off < 8 && !target; off++) {
          const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + off), day = days.find((x) => x.key === JS[d.getDay()]);
          if (!day) continue;
          const [h, m] = day.time.split(':').map(Number);
          const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
          if (at > n.getTime() + 60000) target = Object.assign({}, day, { at, offset: off, label: off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : day.name });
        }
        const override = Date.parse(this.states['input_datetime.launch_override']?.state);
        if (target && override > n.getTime() && new Date(override).toDateString() === new Date(target.at).toDateString()) target = Object.assign({},target,{at:override,time:OW.fmt.time24(override),override:true});
        const snd = this.states['input_select.sleep_sound'], vol = this.states['input_number.sleep_volume'];
        s.launch = {
          days, master, target,
          time: target ? target.time : days[0].time, enabled: !!(master && target && target.on),     // what the next morning will do
          sleeping: on('input_boolean.sleep_mode') && (this.states['input_select.sleep_scope']?.state !== 'bedroom' || OW.model.isBedroom()), backToBed: on('input_boolean.back_to_bed'), firing: false, scrubbed: false,
          alarm: (() => {
            const val = id => this.states[id]?.state;
            const parse = id => { try { return JSON.parse(val(id)); } catch (_) { return null; } };
            const ctx = parse('input_text.launch_context') || {};
            return Object.assign({}, ctx, {state:val('input_select.launch_state') || 'idle', alarm_id:val('input_text.launch_alarm_id'), launch_at:val('input_datetime.launch_at'), count_at:val('input_datetime.launch_count_at'), deadline:val('input_datetime.launch_deadline'), deadline_reason:val('input_text.launch_deadline_reason'), snoozes:+val('counter.launch_snoozes')||0, up_at:val('input_datetime.launch_up_at')});
          })(),
          snoozeMinutes: +(this.states['input_number.snooze_minutes']?.state || 10), snoozeWindow: +(this.states['input_number.snooze_window']?.state ?? 30), readyLead: +(this.states['input_number.launch_ready_lead']?.state ?? 45),
          phones: Object.fromEntries(OW.model.config.people.map(p=>[p.legacy_key||p.id,p.legacy_key?on('input_boolean.launch_phone_'+p.legacy_key):false])),
          muted: !!this.states[OW.roles.get('sleep_speaker')]?.attributes.is_volume_muted,
          mornings: this.mornings || [],scheduleLog:this.scheduleLog || [],
          sound: snd ? snd.state : null, sounds: snd && Array.isArray(snd.attributes.options) ? snd.attributes.options : [],
          volume: this.states[OW.roles.get('sleep_speaker')]?.attributes.volume_level != null ? Math.round(this.states[OW.roles.get('sleep_speaker')].attributes.volume_level*100) : null, nightVolume: vol && !isNaN(+vol.state) ? Math.round(+vol.state) : null, volMin:0, volMax:100, volStep:1,
          scripts: !!this.states['script.goodnight'], events: !!this.wallEvents,
          // the loudest the alarm may get on the bedroom speaker (input_number.alarm_max_volume)
          alarmMax: (() => { const x = this.states['input_number.alarm_max_volume']; return x && !isNaN(+x.state) ? Math.round(+x.state) : null; })(),
          // what the bedroom speaker is really at (the TV remote changes it too)
          audioAdapterVol: this.states[OW.roles.get('sleep_speaker')]?.attributes.volume_level != null ? Math.round(this.states[OW.roles.get('sleep_speaker')].attributes.volume_level*100) : null,
        };
      } else s.launch = null;

      this.mergeEvents();
      this.client?.decorateUI();
      this.hub.emit('all');
    }

    // ---- calendars -------------------------------------------------------------------
    async loadHaCalendars() {
      if(this.client?.contract===3)return this.client.readCalendars();
      const selected=[...(OW.roles.get('agenda_calendars')||[]),...(OW.roles.get('wake_rule_calendars')||[]),...(OW.roles.get('due')||[])];
      await this.loadDueTodos();
      const cals = this.ents('calendar').filter(c=>selected.includes(c.entity_id));
      if (!cals.length) return;
      const n = OW.now(), from = new Date(n.getFullYear(), n.getMonth(), n.getDate());
      const to = new Date(from.getTime() + 7 * 86400000);
      try {
        const res = await this.send({ type: 'call_service', domain: 'calendar', service: 'get_events', target: { entity_id: cals.map((c) => c.entity_id) }, service_data: { start_date_time: from.toISOString(), end_date_time: to.toISOString() }, return_response: true });
        const due = [];
        const out = [], palette = ['#7aa2f7', '#9ece6a', '#bb9af7', '#ff9e64', '#2ac3de', '#f7768e'];
        const resp = (res && res.response) || {};
        this.calendarEvidence=this.calendarEvidence||{};for(const [id,value]of Object.entries(resp))if(Array.isArray(value?.events))this.calendarEvidence[id]={at:OW.nowMs(),events:value.events.map(e=>({calendar:id,title:e.summary,start:Date.parse(e.start+(!String(e.start).includes('T')?'T00:00:00':'')),end:Date.parse(e.end+(!String(e.end).includes('T')?'T00:00:00':'')),allDay:!String(e.start).includes('T')}))};
        Object.keys(resp).forEach((eid, ci) => (resp[eid].events || []).forEach((e) => {
          const allDay = !/T/.test(e.start);
          const start = allDay ? new Date(e.start + 'T00:00:00').getTime() : Date.parse(e.start);
          const end = allDay ? new Date(e.end + 'T00:00:00').getTime() : Date.parse(e.end);
          const tag=(e.summary||'').match(/^\s*\[([^\]]+)\]\s*/)||(OW.model.config.screens.some(s=>s.legacy_id)?(e.summary||'').match(/\s*\[([^\]]+)\]\s*$/):null);
          if ((OW.roles.get('due')||[]).includes(eid)) { due.push({ id: eid + '|' + e.start + '|' + e.summary, title: (tag?(e.summary||'').replace(tag[0],''):(e.summary||'')).trim() || '(untitled)', course: tag?.[1]||'', calendar:eid, at: allDay ? end - 60000 : start, allDay, raw: e.summary || '', start,
            desc: String(e.description || '').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 420) }); return; }
          if(!(OW.roles.get('agenda_calendars')||[]).includes(eid))return;
          out.push({ id: eid + '|' + e.start + '|' + e.summary, title: e.summary || '(busy)', start, end, allDay, where: (e.location || '').split(',')[0].slice(0, 40), css: palette[ci % palette.length], calendar: eid });
        }));
        this.haEvents = out;
        this.haDue = due.sort((a, b) => a.at - b.at);
        this.hub.state.due = [...this.haDue,...(this.todoDue||[])].sort((a,b)=>a.at-b.at);if(!this.hub.state.due.length)this.hub.state.due=null;
        this.mergeEvents();
        this.hub.emit('events');
      } catch (e) { OW.host.log('HA calendars failed: ' + (e && (e.message || e.code))); }
    }
    async loadDueTodos(){
      const ids=(OW.roles.get('due')||[]).filter(id=>id.startsWith('todo.'));
      if(!ids.length){this.todoDue=[];return;}
      try{
        const res=await this.send({type:'call_service',domain:'todo',service:'get_items',target:{entity_id:ids},service_data:{status:['needs_action']},return_response:true}),rows=[];
        for(const [id,value] of Object.entries(res?.response||{}))for(const item of value.items||[]){
          if(!ids.includes(id)||item.status==='completed'||!item.due)continue;
          const allDay=/^\d{4}-\d\d-\d\d$/.test(item.due),at=Date.parse(item.due+(allDay?'T23:59:00':''));if(!Number.isFinite(at))continue;
          const tag=/^\s*\[([^\]]+)\]\s*/.exec(item.summary||'');rows.push({id:id+'|'+item.uid,calendar:id,title:(item.summary||'').replace(/^\s*\[[^\]]+\]\s*/,''),course:tag?.[1]||'',at,start:at,allDay,raw:item.summary||''});
        }
        this.todoDue=rows;this.hub.state.due=[...(this.haDue||[]),...rows].sort((a,b)=>a.at-b.at);this.hub.emit('events');
      }catch(_){OW.host.log('Due lists unavailable');}
    }
    /** device calendar + HA calendars, de-duplicated (the same Google calendar is often in both) */
    mergeEvents() {
      const s = this.hub.state, local = this.deviceEvents || [];
      if (!this.haEvents.length) return;
      const seen = new Set(local.map((e) => e.title + '|' + e.start));
      // Canvas items are "due", not appointments: they never appear in the agenda, whichever calendar carried them
      const dueKeys = new Set((this.haDue || []).map((d) => d.raw + '|' + d.start));
      s.events = local.concat(this.haEvents.filter((e) => !seen.has(e.title + '|' + e.start))).filter((e) => !dueKeys.has(e.title + '|' + e.start)).sort((a, b) => a.start - b.start);
      s.calendar = { available: true, count: s.events.length };
      delete s.demo.events;
    }
    loadCalendar() { super.loadCalendar(); this.mergeEvents(); }

    // ---- actions ---------------------------------------------------------------------
    /** call a service; `fields` (scripts) are sent as service data without an entity target */
    svc(...args) {return this.client?this.client.service(...args):this.svcLegacy(...args);}
    svcLegacy(domain, service, entity_id, data, fields) {
      if (!entity_id) return false;
      this.send(fields ? { type: 'call_service', domain, service, service_data: fields } : { type: 'call_service', domain, service, target: { entity_id }, service_data: data || {} }).catch((err) => OW.host.log('HA ' + domain + '.' + service + ' failed: ' + (err && (err.message || err.code))));
      return true;
    }
    call(action,p) {return this.client?this.client.call(action,p):this.callLegacy(action,p);}
    callLegacy(action, p) {
      p = p || {};
      const s = this.hub.state, np = s.nowPlaying, isEntity = (id) => typeof id === 'string' && id.includes('.') && this.states[id];
      if(action.startsWith('house-check.')){
        try{return this.send({type:'call_service',...OW.houseCheck.command(action,p,this.states,this.status.connected,this.reg,this.houseCheckDevices)});}catch(error){return Promise.reject(error);}
      }
      if(action.startsWith('comfort.')){
        try{return this.send({type:'call_service',...OW.smartComfort.command(action,p,this.states,this.status.connected)});}catch(error){return Promise.reject(error);}
      }
      if(action==='vacuum.action'){
        try{return this.send({type:'call_service',...OW.robotVacuum.command(action,p,OW.robotVacuum.read(this.states,this.status.connected,this.base,this.robotVacuumRooms||[]))});}catch(error){return Promise.reject(error);}
      }
      if(action==='time.format'){
        try{return this.send(OW.time.command(this.states,this.status.connected,p.value));}catch(error){return Promise.reject(error);}
      }
      if(action==='schedule.edit'){
        try{return this.send(OW.sleepSchedule.command(this.states,this.status.connected,p));}
        catch(error){return Promise.reject(error);}
      }
      if (action === 'briefing.hours') {
        if (!this.status.connected) return Promise.reject(Error('Home Assistant is offline'));
        if (!this.briefingModel().available) return Promise.reject(Error('Briefing setting is unavailable'));
        if (!['1','2','3','noon'].includes(p.hours)) return Promise.reject(Error('Invalid briefing duration'));
        return this.send({type:'call_service',domain:'input_select',service:'select_option',target:{entity_id:'input_select.briefing_hours'},service_data:{option:p.hours}});
      }
      if (action.startsWith('climate.')) {
        if (!this.status.connected) return Promise.reject(new Error('Home Assistant is offline'));
        try {
          const model = OW.climate.read(this.states, true, this.temperatureUnit);
          const command = OW.climate.command(action, p, model);
          return this.send({type:'call_service',...command});
        } catch (err) { return Promise.reject(err); }
      }
      switch (action) {
        // optimistic: show the new state at once and hold it for 25 s (lightingAdapter reports back 5-20 s late)
        case 'light.toggle': if (isEntity(p.id)) {
          const l = (s.lights || []).find((x) => x.id === p.id), want = l ? !l.on : true;
          this.optimistic[p.id] = { on: want, until: Date.now() + 25000 };
          if (l) l.on = want;
          this.hub.emit('lights');
          return want ? this.turnLightOn(p.id) : this.svc('homeassistant','turn_off',p.id);
        } break;
        case 'light.all': if (s.lights && !s.demo.lights) {
          s.lights.forEach((l) => { l.on = !!p.on; this.optimistic[l.id] = { on: !!p.on, until: Date.now() + 25000 }; });
          this.hub.emit('lights');
          if (p.on) { s.lights.forEach(l=>this.turnLightOn(l.id)); return true; }
          return this.svc('homeassistant','turn_off',s.lights.map(l=>l.id));
        } break;
        case 'scene.activate': if (isEntity(p.id)) return this.svc(p.id.split('.')[0], 'turn_on', p.id); break;
        case 'media.playpause': if (np && isEntity(np.id)) return this.svc('media_player', 'media_play_pause', np.id); break;
        case 'media.next': if (np && isEntity(np.id)) return this.svc('media_player', 'media_next_track', np.id); break;
        case 'media.prev': if (np && isEntity(np.id)) return this.svc('media_player', 'media_previous_track', np.id); break;
        case 'media.volume': if (np && isEntity(np.id) && np.volume != null) return this.svc('media_player', 'volume_set', np.id, { volume_level: OW.clamp((np.volume + (p.delta || 0)) / 100, 0, 1) }); break;
        case 'tv.power': { const tv = p.id === 'bedroom' ? s.bedroomTv : s.tv; if (tv && isEntity(tv.id)) return this.svc('media_player', tv.power ? 'turn_off' : 'turn_on', tv.id); break; }
        case 'tv.mute': if (s.tv && isEntity(s.tv.id)) return this.svc('media_player', 'volume_mute', s.tv.id, { is_volume_muted: !s.tv.muted }); break;
        case 'tv.playpause': if (s.tv && isEntity(s.tv.appleTv || s.tv.id)) return this.svc('media_player', 'media_play_pause', s.tv.appleTv || s.tv.id); break;
        case 'tv.input': if (s.tv && isEntity(s.tv.id) && s.tv.sources.length) { const i = s.tv.sources.indexOf(s.tv.input); return this.svc('media_player', 'select_source', s.tv.id, { source: s.tv.sources[(i + 1) % s.tv.sources.length] }); } break;
        case "audioAdapter.groupAll": { const so = (s.audioAdapter || []).filter((r) => r.kind === "audioAdapter" && isEntity(r.id)); if (so.length > 1) { const grouped = so.some((r) => r.state === 'grouped'); return grouped ? this.svc('media_player', 'unjoin', so.slice(1).map((r) => r.id)) : this.svc('media_player', 'join', so[0].id, { group_members: so.slice(1).map((r) => r.id) }); } break; }
        case "audioAdapter.play": if (s.audioAdapter && s.audioAdapter[0] && p.id && s.favorites && !s.demo.favorites) return this.svc('media_player', 'play_media', (np && /audioAdapter/.test(this.platform(this.states[np.id] || { entity_id: '' })) ? np.id : s.audioAdapter[0].id), { media_content_type: 'favorite_item_id', media_content_id: p.id }); break;
        case 'chime': return console.log('[chime hook] ' + (p.reason || ''));   // TODO: tts / audioAdapter.play_media once a chime file exists
        // the plan lives in Home Assistant, so every edit is written straight to its helper (and shown at once)
        case 'alarm.day': {
          const set = (id, state) => { if (this.states[id]) { this.states[id] = Object.assign({}, this.states[id], { state }); this.scheduleApply(); } };
          if (p.time && this.states['input_datetime.launch_time_' + p.day]) { this.svc('input_datetime', 'set_datetime', 'input_datetime.launch_time_' + p.day, { time: p.time + ':00' }); set('input_datetime.launch_time_' + p.day, p.time + ':00'); }
          if (p.on != null && this.states['input_boolean.launch_alarm_' + p.day]) { this.svc('input_boolean', p.on ? 'turn_on' : 'turn_off', 'input_boolean.launch_alarm_' + p.day); set('input_boolean.launch_alarm_' + p.day, p.on ? 'on' : 'off'); }
          return;
        }
        case 'back_to_bed': return this.svc('script','turn_on','script.back_to_bed',{variables:{by:OW.app.deviceId()}});
        case 'alarm.crew': return this.svc('input_select','select_option','input_select.launch_crew_'+p.day,{option:p.crew});
        case 'alarm.upBy': return this.svc('input_datetime','set_datetime','input_datetime.up_by_'+p.day,{time:p.time+':00'});
        case 'alarm.override': return this.svc('input_datetime','set_datetime','input_datetime.launch_override',{datetime:p.datetime});
        case 'sleep.unmute': return this.svc('media_player','volume_mute',OW.roles.get('sleep_speaker'),{is_volume_muted:false});
        case 'alarm.master': if (this.states['input_boolean.launch_alarm_enabled']) { this.svc('input_boolean', p.on ? 'turn_on' : 'turn_off', 'input_boolean.launch_alarm_enabled'); this.states['input_boolean.launch_alarm_enabled'] = Object.assign({}, this.states['input_boolean.launch_alarm_enabled'], { state: p.on ? 'on' : 'off' }); this.scheduleApply(); } return;
        case 'sleep.sound': if (this.states['input_select.sleep_sound']) { this.svc('input_select', 'select_option', 'input_select.sleep_sound', { option: p.option }); this.states['input_select.sleep_sound'] = Object.assign({}, this.states['input_select.sleep_sound'], { state: p.option }); this.scheduleApply(); } return;
        case 'sleep.volume': return this.svc('media_player','volume_set',OW.roles.get('sleep_speaker'),{volume_level:OW.clamp(p.value,0,100)/100});
        // the bedroom speaker itself (the alarm rises on it and hands it back afterwards)
        case 'sleep.speaker': { const sp=this.states[OW.roles.get('sleep_speaker')]; if(sp?.attributes.volume_level!=null && !sp.attributes.is_volume_muted && p.volume>=0) return this.svc('media_player','volume_set',sp.entity_id,{volume_level:OW.clamp(p.volume,0,100)/100}); return; }
        case 'alarm.max': if (this.states['input_number.alarm_max_volume'] && p.value >= 0) this.svc('input_number', 'set_value', 'input_number.alarm_max_volume', { value: OW.clamp(p.value, 0, 100) }); return;
        case 'night.wake': if (this.states['input_boolean.sleep_mode']) this.svc('input_boolean', 'turn_off', 'input_boolean.sleep_mode'); return;
        case 'sleep.goodnight': {
          // the house script does the rest (and tells every screen with the flightday_wall event)
          if (this.states['script.goodnight']) return this.svc('script', 'turn_on', 'script.goodnight');
          // no script: at least mark the night and switch the lights off
          if (this.states['input_boolean.sleep_mode']) this.svc('input_boolean', 'turn_on', 'input_boolean.sleep_mode');
          if (s.lights && !s.demo.lights) this.svc('homeassistant', 'turn_off', s.lights.map((l) => l.id));
          return;
        }
        case 'alarm.hold':
        case 'alarm.snooze':
        case 'alarm.up':
        case 'alarm.advance':
        case 'alarm.scrub': {
          const entity = 'script.launch_alarm_' + (action === 'alarm.hold' ? 'snooze' : action.split('.')[1]);
          if (!this.states[entity]) return false;
          return this.send({ type: 'call_service', domain: 'script', service: 'turn_on', target: { entity_id: entity }, service_data: {variables: Object.assign({},p,{by:OW.app.deviceId()})} });
        }
        case 'alarm.test': if (this.states['script.launch_alarm_test']) return this.svc('script', 'turn_on', 'script.launch_alarm_test'); break;
        default: break;
      }
      super.call(action, p);   // not an HA entity: local / demo behaviour (ignored when no source)
    }
  }

  // ---------------------------------------------------------------------------
  // hub
  // ---------------------------------------------------------------------------
  const hub = OW.emitter({
    state: null,
    provider: null,
    get client(){return this.provider?.client||null;},
    get contract(){return this.client?.contract||null;},
    get status() { return this.provider ? this.provider.status : { provider: 'none', connected: false }; },
    call(action, payload) { if (this.provider) return this.provider.call(action, payload); },
    has(section) { const v = this.state && this.state[section]; return Array.isArray(v) ? v.length > 0 || section === 'events' : v != null; },
    isDemo(section) { return !!(this.state && this.state.demo && this.state.demo[section]); },
    /** true when a smart-home source (Home Assistant or demo data) is feeding the house tiles */
    houseConnected() { return this.has('lights') || this.has('nowPlaying'); },

    /** live playback position (seconds) for a now-playing style object */
    position(np) {
      if (!np) return 0;
      if (np.state !== 'playing' || !np.startedAt) return np.positionSec || 0;
      const d = np.durationSec || 1;
      return ((OW.nowMs() - np.startedAt) / 1000) % d;
    },

    /** events still relevant: [{...event, state: 'past'|'now'|'next'|'later'}] for today, plus the upcoming one */
    agenda() {
      const now = OW.nowMs();
      const n = OW.now();
      const dayEnd = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime();
      const all = (this.state.events || []).slice().sort((a, b) => a.start - b.start);
      const timed = all.filter((e) => !e.allDay);
      const next = timed.find((e) => e.start > now) || null;
      const current = timed.find((e) => e.start <= now && e.end > now) || null;
      const tag = (e) => Object.assign({}, e, { state: e.allDay ? (e.start <= now && e.end > now ? 'allday' : e.end <= now ? 'past' : 'later') : e.end <= now ? 'past' : e.start <= now ? 'now' : next && e.id === next.id ? 'next' : 'later' });
      return {
        today: all.filter((e) => e.start < dayEnd).map(tag),
        tomorrow: all.filter((e) => e.start >= dayEnd && e.start < dayEnd + 86400000).map(tag),
        later: all.filter((e) => e.start >= dayEnd + 86400000).map(tag),
        next, current,
      };
    },

    start() {
      if (this.provider) this.provider.stop();
      const want = (OW.demo?.active || OW.config.get('provider') === 'ha') ? HomeAssistantProvider : LocalProvider;
      this.provider = new want(this);
      this.provider.start();
      this.emit('status');
    },
  });

  hub.providers = { LocalProvider, MockProvider, HomeAssistantProvider };
  OW.data = hub;
})();
