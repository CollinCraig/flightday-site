/* Live space missions service ("mission control").
 *
 *   launches    Launch Library 2  /launches/upcoming/        (cache 30 min)
 *   events      Launch Library 2  /events/upcoming/          (cache 30 min)
 *   crew        Launch Library 2  /astronauts/?in_space=true + /expeditions/?is_active=true (6 h)
 *   programs    Launch Library 2  /programs/                 (24 h)  -> active mission spotlight
 *   news        Spaceflight News API /v4/articles/           (15 min)
 *   iss         wheretheiss.at    /v1/satellites/25544       (10 s while watched, else 60 s;
 *                                                             a local orbit propagator animates in between)
 *
 * Free APIs, so: long TTLs, native disk cache, backoff on 429 (see NetProxy.kt),
 * and the last good snapshot is kept in localStorage so the wall still shows
 * last-known data when offline.
 */
(function () {
  'use strict';
  const OW = window.OW;
  const rad = Math.PI / 180;
  const LL = () => (OW.config.get('launch.api') === 'dev' ? 'https://lldev.thespacedevs.com/2.3.0' : 'https://ll.thespacedevs.com/2.3.0');
  const SNAPSHOT = 'space.snapshot.v2';

  const S = OW.emitter({
    launches: [], events: [], crew: { count: 0, stations: [], people: [] }, programs: [], news: [], spotlight: [],
    iss: null, pass: null,
    focus: null,        // launch that put the wall in launch-day mode (or null)
    live: null,         // {kind, title, sub, since, url, image} when something is happening right now
    updated: {}, stale: {}, error: {}, via: {},
    hubSel: null,       // what wallhub features right now: {id, kind, reason, pinPending, at}
    watchingIss: false,
  });

  // ---------------------------------------------------------------------------
  // mapping (keep only what the UI needs — never store the huge raw payloads)
  // ---------------------------------------------------------------------------
  const img = () => null; // Static demo: bundled textures and illustrations only.
  const firstSentence = (t) => { t = (t || '').replace(/\s+/g, ' ').trim(); const m = t.match(/^.{20,180}?[.!?](\s|$)/); return (m ? m[0] : t.slice(0, 170)).trim(); };

  /** ISO-8601 duration with an optional sign ("-PT35M30S", "PT1M12S") -> seconds */
  function isoSeconds(d) {
    const m = /^(-)?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(d || ''));
    return m ? (m[1] ? -1 : 1) * ((+m[2] || 0) * 86400 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0)) : null;
  }
  function mapLaunch(r) {
    const cfg = (r.rocket && r.rocket.configuration) || {};
    const lsp = r.launch_service_provider || {};
    // webcast: something live first, then something this screen can play (YouTube), then the feed's own order
    const yt = (v) => (/youtu\.?be/i.test(v.url || '') ? 0 : 1);
    const vids = (r.vid_urls || []).filter((v) => v && v.url).slice().sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || yt(a) - yt(b) || (a.priority || 99) - (b.priority || 99));
    const upd = (r.updates || []).slice().sort((a, b) => Date.parse(b.created_on || 0) - Date.parse(a.created_on || 0))[0];
    const infos = (r.info_urls || []).slice().sort((a, b) => (a.priority || 99) - (b.priority || 99));
    const parts = (r.name || '').split('|').map((s) => s.trim());
    const st = r.status || {};
    const precision = (r.net_precision && r.net_precision.id);
    const text = (r.name + ' ' + (cfg.full_name || '') + ' ' + ((r.program || []).map((p) => p.name).join(' '))).toLowerCase();
    return {
      id: r.id, name: r.name, rocket: cfg.name || parts[0], mission: (r.mission && r.mission.name) || parts[1] || parts[0],
      type: (r.mission && r.mission.type) || '', orbit: (r.mission && r.mission.orbit && r.mission.orbit.abbrev) || '',
      about: firstSentence(r.mission && r.mission.description),
      provider: AGENCY[lsp.name] || (lsp.name && lsp.name.length > 26 && lsp.abbrev ? lsp.abbrev : lsp.name) || '', abbrev: lsp.abbrev || lsp.name || '', logo: img(lsp.logo) || img(lsp.social_logo),
      pad: (r.pad && r.pad.name) || '', location: (r.pad && r.pad.location && r.pad.location.name) || '',
      padLat: r.pad && r.pad.latitude != null ? +r.pad.latitude : null, padLon: r.pad && r.pad.longitude != null ? +r.pad.longitude : null,
      landing: (((r.rocket && r.rocket.launcher_stage) || []).map((st) => st.landing && st.landing.landing_location && (st.landing.landing_location.abbrev || st.landing.landing_location.name)).filter(Boolean)[0]) || '',
      net: Date.parse(r.net), precise: precision == null ? true : precision <= 2,
      status: st.abbrev || 'TBD', statusName: st.name || '', statusId: st.id || 0,
      image: img(r.image) || img(cfg.image), credit: (r.image && r.image.credit) || '',
      webcast: (vids[0] && vids[0].url) || null, webcastLive: !!r.webcast_live || vids.some((v) => v.live),
      info: (infos[0] && infos[0].url) || null,
      usa: ((lsp.country || []).some((c) => c.alpha_3_code === 'USA' || c.alpha_2_code === 'US')) || /USA$|United States/i.test((r.pad && r.pad.location && r.pad.location.name) || ''),
      crewed: /human|crew|tourism/i.test((r.mission && r.mission.type) || '') || /crew|dragon.*ax-|soyuz ms|shenzhou/i.test(r.name || ''),
      tier: r.priority_tier != null ? +r.priority_tier : null, significance: r.significance_score != null ? +r.significance_score : null, sigReason: r.significance_reason || '',
      update: upd && upd.comment ? { text: String(upd.comment).replace(/\s+/g, ' ').trim().slice(0, 220), at: Date.parse(upd.created_on) || 0 } : null,
      // the provider's published countdown / ascent timeline (when Launch Library has one): [{t: seconds from T-0, label}]
      timeline: (r.timeline || []).map((x) => ({ t: isoSeconds(x.relative_time), label: (x.type && (x.type.abbrev || x.type.description)) || '' })).filter((x) => x.t != null && x.label).sort((a, b) => a.t - b.t).slice(0, 60),
      concerns: r.weather_concerns ? String(r.weather_concerns).replace(/\s+/g, ' ').trim().slice(0, 160) : '',
      probability: r.probability, featured: OW.config.get('launch.featured').some((k) => text.includes(k)),
    };
  }
  function mapEvent(r) {
    const vids = (r.vid_urls || []).slice().sort((a, b) => (a.priority || 99) - (b.priority || 99));
    const p = r.date_precision && r.date_precision.id;
    let dur = 0;
    const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(r.duration || '');
    if (m) dur = ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60) * 1000;
    return {
      id: r.id, name: r.name, type: (r.type && r.type.name) || 'Event', date: Date.parse(r.date),
      precise: p == null ? true : p <= 2, dayPrecise: p == null ? true : p <= 5, duration: dur,
      location: r.location || '', image: img(r.image), about: firstSentence(r.description),
      webcast: (vids[0] && vids[0].url) || null, webcastLive: !!r.webcast_live,
    };
  }
  const AGENCY = { 'National Aeronautics and Space Administration': 'NASA', 'Russian Federal Space Agency (ROSCOSMOS)': 'Roscosmos', 'China National Space Administration': 'CNSA', 'European Space Agency': 'ESA', 'Japan Aerospace Exploration Agency': 'JAXA', 'Canadian Space Agency': 'CSA', 'China Aerospace Science and Technology Corporation': 'CASC', 'Indian Space Research Organization': 'ISRO', 'United Launch Alliance': 'ULA' };
  const agencyName = (a) => (a ? AGENCY[a.name] || a.abbrev || a.name : '');

  function mapCrew(astros, expeditions) {
    const stations = [];
    const placed = new Set();
    (expeditions || []).forEach((ex) => {
      const name = (ex.spacestation && ex.spacestation.name) || ex.name;
      let st = stations.find((s) => s.name === name);
      if (!st) { st = { name, short: /international/i.test(name) ? 'ISS' : name.replace(/ space station/i, ''), expedition: ex.name, people: [] }; stations.push(st); }
      (ex.crew || []).forEach((c) => {
        const a = c.astronaut || {};
        if (placed.has(a.id)) return;
        placed.add(a.id);
        st.people.push({ id: a.id, name: a.name, agency: agencyName(a.agency), role: (c.role && c.role.role) || '' });
      });
    });
    const humans = (astros || []).filter((a) => !a.type || a.type.name !== 'Non-Human');
    if (!expeditions) {
      // no expedition data (wallhub carries the people, not who is on which station): group by agency, which is certain
      humans.forEach((a) => {
        const ag = agencyName(a.agency) || 'Other';
        let st = stations.find((s) => s.name === ag);
        if (!st) { st = { name: ag, short: ag, expedition: '', people: [] }; stations.push(st); }
        st.people.push({ id: a.id, name: a.name, agency: ag, role: '' });
      });
      stations.sort((x, y) => y.people.length - x.people.length);
      const all = stations.reduce((acc, s) => acc.concat(s.people.map((p) => Object.assign({ station: s.short }, p))), []);
      return { count: all.length, stations, people: all, byAgency: true };
    }
    const other = humans.filter((a) => !placed.has(a.id)).map((a) => ({ id: a.id, name: a.name, agency: agencyName(a.agency), role: '' }));
    if (other.length && stations.length) stations.push({ name: 'In transit', short: 'Transit', expedition: '', people: other });
    else if (other.length) stations.push({ name: 'In orbit', short: 'Orbit', expedition: '', people: other });
    const people = stations.reduce((all, s) => all.concat(s.people.map((p) => Object.assign({ station: s.short }, p))), []);
    return { count: people.length, stations, people };
  }

  // ---- active missions spotlight: LL2 programs + a few long-running missions -----
  const PROGRAM_PICK = [/^artemis/i, /starship/i, /^international space station/i, /^tiangong/i, /commercial crew/i, /commercial lunar/i, /chinese lunar/i];
  const FLAGSHIPS = [
    { id: 'jwst', name: 'James Webb Space Telescope', agency: 'NASA · ESA · CSA', since: '2021-12-25T12:20:00Z', sinceLabel: 'mission elapsed', about: 'Infrared observatory at Sun–Earth L2, looking back to the first galaxies.', match: /webb|jwst/i, nasaId: 'carina_nebula', icon: 'spark' },
    { id: 'perseverance', name: 'Perseverance · Mars 2020', agency: 'NASA JPL', since: '2021-02-18T20:55:00Z', sinceLabel: 'on Mars', about: 'Exploring Jezero crater and caching samples for return to Earth.', match: /perseverance|mars 2020|jezero/i, nasaId: 'PIA24937', icon: 'flag' },
    { id: 'curiosity', name: 'Curiosity · Mars Science Laboratory', agency: 'NASA JPL', since: '2012-08-06T05:17:00Z', sinceLabel: 'on Mars', about: 'Climbing Mount Sharp in Gale crater, still doing science.', match: /curiosity|gale crater/i, nasaId: 'PIA26680', icon: 'flag' },
    { id: 'clipper', name: 'Europa Clipper', agency: 'NASA JPL', since: '2024-10-14T16:06:00Z', sinceLabel: 'en route to Jupiter', about: 'Cruising to Jupiter to study the ocean moon Europa (arrival 2030).', match: /europa clipper/i, nasaId: 'PIA26077', icon: 'orbit' },
    { id: 'voyager', name: 'Voyager 1', agency: 'NASA JPL', since: '1977-09-05T12:56:00Z', sinceLabel: 'in flight', about: 'In interstellar space — the farthest human-made object.', match: /voyager/i, nasaId: 'PIA06193', icon: 'satellite' },
  ];
  function buildSpotlight() {
    const news = S.news || [];
    const out = [];
    (S.programs || []).forEach((p) => {
      out.push({ id: 'p' + p.id, name: p.name, agency: p.agency, since: p.since, sinceLabel: 'program running', about: p.about, image: p.image, logoLike: true, match: p.match, icon: 'rocket' });
    });
    FLAGSHIPS.forEach((f) => out.push(Object.assign({}, f, { image: 'https://images-assets.nasa.gov/image/' + f.nasaId + '/' + f.nasaId + '~medium.jpg' })));
    out.forEach((m) => {
      const re = m.match instanceof RegExp ? m.match : new RegExp(m.match, 'i');
      const hit = news.find((n) => re.test(n.title));
      m.news = hit ? { title: hit.title, site: hit.site, at: hit.at } : null;
      const nextLaunch = (S.launches || []).find((l) => re.test(l.name) && l.net > OW.nowMs());
      m.next = nextLaunch ? { name: nextLaunch.mission, net: nextLaunch.net } : null;
    });
    // missions that are in the news first
    S.spotlight = out.sort((a, b) => (b.news ? 1 : 0) + (b.next ? 1 : 0) - ((a.news ? 1 : 0) + (a.next ? 1 : 0)));
  }

  // ---------------------------------------------------------------------------
  // fetchers
  // ---------------------------------------------------------------------------
  async function pull(topic, url, ttl, apply) {
    try {
      const r = await OW.net.json(url, ttl);
      apply(r.data);
      S.updated[topic] = OW.nowMs() - (r.ageSec || 0) * 1000;
      S.stale[topic] = !!r.stale;
      S.error[topic] = null;
    } catch (e) {
      S.stale[topic] = true;
      S.error[topic] = String(e.message || e);
    }
    derive();
    save();
    S.emit(topic);
  }

  // ---- wallhub ------------------------------------------------------------------
  const useHub = () => !!(OW.hub && OW.hub.enabled());
  /**
   * Ask the hub for a topic. Returns true when the hub ANSWERED — then its answer stands, even
   * "nothing cached yet" (the public API is not asked as well: same house IP, same rate limit).
   * Returns false only when there is no hub or it cannot be reached; the caller then goes direct.
   */
  async function hubPull(topic, path, apply) {
    if (!useHub()) return false;
    let r;
    try { r = await OW.hub.get(path); } catch (e) { S.via[topic] = 'direct'; return false; }
    const env = OW.hub.unwrap(r.data);
    if (env) {
      try { apply(env.data); S.updated[topic] = env.at || OW.nowMs(); S.stale[topic] = env.stale; S.error[topic] = null; }
      catch (e) { S.stale[topic] = true; S.error[topic] = String(e.message || e); }
    } else { S.stale[topic] = true; S.error[topic] = 'wallhub: ' + ((r.data && r.data.error) || 'nothing cached yet'); }
    S.via[topic] = 'wallhub';
    derive(); save(); S.emit(topic);
    return true;
  }
  function applyPrograms(d) {
    S.programs = (d.results || []).filter((p) => !p.end_date && PROGRAM_PICK.some((re) => re.test(p.name))).map((p) => ({
      id: p.id, name: p.name, since: p.start_date, about: firstSentence(p.description), image: img(p.image),
      agency: ((p.agencies || []).slice(0, 2).map((a) => a.abbrev || a.name).join(' · ')) || '',
      match: /international space station/i.test(p.name) ? 'ISS|space station|expedition \\d' : p.name.replace(/^SpaceX /i, '').replace(/ (program|space station|private spaceflight)$/i, ''),
    }));
  }
  function applyNews(d) {
    S.news = (d.results || []).map((n) => ({ id: n.id, title: (n.title || '').trim(), site: n.news_site, url: n.url, at: Date.parse(n.published_at) }));
  }
  let hubLaunches = [];
  /** the list the UI shows = feed list + whatever the hub features (it may know a launch the list call missed) */
  function mergeLaunches(list) {
    const by = new Map(), now = OW.nowMs(), sel = S.hubSel && S.hubSel.id;
    (list || []).filter((l) => !l.sim).forEach((l) => by.set(l.id, l));
    hubLaunches.forEach((l) => by.set(l.id, l));
    return withSim(Array.from(by.values()).filter((l) => l.net > now - 12 * 3600000 || 'l' + l.id === sel || l.status === 'In Flight'));
  }
  /** /v1/launches/featured: {selected:{kind,data}, secondary:[…], reason, pin_pending} */
  function applyFeatured(d) {
    if (!d || !d.selected || !d.selected.data) { S.hubSel = null; hubLaunches = []; derive(); S.emit('launches'); return; }
    const items = [d.selected].concat(d.secondary || []);
    hubLaunches = items.filter((x) => x && x.kind === 'launch' && x.data && x.data.net).map((x) => mapLaunch(x.data));
    S.hubSel = { id: (d.selected.kind === 'event' ? 'e' : 'l') + d.selected.data.id, kind: d.selected.kind, reason: String(d.reason || ''), pinPending: !!d.pin_pending, at: OW.nowMs() };
    S.launches = mergeLaunches(S.launches);
    S.updated.featured = OW.nowMs(); S.via.featured = 'wallhub';
    derive(); save(); S.emit('launches');
  }
  /** the hub's pick only counts while the hub is answering */
  const hubSel = () => (S.hubSel && OW.hub && OW.hub.reachable() && OW.nowMs() - S.hubSel.at < 10 * 60000 ? S.hubSel : null);
  S.hubFeatured = hubSel;
  let hubPasses = null;

  const fetchers = {
    launches: async () => {
      if (await hubPull('launches', '/v1/launches', (d) => { S.launches = mergeLaunches((d.results || []).map(mapLaunch)); })) return;
      S.via.launches = 'direct';
      return pull('launches', LL() + '/launches/upcoming/?limit=10&mode=detailed', 1800, (d) => { S.launches = withSim((d.results || []).map(mapLaunch)); });
    },
    events: async () => {
      const apply = (d) => { S.events = (d.results || []).map(mapEvent).sort((a, b) => a.date - b.date); };
      if (await hubPull('events', '/v1/events', apply)) return;
      return pull('events', LL() + '/events/upcoming/?limit=12', 1800, apply);
    },
    crew: async () => {
      // the hub carries who is in space; station grouping needs expeditions, which only the direct path has
      if (await hubPull('crew', '/v1/astronauts', (d) => { S.crew = mapCrew(d.results || [], null); })) return;
      let astros = null, exps = null;
      try { astros = (await OW.net.json(LL() + '/astronauts/?in_space=true&limit=40', 21600)).data.results; } catch (e) { S.error.crew = String(e.message || e); }
      try { exps = (await OW.net.json(LL() + '/expeditions/?is_active=true&mode=detailed&limit=6', 21600)).data.results; } catch (e) { S.error.crew = String(e.message || e); }
      if (astros || exps) { S.crew = mapCrew(astros, exps); S.updated.crew = OW.nowMs(); S.stale.crew = false; S.error.crew = null; } else S.stale.crew = true;
      save(); S.emit('crew');
    },
    programs: async () => {
      if (await hubPull('programs', '/v1/programs', applyPrograms)) return;
      return pull('programs', LL() + '/programs/?limit=60', 86400, applyPrograms);
    },
    news: async () => {
      if (await hubPull('news', '/v1/news', applyNews)) return;
      return pull('news', 'https://api.spaceflightnewsapi.net/v4/articles/?limit=14', 900, applyNews);
    },
    iss: async () => {
      if (useHub()) {
        if (OW.hub.streaming && Date.now() - (S.updated.iss || 0) < 25000) return;   // the stream is feeding fixes
        try { const r = await OW.hub.get('/v1/iss'); if (hubIss(r.data)) return; if (r.status) { S.stale.iss = true; S.error.iss = 'wallhub: no fix'; S.emit('iss'); return; } } catch (e) { /* unreachable: direct */ }
      }
      S.via.iss = 'direct';
      const t = Math.floor(Date.now() / 1000);
      try {
        const r = await OW.net.json('https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=' + t + ',' + (t + 30) + '&units=kilometers', 8);
        const a = r.data[0], b = r.data[1];
        if (!a || typeof a.latitude !== 'number') throw new Error('bad fix');
        setFix(a, b);
        S.stale.iss = !!r.stale && Date.now() / 1000 - a.timestamp > 120;
        S.error.iss = null;
      } catch (e) {
        S.stale.iss = true; S.error.iss = String(e.message || e);
      }
      S.emit('iss');
    },
    // pass predictions for home come from the hub (SGP4 on current elements); the local circular-orbit estimate is the fallback
    passes: async () => {
      if (!useHub()) { hubPasses = null; return; }
      try {
        const r = await OW.hub.get('/v1/objects/25544/passes');
        if (r.ok && r.data && r.data.available && Array.isArray(r.data.passes)) {
          hubPasses = { at: Date.now(), list: r.data.passes.map((p) => ({ start: Date.parse(p.rise), end: Date.parse(p.set), maxAt: Date.parse(p.culmination), maxEl: Math.round(p.max_elevation_deg), visible: !!p.visible, estimated: !!r.data.visibility_estimated, via: 'wallhub' })) };
          S.via.pass = 'wallhub';
        } else if (r.status) hubPasses = null;
      } catch (e) { hubPasses = null; }
      S.pass = predictPass(); S.emit('iss');
    },
  };
  /** a hub ISS envelope ({data:{latitude, longitude, altitude, velocity, timestamp, …}}) -> fix. false when it holds none */
  function hubIss(env) {
    const e = OW.hub.unwrap(env);
    const a = e && e.data;
    if (!a || typeof a.latitude !== 'number' || typeof a.timestamp !== 'number') return false;
    if (orbit && a.timestamp * 1000 <= orbit.t0) return true;
    setFix(a, null);
    S.stale.iss = Date.now() / 1000 - a.timestamp > 120; S.error.iss = null; S.via.iss = 'wallhub';
    S.emit('iss');
    return true;
  }

  // ---------------------------------------------------------------------------
  // ISS orbit propagation (circular orbit, good for a few orbits of ground track)
  // ---------------------------------------------------------------------------
  const INC = 51.64 * rad, RE = 6371, MU = 398600.4418, WE = 360 / 86164.1;
  let orbit = null;
  const norm = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

  let lastFix = null;
  function setFix(a, b) {
    // heading: from the paired fix when there is one, else from the previous fix, else keep what we knew
    let ascending = orbit ? orbit.asc : true;
    if (b) ascending = b.latitude >= a.latitude;
    else if (lastFix && a.timestamp > lastFix.timestamp && a.timestamp - lastFix.timestamp < 600) ascending = a.latitude >= lastFix.latitude;
    lastFix = { timestamp: a.timestamp, latitude: a.latitude };
    const su = OW.clamp(Math.sin(a.latitude * rad) / Math.sin(INC), -1, 1);
    const u0 = ascending ? Math.asin(su) : Math.PI - Math.asin(su);
    const alt = a.altitude || 420;
    const n = Math.sqrt(MU / Math.pow(RE + alt, 3));           // rad / s
    const lonNode = a.longitude - Math.atan2(Math.cos(INC) * Math.sin(u0), Math.cos(u0)) / rad;
    orbit = { asc: ascending, t0: a.timestamp * 1000, u0, n, lonNode, alt, vel: a.velocity, solarLat: a.solar_lat, solarLon: a.solar_lon, period: (2 * Math.PI) / n };
    S.iss = Object.assign(S.issAt(Date.now()), { fixAt: orbit.t0, visibility: a.visibility });
    S.updated.iss = Date.now();
    S.pass = predictPass();
  }

  /** ISS state at wall-clock time t (ms). Null until the first fix arrives. */
  S.issAt = function (t) {
    if (!orbit) return null;
    const dt = (t - orbit.t0) / 1000;
    const u = orbit.u0 + orbit.n * dt;
    const lat = Math.asin(Math.sin(INC) * Math.sin(u)) / rad;
    const lon = norm(orbit.lonNode + Math.atan2(Math.cos(INC) * Math.sin(u), Math.cos(u)) / rad - WE * dt);
    return { lat, lon, alt: orbit.alt, vel: orbit.vel, t };
  };

  /** Ground track as arrays of [lon, lat] segments (split at the date line). */
  S.issTrack = function (fromMin, toMin, stepSec) {
    if (!orbit) return [];
    const segs = [];
    let seg = [], prev = null;
    const now = Date.now();
    for (let s = fromMin * 60; s <= toMin * 60; s += stepSec || 60) {
      const p = S.issAt(now + s * 1000);
      if (prev != null && Math.abs(p.lon - prev) > 180) { segs.push(seg); seg = []; }
      seg.push([p.lon, p.lat]);
      prev = p.lon;
    }
    if (seg.length) segs.push(seg);
    return segs;
  };

  function centralAngle(lat1, lon1, lat2, lon2) {
    const a = Math.sin(lat1 * rad) * Math.sin(lat2 * rad) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon1 - lon2) * rad);
    return Math.acos(OW.clamp(a, -1, 1));
  }
  /** elevation (deg) of the ISS seen from a ground point */
  function elevation(obsLat, obsLon, p) {
    const psi = centralAngle(obsLat, obsLon, p.lat, p.lon);
    return Math.atan2(Math.cos(psi) - RE / (RE + p.alt), Math.sin(psi)) / rad;
  }
  function subsolar(t) {
    if (!orbit || orbit.solarLat == null) return null;
    const dt = (t - orbit.t0) / 1000;
    return { lat: orbit.solarLat, lon: norm(orbit.solarLon - (360 / 86400) * dt) };
  }
  S.subsolar = () => subsolar(Date.now());

  /** Next pass over the configured home location within 24 h (null without a location). */
  function predictPass() {
    if (hubPasses && Date.now() - hubPasses.at < 3 * 3600000) {
      const next = hubPasses.list.find((p) => p.end > Date.now() && p.maxEl >= 10);
      if (next || hubPasses.list.length) return next || null;
    }
    const lat = OW.config.get('home.lat'), lon = OW.config.get('home.lon');
    if (!orbit || typeof lat !== 'number' || typeof lon !== 'number') return null;
    const now = Date.now();
    let pass = null;
    for (let s = 0; s <= 24 * 3600; s += 15) {
      const t = now + s * 1000;
      const p = S.issAt(t);
      const el = elevation(lat, lon, p);
      if (el >= 10) {
        if (!pass) pass = { start: t, end: t, maxEl: el, maxAt: t };
        pass.end = t;
        if (el > pass.maxEl) { pass.maxEl = el; pass.maxAt = t; }
      } else if (pass) break;
    }
    if (!pass) return null;
    // naked-eye visible when the observer is in darkness and the station is still sunlit
    const sun = subsolar(pass.maxAt), at = S.issAt(pass.maxAt);
    if (sun) {
      const sunEl = 90 - centralAngle(lat, lon, sun.lat, sun.lon) / rad;
      const issSunAngle = centralAngle(at.lat, at.lon, sun.lat, sun.lon) / rad;
      pass.dark = sunEl < -6;
      pass.sunlit = issSunAngle < 90 + Math.acos(RE / (RE + at.alt)) / rad;
      pass.visible = pass.dark && pass.sunlit;
    }
    pass.maxEl = Math.round(pass.maxEl);
    return pass;
  }
  /**
   * LOOK UP: the station is in a naked-eye pass over home (or about to be, within two minutes).
   * {name, az, compass, el, rising, start, end, maxEl} — az/el are where to look right now; null otherwise.
   */
  let lookTest = null;
  S.lookTest = (on) => { lookTest = on ? { until: Date.now() + 4 * 60000 } : null; };
  S.lookUp = function () {
    const lat = OW.config.get('home.lat'), lon = OW.config.get('home.lon'), now = Date.now();
    if (!orbit || typeof lat !== 'number' || typeof lon !== 'number') return null;
    const p = S.pass, test = lookTest && now < lookTest.until;
    if (!test && !(p && p.visible && now >= p.start - 2 * 60000 && now <= p.end)) return null;
    const at = S.issAt(now), el = elevation(lat, lon, at);
    const y = Math.sin((at.lon - lon) * rad) * Math.cos(at.lat * rad);
    const x = Math.cos(lat * rad) * Math.sin(at.lat * rad) - Math.sin(lat * rad) * Math.cos(at.lat * rad) * Math.cos((at.lon - lon) * rad);
    const az = (Math.atan2(y, x) / rad + 360) % 360;
    const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(az / 22.5) % 16];
    return { name: 'ISS', az: Math.round(az), compass, el: Math.round(el), test: !!test && !(p && p.visible && now >= p.start - 120000 && now <= p.end),
      rising: p ? now < p.maxAt : false, start: p ? p.start : now, end: test && !(p && now <= p.end && now >= p.start - 120000) ? lookTest.until : p.end, maxEl: p ? p.maxEl : Math.round(el) };
  };
  /** {overhead, visible, el} right now for the home location */
  S.issOverhead = function () {
    const lat = OW.config.get('home.lat'), lon = OW.config.get('home.lon');
    if (!orbit || typeof lat !== 'number' || typeof lon !== 'number') return null;
    const el = elevation(lat, lon, S.issAt(Date.now()));
    return { overhead: el >= 10, el: Math.round(el), visible: !!(S.pass && S.pass.visible && Date.now() >= S.pass.start && Date.now() <= S.pass.end) };
  };

  // ---------------------------------------------------------------------------
  // derived state: launch-day focus + LIVE
  // ---------------------------------------------------------------------------
  const DONE = new Set(['Success', 'Failure', 'Partial Failure', 'Payload Deployed']);

  /**
   * Favourite order: position of the first matching rule in settings `launch.priority`
   * (default: Starship > SpaceX > NASA / Artemis > Rocket Lab > Blue Origin > everyone else).
   * Lower is better; anything in `launch.hide` sinks to the bottom and never leads on its own.
   */
  S.rank = function (l) {
    const text = [l.rocket, l.name, l.provider, l.abbrev, l.mission].join(' ').toLowerCase();
    const hide = OW.config.get('launch.hide') || [];
    if (hide.some((h) => h && text.includes(String(h).toLowerCase()))) return 999;
    const order = OW.config.get('launch.priority') || [];
    for (let i = 0; i < order.length; i++) {
      if (String(order[i]).toLowerCase().split('|').some((k) => k.trim() && (k.trim() === '@usa' ? !!l.usa : text.includes(k.trim())))) return i;
    }
    return order.length;
  };
  /**
   * "Visible from home": how a launch looks from the configured home location (SPEC v1.7).
   * Returns null when there is no home location, no pad position, or the pad is too far away.
   *   {km, bearing, compass, clearSec, twilight, night, boom}
   */
  S.visibleFromHome = function (l) {
    const lat = OW.config.get('home.lat'), lon = OW.config.get('home.lon');
    if (typeof lat !== 'number' || typeof lon !== 'number' || l.padLat == null || l.padLon == null) return null;
    const psi = centralAngle(lat, lon, l.padLat, l.padLon), km = psi * RE;
    if (km > (OW.config.get('visible.km') || 320) || km < 2) return null;
    const y = Math.sin((l.padLon - lon) * rad) * Math.cos(l.padLat * rad);
    const x = Math.cos(lat * rad) * Math.sin(l.padLat * rad) - Math.sin(lat * rad) * Math.cos(l.padLat * rad) * Math.cos((l.padLon - lon) * rad);
    const bearing = (Math.atan2(y, x) / rad + 360) % 360;
    const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(bearing / 22.5) % 16];
    // rocket must climb above ~5 degrees over the horizon (trees, haze): altitude needed, then a generic early ascent (~5 m/s^2)
    const needKm = km * Math.tan(5 * rad) + (km * km) / (2 * RE);
    const clearSec = Math.round(Math.sqrt((2 * needKm * 1000) / 5) / 5) * 5;
    // twilight launches (sun just below the horizon here, plume still in sunlight) are the "jellyfish" ones
    const sun = OW.sunTimes(new Date(l.net), lat);
    const afterSet = (l.net - sun.sunset) / 60000, beforeRise = (sun.sunrise - l.net) / 60000;
    const twilight = (afterSet >= 15 && afterSet <= 95) || (beforeRise >= 15 && beforeRise <= 95);
    const night = l.net > sun.sunset + 15 * 60000 || l.net < sun.sunrise - 15 * 60000;
    const boom = /LZ|landing zone|RTLS/i.test(l.landing || '');
    return { km: Math.round(km), bearing: Math.round(bearing), compass, clearSec, twilight, night, boom };
  };

  /**
   * Popularity inside a favourite tier (higher = more people care). Launch Library has no popularity
   * field, so this is a documented heuristic: crewed flights and Starship lead, then heavy-lift /
   * flagship vehicles and deep-space or science missions; routine constellation batches go last.
   */
  S.popularity = function (l) {
    if (l.significance != null) return l.significance;
    const t = [l.rocket, l.name, l.mission, l.type, l.orbit].join(' ').toLowerCase();
    let p = 0;
    if (l.crewed) p += 5;
    if (/starship/.test(t)) p += 5;
    if (/artemis|sls|falcon heavy|new glenn|vulcan/.test(t)) p += 3;
    if (/lunar|moon|mars|planetary|heliocentric|astrophysics|telescope|science|test flight|resupply/.test(t)) p += 2;
    if (l.featured) p += 1;
    if (/starlink|kuiper|leo \(|oneweb|qianfan|guowang|group \d/.test(t)) p -= 2;
    return p;
  };

  /** Pin / unpin a mission ("l<launch id>" or "e<event id>"). Persisted; expires when the mission ends. */
  let pinWriteAt = 0;
  S.track = function (id) {
    const next = (S.tracked || OW.config.get('launch.track') || '') === id ? '' : id;
    OW.config.set('launch.track', next);
    if (useHub() && String(OW.config.get('wallhub.token') || '').trim()) {
      pinWriteAt = OW.nowMs();
      const canon = next ? (next.charAt(0) === 'e' ? 'event:' : 'launch:') + next.slice(1) : null;
      OW.hub.patchPrefs({ pinned_mission_id: canon, pin_expires_at: null })
        .then(() => { pinWriteAt = 0; OW.hub.refresh(); })
        .catch((e) => { pinWriteAt = 0; S.emit('pin-error', String(e.message || e)); });
    } else if (useHub()) S.emit('pin-error', 'pinned on this screen only (no wallhub prefs token)');
    derive();
    S.emit('launches');
    return !!next;
  };
  /** the pin every wall shares (wallhub prefs), as "l<id>" / "e<id>"; undefined when the hub has no say right now */
  function hubPin() {
    if (!useHub() || !OW.hub.reachable() || !OW.hub.prefs || OW.nowMs() - pinWriteAt < 8000) return undefined;
    const m = /^(launch|event):(.+)$/.exec(OW.hub.prefs.pinned_mission_id || '');
    return m ? (m[1] === 'event' ? 'e' : 'l') + m[2] : '';
  }
  let lastLiveId = null;
  const alerted = new Set();

  function derive() {
    const now = OW.nowMs();
    const hours = OW.config.get('launch.hours'), fHours = OW.config.get('launch.featuredHours');
    const list = S.launches || [];

    // ---- which mission leads? (rule documented in SPEC.md, "Mission tracking & priority") ----
    //  1. a mission the user pinned ("Track this") always leads until it is over
    //  2. otherwise missions are ranked by: happening now  >  favourite order  >  soonest
    //  3. when two are live at once the favourite wins and the other becomes a secondary chip
    const rank = S.rank;
    const hs = hubSel();
    const hubLive = (l) => !!(hs && hs.reason === 'live' && hs.id === 'l' + l.id);
    const isLive = (l) => hubLive(l) || l.status === 'In Flight' || (!DONE.has(l.status) && l.webcastLive && Math.abs(l.net - now) < 3 * 3600000) ||
      (l.precise && (l.status === 'Go' || l.sim) && now >= l.net - 10 * 60000 && now <= l.net + 20 * 60000);
    const over = (l) => hubLive(l) ? false : DONE.has(l.status) ? now - l.net > 30 * 60000 : (l.status !== 'In Flight' && now - l.net > 3 * 3600000);

    // pinned mission: auto-expires when it has ended or dropped out of the feed after its time
    let pin = OW.config.get('launch.track') || '';
    const shared = hubPin();
    // a pin set through the hub is the house's pin; a local one stays only where it could not be shared
    if (shared !== undefined && (shared || String(OW.config.get('wallhub.token') || '').trim()) && shared !== pin) { pin = shared; OW.config.set('launch.track', pin); }
    let tracked = null, trackedEvent = null;
    if (pin) {
      tracked = list.find((l) => 'l' + l.id === pin) || null;
      trackedEvent = (S.events || []).find((e) => 'e' + e.id === pin) || null;
      const gone = (!tracked && !trackedEvent && S.updated.launches && !S.stale.launches) || (tracked && over(tracked)) || (trackedEvent && now - trackedEvent.date > (trackedEvent.duration || 3 * 3600000));
      if (gone && !(shared && shared === pin)) { OW.config.set('launch.track', ''); pin = ''; tracked = trackedEvent = null; }   // the hub expires its own pins
    }
    S.tracked = pin;

    const inWindow = (l) => {
      if (over(l) || !l.precise || l.status === 'TBD') return false;
      const dt = l.net - now;
      return dt > (l.status === 'In Flight' ? -6 * 60 : -25) * 60000 && dt <= (l.featured || rank(l) <= 1 ? fHours : hours) * 3600000;
    };
    const urgency = (l) => (isLive(l) ? 0 : l.net - now < 2 * 3600000 && l.net > now - 20 * 60000 ? 1 : 2);
    const cands = list.filter((l) => inWindow(l) || isLive(l)).filter((l) => rank(l) < 900 || isLive(l))
      .sort((a, b) => urgency(a) - urgency(b) || rank(a) - rank(b) || S.popularity(b) - S.popularity(a) || a.net - b.net);
    // wallhub's featured pick leads on every screen when the hub is answering; the local ranking is the fallback
    let lead = cands[0] || null;
    if (hs && hs.kind === 'launch') {
      const sel = list.find((l) => 'l' + l.id === hs.id);
      const near = sel && (hubLive(sel) || /pin/i.test(hs.reason) || isLive(sel) || (sel.precise && sel.net - now <= fHours * 3600000 && now - sel.net < 6 * 3600000 && !over(sel)));
      lead = near ? sel : null;
    } else if (hs && hs.kind === 'event') lead = null;
    S.focus = tracked || lead;

    // happening right now: the leader, plus whatever else is live as secondary chips
    const liveOf = (l) => ({ id: 'l' + l.id, kind: 'launch', title: l.rocket + ' · ' + l.mission, short: l.rocket, sub: now >= l.net ? 'in flight' : 'terminal count', at: l.net, url: l.webcast || l.info, image: l.image, provider: l.abbrev });
    const liveLaunches = list.filter(isLive).sort((a, b) => (tracked && a.id === tracked.id ? -1 : tracked && b.id === tracked.id ? 1 : 0) || (hubLive(b) ? 1 : 0) - (hubLive(a) ? 1 : 0) || rank(a) - rank(b) || S.popularity(b) - S.popularity(a) || b.net - a.net);
    const liveEvents = (S.events || []).filter((e) => now <= e.date + (e.duration || 3 * 3600000) && (e.webcastLive || (e.precise && now >= e.date && now <= e.date + (e.duration || 45 * 60000))))
      .map((ev) => ({ id: 'e' + ev.id, kind: /walk|eva/i.test(ev.type) ? 'eva' : /land/i.test(ev.type) ? 'landing' : 'event', title: ev.name, short: ev.name, sub: ev.type.toLowerCase(), at: ev.date, url: ev.webcast, image: ev.image, provider: ev.location }));
    let all = liveLaunches.map(liveOf).concat(liveEvents);
    if (trackedEvent) all.sort((a, b) => (a.id === pin ? -1 : b.id === pin ? 1 : 0));
    else if (hs && hs.kind === 'event' && hs.reason === 'live') all.sort((a, b) => (a.id === hs.id ? -1 : b.id === hs.id ? 1 : 0));
    const live = all[0] || null;
    S.liveOthers = all.slice(1, 3);
    // "go outside" alerts for launches you can see from home: T-30 min and T-5 min, once each
    if (OW.config.get('visible.alerts') !== false) {
      list.forEach((l) => {
        if (!l.precise || over(l) || l.status === 'TBD') return;
        const v = S.visibleFromHome(l);
        if (!v) return;
        const mins = (l.net - now) / 60000;
        [[30, 'go outside soon'], [5, 'look ' + v.compass + ' now']].forEach(([m, text]) => {
          const key = l.id + ':' + m;
          if (mins <= m && mins > m - 2 && !alerted.has(key)) {
            alerted.add(key);
            S.emit('visible-alert', { launch: l, minutes: m, text, v });
            if (OW.data) OW.data.call('chime', { reason: l.rocket + ' T-' + m + ' min, ' + text });
          }
        });
      });
    }
    S.live = live;
    if (live && live.id !== lastLiveId) {
      lastLiveId = live.id;
      // optional chime (stub hook -> data provider; audioAdapter later)
      if (OW.config.get('launch.chime') && OW.data) OW.data.call('chime', { reason: live.kind + ': ' + live.title });
      S.emit('live-start', live);
    }
    if (!live) lastLiveId = null;
    buildSpotlight();
  }
  S.derive = derive;

  // ---- simulation (demo / testing): ?sim=launch:45 or settings toggle ------------
  let simLaunch = null;
  function withSim(list) {
    list = (list || []).filter((l) => !l.sim);
    if (simLaunch) list.push(simLaunch);
    return list.sort((a, b) => a.net - b.net);
  }
  S.simulating = () => !!simLaunch;
  S.simulate = function (minutes) {
    S.launches = (S.launches || []).filter((l) => !l.sim);
    if (minutes == null) { simLaunch = null; derive(); S.emit('launches'); return; }
    const base = (S.launches || []).find((l) => l.image) || {
      id: 'sim', name: 'Starship | Flight 16', rocket: 'Starship', mission: 'Flight 16', type: 'Test Flight', orbit: 'Sub', about: 'Integrated flight test of Starship and Super Heavy.',
      provider: 'SpaceX', abbrev: 'SpX', logo: null, pad: 'Orbital Launch Pad B', location: 'Starbase, TX, USA', image: null, credit: 'SpaceX',
      webcast: 'https://www.spacex.com/launches/', info: null, probability: 80, featured: true,
    };
    const sim = Object.assign({}, base, { id: 'sim-' + base.id, sim: true, net: OW.nowMs() + minutes * 60000, precise: true, status: 'Go', statusName: 'Go for Launch (simulated)', statusId: 1, webcastLive: false, featured: true, webcast: base.webcast || base.info || 'https://www.youtube.com/@NASASpaceflight/live' });
    simLaunch = sim;
    S.launches = withSim(S.launches);
    derive();
    S.emit('launches');
  };

  // ---------------------------------------------------------------------------
  // persistence + scheduling
  // ---------------------------------------------------------------------------
  function save() {
    OW.store.set(SNAPSHOT, { launches: S.launches.filter((l) => !l.sim), events: S.events, crew: S.crew, programs: S.programs, news: S.news, updated: S.updated });
  }
  function restore() {
    const snap = OW.store.get(SNAPSHOT, null);
    if (!snap) return;
    ['launches', 'events', 'crew', 'programs', 'news'].forEach((k) => { if (snap[k]) S[k] = snap[k]; });
    S.updated = snap.updated || {};
    Object.keys(S.updated).forEach((k) => { S.stale[k] = true; });
    derive();
  }

  let issTimer = null;
  function scheduleIss() {
    clearInterval(issTimer);
    issTimer = setInterval(fetchers.iss, S.watchingIss ? 10000 : 60000);
  }
  /** The mission-control workspace asks for 10 s position updates while it is on screen. */
  S.watchIss = function (on) {
    if (S.watchingIss === !!on) return;
    S.watchingIss = !!on;
    if (on) fetchers.iss();
    scheduleIss();
  };
  S.refresh = function (topic) { if (fetchers[topic]) return fetchers[topic](); };

  S.start = function () {
    restore();
    const every = (fn, min, delayMs) => { setTimeout(fn, delayMs); setInterval(fn, min * 60000); };
    every(fetchers.launches, 30, 400);
    every(fetchers.events, 30, 1500);
    every(fetchers.news, 15, 2500);
    if (!OW.isDream) {
      every(fetchers.crew, 360, 3500);
      every(fetchers.programs, 1440, 5000);
      setTimeout(fetchers.iss, 1200);
      scheduleIss();
    }
    // focus / live windows open and close with the clock, not only with fetches
    setInterval(() => {
      const f = S.focus && S.focus.id, l = S.live && S.live.id;
      derive();
      if ((S.focus && S.focus.id) !== f || (S.live && S.live.id) !== l) S.emit('launches');
    }, 20000);
setInterval(() => { S.pass = predictPass(); }, 5 * 60000);
    if (!OW.isDream) every(fetchers.passes, 20, 2000);
    if (OW.hub) OW.hub.on((topic, data) => {
      if (topic === 'featured') applyFeatured(data);
      else if (topic === 'prefs') { derive(); S.emit('launches'); }
      else if (topic === 'iss') hubIss(data);
      else if (topic === 'launches' || topic === 'events' || topic === 'news' || topic === 'programs') { if (fetchers[topic]) fetchers[topic](); }
      else if (topic === 'astronauts') fetchers.crew();
      else if (topic === 'up' || topic === 'down' || topic === 'config') {
        // the source changed: ask again right away (hub first, public APIs only when it is gone)
        ['launches', 'events', 'news', 'passes'].forEach((t, i) => setTimeout(fetchers[t], 300 + i * 400));
        derive(); S.emit('launches');
      }
    });
    const sim = OW.params.get('sim');
    if (sim) {
      const m = /^launch:(-?\d+(\.\d+)?)$/.exec(sim);
      setTimeout(() => S.simulate(m ? +m[1] : sim === 'live' ? -1 : 45), 2500);
    }
  };

  OW.space = S;
})();
