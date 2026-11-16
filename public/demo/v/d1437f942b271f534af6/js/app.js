/* Flight Day — application controller: boot, workspaces, input (touch +
 * D-pad), top bar, LIVE banner, feed line, ambient mode, morning launch
 * sequence, settings, and the per-second tick. */
(function () {
  'use strict';
  const OW = window.OW;
  const { esc, icon, fmt } = OW;
  const $ = (id) => document.getElementById(id);
  // five named areas (the same names in the Apple apps). Ambient is not one of them: it is the idle state of any area.
  const WORKSPACES = [['home', 'Home'], ['space', 'Space'], ['house', 'House'], ['night', 'Night'], ['status', 'Status']];
  const THEMES = ['tokyo-night', 'starship', 'liquid-glass', 'console'];
  const THEME_LABEL = { 'tokyo-night': 'Tokyo Night', starship: 'Ember', 'liquid-glass': 'Liquid Glass', console: 'Console' };

  const A = { ws: 'home', prevWs: 'home', ambient: false, settings: false, blackout: false, panel: null };
  OW.app = A;
  let stage;

  // =================================================================================
  // theme
  // =================================================================================
  function applyTheme() {
    const t = THEMES.includes(OW.config.get('theme')) ? OW.config.get('theme') : THEMES[0];
    document.documentElement.dataset.theme = t;
  }

  // =================================================================================
  // top bar, feed line, LIVE banner
  // =================================================================================
  /** areas shown on this screen (Home always; the rest can be switched off in Settings) */
  const areas = () => WORKSPACES.filter(([id]) => id === 'home' || OW.config.get('areas.' + id) !== false);
  function renderBar() {
    $('ws').innerHTML = areas().map(([id, label], i) =>
      '<button class="wsb' + (A.ws === id ? ' on' : '') + '" data-focus data-fid="ws-' + id + '" data-act="ws" data-arg="' + id + '">' + label + (OW.isTV ? '' : '<i>' + (i + 1) + '</i>') + '</button>').join('');
    renderBarRight();
  }
  function renderBarRight() {
    const s = OW.data.state, u = OW.usage.data;
    if (!s) return;
    const w = s.weather, np = s.nowPlaying && !['idle','off','unavailable'].includes(s.nowPlaying.state) ? s.nowPlaying : null;
    const wx = w ? OW.views.wxIcon(w) : null;
    const gauges = u ? u.providers.filter((p) => p.fiveHour || p.weekly || p.limitHit).map((p) => {
      const l = OW.usage.level(p);
      return '<span class="ug t-' + p.tone + ' l-' + l.level + '" title="' + esc(p.label) + '"><b>' + esc(p.label) + ' ' + Math.round(l.pct) + '%</b><i class="meter"><i style="width:' + OW.clamp(l.pct, 3, 100) + '%"></i></i></span>';
    }).join('') : '';
    const next = OW.space.launches.find((l) => l.net > OW.nowMs() && l.precise);
    $('barRight').innerHTML =
      (w ? '<span class="bi">' + icon(wx) + w.temp + '°</span>' : '') +
      (np ? '<span class="bi">' + icon(np.state === 'playing' ? 'music' : 'pause') + '<span class="clip">' + esc(np.room || np.device || '') + '</span></span>' : '') +
      (!np && next ? '<span class="bi">' + icon('rocket') + '<span data-cd="' + next.net + '" data-cd-style="tminus"></span></span>' : '') +
      (gauges ? '<button class="bi ugs" data-focus data-fid="bar-usage" data-act="ws" data-arg="status" aria-label="Plan limits">' + gauges + '</button>' : '') +
      '<button class="bi tbtn" data-focus data-fid="bar-set" data-act="settings" aria-label="Settings">' + icon('gear') + (OW.isTV ? 'Settings' : '') + '</button>';
  }
  function renderBarCenter() {
    $('barCenter').innerHTML = '<span data-clock="bar"></span>';
  }

  let newsIndex = 0;
  function renderFeed() {
    const b = OW.bg.current;
    const src = { flightday: "flightday", apod: 'apod', nasa: 'nasa', launch: 'launch library' }[b && b.source] || 'feed';
    $('feedCredit').innerHTML = OW.demo?.active ? '' : icon('satellite') + '<b>feed · ' + esc(OW.bg.reason && OW.bg.reason !== src ? OW.bg.reason : src) + '</b><span>' + (b ? esc(b.title) + ' — ' + esc(b.credit) : '') + '</span>';
    const news = OW.space.news;
    const el = $('feedNews');
    if (news.length) {
      const n = news[newsIndex % news.length];
      el.innerHTML = '<span class="fade"><em>' + esc(n.site) + '</em>' + esc(n.title) + '</span>' + icon('news');
    } else {
      const st = OW.data.status;
      el.innerHTML = '<span class="fade"><em>' + esc(st.provider) + '</em>' + esc(st.detail || '') + '</span>' + icon('home');
    }
  }

  function renderLive() {
    const l = OW.space.live, el = $('live');
    stage.classList.toggle('has-live', !!l);
    el.hidden = !l;
    if (!l) { el.innerHTML = ''; return; }
    const clock = x => '<span class="mono" data-cd="' + x.at + '" data-cd-style="tminus"></span>';
    const others = (OW.space.liveOthers || []).map(o => '<button class="chip c-red" data-focus data-fid="live-' + esc(o.id) + '" data-act="live.watch" data-arg="' + esc(o.id) + '"><i class="pulse"></i>' + esc(o.short) + ' ' + clock(o) + '</button>').join('');
    el.innerHTML = '<div class="live-in"><button class="live-main" data-focus data-fid="live" data-act="live.watch" data-arg="' + esc(l.id) + '"><span class="live-tag"><i class="pulse"></i>LIVE</span><b>' + esc(l.title) + '</b><span>' + esc(l.sub) + '</span>' + clock(l) + '<span class="grow"></span><span class="live-go">Watch ›</span></button>' + others + '</div>';
    layoutBlur();
  }

  // =================================================================================
  // frosted tiles: tell each tile where it sits on the stage so its pre-blurred
  // background lines up with the real one (no backdrop-filter needed)
  // =================================================================================
  function layoutBlur() {
    const w = stage.clientWidth;
    if (!w) return;
    const k = 100 / w;
    document.querySelectorAll('.view.on .tile, .bar, .feed, .live-in, .modal-win').forEach((el) => {
      let x = 0, y = 0, n = el;
      const view = el.closest('.view');
      const sc = view ? parseFloat(getComputedStyle(view).getPropertyValue('--sc')) || 1 : 1;
      if (view && sc !== 1) { x = view.offsetLeft + el.offsetLeft * sc; y = view.offsetTop + el.offsetTop * sc; n = null; }
      while (n && n !== stage) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      el.style.setProperty('--x', (x * k).toFixed(3) + 'cqw');
      el.style.setProperty('--y', (y * k).toFixed(3) + 'cqw');
    });
  }
  A.layoutBlur = layoutBlur;

  // =================================================================================
  // workspaces
  // =================================================================================
  function setWorkspace(id, opts) {
    if (id === 'ambient') return enterAmbient('manual');
    if (!document.getElementById('v-' + id)) return;
    if (A.ambient) exitAmbient(true);
    if (A.ws !== id) A.prevWs = A.ws;
    if (id !== 'house') stopCamLive();
    A.ws = id;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.dataset.ws === id));
    renderBar();
    layoutBlur();
    OW.space.watchIss(id === 'space');
    if (id === 'space') setTimeout(showGlobe, 60); else OW.globe.hide();
    if (id === 'house' && !opts?.navigationOnly) setTimeout(autoCamLive, 500);
    if(id==='house'&&!opts?.navigationOnly)openHouseCards();
    OW.store.set('ws', id);
    tick(true);
    if (OW.focus.kb && !(opts && opts.keepFocus)) OW.focus.enter(true);
  }
  function openHouseCards(){const client=OW.data.client;if(OW.data.contract!==3||!client?.ready)return;const speaker=client.currentSpeaker||OW.roles.get('sleep_speaker')||OW.model.lists.speakers?.[0];if(speaker)client.openSpeakerCard(speaker).catch(()=>{});if(OW.roles.get('vacuum'))client.loadVacuumRooms().catch(()=>{});}
  A.setWorkspace = setWorkspace;
  function stepWorkspace(d) {
    const ids = areas().map((w) => w[0]);
    const i = ids.indexOf(A.ws);
    setWorkspace(ids[(i + d + ids.length) % ids.length]);
  }

  // =================================================================================
  // ambient mode (also the whole UI of the TV screensaver)
  // =================================================================================
  /** LOOK UP: a compass needle pointing at the station while it is in a naked-eye pass over home */
  function lookHtml() {
    const k = OW.space.lookUp();
    if (!k) return '';
    const up = k.el >= 0, left = Math.max(0, k.end - OW.nowMs());
    return '<div class="lookup" data-look><div class="lk-rose"><i class="lk-n">N</i><svg viewBox="-50 -50 100 100"><circle r="44" class="ring"/><path class="tick" d="M0 -44V-38M44 0H38M0 44V38M-44 0H-38"/>' +
      '<g transform="rotate(' + k.az + ')"><path class="needle" d="M0 -40L7 -8L0 -14L-7 -8Z"/></g><circle r="2.4" class="hub"/></svg></div>' +
      '<div class="lk-text"><em>look up' + (k.test ? ' · test' : '') + '</em><b>' + esc(k.name) + ' · ' + (up ? 'look ' + k.compass : 'rising in the ' + k.compass) + '</b>' +
      '<span>' + (up ? k.el + '° above the horizon · ' + (k.rising ? 'climbing to ' + k.maxEl + '°' : 'setting') : 'clears the horizon ' + fmt.hm(k.start)) + ' · ' + Math.max(1, Math.round(left / 60000)) + ' min left</span></div></div>';
  }
  A.lookHtml = lookHtml;
  // while a pass is on, the card follows the station every five seconds (ambient only; the night screen stays dark)
  setInterval(() => {
    if (!A.ambient) return;
    const cur = $('ambient').querySelector('[data-look]'), html = lookHtml();
    if (!cur && !html) return;
    if (cur && html) cur.outerHTML = html; else renderAmbient();
  }, 5000);
  // Ambient always stays bottom-left; only the bounded pixel drift moves it.
  /** this screen's ambient mode: still (a picture), animated (the picture drifts slowly), live (a muted live stream behind the cluster) */
  const ambientMode = () => { const m = A.debugAmbMode || OW.config.get('ambient.mode'); return m === 'live' ? 'stream' : ['animated', 'wallpaper', 'stream'].includes(m) ? m : 'still'; };
  /**
   * The live stream for ambient, or null. wallhub's background director chooses it so every screen
   * agrees: its own pick when it sends one (`stream`), otherwise the featured launch's webcast while
   * that is live. Only YouTube streams can be shown here.
   */
  function ambientStream() { return null; /* Static demo: linked webcasts only. */
    const d = OW.bg.hubNow, S = OW.space, st = d && d.stream;
    if (A.debugStream) return { id: A.debugStream, title: 'test stream', kind: 'test' };
    // wallhub's pick (launch webcast, pad cam, ISS, NASA live). Something that is not on YouTube cannot be shown here: no stream.
    if (st) return st.is_youtube && st.video_id && st.live !== false ? { id: st.video_id, title: st.launch && st.launch.name ? st.launch.name.split('|').pop().trim() : (st.title || ''), kind: st.kind || '', rotatesAt: st.rotates_at ? Date.parse(st.rotates_at) : 0 } : null;
    if (d && 'stream' in d) return null;                         // the hub says nothing is live
    // no hub: the featured launch's own webcast while it is live
    const live = S.launches.find((l) => l.webcastLive && l.webcast && youtubeId(l.webcast) && S.live && S.live.id === 'l' + l.id);
    return live ? { id: youtubeId(live.webcast), title: live.rocket + ' · ' + live.mission, kind: 'launch_webcast' } : null;
  }
  A.ambientStream = ambientStream;
  /** mount / swap / remove the muted stream under the ambient cluster */
  function syncAmbientLive() {
    if (!stage) return;
    const hostEl = $('ambient');
    let layer = hostEl.querySelector('.amb-live');
    const wp = OW.wallpaper?.state?.();
    const st = A.ambient && ambientMode() === 'stream' && !A.ambLiveOff && (!wp || (OW.wallpaper.allowStream(wp) && !wp.night)) ? ambientStream() : null;
    stage.classList.toggle('amb-anim', A.ambient && (!OW.reduceMotion() && ambientMode() === 'animated'));
    stage.classList.toggle('amb-video', !!st);
    if (!st) { if (layer) layer.remove(); A.ambLive = null; OW.wallpaper?.sync(); return; }
    OW.wallpaper?.stop();
    // when the hub's pick is due to rotate, ask it again (at most once a minute)
    if (st.rotatesAt && OW.nowMs() > st.rotatesAt && OW.nowMs() - (A.streamAsked || 0) > 60000) { A.streamAsked = OW.nowMs(); OW.bg.next({ force: true }); }
    if (layer && A.ambLive === st.id) return;
    if (!layer) { layer = document.createElement('div'); layer.className = 'amb-live'; hostEl.insertBefore(layer, hostEl.firstChild); }
    A.ambLive = st.id;
    // muted, no controls, never focusable: it is wallpaper. A touch or a button still wakes the wall.
    layer.innerHTML = '<iframe src="https://www.youtube.com/embed/' + st.id + '?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3" allow="autoplay; encrypted-media" tabindex="-1" referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
      '<div class="amb-livechip"><span class="live-tag"><i class="pulse"></i>LIVE</span><b>' + esc(st.title) + '</b></div>';
    // the wall panel only keeps video if it can hold about 30 frames a second
    if (OW.mode === 'panel') {
      const t0 = performance.now(); let last = t0, n = 0, total = 0;
      const step = (t) => { if (A.ambLive !== st.id) return; const dt = t - last; last = t; if (t - t0 > 2500) { n++; total += dt; } if (t - t0 < 8000) return requestAnimationFrame(step);
        const avg = n ? total / n : 0; OW.host.log('ambient live video: ' + avg.toFixed(1) + ' ms per frame'); if (avg > 34) { A.ambLiveOff = true; syncAmbientLive(); toast('Live video is too heavy for this screen — using Live wallpaper'); } };
      requestAnimationFrame(step);
    }
  }
  A.syncAmbientBackground = syncAmbientLive;
  /** things worth one quiet line, most relevant first */
  function ambientMoments() {
    const s = OW.data.state, S = OW.space, u = OW.usage.data, now = OW.nowMs(), out = [];
    OW.views.alerts().filter((a) => a.tone === 'red').slice(0, 2).forEach((a) => out.push([a.icon, a.title + (a.sub ? ' · ' + a.sub : '')]));
    if (S.pass && S.pass.start > now && S.pass.start - now < 90 * 60000) out.push(['satellite', 'ISS overhead at ' + fmt.hm(S.pass.start) + ' · max ' + S.pass.maxEl + '°' + (S.pass.visible ? ' · visible' : '')]);
    const np = s.nowPlaying;
    if (np && np.state === 'playing') out.push(['music', [np.app || np.source || np.kind || 'Now playing', np.room || np.device].filter(Boolean).join(' · ')]);
    if (u && !u.mock) {
      const done = u.threads.find((t) => t.status === 'finished' && t.endedAt && now - t.endedAt < 30 * 60000);
      if (done) out.push(['bot', 'Agent finished · ' + done.title]);
      u.providers.forEach((p) => { const w = [p.fiveHour, p.weekly].filter(Boolean).sort((a, b) => b.pct - a.pct)[0]; if (w && w.pct >= 80) out.push(['gauge', p.label + ' plan at ' + Math.round(w.pct) + '%' + (w.resetsAt ? ' · resets ' + fmt.when(w.resetsAt) : '')]); });
    }
    const lat = OW.config.get('home.lat');
    if (typeof lat === 'number' && OW.sunTimes) { const sun = OW.sunTimes(OW.now(), lat); if (sun.sunset > now) out.push(['sunrise', 'Sunset ' + fmt.hm(sun.sunset)]); else { const t = OW.sunTimes(new Date(now + 86400000), lat); out.push(['sunrise', 'Sunrise ' + fmt.hm(t.sunrise)]); } }
    if (A.aiBrief() && A.ai.news.length) { const n = A.ai.news[Math.floor(now / (10 * 60000)) % Math.min(5, A.ai.news.length)]; out.push(['bot', 'AI · ' + n.title + (n.site ? ' — ' + n.site : '')]); }
    const b = OW.bg.current;
    if (b && b.title) out.push(['spark', b.title + (b.credit ? ' — ' + b.credit : '')]);
    return out;
  }
  // Ambient owns one persistent cluster. Only entering the view animates its parent.
  const ambientText = (el, value) => { value = String(value ?? ''); if (el.textContent !== value) el.textContent = value; };
  const ambientAttr = (el, name, value) => { if (!el) return; if (value == null) { if (el.hasAttribute(name)) el.removeAttribute(name); } else if (el.getAttribute(name) !== String(value)) el.setAttribute(name, value); };
  let momentTimer;
  function renderAmbient() {
    const s = OW.data.state, S = OW.space, now = OW.nowMs(), w = s.weather;
    const ev = OW.agendaDay(OW.data.agenda()).next;
    const f = OW.views.heroLaunch() || (S.focus && OW.ambientDirectorWindow(S.focus, now) ? S.focus : null);
    const countdown = f && OW.ambientDirectorWindow(f, now) ? f : null;
    const M = OW.views.sleepModel(), hour = OW.now().getHours(), T = M.target;
    let shell = $('ambient').querySelector('.ac-shell');
    if (!shell) {
      shell = document.createElement('div'); shell.className = 'ac-shell';
      const line = (name, ic) => '<div class="ac-line" data-slot="'+name+'">'+icon(ic)+'<span><span class="slot-text"></span></span></div>';
      shell.innerHTML = '<div class="ac ac-bl"><button class="ac-launch" disabled data-ambient-launch=""><b></b><span class="mono" data-cd="" data-cd-style="tminus"></span></button>' +
        '<div class="ac-clock mono" data-clock="hm"></div><div class="ac-line ac-date"><span><span data-clock="date"></span><span class="ac-weather"></span></span></div>' +
        line('weather','cloud')+line('rain','cloud')+line('event','calendar')+line('wake','moon')+
        '<div class="ac-moment" id="acMoment"><span class="moment-icon"></span><span class="moment-text"></span></div><div class="ac-credit"></div></div><div class="ac-look"></div>';
      shell.querySelector('[data-slot="weather"] > span').insertAdjacentHTML('beforeend', ' <small class="wx-source"></small>');
      shell.querySelector('[data-slot="rain"] > span').insertAdjacentHTML('beforeend', '<button type="button" class="apple-weather-credit" data-focus data-fid="ambient-apple-credit" data-act="weather.attribution" aria-label="Apple Weather attribution" hidden><span></span><img  alt="Apple Weather"></button>');
      $('ambient').appendChild(shell);
    }
    const launch = shell.querySelector('.ac-launch'), cd = launch.querySelector('[data-cd]');
    ambientAttr(launch, 'data-ambient-launch', countdown?.id || '');
    ambientAttr(launch, 'disabled', countdown ? null : '');
    ambientText(launch.querySelector('b'), countdown ? countdown.mission || countdown.rocket : '');
    ambientAttr(cd, 'data-cd', countdown ? countdown.net : '');
    if (!countdown) ambientText(cd, '');
    ambientText(shell.querySelector('.ac-weather'), w ? ' · '+w.temp+w.unit+' · H '+w.high+'° L '+w.low+'°' : '');
    function slot(name, value) { const row=shell.querySelector('[data-slot="'+name+'"]'); ambientText(row.querySelector('.slot-text'),value); ambientAttr(row.querySelector('.ic'),'hidden',value ? null : ''); }
    slot('weather', w?.summary ? OW.time.inline(w.summary) : '');
    ambientText(shell.querySelector('.wx-source'), w?.summary ? OW.weatherSource.credit(w) : '');
    slot('rain', w ? OW.rainNowcast.visible(w) || '' : '');
    const credit=shell.querySelector('.apple-weather-credit'), template=document.createElement('template');
    template.innerHTML=w ? OW.rainNowcast.credit(w,'ambient-apple-credit') : '';
    const source=template.content.firstElementChild;
    ambientAttr(credit,'hidden',source ? null : '');
    ambientAttr(credit,'data-arg',source?.getAttribute('data-arg'));
    ambientText(credit.querySelector('span'),source?.querySelector('span')?.textContent || '');
    slot('event',ev ? OW.views.eventName(ev)+' · '+fmt.when(ev.start) : '');
    slot('wake',(hour>=20 || hour<4) && T ? M.master && T.on ? 'Wake '+T.label.toLowerCase()+' '+OW.time.text(T.time) : 'No alarm '+T.label.toLowerCase() : '');
    ambientText(shell.querySelector('.ac-credit'),OW.bg.current ? [OW.bg.current.title,OW.bg.current.credit].filter(Boolean).join(' — ') : '');
    const look=shell.querySelector('.ac-look'), html=lookHtml(); if(look.dataset.content!==html){look.dataset.content=html;look.innerHTML=html;}
    A.ambCorner='bl'; syncAmbientLive(); paintMoment(true); tick(true);
  }
  function paintMoment(first) {
    const el=$('acMoment'); if(!el)return;
    const list=ambientMoments();
    A.momentIdx=first ? (A.momentIdx || 0) : (A.momentIdx || 0)+1;
    const m=list.length ? list[A.momentIdx % list.length] : ['', ''];
    const key=m.join('\n'); if(el.dataset.moment===key)return;
    el.dataset.moment=key; clearTimeout(momentTimer);
    el.classList.remove('show');
    const update=()=>{if(!el.isConnected)return;const ic=el.querySelector('.moment-icon');if(ic.dataset.icon!==m[0]){ic.dataset.icon=m[0];ic.innerHTML=m[0]?icon(m[0]):'';}ambientText(el.querySelector('.moment-text'),m[1]);el.classList.add('show');};
    momentTimer=setTimeout(update,first || OW.reduceMotion() ? 0 : 700);
  }
  setInterval(() => { if(A.ambient)paintMoment(false); },30000);

  function toggleAmbient() { if (alarmActive() || A.night) return; if (A.ambient) exitAmbient(); else enterAmbient('manual'); }
  function enterAmbient(why) {
    if (A.ambient) return;
    if (A.settings) closeSettings();
    stopCamLive();
    A.ambient = true;
    A.ambientWhy = why;
    stage.classList.add('amb-on');
    $('ambient').hidden = false;
    renderAmbient();
    renderBar();
    OW.bg.reschedule();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function exitAmbient(silent) {
    if (!A.ambient || OW.isDream) return;
    A.ambient = false;
    OW.wallpaper?.stop();
    stage.classList.remove('amb-on', 'amb-anim', 'amb-video');
    { const lv = $('ambient').querySelector('.amb-live'); if (lv) lv.remove(); A.ambLive = null; }
    $('ambient').hidden = true;
    OW.bg.reschedule();
    resetIdle();
    if (!silent) { renderBar(); layoutBlur(); tick(true); if (OW.focus.kb) OW.focus.enter(true); }
  }
  A.enterAmbient = enterAmbient;

  let idleTimer = null;
  function resetIdle() {
    if (A.camLive && !A.camLive.battery) A.camLive.until = OW.nowMs() + A.camLive.span();   // interaction keeps a wired camera live
    clearTimeout(idleTimer);
    if (OW.isDream) return;
    const min = +OW.config.get('ambient.idleMin');
    if (!min) return;
    idleTimer = setTimeout(() => { if (A.night || A.seq || A.brief || A.snoozedUntil) return; if (!A.settings && !A.liftoff && !A.watch && !A.sheet) enterAmbient('idle'); else resetIdle(); }, min * 60000);
  }

  // =================================================================================
  // morning launch sequence
  // =================================================================================
  function runLiftoff(opts) {
    if (A.liftoff || OW.isDream) return;
    // the device alarm and the house both fire in the morning: the second one within a few minutes is the same launch
    if (opts && opts.auto && OW.nowMs() - (A.lastLiftoff || 0) < 15 * 60000) return;
    A.lastLiftoff = OW.nowMs();
    endSequence(true);
    const briefing = false;
    if (A.ambient) exitAmbient(true);
    if (A.blackout) setBlackout(false);
    if (A.settings) closeSettings();
    A.liftoff = true;
    setWorkspace('home', { keepFocus: true });
    const a = OW.data.agenda(), ev = a.next, s = OW.data.state;
    const S = OW.space, soon = S.launches.filter((l) => l.net > OW.nowMs() && l.net < OW.nowMs() + 86400000).length;
    const polls = [];
    if (s.weather) polls.push(['weather', s.weather.temp + '° ' + s.weather.text.toLowerCase()]);
    if (s.calendar && s.calendar.available || OW.data.isDemo('events')) polls.push(['calendar', a.today.filter((e) => e.state !== 'past').length + ' events']);
    if (S.launches.length) polls.push(['launches', soon + ' in 24 h']);
    if (S.crew.count) polls.push(['crew', S.crew.count + ' in orbit']);
    if (s.panel && s.panel.tempC != null) polls.push(['panel', s.panel.tempC + '°C']);
    if (OW.data.has('lights')) polls.push(['lights', s.lights.filter((l) => l.on).length + ' on']);
    polls.push(['systems', 'go']);
    const el = $('liftoff');
    el.innerHTML = '<div class="lo-glow"></div><div class="lo-in">' +
      '<div class="lo-eyebrow">' + icon('rocket') + '<span>morning launch sequence</span></div>' +
      '<div class="lo-clock" data-clock="hm"></div><div class="lo-date" data-clock="date"></div>' +
      (ev ? '<div class="lo-next"><span class="k">T-minus</span> <span data-cd="' + ev.start + '" data-cd-style="span"></span> · ' + esc(ev.title) + '</div>' : '') +
      '<div class="lo-polls">' + polls.map((p, i) => '<div class="lo-poll" style="--i:' + i + '"><em>' + p[0] + '</em><b>' + esc(p[1]) + '</b><i>' + icon('check') + '</i></div>').join('') + '</div>' +
      '<div class="lo-count"><span>3</span><span>2</span><span>1</span><span>liftoff</span></div></div>' + (briefing ? briefingHtml() : '');
    el.hidden = false;
    stage.classList.toggle('lo-brief', briefing);
    stage.classList.add('lo-on');
    tick(true);
    requestAnimationFrame(() => stage.classList.add('lo-run'));
    A.liftoffTimers = [
      setTimeout(() => stage.classList.add('lo-rise'), 6400),
      // with a briefing the sequence settles into it and stays until someone is up (tap / any key), 20 min at most
      briefing ? setTimeout(() => stage.classList.add('lo-briefing'), 8200) : setTimeout(endLiftoff, 8600),
      briefing ? setTimeout(endLiftoff, 20 * 60000) : null,
    ];
  }
  function endLiftoff() {
    if (!A.liftoff) return;
    (A.liftoffTimers || []).forEach(clearTimeout);
    A.liftoff = false;
    stage.classList.add('lo-out');
    clearTimeout(A.liftoffOutTimer);
    A.liftoffOutTimer = setTimeout(() => {
      $('liftoff').hidden = true;
      stage.classList.remove('lo-on', 'lo-run', 'lo-rise', 'lo-out', 'lo-brief', 'lo-briefing');
      layoutBlur();
    }, 900);

    resetIdle();
  }
  A.bootAt = OW.nowMs();
  A.runLiftoff = runLiftoff;

  // =================================================================================
  // launch alarm: ten minutes from true black to liftoff, in step with the lights the house is ramping
  //   stars → first light → sunrise on the pad, venting → ignition glow in the last minute → liftoff at T-0
  // Brightness rises the whole way (a black veil thins out; on the panel the backlight follows too).
  // Nothing in here flashes: every change is a slow opacity / transform transition.
  // =================================================================================
  const nat = (fn, a, b) => { try { if(OW.data.contract===3&&OW.isTV&&(fn==='toFront'||fn==='nightDim'&&a===false&&(A.alarm?.test||W.isQuiet(A.alarm||{}))))return null; if(OW.demo?.active&&fn==='nightAudio')return OW.demo.audio?.(a,b); if((OW.standalone?.active()||OW.data.contract===3)&&fn==='nightAudio'){if(!window.flightdayNative)return OW.standalone.audioCommand(a,b);if(OW.standalone?.active()&&a==='play'&&/morning\.m4a/.test(b||''))b=JSON.stringify({...JSON.parse(b),alarm:true});} const n = (OW.demo?.active ? null : window.flightdayNative); return n && n[fn] ? (b !== undefined ? n[fn](a, b) : a !== undefined ? n[fn](a) : n[fn]()) : null; } catch (e) { return null; } };
  /** does this screen play the sleep sound and the alarm audio? The bedroom TV does (setting sleep.audio: auto | on | off). */
  function nightAudioHere() {
    if(OW.data.contract===3)return Array.isArray(A.nightAudioScreens)&&A.nightAudioScreens.includes(deviceId());
    const route=OW.roles.get('sleep_sound_on');
    if(route==='screens'){const sc=OW.model.screen(),bed=OW.roles.get('bedroom'),beds=OW.model.config.screens.filter(s=>s.alarm&&bed&&s.area===bed);return beds.length?beds.some(s=>s.id===sc?.id):!!A.localGoodnight;}
    return route==='screen:'+OW.model.screen()?.id;
  }
  A.nightAudioHere = nightAudioHere;
  const ASSET_AUDIO = 'asset:///web/audio/';
  const NIGHT_GAIN = 1;
  /** speaker volume for the alarm: from tonight's level up to the cap (setting, or night + 10 and never above 25) */
  function alarmVolume(p) {
    const M = OW.views.sleepModel(), night = A.seq && A.seq.nightVol != null ? A.seq.nightVol : (M.volume != null ? M.volume : 12);
    // never above the house's cap (input_number.alarm_max_volume) nor this screen's own setting; without either: night + 10, at most 25
    const limits = [M.alarmMax ?? (+OW.config.get('sleep.alarmMax') || 0)].filter((x) => x > 0);
    const cap = M.alarmMax != null ? M.alarmMax : limits.length ? Math.min.apply(null,limits) : Math.min(night+10,25);
    return OW.wake.volume(night, cap, p);
  }


  function starField() {
    // deterministic scatter (no Math.random: the sky is the same every morning)
    let seed = 20261113; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const out = [];
    for (let i = 0; i < 150; i++) { const x = (rnd() * 100).toFixed(2), y = (rnd() * 62).toFixed(2), a = (0.35 + rnd() * 0.65).toFixed(2); out.push(x + 'cqw ' + y * 0.5625 + 'cqw 0 ' + (rnd() > 0.86 ? '.05cqw' : '0') + ' rgb(255 255 255 / ' + a + ')'); }
    return out.join(',');
  }
  function dawnScene() {
    // the pad: service tower + a tall two-stage vehicle, drawn as one silhouette; the rim light is the same shape, lit from the sunrise side
    const rocket = 'M0 300 L0 96 C0 60 6 30 13 8 C16 2 18 0 20 0 C22 0 24 2 27 8 C34 30 40 60 40 96 L40 300 L47 318 L47 330 L-7 330 L-7 318 Z';
    const tower = 'M-78 330 L-78 22 L-66 22 L-66 60 L-44 60 L-44 70 L-66 70 L-66 128 L-30 128 L-30 138 L-66 138 L-66 330 Z M-66 196 L-22 196 L-22 204 L-66 204 Z';
    return '<div class="dawn" id="dawn">' +
      '<div class="dw-stars" style="box-shadow:' + starField() + '"></div>' +
      '<div class="dw-sky dw-first"></div><div class="dw-sky dw-sunrise"></div><div class="dw-sun"></div>' +
      '<div class="dw-ground"></div>' +
      '<div class="dw-pad"><div class="dw-ignite"></div><div class="dw-plume"></div>' +
        '<svg class="dw-tower" viewBox="-90 0 150 332" preserveAspectRatio="xMidYMax meet"><path d="' + tower + '" fill="#04050a"/><path class="dw-rim" d="' + tower + '" fill="url(#dwRim)"/><g class="dw-rim dw-detail" fill="none" stroke="#ffb37a" stroke-width="1.2"><path d="M-66 23V329 M-66 61H-44 M-66 129H-30 M-66 197H-22 M-77 78L-67 104 M-77 144L-67 170 M-77 212L-67 238"/></g></svg>' +
        '<svg class="dw-rocket" viewBox="-90 0 150 332" preserveAspectRatio="xMidYMax meet"><defs><linearGradient id="dwRim" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ffb37a" stop-opacity=".95"/><stop offset=".45" stop-color="#ff8e5a" stop-opacity=".25"/><stop offset="1" stop-color="#ff8e5a" stop-opacity="0"/></linearGradient></defs>' +
          '<path d="' + rocket + '" fill="#05060b"/><path class="dw-rim" d="' + rocket + '" fill="url(#dwRim)"/><g class="dw-rim dw-detail" fill="none" stroke="#ffb37a" stroke-width="1.2"><path d="M3 174H39 M3 179H39 M39 96V299 M1 112H-8V124H1 M39 112H48V124H39 M-7 118H0 M40 118H47 M3 276H38"/></g></svg>' +
        '<i class="dw-vent v1"></i><i class="dw-vent v2"></i><i class="dw-vent v3"></i></div>' +
      '<div class="dw-veil"></div><div class="dw-muted" id="dwMuted"'+(OW.views.sleepModel().muted?'':' hidden')+'>muted · the lights will still rise</div>' +
      '<div class="dw-hud"><div class="dw-phase" id="dwPhase"></div><div class="dw-count mono" data-cd="0" data-cd-style="alarm" id="dwCount"></div><div class="dw-sub" id="dwSub"></div></div>' +
      '</div>';
  }
  /** paint the scene for progress p (0 = T-10, 1 = T-0) */
  function paintDawn(p) {
    const el = $('dawn'); if (!el) return;
    const k = (a, b) => OW.clamp((p - a) / (b - a), 0, 1);       // 0..1 across a slice of the count
    const st = el.style;
    st.setProperty('--stars', (k(0, 0.12) * (1 - k(0.45, 0.82))).toFixed(3));
    st.setProperty('--first', k(0.22, 0.6).toFixed(3));
    st.setProperty('--sunrise', k(0.5, 0.92).toFixed(3));
    st.setProperty('--sun', k(0.55, 1).toFixed(3));
    st.setProperty('--rim', k(0.4, 0.9).toFixed(3));
    st.setProperty('--ign', k(0.9, 1).toFixed(3));
    st.setProperty('--veil', (1 - (0.05 + 0.95 * Math.pow(p, 1.5))).toFixed(3));
    st.setProperty('--hud', (0.16 + 0.84 * Math.pow(p, 1.2)).toFixed(3));
    el.classList.toggle('venting', p >= 0.6 && p < 1);
    const phase = p < 0.22 ? 'stars' : p < 0.5 ? 'first light' : p < 0.8 ? 'sunrise on the pad' : p < 0.9 ? 'engine chill' : p < 1 ? 'ignition sequence' : 'liftoff';
    const ph = $('dwPhase'); if (ph && ph.textContent !== phase) ph.textContent = phase;
  }

  function runSequence(t0, opts) {
    opts = opts || {};
    if (OW.isDream || A.brief) return;
    const L = OW.views.sleepModel(), now = W.now();
    if (A.seq && Math.abs(A.seq.t0 - t0) < 10) {
      if(OW.data.contract===3){const allowed=Array.isArray(A.alarm?.audio_screens)&&A.alarm.audio_screens.includes(deviceId())&&!opts.test&&opts.bedroom!=='silent';if(A.seq.audio&&!allowed)nat('nightAudio','stop',JSON.stringify({fadeMs:1000}));else if(!A.seq.audio&&allowed)nat('nightAudio','play',JSON.stringify({url:ASSET_AUDIO+'morning.m4a',gain:1,level:1,fadeMs:1000}));A.seq.audio=allowed;}
      renderAlarmBar(); return;
    } // HA and the local backstop describe the same count
    const continuing = !!A.seq, wasAudio = A.seq?.audio, wasShot=A.seq?.shot;
    if (A.seq) endSequence(true);
    clearTimeout(A.briefOutTimer); clearTimeout(A.speakerBackTimer); clearTimeout(A.liftoffOutTimer);
    clearTimeout(A.snoozeTimer); A.snoozedUntil = 0;
    stage.classList.remove('snooze-on'); nat('nightDim', false);
    // T-0 comes with the event (launch_at); without it, the next liftoff in the plan, else ten minutes from now
    if (!(t0 > now - 30000 && t0 - now < 30 * 60000)) t0 = OW.standalone?.active()&&A.alarm?.state==='ringing'?now:(L.target && L.target.at - now < 11 * 60000 ? L.target.at : 0) || now + 10 * 60000;
    const dur = (opts.dur || 600) * 1000;
    if (A.settings) closeSettings();
    if (A.sheet) closeSheet();
    if (A.watch) closeWatch();
    if (A.shutdown) endShutdown(true);
    if (A.ambient) exitAmbient(true);
    if (A.liftoff) endLiftoff();
    const fromNight = !!A.night;
    if (A.night) exitNight('alarm');
    else if (A.blackout) setBlackout(false);
    clearInterval(A.seqTimer);
    if (!A.alarm || opts.preview) A.alarm = {state:'countdown',alarm_id:'local-'+t0,launch_at:new Date(t0).toISOString(),deadline:new Date(t0+1800000).toISOString(),screens:[deviceId()],crew:'both',test:!!opts.preview,offline:!OW.data.status.connected};
    A.seq = { t0, dur, sceneFrom:opts.sceneFrom||0, kind:opts.kind||'first', preview: !!opts.preview, shot:!!wasShot, audio: (OW.data.contract===3 ? Array.isArray(A.alarm?.audio_screens)&&A.alarm.audio_screens.includes(deviceId()) : OW.model.isBedroom()&&nightAudioHere()) && !opts.test && opts.bedroom!=='silent', nightVol: continuing ? A.alarmStartVolume : (L.audioAdapterVol ?? L.volume ?? null), vol: null, liveSeen:L.audioAdapterVol };
    if(OW.data.contract===3&&!A.seq.audio){nat('nightAudio','stop',JSON.stringify({fadeMs:1000}));A.nightSound=null;}
    A.alarmStartVolume=A.seq.nightVol;
    const el = $('liftoff');
    el.className = 'liftoff dawn-host';
    el.innerHTML = dawnScene();
    el.hidden = false;
    stage.classList.add('dawn-on');
    if (OW.isTV) nat('keepOn', true);
    $('dwCount').dataset.cd = t0;
    $('dwSub').textContent = alarmLine();
    paintDawn(OW.clamp(1 - (t0 - now) / dur, 0, 1));
    tick(true);
    renderAlarmBar();
    if (OW.mode==='panel') showAlarmControls();
    if (A.seq.audio && !(continuing && wasAudio)) {
      // the storm gives way to a quiet morning bed; the level rises from the night level to full by T-0
      nat('nightAudio', 'play', JSON.stringify({ url: ASSET_AUDIO + 'morning.m4a', gain: NIGHT_GAIN, fadeMs: Math.min(40000, dur / 3), level: 1 }));
    }
    const step = () => {
      if (!A.seq) return;
      const left = A.seq.t0 - W.now(), elapsed = OW.clamp(1 - left / A.seq.dur, 0, 1), p = A.seq.sceneFrom + (1-A.seq.sceneFrom)*elapsed;
      paintDawn(p);
      if (OW.mode === 'panel') { const b = Math.max(1, Math.round(1 + 99 * Math.pow(p, 1.5))); if (b !== A.seq.bright) { A.seq.bright = b; OW.host.setBrightness(b); } }
      const liveVolume=OW.views.sleepModel().audioAdapterVol ?? OW.views.sleepModel().volume;
      if(A.seq.nightVol==null && liveVolume!=null){A.seq.nightVol=liveVolume;A.seq.volumeAt=elapsed;}
      if (OW.data.contract!==3 && A.seq.audio && A.seq.nightVol!=null && liveVolume!=null && !OW.views.sleepModel().muted) { const v = alarmVolume(OW.clamp((elapsed-(A.seq.volumeAt||0))/(1-(A.seq.volumeAt||0)),0,1)); if (v !== A.seq.vol) { A.seq.vol = v; OW.data.call('sleep.speaker', { volume: v }); } }
      if (A.seq.audio && !A.seq.shot && A.seq.kind !== 'relaunch' && left <= 8500 && left > -1000) { A.seq.shot=true; nat('nightAudio','shot',JSON.stringify({url:ASSET_AUDIO+'liftoff.m4a',fadeMs:0,level:OW.data.contract===3?1:.5*Math.pow(10,(+OW.config.get('sleep.liftoffDb')||0)/20)})); }
      if (OW.data.contract!==3 && A.seq.audio && !A.seq.duck && A.seq.kind !== 'relaunch' && left <= 2000) { A.seq.duck=true;nat('nightAudio','bedLevel',JSON.stringify({level:.5}));clearTimeout(A.bedRestoreTimer);A.bedRestoreTimer=setTimeout(()=>nat('nightAudio','bedLevel',JSON.stringify({level:1})),Math.max(0,left+20000)); }
      if (left <= 0 && !A.seq.go) liftoffNow();
    };
    step();
    A.seqTimer = setInterval(step, 50);
  }
  /** T-0: the vehicle leaves the pad; the briefing follows (on the house's `wake`, or by itself a few seconds later) */
  function liftoffNow() {
    if (!A.seq || A.seq.go) return;
    A.seq.go = true;
    if ((A.seq.audio || OW.demo?.canPreviewAudio?.()) && W.now() - A.seq.t0 < 1000) nat('nightAudio', 'shot', JSON.stringify({url:ASSET_AUDIO+'flightday-sting.m4a',fadeMs:0,level:1}));
    const el = $('dawn'); if (el) el.classList.add('go');
    // a low rumble that swells under the morning bed, never a blast
    OW.host.log('alarm liftoff go '+new Date(W.now()).toISOString()+' target '+new Date(A.seq.t0).toISOString());
    if(A.alarm) A.alarm.state='ringing'; renderAlarmBar(true);
    A.seq.after = setTimeout(() => wakeUp(), 9000);
  }
  function endSequence(keep) {
    if (!A.seq) return;
    clearInterval(A.seqTimer); clearTimeout(A.seq.after);
    $('alarmControls').hidden = true;
    const audio = A.seq.audio, preview = A.seq.preview;
    A.seq = null;
    if (keep === true) return;                      // the briefing takes the scene over
    stage.classList.remove('dawn-on');
    $('liftoff').hidden = true; $('liftoff').className = 'liftoff'; $('liftoff').innerHTML = '';
    if (OW.mode === 'panel') restoreBrightness();
    if (audio) { nat('nightAudio', 'stop', JSON.stringify({ fadeMs: preview ? 1500 : 4000 })); }
    if (OW.isTV) nat('keepOn', false);
    layoutBlur(); resetIdle();
  }
  A.runSequence = runSequence;
  function speakerBack() {} // Day volume is restored by HA without touching mute.

  // Sleep: last night per person, from each person's own iPhone / Watch through the Apple app (opt-in), via
  // wallhub with the prefs token. Health data: shown on screen, never logged. No people = nothing is drawn.
  A.sleepPeople = [];
  const hm = (min) => { min = Math.max(0, Math.round(min || 0)); return Math.floor(min / 60) + 'h ' + fmt.pad(min % 60) + 'm'; };
  A.hm = hm;
  async function loadSleep(force) {
    if (!OW.hub || !OW.hub.enabled() || (!force && OW.nowMs() - (A.sleepAt || 0) < 20 * 60000)) return;
    A.sleepAt = OW.nowMs();
    const r = await OW.hub.getPrivate('/v1/sleep', 6000);
    if (r.status === 0) return;                                   // hub away or no token: keep what we had
    if (A.sleepStatus !== r.status) { A.sleepStatus = r.status; OW.host.log('sleep feed: http ' + r.status + ', ' + (r.ok && Array.isArray(r.data.people) ? r.data.people.length : 0) + ' people'); }   // a count, never the data
    const now = OW.nowMs();
    A.sleepPeople = r.ok && Array.isArray(r.data.people) ? r.data.people.filter((p) => p && p.name && p.lastNight && p.lastNight.asleepMinutes > 0).map((p) => {
      const n = p.lastNight, wake = Date.parse(n.wake) || 0;
      return { id: p.id, name: String(p.name), asleep: n.asleepMinutes, inBed: n.inBedMinutes || 0, awake: n.awakeMinutes || 0, deep: n.deepMinutes || 0, rem: n.remMinutes || 0, core: n.coreMinutes || 0,
        bed: Date.parse(n.bed) || 0, wake, avg: p.averageAsleepMinutes || 0, nights: p.nights || 0, updatedAt: Date.parse(p.updatedAt) || 0 };
    }).filter((p) => !p.wake || now - p.wake < 36 * 3600000) : [];   // "last night" older than a day and a half is not last night
    OW.views.update('sleepdata');
    if (A.brief) renderBriefing();
    if (A.night && A.night.overlay) renderNightOverlay();
  }
  A.loadSleep = loadSleep;
  setInterval(() => loadSleep(false), 10 * 60000);
  /** Person sleep summary. */
  const sleepLine = (p) => esc(p.name) + ' ' + hm(p.asleep) + (p.deep ? ' · ' + hm(p.deep) + ' deep' : '');

  // AI: a daily brief written on flightday (5–7 sourced bullets) and the latest AI headlines, both from wallhub.
  // Shown only while the brief exists and is fresh (the hub marks it stale after 26 h; never older than 36 h here).
  A.ai = { brief: null, news: [], at: 0 };
  A.aiBrief = () => { const b = A.ai.brief; return b && !b.stale && b.at && OW.nowMs() - b.at < 36 * 3600000 && b.bullets.length ? b : null; };
  async function loadAi(force) {
    if (!OW.hub || !OW.hub.enabled() || (!force && OW.nowMs() - A.ai.at < 15 * 60000)) return;
    A.ai.at = OW.nowMs();
    try {
      const r = await OW.hub.get('/v1/ai/brief', 6000);
      A.ai.brief = r.ok && r.data && Array.isArray(r.data.bullets) ? { at: Date.parse(r.data.generated_at) || 0, model: r.data.model || '', stale: !!r.data.stale,
        bullets: r.data.bullets.filter((x) => x && x.text).slice(0, 7).map((x) => ({ text: String(x.text).trim(), source: x.source_title || '' })) } : null;
    } catch (e) { /* hub away: keep what we had, it ages out by itself */ }
    try {
      const r = await OW.hub.get('/v1/ai/news', 6000), env = r.ok ? OW.hub.unwrap(r.data) : null;
      const list = env && (env.data.items || env.data.results);
      if (list) A.ai.news = list.filter((x) => x && x.title).map((x) => ({ title: String(x.title).trim(), site: x.source || '', at: Date.parse(x.published_at || 0) || 0 })).sort((x, y) => y.at - x.at).slice(0, 8);
    } catch (e) { /* same */ }
    OW.views.update('ai');
    if (A.brief) renderBriefing();
  }
  A.loadAi = loadAi;
  setInterval(() => loadAi(false), 10 * 60000);

  // The briefing: a full-screen card with what the day holds — after the alarm, or any time from Home.
  // Everything on it comes from the same real sources as the dashboard; a part with no data is left out.
  A.briefData = { headlines: null, apod: null, at: 0 };
  /** general headlines and the picture of the day are fetched by wallhub; ask it when the briefing opens */
  async function loadBriefExtras() {
    if (!OW.hub || !OW.hub.enabled() || OW.nowMs() - A.briefData.at < 20 * 60000) return;
    A.briefData.at = OW.nowMs();
    try {
      const r = await OW.hub.get('/v1/headlines', 6000), env = r.ok ? OW.hub.unwrap(r.data) : null;
      const list = env && (env.data.results || env.data.items || (Array.isArray(env.data) ? env.data : null));
      // newest first; the second pick comes from a different newsroom than the first
      const all = list ? list.filter((h) => h && h.title).map((h) => ({ title: String(h.title).trim(), site: h.source || h.news_site || h.site || '', at: Date.parse(h.published_at || h.published || 0) || 0 })).sort((x, y) => y.at - x.at) : [];
      const picks = all.slice(0, 1); const other = all.find((h) => picks[0] && h.site !== picks[0].site); if (other) picks.push(other); else if (all[1]) picks.push(all[1]);
      A.briefData.headlines = picks.length ? picks : null;
    } catch (e) { A.briefData.headlines = null; }
    try {
      const r = await OW.hub.get('/v1/apod', 6000), env = r.ok ? OW.hub.unwrap(r.data) : null;
      const a = env && (Array.isArray(env.data) ? env.data[env.data.length - 1] : env.data);
      // wallhub falls back to a NASA Image Library pick when APOD itself is down (source / fallback say so); a video day has no still to show
      const still = a && (a.media_type === 'image' ? a.url : a.thumbnail_url);
      const credit = a && a.copyright ? String(a.copyright).replace(/\s+/g, ' ').replace(/^NASA Image Library \/ /, '').trim() : 'NASA';
      A.briefData.apod = a && still && !/logo/i.test(still) ? { title: a.title || '', url: still, credit: credit.length > 64 ? credit.slice(0, 62).replace(/[\s,;]+\S*$/, '') + '…' : credit, date: a.date || '',
        label: a.fallback || (a.source && a.source !== 'apod') ? 'from the NASA image library' : 'picture of the day' } : null;
    } catch (e) { A.briefData.apod = null; }
    if (A.brief) renderBriefing();
  }
  function briefingHtml() {
    const s = OW.data.state, a = OW.data.agenda(), S = OW.space, now = OW.nowMs(), u = OW.usage.data, w = s.weather, B = A.briefData;
    const houseLine=OW.houseCheck?.briefing()||'';
    const hour = OW.now().getHours(), hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const WXI = { clear: 'sun', cloudy: 'cloud', rain: 'rain', storm: 'storm', snow: 'snow' };
    // --- weather hero
    const wx = w ? '<section class="b2-card scroll b2-wx" data-focus data-scroll-focus data-fid="brief-wx" aria-label="Weather">' +
        '<div class="b2-wxnow">' + icon(OW.views.wxIcon(w)) + '<b>' + w.temp + '°</b><div><strong>' + esc(OW.time.inline(w.summary || w.text)) + '</strong><span>' + esc(w.text) + (w.feels != null ? ' · ' + esc(OW.weatherSource.feel(w)) : '') + (OW.weatherSource.range(w) ? ' · '+esc(OW.weatherSource.range(w)) : '') + '</span><span class="wx-source">'+esc(OW.weatherSource.credit(w))+'</span></div>' +
          (w.sunrise ? '<div class="b2-sun"><span>' + icon('sunrise') + fmt.hm(w.sunrise) + '</span><span>' + icon('moon') + fmt.hm(w.sunset) + '</span></div>' : '') + '</div>' +
        (w.alert ? '<div class="b2-alert sev-' + esc(String(w.alert.severity).toLowerCase()) + '">' + icon('bolt') + '<b>' + esc(w.alert.event) + '</b><span>' + esc(w.alert.headline) + '</span></div>' : '') +
        (w.hours && w.hours.length ? OW.views.weatherHours(w, 12) : '') + (OW.smartComfort?.briefing()?'<p class="brief-comfort">'+esc(OW.smartComfort.briefing())+'</p>':'') + houseLine + OW.weatherLink.button("brief-weatherProvider") + '</section>' : (OW.smartComfort?.briefing()||houseLine?'<section class="b2-card scroll b2-wx" data-focus data-scroll-focus data-fid="brief-wx" aria-label="Weather"><p class="brief-comfort">'+esc(OW.smartComfort?.briefing()||'')+'</p>'+houseLine+'</section>':'');
    // --- today: where to be, and what is due
    const endTomorrow = new Date(OW.now().getFullYear(), OW.now().getMonth(), OW.now().getDate() + 2).getTime();
    const day = OW.agendaDay(a), todays = day.events.filter((e) => e.end > now&&!OW.model.privateSource(e.calendar,A.briefAlarm?A.alarm?.crew:null)), due = OW.views.dueList(3).filter((d) => d.at < endTomorrow&&!OW.model.privateSource(d.calendar,A.briefAlarm?A.alarm?.crew:null));
    const evRow = (e) => '<div class="b2-row"><em class="mono">' + (e.allDay ? 'all day' : fmt.hm(e.start)) + '</em><div><b>' + esc(OW.views.eventName(e)) + '</b>' + (e.where ? '<span>' + esc(e.where) + '</span>' : '') + '</div></div>';
    const today = '<section class="b2-card scroll b2-today" data-focus data-scroll-focus data-fid="brief-today" aria-label="Calendar and due next"><h3>' + day.label + '</h3>' + OW.time.countdownHtml('briefing') + (OW.integrations?.linesHtml('briefing')||'') + (OW.integrations?.briefing()||'') +
      (s.calendar && s.calendar.available ? (todays.length ? todays.slice(0, 4).map(evRow).join('') + (todays.length > 4 ? '<div class="b2-more">+ ' + (todays.length - 4) + ' more</div>' : '') : '<div class="b2-none">Nothing scheduled</div>') : '<div class="b2-none">Add a calendar in Settings → Integrations</div>') +
      (A.sleepPeople.length ? '<h3 class="sub">Last night</h3>' + A.sleepPeople.map((p) => '<div class="b2-row"><em>' + esc(p.name) + '</em><div><b class="mono">' + hm(p.asleep) + '</b><span>' + [p.deep ? hm(p.deep) + ' deep' : '', p.rem ? hm(p.rem) + ' REM' : '', p.bed && p.wake ? fmt.hm(p.bed) + '–' + fmt.hm(p.wake) : '', p.avg ? (p.nights || 7) + '-night average ' + hm(p.avg) : ''].filter(Boolean).join(' · ') + '</span></div></div>').join('') : '') +
      (due.length ? '<h3 class="sub">Due today &amp; tomorrow</h3>' + due.slice(0, 4).map((d) => '<div class="b2-row"><em>' + fmt.when(d.at, false) + '</em><div><b>' + esc(d.title) + '</b><span>' + (d.course ? esc(d.course) + ' · ' : '') + 'by ' + fmt.hm(d.at) + '</span></div></div>').join('') : '') + '</section>';
    // --- space: the next launch and anything notable today
    const f = S.focus, nl = f || S.launches.find((l) => l.net > now && l.precise);
    const sp = [];
    if (nl) { const v = S.visibleFromHome(nl); sp.push('<div class="b2-row"><em>' + (/^in flight$/i.test(nl.status) ? 'in flight' : now > nl.net ? 'latest' : 'next') + '</em><div><b>' + esc(nl.rocket + ' · ' + nl.mission) + '</b><span>' + (now > nl.net ? esc(nl.statusName || nl.status) : fmt.when(nl.net) + ' · <span class="mono" data-cd="' + nl.net + '" data-cd-style="tminus"></span>') + (v ? ' · visible from home, look ' + v.compass : '') + '</span></div></div>'); }
    S.launches.filter((l) => nl && l.id !== nl.id && l.precise && l.net > now && l.net < now + 24 * 3600000).slice(0, 2).forEach((l) => sp.push('<div class="b2-row"><em>today</em><div><b>' + esc(l.rocket + ' · ' + l.mission) + '</b><span>' + fmt.when(l.net) + '</span></div></div>'));
    S.events.filter((e) => e.dayPrecise && e.date > now - 3600000 && e.date < now + 24 * 3600000).slice(0, 1).forEach((e) => sp.push('<div class="b2-row"><em>today</em><div><b>' + esc(e.name) + '</b><span>' + esc(e.type) + (e.precise ? ' · ' + fmt.hm(e.date) : '') + '</span></div></div>'));
    if (S.pass && S.pass.start > now && S.pass.start < now + 24 * 3600000 && S.pass.maxEl >= 30) sp.push('<div class="b2-row"><em>ISS</em><div><b>Overhead at ' + fmt.hm(S.pass.start) + '</b><span>max ' + S.pass.maxEl + '°' + (S.pass.visible ? ' · visible' : '') + '</span></div></div>');
    const space = sp.length ? '<section class="b2-card scroll b2-space" data-focus data-scroll-focus data-fid="brief-space" aria-label="Space"><h3>Space</h3>' + sp.slice(0, 4).join('') + '</section>' : '';
    // --- news: one or two general headlines (wallhub), the rest from Spaceflight News
    const gen = (B.headlines || []).slice(0, 2), spc = (S.news || []).slice(0, 3 - gen.length);
    const nRow = (n) => '<div class="b2-news-row"><b>' + esc(n.title) + '</b><span>' + esc(n.site || '') + (n.at ? ' · ' + fmt.ago(n.at) : '') + '</span></div>';
    const ai = A.aiBrief();
    const aiRow = ai ? '<button class="b2-news-row b2-ai" data-focus data-fid="br-ai" data-act="brief.ai"><em>AI</em><b>' + esc(ai.bullets[0].text) + '</b><span>' + esc(ai.bullets[0].source) + ' · ' + (ai.bullets.length - 1) + ' more ›</span></button>' : '';
    const news = gen.length + spc.length || aiRow ? '<section class="b2-card scroll b2-news" data-focus data-scroll-focus data-fid="brief-news" aria-label="News"><h3>News</h3>' + gen.map(nRow).join('') + spc.slice(0, aiRow ? Math.max(1, 2 - gen.length + 1) : 3).map(nRow).join('') + aiRow + '</section>' : '';
    // --- one cool thing: NASA's picture of the day
    const cool = B.apod ? '<section class="b2-card b2-cool"><img src="' + esc(OW.net.img(B.apod.url, 960)) + '" alt=""><div><em>' + esc(B.apod.label) + '</em><b>' + esc(B.apod.title) + '</b><span>' + esc(B.apod.credit) + '</span></div></section>' : '';
    // --- plan limits, compact
    const gauges = u ? u.providers.filter((p) => p.fiveHour || p.weekly).map((p) => { const g = p.fiveHour || p.weekly; return '<span class="br-g"><em>' + esc(p.label) + ' ' + (p.fiveHour ? '5 h' : 'week') + '</em><i><i style="transform:scaleX(' + (OW.clamp(g.pct, 0, 100) / 100).toFixed(3) + ')"></i></i><b class="mono">' + Math.round(g.pct) + '%</b></span>'; }).join('') : '';
    const alarm = !!A.briefAlarm, partner = !OW.model.builder(alarm?A.alarm?.crew:null);
    return '<div class="brief brief2' + (cool ? '' : ' no-cool') + (space ? '' : ' no-space') + (news ? '' : ' no-news') + '">' +
      '<header class="b2-head"><div class="b2-verdict" data-go-no-go role="status" aria-live="polite" aria-atomic="true"'+(OW.goNoGoView?.html()?'':' hidden')+'>'+(OW.goNoGoView?.html()||'')+'</div><div class="b2-hello"><em>' + hello + '</em><b class="mono" data-clock="hm"></b><span data-clock="date"></span>'+OW.rainNowcast.html(w)+OW.rainNowcast.credit(w,'brief-apple-credit')+'</div>' +
        '<div class="b2-btns">' + (alarm ? '<div class="alarm-heading">'+esc(alarmLine())+'</div><div class="alarm-actions">'+alarmButtons()+'</div>'+alarmNotes() : '<button class="btn primary" data-focus data-focus-first data-act="brief.dismiss">Done</button>') + '</div></header>' +
      wx + cool + (partner ? today.replace(/<h3 class="sub">Due today &amp; tomorrow<\/h3>[\s\S]*?(?=<\/section>)/,'') : today) + space + (partner ? news.replace(aiRow,'') : news) +
      (!partner && gauges ? '<footer class="b2-limits"><em>plan limits</em>' + gauges + '</footer>' : '') + '</div>';
  }
  function renderBriefing() {
    const el = $('liftoff'), old = el.querySelector('.brief');
    if (!old) return;
    OW.focus.preserve(el, () => { old.outerHTML = briefingHtml(); });
    tick(true);
  }
  /** show the briefing. alarm = it follows the launch alarm (snooze offered, the sunrise stays behind it) */
  function briefingEnd(d = A.alarm) {
    return OW.wake.briefingEnd(d, OW.data.state.briefing?.hours, A.lastWake);
  }
  function briefingDismissed(d) { return !!d?.alarm_id && OW.store.get('briefingDismissed',null) === d.alarm_id; }
  function scheduleBriefing() {
    if (!A.brief || !A.briefAlarm) return;
    clearTimeout(A.briefTimer);
    const remaining = briefingEnd() - OW.wake.now();
    if (remaining <= 0) { endBriefing(); return; }
    A.briefTimer = setTimeout(endBriefing, remaining);
  }
  function openBriefing(alarm, hadScene) {
    if (alarm && (briefingDismissed(A.alarm) || briefingEnd() <= OW.wake.now())) return;
    const el = $('liftoff');
    A.briefAlarm = !!alarm;
    if (alarm && !hadScene) { el.className = 'liftoff dawn-host'; el.innerHTML = dawnScene(); el.hidden = false; stage.classList.add('dawn-on'); paintDawn(1); $('dawn').classList.add('gone'); }
    if (!alarm) { el.className = 'liftoff dawn-host plain'; el.innerHTML = ''; el.hidden = false; stage.classList.add('dawn-on'); }
    el.classList.add('briefing');
    const muted = $('dwMuted'); if (muted) muted.remove();
    $('alarmControls').hidden = true;
    el.insertAdjacentHTML('beforeend', briefingHtml());
    A.brief = true;
    tick(true);
    requestAnimationFrame(() => el.classList.add('brief-in'));
    OW.focus.setKb(OW.isTV || OW.focus.kb); OW.focus.enter();
    clearTimeout(A.briefTimer);
    if (alarm) scheduleBriefing();
    else A.briefTimer = setTimeout(endBriefing, (OW.isTV ? 30 : 45)*60000);
    clearInterval(A.briefTick);
    A.briefTick = setInterval(() => { if (A.brief) renderBriefing(); }, 5 * 60000);
    loadBriefExtras();
    loadSleep(false);
  }
  A.openBriefing = () => { if (!A.brief && !A.night && !A.seq) { if (A.settings) closeSettings(); if (A.sheet) closeSheet(); if (A.ambient) exitAmbient(true); openBriefing(false); } };

  /** morning: out of night (or the count), into the briefing */
  function wakeUp() {
    if (OW.isDream || A.brief) return;
    A.lastWake = OW.nowMs();
    const hadScene = !!A.seq;
    if (A.seq) endSequence(true);
    if (A.night) exitNight('alarm');
    if (A.blackout) setBlackout(false);
    if (A.settings) closeSettings();
    if (A.ambient) exitAmbient(true);
    if (A.liftoff) endLiftoff();
    if (OW.mode === 'panel') restoreBrightness();
    if (OW.isTV) nat('keepOn', true);
    setWorkspace('home', { keepFocus: true });
    openBriefing(true, hadScene);
    renderAlarmBar();
    if (OW.isTV || OW.focus.kb) OW.focus.enter();
  }
  A.wakeUp = wakeUp;
  function endBriefing({navigationOnly=false}={}) {
    if (!A.brief) return;
    clearTimeout(A.briefTimer); clearInterval(A.briefTick);
    A.brief = false;
    if(A.briefAlarm && A.alarm?.alarm_id)OW.store.set('briefingDismissed',A.alarm.alarm_id);
    const el = $('liftoff'), alarm = A.briefAlarm;
    A.briefAlarm = false;
    el.classList.add('brief-out');
    if (alarm && !navigationOnly) {                 // navigation must never change sound or equipment
      nat('nightAudio', 'stop', JSON.stringify({ fadeMs: 4000 }));
      clearTimeout(A.speakerBackTimer); A.speakerBackTimer = setTimeout(speakerBack, 4200);
      if (OW.isTV) nat('keepOn', false);
    }
    $('alarmControls').hidden = true;
    clearTimeout(A.briefOutTimer);
    A.briefOutTimer = setTimeout(() => { el.hidden = true; el.className = 'liftoff'; el.innerHTML = ''; stage.classList.remove('dawn-on'); layoutBlur(); if (OW.focus.kb) OW.focus.enter(true); focusBack(); }, 700);
    resetIdle();
  }
  // Shared HA state and the same explicit fallback when the house is unreachable.
  const W = OW.wake;
  A.alarm = null;
  const alarmActive = () => A.alarm && ['countdown','ringing','snoozed'].includes(A.alarm.state) && !briefingDismissed(A.alarm);
  const alarmTargeted = d => !OW.isDream && (d.screens || (OW.data.contract===3?[]: OW.model.config.screens.filter(s=>s.alarm&&(!(d.crew&&d.crew!=='both')||s.kind==='panel')).map(s=>s.legacy_id||s.id))).includes(deviceId());
  const alarmNext = () => W.next(W.now(), Date.parse(A.alarm?.deadline) || W.now(), OW.views.sleepModel().snoozeMinutes || 10);
  const isFinal = () => !!A.alarm && (A.alarm.kind === 'final' || Date.parse(A.alarm.launch_at) >= Date.parse(A.alarm.deadline));
  function alarmLine() {
    const d=A.alarm; if(!d)return '';
    const count=+d.snoozes || 0, note=d.state==='snoozed'&&d.note?d.note:count===2?'snoozed twice':count===1?'1 snooze':count?count+' snoozes':'';
    if(d.state==='up')return 'Up '+fmt.hm(Date.parse(d.up_at))+(d.by==='timeout'?' · no answer':'')+(note?' · '+note:'');
    return (isFinal()?'Final launch · ':'liftoff '+fmt.hm(Date.parse(d.launch_at))+' · ')+'up by '+fmt.hm(Date.parse(d.deadline))+(d.deadline_reason?' · '+(OW.haClient?OW.haClient.reasonText(d.deadline_reason):OW.time.inline(d.deadline_reason)):'')+(note?' · '+note:'');
  }
  function alarmButtons() {
    const d=A.alarm, active=alarmActive(), final=isFinal(), snoozed=d?.state==='snoozed', next=alarmNext();
    if(!active)return (d?.state==='up' && OW.now().getHours()<12 ? '<button class="btn" data-focus data-fid="al-bed" data-act="back_to_bed">Back to bed</button>':'')+'<button class="btn primary" data-focus data-focus-first data-fid="al-done" data-act="brief.dismiss">Done</button>';
    const b=(id,label,hold,first)=>'<button class="btn" '+(id==='scrub'?'aria-label="Turn off today&#39;s alarm" ':'')+'data-focus '+(first?'data-focus-first ':'')+'data-fid="al-'+id+'" data-act="'+(hold?'alarm.hint':'alarm.'+id)+'" '+(hold?'data-hold="alarm.'+id+'" data-hold-ms="1200" ':'')+' data-hold-label="'+(id==='scrub'?'Scrub':d.state==='ringing'?'I’m up':'Scrub')+'"><span class="alarm-label">'+label+'</span><span class="hold-label">Hold</span><svg class="hold-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="hold-track" cx="18" cy="18" r="15"/><circle class="hold-progress" cx="18" cy="18" r="15"/></svg></button>';
    return (!snoozed && !final && next.allowed ? b('snooze','Snooze '+next.minutes+' min',false,true):'')+
      b('up',"I'm up",final,snoozed||final||!next.allowed)+b('scrub','Scrub<small>Alarm off today</small>',true,false)+
      (d.state==='countdown'?b('advance','−1 min',false,false)+b('now','Launch now',false,false):'');
  }
  function alarmNotes() {
    const d = A.alarm;
    if (!alarmActive()) return '';
    const hint = OW.isTV || OW.focus.kb ? (d.state === 'countdown' ? 'Right −1 min · hold OK 1.2 s = Scrub' : d.state === 'ringing' ? "Back = Snooze · hold OK = I'm up" : 'Hold Scrub to call off the morning') : 'Hold Scrub to call off the morning';
    return (OW.views.sleepModel().muted ? '<small>muted · the lights will still rise</small>' : '') + (d.offline ? '<small>house offline — lights not held</small>' : '') + '<small class="alarm-hint">' + esc(hint) + '</small>';
  }
  function renderAlarmBar(show) {
    const el=$('alarmControls');if(!el)return;
    const d=A.alarm, visible=!!d && ['countdown','snoozed'].includes(d.state) && (show || A.controlsVisible || OW.mode==='panel');
    el.hidden=!visible;
    if(!visible)return;
    const fid=document.activeElement?.dataset?.fid;
    el.innerHTML='<div class="alarm-meta"><span>'+esc(d.state==='snoozed'?'Snoozed · '+alarmLine():alarmLine())+'</span>'+ (d.state==='snoozed'?'<b class="mono" data-cd="'+Date.parse(d.launch_at)+'" data-cd-style="alarm"></b>':'')+
      '</div><div class="alarm-actions">'+alarmButtons()+'</div>'+alarmNotes();
    if(fid){const same=el.querySelector('[data-fid="'+fid+'"]');if(same)OW.focus.focus(same);}
  }
  function showAlarmControls() {
    if(!alarmActive())return;
    if (A.alarm.state === 'ringing' && !A.brief) { wakeUp(); return; }
    A.controlsVisible=true;pictureOff(false,'controls-show');nat('blackout',false);if(A.alarm.state==='snoozed'&&OW.mode==='panel')OW.host.setBrightness(1);
    renderAlarmBar(true);OW.focus.setKb(OW.isTV||OW.focus.kb);OW.focus.enter();
    clearTimeout(A.controlsTimer);
    if(A.alarm.state!=='ringing')A.controlsTimer=setTimeout(hideAlarmControls,10000);
  }
  function hideAlarmControls() {
    A.controlsVisible=false;$('alarmControls').hidden=true;
    if(A.alarm?.state==='snoozed'&&OW.isTV)pictureOff(true,'controls-hide');
  }
  function clearAlarm() {
    clearTimeout(A.snoozeTimer);clearTimeout(A.audioRetry);clearTimeout(A.nightTimer);clearTimeout(A.controlsTimer);
    clearTimeout(A.briefTimer);clearInterval(A.briefTick);clearTimeout(A.briefOutTimer);clearTimeout(A.speakerBackTimer);clearTimeout(A.liftoffOutTimer);clearTimeout(A.bedRestoreTimer);
    A.snoozedUntil=0;A.pendingNight=null;A.debugAlarmAt=0;A.controlsVisible=false;
    if(A.seq)endSequence(true);
    if(A.liftoff){(A.liftoffTimers||[]).forEach(clearTimeout);A.liftoff=false;}
    A.brief=false;A.briefAlarm=false;
    if(A.shutdown)endShutdown(true);
    if(A.night)exitNight('alarm');
    if(A.blackout)setBlackout(false);
    if(A.settings)closeSettings();if(A.sheet)closeSheet();if(A.watch)closeWatch();if(A.ambient)exitAmbient(true);
    nat('nightAudio','stop',JSON.stringify({fadeMs:4000}));A.nightSound=null;
    const el=$('liftoff');el.hidden=true;el.className='liftoff';el.innerHTML='';
    stage.classList.remove('dawn-on','snooze-on','lo-on','lo-run','lo-rise','lo-out','lo-brief','lo-briefing');
    $('alarmControls').hidden=true;
  }
  function applyAlarmState(d) {
    if(!alarmTargeted(d))return;
    const prev=A.alarm, same=prev?.alarm_id===d.alarm_id;
    // HA resets at noon; a timed briefing can continue after that reset, including on reconnect.
    const launchDate = new Date(d.launch_at), today = new Date(W.now());
    const countAt = Date.parse(d.count_at) || +launchDate - (d.duration_s || 600)*1000;
    if (d.state === 'idle' && today.getHours() >= 12 && launchDate.toDateString() === today.toDateString() &&
        Date.parse(d.up_at) >= countAt && new Date(d.up_at).toDateString() === launchDate.toDateString() &&
        !OW.data.state.launch?.sleeping) d = {...d,state:'up'};
    A.alarm=Object.assign({},same?prev:{},d);
    d=A.alarm; d.kind=d.kind||(Date.parse(d.launch_at)>=Date.parse(d.deadline)?'final':+d.snoozes>0?'relaunch':'first');d.bedroom=d.bedroom||(d.test||W.isQuiet(d)?'silent':d.kind==='relaunch'?'gentle':'full');OW.store.set('wakeState',d);
    if(d.state==='countdown'){
      if(A.brief){clearAlarm();A.alarm=d;}
      if(!A.seq || A.seq.t0!==Date.parse(d.launch_at))nat('toFront');
      runSequence(Date.parse(d.launch_at),{dur:d.duration_s||600,sceneFrom:d.scene_from||0,test:d.test,bedroom:d.bedroom,kind:d.kind});
      if(d.advanced)toast((Date.parse(d.launch_at)-W.now()<15000?'Launch now':'−1 min')+' · launch '+fmt.hm(Date.parse(d.launch_at)));
    }else if(d.state==='ringing'){
      if(briefingDismissed(d) || briefingEnd(d)<=W.now()){OW.store.set('briefingDismissed',d.alarm_id);clearAlarm();A.alarm=d;return;}
      if(A.seq){renderAlarmBar();return;} // wake is synchronization; local clock controls liftoff.
      if(!A.brief)wakeUp();else renderBriefing();
      renderAlarmBar(true);
    }else if(d.state==='snoozed'||d.state==='scrubbed'){
      if(same&&prev?.state===d.state){renderAlarmBar();return;}
      clearAlarm();A.alarm=d;A.lastWake=W.now();
      enterNight({silent:d.test||!OW.model.isBedroom()||W.isQuiet(d)});
      if(d.state==='snoozed'){
        A.snoozedUntil=Date.parse(d.launch_at);
        const until=Date.parse(d.count_at)||A.snoozedUntil-60000;
        A.snoozeTimer=setTimeout(()=>applyAlarmState(Object.assign({},A.alarm,{state:'countdown',duration_s:60,scene_from:A.alarm.scene_from??.8,kind:isFinal()?'final':'relaunch'})),Math.max(0,until-W.now()));
      }
      if(d.state==='scrubbed'){showNightOverlay();toast('Scrubbed · alarm off today',10000);}
    }else if(d.state==='up'){
      if(same&&prev?.state==='up'){if(A.brief)renderBriefing();return;}
      clearAlarm();A.alarm=d;A.lastWake=W.now();nat('blackout',false);nat('nightDim',false);pictureOff(false);if(OW.mode==='panel')restoreBrightness();
      if(!briefingDismissed(d) && briefingEnd(d)>W.now()){openBriefing(true,false);renderBriefing();OW.focus.enter();}
    }else if(d.state==='idle'){
      if(prev&&prev.state!=='idle'&&(A.seq||A.briefAlarm||A.snoozedUntil)){clearAlarm();setWorkspace('home');}
    }
  }
  function alarmControl(action) {
    if(!alarmActive())return;
    if(action==='dismiss')action='up';
    if(action==='snooze'&&(!alarmNext().allowed||isFinal()))return toast('No more snoozes — up by '+fmt.hm(Date.parse(A.alarm.deadline)),4000);
    const offline=()=>{
      const d={...A.alarm,offline:true};
      if(action==='snooze'){const next=alarmNext();d.state='snoozed';d.launch_at=new Date(next.at).toISOString();d.count_at=new Date(next.at-60000).toISOString();d.snoozes=(+d.snoozes||0)+1;}
      else{d.state=action==='up'?'up':'scrubbed';d.up_at=new Date(W.now()).toISOString();}
      applyAlarmState(d);toast('house offline — lights not held',6000);
    };
    if(!OW.data.status.connected)return offline();
    const p=OW.data.call('alarm.'+action,{by:deviceId()});
    if(p&&p.then)p.catch(()=>toast('House action not confirmed · reconnecting',6000));else toast('House action unavailable',4000);
  }
  function advanceAlarm(immediate) {
    if(A.alarm?.state!=='countdown')return;
    if(!OW.data.status.connected){applyAlarmState({...A.alarm,launch_at:new Date(W.advance(W.now(),Date.parse(A.alarm.launch_at),immediate)).toISOString(),advanced:true,offline:true});return;}
    const sent=OW.data.call('alarm.advance',immediate?{now:true}:{minutes:1});
    if(sent?.catch)sent.catch(()=>toast('House action not confirmed',4000));
  }
  function snooze(){alarmControl('snooze');}
  function alarmSuppressed(){return !!A.alarm&&['snoozed','up','scrubbed'].includes(A.alarm.state);}
  function onWallEvent(d) {
    if(OW.isDream||!d)return;
    W.clock(d.time_fired);
    const action=d.action;
    if(action==='wake_now'){if(OW.data.contract===3){clearAlarm();if(A.night)exitNight('house');}return;}
    if(d.v===3&&action==='goodnight'&&d.scope==='bedroom'&&OW.roles.get('bedroom')&&!OW.model.isBedroom()&&!(d.audio_screens||[]).includes(deviceId()))return;
    if(action==='back_to_bed'){if(d.v===3&&!(d.screens||[]).includes(deviceId()))return;if(OW.model.isBedroom()){clearAlarm();enterNight({sound:d.sound});}return;}
    if(action==='goodnight'){
      clearAlarm();A.alarm=null;OW.store.set('wakeState',null);
      if(d.v===3)A.nightAudioScreens=Array.isArray(d.audio_screens)?d.audio_screens:[];
      rememberSound(d.sound,d.sound_url);A.pendingNight={sound:d.sound||null,url:d.sound_url||null};nat('toFront');runShutdown();return;
    }
    if(['launch_sequence','wake','snooze','up','scrub','snooze_denied'].includes(action)){
      if(d.v===3&&action==='snooze_denied'&&d.by===deviceId()){toast('No more snoozes — up by '+fmt.hm(Date.parse(d.deadline)),4000);return;}
      if(!alarmTargeted(d))return;
      if(action!=='launch_sequence'&&A.alarm?.alarm_id&&d.alarm_id&&d.alarm_id!==A.alarm.alarm_id)return;
      if(action==='snooze_denied'){if(d.by===deviceId()||(d.v===3?alarmTargeted(d):OW.isTV))toast('No more snoozes — up by '+fmt.hm(Date.parse(d.deadline)),4000);return;}
      const state={launch_sequence:'countdown',wake:'ringing',snooze:'snoozed',up:'up',scrub:'scrubbed'}[action];
      const data=Object.assign({},d,{state});
      if(action==='snooze'){data.count_at=d.until;data.launch_at=d.launch_at||new Date(Date.parse(d.until)+60000).toISOString();}
      applyAlarmState(data);return;
    }
    if(action==='blackout'&&!A.night)enterNight({silent:true});
  }
  A.onWallEvent=onWallEvent;
  A.advanceAlarm=advanceAlarm;

  // =================================================================================
  // display: brightness, screen off, blackout (root backlight) and soft fallback
  // =================================================================================
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 300); }, ms || 2600);
  }
  A.toast = toast;

  /**
   * Night modes on the panel (both keep Android awake and on the network):
   *   blackout     backlight off + black screen; a tap or any key wakes it
   *   display off  the display itself is powered down; wakes on schedule, hardware key or adb
   * Real suspend is never used from here: on this hardware it takes Wi-Fi down with it.
   */
  /** panel brightness back to the setting; 0 = follow the room (light sensor) */
  function restoreBrightness() { A.autoBright = null; OW.host.setBrightness(OW.config.get('brightness')); if (A.lux != null) onLux(A.lux, true); }
  /** the room's light level (panel): brightness follows it; a dark room in sleep mode means night; lights on at night wake the night clock */
  function onLux(v, now) {
    if (!(v >= 0)) return;
    A.lux = A.lux == null || now ? v : A.lux * 0.6 + v * 0.4;
    const t = OW.nowMs(), L = OW.data.state.launch;
    if (L && L.sleeping && !alarmSuppressed() && !A.night && !A.seq && !A.brief && !A.shutdown && A.lux < 2) { A.darkSince = A.darkSince || t; if (t - A.darkSince > 20000) { OW.host.log('room is dark and sleep mode is on: night'); enterNight({ silent: true }); } } else A.darkSince = 0;
    if (A.night && !A.night.preview && !A.night.overlay && A.lux > 30 && (A.night.lastLux || 0) < 8 && t - A.night.since > 30000) showNightOverlay();
    if (A.night) A.night.lastLux = A.lux;
    if (OW.mode === 'panel' && !A.night && !A.seq && !A.snoozedUntil && !A.blackout && +OW.config.get('brightness') === 0) {
      const b = OW.clamp(Math.round(4 + 30 * Math.log10(1 + A.lux / 3)), 4, 100);
      if (A.autoBright == null || Math.abs(b - A.autoBright) >= 4) { A.autoBright = b; OW.host.setBrightness(b); }
    }
  }
  function setBlackout(on, displayOff) {
    if (!on) exitNight();
    A.blackout = on;
    $('softoff').hidden = !on;
    const N = (OW.demo?.active ? null : window.flightdayNative);
    try {
      if (N && on && displayOff && N.displayOff && N.displayOff(true)) { /* powered down */ }
      else if (N && N.blackout) N.blackout(!!on);
    } catch (e) { /* browser */ }
    if (!on) resetIdle();
  }
  function screenOff() {
    if (OW.isTV) return toast('TV power is not controlled from here');
    setBlackout(true, OW.config.get('schedule.nightMode') === 'sleep');
  }
  A.screenOff = screenOff;

  // =================================================================================
  // settings
  // =================================================================================
  const STEPS = { 'sleep.liftoffDb':[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6],
    'bg.intervalMin': [1, 2, 5, 10, 15, 30, 60], 'bg.ambientIntervalMin': [0.5, 1, 2, 5, 10, 30],
    'ambient.idleMin': [0, 1, 2, 5, 10, 15, 30], 'launch.hours': [3, 6, 12, 24, 48], 'launch.featuredHours': [24, 48, 72, 168],
    brightness: [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    'sleep.alarmMax': [0,5,10,14,16,18,20,22,25,30,35,40,50,60,70,80,90,100], 'sleep.nightBrightness': [1, 2, 5, 10, 15, 20, 30],
  };
  const unit = (path, v) => path === 'sleep.liftoffDb' ? (v>0?'+':'')+v+' dB' : (path === 'sleep.nightBrightness' ? v + '%' : path === 'sleep.alarmMax' ? (v ? v + '%' : 'auto') : path === 'brightness' ? (v ? v + '%' : 'auto') : path.startsWith('launch.') ? v + ' h' : v === 0 ? 'never' : v < 1 ? Math.round(v * 60) + ' s' : v + ' min');

  function screensHtml() {
    const screens = OW.hub?.prefs?.screens || {}, ids = Object.keys(screens), editable = canShare() && !A.screenSaving;
    if (!ids.length) return '<p class="set-note">' + (OW.hub?.enabled() ? 'No screens registered yet.' : 'Connect wallhub to set up your screens.') + '</p>';
    if (!ids.includes(A.screenEdit)) A.screenEdit = ids[0];
    const id = A.screenEdit, sc = screens[id], command = (key, value) => esc(JSON.stringify([id,key,value]));
    const segment = (key, choices, fallback) => '<div class="seg remote-seg">' + choices.map(([value,label]) => '<button data-focus data-fid="screen-' + key + '-' + esc(String(value)) + '" data-act="screens.set" data-arg="' + command(key,value) + '" class="' + ((sc[key] ?? fallback) === value ? 'on' : '') + '"' + (!editable ? ' disabled' : '') + '>' + label + '</button>').join('') + '</div>';
    const row = (label, body) => '<div class="set"><div class="set-l"><span>' + label + '</span></div>' + body + '</div>';
    const step = (key, fallback) => '<div class="stepper">' + [-10,10].map(d => '<button data-focus data-act="screens.set" data-arg="' + command(key,OW.clamp((sc[key] ?? fallback)+d,0,100)) + '"' + (!editable ? ' disabled' : '') + '>' + (d<0?'−':'+') + '</button>').join('<b>' + (sc[key] ?? fallback) + '%</b>') + '</div>';
    return '<div class="screen-list">' + ids.map(sid => '<button class="btn' + (sid === id ? ' on' : '') + '" data-focus ' + (sid === id ? 'data-focus-first ' : '') + 'data-fid="screen-' + esc(sid) + '" data-act="screens.select" data-arg="' + esc(sid) + '">' + esc(screens[sid].name || sid) + '</button>').join('') + '</div>' +
      '<p class="set-note">' + (!canShare() ? 'Add the wallhub prefs token in Connections to change a screen.' : A.screenSaving ? 'Saving…' : 'One setting at a time, saved for this screen.') + '</p>' +
      '<label class="set field" data-focus data-act="edit"><span>Name</span><input data-screen-name="' + esc(id) + '" value="' + esc(sc.name || id) + '" maxlength="64"' + (!editable ? ' disabled' : '') + '></label>' +
      row('Theme',segment('theme',THEMES.map(t=>[t,THEME_LABEL[t]]),'tokyo-night')) +
      row('Ambient',segment('ambient',[['still','Still'],['animated','Animated'],['live','Live']],'still')) +
      row('Night look',segment('nightLook',[['black','Pure black'],['clock','Night clock']],'black')) +
      row('At night',segment('nightBehavior',[['off','Off'],['dim','Dim'],['stay_on','Stay on']],'off')) + row('Brightness',step('brightness',0)) +
      row('Night brightness',step('nightBrightness',1)) +
      '<div class="screen-toggles">' + WORKSPACES.filter(([area])=>area!=='home').map(([area,label])=>{const selected=sc.areas || WORKSPACES.map(x=>x[0]);return '<button class="btn" data-focus data-act="screens.set" data-arg="' + command('areas',selected.includes(area)?selected.filter(x=>x!==area):selected.concat(area)) + '"' + (!editable ? ' disabled' : '') + '>' + label + ' · ' + (selected.includes(area)?'Shown':'Hidden') + '</button>';}).join('') + '</div>' +
      '<button class="btn warn" data-focus data-fid="forget-' + esc(id) + '" data-act="screens.hint" data-hold="screens.forget" data-hold-ms="700" data-arg="' + esc(id) + '"' + (!editable ? ' disabled' : '') + '>Forget screen · hold</button>';
  }
  async function patchScreen(id,key,value) {
    if (!canShare() || A.screenSaving || !Object.hasOwn(OW.hub.prefs.screens || {}, id)) return toast('Connect wallhub with its prefs token to change this screen');
    if (key === 'name' && !value) return toast('Give the screen a name');
    A.screenSaving = true;
    try { await OW.hub.patchPrefs({screens:{[id]:key === null ? null : {[key]:value}}}); toast(key === null ? 'Screen forgotten' : 'Saved'); }
    catch (e) { toast('Screen change not confirmed · try again'); }
    finally { A.screenSaving = false; if (A.settings) renderSettings(); }
  }
  function timeFormatSettings(){
    const shared=OW.data.state.timeFormat||{value:'12h',available:false},override=OW.config.get('display.timeFormat')||'shared';
    const buttons=(options,act,current,locked)=>'<div class="seg time-format-options">'+options.map(([value,label])=>'<button '+(locked?'disabled':'data-focus')+' data-fid="'+act+'-'+value+'" data-act="'+act+'" data-arg="'+value+'" class="'+(value===current?'on':'')+'">'+label+'</button>').join('')+'</div>';
    return '<div class="set time-format-setting"><div class="set-l"><span>Shared time format</span><small>'+(shared.available?'Across screens · defaults to 12-hour':'House unavailable · 12-hour fallback')+'</small></div>'+buttons([['12h','12-hour'],['24h','24-hour'],['both','Both']],'time.format.shared',shared.value,!shared.available||A.timeFormatPending)+'</div><div class="set time-format-setting"><div class="set-l"><span>This screen’s time format</span><small>Shared: '+shared.value+' · '+'saved on this screen'+'</small></div>'+buttons([['shared','Follow shared'],['12h','12h'],['24h','24h'],['both','Both']],'time.format.screen',override,false)+'</div>';
  }
  function settingsHtml() {
    const c = OW.config, host = OW.host.info, p = A.panel;
    const seg = (path, options) => '<div class="seg">' + options.map(([val, label]) => '<button class="' + (String(c.get(path)) === String(val) ? 'on' : '') + '" data-focus data-fid="set-' + path + '-' + val + '" data-act="cfg.set" data-arg="' + path + '=' + val + '">' + label + '</button>').join('') + '</div>';
    const stepper = (path) => '<div class="stepper"><button data-focus data-fid="set-' + path + '-dn" data-act="cfg.step" data-arg="' + path + ':-1">' + icon('minus') + '</button><b>' + unit(path, c.get(path)) + '</b><button data-focus data-fid="set-' + path + '-up" data-act="cfg.step" data-arg="' + path + ':1">' + icon('plus') + '</button></div>';
    const time = (path) => '<div class="stepper"><button data-focus data-fid="set-' + path + '-dn" data-act="cfg.time" data-arg="' + path + ':-15">' + icon('minus') + '</button><b>' + OW.time.text(c.get(path)) + '</b><button data-focus data-fid="set-' + path + '-up" data-act="cfg.time" data-arg="' + path + ':15">' + icon('plus') + '</button></div>';
    const tog = (path) => '<button class="togbtn" data-focus data-fid="set-' + path + '" data-act="cfg.toggle" data-arg="' + path + '"><i class="tog' + (c.get(path) ? ' on' : '') + '"></i></button>';
    const row = (label, control, hint, cls) => '<div class="set' + (cls ? ' ' + cls : '') + '"><div class="set-l"><span>' + label + '</span>' + (hint ? '<small>' + hint + '</small>' : '') + '</div><div class="set-c">' + control + '</div></div>';
    const input = (path, label, type, ph) => '<label class="set field" data-focus data-fid="in-' + path + '" data-act="edit"><span>' + label + '</span><input type="' + (type || 'text') + '" data-cfg="' + path + '" value="' + esc(c.get(path) == null ? '' : c.get(path)) + '" placeholder="' + esc(ph || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false" tabindex="-1"></label>';
    const group = (title, ic, body) => '<section class="sgroup" data-settings-group="' + title.toLowerCase().replace(/&amp;/g,'and').replace(/[^a-z0-9]+/g,'-') + '"><h3>' + icon(ic) + title + '</h3>' + body + '</section>';
    const ha = OW.data.status;
    const sim = OW.space.simulating();

    const colMe =
      (OW.integrations?group('Integrations','plug',OW.integrations.settingsHtml()):'') +
      group('Screens', 'tv', screensHtml()) +
      group('About','home','<details><summary data-focus aria-label="What&#39;s new">What’s new</summary><article aria-label="What&#39;s new"><h2>Mission Log</h2><p>What’s new in each release</p><p>2026-11-14 · Flight Day terminology, sourced spaceflight anniversaries and an optional notice sound.</p></article></details><details><summary data-focus>Acknowledgements</summary><p>Star data: HYG database by David Nash (astronexus), CC BY-SA 4.0, adapted: subset to magnitude 5.0</p><p><a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0 licence</a></p></details>') +
      group('Storage', 'grid', OW.wallpaper?.video?.html() || '') +
      group('Sounds','music',row('Notice sound',seg('sounds.notice',[['off','Off'],['quindar','Quindar tone']]),'The Apollo radio beep before notices. Never at night')) +
      (OW.standalone?.active()?group('Connection','home','<p aria-label="Standalone mode">Solo flight</p><p>This device only, no Home Assistant</p>'):'') +
      group('home', 'grid',
        '<div class="set-btns"><button class="btn" data-focus data-fid="set-arrange" data-act="home.edit">' + icon('grid') + '<span>Arrange Home tiles</span></button></div>' +
        row('Space', tog('areas.space'), 'areas in the top bar') + row('House', tog('areas.house')) + row('Night', tog('areas.night')) + row('Status', tog('areas.status'))) +
      (OW.houseCheck?group('Systems check','check','<p aria-label="House check">What needs attention at home</p>'+OW.houseCheck.settingsHtml()):'') +
      (!OW.standalone?.active()?group(OW.crewText('title'),'people',
        '<p>'+OW.model.config.people.length+' '+esc(OW.crewText(OW.model.config.people.length===1?'member':'members'))+'</p><p>'+esc(OW.crewText('add'))+'</p>'+OW.model.config.people.map(p=>{
          const name=OW.model.people?.[p.id]?.name||OW.data.provider?.states?.[p.person]?.attributes?.friendly_name||p.id;
          return row(name,'', [p.wakes?OW.crewText('wakes'):'',p.notify?OW.crewText('phone',{name}):'',p.private_sources?.length?OW.crewText('private',{name}):''].filter(Boolean).join(' · '));
        }).join('')):'') +
      group('Comfort','thermostat',(OW.views.climateRoutines?.('set')||'')+(OW.smartComfort?.settingsHtml()||'')) +
      group('night &amp; alarm', 'moon',
        '<div class="set-btns"><button class="btn" data-focus data-fid="set-schedule" data-act="schedule.open">Schedule</button></div>' +
        row('Briefing stays up', '<div class="seg briefing-duration">'+[['1','1 h'],['2','2 h'],['3','3 h'],['noon','until noon']].map(([value,label])=>'<button '+(!OW.data.state.briefing?.available || A.briefingPending ? 'disabled ' : 'data-focus ')+'data-fid="briefing-hours-'+value+'" data-act="briefing.hours" data-arg="'+value+'" class="'+(OW.wake.briefingHours(OW.data.state.briefing?.hours)===value?'on':'')+'">'+label+'</button>').join('')+'</div>', 'Shared across screens · closes sooner with Done', 'briefing-setting') +
        row('Show Go/No-Go', '<button class="togbtn" data-focus data-fid="set-go-no-go" data-act="brief.goNoGo" aria-label="Show Go/No-Go" aria-pressed="'+(OW.goNoGoView?.enabled()!==false)+'"><i class="tog'+(OW.goNoGoView?.enabled()!==false?' on':'')+'"></i></button>', 'This screen · morning briefing only') +
        (OW.isTV && OW.data.contract === 3 && OW.data.client?.pictureStatus() ? row('TV Picture off', '', OW.data.client.pictureStatus().configured ? 'Managed by Home Assistant · Flight Day' : "Add the TV's pre-shared key in Home Assistant · Flight Day options") : '') +
        row('At night', seg('sleep.behavior', [['off', 'Off'], ['dim', 'Dim'], ['stay_on', 'Stay on']]), 'off = backlight off · dim = night clock') +
        row('Woken at night', seg('sleep.look', [['auto', 'Automatic'], ['black', 'Pure black'], ['clock', 'Night clock']]), 'this screen · off again after 10 s') +
        (OW.mode === 'panel' ? row('Night brightness', stepper('sleep.nightBrightness')) : '') +
        row('Speaker volume maximum', ha.connected ? '<div class="stepper"><button data-focus data-fid="alarm-cap-minus" data-act="alarm.cap" data-arg="-1">−</button><b>'+ (OW.views.sleepModel().alarmMax??'—')+'</b><button data-focus data-fid="alarm-cap-plus" data-act="alarm.cap" data-arg="1">+</button></div>' : stepper('sleep.alarmMax'), 'Absolute speaker volume · now: '+(OW.views.sleepModel().audioAdapterVol??'—')) +
        row('Sleep sound here', seg('sleep.audio', [['auto', 'auto'], ['on', 'on'], ['off', 'off']]), 'auto = the bedroom TV plays it') +
        '<div class="set-btns"><button class="btn" data-focus data-fid="set-night" data-act="ws" data-arg="night">' + icon('moon') + '<span>Wake times &amp; sound</span></button></div>') +
      '<p class="set-note">' + (A.prefsShared() ? 'These settings are saved in wallhub for “' + (OW.config.get('screen.name') || screenName() || 'this screen') + '”.' : (OW.data.contract===3?'Screen settings unavailable · reconnect to Flight Day':'Saved on this screen (wallhub prefs token not set).')) + '</p>' +
      group('ambient', 'orbit',
        row('Starts after idle', stepper('ambient.idleMin')) +
        row('Picture changes every', stepper('bg.ambientIntervalMin')) +
        row('Background', seg('ambient.mode', [['still', 'Still'], ['animated', 'Animated'], ['wallpaper', 'Live wallpaper'], ['stream', 'Live stream']]), 'Muted live streams fall back to Live wallpaper') +
        row('Source', 'Scenes', 'Generated from your location, time and available data') +
        row('Scene', seg('ambient.wallpaper.scene', [['auto', 'Automatic'], ['sky', 'Sky now'], ['stars', 'Starfield'], ['earth', 'Earth now'], ['weather', 'Weather now']]), OW.isTV || OW.isDream ? 'This TV uses 2D scenes; Earth now uses Sky now.' : 'Generated from your location, time and available data') +
        (OW.wallpaper?.video?.packs.length ? row('Video pack', seg('ambient.wallpaper.pack', OW.wallpaper.video.packs.map(p=>[p.pack,esc(p.title)]))) : '') +
        row('Pause on battery', tog('ambient.pause_on_battery'), 'Show a still picture when this device isn’t charging'));

    const col1 =
      group('appearance', 'theme',
        row('Theme', seg('theme', THEMES.map(id => [id, THEME_LABEL[id]]))) +
        row('Backgrounds', seg('bg.mode', [['living', 'living'], ['theme', 'theme only']]), 'living = APOD, NASA, launches, events') +
        row('Rotate every', stepper('bg.intervalMin')) +
        row('Ambient rotates', stepper('bg.ambientIntervalMin')) +
        row('NASA picture of the day', tog('bg.apod')) +
        row('NASA image library', tog('bg.nasa')) +
        '<div class="set-btns"><button class="btn" data-focus data-fid="set-bgnext" data-act="bg.next">' + icon('next') + '<span>Next image</span></button><button class="btn" data-focus data-fid="set-amb" data-act="ambient">' + icon('moon') + '<span>Ambient now</span></button></div>') +
      group('launch day', 'rocket',
        row('Any launch within', stepper('launch.hours')) +
        row('Featured vehicles within', stepper('launch.featuredHours'), 'Starship, Artemis, crewed…') +
        
        '<label class="set field" data-focus data-fid="in-launch.priority" data-act="edit"><span>Favourites, best first (a|b = either)</span><input type="text" data-cfg-list="launch.priority" value="' + esc((c.get('launch.priority') || []).join(', ')) + '" autocomplete="off" autocapitalize="off" spellcheck="false" tabindex="-1"></label>' +
        '<label class="set field" data-focus data-fid="in-launch.hide" data-act="edit"><span>Never lead (still listed)</span><input type="text" data-cfg-list="launch.hide" value="' + esc((c.get('launch.hide') || []).join(', ')) + '" placeholder="e.g. starlink, casc" autocomplete="off" autocapitalize="off" spellcheck="false" tabindex="-1"></label>' +
        (c.get('launch.track') ? '<div class="set-btns"><button class="btn" data-focus data-fid="set-untrack" data-act="cfg.set" data-arg="launch.track=">' + icon('pin') + '<span>Stop tracking</span></button></div>' : '') +
        
        (A.developer ? '<div class="set-btns"><button class="btn' + (sim ? ' on' : '') + '" data-focus data-fid="set-sim" data-act="sim">' + icon('rocket') + '<span>' + (sim ? 'Stop simulation' : 'Simulate launch T-45') + '</span></button></div>' : ''));

    const col2 =
      group('display', 'sun',
        timeFormatSettings() + row('Brightness', stepper('brightness')) +
        row('Night mode', seg('schedule.nightMode', [['blackout', 'blackout'], ['sleep', 'display off']]), 'blackout: tap wakes · both stay online') +
        row('Screen off at', time('schedule.off') + tog('schedule.offEnabled')) +
        (ha.connected ? '' : row('This screen’s own alarm', time('schedule.launch') + tog('schedule.launchEnabled'))) +
        row('Speaker volume', '<span class="mono">now: '+(OW.views.sleepModel().audioAdapterVol??'—')+'</span>', 'Alarm maximum · absolute speaker volume') +
        row('Liftoff level', stepper('sleep.liftoffDb'), '−6…+6 dB · rumble only') + input('people.partner.name','Partner’s name') +
        '<div class="set-btns"><button class="btn" data-focus data-fid="set-off" data-act="screen.off">' + icon('power') + '<span>Screen off now</span></button><button class="btn" data-focus data-fid="set-liftoff" data-act="seq.preview">' + icon('rocket') + '<span>Try the alarm</span></button></div>') +
      group('home location', 'pin',
        '<p class="set-note">Weather (Open-Meteo), ISS passes, sunrise/sunset. Empty = no weather shown.</p>' +
        '<div class="fields two">' + input('home.lat', 'Latitude', 'text', 'e.g. 40.71') + input('home.lon', 'Longitude', 'text', 'e.g. -74.00') + '</div>' +
        row('Units', seg('units', [['f', '°F'], ['c', '°C']]))) +
      (A.developer ? group('Developer', 'spark', input('bg.apodKey', 'APOD key', 'password', 'API key') + row('Launch Library', seg('launch.api', [['prod', 'Live'], ['dev', 'Development']]))) : '');

    const col3 =
      (OW.integrations?group('Demo house','home',OW.integrations.demoHtml()):'') +
      group('Demo house', 'home',
        row('Sample data', '<a class="btn" href="/">Back to Flight Day</a>') +
        row('Scene', '<select data-focus data-demo-scenario aria-label="Demo scene">'+Object.entries(OW.demo.fixture.scenarios).map(([id,scene])=>'<option value="'+esc(id)+'"'+(id===OW.demo.scenario?' selected':'')+'>'+esc(scene.label)+'</option>').join('')+'</select>') +
        row('Space', 'Real · as of '+OW.demo.snapshotDate) +
        (A.developer ? row('Extensions', '<button class="btn" data-focus data-act="demo.line">Post a sample line</button>', 'Bin day · session only') : '')) +
      group('system', 'cpu',
        '<button class="sysline version-line" data-focus data-fid="set-version" data-act="developer.hint" data-hold="developer.open" data-hold-ms="700"><span>' + esc(host.model || 'browser') + '</span><span>v' + esc(host.version) + ' · ' + esc(OW.mode) + (host.rooted ? ' · <b class="ok">root</b>' : '') + '</span></button>' +
        (p ? '<div class="sysline"><span>soc ' + (p.tempC != null ? p.tempC + '°C' : '–') + ' · load ' + (p.load != null ? p.load : '–') + '</span><span>mem ' + (p.memPct != null ? p.memPct + '%' : '–') + ' · up ' + (p.uptimeH != null ? p.uptimeH + ' h' : '–') + '</span></div>' : '') +
        '<div class="set-btns">' +
          '<button class="btn" data-focus data-fid="set-reload" data-act="reload">' + icon('refresh') + '<span>Reload</span></button>' +
          (OW.mode === 'panel' ? '<button class="btn" data-focus data-fid="set-android" data-act="android.settings">' + icon('gear') + '<span>Android settings</span></button>' : '') +
          '<button class="btn" data-focus data-fid="set-exit" data-act="exit">' + icon('exit') + '<span>' + (OW.isTV ? 'Exit' : 'Exit to system launcher') + '</span></button>' +
          (host.rooted ? '<button class="btn warn" data-focus data-fid="set-reboot" data-act="reboot">' + icon('power') + '<span>' + (A.rebootArmed ? 'Confirm reboot' : 'Reboot panel') + '</span></button>' : '') +
        '</div>');

    return '<div class="modal-win"><header class="mh"><span class="tt">' + icon('gear') + 'Settings — Flight Day</span><button class="ibtn sm" data-focus data-fid="set-close" data-act="settings.close" aria-label="close">' + icon('x') + '</button></header>' +
      '<div class="mcols four"><div class="mcol scroll">' + colMe + '</div><div class="mcol scroll">' + col1 + '</div><div class="mcol scroll">' + col2 + '</div><div class="mcol scroll">' + col3 + '</div></div></div>';
  }

  function renderSettings() {
    const el = $('settings');
    const detailScroll = el.querySelector('.settings-detail')?.scrollTop || 0;
    const navScroll = el.querySelector('.settings-nav')?.scrollTop || 0;
    OW.focus.preserve(el, () => {
      el.innerHTML = settingsHtml();
      if (OW.isTV) {
        const cols=el.querySelector('.mcols'), groups=[...cols.querySelectorAll('.sgroup')];
        if (!groups.some(g=>g.dataset.settingsGroup===A.settingsGroup)) A.settingsGroup=groups[0].dataset.settingsGroup;
        const layout=document.createElement('div');layout.className='settings-browser';
        const nav=document.createElement('nav');nav.className='settings-nav scroll';nav.setAttribute('aria-label','Settings groups');
        nav.innerHTML=groups.map(g=>'<button data-focus data-fid="settings-group-'+g.dataset.settingsGroup+'" data-act="settings.group" data-arg="'+g.dataset.settingsGroup+'" aria-current="'+(g.dataset.settingsGroup===A.settingsGroup?'true':'false')+'">'+g.querySelector('h3').innerHTML+'</button>').join('');
        const detail=document.createElement('div');detail.className='settings-detail scroll';
        groups.forEach(g=>{g.hidden=g.dataset.settingsGroup!==A.settingsGroup;detail.append(g);});
        layout.append(nav,detail);cols.replaceWith(layout);
        detail.scrollTop=detailScroll;nav.scrollTop=navScroll;
      }
    });
    layoutBlur();
    el.querySelector('[data-demo-scenario]')?.addEventListener('change',event=>OW.demo.setScenario(event.target.value));
    el.querySelectorAll('input[data-screen-name]').forEach(inp => { inp.addEventListener('change', () => patchScreen(inp.dataset.screenName, 'name', inp.value.trim())); inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); }); });
    el.querySelectorAll('input[data-cfg-list]').forEach((inp) => {
      inp.addEventListener('change', () => OW.config.set(inp.dataset.cfgList, inp.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)));
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.blur(); inp.closest('[data-focus]').focus({ preventScroll: true }); } else e.stopPropagation();
      });
    });
    el.querySelectorAll('input[data-cfg]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const path = inp.dataset.cfg;
        let v = inp.value.trim();
        if (path === 'home.lat' || path === 'home.lon') { v = v === '' || isNaN(+v) ? null : OW.clamp(+v, path === 'home.lat' ? -90 : -180, path === 'home.lat' ? 90 : 180); OW.config.set('home.source', v == null ? '' : 'manual'); }
        OW.config.set(path, v);
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault(); e.stopPropagation();
          inp.blur();
          const wrap = inp.closest('[data-focus]');
          wrap.focus({ preventScroll: true });
          if (e.key === 'ArrowUp') OW.focus.move('up');
          if (e.key === 'ArrowDown') OW.focus.move('down');
        } else e.stopPropagation();
      });
    });
  }
  function selectSettingsGroup(id, enterDetail) {
    const el=$('settings'),group=[...el.querySelectorAll('[data-settings-group]')].find(g=>g.dataset.settingsGroup===id);
    if (!group) return;
    A.settingsGroup=id;
    el.querySelectorAll('[data-settings-group]').forEach(g=>{g.hidden=g!==group;});
    el.querySelectorAll('[data-act="settings.group"]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.arg===id)));
    const detail=el.querySelector('.settings-detail');if(detail)detail.scrollTop=0;
    if (enterDetail) OW.focus.focus([...group.querySelectorAll('[data-focus]')].find(e=>!e.disabled) || el.querySelector('[data-fid="settings-group-'+id+'"]'));
  }
  function revealSettingsGroup(target) {
    if (OW.isTV && target) selectSettingsGroup(target.closest('[data-settings-group]')?.dataset.settingsGroup,false);
  }
  function settingsKey(e) {
    if (!OW.isTV || !A.settings) return false;
    const cur=document.activeElement,nav=cur?.closest('.settings-nav'),detail=cur?.closest('.settings-detail');
    const back=['Escape','Backspace','BrowserBack'].includes(e.key);
    if (nav && ['ArrowUp','ArrowDown'].includes(e.key)) {
      const list=[...nav.querySelectorAll('[data-focus]')],i=list.indexOf(cur),next=list[OW.clamp(i+(e.key==='ArrowDown'?1:-1),0,list.length-1)];
      selectSettingsGroup(next.dataset.arg,false);OW.focus.focus(next);
    } else if (nav && e.key==='ArrowRight') selectSettingsGroup(cur.dataset.arg,true);
    else if (detail && (back || (e.key==='ArrowLeft' && !settingsHasControlLeft(cur)))) {
      OW.focus.focus($('settings').querySelector('[data-fid="settings-group-'+A.settingsGroup+'"]'));
    } else return false;
    OW.focus.setKb(true);e.preventDefault();e.stopPropagation();return true;
  }
  function settingsHasControlLeft(cur) {
    const row=cur.closest('.set,.climate-options,.rowbtns,.set-btns,.smart-comfort-settings');
    if (!row) return false;
    const c=cur.getBoundingClientRect();
    return [...row.querySelectorAll('[data-focus]')].some(e=>!e.disabled && e!==cur && !e.closest('[hidden]') && e.getBoundingClientRect().right<=c.left+1 && Math.abs(e.getBoundingClientRect().top-c.top)<c.height/2);
  }
  function openSettings() {
    if (OW.isDream) return;
    if (A.ambient) exitAmbient(true);
    A.settings = true;
    A.rebootArmed = false;
    A.developer = false;
    $('settings').hidden = false;
    stage.classList.add('modal-on');
    renderSettings();
    if (OW.host.available) OW.host.requestPanelStats();
    OW.focus.enter();
  }
  function closeSettings() {
    A.settings = false;
    $('settings').hidden = true;
    stage.classList.remove('modal-on');
    if (OW.focus.kb) OW.focus.enter(true);
  }

  function shiftTime(hhmm, deltaMin) {
    const [h, m] = hhmm.split(':').map(Number);
    const t = (((h * 60 + m + deltaMin) % 1440) + 1440) % 1440;
    return fmt.pad(Math.floor(t / 60)) + ':' + fmt.pad(t % 60);
  }

  // =================================================================================
  // actions (touch click + Enter both end up here)
  // =================================================================================
  function refreshTimeFormat(){
    A.lastTimeFormat=OW.time.mode();stage.dataset.timeFormat=A.lastTimeFormat;
    OW.views.update('all');renderBar();
    if(A.brief)renderBriefing();if(A.ambient)renderAmbient();if(A.scheduleOpen)renderSchedule();
    if(A.night?.overlay)renderNightOverlay();if(alarmActive())renderAlarmBar();
    if(A.settings)renderSettings();tick(true);OW.time.decorate(stage);
  }
  async function changeSharedTimeFormat(value){
    if(A.timeFormatPending)return;A.timeFormatPending=true;if(A.settings)renderSettings();
    try{const result=OW.data.call('time.format',{value});if(!result?.then)throw Error('Shared time format is unavailable');await result;}
    catch(e){toast(e.message||'Time format change not confirmed',5000);}
    finally{A.timeFormatPending=false;if(A.settings)renderSettings();}
  }
  async function changeBriefingHours(hours) {
    if (A.briefingPending) return;
    A.briefingPending = true; if (A.settings) renderSettings();
    try {
      const result = OW.data.call('briefing.hours',{hours});
      if (!result?.then) throw Error('Briefing setting is unavailable');
      await result;
    } catch (err) { toast(err.message || 'Briefing setting not confirmed',5000); }
    finally { A.briefingPending=false; if (A.settings) renderSettings(); }
  }
  async function changeClimate(action, payload) {
    if (A.climatePending) return;
    if (!OW.data.status.connected) return toast('Home Assistant is offline');
    A.climatePending = true; OW.views.update('climate'); if(A.settings)renderSettings();if(A.scheduleOpen)renderSchedule();
    try {
      const result = OW.data.call(action,payload);
      if (!result?.then) throw Error('Thermostat controls are unavailable');
      await result;
      // Only HA state updates change the displayed value; a failed request never looks successful.
    } catch (err) { toast(err.message || 'Thermostat change not confirmed',5000); }
    finally { A.climatePending=false; OW.views.update('climate'); if(A.settings)renderSettings();if(A.scheduleOpen)renderSchedule(); }
  }
  async function changeHouse(action,payload,shutdown=false) {
    const vacuum=action.startsWith('vacuum.'),key=vacuum?'vacuumPending':'comfortPending',topic=vacuum?'vacuum':'comfort';
    if(A[key])return;
    if(!OW.data.status.connected)return toast('Home Assistant is offline');
    A[key]=true;OW.views.update(topic);if(A.settings)renderSettings();
    try{
      const result=OW.data.call(action,payload);if(!result?.then)throw Error('House controls are unavailable');
      await result;
      if(shutdown)endShutdown();
    }catch(error){toast(error.message||'Change not confirmed · try again',5000);}
    finally{A[key]=false;OW.views.update(topic);if(A.settings)renderSettings();}
  }
  async function changeHouseCheck(action,payload={}) {
    if(A.houseCheckPending)return;
    A.houseCheckPending=true;A.houseCheckMessage='';OW.views.update('house-check');if(A.settings)renderSettings();
    try{
      if(action==='check')A.houseCheckMessage=await OW.houseCheck.checkAgain();
      else {
        const requests=action==='dismiss'?payload.ids.map(fid=>({fid})):[payload];
        for(const p of requests){const result=OW.data.call('house-check.'+action,p);if(!result?.then)throw Error('House check · waiting for the backend');await result;}
        A.houseCheckMessage='Change sent · waiting for the house';
      }
    }catch(error){A.houseCheckMessage=error.message||'House check change not confirmed';}
    finally{A.houseCheckPending=false;OW.views.update('house-check');if(A.settings)renderSettings();}
  }
  function openHouseCheckLink(link) {
    if(!OW.houseCheck.links.includes(link)||link==='none'||(A.briefAlarm&&alarmActive()))return;
    if(A.brief)endBriefing({navigationOnly:true});
    if(link.startsWith('settings.')){
      openSettings();
      const target=link==='settings.house_check'?document.querySelector('.house-check-settings'):document.querySelector('.smart-comfort-settings');
      revealSettingsGroup(target);target?.scrollIntoView?.({block:'start'});OW.focus.focus(target?.querySelector('[data-focus]:not(:disabled)'));return;
    }
    const house=link.startsWith('house.');setWorkspace(house?'house':'status',{navigationOnly:true});
    const selector=link==='house.vacuum'?".tile-robotVacuum":link.startsWith('house.climate')?'.tile-thermostat':house?'.tile-lights':'.tile-houseCheck';
    const tile=document.querySelector(selector),target=link==='house.climate.rooms'?tile?.querySelector('.comfort-rooms'):tile;
    OW.focus.focus(target?.querySelector('[data-focus]:not(:disabled)'));target?.scrollIntoView?.({block:'nearest'});
  }
  function act(name,arg,el){const invoke=()=>actImpl(name,arg,el),result=OW.data.contract===3&&el?.nodeType===1?OW.data.client.userGesture(invoke):invoke();if(OW.data.contract===3&&result?.catch)result.catch(()=>toast('House action not confirmed',5000));return result;}
  function actImpl(name, arg, el) {
    const d = OW.data;
    switch (name) {
      case 'demo.line': OW.demo.postSampleLine();return toast('Sample line posted');
      case 'demo.toggle': return OW.demo.enter(!OW.demo.active);
      case 'ws': return setWorkspace(arg);
      case 'ambient': return enterAmbient('manual');
      case 'settings.field': {
        if (A.sheet) closeSheet();
        A.settingsField = arg; openSettings();
        revealSettingsGroup($('settings').querySelector('[data-cfg="' + arg + '"]'));
        const input = $('settings').querySelector('[data-cfg="' + arg + '"]');
        if (input) { input.closest('.set').scrollIntoView?.({block:'center'}); input.focus(); }
        return;
      }
      case 'live.watch': { const live = [OW.space.live].concat(OW.space.liveOthers || []).find(x => x && x.id === arg); if (live?.url) return openWatch(live.url); if (live) return setWorkspace('space'); return; }
      case 'settings': if (A.sheet) closeSheet(); return A.settings ? closeSettings() : openSettings();
      case 'developer.hint': return toast('Hold the version to open Developer', 2000);
      case 'developer.open': A.developer = !A.developer; return renderSettings();
      case 'screens.select': A.screenEdit = arg; return renderSettings();
      case 'screens.set': { const [id,key,value] = JSON.parse(arg); return patchScreen(id,key,value); }
      case 'screens.hint': return toast('Hold to forget this screen',2000);
      case 'screens.forget': return patchScreen(el?.dataset.arg, null, null);
      case 'settings.group': return selectSettingsGroup(arg, true);
      case 'settings.close': return closeSettings();
      case 'theme': {
        const i = THEMES.indexOf(OW.config.get('theme'));
        return OW.config.set('theme', THEMES[(i + 1) % THEMES.length]);
      }
      case 'toast': return toast(arg);
      case 'bg.next': OW.bg.next({ force: true }); return toast('Next image…', 1200);
      case 'liftoff': return runLiftoff();
      case 'screen.off': closeSettings(); return setTimeout(screenOff, 150);
      case 'reload': return OW.host.reload();
      case 'exit': return OW.host.exitToSystemLauncher();
      case 'android.settings': return OW.host.openSystemSettings();
      case 'reboot':
        if (!A.rebootArmed) { A.rebootArmed = true; renderSettings(); setTimeout(() => { A.rebootArmed = false; if (A.settings) renderSettings(); }, 5000); return toast('Press again within 5 s to reboot the panel'); }
        toast('Rebooting panel…'); return OW.host.reboot();
      case 'sim': OW.space.simulate(OW.space.simulating() ? null : 45); return renderSettings();
      case 'edit': { const inp = el.querySelector('input'); if (inp) inp.focus(); return; }
      case 'video.list': case 'video.download': case 'video.remove': OW.wallpaper.video.action(name.split('.')[1],arg).then(()=>{if(A.settings)renderSettings();}); return;
      case 'cfg.set': { const i = arg.indexOf('='); return OW.config.set(arg.slice(0, i), arg.slice(i + 1)); }
      case 'cfg.toggle': return OW.config.set(arg, !OW.config.get(arg));
      case 'cfg.step': {
        const [path, dir] = arg.split(':');
        const list = STEPS[path], cur = +OW.config.get(path);
        let i = list.findIndex((v) => v >= cur); if (i < 0) i = list.length - 1;
        return OW.config.set(path, list[OW.clamp(i + +dir, 0, list.length - 1)]);
      }
      case 'cfg.time': { const [path, dm] = arg.split(':'); return OW.config.set(path, shiftTime(OW.config.get(path), +dm)); }
      case 'scene': {
        const sc = (d.state.scenes || []).find((x) => x.id === arg) || {};
        Promise.resolve(d.call('scene.activate', { id: arg })).catch(error=>{const message=error.reason==='scene_opaque'||/scene_opaque|Run this scene from Home Assistant/.test(error.message||'')?'Run this scene from Home Assistant':error.message||'Scene unavailable';toast(message,5000);});
        // scenes the wall runs itself; Home Assistant scenes go through the provider above
        if (arg === 'morning') return runLiftoff();
        if (arg === 'ambient') return enterAmbient('manual');
        if (arg === 'nextimage') { OW.bg.next({ force: true }); return toast('Next image…', 1200); }
        if (arg === 'goodnight') return setWorkspace('night');
        if (arg === 'goodnight-direct') {
          if (OW.mode !== 'panel') {
            if (OW.data.has('lights') && !OW.data.isDemo('lights')) { OW.data.call('light.all', { on: false }); return toast('Goodnight — lights off'); }
            return toast('Screen-off runs on the wall panel');
          }
          toast(OW.data.has('lights') && !OW.data.isDemo('lights') ? 'Goodnight — lights + screen off in 5 s · tap to cancel' : 'Goodnight — screen off in 5 s · tap to cancel');
          clearTimeout(A.nightTimer);
          // Goodnight = every light and lamp on the lights tile off (Home Assistant), then the panel goes dark
          A.nightTimer = setTimeout(() => { A.nightTimer = null; if (OW.data.has('lights') && !OW.data.isDemo('lights')) OW.data.call('light.all', { on: false }); screenOff(); }, 5000);
          return;
        }
        return;
      }
      case "weather.weatherProvider": return OW.weatherLink.open() || toast('Unable to open forecast', 5000);
      case 'schedule.open': return openSchedule();
      case 'schedule.custom': A.scheduleCustom=!A.scheduleCustom; return renderSchedule();
      case 'schedule.adjust': { const [key,field,delta]=arg.split('|'); return editScheduleTime(key,field,+delta); }
      case 'schedule.time': { const [key,field]=arg.split('|'); return editScheduleTime(key,field); }
      case 'schedule.toggle': { const g=scheduleGroups().find(g=>g.key===arg); if(g)return saveSchedule({days:g.days,field:'enabled',value:!g.enabled}); return; }
      case 'schedule.draft': A.scheduleDraft.value=OW.sleepSchedule.shift(A.scheduleDraft.value,+arg); return renderSchedule();
      case 'schedule.cancel': A.scheduleDraft=null; return renderSchedule();
      case 'schedule.apply': { const d=A.scheduleDraft; return d&&saveSchedule({days:d.days,field:d.field,value:d.value}); }
      case 'schedule.clear': return saveSchedule({field:'override.clear'});
      case 'time.format.shared': return changeSharedTimeFormat(arg);
      case 'time.format.screen': if(['shared',...OW.time.formats].includes(arg))OW.config.set('display.timeFormat',arg); return;
      case 'briefing.hours': return changeBriefingHours(arg);
      case 'brief.goNoGo': OW.config.set('briefing.showGoNoGo',!OW.goNoGoView.enabled());OW.goNoGoView.refresh();if(A.settings)renderSettings();return;
      case 'house-check.link': return openHouseCheckLink(arg);
      case 'house-check.check': return changeHouseCheck('check');
      case 'house-check.dismiss': try{const ids=JSON.parse(arg);if(Array.isArray(ids)&&ids.length&&ids.length<=8)return changeHouseCheck('dismiss',{ids});}catch(_){} return;
      case 'house-check.undo': return changeHouseCheck('undo',{fid:arg});
      case 'house-check.battery': return changeHouseCheck('battery',{delta:Number(arg)});
      case 'house-check.ignore.remove': return changeHouseCheck('ignore',{id:arg,remove:true});
      case 'house-check.ignore.add': return changeHouseCheck('ignore',{id:document.querySelector('[data-fid="house-check-ignore-picker"]')?.value});
      case 'comfort.settings': openSettings(); {const target=document.querySelector('.smart-comfort-settings');revealSettingsGroup(target);target?.scrollIntoView({block:'start'});OW.focus.focus(target?.querySelector('[data-focus]:not(:disabled)'));} return;
      case 'comfort.why': A.comfortWhy=!A.comfortWhy;OW.views.update('comfort');if(A.settings)renderSettings();return;
      case 'comfort.replan': return changeHouse(name,{});
      case 'comfort.proposal': try{return changeHouse(name,JSON.parse(arg));}catch(_){return toast('Suggestion is unavailable');}
      case 'comfort.setting': try{return changeHouse(name,JSON.parse(arg));}catch(_){return toast('Comfort setting is unavailable');}
      case 'comfort.action': return changeHouse(name,{kind:arg},!!A.shutdownComfort);
      case 'comfort.sleep': return endShutdown();
      case 'vacuum.action': try{return changeHouse(name,JSON.parse(arg));}catch(_){return toast('Robot vacuum action is unavailable');}
      case 'speaker.open': setWorkspace('house',{navigationOnly:true});return d.call('speaker.open',{id:arg});
      case 'vacuum.open': setWorkspace('house');OW.focus.focus(document.querySelector('[data-fid="vacuum-start"]'));return;
      case 'climate.open': {
        setWorkspace('house');
        if (OW.focus.kb) OW.focus.focus(arg==='fresh_air'?document.querySelector('[data-fid="comfort-fresh_air"]'):document.querySelector('[data-fid="climate-mode-'+(OW.data.state.smartComfort?.state==='auto'?'auto':OW.data.state.climate?.mode||'off')+'"]'));
        return;
      }
      case 'weather.attribution': return OW.rainNowcast.openAttribution(arg) || toast('Unable to open Apple Weather attribution');
      case 'climate.comfort': return changeClimate('climate.comfort.enabled',{enabled:arg==='1'});
      case 'climate.mode': return changeClimate(name,{mode:arg});
      case 'climate.step': return changeClimate(name,{delta:+arg});
      case 'climate.routine': {const [period,kind,value]=arg.split(':');return changeClimate('climate.'+period+'.'+kind,kind==='enabled'?{enabled:value==='1'}:{delta:+value});}
      case 'calendar.permission': return OW.host.requestCalendarPermission();
      case 'watch': return openWatch(arg);
      case 'watch.force': return openWatch(arg, true);
      case 'watch.close': return closeWatch();
      case 'cam.live': return A.camLive && A.camLive.id === arg ? stopCamLive() : startCamLive(arg);
      case 'cam.open': $('popup').hidden = true; setWorkspace('house'); return arg ? startCamLive(arg) : null;
      case 'track': { const on = OW.space.track(arg); const l = OW.space.launches.find((x) => 'l' + x.id === arg); return toast(on ? 'Tracking ' + (l ? l.rocket + ' · ' + l.mission : 'mission') : 'Back to automatic'); }
      case 'cfg.list': { const inp = el.querySelector('input'); if (inp) inp.focus(); return; }
      case 'sleep.open': return setWorkspace('night');
      case 'sleep.close': case 'sheet.close': return closeSheet();
      case 'sleep.step': return sleepEdit('step', arg);
      case 'sleep.preset': return sleepEdit('preset', arg);
      case 'sleep.day': sleepEdit('day', arg); if (A.ws !== 'night') setWorkspace('night'); return;
      case 'night.wake': return wakeNow();
      case 'night.look': OW.config.set('sleep.look', arg === 'toggle' ? (nightLook() === 'clock' ? 'black' : 'clock') : arg); OW.views.update('sleep'); if (A.night && A.night.overlay) { renderNightOverlay(); touchNight(); } return;
      case 'night.adj': { const k = arg.split(':'); return nightAdj(k[0], +k[1] || 0, true); }
      case 'night.preview': return enterNight({ preview: true });
      case 'seq.preview': return runSequence(OW.nowMs() + 45000, { dur: 45, preview: true });
      case 'brief.snooze': return snooze();
      case 'brief.dismiss': return A.briefAlarm && alarmActive() ? alarmControl('up') : endBriefing();
      case 'brief.open': return A.openBriefing();
      case 'brief.ai': endBriefing(); return setWorkspace('status');
      case 'due.show': return showDue(arg);
      case 'launch.select': return selectLaunch(arg);
      case 'crew.show': return showCrew();
      case 'home.edit': if (A.settings) closeSettings(); return openArrange(el && el.dataset ? el.dataset.tile : null);
      case 'home.move': { const k = arg.split(':'); return arrange('move', k[0], +k[1]); }
      case 'home.hide': return arrange('hide', arg);
      case 'home.reset': return arrange('reset');
      case 'sleep.dayon': return sleepEdit('dayon', arg);
      case 'sleep.master': return sleepEdit('master', arg);
      case 'sleep.sound': return sleepEdit('sound', arg);
      case 'sleep.vol': return sleepEdit('vol', arg);
      case 'back_to_bed': {const p=d.call('back_to_bed',{});if(p?.catch)p.catch(()=>toast('House action not confirmed'));return;}
      case 'sleep.go': return goodnight();
      case 'sleep.once': return sleepEdit('once',arg);
      case 'sleep.crew': {const M=OW.views.sleepModel(), day=arg.split(':')[0],crew=arg.split(':')[1];return d.call('alarm.crew',{day,crew});}
      case 'sleep.upby': return sleepEdit('upby',arg);
      case 'alarm.cap': return d.call('alarm.max',{value:OW.clamp((OW.views.sleepModel().alarmMax??22)+(+arg),0,100)});
      case 'sleep.unmute': return d.call('sleep.unmute',{});
      case 'alarm.hold':
      case 'alarm.snooze': return snooze();
      case 'alarm.scrub': return alarmControl('scrub');
      case 'alarm.dismiss':
      case 'alarm.up': return alarmControl('up');
      case 'alarm.advance': return advanceAlarm(false);
      case 'alarm.now': return advanceAlarm(true);
      case 'alarm.hint': return toast('Hold for 1.2 seconds',1500);
      case 'alarm.test': d.call('alarm.test'); return toast('Launch alarm test started');
      case 'atv.launch': {
        // open the app on this room's Apple TV (Home Assistant) and put the televisionAdapter on its HDMI input right away
        const h = d.state.handoff;
        if (h && d.provider.svc) {
          if (h.asleep) d.provider.svc('media_player', 'turn_on', h.id);
          d.provider.svc('media_player', 'select_source', h.id, { source: arg });
        }
        return act('tv.back');
      }
      case 'tv.input.go': { const ok = (OW.demo?.active ? null : window.flightdayNative) && (OW.demo?.active ? null : window.flightdayNative).switchInput ? (OW.demo?.active ? null : window.flightdayNative).switchInput(arg) : false; return ok ? null : toast('Could not switch to that input'); }
      case 'tv.launch': { const [pkg, cls] = String(arg).split('|'); const ok = (OW.demo?.active ? null : window.flightdayNative) && (OW.demo?.active ? null : window.flightdayNative).launchApp ? (OW.demo?.active ? null : window.flightdayNative).launchApp(pkg, cls || '') : false; return ok ? null : toast('Could not open that app'); }
      case 'tv.back': {
        const ok = (OW.demo?.active ? null : window.flightdayNative) && (OW.demo?.active ? null : window.flightdayNative).switchInput ? (OW.demo?.active ? null : window.flightdayNative).switchInput(OW.config.get('tv.appleTvInput') || '') : false;
        return ok ? null : toast(OW.isTV ? 'No HDMI input found for the Apple TV' : 'Back to Apple TV works on the TV');
      }
      case 'tv.resume': { const h = d.state.handoff; if (h && d.provider.svc) d.provider.svc('media_player', 'media_play', h.id); return act('tv.back'); }
      case 'light.all': return d.call(name, { on: arg === '1' });
      case 'media.volume': return d.call(name, { delta: +arg });
      case 'screensaver.set': return d.call(name, { key: arg });
      case "audioAdapter.play": if(d.contract===3)return Promise.resolve(d.call(name,{id:arg})).then(()=>toast('Playing '+(el?.dataset.name||'favourite')));d.call(name, { id: arg, name: el.dataset.name || arg }); return toast('Playing ' + (el.dataset.name || arg));
      case 'machine.wake': d.call(name, { id: arg }); return toast('Wake-on-LAN (demo)');
      default: return d.call(name, { id: arg });
    }
  }

  function fire(el) {
    const target = el.closest('[data-act]');
    if (!target) return;
    target.classList.remove('tap'); void target.offsetWidth; target.classList.add('tap');
    act(target.dataset.act, target.dataset.arg, target);
  }

  // =================================================================================
  // input
  // =================================================================================
  let holdTimer = null, held = false, swallowClick = false, alarmPress = null;
  function cancelAlarmHold() { clearTimeout(holdTimer);holdTimer=null;document.querySelectorAll('.holding').forEach(el=>el.classList.remove('holding')); }
  function alarmKey(e) {
    if(!alarmActive())return false;
    const key=e.key;
    if(['AudioVolumeUp','AudioVolumeDown','AudioVolumeMute'].includes(key))return false;
    e.preventDefault();e.stopPropagation();
    if(e.repeat)return true;
    if(['Home','BrowserHome'].includes(key)){showAlarmControls();return true;}
    if(['Escape','Backspace','BrowserBack'].includes(key)){back();return true;}
    if(key==='MediaPlayPause'){if(A.alarm.state!=='snoozed')snooze();return true;}
    if($('alarmControls').hidden && !(A.brief && A.briefAlarm)){showAlarmControls();return true;}
    if((key==='ArrowRight'||key==='MediaFastForward')&&A.alarm.state==='countdown'){advanceAlarm(false);return true;}
    if(key.startsWith('Arrow')){OW.focus.setKb(true);const list=OW.focus.candidates(),i=list.indexOf(OW.focus.current()),delta=key==='ArrowLeft'||key==='ArrowUp'?-1:1;OW.focus.focus(list[OW.clamp(i+delta,0,list.length-1)]);return true;}
    if(key==='Enter'||key===' '){
      const el=OW.focus.current();if(!el){OW.focus.enter();return true;}
      alarmPress={el,at:Date.now()};held=false;el.dataset.holdLabel=A.alarm.state==='ringing'?'I’m up':'Scrub';el.querySelector('.hold-label').textContent='Hold — '+el.dataset.holdLabel;el.classList.add('holding');
      holdTimer=setTimeout(()=>{held=true;el.classList.remove('holding');alarmControl(A.alarm.state==='ringing'?'up':'scrub');},1200);
    }
    return true;
  }


  function wakeIfNeeded(e) {
    if(alarmActive()){if($('alarmControls').hidden && !(A.brief && A.briefAlarm)){showAlarmControls();e.preventDefault();e.stopPropagation();return true;}return false;}
    if (A.shutdown && !A.shutdownComfort) { endShutdown(); e.preventDefault(); e.stopPropagation(); return true; }
    // night: the first touch only brings up the dim controls; after that taps reach them
    if (A.night) { if (!A.night.overlay) { showNightOverlay(true); e.preventDefault(); e.stopPropagation(); return true; } touchNight(); return false; }
    if (A.blackout) { setBlackout(false); e.preventDefault(); e.stopPropagation(); return true; }
    if (A.brief) return false;                      // the briefing has its own buttons
    if (A.seq || A.snoozedUntil) return false; // arrows and OK reach the alarm controls
    if (A.liftoff) { endLiftoff(); e.preventDefault(); return true; }
    if (A.ambient && e.target?.closest?.('[data-act="weather.attribution"]'))return false;
    const ambientLaunch = A.ambient && e.target?.closest?.('[data-ambient-launch]');
    if (ambientLaunch && !ambientLaunch.disabled) {
      const launch = OW.space.launches.find(l => String(l.id) === ambientLaunch.dataset.ambientLaunch) || OW.space.focus;
      if (launch) { exitAmbient(); openDirector(launch); e.preventDefault(); e.stopPropagation(); return true; }
    }
    if (A.ambient && !OW.isDream) {
      exitAmbient(); e.preventDefault(); e.stopPropagation();
      if (A.ambientWhy === 'manual' || true) setWorkspace(A.ws, { keepFocus: !OW.focus.kb });
      return true;
    }
    return false;
  }

  function onKey(e) {
    if (OW.isDream) return;
    resetIdle();
    const key = e.key;
    const typing = e.target && e.target.tagName === 'INPUT';
    if (typing) return;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return;
    if (alarmKey(e)) return;
    if (A.night) { e.preventDefault(); e.stopPropagation(); nightKey(key); return; }
    if (key === 'MediaPlayPause' && OW.isTV && !A.settings && !A.sheet) { e.preventDefault(); return toggleAmbient(); }
    if (wakeIfNeeded(e)) { OW.focus.setKb(true); return; }
    if (settingsKey(e)) return;
    const arrows = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (arrows[key]) {
      e.preventDefault();
      const first = !OW.focus.kb;
      OW.focus.setKb(true);
      if (first && !OW.focus.current()) OW.focus.enter(true); else OW.focus.move(arrows[key]);
      return;
    }
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      OW.focus.setKb(true);
      const cur = OW.focus.current();
      if (!cur) return OW.focus.enter(true);
      if (cur.dataset.hold) {
        held = false;
        holdTimer = setTimeout(() => { held = true; act(cur.dataset.hold, null, cur); }, +cur.dataset.holdMs || 700);
      } else fire(cur);
      return;
    }
    if ((A.seq || A.briefAlarm || A.snoozedUntil) && !['Escape', 'Backspace', 'BrowserBack'].includes(key)) return;
    if (/^[1-5]$/.test(key) && !A.settings && !A.sheet) { e.preventDefault(); const a = areas()[+key - 1]; return a ? setWorkspace(a[0]) : null; }
    if (key === 'Escape' || key === 'Backspace' || key === 'BrowserBack') { e.preventDefault(); return back(); }
    if (key === 'ContextMenu' || key === 'm' || key === 'F1') { e.preventDefault(); return menuKey(); }
    if (A.settings || A.sheet) return;
    if (key === 'f') return measureFps();
    if (key === 'g') return setWorkspace('night');
    if (key === 'p') return runShutdown();   // preview the power-down sequence (no Home Assistant calls)
    if (key === 't') return act('theme');
    if (key === 'a') return enterAmbient('manual');
    if (key === 'l') return runLiftoff();
    if (key === 'b') return act('bg.next');
    if (key === 'PageDown') return stepWorkspace(1);
    if (key === 'PageUp') return stepWorkspace(-1);
  }
  function onKeyUp(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if(alarmPress){const p=alarmPress;alarmPress=null;cancelAlarmHold();e.preventDefault();if(!held&&Date.now()-p.at<350)fire(p.el);return;}
    if (holdTimer) {
      clearTimeout(holdTimer); holdTimer = null;
      const cur = OW.focus.current();
      if (!held && cur) fire(cur);
    }
  }
  function back() {
    if(alarmActive()){if(A.alarm.state==='snoozed')return hideAlarmControls();return snooze();}
    if(A.shutdownComfort)return endShutdown();
    if (A.watch) return closeWatch();
    if (A.night) return A.night.overlay ? hideNightOverlay() : showNightOverlay(true);
    if (A.brief) return endBriefing();
    if (A.sheet) return closeSheet();
    if (A.settings) return closeSettings();
    if (A.ambient) return exitAmbient();
    if (A.ws !== 'home') return setWorkspace('home');
    if (OW.isTV) OW.host.exit();   // no-op when Flight Day is the TV's home screen
  }

  function bindInput() {
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);

    stage.addEventListener('pointerdown', (e) => {
      swallowClick = false;   // a long-press does not always produce a click to swallow; never eat the next tap
      resetIdle();
      if (A.nightTimer && !e.target.closest('[data-arg="goodnight"]')) { clearTimeout(A.nightTimer); A.nightTimer = null; toast('Goodnight cancelled', 1400); }
      OW.focus.setKb(false);
      if (wakeIfNeeded(e)) { swallowClick = true; return; }
      const hold = e.target.closest('[data-hold]');
      if (hold) {
        held = false;
        clearTimeout(holdTimer);
        const holdLabel=hold.querySelector('.hold-label');if(holdLabel)holdLabel.textContent=hold.dataset.hold==='alarm.scrub'?'Hold — Scrub':'Hold — I’m up';
        hold.classList.add('holding');
        holdTimer = setTimeout(() => { held = true; swallowClick = true; hold.classList.remove('holding'); act(hold.dataset.hold, null, hold); }, +hold.dataset.holdMs || 700);
      }
    }, true);
    const cancelHold = cancelAlarmHold;
    window.addEventListener('blur',()=>{alarmPress=null;cancelAlarmHold();});
    stage.addEventListener('pointerup', cancelHold, true);
    stage.addEventListener('pointercancel', cancelHold, true);
    stage.addEventListener('pointermove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 12) cancelHold(); }, true);

    stage.addEventListener('click', (e) => {
      if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
      if (e.target.tagName === 'INPUT') return;
      const modal = e.target.closest('.modal');
      if (modal && !e.target.closest('.modal-win')) { closeSheet(); return closeSettings(); }
      const el = e.target.closest('[data-act]');
      if (el) fire(el);
    });
    // a tap must not leave a focus ring behind
    stage.addEventListener('pointerup', () => { if (!OW.focus.kb && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.blur) document.activeElement.blur(); });
  }

  // =================================================================================
  // per-second tick: clocks, countdowns, progress, ISS
  // =================================================================================
  function cdText(style, t, now) {
    switch (style) {
      case 'tminus': return fmt.count(t - now);
      case 'alarm': return fmt.count(t - now, true);
      case 'elapsed': return fmt.elapsed(now - t);
      case 'ago': return fmt.ago(t);
      case 'since': return fmt.span(now - t);
      case 'left': { const sec = Math.max(0, Math.ceil((t - now) / 1000)); return Math.floor(sec / 60) + ':' + fmt.pad(sec % 60); }
      default: return t - now < 45000 && t - now > -60000 ? 'now' : fmt.span(t - now);
    }
  }
  let lastMinute = -1, lastTrack = 0, lastNews = 0;

  function tick(force) {
    const nowD = OW.now(), now = alarmActive() ? W.now() : nowD.getTime();
    OW.goNoGoView?.refresh();
    document.querySelectorAll('[data-countdown]').forEach(el=>{const line=OW.time.countdownText(nowD,el.closest('.brief')?'briefing':'night');el.hidden=!line;if(el.textContent!==line)el.textContent=line;});
    // minute boundary: agenda states move on, ambient drifts, tiles that show absolute times refresh
    const minute = nowD.getMinutes();
    if (minute !== lastMinute) {
      const first = lastMinute === -1;
      lastMinute = minute;
      if(alarmActive()){renderAlarmBar();if(A.brief)renderBriefing();}
      if (!first) {
        ['hero', 'today'].forEach(OW.views.renderTile);
        if (A.ambient) {
          renderAmbient();
          const m = $('ambMain');
          if (m) m.style.transform = 'translate(' + ((Math.random() - 0.5) * 1.2).toFixed(2) + 'cqw,' + ((Math.random() - 0.5) * 1.0).toFixed(2) + 'cqw)';
        }
        if (minute % 5 === 0) ['launches', 'spaceEvents', 'news', 'crew', 'camEvents'].forEach(OW.views.renderTile);
      }
    }
    const scope = A.ambient ? [$('ambient')] : A.watch ? [$('watch')] : [$('bar'), $('live'), document.querySelector('.view.on'), A.liftoff || A.seq || A.brief ? $('liftoff') : null, A.night ? $('softoff') : null, A.settings ? $('settings') : null, !$('alarmControls').hidden ? $('alarmControls') : null];
    const hm = fmt.hm(nowD);
    scope.forEach((root) => {
      if (!root) return;
      root.querySelectorAll('[data-clock]').forEach((el) => {
        const k = el.dataset.clock;
        const v = k === 'hm' ? hm : k === 'date' ? fmt.dateLong(nowD) : k === 'dateshort' ? fmt.dateBar(nowD) : k === 'bar' ? fmt.dateBar(nowD) + ' · ' + hm : OW.time.text(nowD,{seconds:true});
        if (el.textContent !== v) el.textContent = v;
      });
      root.querySelectorAll('[data-cd]').forEach((el) => {
        const v = cdText(el.dataset.cdStyle, +el.dataset.cd, now);
        if (el.textContent !== v) el.textContent = v;
      });
    });

    if (!A.ambient) {
      const view = document.querySelector('.view.on');
      if (view && A.ws === 'home') {
        const np = OW.data.state.nowPlaying || { durationSec: 1 }, pos = OW.data.position(np);
        const p = view.querySelector('[data-progress="np"]');
        if (p) p.style.transform = 'scaleX(' + OW.clamp(pos / (np.durationSec || 1), 0, 1).toFixed(4) + ')';
        const pt = view.querySelector('[data-pos="np"]');
        if (pt) { const s = Math.floor(pos); pt.textContent = Math.floor(s / 60) + ':' + fmt.pad(s % 60); }
        const dp = view.querySelector('[data-daypos]');
        if (dp) {
          const d0 = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate(), 6).getTime();
          dp.style.left = OW.clamp(((now - d0) / (18 * 3600000)) * 100, 0, 100).toFixed(2) + '%';
        }
      }
      if (view && A.ws === 'space') tickIss(view, force);
    }

    if (now - lastNews > 12000) { lastNews = now; newsIndex++; if (!A.ambient) renderFeed(); }
  }
  A.tick = tick;

  function tickIss(view, force) {
    const S = OW.space, p = S.issAt(Date.now());
    const set = (k, v) => view.querySelectorAll('[data-iss="' + k + '"]').forEach((el) => { if (el.textContent !== v) el.textContent = v; });
    if (!p) return;
    const ll = Math.abs(p.lat).toFixed(1) + '°' + (p.lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(p.lon).toFixed(1) + '°' + (p.lon >= 0 ? 'E' : 'W');
    const over = S.issOverhead(), pass = S.pass;
    set('where', ll + ' · ' + Math.round(p.alt) + ' km');
    set('pass', over && over.overhead ? 'overhead now' : pass ? 'pass ' + fmt.when(pass.start) : '');
    if (A.ws !== 'space') return;
    set('lat', Math.abs(p.lat).toFixed(2) + '°' + (p.lat >= 0 ? 'N' : 'S'));
    set('lon', Math.abs(p.lon).toFixed(2) + '°' + (p.lon >= 0 ? 'E' : 'W'));
    set('alt', Math.round(p.alt) + ' km');
    set('vel', p.vel ? Math.round(p.vel).toLocaleString('en-US') + ' km/h' : '–');
    set('meta', (S.stale.iss ? 'predicted' : 'live') + ' · fix ' + fmt.ago(S.updated.iss || Date.now()));
    const dotEl = view.querySelector('#issDot');
    if (dotEl) dotEl.setAttribute('transform', 'translate(' + (p.lon + 180).toFixed(3) + ' ' + (90 - p.lat).toFixed(3) + ')');
    const box = view.querySelector('[data-iss="passbox"]');
    if (box) {
      let html;
      if (over && over.overhead) html = '<b class="' + (over.visible ? 'ok' : '') + '">' + (over.visible ? 'Visible overhead now' : 'Overhead now') + '</b><span>elevation ' + over.el + '°' + (over.visible ? ' · look up!' : '') + '</span>';
      else if (pass) html = '<b>' + (pass.visible ? 'Visible pass ' : 'Next pass ') + fmt.when(pass.start) + '</b><span>max ' + pass.maxEl + '° · ' + Math.max(1, Math.round((pass.end - pass.start) / 60000)) + ' min' + (pass.visible ? '' : pass.dark === false ? ' · daylight' : ' · in shadow') + '</span>';
      else if (typeof OW.config.get('home.lat') !== 'number') html = '<b>Home location not set</b><span>add lat/lon in settings for pass alerts</span>';
      else html = '<b>No pass in the next 24 h</b><span></span>';
      if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; box.classList.toggle('alert', !!(over && over.overhead)); }
    }
    if (force || Date.now() - lastTrack > 30000) {
      lastTrack = Date.now();
      const path = (segs) => segs.map((seg) => '<polyline points="' + seg.map((q) => (q[0] + 180).toFixed(2) + ',' + (90 - q[1]).toFixed(2)).join(' ') + '"/>').join('');
      const past = view.querySelector('#issPast'), fut = view.querySelector('#issFuture');
      if (past) past.innerHTML = path(S.issTrack(-46, 0, 60));
      if (fut) fut.innerHTML = path(S.issTrack(0, 93, 60));
    }
  }

  // =================================================================================
  // boot
  // =================================================================================
  function boot() {
    stage = $('stage');
    stage.classList.add('mode-' + OW.mode);
    applyTheme();

    // native host additions used by the root features (no-ops in a browser)
    const N = (OW.demo?.active ? null : window.flightdayNative);
    OW.host.blackout = (on) => { try { if (N && N.blackout) N.blackout(!!on); } catch (e) { /* ignore */ } };
    OW.host.requestPanelStats = () => { try { if (N && N.requestPanelStats) N.requestPanelStats(); } catch (e) { /* ignore */ } };
    OW.host.reboot = () => { try { if (N && N.reboot) N.reboot(); } catch (e) { /* ignore */ } };

    OW.data.start();
    loadTvList();
    OW.views.build();
    renderBarCenter();
    renderBar();

    OW.data.on((topic, payload) => {
      if(topic==='screen-prefs'||topic==='client')pullPrefs();if(topic==='client'&&A.ws==='house')openHouseCards();
      OW.views.update(topic);
      if (OW.isTV && topic === 'all') {
        // the Apple TV woke up while the wall was showing: hand the screen back
        // snappy handoff: the Apple TV started playing, or was woken with the Siri remote
        const h = OW.data.state.handoff, active = !!(h && h.active), awake = !!(h && !h.asleep);
        if (h && OW.config.get('tv.autoReturn') !== false && !A.night && !A.seq && !A.brief && !A.snoozedUntil && !A.shutdown && ((active && A.atvWasActive === false) || (awake && A.atvWasAwake === false))) act('tv.back');
        if (h) { A.atvWasActive = active; A.atvWasAwake = awake; }
        loadTvList();
      }
      if (topic === 'status' && A.settings) renderSettings();
      if (topic === 'wall-event') { onWallEvent(payload); return; }
      if (A.brief && ['weather','events','all','comfort','status','model'].includes(topic)) renderBriefing();
      if (topic === 'all') {
        if(A.lastTimeFormat!==OW.time.mode())refreshTimeFormat();
        followLaunchState();
        scheduleBriefing();
        if (A.scheduleOpen) renderSchedule();
        if (A.settings) renderSettings();
      }
      if (['all', 'media', 'weather', 'status'].includes(topic)) renderBarRight();
      if (topic === 'all' || topic === 'status') { layoutBlur(); renderFeed(); }
      if (A.ambient && ['all', 'events', 'weather'].includes(topic)) renderAmbient();
    });
    OW.usage.on(() => { OW.views.update('usage'); renderBarRight(); });
    OW.space.on((topic, p) => {
      if (topic === 'iss') { tick(true); return; }
      if (topic === 'pin-error') { toast('Track: ' + p); return; }
      if (topic === 'visible-alert') {
        // a launch you can see from home: wake the wall and say where to look
        if (OW.isDream) return;
        if (A.blackout && p.minutes <= 5) setBlackout(false);
        if (A.ambient && !OW.isTV) exitAmbient();
        return toast(p.launch.rocket + ' · T-' + p.minutes + ' min · visible from home — ' + p.text, 20000);
      }
      OW.views.update(topic);
      if (topic === 'launches' || topic === 'events' || topic === 'live-start') { renderLive(); renderBarRight(); if (A.ambient) renderAmbient(); }
      if (topic === 'news') renderFeed();
      if (topic === 'live-start' && !OW.isDream) toast('LIVE · ' + OW.space.live.title, 5000);
    });
    OW.bg.on(() => { renderFeed(); OW.views.update('bg'); if (A.ambient) renderAmbient(); });
    OW.config.on((path, value) => {
      if (path === 'display.timeFormat') refreshTimeFormat();
      if (path === 'theme') { applyTheme(); renderBarRight(); layoutBlur(); const item = OW.bgBundled.find((b) => (b.themes || [b.theme]).includes(value)); if (item) OW.bg.next({ item, why: "flightday", force: true }); }
      if (!OW.screenCredentials?.writing && (path === 'provider' || (OW.standalone?.allowed()&&path.startsWith('standalone.')) || path.startsWith('ha.') || path === 'house' || path === 'demo')) { clearTimeout(A.dataRestart); A.dataRestart = setTimeout(() => { OW.data.start(); if (A.panel && OW.data.provider.panelStats) OW.data.provider.panelStats(A.panel); }, 250); }
      if (path === 'units' || path.startsWith('home.')) { if (OW.data.provider && OW.data.provider.loadWeather) OW.data.provider.loadWeather(); }
      if (path.startsWith('schedule.')) { OW.host.setSchedule(OW.config.get('schedule')); OW.views.update('schedule'); }
      if (path === 'brightness') OW.host.setBrightness(value);
      if (path === 'ambient.idleMin') resetIdle();
      if (path.startsWith('launch.')) { OW.space.derive(); if (path === 'launch.api') { OW.space.refresh('launches'); OW.space.refresh('events'); } OW.views.update('launches'); renderLive(); }
      if (path.startsWith('home.')) { OW.views.update('home'); OW.views.update('launches'); tick(true); }
      if (A.settings) renderSettings();
    });

    OW.onNative((name, payload) => {
      if (name === 'back') back();
      else if (name === 'menu') menuKey();
      else if (name === 'launch') { if (!OW.data.status.connected && OW.model.screen()?.alarm && !A.seq && !alarmSuppressed() && OW.nowMs() - (A.lastWake || 0) > 15 * 60000) wakeUp(); }
      else if (name === 'lux') onLux(+payload);
      else if (name === 'audio-error') {
        OW.host.log('night audio: ' + (payload && payload.error));
        const ns = A.nightSound;
        if (ns && payload && payload.url === ns.url) {
          ns.error = payload.error; ns.tries = (ns.tries || 0) + 1;
          // try again (5 s, 10 s, … up to a minute apart) for as long as it is night
          clearTimeout(A.audioRetry);
          A.audioRetry = setTimeout(() => { if (A.night && A.nightSound === ns && !A.seq) { const t = ns.tries; nightAudio(ns.name, ns.url); if (A.nightSound) A.nightSound.tries = t; } }, Math.min(60000, 5000 * ns.tries));
        }
        if (A.night && A.night.overlay) renderNightOverlay();
      }
      else if (name === 'audio-playing') { if (A.nightSound && payload && payload.url === A.nightSound.url) { A.nightSound.error = null; A.nightSound.tries = 0; } }
      else if (name === 'home' && alarmActive()) showAlarmControls();
      else if (name === 'fast-forward') advanceAlarm(false);
      else if (name === 'play-pause' && alarmActive()) snooze();
      else if (name === 'play-pause' && OW.isTV && !A.night) toggleAmbient();
      else if (name === 'home' && A.night) showNightOverlay(true);
      else if (name === 'home' && (A.seq || A.snoozedUntil || A.briefAlarm)) { OW.focus.enter(); }
      else if (name === 'home') { if (A.brief) endBriefing(); if (A.seq) endSequence(); if (A.sheet) closeSheet(); if (A.blackout) setBlackout(false); if (A.settings) closeSettings(); if (A.ambient) exitAmbient(true); setWorkspace('home'); focusBack(); }
      else if (name === 'ws-next') { if(!alarmActive())stepWorkspace(1); }
      else if (name === 'ws-prev') stepWorkspace(-1);
      else if (name === 'resume') { tick(true); resetIdle(); importConfig(); loadTvList(); if (A.ws === 'home' && !A.settings && !A.ambient && !A.night && !A.seq && !A.snoozedUntil && !A.brief) focusBack(); setTimeout(nightCheck, 2500); }
      else if (name === 'screen-off') { if (A.settings) closeSettings(); screenOff(); }
      else if (name === 'wake') { if (A.blackout) { A.blackout = false; document.getElementById('softoff').hidden = true; resetIdle(); } }
      else if (name === 'panel-stats') {
        A.panel = payload;
        if (OW.data.provider && OW.data.provider.panelStats) OW.data.provider.panelStats(payload);
        if (A.settings) renderSettings();
      }
      else if (name === 'permissions') { if (OW.data.provider && OW.data.provider.loadCalendar) OW.data.provider.loadCalendar(); }
      else if (name === 'config') importConfig();
    });

    if (OW.mode === 'panel') nat('blackout', false);          // a start is never dark
    nat('nightAudio', 'stop', JSON.stringify({ fadeMs: 600 }));   // nor does a reload leave last night's sound running
    nat('nightDim', false);
    setTimeout(() => { if (!A.night) pictureOff(false); }, 4000);   // a reload or a crash in the night must not leave a televisionAdapter in Picture off
    setInterval(() => OW.views.refreshStale(), 60000);
    if (OW.hub) { OW.hub.on((topic) => { if (topic === 'prefs') pullPrefs(); if (topic === 'ai_brief' || topic === 'up') loadAi(true); if (topic === 'sleep' || topic === 'up') loadSleep(true); }); OW.hub.start(); setTimeout(() => loadAi(true), 6000); setTimeout(() => loadSleep(true), 7000); }
    if(OW.model.builder())OW.usage.start();
    OW.space.start();
    OW.bg.start();
    bindInput();

    if (OW.isDream) {
      // screensaver: ambient view only, no interaction
      A.ambient = true;
      stage.classList.add('amb-on');
      $('ambient').hidden = false;
      renderAmbient();
    } else {
      setWorkspace(OW.params.get('ws') || 'home', { keepFocus: true });
      if (OW.isTV || OW.params.get('kb')) { OW.focus.setKb(true); OW.focus.enter(true); focusBack(); }
      if (OW.params.get('launch')) setTimeout(runLiftoff, 700);
      if (OW.params.get('seq')) { const sec = +OW.params.get('seq') || 600; setTimeout(() => runSequence(OW.nowMs() + sec * 1000, { dur: +OW.params.get('dur') || 600, preview: true }), 1500); }
      if (OW.params.get('brief')) setTimeout(OW.params.get('brief') === 'open' ? A.openBriefing : wakeUp, OW.params.get('brief') === 'open' ? 9000 : 1500);
      if (OW.params.get('arrange')) setTimeout(() => openArrange('sleep'), 1500);
      if (OW.params.get('amode')) A.debugAmbMode = OW.params.get('amode');
      if (OW.params.get('lookup')) setTimeout(() => { OW.space.lookTest(true); if (A.ambient) renderAmbient(); }, 6000);
      if (/^[A-Za-z0-9_-]{6,20}$/.test(OW.params.get('stream') || '')) A.debugStream = OW.params.get('stream');
      if (OW.params.get('fd')) setTimeout(() => { const l = OW.space.launches.filter((x) => x.net > OW.nowMs() && x.precise)[+OW.params.get('fd') - 1 || 0]; if (l) openDirector(l); }, 9000);
      if (OW.params.get('globe') === '2d') { OW.globe.mode = '2d'; OW.views.renderTile('globe'); }
      if (OW.params.get('night')) setTimeout(() => enterNight(OW.params.get('night') === 'real' ? {} : { preview: true }), 1500);
      if (OW.params.get('alarmIn')) { A.debugAlarmAt = OW.nowMs() + (+OW.params.get('alarmIn')) * 1000 + 600000; A.debugDur = +OW.params.get('dur') || 600; if (A.debugDur < 600) A.debugAlarmAt = OW.nowMs() + (+OW.params.get('alarmIn')) * 1000 + A.debugDur * 1000; }
      if (OW.params.get('ambient')) setTimeout(() => enterAmbient('manual'), 400);
      if (OW.params.get('settings')) setTimeout(openSettings, 400);
      
      const retained=OW.store.get('wakeState',null);
      if(retained && Date.parse(retained.launch_at)>W.now()-12*3600000) {
        A.cachedAlarmTimer=setTimeout(()=>{if(!OW.data.status.connected&&!A.alarm)applyAlarmState({...retained,offline:true});},5000);
      }
      resetIdle();
      // keep the native schedule in sync with what the UI shows
      OW.host.setSchedule(OW.config.get('schedule'));
      if (OW.host.available && OW.mode === 'panel') { OW.host.requestPanelStats(); setInterval(() => OW.host.requestPanelStats(), 30000); }
    }

    renderFeed();
    renderLive();
    tick(true);
    setInterval(tick, 1000);
    importConfig();
    window.addEventListener('resize', () => { layoutBlur(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutBlur);
    requestAnimationFrame(() => { layoutBlur(); stage.classList.remove('booting'); });

    // a still or live frame that fails to load just reveals the placeholder underneath
    stage.addEventListener('error', (e) => {
      const im = e.target;
      if(im?.hasAttribute?.('data-vacuum-map')){im.hidden=true;const caption=im.parentElement.querySelector('figcaption');if(caption)caption.textContent='Map unavailable · waiting for the next update';}
      if (im && im.classList && im.classList.contains('cam-img')) im.style.display = 'none';
    }, true);
    // someone at the door: a card on every workspace for 20 s
    OW.data.on((topic, e) => {
      if (topic !== 'person' || OW.isDream) return;
      const cam = (OW.data.state.cameras || []).find((c) => e.id.indexOf(c.id.split('.')[1]) >= 0);
      const pop = $('popup');
      const bell = /doorbell|ring/i.test(e.id);
      // snapshot first (the last-event still) — live only if the popup is tapped
      pop.innerHTML = '<button class="pop-in" data-focus data-fid="popup" data-act="cam.open" data-arg="' + esc(cam ? cam.id : '') + '">' + (cam && cam.still ? '<img src="' + esc(cam.still) + (cam.still.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now() + '" alt="">' : '') +
        '<div><em>' + (bell ? 'doorbell' : 'person detected') + '</em><b>' + esc(e.where || (cam && cam.name) || 'Camera') + '</b><span>' + fmt.hm(e.at) + ' · last-event image' + '</span></div></button>';
      pop.hidden = false;
      if (A.ambient && !OW.isTV) exitAmbient();
      clearTimeout(A.popTimer);
      A.popTimer = setTimeout(() => { pop.hidden = true; }, 20000);
    });

    // burn-in care: every few minutes the static chrome drifts by a few pixels (never the same spot for hours)
    let shiftStep = 0;
    setInterval(() => {
      const steps = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const [x, y] = OW.reduceMotion() ? [0, 0] : steps[++shiftStep % steps.length];
      stage.style.setProperty('--shift-x', x + 'px'); stage.style.setProperty('--shift-y', y + 'px');
    }, 15 * 60000);

    // spotlight card rotates on its own
    setInterval(() => { OW.views.tiles.spotlight.index++; if (A.ws === 'space' && !A.ambient) OW.views.renderTile('spotlight'); }, 20000);
  }

  // ---- TV launcher data: HDMI inputs + installed TV apps (native), ordered for the home row ----
  const APP_ORDER = ["com.apple.atve.televisionAdapter.appletv", 'com.google.android.youtube.tv', 'com.disney.disneyplus', 'com.crunchyroll.crunchyroid', 'com.netflix.ninja', 'com.amazon.amazonvideo.livingroom', 'com.hulu.livingroomplus', 'com.wbd.stream', 'com.google.android.youtube.tvmusic', 'com.google.android.youtube.tvunplugged', 'com.espn.score_center', 'com.tubitv'];
  const APP_HIDE = ["com.televisionAdapter.dtv.tvx", "com.televisionAdapter.dtv.promos", "com.televisionAdapter.dtv.smarthelp", "com.televisionAdapter.dtv.notificationcenter", "com.televisionAdapter.dtv.seeds.iot", "com.televisionAdapter.dtv.televisionAdapterselect", "com.televisionAdapter.dtv.livingfit", "com.televisionAdapter.dtv.ecodashboard", "com.televisionAdapterpicturescore", 'com.google.android.play.games'];
  const APP_LAST = ['com.android.vending', 'com.spocky.projengmenu'];
  function loadTvList() {
    const N = (OW.demo?.active ? null : window.flightdayNative);
    if (!OW.isTV || !N || !N.tvApps) return;
    let inputs = [], apps = [];
    try { inputs = JSON.parse(N.tvInputs()); apps = JSON.parse(N.tvApps()); } catch (e) { return; }
    const hide = APP_HIDE.concat(OW.config.get('tv.hideApps') || []);
    const port = (id) => { const m = /\/(?:HW|HDMI)(\d)/.exec(id); return m ? +m[1] : 0; };
    const cecPorts = new Set(inputs.filter((i) => i.cec).map((i) => port(i.id)));
    const pick = OW.config.get('tv.appleTvInput');
    const ins = inputs.filter((i) => i.hdmi && (i.cec || (i.connected && !cecPorts.has(port(i.id))))).map((i) => {
      const apple = i.id === pick || /apple/i.test(i.label) || (!pick && i.cec);
      return { id: i.id, apple, port: port(i.id), label: apple ? 'Apple TV' : (i.label && !/^HDMI ?\d?$/i.test(i.label) ? i.label : 'HDMI ' + port(i.id)), sub: 'HDMI ' + port(i.id) + (i.connected ? '' : ' · standby') };
    }).sort((a, b) => (b.apple ? 1 : 0) - (a.apple ? 1 : 0) || a.port - b.port);
    // only one input is "the" Apple TV
    ins.forEach((i, n) => { if (n > 0 && i.apple && ins[0].apple) { i.apple = false; if (i.label === 'Apple TV') i.label = 'HDMI ' + i.port; } });
    const rank = (a) => { const i = APP_ORDER.indexOf(a.pkg); return APP_LAST.includes(a.pkg) ? 900 + APP_LAST.indexOf(a.pkg) : i >= 0 ? i : 100; };
    const list = apps.filter((a) => !hide.includes(a.pkg)).sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
    // "on Apple TV" launchers: this room's Apple TV apps (HA source_list), favourites first
    const h = OW.data.state && OW.data.state.handoff;
    const want = OW.config.get('tv.appleApps') || [];
    const FAV = [/^youtube$/i, /^netflix$/i, /disney/i, /crunchyroll/i, /^tv$/i, /^hulu/i, /prime video/i, /^max$|hbo/i, /^music$/i, /twitch/i, /plex/i, /espn/i, /peacock/i, /paramount/i, /^photos$/i];
    const src = (h && h.sources) || [];
    const atv = (want.length ? want.map((n) => src.find((x) => x.toLowerCase() === String(n).toLowerCase())).filter(Boolean)
      : FAV.map((re) => src.find((x) => re.test(x))).filter(Boolean)).filter((x, i, l) => l.indexOf(x) === i).slice(0, 8)
      .map((name) => {
        const twin = list.find((a) => a.label.toLowerCase().replace(/[^a-z0-9]/g, '') === (name === 'TV' ? 'appletv' : name.toLowerCase().replace(/[^a-z0-9]/g, '')) || (name === 'TV' && a.pkg === "com.apple.atve.televisionAdapter.appletv"));
        return { name, label: name === 'TV' ? 'Apple TV+' : name, banner: twin ? twin.pkg : null };
      });
    const sig = JSON.stringify([ins, list, atv]);
    if (sig === A.tvSig) return;
    A.tvSig = sig;
    A.tvList = { inputs: ins, apps: list, atv };
    if (OW.views && document.querySelector('[data-tile="apps"]')) OW.views.update('tvlist');
  }

  // =================================================================================
  // sleep mode: "When do you want to launch tomorrow?" -> power-down sequence -> blackout
  // =================================================================================
  function suggestWake() {
    // 90 minutes before tomorrow's first timed event, on the quarter hour, never before 05:00
    const first = OW.data.agenda().tomorrow.find((e) => !e.allDay);
    if (!first) return null;
    const t = new Date(first.start - 90 * 60000);
    const mins = Math.max(5 * 60, Math.floor((t.getHours() * 60 + t.getMinutes()) / 15) * 15);
    return { time: fmt.pad(Math.floor(mins / 60)) + ':' + fmt.pad(mins % 60), event: first };
  }
  /**
   * One model for the sleep screen. With Home Assistant the plan IS its helpers (a liftoff time and an
   * on/off per weekday, a master switch, sound, volume) and every change is written there at once.
   * Without it the wall keeps a single time of its own.
   */
  OW.views.suggestWake = suggestWake;
  function scheduleModel() { return OW.data.state.sleepSchedule || OW.sleepSchedule.read({},false); }
  function scheduleGroups() { return OW.sleepSchedule.groups(scheduleModel(),!!A.scheduleCustom); }
  function openSchedule() {
    if(A.settings)closeSettings(); if(A.sheet)closeSheet();
    A.sheet=true; A.scheduleOpen=true; A.scheduleDraft=null; A.scheduleError='';
    $('sleep').hidden=false; stage.classList.add('modal-on'); renderSchedule(); layoutBlur(); OW.focus.enter();
  }
  function renderSchedule() {
    if(!A.scheduleOpen)return;
    const S=OW.sleepSchedule,m=scheduleModel(),pending=!!A.schedulePending;
    const button=(id,act,label,arg='',disabled=false)=>'<button class="btn" '+(disabled||pending?'disabled':'data-focus')+' data-fid="sch-'+id+'" data-act="'+act+'" data-arg="'+esc(arg)+'">'+esc(label)+'</button>';
    const timeControls=(g,field)=>'<div class="schedule-controls">'+button(g.key+'-'+field+'-dn','schedule.adjust','−15',g.key+'|'+field+'|-15',!g.ready)+button(g.key+'-'+field,'schedule.time',S.clock(g[field]),g.key+'|'+field,!g.ready)+button(g.key+'-'+field+'-up','schedule.adjust','+15',g.key+'|'+field+'|15',!g.ready)+'</div>';
    const tomorrow=new Date(OW.nowMs());tomorrow.setDate(tomorrow.getDate()+1);
    const override=m.overrideAt&&S.dateKey(m.overrideAt)===S.dateKey(tomorrow),day=m.days.find(d=>d.key===S.days[(tomorrow.getDay()+6)%7]);
    const once={key:'once',wake:override?fmt.time24(m.overrideAt):day?.wake,ready:m.overrideReady};
    let content;
    if(A.scheduleDraft){const d=A.scheduleDraft;
      content='<section class="schedule-draft"><h2>'+esc(d.name)+' · '+(d.field==='bedtime'?'Bedtime the night before':'Wake time')+'</h2><p class="schedule-clock">'+S.clock(d.value)+'</p><div class="rowbtns">'+[[-60,'Hour −'],[60,'Hour +'],[-1,'Minute −'],[1,'Minute +']].map(([n,label])=>button('draft-'+n,'schedule.draft',label,String(n))).join('')+'</div><div class="rowbtns">'+button('apply','schedule.apply','Apply')+button('cancel','schedule.cancel','Cancel')+'</div></section>';
    }else{
      content='<div class="schedule-toolbar">'+button('custom','schedule.custom','Customize days: '+(A.scheduleCustom||m.weekdaysDiffer?'On':'Off'),'',m.weekdaysDiffer)+'<span>'+(m.weekdaysDiffer?'Weekday values differ; shown individually.':'Group edits apply to every included day.')+'</span></div><div class="schedule-groups">'+scheduleGroups().map(g=>'<section class="schedule-group"><h2>'+esc(g.name)+'</h2><p>'+esc(g.name)+': bed '+S.clock(g.bedtime)+' the night before · wake '+S.clock(g.wake)+'</p><div class="schedule-row"><span>Wake</span>'+timeControls({...g,wake:g.wake},'wake')+button(g.key+'-enabled','schedule.toggle','Alarm '+(g.enabled?'on':'off'),g.key,!g.ready)+'</div><div class="schedule-row"><span>Bedtime <small>the night before</small></span>'+timeControls(g,'bedtime')+'</div></section>').join('')+'</div><section class="schedule-once"><h2>Tomorrow: '+S.clock(once.wake)+(override?' (just once)':' (weekly plan)')+'</h2><p>One-time override · your weekly schedule stays saved.</p>'+timeControls(once,'wake')+(override?button('clear','schedule.clear','Use weekly plan','',!m.overrideReady):'')+'</section>';
    }
    const scrollTop=$('sleep').querySelector('.schedule-body')?.scrollTop||0;
    OW.focus.preserve($('sleep'),()=>{$('sleep').innerHTML='<div class="modal-win schedule-win"><header class="mh"><span class="tt">Schedule</span>'+button('close','sheet.close','Close')+'</header><div class="schedule-body scroll"><p class="schedule-note">Bedtime is a target before that wake day. Only you start Goodnight.</p>'+(!m.connected?'<p role="status">Home Assistant is offline · editing unavailable</p>':'')+content+(A.scheduleDraft?'':(OW.views.climateRoutines?.('schedule')||''))+'<p role="status">'+esc(A.scheduleError|| (pending?'Saving to Home Assistant…':''))+'</p></div></div>';});
    $('sleep').querySelector('.schedule-body').scrollTop=scrollTop;
  }
  function editScheduleTime(key,field,delta) {
    if(A.schedulePending)return;
    let g=key==='once'?null:scheduleGroups().find(g=>g.key===key);
    if(key==='once'){const m=scheduleModel(),date=new Date(OW.nowMs());date.setDate(date.getDate()+1);const d=m.days.find(d=>d.key===SCHEDULE_DAYS(date));g={name:'Tomorrow (just once)',days:[],ready:m.overrideReady,wake:m.overrideAt&&OW.sleepSchedule.dateKey(m.overrideAt)===OW.sleepSchedule.dateKey(date)?fmt.time24(m.overrideAt):d?.wake};field='override';g.override=g.wake;}
    if(!g?.ready||!g[field])return;
    if(delta!==undefined)return saveSchedule({days:g.days,field,value:OW.sleepSchedule.shift(g[field],delta)});
    A.scheduleDraft={days:g.days,name:g.name,field,value:g[field]};A.scheduleError='';renderSchedule();OW.focus.enter();
  }
  function SCHEDULE_DAYS(date){return OW.sleepSchedule.days[(date.getDay()+6)%7];}
  async function saveSchedule(payload) {
    if(A.schedulePending)return;
    const returnFid=document.activeElement?.dataset.fid;
    A.schedulePending=true;A.scheduleError='';renderSchedule();
    try {const result=OW.data.call('schedule.edit',payload);if(!result||typeof result.then!=='function')throw Error('Home Assistant is unavailable');await result;A.scheduleDraft=null;toast('Schedule saved');}
    catch(e){A.scheduleError='Schedule change not confirmed · '+(e.message||'try again');}
    finally{A.schedulePending=false;if(A.scheduleOpen){renderSchedule();if(OW.focus.kb){const group=payload.days?.length===5?'weekdays':payload.days?.[0]||'once',field=payload.field==='override'?'wake':payload.field;const restore=$('sleep').querySelector('[data-fid="'+returnFid+'"]')||$('sleep').querySelector('[data-fid="sch-'+group+'-'+field+'"]');if(restore)OW.focus.focus(restore);}}}
  }

  function closeSheet() {
    if (!A.sheet) return;
    A.sheet = false; A.scheduleOpen=false; A.scheduleDraft=null;
    $('sleep').hidden = true; $('sleep').innerHTML = '';
    stage.classList.remove('modal-on');
    if (OW.focus.kb) OW.focus.enter(true);
  }
  /** sleep & wake edits: straight to Home Assistant (or to this wall's own settings without it) */
  function sleepEdit(kind, arg, dayKey) {
    const M = OW.views.sleepModel(), st = OW.views.sleep;
    const sel = M.days.find((d) => d.key === (dayKey || st.sel)) || M.target;
    if(kind==='once'){
      if(!M.target)return;
      const at=new Date(M.target.at),time=shiftTime(M.target.time,+arg),[h,m]=time.split(':').map(Number);at.setHours(h,m,0,0);
      if(at<=OW.now())return toast('Choose a future wake time');
      OW.data.call('alarm.override',{datetime:at.getFullYear()+'-'+fmt.pad(at.getMonth()+1)+'-'+fmt.pad(at.getDate())+' '+time+':00'});
    }else if(kind==='upby'){
      const day=dayKey||st.sel||M.target.key, row=M.days.find(d=>d.key===day)||M.target;
      const time=shiftTime(row.upBy==='00:00'?row.time:row.upBy,+arg);OW.data.call('alarm.upBy',{day,time});
    }else if (kind === 'day') st.sel = arg;
    else if (kind === 'step' || kind === 'preset') {
      const time = kind === 'preset' ? arg : shiftTime(sel.time, +arg);
      if (M.local) { st.localTime = time; OW.config.set('sleep.last', time); } else if(dayKey&&!M.localCore) { const at=new Date(M.target.at),[h,m]=time.split(':').map(Number);at.setHours(h,m,0,0);if(at<=OW.now())return toast('Choose a future wake time');OW.data.call('alarm.override',{datetime:at.getFullYear()+'-'+fmt.pad(at.getMonth()+1)+'-'+fmt.pad(at.getDate())+' '+time+':00'}); } else OW.data.call('alarm.day',{day:sel.key,time});
    } else if (kind === 'dayon') { if (!M.local) OW.data.call('alarm.day', { day: sel.key, on: arg === '1' }); }
    else if (kind === 'master') { if (M.local) { st.localAlarm = arg === '1'; OW.config.set('sleep.alarm', arg === '1'); } else OW.data.call('alarm.master', { on: arg === '1' }); }
    else if (kind === 'sound') { OW.data.call('sleep.sound', { option: arg }); if (A.night) nightAudio(arg); }
    else if (kind === 'vol') { if (M.volume != null) OW.data.call('sleep.volume', { value: OW.clamp(M.volume + (+arg) * Math.max(2, M.volStep), M.volMin, M.volMax) }); }
    OW.views.update('sleep');
    if (A.night && A.night.overlay) renderNightOverlay();
  }

  /** Tell the house (Home Assistant), then take this screen into the night. The plan is already saved. */
  function goodnight() {
    const M = OW.views.sleepModel();
    // the device's own alarm is the backstop for the morning (works with HA down)
    if (M.target) { OW.config.set('schedule.launch', M.target.time); OW.config.set('schedule.launchEnabled', !!(M.master && M.target.on)); }
    A.goodnightIntent=true;A.localGoodnight=true;if(OW.data.contract===3)A.nightAudioScreens=[];
    OW.data.call('sleep.goodnight', {});
    A.sleepLocal = OW.nowMs();
    A.pendingNight = A.pendingNight || { sound: M.sound, url: null };
    runShutdown();
  }

  // =================================================================================
  // night mode: true black, nothing on screen, nothing moving. The bedroom TV plays the sleep sound itself.
  // Any button or touch brings up dim, warm controls for ten seconds, then it is black again.
  // =================================================================================
  /** what a touch / button shows at night on THIS screen: 'black' (controls only) or 'clock' (red night clock + controls) */
  function nightLook() { const v = OW.config.get('sleep.look') || 'auto'; return v === 'black' || v === 'clock' ? v : OW.isTV ? 'black' : 'clock'; }
  A.nightLook = nightLook;
  /**
   * Where a sleep sound is played from: the URL the house last sent for it (the goodnight event's sound_url),
   * else the known stream for it (settings `sleep.urls`, e.g. Rain), else Home Assistant's /local/sleep/<name>.mp3.
   */
  const soundKey = (name) => String(name || '').toLowerCase().replace(/\s+/g, '-');
  function soundUrl(name) {
    if(OW.standalone?.active()&&OW.standalone.soundUrl(name))return OW.standalone.soundUrl(name);
    if (!name || /^off$/i.test(name)) return null;
    const urls = OW.config.get('sleep.urls') || {}, key = soundKey(name);
    if(OW.demo?.active&&['rain','thunderstorm'].includes(key))return new URL(OW.asset?OW.asset('audio/demo-'+key+'.wav'):'audio/demo-'+key+'.wav',location.href).href;
    if (/^https?:\/\//.test(urls[key] || '')) return urls[key];
    const base = String(OW.config.get('ha.url') || '').replace(/\/+$/, '');
    return /^https?:\/\//.test(base) ? base + '/local/sleep/' + key + '.mp3' : null;
  }
  function rememberSound(name, url) {
    if (!name || !/^https?:\/\//.test(url || '') || /^off$/i.test(name)) return;
    const urls = Object.assign({}, OW.config.get('sleep.urls') || {});
    if (urls[soundKey(name)] !== url) { urls[soundKey(name)] = url; OW.config.set('sleep.urls', urls); }
  }
  function nightAudio(name, url) {
    if (!nightAudioHere() || (A.alarm?.test && alarmActive())) return;
    const u = url || soundUrl(name);
    if (!u) { nat('nightAudio', 'stop', JSON.stringify({ fadeMs: 3000 })); A.nightSound = { name: name || 'Off', url: null, error: null }; return; }
    if (A.nightSound && A.nightSound.url === u && !A.nightSound.error) return;
    A.nightSound = { name, url: u, error: null };
    nat('nightAudio', 'play', JSON.stringify({ url: u, gain: 1, fadeMs: A.alarm?.state==='snoozed'?10000:4000 }));
  }
  function enterNight(opts) {
    opts = opts || {};
    if (OW.isDream) return;
    if (A.settings) closeSettings();
    if (A.sheet) closeSheet();
    if (A.ambient) exitAmbient(true);
    if (A.watch) closeWatch();
    if (A.seq) endSequence();
    if (A.liftoff) endLiftoff();
    const M = OW.views.sleepModel();
    // "stay on": this screen keeps showing the dashboard at night (it still plays the sleep sound if that is its job)
    if (OW.config.get('sleep.behavior') === 'stay_on' && !opts.preview) { if (!opts.silent) nightAudio(opts.sound || M.sound, opts.url); OW.host.log('night: this screen is set to stay on'); return; }
    if (A.night) clearTimeout(A.night.snooze);
    A.night = { since: OW.nowMs(), overlay: false, row: 'wake', edit: false, preview: !!opts.preview, until: opts.until || 0 };
    A.blackout = true;
    const el = $('softoff');
    el.hidden = false; el.className = 'softoff night'; el.innerHTML = '';
    stage.classList.add('night-on');
    clearTimeout(idleTimer);
    if (OW.isTV) { nat('keepOn', true); nat('nightDim', true); }
    if (OW.mode === 'panel') nat('blackout', true);
    if (!opts.silent) nightAudio(opts.sound || M.sound, opts.url);
    if (opts.until) A.night.snooze = setTimeout(() => wakeUp(), Math.max(1000, opts.until - OW.nowMs()));
    if (opts.preview) setTimeout(() => { if (A.night) showNightOverlay(); }, 1200);
    else nightIdle();
    OW.host.log('night mode on' + (nightAudioHere() ? ' (audio here)' : ''));
  }
  A.enterNight = enterNight;
  function exitNight(why) {
    if (!A.night) return;
    clearTimeout(A.night.hide); clearTimeout(A.night.snooze);
    A.night = null; A.blackout = false;
    const el = $('softoff');
    el.hidden = true; el.className = 'softoff'; el.innerHTML = '';
    stage.classList.remove('night-on');
    if (OW.isTV) nat('nightDim', false);
    if (OW.mode === 'panel') { nat('blackout', false); if (why !== 'alarm') restoreBrightness(); }
    pictureOff(false);
    if (why !== 'alarm') { nat('nightAudio', 'stop', JSON.stringify({ fadeMs: 3000 })); A.nightSound = null; if (OW.isTV) nat('keepOn', false); resetIdle(); }
  }
  // V3 owns lifecycle restores in HA. Only a person's night controls can show the picture.
  function pictureOff(off, reason) {
    if (!OW.isTV) return;
    if (OW.data.contract === 3) {
      const client = OW.data.client;
      if (!A.night || A.night.preview || A.alarm?.test || !client?.pictureStatus()?.configured) return;
      if (!['controls-show', 'controls-hide', 'idle'].includes(reason)) return;
      if (reason === 'idle' && OW.nowMs() - A.night.since < 20000) return;
      const send = () => client.tvPicture(!off, {idle: reason === 'idle'});
      const pending = reason === 'controls-show' ? client.userGesture(send) : send();
      pending?.catch(() => {}); // cosmetic; HA owns diagnostics and retry policy
      return;
    }
    // FE-H14 keeps the private house native adapter, including its televisionAdapter capability guard.
    if (OW.data.client && OW.data.contract !== 2 || !OW.config.legacyTvPskAllowed?.()) return;
    const key = OW.config.get("tv.tvAdapterPsk");
    if (key) nat("tvAdapter", key, off ? 'pictureOff' : 'restore');
  }
  // A remote key can silently undo televisionAdapter Picture off. Never re-assert faster than 20 s.
  setInterval(() => { if (A.night && !A.night.overlay && !A.controlsVisible && OW.config.get('sleep.behavior') !== 'dim') pictureOff(true, 'idle'); }, 20000);
  /** what the screen shows at night when nobody is touching it: nothing (backlight off), or the dim night clock */
  function nightIdle(reason) {
    const n = A.night; if (!n) return;
    if (OW.config.get('sleep.behavior') === 'dim') {
      const M = OW.views.sleepModel(), T = M.target;
      $('softoff').innerHTML = '<div class="nt with-clock idle"><div class="nt-clock mono" data-clock="hm"></div><div class="nt-under">' + esc(A.alarm?.state==='snoozed' ? 'snoozing · liftoff '+fmt.hm(Date.parse(A.alarm.launch_at)) : OW.views.bedtimeLine?.() || (T && M.master && T.on ? 'wake ' + OW.time.text(T.time) : '')) + '</div></div>';
      if (OW.mode === 'panel') { OW.host.setBrightness(OW.clamp(+OW.config.get('sleep.nightBrightness') || 1, 1, 100)); nat('blackout', false); }
      tick(true);
    } else { $('softoff').innerHTML = ''; if (OW.mode === 'panel') nat('blackout', true); pictureOff(true, reason); }
    if (reason === 'controls-hide' && OW.config.get('sleep.behavior') === 'dim' && OW.data.contract === 3) pictureOff(true, reason);
  }
  function nightRows(M) {
    return ['wake',M.local||M.localCore?null:'crew',M.local||M.localCore?null:'upby',M.sounds?.length?'sound':null,M.volume!=null?'volume':null,M.muted?'muted':null,'alarm','look','up'].filter(Boolean);
  }
  function renderNightOverlay() {
    const n = A.night; if (!n || !n.overlay) return;
    const M = OW.views.sleepModel(), T = M.target, rows = nightRows(M);
    if (!rows.includes(n.row)) n.row = rows[0];
    const adj = (kind, d, label, ic) => '<button class="nt-b" data-act="night.adj" data-arg="' + kind + ':' + d + '" aria-label="' + label + '">' + icon(ic) + '</button>';
    const off = /^off$/i.test(M.sound || '');
    const row = {
      crew:()=>'<em>'+esc(OW.crewText('title'))+'</em><div class="nt-v">'+adj('crew',-1,'previous crew','prev')+'<b>'+esc(W.crewName(T?.crew))+'</b>'+adj('crew',1,'next crew','next')+'</div><small>'+esc(W.crewLine(M))+'</small>',
      upby:()=>'<em>Up by</em><div class="nt-v">'+adj('upby',-15,'earlier','minus')+'<b class="mono">'+(T?.upBy==='00:00'?'— calendar':OW.time.text(T?.upBy))+'</b>'+adj('upby',15,'later','plus')+'</div>',
      muted:()=>'<em>Speaker</em><button class="nt-b wide" data-act="sleep.unmute">Muted · Select to unmute</button>',
      sound: () => '<em>Sound</em><div class="nt-v">' + adj('sound', -1, 'previous sound', 'prev') + '<b>' + esc(M.sound || '') + '</b>' + adj('sound', 1, 'next sound', 'next') + '</div>' +
        (A.nightSound && A.nightSound.error && A.nightSound.tries >= 2 ? '<small>cannot be played right now · retrying</small>' : ''),
      volume: () => '<em>Volume</em><div class="nt-v' + (off ? ' off' : '') + '">' + adj('volume', -1, 'quieter', 'minus') + '<div class="sl-volbar"><i style="transform:scaleX(' + OW.views.volFrac(M) + ')"></i></div><b class="mono">' + M.volume + '%</b>' + adj('volume', 1, 'louder', 'plus') + '</div>' +
        (M.audioAdapterVol != null && M.audioAdapterVol !== M.volume ? '<small>speaker at ' + M.audioAdapterVol + '%</small>' : ''),
      wake: () => '<em>' + (T ? T.label : 'Tomorrow') + ' wake</em><div class="nt-v' + (n.edit ? ' edit' : '') + '">' + adj('wake', -15, 'earlier', 'minus') + '<b class="mono">' + (T ? OW.time.text(T.time) : '—') + '</b>' + adj('wake', 15, 'later', 'plus') + '</div><small>' + (n.edit ? '▴ ▾ to change · OK when done' : T && T.on && M.master ? 'tomorrow only · OK to change' : 'no alarm set') + '</small>',
      alarm: () => '<em>Alarm</em><div class="nt-v"><button class="nt-b wide" data-act="night.adj" data-arg="alarm:0"><b>' + (M.master ? 'on' : 'off') + '</b></button></div>',
      look: () => '<em>This screen</em><div class="nt-v"><button class="nt-b wide" data-act="night.look" data-arg="toggle"><b>' + (nightLook() === 'clock' ? 'Night clock' : 'Pure black') + '</b></button></div>',
      up: () => '<div class="nt-v"><button class="nt-b wide" data-act="night.wake"><b>Wake up now</b></button></div>',
    };
    const T2 = M.target;
    const lk = OW.space.lookUp();
    $('softoff').innerHTML = '<div class="nt' + (nightLook() === 'clock' ? ' with-clock' : '') + '">' + (lk && lk.el >= 0 ? '<div class="nt-look">ISS overhead · look ' + lk.compass + ', ' + lk.el + '° up</div>' : '') + '<div class="nt-clock mono" data-clock="hm"></div><div class="nt-under">' + esc(OW.views.bedtimeLine?.() || (T2 && M.master && T2.on ? 'wake ' + OW.time.text(T2.time) : 'no alarm')) + '</div>' +
      '<div class="nt-rows">' + rows.map((r) => '<div class="nt-row' + (r === n.row ? ' sel' : '') + '" data-row="' + r + '">' + row[r]() + '</div>').join('') + '</div>' +
      (A.sleepPeople.length ? '<div class="nt-sleep"><em>last night</em>' + A.sleepPeople.map((p) => '<span>' + sleepLine(p) + '</span>').join('') + '</div>' : '') + '</div>';
    tick(true);
    $('softoff').querySelector('.nt-row.sel')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  function touchNight() {
    const n = A.night; if (!n) return;
    clearTimeout(n.hide);
    n.hide = setTimeout(hideNightOverlay, 10000);
  }
  function showNightOverlay(userInitiated = false) {
    const n = A.night; if (!n) return;
    if (!n.overlay) { n.overlay = true; n.shownAt = OW.nowMs(); n.edit = false; pictureOff(false, userInitiated ? 'controls-show' : undefined); loadSleep(false); if (OW.mode === 'panel') { OW.host.setBrightness(Math.max(OW.clamp(+OW.config.get('sleep.nightBrightness') || 1, 1, 100), A.lux > 30 ? OW.clamp(Math.round(A.lux / 12), 2, 20) : 1)); nat('blackout', false); } }
    renderNightOverlay(); touchNight();
  }
  function hideNightOverlay() {
    const n = A.night; if (!n) return;
    clearTimeout(n.hide);
    n.overlay = false; n.edit = false;
    nightIdle('controls-hide');
  }
  /** change something from the night controls (fromTouch: ignore the tap that only woke the overlay) */
  function nightAdj(kind, d, fromTouch) {
    const n = A.night; if (!n) return;
    if (fromTouch && OW.nowMs() - (n.shownAt || 0) < 450) return;
    const M = OW.views.sleepModel();
    if(kind==='crew'){const list=OW.model.crewOptions(),i=list.indexOf(M.target.crew||'both');OW.data.call('alarm.crew',{day:M.target.key,crew:list[(i+(d>0?1:list.length-1))%list.length]});}
    else if(kind==='upby')sleepEdit('upby',String(d),M.target.key);
    else if (kind === 'sound' && M.sounds && M.sounds.length) { const i = M.sounds.indexOf(M.sound), c = M.sounds.length; sleepEdit('sound', M.sounds[(i + (d > 0 ? 1 : c - 1)) % c]); }
    else if (kind === 'volume') sleepEdit('vol', d > 0 ? '1' : '-1');
    else if (kind === 'wake' && M.target) sleepEdit('step', String(d), M.target.key);
    else if (kind === 'alarm') sleepEdit('master', M.master ? '0' : '1');
    n.row = kind === 'alarm' || kind === 'sound' || kind === 'volume' || kind === 'wake' ? kind : n.row;
    renderNightOverlay(); touchNight();
  }
  function nightKey(key) {
    const n = A.night; if (!n) return;
    if (!n.overlay) return showNightOverlay(true);
    const M = OW.views.sleepModel(), rows = nightRows(M), i = rows.indexOf(n.row);
    const ok = key === 'Enter' || key === ' ';
    if (n.edit) {
      if (key === 'ArrowUp') nightAdj('wake', 15); else if (key === 'ArrowDown') nightAdj('wake', -15);
      else if (key === 'ArrowRight') nightAdj('wake', 5); else if (key === 'ArrowLeft') nightAdj('wake', -5);
      else if (ok || key === 'Escape' || key === 'Backspace') n.edit = false;
    } else if (key === 'ArrowUp') n.row = rows[Math.max(0, i - 1)];
    else if (key === 'ArrowDown') n.row = rows[Math.min(rows.length - 1, i + 1)];
    else if (key === 'ArrowLeft' || key === 'ArrowRight') { const d = key === 'ArrowRight' ? 1 : -1; if (n.row === 'wake') nightAdj('wake', d * 15); else if (n.row === 'look') return act('night.look', 'toggle'); else if (n.row !== 'up') nightAdj(n.row, d); }
    else if (ok) { if (n.row === 'look') return act('night.look', 'toggle'); if (n.row === 'wake') n.edit = true; else if (n.row === 'alarm') nightAdj('alarm', 0); else if (n.row === 'sound') nightAdj('sound', 1); else if(n.row==='crew')nightAdj('crew',1);else if(n.row==='upby')nightAdj('upby',15);else if(n.row==='muted')return OW.data.call('sleep.unmute',{});else if (n.row === 'up') return wakeNow(); }
    else if (key === 'Escape' || key === 'Backspace') return hideNightOverlay();
    renderNightOverlay(); touchNight();
  }
  /** "Wake up now": end the night for the house and this screen; in the morning that means the briefing */
  function wakeNow() {
    const preview = A.night && A.night.preview;
    if (!preview) OW.data.call('night.wake', {});
    const h = OW.now().getHours();
    if (!preview && h >= 4 && h < 12) return wakeUp();
    exitNight('user');
    setWorkspace(preview ? 'night' : 'home');
  }

  // =================================================================================
  // Home arrangement: order and visibility of the Home tiles (long-press a tile, Options on a TV)
  // =================================================================================
  // This screen's settings live in wallhub's prefs under screens[<device id>] (so the Apple apps and a
  // reinstall see the same set-up); without a hub or a token they stay on the device.
  //   screens[id]: areas[], homeTiles[] (foreign omissions append visibly), nightLook, ambient, brightness, nightBehavior, nightBrightness, theme
  //   global: alarmMaxVolume (a mirror; the Home Assistant helper is the authority)
  const deviceId = () => OW.model.wireScreen();
  A.deviceId = deviceId;
  // Home tile ids as wallhub stores them (lowercase; `limits` and `weather` match the Apple apps)
  const TILE_WIRE = { hero: 'now', weather: 'weather', today: 'today', due: 'due', sleep: 'sleep', quick: 'house', playingNow: 'playing', alerts: 'alerts', gauges: 'limits' };
  const TILE_LOCAL = Object.keys(TILE_WIRE).reduce((m, k) => { m[TILE_WIRE[k]] = k; return m; }, {});
  const screenName = () => OW.model.screen()?.name||'This screen';
  const SYNCED = ['screen.name', 'home.tiles', 'sleep.look', 'sleep.behavior', 'sleep.nightBrightness', 'brightness', 'theme', 'ambient.mode', 'ambient.wallpaper.source', 'ambient.wallpaper.scene', 'ambient.wallpaper.pack', 'ambient.pause_on_battery', 'areas.space', 'areas.house', 'areas.night', 'areas.status', 'briefing.showGoNoGo'];
  const canShare = () => OW.data.contract===3?!!(OW.data.client?.ready&&!OW.data.client.readOnly&&OW.data.client.prefs):!!(OW.hub && OW.hub.enabled() && OW.hub.prefs && String(OW.config.get('wallhub.token') || '').trim());
  A.prefsShared = canShare;
  let applyingPrefs = false, pushTimer = null, pushPending = false;
  function screenPrefs() {
    const hp = OW.views.homePrefs();
    return {
      name: OW.config.get('screen.name') || screenName(), areas: areas().map((a) => a[0]), homeTiles: hp.order.filter((id) => !hp.hidden.includes(id)).map((id) => TILE_WIRE[id] || id.toLowerCase()),
      showGoNoGo: OW.goNoGoView?.enabled()!==false, nightLook: nightLook(), ambient: OW.wallpaper?.prefs?.(OW.config.get('ambient')) || {mode:ambientMode(),wallpaper:OW.config.get('ambient.wallpaper'),pause_on_battery:OW.config.get('ambient.pause_on_battery')!==false}, brightness: OW.clamp(+OW.config.get('brightness') || 0, 0, 100),
      nightBehavior: OW.config.get('sleep.behavior') || 'off', nightBrightness: OW.clamp(+OW.config.get('sleep.nightBrightness') || 1, 0, 100), theme: OW.config.get('theme'),
    };
  }
  function pushPrefs() {
    clearTimeout(pushTimer);
    if (!canShare()) return;
    pushPending = true;                      // until our change is stored, an older copy from the hub must not undo it
    pushTimer = setTimeout(() => {
      const patch = { screens: {} }; patch.screens[deviceId()] = screenPrefs();
      OW.config.set('home.knownTiles', Object.keys(OW.views.homeTiles));
      (OW.data.contract===3?OW.data.client.setPrefs(screenPrefs()):OW.hub.patchPrefs(patch)).catch((e) => { OW.host.log('settings not shared: ' + (e.message || e)); toast('Saved on this screen only (' + (e.message || e) + ')'); }).then(() => { pushPending = false; });
    }, 900);
  }
  function pullPrefs() {
    const p = OW.hub && OW.hub.prefs, sc = OW.data.contract===3?OW.data.client?.prefs:OW.model.screen()?.prefs || (OW.model.screen()?.legacy_id && p?.screens?.[OW.model.screen().legacy_id]);
    if (!sc || pushPending) return;
    const set = (k, v) => { if (v != null && JSON.stringify(v) !== JSON.stringify(OW.config.get(k))) OW.config.set(k, v); };
    applyingPrefs = true;
    try {
      if (typeof sc.name === 'string') set('screen.name', sc.name);
      if(typeof sc.showGoNoGo==='boolean')set('briefing.showGoNoGo',sc.showGoNoGo);
      if (Array.isArray(sc.areas)) ['space', 'house', 'night', 'status'].forEach((a) => set('areas.' + a, sc.areas.includes(a)));
      if (Array.isArray(sc.homeTiles)) {
        const all = Object.keys(OW.views.homeTiles);
        const listed = OW.homeTileOrder(sc.homeTiles, all, TILE_LOCAL);
        // Omission is not a hide command. Preserve this screen's deliberate local hides.
        const explicit = sc.homeTiles.map(id => TILE_LOCAL[{launch:'now',scenes:'house'}[id] || id] || id);
        const hidden = OW.views.homePrefs().hidden.filter(id => !explicit.includes(id));
        set('home.tiles', { order: listed, hidden });
      }
      if (sc.nightLook === 'black' || sc.nightLook === 'clock') set('sleep.look', sc.nightLook);
      if (['off', 'dim', 'stay_on'].includes(sc.nightBehavior)) set('sleep.behavior', sc.nightBehavior);
      if (sc.nightBrightness != null) set('sleep.nightBrightness', sc.nightBrightness);
      if (sc.brightness != null) set('brightness', sc.brightness);
      if (sc.ambient) { const a = OW.wallpaper.prefs(sc.ambient); set('ambient.mode', a.mode); set('ambient.wallpaper', a.wallpaper); set('ambient.pause_on_battery', a.pause_on_battery); }
      if (sc.theme && THEME_LABEL[sc.theme]) set('theme', sc.theme);
    } finally { applyingPrefs = false; }
    OW.views.update('home-tiles'); renderBar();
    if (A.settings) renderSettings();
  }
  A.pullPrefs = pullPrefs;
  OW.config.on((path) => {
    if (path === 'ambient.mode') { A.ambLiveOff = false; if (A.ambient) syncAmbientLive(); }
    if (path.indexOf('areas.') === 0) { renderBar(); if (OW.config.get('areas.' + A.ws) === false) setWorkspace('home'); }
    if (applyingPrefs) return;
    if (path === 'sleep.alarmMax' && +OW.config.get(path) > 0) {
      OW.data.call('alarm.max', { value: +OW.config.get(path) });
      if (OW.data.contract!==3&&canShare()) OW.hub.patchPrefs({ global: { alarmMaxVolume: +OW.config.get(path) } }).catch(() => {});
    }
    if (SYNCED.includes(path)) pushPrefs();
  });
  function saveHomeTiles(p) {
    OW.config.set('home.tiles', p);
    OW.views.update('home-tiles');
  }
  function arrange(kind, id, d) {
    const p = OW.views.homePrefs();
    if (kind === 'reset') { saveHomeTiles({ order: [], hidden: [] }); return renderArrange(); }
    if (kind === 'hide') p.hidden = p.hidden.includes(id) ? p.hidden.filter((x) => x !== id) : p.hidden.concat(id);
    if (kind === 'move') { const i = p.order.indexOf(id), j = OW.clamp(i + d, 0, p.order.length - 1); if (i >= 0 && i !== j) { p.order.splice(i, 1); p.order.splice(j, 0, id); } }
    saveHomeTiles(p);
    renderArrange(id);
  }
  // ---- Space area: the globe ----
  let craftAt = 0, hubCraft = [];
  /** tracked spacecraft from wallhub (Hubble, Tiangong, … with SGP4 positions); the ISS comes from our own propagator so it moves smoothly */
  async function loadCraft() {
    if (!OW.hub || !OW.hub.enabled() || OW.nowMs() - craftAt < 20000) return;
    craftAt = OW.nowMs();
    try {
      const r = await OW.hub.get('/v1/objects', 6000);
      const list = r.ok && r.data && Array.isArray(r.data.data) ? r.data.data : [];
      const short = (n) => (/ISS/.test(n) ? 'ISS' : /CSS|TIANHE/i.test(n) ? 'Tiangong' : /HST/.test(n) ? 'Hubble' : String(n).split(' ')[0]);
      const all = list.filter((o) => o.available && o.position).map((o) => ({ id: o.id, label: short(o.name), name: o.name, lat: o.position.latitude, lng: o.position.longitude, alt: o.position.altitude_km, iss: /ISS/.test(o.name) }));
      // a vehicle docked to the station is at the station: it gets no marker of its own
      const st = all.find((c) => c.iss);
      hubCraft = all.filter((c) => c.iss || !st || Math.abs(c.lat - st.lat) + Math.abs(c.lng - st.lng) > 1.5);
      A.docked = st ? all.filter((c) => !c.iss && !hubCraft.includes(c)).map((c) => c.name) : [];
    } catch (e) { /* hub away: the ISS still shows from the propagator */ }
  }
  /** the 2D map (devices too slow for the globe): terminator, pads, the picked launch, the look line, other spacecraft */
  function feedMap() {
    const term = document.getElementById('mapTerm'), extra = document.getElementById('mapExtra');
    if (!term || !extra) return;
    const S = OW.space, sun = OW.globe.subsolar(), rad = Math.PI / 180, X = (lon) => (lon + 180).toFixed(2), Y = (lat) => (90 - lat).toFixed(2);
    // night side: everything beyond the terminator, towards the pole that is in the dark
    const decl = Math.abs(sun.lat) < 0.5 ? 0.5 * (sun.lat < 0 ? -1 : 1) : sun.lat;
    let line = '';
    for (let lon = -180; lon <= 180; lon += 3) { const lat = Math.atan(-Math.cos((lon - sun.lng) * rad) / Math.tan(decl * rad)) / rad; line += (lon === -180 ? 'M' : 'L') + X(lon) + ' ' + Y(lat); }
    const edge = decl > 0 ? 180 : 0;
    term.innerHTML = '<path class="t-night" d="' + line + 'L360 ' + edge + 'L0 ' + edge + 'Z"/><path class="t-day" d="' + line + 'L360 ' + (180 - edge) + 'L0 ' + (180 - edge) + 'Z"/><path class="t-line" d="' + line + '"/>';
    const sel = OW.views.selectedLaunch(), lat = OW.config.get('home.lat'), lon = OW.config.get('home.lon');
    const v = sel && typeof lat === 'number' ? S.visibleFromHome(sel) : null;
    let html = '';
    OW.views.manifest().filter((l) => l.padLat != null && l.padLon != null && !(sel && sel.id === l.id)).forEach((l) => { html += '<circle class="pad" cx="' + X(l.padLon) + '" cy="' + Y(l.padLat) + '" r=".9"/>'; });
    if (v) html += '<path class="look" d="M' + X(lon) + ' ' + Y(lat) + 'L' + X(sel.padLon) + ' ' + Y(sel.padLat) + '"/>';
    if (sel && sel.padLat != null) html += '<g class="padsel" transform="translate(' + X(sel.padLon) + ' ' + Y(sel.padLat) + ')"><circle r="3.2" class="ring"/><circle r="1.3"/><text x="4.5" y="1.4">' + esc(sel.rocket) + '</text></g>';
    hubCraft.filter((c) => !c.iss).forEach((c) => { html += '<g class="craft" transform="translate(' + X(c.lng) + ' ' + Y(c.lat) + ')"><circle r="1.1"/><text x="2.6" y="1.2">' + esc(c.label) + '</text></g>'; });
    extra.innerHTML = html;
  }
  function feedGlobe(fly) {
    if (A.ws !== 'space') return;
    if (OW.globe.mode === '2d') return feedMap();
    const S = OW.space, now = Date.now(), lat = OW.config.get('home.lat'), lon = OW.config.get('home.lon');
    const home = typeof lat === 'number' && typeof lon === 'number' ? { lat, lng: lon } : null;
    const sel = OW.views.selectedLaunch();
    const iss = S.issAt(now);
    const craft = hubCraft.filter((c) => !c.iss).map((c) => ({ id: c.id, label: c.label, lat: c.lat, lng: c.lng, alt: c.alt }));
    if (iss) craft.unshift({ id: 'iss', label: 'ISS', lat: iss.lat, lng: iss.lon, alt: iss.alt, main: true });
    const alt = iss ? iss.alt / 6371 : 0.066;
    const seg = (segs) => segs.map((x) => x.map((q) => [q[1], q[0], alt]));
    const pads = OW.views.manifest().filter((l) => l.padLat != null && l.padLon != null).map((l) => ({ id: l.id, lat: l.padLat, lng: l.padLon, label: l.rocket, sel: !!(sel && sel.id === l.id) }));
    const v = sel && home ? S.visibleFromHome(sel) : null;
    OW.globe.set({ home, craft, pads, past: seg(S.issTrack(-46, 0, 60)), future: seg(S.issTrack(0, 93, 60)),
      look: v ? { fromLat: home.lat, fromLng: home.lng, toLat: sel.padLat, toLng: sel.padLon, km: v.km } : null, arc: sel && ascents[sel.id] && ascents[sel.id].pts ? ascents[sel.id].pts : null });
    if (fly && sel && sel.padLat != null) OW.globe.flyTo(sel.padLat, sel.padLon, 2);
  }
  function showGlobe() {
    if (A.ws !== 'space') return;
    const hostEl = document.getElementById('glHost');
    if (hostEl && OW.globe.show(hostEl)) { loadCraft().then(() => feedGlobe(false)); feedGlobe(false); loadAscent(OW.views.selectedLaunch()); }
    else if (OW.globe.mode === '2d') { loadCraft().then(feedMap); feedMap(); }
    const chip = document.querySelector('[data-space="crew"]');
    if (chip) chip.textContent = OW.space.crew.count ? String(OW.space.crew.count) : '–';
  }
  setInterval(() => { if (A.ws === 'space' && !A.ambient && !A.night && !document.hidden) { showGlobe(); loadCraft(); feedGlobe(false); const chip = document.querySelector('[data-space="crew"]'); if (chip && OW.space.crew.count) chip.textContent = String(OW.space.crew.count); } }, 5000);
  OW.globe.on((topic) => {
    if (topic === 'mode') { OW.views.renderTile('globe'); tick(true); if (A.ws === 'space') showGlobe(); }
    if (topic === 'ready') feedGlobe(true);
  });
  window.addEventListener('resize', () => OW.globe.resize());
  /** ascent track for a launch, when wallhub has one (it only publishes a trajectory it can stand behind) */
  const ascents = {};
  async function loadAscent(l) {
    if (!l || !OW.hub || !OW.hub.enabled() || (ascents[l.id] && OW.nowMs() - ascents[l.id].at < 10 * 60000)) return;
    ascents[l.id] = { at: OW.nowMs(), pts: null };
    try {
      const r = await OW.hub.get('/v1/launches/' + encodeURIComponent(l.id) + '/trajectory', 6000);
      const pts = r.ok && r.data && r.data.available && Array.isArray(r.data.points) ? r.data.points : null;
      if (pts && pts.length > 1) { ascents[l.id].pts = pts.map((p) => [p.latitude, p.longitude, (p.altitude_km || 0) / 6371]); ascents[l.id].estimated = !!r.data.estimated; feedGlobe(false); }
    } catch (e) { /* no trajectory: no arc */ }
  }
  /** a manifest row was picked: the globe flies to its pad and the brief follows */
  function selectLaunch(id) {
    OW.views.space.sel = id;
    OW.views.update('space-sel');
    feedGlobe(true);
    loadAscent(OW.views.selectedLaunch());
  }
  function showCrew() {
    const c = OW.space.crew;
    if (!c.count) return toast('Crew roster not loaded yet');
    A.sheet = true;
    const el = $('sleep');
    el.hidden = false; stage.classList.add('modal-on');
    el.innerHTML = '<div class="modal-win arrange-win crew-win"><div class="sl-eyebrow">' + icon('people') + '<span>people in space</span></div><h2>' + c.count + ' humans off-planet</h2>' +
      '<div class="crew-cols">' + c.stations.map((s) => '<div><div class="subhead"><span>' + esc(s.short) + (s.expedition ? ' · ' + esc(s.expedition) : '') + '</span><span>' + s.people.length + '</span></div>' + s.people.map((p) => '<div class="person"><span>' + esc(p.name) + '</span></div>').join('') + '</div>').join('') + '</div>' +
      '<div class="sl-go"><button class="btn big primary" data-focus data-focus-first data-fid="crew-done" data-act="sheet.close">' + icon('check') + '<span>Done</span></button></div></div>';
    layoutBlur(); OW.focus.enter();
  }
  function showDue(id) {
    const d = (OW.data.state.due || []).find((x) => x.id === id);
    if (!d) return;
    if (A.settings) closeSettings();
    A.sheet = true;
    const el = $('sleep');
    el.hidden = false; stage.classList.add('modal-on');
    el.innerHTML = '<div class="modal-win arrange-win due-win"><div class="sl-eyebrow">' + icon('flag') + '<span>due' + (d.course ? ' · ' + esc(d.course) : '') + '</span></div><h2>' + esc(d.title) + '</h2>' +
      '<p class="due-when">' + OW.views.dueWhen(d) + '</p>' + (d.desc ? '<p class="ar-note due-desc">' + esc(d.desc) + '</p>' : '') +
      '<div class="sl-go"><button class="btn big primary" data-focus data-focus-first data-fid="due-done" data-act="sheet.close">' + icon('check') + '<span>Done</span></button></div></div>';
    layoutBlur(); OW.focus.enter();
  }
  function renderArrange(sel) {
    const p = OW.views.homePrefs(), HT = OW.views.homeTiles, el = $('sleep');
    const shared = A.prefsShared();
    OW.focus.preserve(el, () => {
      el.innerHTML = '<div class="modal-win arrange-win"><div class="sl-eyebrow">' + icon('grid') + '<span>home</span></div><h2>Arrange Home</h2>' +
        '<p class="ar-note">Tiles fill the left column first. A tile with nothing to show stays out of the way by itself. ' + (shared ? 'Saved in wallhub for this screen.' : 'Saved on this screen.') + '</p>' +
        '<div class="ar-rows">' + p.order.map((id, i) => { const hid = p.hidden.includes(id), fixed = HT[id].fixed; return '<div class="ar-row' + (hid ? ' hid' : '') + (id === sel ? ' sel' : '') + '"><b>' + esc(HT[id].name) + '</b><small>' + (hid ? 'hidden' : '') + '</small>' +
          '<button class="ibtn" data-focus data-fid="ar-up-' + id + '" data-act="home.move" data-arg="' + id + ':-1" aria-label="earlier"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
          '<button class="ibtn" data-focus data-fid="ar-dn-' + id + '" data-act="home.move" data-arg="' + id + ':1" aria-label="later"' + (i === p.order.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button>' +
          (fixed ? '<span class="ar-fixed">always</span>' : '<button class="btn" data-focus data-fid="ar-h-' + id + '" data-act="home.hide" data-arg="' + id + '"><span>' + (hid ? 'Show' : 'Hide') + '</span></button>') + '</div>'; }).join('') + '</div>' +
        '<div class="sl-go"><button class="btn big" data-focus data-fid="ar-reset" data-act="home.reset"><span>Reset</span></button><button class="btn big" data-focus data-fid="ar-set" data-act="settings">' + icon('gear') + '<span>Settings</span></button>' +
        '<button class="btn big primary" data-focus data-focus-first data-fid="ar-done" data-act="sheet.close">' + icon('check') + '<span>Done</span></button></div></div>';
    });
    layoutBlur();
  }
  function openArrange(sel) {
    if (A.settings) closeSettings();
    if (A.ws !== 'home') setWorkspace('home');
    A.sheet = true;
    $('sleep').hidden = false;
    stage.classList.add('modal-on');
    renderArrange(sel);
    OW.focus.enter();
  }
  /** Options / Menu: arrange Home when on Home, settings elsewhere */
  function menuKey() {
    if (A.seq || A.briefAlarm || A.snoozedUntil) return OW.focus.enter();
    if (A.night) return showNightOverlay(true);
    if (A.settings) return closeSettings();
    if (A.sheet) return closeSheet();
    if (A.ws === 'home' && !A.ambient) { const t = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-tile]') : null; return openArrange(t ? t.dataset.tile : null); }
    return act('settings');
  }

  function runShutdown() {
    if (A.shutdown || OW.isDream) return;
    if (A.settings) closeSettings();
    if (A.ambient) exitAmbient(true);
    A.shutdown = true;
    const s = OW.data.state, L = OW.views.sleepModel();
    const lines = [];
    if (OW.data.has('lights') && !OW.data.isDemo('lights')) lines.push(['lamps + patio', s.lights.length + ' off']);
    const climate = OW.data.state.climate,comfortLine=OW.smartComfort?.nightLine();
    if(comfortLine)lines.push(['comfort',comfortLine.text]);
    else if (climate?.comfort?.enabled && climate.night?.ready) lines.push(['night temperature', OW.climate.fmt(climate.night.temperatureF,'°F') + ' · Comfort schedule']);
    if (climate?.comfort?.enabled && climate.wake?.ready) lines.push(['wake temperature', OW.climate.fmt(climate.wake.temperatureF,'°F') + ' · Comfort schedule at T−10']);
    if (L.sound) lines.push(['sleep sound', /^off$/i.test(L.sound) ? 'off' : L.sound.toLowerCase() + (L.volume != null ? ' · ' + L.volume + '%' : '')]);
    const T = L.target, armed = !!(L.master && T && T.on), t = T && T.time;
    const day = OW.agendaDay(OW.data.agenda()), first = day.events.find(e => !e.allDay && e.end > OW.nowMs());
    if (day.tomorrow && first) lines.push(['tomorrow', 'first up ' + fmt.hm(first.start) + ' · ' + OW.views.eventName(first)]);
    const bedtimeLine=OW.views.bedtimeLine?.(); if(bedtimeLine)lines.push(['bedtime target',bedtimeLine]);
    lines.push(['launch alarm', armed ? 'armed · ' + T.label.toLowerCase() + ' ' + OW.time.text(t) : 'off']);
    if(T&&!L.local&&!L.localCore){lines.push([OW.crewText('title'),W.crewLine(L)]);const deadline=W.preview(L,OW.data.state.events);if(deadline)lines.push(['up by','≈ '+fmt.hm(deadline.at)+' · '+deadline.reason]);}
    lines.push([OW.isTV ? 'this screen' : 'wall panel', 'night mode']);
    const el = $('shutdown');
    A.shutdownComfort=!!(A.goodnightIntent&&comfortLine?.kinds.length);A.goodnightIntent=false;
    const comfortButtons=A.shutdownComfort?'<div class="shutdown-comfort"><p>'+esc(comfortLine.text)+'</p><div class="comfort-actions">'+comfortLine.kinds.map(k=>OW.smartComfort.button(k,k==='close_up'?'Close up · Night '+climate?.night?.temperatureF+'°':null,'shutdown')).join('')+'<button class="btn" data-focus data-focus-first data-fid="shutdown-continue" data-act="comfort.sleep">Leave it · sleep</button></div></div>':'';
    el.classList.toggle('comfort-choice',A.shutdownComfort);
    el.innerHTML = '<div class="sd-in"><div class="sd-eyebrow">' + icon('moon') + '<span>systems powering down</span></div>' +
      '<div class="sd-lines">' + lines.map((l, i) => '<div class="sd-line" style="--i:' + i + '"><em>' + l[0] + '</em><i></i><b>' + esc(l[1]) + '</b></div>').join('') + '</div>' +
      comfortButtons+'<div class="sd-night">goodnight' + (armed && t ? ' · liftoff at ' + OW.time.text(t) : '') + '</div></div><div class="sd-crt"></div>';
    el.hidden = false;
    el.style.setProperty('--n', lines.length);
    stage.classList.add('sd-on');
    requestAnimationFrame(() => stage.classList.add('sd-run'));
    if(A.shutdownComfort){OW.focus.enter();}else A.shutdownTimer = setTimeout(endShutdown, 900 + lines.length * 240 + 1500);
  }
  function endShutdown(abandon) {
    if (!A.shutdown) return;
    clearTimeout(A.shutdownTimer);
    A.shutdown = false;A.shutdownComfort=false;
    $('shutdown').hidden = true;
    stage.classList.remove('sd-on', 'sd-run');
    if (abandon === true) return;
    // dark until morning: the panel switches its backlight off; a TV shows black until the house powers it down
    const pn = A.pendingNight || {}; A.pendingNight = null;
    enterNight({ sound: pn.sound, url: pn.url });
  }
  A.runShutdown = runShutdown;

  /** follow the house: sleep mode / launch flags changed in Home Assistant (wall button, phone, Siri) */
  function followLaunchState() {
    const L = OW.data.state.launch;
    if (!L) return;
    const was = A.launchState || {};
    if($('dwMuted'))$('dwMuted').hidden=!L.muted;
    if(alarmActive()&&!$('alarmControls').hidden)renderAlarmBar(true);
    if(A.seq?.audio && L.audioAdapterVol!=null && L.audioAdapterVol!==A.seq.liveSeen){A.seq.liveSeen=L.audioAdapterVol;if(A.seq.vol!=null && Math.abs(L.audioAdapterVol-A.seq.vol)>1){A.seq.nightVol=L.audioAdapterVol;A.seq.volumeAt=OW.clamp(1-(A.seq.t0-W.now())/A.seq.dur,0,.999);A.seq.vol=L.audioAdapterVol;}}
    if(L.backToBed && OW.model.isBedroom()){if(!A.night)enterNight({});A.lastWake=W.now();return;}
    if (L.alarm && L.alarm.alarm_id) {
      const d=L.alarm, key=JSON.stringify(d);
      if(A.helperAlarmKey!==key){ A.helperAlarmKey=key; applyAlarmState(d); }
    }
    // the event is the trigger; the helper is the truth that survives restarts and missed events
    if (!alarmActive() && L.sleeping && was.sleeping === false && !A.shutdown && !A.night && !alarmSuppressed()) {
      if (!L.events) { if (OW.nowMs() - (A.sleepLocal || 0) > 20000) runShutdown(); }
      else setTimeout(nightCheck, 7000);        // the goodnight event should have arrived by now; if it did not, go dark anyway
    }
    if (!alarmActive() && L.sleeping && was.sleeping === undefined && !alarmSuppressed() && !A.night && !A.seq && !A.brief && !A.shutdown && OW.nowMs() - A.bootAt < 90000) {
      // came up in the middle of the night (reboot, app update): straight back into night mode
      OW.host.log('sleep_mode is on at start: night mode');
      enterNight({});
    }
    if (A.night && A.night.overlay) renderNightOverlay();
    // someone changed the sound elsewhere (another screen, the panel): follow it
    if (A.night && !A.alarm?.test && !A.night.preview && nightAudioHere() && L.sound && (!A.nightSound || A.nightSound.name !== L.sound)) nightAudio(L.sound);
    if (!L.sleeping && was.sleeping === true && A.night && !A.night.preview && !A.night.until) exitNight('house');
    if (L.time && (L.time !== was.time || L.enabled !== was.enabled) && OW.mode === 'panel') {
      // keep the device alarm in step with Home Assistant so the panel wakes even if HA is unreachable
      OW.config.set('schedule.launch', L.time); OW.config.set('schedule.launchEnabled', !!L.enabled);
    }
    A.launchState = { sleeping: L.sleeping, firing: L.firing, time: L.time, enabled: L.enabled };
  }

  /** sleep mode is on but this screen is not in night mode (missed event, came back to the front late): go dark */
  function nightCheck() {
    const L = OW.data.state.launch;
    if (!L || !L.sleeping || alarmActive() || alarmSuppressed() || A.night || A.shutdown || A.seq || A.brief || OW.isDream) return;
    if (OW.nowMs() - (A.lastWake || 0) < 45 * 60000) return;            // just woke up: the house clears sleep mode itself
    OW.host.log('sleep mode is on and this screen is awake: night mode');
    nat('toFront');
    enterNight({});
  }
  A.nightCheck = nightCheck;
  /**
   * The alarm does not depend on one event arriving: while it is night, the screen itself starts the
   * count ten minutes before the planned liftoff, and lifts off at T-0 if no `wake` came.
   */
  setInterval(() => {
    if (!OW.data.state) return;
    const M = OW.views.sleepModel(), T = M.target, now = OW.nowMs();
    if(!A.debugAlarmAt){if(OW.data.contract===3){const sc=OW.model.screen();if(!sc?.alarm||T&&!W.isEveryone(T.crew)&&M.phones?.[T.crew]&&OW.model.isBedroom()&&sc.wakes_person!==T.crew)return;}else if(OW.data.status.connected||!OW.model.screen()?.alarm||(T?.crew!=='both'&&M.phones?.[T?.crew]))return;}
    const at = A.debugAlarmAt || (T && M.master && T.on && (A.night || (M.sleeping && !A.brief)) ? T.at : 0);
    if (!at || alarmSuppressed() || A.seq || A.brief || (A.night && A.night.preview && !A.debugAlarmAt)) return;
    if (now >= at - 10 * 60000 && now < at + 3 * 60000 && now - (A.lastWake || 0) > 30 * 60000) {
      OW.host.log('launch alarm started by the screen itself (no launch_sequence event yet)');
      A.debugAlarmAt = 0;
      runSequence(at, A.debugDur ? { dur: A.debugDur } : null);
    }
  }, 15000);

  /** frame-rate probe (key "f"): 6 s of requestAnimationFrame, logged to logcat and shown as a toast */
  function measureFps() {
    const t0 = performance.now(); let last = t0, n = 0, worst = 0, slow = 0;
    const where = A.ambient ? 'ambient' : A.ws;
    const step = (t) => {
      const dt = t - last; last = t; n++;
      if (dt > worst) worst = dt;
      if (dt > 25) slow++;
      if (t - t0 < 6000) return requestAnimationFrame(step);
      const fps = (n * 1000) / (t - t0);
      const msg = 'fps ' + where + ' (' + OW.mode + ', ' + OW.config.get('theme') + '): ' + fps.toFixed(1) + ' avg, worst frame ' + worst.toFixed(0) + ' ms, ' + slow + ' frames over 25 ms of ' + n;
      OW.host.log(msg); toast(msg, 6000);
    };
    requestAnimationFrame(step);
  }

  // ---- launch watch: the webcast plays on this screen ----
  //   panel / browser: an in-app player over the dashboard (YouTube embed), with the mission clock on top
  //   TV: handed to the TV's own app for the link (the YouTube app), Home returns to the wall
  function youtubeId(url) {
    const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url || '');
    return m ? m[1] : null;
  }
  function launchFor(url) { const S = OW.space; return S.launches.find((l) => l.webcast === url || l.info === url) || (S.focus && (S.focus.webcast === url || S.focus.info === url) ? S.focus : null); }
  /**
   * Watch a launch. Before the webcast is live there is nothing to watch, so the Flight Director is
   * shown instead (countdown, the published timeline, the pad, the latest word) and the stream takes
   * over by itself the moment it goes live. "Open the stream now" skips the wait.
   */
  function openWatch(url, force) { return OW.demo.openWebcast(url);
    if (!url) return;
    const l = launchFor(url);
    if (!force && l && !l.webcastLive && l.net > OW.nowMs() - 5 * 60000 && !/Success|Failure|Deployed/.test(l.status)) return openDirector(l);
    return playStream(url);
  }
  function playStream(url) { return OW.demo.openWebcast(url);
    const N = (OW.demo?.active ? null : window.flightdayNative), id = youtubeId(url);
    if (A.fd) { clearInterval(A.fd.timer); A.fd = null; }
    if (OW.isTV) { if (A.watch) closeWatch(); return N && N.openUrl && N.openUrl(url) ? null : toast('No app on this TV can open the webcast'); }
    if (!id) { if (A.watch) closeWatch(); return N && N.openUrl && N.openUrl(url) ? null : toast('This link cannot be played here'); }
    if (A.settings) closeSettings();
    const f = launchFor(url) || OW.space.focus;
    A.watch = true;
    const el = $('watch');
    el.className = 'watch';
    el.innerHTML = '<iframe src="https://www.youtube.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
      '<div class="watch-top">' + (f ? '<span class="live-tag"><i class="pulse"></i>' + (OW.space.live && OW.space.live.id === 'l' + f.id ? 'LIVE' : 'WATCH') + '</span><b>' + esc(f.rocket + ' · ' + f.mission) + '</b><span class="mono" data-cd="' + f.net + '" data-cd-style="tminus"></span>' : '') +
      '<span class="grow"></span><button class="btn" data-focus data-focus-first data-fid="watch-close" data-act="watch.close">' + icon('x') + '<span>Back to the wall</span></button></div>';
    el.hidden = false;
    stage.classList.add('watch-on');
    clearTimeout(idleTimer);
    tick(true);
  }

  // ---- Flight Director: the pre-stream screen ----
  const tMark = t => fmt.count(-t * 1000);
  /** `passive`: shown by Ambient (no buttons, nothing switches by itself) */
  function directorHtml(l, passive) {
    const S = OW.space, now = OW.nowMs(), v = S.visibleFromHome(l), tl = l.timeline || [], rel = (now - l.net) / 1000;
    const est = OW.flight?.estimate(l, now), pad = OW.flight?.pad(l);
    const pending = OW.flight?.loadPad(l);
    if (pending) pending.then(() => { if (A.fd?.id === l.id) { const cur = OW.space.launches.find(x => x.id === l.id) || l; OW.focus.preserve($('watch'), () => { $('watch').innerHTML = directorHtml(cur, false); }); tick(true); } else if (A.ambient && A.ambCorner === 'fd') renderAmbient(); });
    const estimate = est ? '<section class="fd-estimate"><h3>Estimated · typical ascent, not telemetry</h3><div data-ascent="' + esc(l.id) + '"><span>Altitude <b>' + Math.round(est.altitude) + ' km</b></span><span>Speed <b>' + Math.round(est.speed).toLocaleString() + ' km/h</b></span><span>Pitch <b>' + Math.round(est.pitch) + '°</b></span></div></section>' : '';
    const forecast = pad ? '<h3>Pad forecast · ' + fmt.hm(pad.at) + '</h3><p>' + [pad.wind != null ? 'Wind ' + Math.round(pad.wind) + ' km/h' + (pad.gust != null ? ' · gusts ' + Math.round(pad.gust) : '') : '', pad.cloud != null ? 'Cloud ' + Math.round(pad.cloud) + '%' : '', pad.rain != null ? 'Rain chance ' + Math.round(pad.rain) + '%' : ''].filter(Boolean).join(' · ') + '</p>' : '<h3>Pad forecast</h3><p>No forecast available for this launch time.</p>';
    // the rail: up to nine published steps around "now" — done, next, later
    let rail = '';
    if (tl.length) {
      const nextIdx = tl.findIndex((x) => x.t > rel), from = OW.clamp((nextIdx < 0 ? tl.length : nextIdx) - 4, 0, Math.max(0, tl.length - 9));
      rail = tl.slice(from, from + 9).map((x) => { const i = tl.indexOf(x), st = x.t <= rel ? 'done' : i === nextIdx ? 'next' : ''; return '<div class="fd-step ' + st + '"><i></i><em class="mono">' + tMark(x.t) + '</em><b>' + esc(x.label) + '</b></div>'; }).join('');
    }
    const chips = chipHtml(esc((l.statusName || l.status) === 'In Flight' ? 'In flight' : (l.statusName || l.status)), /Go/.test(l.status) ? 'grn' : /Hold|TBC|TBD/.test(l.status) ? 'yel' : /Fail/.test(l.status) ? 'red' : 'mut') +
      (l.probability != null && l.probability >= 0 ? chipHtml('weather ' + l.probability + '% go', l.probability >= 70 ? 'grn' : l.probability >= 40 ? 'yel' : 'red') : '') +
      (v ? chipHtml('visible from home · look ' + v.compass, 'grn') : '');
    return '<div class="fd' + (passive ? ' passive' : '') + '">' +
      '<header class="fd-top"><span class="fd-tag">' + (/^in flight$/i.test(l.status) ? 'in flight' : now >= l.net ? 'awaiting launch update' : 'pre-launch') + '</span><b>' + esc(l.rocket) + ' <span>· ' + esc(l.mission) + '</span></b><span class="grow"></span>' +
        (passive ? '' : (l.webcast ? '<button class="btn" data-focus data-fid="fd-open" data-act="watch.force" data-arg="' + esc(l.webcast) + '">' + icon('play') + '<span>Open the stream now</span></button>' : '') +
          '<button class="btn" data-focus data-focus-first data-fid="watch-close" data-act="watch.close">' + icon('x') + '<span>Back to the wall</span></button>') + '</header>' +
      '<div class="fd-body">' +
        '<section class="fd-left"><div class="fd-count mono" data-cd="' + l.net + '" data-cd-style="tminus"></div>' +
          '<div class="fd-net">' + (l.precise ? 'NET ' + fmt.when(l.net) : 'date to be confirmed') + ' · ' + esc(OW.padLine(l)) + '</div>' +
          '<div class="fd-chips">' + chips + '</div>' + estimate +
          (rail ? '<div class="fd-rail">' + rail + '</div>' : '<div class="fd-norail">No timeline has been published for this launch.</div>') + '</section>' +
        '<section class="fd-mid">' + OW.vehicle(l) + '<em>' + esc(l.provider || l.abbrev || '') + '</em></section>' +
        '<section class="fd-right">' +
          (l.about ? '<h3>mission</h3><p>' + esc(l.about) + '</p>' : '') +
          '<h3>pad</h3><p>' + esc(l.pad || '') + (l.location ? '<br>' + esc(l.location) : '') + (l.padLat != null ? '<br><span class="mono">' + Math.abs(l.padLat).toFixed(2) + '°' + (l.padLat >= 0 ? 'N' : 'S') + ' ' + Math.abs(l.padLon).toFixed(2) + '°' + (l.padLon >= 0 ? 'E' : 'W') + '</span>' : '') + '</p>' +
          forecast + (l.concerns ? '<h3>weather watch</h3><p>' + esc(l.concerns) + '</p>' : '') +
          (l.update ? '<h3>latest</h3><p>' + esc(l.update.text) + ' <span class="fd-age">' + fmt.ago(l.update.at) + '</span></p>' : '') +
          (v ? '<h3>from home</h3><p>Look ' + v.compass + ' (' + v.bearing + '°), about ' + v.clearSec + ' s after liftoff · ' + v.km + ' km away' + (v.twilight ? ' · twilight plume likely' : '') + '</p>' : '') +
          (passive ? '' : '<div class="fd-wait"><i></i><span>' + (l.webcast ? 'Waiting for the webcast. It opens by itself when it goes live.' : 'No webcast has been announced yet.') + '</span></div>') + '</section>' +
      '</div></div>';
  }
  const chipHtml = (text, tone) => '<span class="chip' + (tone ? ' c-' + tone : '') + '">' + text + '</span>';
  function openDirector(l) {
    if (A.settings) closeSettings();
    if (A.sheet) closeSheet();
    A.watch = true;
    A.fd = { id: l.id };
    const el = $('watch');
    el.className = 'watch director';
    const paint = () => {
      if (!A.fd) return;
      const cur = OW.space.launches.find((x) => x.id === A.fd.id) || l;
      // the stream went live: hand over
      if (cur.webcastLive && cur.webcast) return playStream(cur.webcast);
      OW.focus.preserve(el, () => { el.innerHTML = directorHtml(cur, false); });
      tick(true);
    };
    el.hidden = false;
    stage.classList.add('watch-on');
    clearTimeout(idleTimer);
    paint();
    A.fd.timer = setInterval(paint, 5000);
    if (OW.focus.kb) OW.focus.enter();
  }

  function closeWatch() {
    if (!A.watch) return;
    if (A.fd) { clearInterval(A.fd.timer); A.fd = null; }
    A.watch = false;
    $('watch').hidden = true;
    $('watch').innerHTML = '';          // removing the frame stops the audio
    stage.classList.remove('watch-on');
    resetIdle();
  }

  // ---- camera live view ----
  // wired cameras: may run while the cams workspace shows them; ends after cams.liveMinutes without
  //   interaction, and always when the workspace is left / ambient / dark (nothing streams unseen)
  // battery cameras: explicit tap only, 60 s, never automatic
  // transport: go2rtc H.264 over a websocket into MediaSource (settings cams.go2rtc), falling back to
  //   go2rtc JPEG frames, then to Home Assistant's camera proxy; three failures = "privacy mode"
  const camBase = () => (OW.config.get('cams.go2rtc') || '').replace(/\/+$/, '');
  const camSrc = (cam) => cam.id.split('.')[1] + '_h264';
  const passUrl = (url) => (OW.net.native ? '/net/pass?u=' + encodeURIComponent(url) : url);

  function startMse(cam, onFail) {
    const video = document.querySelector('.view.on .cam-vid.is-live');
    if (!video || !window.MediaSource) return onFail('no mse');
    let ws, sb = null, alive = true;
    const queue = [];
    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);
    const fail = (why) => { if (alive) { alive = false; onFail(why); } };
    try { ws = new WebSocket(camBase().replace(/^http/, 'ws') + '/api/ws?src=' + encodeURIComponent(camSrc(cam))); } catch (e) { return onFail('ws'); }
    ws.binaryType = 'arraybuffer';
    const CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'avc1.42E01E', 'mp4a.40.2', 'mp4a.40.5', 'flac', 'opus'];
    const hello = () => ws.send(JSON.stringify({ type: 'mse', value: CODECS.filter((c) => MediaSource.isTypeSupported('video/mp4; codecs="' + c + '"')).join() }));
    ms.addEventListener('sourceopen', () => { if (ws.readyState === 1) hello(); else ws.addEventListener('open', hello); }, { once: true });
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.type === 'error') return fail(m.value);
        if (m.type !== 'mse' || sb) return;
        try { sb = ms.addSourceBuffer(m.value); sb.mode = 'segments'; } catch (e) { return fail('codec'); }
        sb.addEventListener('updateend', () => {
          try {
            if (queue.length && !sb.updating) sb.appendBuffer(queue.shift());
            else if (!sb.updating && sb.buffered.length && sb.buffered.end(sb.buffered.length - 1) - sb.buffered.start(0) > 24) sb.remove(sb.buffered.start(0), sb.buffered.end(sb.buffered.length - 1) - 12);
            if (video.buffered.length) { const end = video.buffered.end(video.buffered.length - 1); if (end - video.currentTime > 2.5) video.currentTime = end - 0.4; }   // stay live
          } catch (e) { /* buffer was torn down */ }
        });
      } else if (sb) {
        try { if (sb.updating || queue.length) queue.push(ev.data); else sb.appendBuffer(ev.data); } catch (e) { fail('append'); }
      }
    };
    ws.onerror = () => fail('socket');
    ws.onclose = () => fail('closed');
    video.play().catch(() => {});
    video.addEventListener('playing', () => { video.classList.add('has-pic'); if (A.camLive) A.camLive.gotFrame = true; }, { once: true });
    // nothing on screen within 8 s = the stream is not coming (privacy mode ends go2rtc streams after ~5 s)
    const watchdog = setTimeout(() => { if (alive && !(video.videoWidth > 0 && video.currentTime > 0)) fail('no picture'); }, 8000);
    return { stop() { alive = false; clearTimeout(watchdog); try { ws.onclose = ws.onerror = null; ws.close(); } catch (e) { /* closed */ } try { video.removeAttribute('src'); video.load(); } catch (e) { /* gone */ } } };
  }

  /** true when an image is a single flat colour (what a stream without a decoded picture looks like) */
  function flatFrame(im) {
    try {
      const c = document.createElement('canvas'); c.width = 12; c.height = 8;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0, 12, 8);
      const d = g.getImageData(0, 0, 12, 8).data;
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; if (v < min) min = v; if (v > max) max = v; }
      return max - min < 6;
    } catch (e) { return false; }
  }

  function startCamLive() { toast('Live video unavailable · showing the last event'); }
  function stopCamLive(silent) {
    clearTimeout(A.camTimer);
    if (!A.camLive) return;
    clearTimeout(A.camLive.deadline);
    if (A.camLive.player) A.camLive.player.stop();
    A.camLive = null;
    if (!silent) OW.views.update('camlive');
  }
  /** entering the cams workspace: the first wired camera goes live on its own */
  function autoCamLive() {} // PW-16: last-event stills only, with no live probes.

  A.stopCamLive = stopCamLive;

  /** TV: whenever the wall comes to the front, "Back to Apple TV" is one OK-press away. */
  function focusBack() {
    if (!OW.isTV || A.seq || A.briefAlarm || A.snoozedUntil) return;
    const b = document.querySelector('.view.on [data-fid="back-atv"]');
    if (b) { OW.focus.setKb(true); OW.focus.focus(b); }
  }

  /**
   * Provisioning: a machine drops files/config.json onto the device with adb
   * ({"ha.url": "...", "ha.token": "...", "provider": "ha", "home.lat": 0, ...}).
   * The keys are merged into the private settings store and the file is deleted.
   */
  async function importConfig() {
    if (!OW.net.native) return;
    try {
      const r = await fetch('/net/local?f=config.json', { cache: 'no-store' });
      if (!r.ok) return;
      const cfg = await r.json();
      let n = 0;
      Object.keys(cfg).forEach((k) => { if (/^[a-zA-Z0-9_.]{1,60}$/.test(k)) { OW.config.set(k, cfg[k]); n++; } });
      if ((OW.demo?.active ? null : window.flightdayNative) && (OW.demo?.active ? null : window.flightdayNative).consumeLocal) (OW.demo?.active ? null : window.flightdayNative).consumeLocal('config.json');
      if (n) { OW.host.log('imported ' + n + ' settings from config.json'); toast('Settings imported (' + n + ')'); }
    } catch (e) { OW.host.log('config import failed: ' + e.message); }
  }
  A.importConfig = importConfig;

  const start=()=>{const launch=()=>{if(!OW.onboarding){boot();return;}importConfig().then(()=>OW.onboarding.start()).then(boot);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',launch);else launch();};
  if(typeof fetch==='function')OW.model.load().then(start);else start();
})();
