/* Workspaces and tiles. Each tile is a small render function over the data
 * layer (OW.data), the space service (OW.space), the usage feed (OW.usage) and
 * the background engine (OW.bg). Tiles re-render only when their topics change;
 * clocks, countdowns and progress bars tick through data-* hooks (see app.js). */
(function () {
  'use strict';
  const OW = window.OW;
  const { esc, icon, fmt } = OW;
  const D = () => OW.data.state;

  // ---- small builders ------------------------------------------------------------
  const chip = (text, tone, extra) => '<span class="chip' + (tone ? ' c-' + tone : '') + '"' + (extra || '') + '>' + text + '</span>';
  const dot = (status) => '<i class="dot d-' + status + '"></i>';
  const cd = (t, style, cls) => '<span class="' + (cls || '') + '" data-cd="' + t + '" data-cd-style="' + (style || 'span') + '"></span>';
  const btn = (fid, action, label, opts) => {
    opts = opts || {};
    return '<button class="btn' + (opts.cls ? ' ' + opts.cls : '') + '" data-focus data-fid="' + fid + '" data-act="' + action + '"' +
      (opts.arg != null ? ' data-arg="' + esc(opts.arg) + '"' : '') + '>' + (opts.icon ? icon(opts.icon) : '') + '<span>' + label + '</span>' + (opts.sub ? '<small>' + opts.sub + '</small>' : '') + '</button>';
  };
  const iconBtn = (fid, action, ic, label, opts) => {
    opts = opts || {};
    return '<button class="ibtn' + (opts.cls ? ' ' + opts.cls : '') + '" data-focus data-fid="' + fid + '" data-act="' + action + '"' + (opts.arg != null ? ' data-arg="' + esc(opts.arg) + '"' : '') + ' aria-label="' + label + '">' + icon(ic) + '</button>';
  };
  const toggle = (on) => '<i class="tog' + (on ? ' on' : '') + '"></i>';
  const bar = (pct, tone, hook) => '<div class="meter' + (tone ? ' m-' + tone : '') + '"><i style="transform:scaleX(' + (OW.clamp(pct, 0, 100) / 100).toFixed(3) + ')"' + (hook ? ' data-progress="' + hook + '"' : '') + '></i></div>';
  const empty = (text, ic) => '<div class="empty">' + icon(ic || 'satellite') + '<span>' + text + '</span></div>';
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600); return (h ? h + ':' + fmt.pad(Math.floor(s / 60) % 60) : Math.floor(s / 60)) + ':' + fmt.pad(s % 60); };
  const WX = { clear: 'sun', cloudy: 'cloud', rain: 'rain', storm: 'storm', snow: 'snow' };
  /** event colour: real calendars carry a css colour, demo data a palette name */
  const evTone = (e) => (e.css ? '" style="--tone:' + esc(e.css) : ' t-' + (e.color || 'acc'));
  /** honest placeholder for a tile whose source is not connected */
  const standby = (ic, title, hint, action) => '<div class="standby">' + icon(ic) + '<b>' + title + '</b><span>' + hint + '</span>' + (action || '') + '</div>';
  const HA_HINT = 'connects with Home Assistant';
  const statusLabel = st => ({'In Flight':'In flight', 'GO':'Go'}[st] || st);
  const statusTone = (st) => ({ Go: 'grn', 'In Flight': 'grn', Success: 'grn', Hold: 'red', Failure: 'red', TBC: 'yel', TBD: 'mut' }[st] || 'mut');

  function qrBlock(url, caption, cls) {
    if (!url) return '';
    const svg = OW.qr.svg(url, { margin: 2 });
    if (!svg) return '';
    return '<figure class="qrbox ' + (cls || '') + '">' + svg + '<figcaption>' + caption + '</figcaption></figure>';
  }
  OW.qrBlock = qrBlock;

  /** Line-art silhouette of a launch vehicle family (48 x 68 box, stroke only). */
  const VEHICLES = {
    starship: '<path d="M24 3c4 4 6 10 6 17v40H18V20c0-7 2-13 6-17zM18 30h12M18 46h12M18 22l-5 5v6l5-2M30 22l5 5v6l-5-2M18 54l-6 6v4l6-2M30 54l6 6v4l-6-2"/>',
    falcon9: '<path d="M24 4c2 2 3.5 5 3.5 9v6h-7v-6c0-4 1.500-7 3.500-9zM20.500 19h7v41h-7zM20.500 34h7M20.500 60l-4 5M27.500 60l4 5M22 60v5M26 60v5"/>',
    falconheavy: '<path d="M24 4c2 2 3.500 5 3.500 9v6h-7v-6c0-4 1.500-7 3.500-9zM20.500 19h7v41h-7zM13 24c1.500 1.500 2.500 3.500 2.500 6v30h-5V30c0-2.500 1-4.500 2.500-6zM35 24c1.500 1.500 2.500 3.500 2.500 6v30h-5V30c0-2.500 1-4.500 2.500-6zM15.500 40h5M27.500 40h5M10.500 60l-3 5M37.500 60l3 5M24 60v5"/>',
    newglenn: '<path d="M24 3c4 3 6 8 6 14v6H18v-6c0-6 2-11 6-14zM18 23h12v38H18zM18 38h12M18 56l-6 5v4h6M30 56l6 5v4h-6M18 28l-3 3v5l3-2M30 28l3 3v5l-3-2"/>',
    vulcan: '<path d="M24 4c3.500 3 5 7 5 12v8H19v-8c0-5 1.500-9 5-12zM19 24h10v37H19zM19 40h10M14 46c1 1 1.500 2 1.500 4v11h-3V50c0-2 .500-3 1.500-4zM34 46c1 1 1.500 2 1.500 4v11h-3V50c0-2 .500-3 1.500-4zM21 61l-2 4M27 61l2 4"/>',
    electron: '<path d="M24 8c1.500 1.500 2.500 4 2.500 7v5h-5v-5c0-3 1-5.500 2.500-7zM21.500 20h5v41h-5zM21.500 36h5M21.500 61l-2.500 4M26.500 61l2.500 4M24 61v4"/>',
    soyuz: '<path d="M24 4c2 2 3 5 3 8v8h-6v-8c0-3 1-6 3-8zM21 20h6v24h-6zM21 44l-7 16h6l1-9M27 44l7 16h-6l-1-9M21 44h6l2 17H19zM24 61v4"/>',
    generic: '<path d="M24 5c3 3 4.500 7 4.500 12v6h-9v-6c0-5 1.500-9 4.500-12zM19.500 23h9v38h-9zM19.500 40h9M19.500 56l-4 6v3h4M28.500 56l4 6v3h-4"/>',
  };
  function vehicle(l) {
    const t = ((l.rocket || '') + ' ' + (l.name || '')).toLowerCase();
    const k = /starship/.test(t) ? 'starship' : /falcon heavy/.test(t) ? 'falconheavy' : /falcon/.test(t) ? 'falcon9' : /new glenn/.test(t) ? 'newglenn' : /vulcan|atlas/.test(t) ? 'vulcan' : /electron|neutron/.test(t) ? 'electron' : /soyuz/.test(t) ? 'soyuz' : 'generic';
    return '<svg class="veh" viewBox="0 0 48 68" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + VEHICLES[k] + '</svg>';
  }

  /** pad + place without saying the same thing twice ("Rocket Lab Launch Complex 1A, Rocket Lab Launch Complex 1" -> pad, country) */
  function padLine(l) {
    const pad = (l.pad || '').trim(), loc = (l.location || '').split(',').map((x) => x.trim()).filter(Boolean);
    const first = loc[0] || '';
    const same = first && (pad.toLowerCase().includes(first.toLowerCase().slice(0, 12)) || first.toLowerCase().includes(pad.toLowerCase().slice(0, 12)));
    const place = same ? loc.slice(1).join(', ') : first;
    return [pad, place].filter(Boolean).join(', ');
  }
  OW.padLine = padLine;
  OW.vehicle = vehicle;
  /** calendar titles: "Required — Science — Class (1001)" -> title "Science", chips ["required"], note "Class" */
  function eventParts(title) {
    const parts = String(title || '').split(/\s+[—–-]\s+/).map((x) => x.trim()).filter(Boolean);
    const chips = [];
    if (parts.length > 1 && /^(required|optional|tentative|hold|fyi)$/i.test(parts[0])) chips.push(parts.shift().toLowerCase());
    const main = (parts.shift() || title || '').replace(/\s*\([^)]*\d{3,}[^)]*\)\s*$/, '');
    const note = parts.join(' · ').replace(/\s*\([^)]*\d{3,}[^)]*\)\s*$/, '');
    return { main, chips, note };
  }

  /** "Visible from home" line for a launch (empty when it is not) */
  function visibleLine(l, compact) {
    const v = OW.space.visibleFromHome(l);
    if (!v) return '';
    const special = v.twilight ? 'twilight — jellyfish plume possible' : v.night ? 'night launch' : '';
    return '<div class="vis' + (v.twilight ? ' tw' : '') + (compact ? ' compact' : '') + '">' + icon('globe') + '<b>visible from home</b><span>look ' + v.compass + ' (' + v.bearing + '°) · clears the horizon ~T+' + v.clearSec + ' s · ' + v.km + ' km' +
      (special ? ' · ' + special : '') + (v.boom ? ' · sonic boom possible on landing' : '') + '</span></div>';
  }
  OW.visibleLine = visibleLine;

  /** next personal event line pieces */
  function nextEvent() {
    const a = OW.data.agenda();
    return { agenda: a, ev: OW.agendaDay(a).next, current: OW.agendaDay(a).tomorrow ? null : a.current };
  }

  const climateTemp = (v, from) => OW.climate.fmt(OW.climate.convert(v, from, OW.config.get('units') === 'c' ? '°C' : '°F'), OW.config.get('units') === 'c' ? '°C' : '°F');
  function climateGlance() {
    const c=D().climate,m=D().smartComfort,v=D().robotVacuum?.homeLine;
    if(OW.smartComfort?.quiet())return '';
    let html='';
    if(c&&OW.climate&&(c.current!=null||c.available)){
      const n=m?.notice,suggest=m?.available&&!m.sleeping&&n?.kind==='suggest';
      const line=m?(suggest?n.text+' · Fresh air ›':m.statusLine):'Inside <b>'+climateTemp(c.current,c.unit)+'</b> · '+(c.available?OW.climate.mode(c.mode)+(OW.climate.activity(c.action)?' · '+OW.climate.activity(c.action):''):'Thermostat offline');
      html='<button class="climate-glance" data-focus data-fid="home-climate" data-act="climate.open" data-arg="'+(suggest?'fresh_air':'')+'">'+icon('thermostat')+'<span>'+(m?esc(line):line)+'</span></button>'+(m?.available&&!m.sleeping&&n?.kind!=='none'&&n?.kind!=='suggest'&&n?.text?'<p class="comfort-home-notice">'+esc(n.text)+'</p>':'');
    }
    return html+(v?'<button class="climate-glance vacuum-glance" data-focus data-fid="home-vacuum" data-act="vacuum.open">'+icon('home')+'<span>'+esc(v)+'</span></button>':'');
  }
  function comfortSummary(c=D().climate){if(!c?.comfort)return '';const temp=period=>c[period]?.temperatureF==null?'—':Number(c[period].temperatureF.toFixed(1))+'°';return '<p class="comfort-summary">Night '+temp('night')+' · Wake '+temp('wake')+' · Day '+temp('day')+' from '+OW.time.text(c.comfort.dayTime)+'</p>';}
  function climateRoutines(prefix) {
    const c=D().climate;if(!c?.id||!OW.climate)return '';
    const comfort=c.comfort||{},pending=!!OW.app.climatePending;
    const toggle='<button class="btn" data-focus data-fid="'+prefix+'-comfort-enabled" data-act="climate.comfort" data-arg="'+(comfort.enabled?'0':'1')+'"'+(!comfort.ready||pending?' disabled':'')+'>'+(!comfort.ready?'Unavailable':comfort.enabled?'On':'Off')+'</button>';
    const head='<div class="climate-routine"><div><b>Comfort schedule</b><small>'+(comfort.enabled?'Night → Wake → Day':'Off · scheduled changes paused')+'</small></div>'+toggle+'</div>';
    const rows=['night','wake','day'].map(period=>{
      const r=c[period]||{},locked=!r.ready||pending;
      const button=(suffix,kind,delta,label,disabled)=>'<button class="btn" data-focus data-fid="'+prefix+'-climate-'+period+'-'+suffix+'" data-act="climate.routine" data-arg="'+period+':'+kind+':'+delta+'"'+(locked||disabled?' disabled':'')+'>'+label+'</button>';
      const hint={night:'When you start Goodnight',wake:'At T−10 · wake time if alarm is off',day:'From '+OW.time.text(comfort.dayTime)+' · when awake, after wake'}[period];
      return '<div class="climate-routine"><div><b>'+period[0].toUpperCase()+period.slice(1)+' temperature</b><small>'+(r.ready?hint:'Temperature helper unavailable')+'</small></div><div class="climate-options">'+button('minus','step',-1,'−',r.temperatureF==null||r.temperatureF<=r.minF)+'<strong class="mono">'+OW.climate.fmt(r.temperatureF,'°F')+'</strong>'+button('plus','step',1,'+',r.temperatureF==null||r.temperatureF>=r.maxF)+'</div></div>';
    }).join('');
    const timeButton=(delta,label)=>'<button class="btn" data-focus data-fid="'+prefix+'-day-time-'+(delta<0?'dn':'up')+'" data-act="climate.routine" data-arg="day:time:'+delta+'"'+(!comfort.timeReady||pending?' disabled':'')+'>'+label+'</button>';
    return '<section class="climate-routines"><h3>Comfort</h3>'+comfortSummary(c)+head+rows+'<div class="climate-routine"><div><b>Day starts</b><small>Next occurrence · local time</small></div><div class="climate-options">'+timeButton(-15,'−15')+'<strong class="mono">'+OW.time.text(comfort.dayTime)+'</strong>'+timeButton(15,'+15')+'</div></div><p class="climate-hint">Keeps your Heat or Cool mode. Changes to the active period apply now.</p></section>';
  }
  // =================================================================================
  // HOME
  // =================================================================================
  const T = {};
  let V_sleep, V_refreshStale, V_space;
  T.thermostat = {
    title:()=>D().launch?.sleeping?'Climate':'Cabin climate', topics:['all','climate','comfort'],
    show() { return !!D().climate?.id&&!OW.smartComfort?.quiet(); },
    meta() { const c=D().climate;return c?.available ? chip(esc(D().smartComfort?.state==='auto'?'Auto':OW.climate.mode(c.mode)),c.mode==='heat'?'org':c.mode==='cool'?'acc':'mut') : chip('Offline','yel'); },
    render() {
      const c=D().climate,m=D().smartComfort;if(!c?.id||!OW.climate)return standby('thermostat','Add a thermostat','Settings → Integrations');
      if(OW.smartComfort?.quiet())return '<p class="comfort-status">Comfort is quiet for the night</p>';
      const locked=!c.available||!!OW.app.climatePending||!!OW.app.comfortPending;
      const disabled=extra=>locked||extra?' disabled':'';
      const action=OW.climate.activity(c.action),selected=m?.state==='auto'?'auto':c.mode;
      const modes=['auto','heat','cool','off'].filter(mode=>mode==='auto'?!!m:c.modes.includes(mode)).map(mode=>'<button class="'+(selected===mode?'on':'')+'" '+(selected===mode?'data-focus-first ':'')+'data-focus data-fid="climate-mode-'+mode+'" data-act="'+(mode==='auto'?'comfort.action':'climate.mode')+'" data-arg="'+(mode==='auto'?'resume':mode)+'"'+disabled(mode==='auto'&&!m?.scriptReady.resume)+'>'+(mode==='auto'?'Auto':OW.climate.mode(mode))+'</button>').join('');
      return '<p>'+esc(m?.available?'Smart Comfort · '+m.statusLine:'Thermostat')+'</p><div class="thermostat-scroll scroll"><div class="thermostat"><div class="climate-current">'+icon('thermostat')+'<b class="mono">'+climateTemp(c.current,c.unit)+'</b><span>Inside'+(c.available&&action?' · '+action:'')+'</span></div>'+
        (!c.available?'<p class="climate-note">'+(c.id?'Thermostat unavailable':'Add a thermostat in Settings → Integrations')+(c.at?' · as of '+fmt.hm(c.at):'')+'</p>':'')+
        '<div class="seg climate-modes">'+modes+'</div>'+
        '<div class="climate-setpoint"><button class="ibtn" data-focus data-fid="climate-minus" data-act="climate.step" data-arg="-1" aria-label="Lower setpoint"'+disabled(c.target==null||c.min==null||c.target<=c.min)+'>'+icon('minus')+'</button><div><small>Setpoint · manual hold</small><b class="mono">'+climateTemp(c.target,c.unit)+'</b></div><button class="ibtn" data-focus data-fid="climate-plus" data-act="climate.step" data-arg="1" aria-label="Raise setpoint"'+disabled(c.target==null||c.max==null||c.target>=c.max)+'>'+icon('plus')+'</button></div>'+
        '<p class="climate-note">'+(OW.app.climatePending?'Waiting for Home Assistant…':c.available&&c.target==null?'Choose Heat or Cool to see its setpoint':c.available?'Adjusts by '+OW.climate.fmt(c.step,c.unit):'Controls are locked until it reconnects')+'</p></div>'+(OW.smartComfort?.card()||'')+(OW.smartComfort?.roomsHtml()||'')+comfortSummary(c)+'<button class="btn" data-focus data-fid="thermostat-comfort-settings" data-act="comfort.settings">Comfort settings ›</button></div>';
    },
  };
  T.robotVacuum={title:()=>D().robotVacuum?.name||'Robot vacuum',topics:['all','vacuum'],show(){return !!D().robotVacuum?.present;},meta(){return D().robotVacuum?.fault?chip('Needs a hand','yel'):'';},render(){return OW.robotVacuum?.render()||'';}};
  T.houseCheck={title:()=>D().launch?.sleeping?'House check':'Systems check',topics:['all','house-check'],show(){return OW.data.contract===3?!!OW.model.config.modules.house_check:!!OW.houseCheck&&!OW.houseCheck.quiet();},render(){return OW.data.contract===3&&OW.integrations?OW.integrations.checksHtml():OW.houseCheck.card();}};
  T.comfortHealth={title:'Comfort',topics:['all','comfort'],show(){return !!D().smartComfort&&!OW.smartComfort?.quiet();},render(){const m=D().smartComfort;return '<div class="scroll"><p class="comfort-status">'+esc(m.statusLine)+'</p>'+(m.sleeping?'':OW.smartComfort.notice('status'))+(m.roomNotice?'<p role="status">'+esc(m.roomNotice)+'</p>':'')+'</div>';}};

  /**
   * Home is personal. Space gets one line there — unless a launch is about to happen: within an
   * hour, pinned and within a day, or live. Then (and only then) it takes over the hero tile.
   */
  function heroLaunch() {
    const S = OW.space, f = S.focus, now = OW.nowMs();
    if (!f) return null;
    const live = S.live && S.live.id === 'l' + f.id;
    const soon = f.precise && f.net - now <= 3600000 && now - f.net < 30 * 60000;
    const pinned = S.tracked === 'l' + f.id && f.net - now <= 86400000;
    return live || soon || pinned ? f : null;
  }
  /** "Next: Starship Flight 15 · T-2d 4h · Watch" — the whole of space on Home when nothing is imminent */
  function spaceLine() {
    const S = OW.space, now = OW.nowMs();
    const l = S.focus || S.launches.find((x) => x.net > now && x.status !== 'TBD') || S.launches.find((x) => x.net > now);
    if (!l) return '';
    const link = l.webcast;
    return '<div class="spaceline"><button class="sp-go" data-focus data-fid="sp-line" data-act="ws" data-arg="space">' + icon('rocket') + '<span class="k">Next</span><b>' + esc(l.rocket) + '</b><span class="dim">' + esc(l.mission) + '</span>' +
      (l.precise ? cd(l.net, 'tminus', 'mono') : '<span class="mono">NET ' + fmt.monthDay(l.net) + '</span>') + '</button>' +
      (link ? '<button class="watchpill' + (l.webcastLive ? ' live' : '') + '" data-focus data-fid="sp-watch" data-act="watch" data-arg="' + esc(link) + '">' + icon('play') + '<span>' + (l.webcastLive ? 'Watch live' : 'Watch') + '</span></button>' : '') + '</div>';
  }

  T.hero = {
    title() { return heroLaunch() ? 'launch control' : 'now'; }, topics: ['events', 'weather', 'launches', 'all', 'schedule', 'live-start'],
    attrs: 'data-focus data-focus-first data-fid="hero" data-act="ambient"',
    meta() {
      const s = OW.config.get('schedule');
      const f = heroLaunch();
      const live = OW.space.live;
      return (f ? chip((live ? '<i class="pulse"></i>' : '') + esc(statusLabel(f.status === 'Go' ? 'Go' : f.statusName || f.status)), statusTone(f.status)) : '') +
        (D().launch ? chip(icon('rocket', 'tiny') + (D().launch.enabled ? 'launch ' + OW.time.text(D().launch.time) : 'Alarm off'), D().launch.enabled ? 'acc' : 'mut')
          : chip(s.launchEnabled ? 'auto · ' + OW.time.text(s.launch) : 'auto off', 'mut')) +
        (OW.isTV && D().weather ? '<span class="wx-source" title="'+esc(OW.weatherSource.credit(D().weather))+'">'+esc(OW.weatherSource.credit(D().weather))+'</span>'+OW.weatherLink.button("hero-weatherProvider") : '');
    },
    render() {
      const s = D(), w = s.weather, f = heroLaunch();
      const { ev, current, agenda } = nextEvent();
      const rain=OW.isTV ? OW.rainNowcast.html(w) : '',appleCredit=OW.isTV?OW.rainNowcast.credit(w,'hero-apple-credit'):'';
      const weather = w ? '<div class="wx">' + icon(wxIcon(w)) + '<div><b>' + w.temp + w.unit + '</b><span>' + esc(w.text) + (w.high != null ? ' · H ' + w.high + '° L ' + w.low + '°' : '') + '</span>'+rain+appleCredit+'</div></div>' : '';
      const personal = ev
        ? '<div class="tminus' + (f ? ' small' : '') + '">' + icon('clock') + '<span class="k">T-minus</span> ' + cd(ev.start, 'span', 'v') + ' <span class="sep">·</span> <span class="what">' + esc(ev.title) + '</span></div>'
        : (s.calendar && !s.calendar.available && !OW.data.isDemo('events')) ? (f ? '' : '<div class="tminus">' + icon('calendar') + '<span class="what">Calendar not connected</span></div>')
        : '<div class="tminus' + (f ? ' small' : '') + '">' + icon('calendar') + '<span class="what">Nothing else on the manifest</span></div>';
      let leave = '';
      if (ev && ev.travelMin) {
        const lb = ev.start - ev.travelMin * 60000;
        leave = 'Leave by <b>' + fmt.hm(lb) + '</b> · ' + ev.travelMin + ' min drive';
      } else if (!current && ev && ev.where) leave = esc(ev.where);
      if (w && w.note) leave += (leave ? ' · ' : '') + esc(OW.time.inline(w.note));

      if (f) {
        // launch-day mode: the launch takes over the hero tile
        // the webcast opens on this screen (no QR detour through a phone)
        const link = f.webcast || f.info;
        const qr = link ? '<button class="watchpill' + (f.webcastLive ? ' live' : '') + '" data-focus data-fid="hero-watch" data-act="watch" data-arg="' + esc(link) + '">' + icon('play') + '<span>' + (f.webcastLive ? 'Watch live' : f.webcast ? 'Watch' : 'Mission page') + '</span></button>' : '';
        return '<div class="hero launchday">' +
          '<div class="hero-top"><div class="clockrow"><div class="clock mid" data-clock="hm"></div><div class="date" data-clock="dateshort"></div></div>' + weather + '</div>' +
          climateGlance() + '<div class="ld"><div class="ld-main">' +
            '<div class="ld-eyebrow"><span>' + esc(f.provider) + '</span>' + (f.orbit ? '<em>' + esc(f.orbit) + '</em>' : '') + '</div>' +
            '<div class="ld-name">' + esc(f.rocket) + ' <span>· ' + esc(f.mission) + '</span></div>' +
            '<div class="ld-count" data-cd="' + f.net + '" data-cd-style="tminus"></div>' +
            '<div class="ld-meta">' + icon('pin') + '<span>' + esc(padLine(f)) + ' · NET ' + fmt.when(f.net) + '</span>' + qr + '</div>' +
            (f.update && OW.nowMs() > f.net ? '<div class="ld-update"><b>' + esc(statusLabel(f.statusName || f.status)) + '</b><span>' + esc(f.update.text) + '</span><em data-cd="' + f.update.at + '" data-cd-style="ago"></em></div>' : '') +
            visibleLine(f) +
          '</div></div></div>';
      }

      // day timeline: 06:00 → 24:00 with events and a "now" playhead
      const n = OW.now();
      const d0 = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 6).getTime(), span = 18 * 3600000;
      const pos = (t) => OW.clamp(((t - d0) / span) * 100, 0, 100);
      const marks = agenda.today.filter((e) => !e.allDay).map((e) => '<i class="tl-ev s-' + e.state + (e.css ? '' : ' t-' + e.color) + '" style="' + (e.css ? '--tone:' + esc(e.css) + ';' : '') + 'left:' + pos(e.start).toFixed(2) + '%;width:' + Math.max(0.9, pos(e.end) - pos(e.start)).toFixed(2) + '%"></i>').join('');
      const timeline = '<div class="tl"><div class="tl-track">' + marks + '<i class="tl-now" data-daypos></i></div><div class="tl-axis">'+['06:00','09:00','12:00','15:00','18:00','21:00','00:00'].map(t=>'<span>'+OW.time.text(t)+'</span>').join('')+'</div></div>';
      const nextLaunch = spaceLine();

      // far field: the time and the one thing that matters next (an event today, otherwise the wake time)
      const M = sleepModel(), hour = OW.now().getHours(), T2 = M.target;
      const soonEv = current || (ev && ev.start - OW.nowMs() < 16 * 3600000 ? ev : null);
      const far = current ? '<em>now</em><b>' + esc(current.title) + '</b><span>until ' + fmt.hm(current.end) + '</span>'
        : soonEv && !(hour >= 20 && T2) ? '<em>next</em><b>' + esc(soonEv.title) + '</b><span class="far-summary"><span class="event-when">' + fmt.when(soonEv.start) + '</span><span class="event-in">· in ' + cd(soonEv.start, 'span') + '</span></span>'
        : T2 ? '<em>wake</em><b class="mono far-wake-clock">' + OW.time.text(T2.time) + '</b><span>' + T2.label.toLowerCase() + (M.master && T2.on ? ' · alarm on' : ' · alarm off') + '</span>'
        : ev ? '<em>next</em><b>' + esc(ev.title) + '</b><span>' + fmt.when(ev.start) + '</span>' : '';
      const wxLine = w ? '<span class="nearwx">' + icon(wxIcon(w)) + '<b>' + w.temp + w.unit + '</b> ' + '<span class="wx-short">'+esc(OW.time.inline(OW.isTV?[OW.weatherSource.feel(w),w.summary||w.text].filter(Boolean).join(' · '):w.summary||w.text)) + '</span></span>' : '';
      return '<div class="hero'+(rain?' has-rain':'')+'">' +
        '<div class="farline"><div class="clock" data-clock="hm"></div>' + (far ? '<div class="far">' + far + '</div>' : '') + '</div>' +
        '<div class="near"><span data-clock="date"></span>' + wxLine + appleCredit + '</div>' + rain + climateGlance() +
        (leave ? '<div class="leave">' + leave + '</div>' : '') + '<div class="grow"></div>' +
        timeline + nextLaunch + (OW.integrations?.linesHtml('home')||'') + '</div>';
    },
  };

  T.today = {
    title() { return OW.agendaDay(OW.data.agenda()).label; }, topics: ['events', 'tasks', 'all'],
    meta() {
      const s = D();
      if (OW.data.isDemo('events')) return chip('demo', 'yel');
      if (s.calendar && !s.calendar.available) return chip('standby', 'mut');
      const a = OW.data.agenda(); const left = OW.agendaDay(a).events.filter((e) => e.state !== 'past' && !e.allDay).length;
      if (left) return '<span>' + left + ' to go</span>';
      // nothing left today: say what is next instead of "0 to go"
      return a.next ? '<span>next · ' + fmt.when(a.next.start) + '</span>' : '<span>clear</span>';
    },
    render() {
      const s = D(), a = OW.data.agenda();
      if (s.calendar && !s.calendar.available && !OW.data.isDemo('events')) {
        return s.calendar.reason === 'permission'
          ? standby('calendar', 'Calendar access needed', 'allow it once and your real agenda shows here', '<button class="btn" data-focus data-fid="cal-perm" data-act="calendar.permission">' + icon('check') + '<span>Allow calendar</span></button>')
          : standby('calendar', 'Add a calendar', 'Settings → Integrations');
      }
      const row = (e) => { const p = eventParts(e.title); return '<div class="ev s-' + e.state + '"><i class="evbar' + evTone(e) + '"></i><em>' + (e.allDay ? 'all day' : fmt.hm(e.start)) + '</em><div class="evt"><b>' + esc(p.main) + '</b>' +
        '<span>' + p.chips.map((c) => '<i class="evchip">' + esc(c) + '</i>').join('') + esc([p.note, e.where].filter(Boolean).join(' · ')) + '</span></div>' +
        (e.state === 'now' ? chip('now', 'grn') : e.state === 'next' ? cd(e.start, 'span', 'evcd') : '') + '</div>'; };
      // row budget depends on how tall the tile is in the current home layout
      let room = V.homeMode === 'tv' ? 4 : 9;   // rows are two lines tall
      const tasks = OW.data.has('tasks') ? s.tasks.slice(0, 5) : [];
      const day = OW.agendaDay(a), today = day.events.filter((e) => !(e.allDay && e.state === 'past'));
      let html = '<div class="evs">' + (today.slice(0, room - 1).map(row).join('') || '<div class="ev s-later quiet"><i class="evbar"></i><div class="evt"><b>Nothing scheduled ' + day.label.toLowerCase() + '</b></div></div>') + '</div>';
      room -= Math.max(1, Math.min(today.length, room - 1));
      if (tasks.length && room >= tasks.length + 1) {
        const open = s.tasks.filter((t) => !t.done).length;
        html += '<div class="subhead"><span>tasks &amp; chores' + (OW.data.isDemo('tasks') ? ' · demo' : '') + '</span><span>' + open + ' open</span></div><div class="rows">' +
          tasks.map((t) => '<button class="row task' + (t.done ? ' done' : '') + '" data-focus data-fid="task-' + t.id + '" data-act="task.toggle" data-arg="' + t.id + '">' + icon(t.done ? 'boxcheck' : 'box') + '<span class="grow">' + esc(t.title) + '</span><span class="mini">' + esc(t.meta || '') + '</span></button>').join('') + '</div>';
        room -= tasks.length + 1;
      }
      // then look ahead: tomorrow, and the days after, while there is room
      const days = new Map();
      (day.tomorrow ? [] : a.tomorrow).concat(a.later || []).forEach((e) => { const k = new Date(e.start).toDateString(); if (!days.has(k)) days.set(k, []); days.get(k).push(e); });
      let first = true;
      for (const [, list] of days) {
        if (room < 2) break;
        const take = list.slice(0, room - 1);
        html += '<div class="subhead"><span>' + (first && a.tomorrow.length ? 'tomorrow' : fmt.dateLong(list[0].start).split(',')[0].toLowerCase()) + '</span><span>' + fmt.monthDay(list[0].start) + (list.length > take.length ? ' · +' + (list.length - take.length) : '') + '</span></div><div class="evs">' +
          take.map((e) => { const p = eventParts(e.title); return '<div class="ev s-later compact"><i class="evbar' + evTone(e) + '"></i><em>' + (e.allDay ? 'all day' : fmt.hm(e.start)) + '</em><div class="evt"><b>' + esc(p.main) + '</b><span>' + p.chips.map((c) => '<i class="evchip">' + esc(c) + '</i>').join('') + esc([p.note, e.where].filter(Boolean).join(' · ')) + '</span></div></div>'; }).join('') + '</div>';
        room -= take.length + 1;
        first = false;
      }
      return html;
    },
  };

  T.scenes = {
    title: 'scenes', topics: ['scenes', 'all'],
    show() { return OW.data.has('scenes') && D().scenes.some((x) => x.ha); },
    meta() { return OW.data.isDemo('scenes') ? chip('demo', 'yel') : ''; },
    render() {
      const s = D();
      return '<div class="scenes">' + s.scenes.filter((x) => x.ha).map((sc) =>
        '<button class="scene t-' + sc.tone + (s.activeScene === sc.id ? ' on' : '') + '" data-focus data-fid="scene-' + sc.id + '" data-act="scene" data-arg="' + sc.id + '"'+(sc.blocked?' disabled aria-disabled="true"':'')+'>' +
        '<i class="sico">' + icon(sc.icon) + '</i><b>' + esc(sc.name) + '</b><small>' + esc(sc.blockedReason||sc.sub) + '</small></button>').join('') + '</div>';
    },
  };

  function art(kind) { return '<div class="art placeholder a-' + kind + '" aria-hidden="true">' + icon(kind === 'tv' ? 'tv' : 'music') + '</div>'; }

  T.playing = {
    title: 'now playing', topics: ['media', 'all'],
    needs: 'nowPlaying', standby: () => standby('music', 'Add a player', 'Settings → Integrations'),
    meta() { return '<span>' + esc(String(D().nowPlaying.room || '').toLowerCase()) + '</span>'; },
    render() {
      const np = D().nowPlaying, playing = np.state === 'playing';
      if (np.state === 'idle') return '<div class="np-idle">' + icon('speaker') + '<div class="grow"><b>Nothing playing</b><span>' + esc(np.device || np.room || '') + '</span></div>' +
        (np.volume != null ? '<span class="mini mono">vol ' + np.volume + '</span>' : '') + '</div>';
      return '<div class="np">' + (np.art ? '<div class="art real"><img src="' + esc(np.art) + '" alt=""></div>' : art('music')) + '<div class="np-main"><div class="np-title">' + esc(np.title) + '</div><div class="mini">' + esc([np.artist, np.device].filter(Boolean).join(' · ')) + '</div>' +
        (np.durationSec ? '<div class="np-prog">' + bar(0, '', 'np') + '<div class="np-times"><span data-pos="np"></span><span>' + mmss(np.durationSec) + '</span></div></div>' : '') +
        '<div class="ctl">' + iconBtn('np-prev', 'media.prev', 'prev', 'previous') + iconBtn('np-play', 'media.playpause', playing ? 'pause' : 'play', 'play / pause', { cls: 'primary' }) + iconBtn('np-next', 'media.next', 'next', 'next') +
        '<span class="vol">' + iconBtn('np-vdn', 'media.volume', 'minus', 'volume down', { arg: -4, cls: 'sm' }) + '<span class="volbar">' + icon('volume') + bar(np.volume || 0) + '<em>' + (np.volume != null ? np.volume : '') + '</em></span>' + iconBtn('np-vup', 'media.volume', 'plus', 'volume up', { arg: 4, cls: 'sm' }) + '</span></div>' +
        '</div></div>';
    },
  };

  T.lights = {
    title: 'lights', topics: ['lights', 'all'],
    needs: 'lights', standby: () => standby('bulb', 'Add lights', 'Settings → Integrations'),
    meta() { const on = D().lights.filter((l) => l.on).length; return '<span>' + on + ' on</span>'; },
    render() {
      return '<div class="lights-slot"><div class="rows lights scroll">' + D().lights.map((l) => '<button class="row light' + (l.on ? ' on' : '') + '" data-focus data-fid="light-' + l.id + '" data-act="light.toggle" data-arg="' + l.id + '">' +
        icon(l.kind === 'plug' ? 'plug' : 'bulb') + '<span class="grow">' + esc(l.name) + '</span><span class="mini">' + (l.on ? (l.kind === 'plug' ? 'on' : l.level + '%') : 'off') + '</span>' + toggle(l.on) + '</button>').join('') +
        '</div></div><div class="rowbtns"><span class="lights-more" aria-hidden="true" hidden>↕ More</span>' + btn('lights-off', 'light.all', 'All off', { arg: '0', icon: 'moon' }) + btn('lights-on', 'light.all', 'All on', { arg: '1', icon: 'sun' }) + '</div>';
    },
  };

  T.missions = {
    title: 'missions', topics: ['launches', 'events', 'crew', 'news', 'iss', 'live-start'],
    attrs: 'data-focus data-fid="missions" data-act="ws" data-arg="space"',
    meta() { const l = OW.space.live; return l ? chip('<i class="pulse"></i>live', 'red') : '<span>Space ›</span>'; },
    render() {
      const S = OW.space, now = OW.nowMs();
      const nl = S.focus || S.launches.find((l) => l.net > now - 20 * 60000 && !/Success|Failure/.test(l.status));
      const ne = S.events.find((e) => e.date > now && e.dayPrecise);
      const rows = [];
      const lrow = (l) => '<div class="mrow">' + icon('rocket') + '<div class="grow"><b>' + esc(l.rocket) + '</b><span>' + esc(l.mission) + '</span></div>' + (l.precise ? cd(l.net, 'tminus', 'mono') : '<span class="mono">' + fmt.when(l.net, false) + '</span>') + chip(esc(statusLabel(l.status)), statusTone(l.status)) + '</div>';
      if (nl) rows.push(lrow(nl));
      if (V.homeMode !== 'house') S.launches.filter((l) => nl && l.id !== nl.id && l.net > now).slice(0, 1).forEach((l) => rows.push(lrow(l)));
      if (ne) rows.push('<div class="mrow">' + icon('orbit') + '<div class="grow"><b>' + esc(ne.name) + '</b><span>' + esc(ne.type) + '</span></div><span class="mono">' + (ne.precise ? fmt.when(ne.date) : fmt.monthDay(ne.date)) + '</span></div>');
      if (S.crew.count) rows.push('<div class="mrow">' + icon('people') + '<div class="grow"><b>' + S.crew.count + ' in space</b><span>' + S.crew.stations.map((s) => esc(s.short) + ' ' + s.people.length).join(' · ') + '</span></div></div>');
      rows.push('<div class="mrow">' + icon('satellite') + '<div class="grow"><b>ISS</b><span data-iss="where">acquiring signal…</span></div><span class="mono" data-iss="pass"></span></div>');
      if (V.homeMode !== 'house' && S.news[0]) rows.push('<div class="mrow">' + icon('news') + '<div class="grow"><span class="headline">' + esc(S.news[0].title) + '</span></div></div>');
      return rows.length ? '<div class="mrows">' + rows.join('') + '</div>' : empty('No mission data yet — waiting for uplink');
    },
  };

  T.panel = {
    title() { return OW.mode === 'tv' ? 'this screen' : 'this wall'; }, topics: ['machines', 'scenes', 'all'],
    meta() { const p = D().panel; return p ? '<span>' + (p.tempC != null ? p.tempC + '°C' : '') + (p.rssi != null ? ' · ' + p.rssi + ' dBm' : '') + '</span>' : ''; },
    render() {
      const s = D(), p = s.panel;
      const stat = (label, value, unitText) => '<div><em>' + label + '</em><b>' + value + '</b><span>' + unitText + '</span></div>';
      const stats = p ? '<div class="netgrid four">' + stat('soc', p.tempC != null ? p.tempC : '–', '°C') + stat('cpu', p.cpuPct != null ? p.cpuPct : '–', '%') + stat('mem', p.memPct != null ? p.memPct : '–', '%') + stat('ping', p.pingMs != null ? p.pingMs : '–', 'ms') + '</div>' : '';
      return stats + '<div class="scenes">' + s.scenes.slice(0, 4).map((sc) =>
        '<button class="scene t-' + sc.tone + (s.activeScene === sc.id && !sc.local ? ' on' : '') + '" data-focus data-fid="scene-' + sc.id + '" data-act="scene" data-arg="' + sc.id + '"'+(sc.blocked?' disabled aria-disabled="true"':'')+'>' +
        '<i class="sico">' + icon(sc.icon) + '</i><b>' + esc(sc.name) + '</b><small>' + esc(sc.blockedReason||sc.sub) + '</small></button>').join('') + '</div>';
    },
  };

  // Apple TV handoff (TV mode): what the Apple TV was doing + the way back to it
  const handoffAvailable=()=>OW.roles.get('tvs')?.length&&!(OW.data.client?.hasEntityInfo&&OW.data.client.info?.principal==='screen'&&!D().handoff);
  T.handoff = {
    title: () => handoffAvailable() ? 'apple tv' : 'weather', topics: ['all', 'media', 'tv', 'weather'],
    meta() { if(!handoffAvailable())return D().weather?T.weather.meta():'';const h = D().handoff; return h ? chip(h.active ? 'playing' : h.asleep ? 'asleep' : esc(h.state || 'idle'), h.active ? 'grn' : 'mut') : chip(OW.data.status.provider === 'ha' && OW.data.status.connected ? 'set room in settings' : 'HDMI', 'mut'); },
    render() {
      if(!handoffAvailable())return D().weather?T.weather.render():standby('cloud','Weather','The forecast will appear here');
      const h = D().handoff;
      const has = h && h.hasMedia && !h.asleep;
      const prog = has && h.durationSec ? '<div class="np-prog">' + bar((OW.data.position(h) / h.durationSec) * 100) + '</div>' : '';
      const info = has
        ? '<div class="ho-art">' + (h.art ? '<img src="' + esc(h.art) + '" alt="">' : icon('tv')) + '</div><div class="ho-main"><em>continue watching</em><b>' + esc(h.title) + '</b><span>' + esc([h.artist, h.app].filter(Boolean).join(' · ')) + '</span>' + prog + '</div>'
        : '<div class="ho-art">' + icon('tv') + '</div><div class="ho-main"><em>' + (h ? 'apple tv' : 'hdmi') + '</em><b>' + (h ? (h.asleep ? 'Apple TV is asleep' : 'Apple TV is ' + esc(h.state === 'paused' ? 'paused' : 'idle') + (h.app ? ' · ' + esc(h.app) : '')) : 'Apple TV') + '</b><span>' + (h ? 'pick up the Siri remote, or head back from here' : 'now-playing details arrive with Home Assistant') + '</span></div>';
      return '<div class="handoff">' + info + '</div><div class="rowbtns"><button class="btn big primary" data-focus data-focus-first data-fid="back-atv" data-act="tv.back">' + icon('exit') + '<span>Back to Apple TV</span></button>' +
        (has ? '<button class="btn big" data-focus data-fid="atv-play" data-act="tv.resume">' + icon('play') + '<span>Resume</span></button>' : '') + '</div>';
    },
  };

  // TV home: the launcher row — HDMI inputs first (Apple TV leads), then installed TV apps, settings
  T.apps = {
    show(){const l=OW.app.tvList;return !!(l&&(l.apps?.length||l.inputs?.length))||!OW.demo?.active&&OW.host?.info?.flavor!=='public'&&!!OW.config.legacyTvPskAllowed?.();},
    title: () => !OW.roles.get('tvs')?.length&&!OW.app.tvList?.apps?.length&&!OW.app.tvList?.inputs?.length?'make it yours':'apps & inputs', topics: ['tvlist','all'],
    meta() { const l = OW.app.tvList; return l ? '<span>' + (l.atv && l.atv.length ? l.atv.length + ' on Apple TV · ' : '') + l.apps.length + ' on this TV · ' + l.inputs.length + ' input' + (l.inputs.length === 1 ? '' : 's') + '</span>' : ''; },
    render() {
      const l = OW.app.tvList;
      if(!T.apps.show())return '';
      if(!OW.roles.get('tvs')?.length&&(!l||(!l.inputs.length&&!l.apps.length)))return '<div class="core-add"><p>Your alarm and day are ready. Add optional devices in Settings.</p><div class="rowbtns">'+['Add a speaker','Add lights','Add a TV'].map(label=>'<button class="btn" data-focus data-act="settings">'+esc(label)+'</button>').join('')+'</div></div>';
      if (!l || (!l.inputs.length && !l.apps.length)) return standby('grid', 'No apps found', OW.isTV ? 'the TV has not reported its apps yet' : 'the launcher row appears on a TV');
      const input = (i) => '<button class="app input' + (i.apple ? ' apple' : '') + '" data-focus data-fid="in-' + OW.hash(i.id) + '" data-act="tv.input.go" data-arg="' + esc(i.id) + '">' + icon(i.apple ? 'tv' : 'input') + '<b>' + esc(i.label) + '</b><small>' + esc(i.sub) + '</small></button>';
      const app = (a) => '<button class="app' + (a.banner ? '' : ' nobanner') + '" data-focus data-fid="app-' + OW.hash(a.pkg) + '" data-act="tv.launch" data-arg="' + esc(a.pkg + '|' + a.cls) + '" aria-label="' + esc(a.label) + '">' +
        (a.banner ? '<img src="/net/appbanner?pkg=' + encodeURIComponent(a.pkg) + '" alt="" loading="lazy">' : '<b>' + esc(a.label) + '</b>') + '</button>';
      // primary: the Apple TV and its apps; secondary: what lives on the televisionAdapter itself
      const apple = l.inputs.filter((i) => i.apple), other = l.inputs.filter((i) => !i.apple);
      const onAtv = (a) => '<button class="app atv' + (a.banner ? '' : ' text') + '" data-focus data-fid="atv-' + OW.hash(a.name) + '" data-act="atv.launch" data-arg="' + esc(a.name) + '" aria-label="' + esc(a.label) + ' on Apple TV">' +
        '<b>' + esc(a.label) + '</b>' + '<i>' + icon('tv') + 'Apple TV</i></button>';
      const projectivy = l.apps.filter((a) => a.pkg === 'com.spocky.projengmenu'), televisionAdapter = l.apps.filter((a) => a.pkg !== 'com.spocky.projengmenu');
      return '<div class="apps-row scroll">' + apple.map(input).join('') + (l.atv || []).map(onAtv).join('') +
        '<span class="apps-sep"><em>this tv</em></span>' + televisionAdapter.map(app).join('') + other.map(input).join('') +
        '<button class="app input" data-focus data-fid="app-settings" data-act="android.settings">' + icon('gear') + '<b>Settings</b><small>Android TV</small></button>' + projectivy.map(app).join('') + '</div>';
    },
  };

  T.usageMini = {
    title: 'Plan limits', topics: ['usage'],
    attrs: 'data-focus data-fid="usage-mini" data-act="ws" data-arg="status"',
    meta() { return T.usage.meta(); },
    render() {
      const u = OW.usage.data;
      if (!u) return standby('gauge', 'No usage report yet', 'run collector/usage-collector and publish usage.json');
      const running = u.threads.filter((t) => t.status === 'running');
      return '<div class="umini">' + u.providers.map((p) => {
        const w = p.fiveHour || p.weekly, tone = p.limitHit || (w && w.pct >= 90) ? 'red' : w && w.pct >= 70 ? 'yel' : '';
        return '<div class="uwin t-' + p.tone + '"><span class="uname">' + esc(p.label) + '</span>' + bar(w ? w.pct : 0, tone) + '<em>' + (w ? Math.round(w.pct) + '%' : '–') + '</em><small>' + (p.limitHit ? 'limit hit' : (p.fiveHour ? '5 h' : p.weekly ? 'week' : '') + ' · ' + fmt.tokens(p.tokensToday) + ' today') + '</small></div>';
      }).join('') + '</div>' +
        '<div class="subhead"><span>agents</span><span>' + running.length + ' running</span></div><div class="rows">' +
        (u.threads.slice(0, 3).map((t) => '<div class="row two">' + dot(t.status === 'running' ? 'ok' : t.status === 'error' ? 'err' : 'off') + '<div class="grow"><b>' + esc(t.title) + '</b><span>' + esc(t.machine) + '</span></div><span class="mini">' + (t.status === 'running' && t.startedAt ? cd(t.startedAt, 'since') : esc(t.status)) + '</span></div>').join('') || '<div class="row"><span class="grow dim">no threads reported</span></div>') + '</div>';
    },
  };

  // =================================================================================
  // MEDIA
  // =================================================================================
  T.tv = {
    title: 'tvs', topics: ['tv', 'all', 'media'],
    needs: 'tv',
    show() { return OW.data.has('tv') || OW.data.has('bedroomTv'); },
    meta() { const n = [D().tv, D().bedroomTv].filter((t) => t && t.power).length; return '<span>' + n + ' on</span>'; },
    render() {
      const tvs = [[D().tv, 'living'], [D().bedroomTv, 'bedroom']].filter((x) => x[0]);
      const lead = tvs.map((x) => x[0]).find((t) => t.power && t.title && t.art);
      const hero = lead ? '<div class="np tvhero"><div class="art real"><img src="' + esc(lead.art) + '" alt=""></div><div class="np-main"><div class="np-title">' + esc(lead.title) + '</div><div class="mini">' + esc([lead.app, lead.sub, lead.room].filter(Boolean).join(' · ')) + '</div>' +
        (lead.durationSec ? '<div class="np-prog">' + bar((OW.data.position(lead) / lead.durationSec) * 100) + '<div class="np-times"><span class="mono">' + mmss(OW.data.position(lead)) + '</span><span class="mono">' + mmss(lead.durationSec) + '</span></div></div>' : '') + '</div></div>' : '';
      const row = ([tv, key]) => '<div class="tvrow' + (tv.power ? ' on' : '') + '">' + dot(tv.power ? 'ok' : 'off') + '<div class="grow"><b>' + esc(tv.room || tv.name) + '</b><span>' + esc(!tv.power ? 'off' : [tv.title || tv.app || 'on', tv.title ? tv.app : '', tv.sub].filter((x, i, l) => x && l.indexOf(x) === i).join(' · ')) + '</span></div>' +
        (tv.power && tv.input ? chip(esc(String(tv.input).toLowerCase()), 'mut') : '') + (tv.volume != null && tv.power ? '<span class="mini mono">vol ' + tv.volume + '</span>' : '') +
        (tv.appleTv && tv.power && key === 'living' ? iconBtn('tv-play', 'tv.playpause', tv.state === 'playing' ? 'pause' : 'play', 'play / pause', { cls: 'sm' }) : '') +
        iconBtn('tv-power-' + key, 'tv.power', 'power', tv.power ? 'turn off' : 'turn on', { cls: 'sm' + (tv.power ? '' : ' dim'), arg: key }) + '</div>';
      return hero + '<div class="tvrows">' + tvs.map(row).join('') + '</div>';
    },
  };

  T.audioAdapter = {
    title: 'speakers', topics: ["audioAdapter", 'media', 'all'],
    needs: "audioAdapter", standby: () => standby('speaker', 'Add a speaker', 'Settings → Integrations'),
    render() {
      const tone = { playing: 'grn', grouped: 'acc', paused: 'yel', idle: 'mut' };
      const list = D().audioAdapter, canGroup = OW.data.contract!==3&&list.filter((r) => r.kind !== "roomSpeaker").length > 1;
      return '<div class="rows">' + list.map((r) => (OW.data.contract===3?'<button class="row two" data-focus data-act="speaker.open" data-fid="speaker-'+esc(r.id)+'" data-arg="'+esc(r.id)+'">':'<div class="row two">') + icon('speaker') + '<div class="grow"><b>' + esc(r.name) + '</b><span>' + esc(r.model) + (r.volume != null ? ' · vol ' + r.volume : '') + '</span></div>' + chip(r.state, tone[r.state]) + (OW.data.contract===3?'</button>':'</div>')).join('') + '</div>' +
        (canGroup ? '<div class="rowbtns">' + btn("audioAdapter-group", "audioAdapter.groupAll", list.some((r) => r.state === 'grouped') ? 'Ungroup speakers' : 'Group all speakers', { icon: 'party' }) + '</div>' : '');
    },
  };

  T.bedroom = {
    title: 'bedroom tv', topics: ['tv', 'all'],
    needs: 'bedroomTv', standby: () => standby('tv', 'Add a bedroom TV', 'Settings → Integrations'),
    meta() { return chip(D().bedroomTv.power ? 'on' : 'off', D().bedroomTv.power ? 'grn' : 'mut'); },
    render() {
      const tv = D().bedroomTv;
      return '<div class="rows"><div class="row two">' + icon('tv') + '<div class="grow"><b>' + esc(tv.name) + '</b><span>' + esc(tv.note || '') + '</span></div></div>' +
        '<div class="row two">' + icon(tv.state === 'playing' ? 'play' : 'pause') + '<div class="grow"><b>' + esc(tv.title || tv.app || 'Nothing playing') + '</b><span>' + esc([tv.title ? tv.app : '', tv.sub].filter(Boolean).join(' · ') || tv.state || '') + '</span></div></div></div>' +
        '<div class="rowbtns">' + btn('bed-power', 'tv.power', tv.power ? 'Turn off' : 'Turn on', { icon: 'power', arg: 'bedroom' }) + '</div>';
    },
  };

  T.favorites = {
    title: 'favorites', topics: ['all'],
    needs: 'favorites', standby: () => OW.data.contract===3?standby('music',D().favoriteStatus?.message||'Open a speaker to load favourites',''): (OW.data.status.provider === 'ha' && OW.data.status.connected
      ? standby('music', 'No favourites yet', 'Enable the favorites sensor for your speaker integration in Home Assistant')
      : standby('music', 'No favorites yet', 'Favourites — ' + HA_HINT)),
    render() {
      const ic = { playlist: 'music', radio: 'news', album: 'music' };
      return '<div class="rows">' + D().favorites.map((f) => '<button class="row" data-focus data-fid="fav-' + OW.hash(String(f.id)) + "\" data-act=\"audioAdapter.play\" data-arg=\"" + esc(f.id) + '" data-name="' + esc(f.name) + '">' + (f.thumbnail?'<img class="art" src="'+esc(f.thumbnail)+'" alt="">':icon(ic[f.kind] || 'music')) + '<span class="grow">' + esc(f.name||f.title||'Favorite') + '</span><span class="mini">' + esc(({music:'Music',radio:'Radio',playlist:'Playlist',album:'Album',artist:'Artist',track:'Track'})[f.kind]||'') + '</span>' + icon('play', 'tiny') + '</button>').join('') + '</div>';
    },
  };

  T.screensaver = {
    title: 'ambient · screensaver', topics: ['bg', 'all'],
    meta() { return chip(esc(OW.bg.reason || 'feed'), 'acc'); },
    render() {
      const cur = OW.bg.current, src = { flightday: "Sky gradient", apod: 'NASA picture of the day', nasa: 'NASA image library', launch: 'Launch Library 2' };
      const pool = OW.bg.pool.length;
      return (OW.bg.currentUrl ? '<div class="sspreview"><img src="' + esc(OW.bg.currentUrl) + '" alt=""><span>on the walls now</span></div>' : '') + '<div class="rows">' +
        '<div class="row two">' + icon('satellite') + '<div class="grow"><b>' + esc(cur ? cur.title : '—') + '</b><span>' + esc(cur ? cur.credit : '') + '</span></div></div>' +
        '<div class="row two">' + icon('globe') + '<div class="grow"><b>' + esc(cur ? src[cur.source] || cur.source : '') + '</b><span>' + pool + ' images in rotation · every ' + OW.config.get('bg.intervalMin') + ' min</span></div></div>' +
        '<div class="row two">' + icon('tv') + '<div class="grow"><b>TV screensaver</b><span>same feed · Flight Day — Ambient</span></div></div></div>' +
        '<div class="rowbtns">' + btn('ss-preview', 'ambient', 'Preview ambient', { icon: 'play' }) + btn('ss-next', 'bg.next', 'Next image', { icon: 'next' }) + '</div>';
    },
  };

  // =================================================================================
  // CAMS
  // =================================================================================
  // PW-16: camera tiles keep the last-event still; unverified live controls are removed.
  function camTile(id) {
    const find = () => OW.data.has('cameras') && D().cameras.find((x) => x.id === id || x.slot === id);
    const names = { front: 'porch', drive: 'doorbell', living: 'living room' };
    return {
      title() { const c = find(); return c ? esc(c.name.toLowerCase()) : names[id]; }, topics: ['cams', 'all', 'camlive'],
      needs: 'cameras', show: () => !!find(),
      meta() { const c = find(); return c ? '<span>' + esc(c.model || '') + '</span>' : id === 'drive' ? chip('slot reserved', 'mut') : ''; },
      render() {
        const c = find();
        if (!c) return id === 'drive'
          ? standby('door', 'Doorbell', 'Add a doorbell in Home Assistant')
          : standby('camera', 'Add a camera', 'Settings → Integrations');
        const live = OW.app.camLive && OW.app.camLive.id === c.id;
        const blocked = OW.app.camPrivacy && OW.nowMs() - (OW.app.camPrivacy[c.id] || 0) < 5 * 60000;   // the stream refused just now
        const privacy = c.state === 'privacy' || (blocked && !live);
        const mode = live ? OW.app.camLive.mode : null;
        const failed = !live && !privacy && OW.app.camFail && OW.nowMs() - (OW.app.camFail[c.id] || 0) < 5 * 60000;   // tried, no picture came
        const badge = live ? '<span class="cam-badge live"><i class="pulse"></i>LIVE · <span data-cd="' + OW.app.camLive.until + '" data-cd-style="left"></span></span>'
          : privacy ? '<span class="cam-badge">' + icon('eyeoff') + 'privacy mode</span>'
          : '<span class="cam-badge">' + (failed ? 'no live stream · ' : '') + 'last event' + (c.stillAt ? ' · ' + fmt.when(c.stillAt) : '') + '</span>';
        const foot = privacy ? 'Privacy mode · stream unavailable' : c.last ? esc(c.last.kind) + ' · <span data-cd="' + c.last.at + '" data-cd-style="ago"></span>' : '';
        const src = live ? (mode === 'snap' ? OW.app.camLive.snap : c.live) : c.still;
        return '<div class="cam s-' + (live ? 'live' : c.state) + '" data-focus data-fid="cam-' + c.slot + '" data-camera="' + esc(c.id) + '"' + '' + ' aria-label="' + esc(c.name) + (live ? ' live' : '') + '">' +
          (mode === 'mse' ? '<video class="cam-img cam-vid is-live" muted autoplay playsinline poster="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></video><span class="cam-wait">connecting…</span>'
            : live ? '<img class="cam-img is-live" alt=""><span class="cam-wait">connecting…</span>' : src && !privacy ? '<img class="cam-img" src="' + esc(src) + '" alt="">' : '') + badge +
          '<div class="cam-ph">' + icon(privacy ? 'eyeoff' : c.icon || 'camera') + '<span>' + (privacy ? 'privacy mode' : OW.data.isDemo('cameras') ? 'demo camera' : 'no event picture yet') + '</span></div>' +
          '<div class="cam-foot"><span>' + foot + '</span><span class="cam-hint">' + 'Last-event still' + '</span></div></div>';
      },
    };
  }
  T.camFront = camTile('front');
  T.camDrive = camTile('drive');
  T.camLiving = camTile('living');

  T.camEvents = {
    title: 'sensors', topics: ['cams', 'all'],
    needs: 'camEvents',
    meta() { return OW.data.isDemo('camEvents') ? chip('demo', 'yel') : ''; },
    render() {
      const s = D(), groups = new Map();
      s.camEvents.forEach((e) => { const k = e.where || 'Camera'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
      const rows = Array.from(groups.entries()).map(([where, list]) => {
        const active = list.filter((e) => e.on), latest = list.reduce((m, e) => Math.max(m, e.at), 0);
        const what = active.length ? active.map((e) => e.label.split(' ')[0].toLowerCase()).join(' + ') + ' detected' : 'clear';
        return '<div class="row two"><i class="evico t-' + (active.length ? 'red' : 'acc') + '">' + icon(active.some((e) => e.kind === 'person') ? 'person' : 'motion') + '</i><div class="grow"><b>' + esc(where) + '</b><span>' + esc(what) + '</span></div><span class="mini mono">' + (active.length ? 'now' : fmt.hm(latest)) + '</span></div>';
      }).join('');
      return '<div class="rows">' + rows + '</div>' + (s.security ? '<div class="rowbtns"><div class="row two secline">' + icon('shield') + '<div class="grow"><b>' + esc(s.security.name || 'Security') + '</b><span>' + esc(String(s.security.raw || s.security.armed || '').replace(/_/g, ' ')) + '</span></div>' +
        chip(esc(s.security.armed), s.security.raw !== 'disarmed' ? 'grn' : 'mut') + '</div></div>' : '');
    },
  };

  // =================================================================================
  // MACHINES
  // =================================================================================
  T.machines = {
    title: 'machines', topics: ['machines', 'usage', 'all'],
    meta() { const m = machineRows(); return OW.data.isDemo('machines') ? chip('demo', 'yel') : '<span>' + m.filter((x) => x.status !== 'off').length + '/' + m.length + ' reporting</span>'; },
    render() {
      const rows = machineRows();
      if (!rows.length) return standby('server', 'No machines reporting', 'run collector/usage-collector on a machine to add it');
      const sleeping = OW.data.isDemo('machines') && rows.find((m) => m.wol);
      return '<div class="rows">' + rows.slice(0, 6).map((m) => '<div class="row two">' + dot(m.status) + '<div class="grow"><b>' + esc(m.name) + '</b><span>' + esc(m.detail) + '</span></div>' +
        (m.status === 'off' ? '<span class="mini">' + esc(m.offLabel || 'offline') + '</span>' : m.cpu != null ? '<div class="cpu"><span>' + esc(m.cpuLabel || 'cpu') + ' ' + m.cpu + '%</span>' + bar(m.cpu, m.cpu > 80 ? 'red' : m.cpu > 55 ? 'yel' : '') + '</div>' : '') + '</div>').join('') + '</div>' +
        (sleeping ? '<div class="rowbtns">' + btn('wake', 'machine.wake', 'Wake ' + esc(sleeping.name), { icon: 'bolt', arg: sleeping.id }) + '</div>' : '');
    },
  };
  /** live rows: this panel (root telemetry) + every host that published a collector report (+ HA / demo) */
  function machineRows() {
    const s = D(), rows = [];
    const p = s.panel;
    if (p) rows.push({ id: 'panel', name: 'Wall panel', status: p.tempC > 80 ? 'warn' : 'ok', cpu: p.cpuPct != null ? p.cpuPct : null, detail: 'live · ' + (p.tempC != null ? p.tempC + '°C · ' : '') + (p.memPct != null ? 'mem ' + p.memPct + '% · ' : '') + (p.uptimeH != null ? 'up ' + p.uptimeH + ' h' : '') });
    const u = OW.usage.data;
    if (u && !u.mock) u.machines.forEach((m) => {
      const fresh = OW.nowMs() - m.seenAt < 15 * 60000;
      const load = m.load1 != null && m.cpuCount ? OW.clamp(Math.round((m.load1 / m.cpuCount) * 100), 0, 100) : null;
      rows.push({ id: 'host-' + m.host, name: m.host, status: fresh ? 'ok' : 'off', offLabel: 'seen ' + fmt.ago(m.seenAt), cpu: load, cpuLabel: 'load',
        detail: [m.os, m.memPct != null ? 'mem ' + Math.round(m.memPct) + '%' : '', m.diskFreeGb != null ? Math.round(m.diskFreeGb) + ' GB free' : ''].filter(Boolean).join(' · ') });
    });
    (s.machines || []).forEach((m) => { if (m.id !== 'panel') rows.push(m); });
    return rows;
  }

  T.usage = {
    title: 'Plan limits', topics: ['usage'],
    meta() { const u = OW.usage; return u.source === 'none' || !u.data ? chip('standby', 'mut') : u.source === 'demo' ? chip('demo', 'yel') : u.source === 'stale' ? chip('report from ' + fmt.ago(u.data.generatedAt), 'yel') : chip('live', 'grn'); },
    render() {
      const u = OW.usage.data;
      if (!u) return standby('gauge', 'No usage report yet', 'run collector/usage-collector and publish usage.json');
      const win = (label, w, hit) => {
        if (!w) return '<div class="uwin"><span>' + label + '</span>' + bar(0) + '<em>–</em></div>';
        const tone = hit || w.pct >= 90 ? 'red' : w.pct >= 70 ? 'yel' : '';
        return '<div class="uwin"><span>' + label + '</span>' + bar(w.pct, tone) + '<em>' + Math.round(w.pct) + '%</em><small>' + (w.resetsAt ? 'resets ' + cd(w.resetsAt, 'span') : '') + '</small></div>';
      };
      return '<div class="usage">' + u.providers.map((p) => {
        const top = p.models.slice(0, 3).map((m) => '<span class="umodel"><b>' + esc(m.label) + '</b> ' + fmt.tokens(m.tokensToday) + '</span>').join('');
        return '<div class="uprov t-' + p.tone + (p.limitHit ? ' hit' : '') + '">' +
          '<div class="uhead"><i class="udot"></i><b>' + esc(p.label) + '</b><span class="mini">' + esc(p.via.join(' · ')) + '</span>' + (p.limitHit ? chip('limit hit' + (p.limitUntil ? ' · ' + cd(p.limitUntil, 'span') : ''), 'red') : p.estimated ? chip('est.', 'mut') : '') + '</div>' +
          // limit windows and cost appear only when the report carries them (never an empty bar or a made-up $0.00)
          (p.fiveHour || p.weekly ? '<div class="uwins">' + (p.fiveHour ? win('5 h', p.fiveHour, p.limitHit) : '') + (p.weekly ? win('week', p.weekly, p.limitHit && !p.fiveHour) : '') + '</div>' : '<div class="unote">limit windows not reported yet</div>') +
          (u.hasCost
            ? '<div class="utable"><em></em><em>tokens</em><em>est. cost</em><span>today</span><b class="mono">' + fmt.tokens(p.tokensToday) + '</b><b class="mono">≈' + fmt.usd(p.costToday) + '</b><span>7 days</span><b class="mono">' + fmt.tokens(p.tokensWeek) + '</b><b class="mono">≈' + fmt.usd(p.costWeek) + '</b></div>'
            : '<div class="utable two"><em></em><em>tokens</em><span>today</span><b class="mono">' + fmt.tokens(p.tokensToday) + '</b><span>7 days</span><b class="mono">' + fmt.tokens(p.tokensWeek) + '</b></div>') +
          '<div class="umodels">' + top + '</div></div>';
      }).join('') + '</div>';
    },
  };

  T.agents = {
    title: 'ai agents · t3 code', topics: ['usage'],
    meta() { const u = OW.usage.data; const n = u ? u.threads.filter((t) => t.status === 'running').length : 0; return chip(n + ' running', n ? 'grn' : 'mut'); },
    render() {
      const u = OW.usage.data;
      if (!u || !u.threads.length) return standby('bot', 'No agent threads reported', 'threads come from the usage collector');
      const tone = { running: 'grn', finished: 'mut', idle: 'mut', error: 'red' };
      const st = { running: 'ok', finished: 'off', idle: 'off', error: 'err' };
      return '<div class="rows scroll agents">' + u.threads.slice(0, 7).map((t) => '<div class="row two">' + dot(st[t.status]) + '<div class="grow"><b>' + esc(t.title) + '</b><span>' + esc(t.machine) + (t.model ? ' · ' + esc(t.model.replace(/^claude-|^gpt-|^gemini-/, '')) : '') + (t.project ? ' · ' + esc(t.project) : '') + '</span></div>' +
        '<div class="rcol">' + chip(t.status, tone[t.status]) + '<span class="mini">' + (t.status === 'running' && t.startedAt ? cd(t.startedAt, 'since') : fmt.span(t.durationSec * 1000)) + '</span></div></div>').join('') + '</div>';
    },
  };

  T.builds = {
    title: 'builds &amp; prs', topics: ['all', 'usage'],
    needs: 'builds', standby: () => standby('branch', 'No build feed', 'CI and pull requests arrive with the collector (GitHub)'),
    show() { const u = OW.usage.data; return OW.data.has('builds') || !!(u && u.prs && u.prs.length); },
    meta() { const u = OW.usage.data; const n = u && u.prs ? u.prs.filter((p) => /open/i.test(p.state)).length : 0; return n ? chip(n + ' open', 'acc') : ''; },
    render() {
      const u = OW.usage.data;
      if (!OW.data.has('builds') && u && u.prs && u.prs.length) {
        // pull requests opened by T3 Code threads (wallhub): repository, number and state only
        const ptone = { open: 'acc', merged: 'grn', closed: 'mut' };
        return '<div class="rows scroll">' + u.prs.slice(0, 5).map((p) => '<div class="row two">' + icon('branch') + '<div class="grow"><b>' + esc(p.repo || 'pull request') + (p.number ? ' #' + p.number : '') + '</b><span>' + esc(p.owner) + (p.host ? ' · from ' + esc(p.host) : '') + '</span></div>' + chip(esc(p.state || 'unknown'), ptone[String(p.state).toLowerCase()] || 'mut') + '</div>').join('') + '</div>';
      }
      const tone = { pass: 'grn', review: 'yel', fail: 'red' };
      return '<div class="rows">' + D().builds.map((b) => '<div class="row two">' + icon('branch') + '<div class="grow"><b>' + esc(b.name) + '</b><span>' + esc(b.detail) + '</span></div>' + chip(esc(b.label), tone[b.state]) + '</div>').join('') + '</div>';
    },
  };

  T.homelab = {
    title: 'integrations', topics: ['all', 'status', 'usage', 'launches', 'news'],
    meta() { const st = OW.data.status; return chip(st.provider === 'ha' ? (st.connected ? 'ha live' : 'ha offline') : st.provider === 'demo' ? 'demo' : 'local', st.provider === 'ha' && st.connected ? 'grn' : st.provider === 'demo' ? 'yel' : 'mut'); },
    render() {
      const st = OW.data.status, S = OW.space, u = OW.usage;
      if (OW.data.has('homelab')) return '<div class="rows">' + D().homelab.map((h) => '<div class="row two">' + dot(h.status) + '<div class="grow"><b>' + esc(h.name) + '</b><span>' + esc(h.detail) + '</span></div></div>').join('') + '</div>';
      // real service health as seen from this wall
      const feed = (name, topic, detail) => { const ok = S.updated[topic] && !S.stale[topic]; return '<div class="row two">' + dot(ok ? 'ok' : S.updated[topic] ? 'warn' : 'off') + '<div class="grow"><b>' + name + '</b><span>' + (S.updated[topic] ? (ok ? detail : 'last known · ' + fmt.ago(S.updated[topic])) : S.error[topic] ? 'unreachable' : 'connecting…') + '</span></div></div>'; };
      return '<div class="rows">' +
        '<button class="row two" data-focus data-fid="connect-ha" data-act="settings.field" data-arg="' + (!OW.config.get('ha.url') ? 'ha.url' : 'ha.token') + '">' + dot(st.provider === 'ha' ? (st.connected ? 'ok' : 'err') : 'off') + '<div class="grow"><b>Home Assistant</b><span>' + (st.provider === 'ha' ? esc(st.detail || '') : 'not connected — add URL + token in Settings') + '</span></div></button>' +
        (OW.hub && OW.hub.enabled() ? '<button class="row two" data-focus data-fid="connect-hub" data-act="settings.field" data-arg="wallhub.url">' + dot(OW.hub.reachable() ? 'ok' : 'err') + '<div class="grow"><b>wallhub</b><span>' + (OW.hub.reachable() ? (OW.hub.streaming ? 'live stream' : 'answering') + (S.hubFeatured() ? ' · featuring ' + esc((S.focus && S.focus.rocket) || 'nothing') + ' (' + esc(S.hubFeatured().reason || 'pick') + ')' : '') : 'unreachable — public APIs directly') + '</span></div></button>' : '') +
        feed('Launches' + (S.via.launches === 'wallhub' ? ' · via wallhub' : ' · Launch Library 2'), 'launches', S.launches.length + ' tracked') +
        feed('Spaceflight News' + (S.via.news === 'wallhub' ? ' · via wallhub' : ''), 'news', S.news.length + ' headlines') +
        '<div class="row two">' + dot(u.source === 'live' ? 'ok' : u.source === 'stale' ? 'warn' : 'off') + '<div class="grow"><b>Usage collector</b><span>' + (u.data && u.source !== 'demo' ? u.data.hosts.length + ' host' + (u.data.hosts.length === 1 ? '' : 's') + ' · ' + fmt.ago(u.data.generatedAt) : 'no report yet') + '</span></div></div>' +
        (V.missing().length ? '<button class="row two" data-focus data-fid="connect-missing" data-act="settings.field" data-arg="ha.url">' + dot('off') + '<div class="grow"><b>Add integrations</b><span class="wrap">' + esc(V.missing().join(' · ')) + '</span></div></button>' : '') + '</div>';
    },
  };

  T.network = {
    title: 'network', topics: ['machines', 'all'],
    needs: 'network', standby: () => standby('wifi', 'No network telemetry', OW.mode === 'panel' ? 'waiting for the first reading' : 'available on the wall panel'),
    meta() { const n = D().network; return n && n.live ? chip(n.online ? 'online' : 'offline', n.online ? 'grn' : 'red') : OW.data.isDemo('network') ? chip('demo', 'yel') : ''; },
    render() {
      const n = D().network;
      if (n.live) {
        const q = OW.clamp(Math.round(((n.rssi + 90) / 45) * 100), 0, 100);
        return '<div class="netgrid"><div><em>signal</em><b>' + n.rssi + '</b><span>dBm</span></div><div><em>link</em><b>' + (n.linkMbps || '–') + '</b><span>Mbps</span></div><div><em>ping</em><b>' + (n.ping != null ? n.ping : '–') + '</b><span>ms</span></div></div>' +
          '<div class="rows"><div class="row">' + icon('wifi') + '<span class="grow">Wi-Fi ' + esc(n.band || '') + '</span><div class="cpu"><span>quality ' + q + '%</span>' + bar(q, q < 35 ? 'red' : q < 60 ? 'yel' : '') + '</div></div>' +
          '<div class="row">' + icon('globe') + '<span class="grow">Internet</span>' + chip(n.online ? 'reachable' : 'unreachable', n.online ? 'grn' : 'red') + '</div></div>';
      }
      return '<div class="netgrid"><div><em>down</em><b>' + n.down + '</b><span>Mbps</span></div><div><em>up</em><b>' + n.up + '</b><span>Mbps</span></div><div><em>ping</em><b>' + n.ping + '</b><span>ms</span></div></div>' +
        '<div class="rows"><div class="row">' + icon('globe') + '<span class="grow">Tailscale</span>' + chip(n.tailscale.online + '/' + n.tailscale.total + ' online', 'grn') + '</div>' +
        '<div class="row">' + icon('wifi') + '<span class="grow">Wi-Fi clients</span><span class="mini">' + n.wifiClients + '</span></div></div>';
    },
  };

  T.voice = {
    title: 'voice', topics: ['all'],
    needs: 'voice', standby: () => standby('mic', 'No voice shortcuts', 'Siri / HomeKit scenes — ' + HA_HINT),
    render() {
      return '<div class="rows">' + D().voice.map((v) => '<div class="row two">' + icon('mic') + '<div class="grow"><b>“' + esc(v.phrase) + '”</b><span>' + esc(v.does) + '</span></div></div>').join('') + '</div>';
    },
  };

  // =================================================================================
  // MISSION CONTROL
  // =================================================================================
  function staleNote(topic) {
    const S = OW.space;
    if (!S.updated[topic]) return S.error[topic] ? chip('offline', 'red') : chip('loading', 'mut');
    return S.stale[topic] ? chip('last known · ' + fmt.ago(S.updated[topic]), 'yel') : '<span>' + fmt.ago(S.updated[topic]) + '</span>';
  }

  // Space area. The manifest is a rail: picking a row flies the globe to its pad and fills the brief.
  V_space = { sel: null };
  function manifest() {
    const S = OW.space, now = OW.nowMs(), lead = S.focus ? S.focus.id : null;
    return S.launches.filter((l) => l.net > now - 30 * 60000 || l.status === 'In Flight' || l.id === lead).sort((a, b) => (b.id === lead ? 1 : 0) - (a.id === lead ? 1 : 0) || a.net - b.net).slice(0, 7);
  }
  /** the launch the globe and the brief are about: the picked row, else the featured one, else the next */
  function selectedLaunch() { const list = manifest(); return list.find((l) => l.id === V_space.sel) || (OW.space.focus && list.find((l) => l.id === OW.space.focus.id)) || list[0] || null; }
  T.launches = {
    title: 'launch manifest', topics: ['launches', 'space-sel'],
    meta() { return staleNote('launches'); },
    render() {
      const S = OW.space, list = manifest(), sel = selectedLaunch();
      if (!list.length) return empty(S.error.launches ? 'Launch feed unreachable — will retry' : 'Acquiring launch manifest…', 'rocket');
      return (OW.themeFeatures?.anniversaryHtml()||'')+'<div class="launches rail scroll">' + list.map((l) => { const v = S.visibleFromHome(l); return '<button class="lrow' + (sel && sel.id === l.id ? ' first' : '') + (S.tracked === 'l' + l.id ? ' tracked' : '') + '" data-focus data-fid="lr-' + OW.hash(String(l.id)) + '" data-act="launch.select" data-arg="' + esc(l.id) + '">' +
        '<div class="lbay">' + vehicle(l) + '<i>' + esc((l.abbrev || '').slice(0, 5)) + '</i></div>' +
        '<div class="grow"><b>' + esc(l.rocket) + '</b><span>' + esc(l.mission) + '</span><small class="lchips">' + (v ? chip(icon('globe', 'tiny') + 'visible ' + v.compass, 'grn') : '') + (S.tracked === 'l' + l.id ? chip(icon('pin', 'tiny') + 'Tracking', 'acc') : '') + chip(esc(statusLabel(l.status)) + (l.sim ? ' · sim' : ''), statusTone(l.status)) + '</small></div>' +
        '<div class="rcol">' + (l.precise ? '<span class="mono lcd" data-cd="' + l.net + '" data-cd-style="tminus"></span>' : '<span class="mono lcd">NET ' + fmt.monthDay(l.net) + '</span>') +
        '<span class="lwhen">' + (l.precise ? fmt.when(l.net) : 'date TBD') + '</span></div></button>'; }).join('') + '</div>';
    },
  };

  // The globe (or, on a device too slow for it, the 2D map). Its canvas lives outside the normal re-render path.
  T.globe = {
    title: 'Orbit', topics: ['globe-mode'],     // re-rendered only when 3D <-> 2D changes: the canvas lives in here
    meta() { return '<span data-iss="meta">acquiring…</span>'; },
    render() {
      if (OW.globe.mode === '2d') return T.iss.render();
      return '<div class="glwrap"><div class="gl" id="glHost"></div>' +
        '<div class="gl-hud gl-tl"><div><em>iss lat</em><b data-iss="lat">–</b></div><div><em>lon</em><b data-iss="lon">–</b></div><div><em>alt</em><b data-iss="alt">–</b></div><div><em>vel</em><b data-iss="vel">–</b></div></div>' +
        '<div class="gl-hud gl-tr passbox" data-iss="passbox"></div>' +
        '<button class="gl-hud gl-bl crewchip" data-focus data-fid="gl-crew" data-act="crew.show">' + icon('people') + '<b data-space="crew">–</b><span>in space</span></button>' +
        '<div class="gl-hud gl-br gl-legend"><span class="k past">past track</span><span class="k fut">predicted</span><span class="k home">home</span><a data-focus data-fid="gl-day-credit" href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/" target="_blank" rel="noopener">Surface: NASA / Earth Observatory</a></div></div>';
    },
  };

  // The brief: everything about the picked launch, with Watch and Pin
  T.brief = {
    title: 'brief', topics: ['launches', 'space-sel'],
    meta() { const l = selectedLaunch(); return l ? chip(esc(statusLabel(l.statusName || l.status)), statusTone(l.status)) : ''; },
    render() {
      const S = OW.space, l = selectedLaunch();
      if (!l) return empty('Pick a launch from the manifest', 'rocket');
      const v = S.visibleFromHome(l), link = l.webcast || l.info, pinned = S.tracked === 'l' + l.id;
      return '<div class="brf"><div class="brf-name"><b>' + esc(l.rocket) + '</b> <span>· ' + esc(l.mission) + '</span></div>' +
        '<div class="brf-meta">' + esc(l.provider) + (l.orbit ? ' · ' + esc(l.orbit) : '') + ' · ' + esc(padLine(l)) + '</div>' +
        '<div class="brf-when"><span class="mono lcd" data-cd="' + l.net + '" data-cd-style="tminus"></span><span>' + (l.precise ? 'NET ' + fmt.when(l.net) : 'date to be confirmed') + '</span></div>' +
        (l.update && OW.nowMs() > l.net ? '<p class="brf-about">' + esc(l.update.text) + '</p>' : l.about ? '<p class="brf-about">' + esc(l.about) + '</p>' : '') +
        (v ? '<div class="brf-vis">' + icon('globe') + '<span>Visible from home: look ' + v.compass + ', about ' + v.clearSec + ' s after liftoff' + (v.twilight ? ' · twilight plume likely' : '') + '</span></div>' : '') +
        '<div class="rowbtns">' + (link ? '<button class="btn' + (l.webcastLive ? ' primary' : '') + '" data-focus data-fid="brf-watch" data-act="watch" data-arg="' + esc(link) + '">' + icon('play') + '<span>' + (l.webcastLive ? 'Watch live' : l.webcast ? 'Watch' : 'Mission page') + '</span></button>' : '') +
        '<button class="btn' + (pinned ? ' on' : '') + '" data-focus data-fid="brf-pin" data-act="track" data-arg="l' + esc(l.id) + '">' + icon('pin') + '<span>' + (pinned ? 'Tracking' : 'Track') + '</span></button></div></div>';
    },
  };

  T.iss = {
    title: 'iss · live position', topics: ['iss-fix', 'home'],
    meta() { return '<span data-iss="meta">acquiring…</span>'; },
    render() {
      const lat = OW.config.get('home.lat'), lon = OW.config.get('home.lon');
      const home = typeof lat === 'number' && typeof lon === 'number'
        ? '<g class="home" transform="translate(' + (lon + 180).toFixed(2) + ' ' + (90 - lat).toFixed(2) + ')"><circle r="1.6"/><circle r="3.6" class="ring"/></g>' : '';
      return '<div class="map"><svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice">' +
        '<image href="img/earth-night.webp" x="0" y="0" width="360" height="180" preserveAspectRatio="none"/>' +
        '<g id="mapTerm"></g><g class="grat"><path d="M0 90H360M0 45H360M0 135H360M90 0V180M180 0V180M270 0V180"/></g>' +
        '<g id="issPast" class="track past"></g><g id="issFuture" class="track"></g><g id="mapExtra"></g>' + home +
        '<g id="issDot" class="issdot" transform="translate(-20 -20)"><circle r="7" class="foot"/><circle r="2.2" class="core"/><circle r="4.4" class="halo"/></g></svg>' +
        '<div class="map-hud"><div><em>lat</em><b data-iss="lat">–</b></div><div><em>lon</em><b data-iss="lon">–</b></div><div><em>alt</em><b data-iss="alt">–</b></div><div><em>vel</em><b data-iss="vel">–</b></div>' +
          '<button class="crewchip mapcrew" data-focus data-fid="gl-crew" data-act="crew.show">' + icon('people') + '<b data-space="crew">–</b><span>in space</span></button></div><div class="passbox" data-iss="passbox"></div></div>';
    },
  };

  T.crew = {
    title: 'people in space', topics: ['crew'],
    meta() { return staleNote('crew'); },
    render() {
      const c = OW.space.crew;
      if (!c.count) return empty(OW.space.error.crew ? 'Crew roster unreachable' : 'Counting heads…', 'people');
      return '<div class="crew"><div class="crew-n"><b>' + c.count + '</b><span>humans<br>off-planet</span></div>' +
        '<div class="crew-list scroll">' + c.stations.map((s) => '<div class="station"><div class="subhead"><span>' + esc(s.short) + (s.expedition ? ' · ' + esc(s.expedition) : '') + '</span><span>' + s.people.length + '</span></div>' +
          s.people.map((p) => '<div class="person"><span>' + esc(p.name) + '</span><em>' + esc(p.agency) + '</em></div>').join('') + '</div>').join('') + '</div></div>';
    },
  };

  T.spaceEvents = {
    title: 'events', topics: ['events'],
    meta() { return staleNote('events'); },
    render() {
      const now = OW.nowMs();
      const list = OW.space.events.filter((e) => e.date > now - 3600000).slice(0, 3);
      if (!list.length) return empty(OW.space.error.events ? 'Events feed unreachable' : 'No events on the board', 'orbit');
      const ic = (t) => (/dock|berth/i.test(t) ? 'link' : /walk|eva/i.test(t) ? 'person' : /land|entry|splash/i.test(t) ? 'flag' : /static|test/i.test(t) ? 'bolt' : /fly|orbit/i.test(t) ? 'orbit' : 'spark');
      return '<div class="rows">' + list.map((e) => '<div class="row two"><i class="evico t-acc">' + icon(ic(e.type)) + '</i><div class="grow"><b>' + esc(e.name) + '</b><span>' + esc(e.type) + (e.location ? ' · ' + esc(e.location) : '') + '</span></div>' +
        '<div class="rcol">' + (e.precise ? '<span class="mono" data-cd="' + e.date + '" data-cd-style="tminus"></span><span class="mini">' + fmt.when(e.date) + '</span>'
          : '<span class="mini evdate">' + (e.dayPrecise ? fmt.monthDay(e.date) + ' · time TBD' : fmt.monthDay(e.date).split(' ')[0] + ' ' + new Date(e.date).getFullYear() + ' · date TBD') + '</span>') + '</div></div>').join('') + '</div>';
    },
  };

  T.spotlight = {
    title: 'active missions', topics: ['programs', 'news', 'spot'],
    meta() { const n = OW.space.spotlight.length; return n ? '<span>' + ((T.spotlight.index % n) + 1) + ' / ' + n + '</span>' : ''; },
    index: 0,
    render() {
      const list = OW.space.spotlight;
      if (!list.length) return empty('No missions in the spotlight yet', 'spark');
      const m = list[T.spotlight.index % list.length];
      const since = m.since ? Date.parse(m.since) : null;
      return '<div class="spot"><div class="spot-top"><div class="spot-img' + (m.logoLike ? ' logo' : '') + '">' + (m.image ? '<img src="' + esc(OW.net.img(m.image, 480)) + '" alt="" loading="lazy">' : icon(m.icon || 'spark')) + '</div>' +
        '<div class="spot-id"><b>' + esc(m.name) + '</b><span>' + esc(m.agency || '') + '</span>' + (since ? '<div class="met"><em>' + esc(m.sinceLabel === 'program running' ? 'running' : m.sinceLabel) + '</em><span class="mono" data-cd="' + since + '" data-cd-style="elapsed"></span></div>' : '') + '</div></div>' +
        '<p class="spot-about">' + esc(m.about || '') + '</p>' +
        (m.next ? '<div class="spot-line">' + icon('rocket') + '<span>next: ' + esc(m.next.name) + ' · ' + fmt.when(m.next.net, false) + '</span></div>' : '') +
        (m.news ? '<div class="spot-line">' + icon('news') + '<span>' + esc(m.news.title) + '</span></div>' : '') + '</div>';
    },
  };

  T.news = {
    title: 'space news', topics: ['news'],
    meta() { return staleNote('news'); },
    render() {
      const list = OW.space.news.slice(0, 3);
      if (!list.length) return empty(OW.space.error.news ? 'News wire unreachable' : 'Listening to the wire…', 'news');
      return '<div class="rows news">' + list.map((n) => '<div class="nrow"><b>' + esc(n.title) + '</b><span>' + esc(n.site) + ' · ' + fmt.ago(n.at) + '</span></div>').join('') + '</div>';
    },
  };

  // =================================================================================
  // layout
  // =================================================================================
  T.usage.show = T.agents.show = T.usageMini.show = () => !!OW.usage.data;
  T.machines.show = () => machineRows().length > 0;
  if (OW.isTV) T.today.attrs = 'data-focus data-fid="today-tile" data-act="brief.open"';
  T.today.show = () => !OW.isTV || (D().calendar && D().calendar.available) || OW.data.isDemo('events');

  // =================================================================================
  // SLEEP & WAKE
  // =================================================================================
  /**
   * One model for everything sleep. With Home Assistant the plan IS its helpers (a liftoff time and an
   * on/off per weekday, a master switch, sound, volume) and every change is written there at once.
   * Without it the wall keeps a single time of its own.
   */
  function sleepModel() {
    const L = D()?.launch, c = OW.config.get('sleep');
    if (L && L.days && L.days.length) return L;
    const n = OW.now(), tomorrow = new Date(n.getTime() + (n.getHours() < 4 ? 0 : 86400000));
    const time = V_sleep.localTime || c.last || ([0, 6].includes(tomorrow.getDay()) ? c.weekend : c.weekday);
    const armed = V_sleep.localAlarm != null ? V_sleep.localAlarm : !!c.alarm;
    const [h, m] = time.split(':').map(Number);
    let at = new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m).getTime();
    if (at <= n.getTime() + 60000) at += 86400000;
    return { local: true, days: [], master: armed, enabled: armed, time, sound: null, sounds: [], volume: null, scripts: false, sleeping: false,
      target: { key: 'local', name: '', short: '', time, on: true, at, label: new Date(at).getDate() === n.getDate() ? 'Today' : 'Tomorrow' } };
  }
  const volFrac = (M) => OW.clamp((M.volume - M.volMin) / Math.max(1, M.volMax - M.volMin), 0, 1).toFixed(3);
  const soundIcon = (o) => (/thunder|storm/i.test(o) ? 'storm' : /rain/i.test(o) ? 'rain' : 'x');
  /** sound picker + volume */
  function soundHtml(M, prefix) {
    if (!M.sounds || !M.sounds.length) return '';
    const off = /^off$/i.test(M.sound || '');
    return '<div class="sl-sound"><div class="sl-snd-l"><span>Sleep sound</span><small>' + (M.sleeping ? 'playing now' : 'starts with Goodnight') + '</small></div>' +
      '<div class="seg big">' + M.sounds.map((o) => '<button class="' + (o === M.sound ? 'on' : '') + '" data-focus data-fid="' + prefix + '-snd-' + esc(o) + '" data-act="sleep.sound" data-arg="' + esc(o) + '">' + icon(soundIcon(o)) + '<span>' + esc(o) + '</span></button>').join('') + '</div>' +
      (M.volume != null ? '<div class="sl-vol' + (off ? ' off' : '') + '"><button class="ibtn" data-focus data-fid="' + prefix + '-vol-dn" data-act="sleep.vol" data-arg="-1" aria-label="quieter">' + icon('minus') + '</button>' +
        '<div class="sl-volbar"><i style="transform:scaleX(' + volFrac(M) + ')"></i></div><b class="mono">' + M.volume + '%</b>' +
        '<button class="ibtn" data-focus data-fid="' + prefix + '-vol-up" data-act="sleep.vol" data-arg="1" aria-label="louder">' + icon('plus') + '</button></div>' : '') + '</div>';
  }
  const dayChip = (M, d, sel, T, prefix) => '<button class="sl-day' + (sel && d.key === sel.key ? ' sel' : '') + (d.on && M.master ? '' : ' off') + (d.on ? '' : ' dayoff') + (T && d.key === T.key ? ' next' : '') + '" data-focus data-fid="' + prefix + '-day-' + d.key + '" data-act="sleep.day" data-arg="' + d.key + '">' +
    '<em>' + d.short + '</em><b class="mono">' + OW.time.text(d.time) + '</b><small>'+esc(OW.wake.crewName(d.crew))+'</small><i></i></button>';
  const wakeSub = (M, sel, isTarget) => {
    const T = M.target, now = OW.nowMs();
    return !M.master ? icon('moon') + '<span>alarm is off — sleep in</span>'
      : !sel.on ? icon('moon') + '<span>no alarm on ' + esc(sel.name) + ' — sleep in</span>'
      : isTarget && T ? icon('rocket') + '<span>liftoff in <b>' + fmt.span(T.at - now) + '</b>' + (M.scripts ? ' · sunrise from ' + fmt.hm(T.at - 10 * 60000) : '') + '</span>'
      : icon('rocket') + '<span>every ' + esc(sel.name) + '</span>';
  };

  // Home card: tomorrow's wake time, the week at a glance, Goodnight
  T.sleep = {
    title: 'sleep &amp; wake', topics: ['all', 'sleep'],
    attrs: 'data-focus data-fid="sleep-card" data-act="ws" data-arg="night"',
    meta() { const M = sleepModel(); return chip(M.sleeping ? 'sleep mode' : M.master ? 'Alarm armed' : 'Alarm off', M.sleeping ? 'mag' : M.master ? 'grn' : 'mut'); },
    render() {
      const M = sleepModel(), T = M.target;
      const armed = !!(M.master && T && T.on);
      return '<div class="sw">' +
        '<div class="sw-top"><div class="sw-time' + (armed ? '' : ' off') + '"><b class="mono">' + (T ? OW.time.text(T.time) : '—') + '</b><span>' + (T ? T.label + (T.name ? ' · ' + T.name : '') : '') + '</span></div>' +
          '<div class="sw-sub">' + (T ? '<span>' + wakeSub(M, T, true) + '</span>' : '') + (M.sound ? '<span class="sw-snd">' + icon(soundIcon(M.sound)) + esc(M.sound) + (M.volume != null && !/^off$/i.test(M.sound) ? ' · ' + M.volume + '%' : '') + '</span>' : '') + '</div></div>' +
        (M.days.length ? '<div class="sl-week">' + M.days.map((d) => dayChip(M, d, null, T, 'sw')).join('') + '</div>' : '') +
        '<div class="rowbtns">' + (D().launch?.alarm?.state==='up' && OW.now().getHours()<12 ? btn('sw-bed','back_to_bed','Back to bed'):'') + (M.sleeping
          ? btn('sw-wake', 'night.wake', 'Wake up now', { icon: 'sun' })
          : btn('sw-go', 'sleep.go', 'Goodnight', { icon: 'moon', cls: 'primary' })) + '</div></div>';
    },
  };

  // Night area: the full editor (tomorrow first, the week underneath, sound + volume)
  T.sleepFull = {
    title: 'sleep &amp; wake', topics: ['all', 'sleep'],
    meta() { const M = sleepModel(); return M.sleeping ? chip('sleep mode on', 'mag') : ''; },
    render() {
      const M = sleepModel(), T = M.target, sug = V.suggestWake ? V.suggestWake() : null;
      const sel = M.days.find((d) => d.key === (V_sleep.sel || T?.key)) || T;
      if (!sel) return empty('no wake time yet', 'moon');
      const isTarget = !M.days.length || (T && sel.key === T.key);
      const armed = !!(M.master && sel.on);
      const head = isTarget && T ? T.label + (T.name ? ' · ' + T.name : '') : sel.name + 's';
      const seg2 = (act, onNow, a, b) => '<div class="seg"><button class="' + (onNow ? 'on' : '') + '" data-focus data-fid="' + act + '-1" data-act="' + act + '" data-arg="1">' + a + '</button><button class="' + (onNow ? '' : 'on') + '" data-focus data-fid="' + act + '-0" data-act="' + act + '" data-arg="0">' + b + '</button></div>';
      return '<div class="sf scroll">' +
        btn('sl-schedule','schedule.open','Schedule',{icon:'calendar'}) + '<p class="schedule-note">'+esc(bedtimeLine())+'</p>' +
        '<div class="sf-head">' + esc(head) + '</div>' +
        '<div class="sl-time"><button class="ibtn" data-focus data-fid="sl-dn" data-act="sleep.step" data-arg="-15" aria-label="15 minutes earlier">' + icon('minus') + '</button>' +
          '<div class="sl-clock' + (armed ? '' : ' off') + '">' + OW.time.text(sel.time) + '</div>' +
          '<button class="ibtn" data-focus data-fid="sl-up" data-act="sleep.step" data-arg="15" aria-label="15 minutes later">' + icon('plus') + '</button></div>' +
        '<div class="sl-sub">' + wakeSub(M, sel, isTarget) + '</div>' +
        (sug && isTarget && sug.time !== sel.time ? '<button class="sl-sug" data-focus data-fid="sl-sug" data-act="sleep.preset" data-arg="' + sug.time + '">' + icon('calendar') + '<span>First up ' + fmt.hm(sug.event.start) + ' · ' + esc(sug.event.title) + '</span><b class="mono">use ' + OW.time.text(sug.time) + '</b></button>' : '') +
        (M.days.length ? '<div class="sl-week">' + M.days.map((d) => dayChip(M, d, sel, T, 'sl')).join('') + '</div>' : '') +
        (!M.local && !M.localCore && T ? '<div class="set"><div class="set-l"><span>'+T.label+' only</span><small>'+OW.time.text(T.time)+(T.override?' · one-time change':' · weekly plan unchanged')+'</small></div><div class="rowbtns">'+btn('sl-once-dn','sleep.once','−15',{arg:'-15'})+btn('sl-once-up','sleep.once','+15',{arg:'15'})+'</div></div>' : '') +
        '<div class="sl-opts">' +
          (!M.local && !M.localCore ? '<div class="set"><div class="set-l"><span>'+esc(OW.crewText('title'))+' · '+esc(sel.name)+'</span></div><div class="seg">'+OW.model.crewOptions().map(crew=>'<button data-focus data-act="sleep.crew" data-arg="'+sel.key+':'+crew+'" class="'+(sel.crew===crew?'on':'')+'">'+esc(OW.wake.crewName(crew))+'</button>').join('')+'</div></div><div class="set"><div class="set-l"><span>Up by · '+esc(sel.name)+'</span><small>'+(sel.upBy==='00:00'?'Calendar / snooze window':OW.time.text(sel.upBy))+'</small></div>'+btn('sl-ub-dn','sleep.upby','−15',{arg:'-15'})+btn('sl-ub-up','sleep.upby','+15',{arg:'15'})+'</div>' : '') +
          (M.days.length ? '<div class="set"><div class="set-l"><span>' + esc(sel.name) + '</span><small>this day, every week</small></div>' + seg2('sleep.dayon', sel.on, 'alarm on', 'off') + '</div>' : '') +
          '<div class="set"><div class="set-l"><span>Alarm</span><small>' + (M.days.length ? 'all days · ' : '') + 'sunrise, countdown, briefing</small></div>' + seg2('sleep.master', M.master, 'armed', 'off') + '</div>' +
        '</div>' +
        soundHtml(M, 'sl') + (M.muted?btn('sl-unmute','sleep.unmute','Speaker muted · Unmute'):'') +
        '<div class="sl-opts"><div class="set"><div class="set-l"><span>When woken at night</span><small>this screen · the backlight goes off again after ten seconds</small></div><div class="seg">' +
          [['black', 'Pure black'], ['clock', 'Night clock']].map(([v, l]) => '<button class="' + (OW.app.nightLook() === v ? 'on' : '') + '" data-focus data-fid="sl-look-' + v + '" data-act="night.look" data-arg="' + v + '">' + l + '</button>').join('') + '</div></div></div>' +
        '<div class="sl-go">' + (M.sleeping
          ? '<button class="btn big" data-focus data-focus-first data-fid="sl-wake" data-act="night.wake">' + icon('sun') + '<span>Wake up now</span></button>'
          : '<button class="btn big primary" data-focus data-focus-first data-fid="sl-go" data-act="sleep.go">' + icon('moon') + '<span>Goodnight</span></button>') + '</div></div>';
    },
  };

  // Night area: what tonight will do, and ways to see it without waiting for bedtime
  T.nightPlan = {
    title: 'tonight', topics: ['all', 'sleep', 'climate'],
    render() {
      const M = sleepModel(), T = M.target, armed = !!(M.master && T && T.on);
      const audioHere = OW.app && OW.app.nightAudioHere && OW.app.nightAudioHere();
      const row = (ic, a, b) => '<div class="row two">' + icon(ic) + '<div class="grow"><b>' + a + '</b><span class="wrap">' + b + '</span></div></div>';
      return OW.time.countdownHtml('night')+(OW.integrations?.linesHtml('night')||'')+'<div class="rows">' +
        (bedtimeLine()?row('moon','Bedtime target',esc(bedtimeLine())+' · only you start Goodnight'):'') +
        row('moon', 'Goodnight', M.localCore?'Only this screen settles into night':OW.data.contract===3?'Screens settle into night'+(OW.roles.get('goodnight_off')?' · your chosen devices turn off':''):M.scripts ? 'lights, lamps and patio off · other TVs off · every screen goes dark' : M.local ? 'Home Assistant is not connected: only this screen goes dark' : 'no goodnight script in Home Assistant: only this screen goes dark') +
        (M.sound ? row(soundIcon(M.sound), /^off$/i.test(M.sound) ? 'No sleep sound' : esc(M.sound) + (M.volume != null ? ' at ' + M.volume + '%' : ''), OW.roles.get('sleep_sound_on')==='screens'?'Sleep sound plays on this device when Flight Day is open':audioHere ? 'played by this screen, all night, through its own speakers' : OW.data.contract===3?'Played by your chosen audio device':'played by the bedroom TV') : '') +
        row('tv', 'Screens off', (OW.mode === 'panel' ? 'the backlight switches off' : 'the picture goes black') + '. A touch or a button shows ' + (OW.app.nightLook() === 'clock' ? 'the red night clock and controls' : 'dim controls on black') + ' for ten seconds') +
        row('rocket', armed ? 'Liftoff ' + T.label.toLowerCase() + ' at ' + OW.time.text(T.time) : 'No alarm', armed ? 'the screen rises'+(OW.roles.get('wake_lights')?.length?' with the wake lights':'')+' from ' + fmt.hm(T.at - 10 * 60000) + ', then the morning briefing' : 'sleep in — turn the alarm on to wake with the launch') +
        '</div>' + (OW.smartComfort&&!OW.smartComfort.quiet()?'<p class="goodnight-comfort-preview">'+esc(OW.smartComfort.nightLine().text)+'</p>':'') + climateRoutines('np') + '<div class="rowbtns">' + btn('np-night', 'night.preview', 'Try night screen', { icon: 'moon' }) + btn('np-seq', 'seq.preview', 'Try the alarm', { icon: 'rocket' }) + '</div>';
    },
  };

  // =================================================================================
  // HOME: house at a glance, alerts, plan limits
  // =================================================================================
  T.quick = {
    title: 'house', topics: ['lights', 'scenes', 'all'],
    attrs: 'data-focus data-fid="quick" data-act="ws" data-arg="house"',
    show() { return OW.data.has('lights') || (OW.data.has('scenes') && D().scenes.some((x) => x.ha)); },
    meta() { const l = D().lights || []; const on = l.filter((x) => x.on).length; return '<span>' + (on ? on + ' on' : 'all off') + ' ›</span>'; },
    render() {
      const s = D(), lights = s.lights || [], on = lights.filter((l) => l.on);
      const scenes = (s.scenes || []).filter((x) => x.ha).slice(0, 4);
      return (scenes.length ? '<div class="qscenes">' + scenes.map((sc) => '<button class="qscene' + (s.activeScene === sc.id ? ' on' : '') + '" data-focus data-fid="qs-' + sc.id + '" data-act="scene" data-arg="' + sc.id + '"'+(sc.blocked?' disabled aria-disabled="true"':'')+'>' + icon(sc.icon) + '<span>' + esc(sc.name) + '</span>'+(sc.blockedReason?'<small class="scene-note">'+esc(sc.blockedReason)+'</small>':'')+'</button>').join('') + '</div>' : '') +
        '<div class="rows lights scroll">' + (on.length ? on.slice(0, 5).map((l) => '<button class="row light on" data-focus data-fid="ql-' + l.id + '" data-act="light.toggle" data-arg="' + l.id + '">' + icon(l.kind === 'plug' ? 'plug' : 'bulb') + '<span class="grow">' + esc(l.name) + '</span><span class="mini">' + (l.kind === 'plug' ? 'on' : l.level + '%') + '</span>' + toggle(true) + '</button>').join('') +
          (on.length > 5 ? '<div class="row"><span class="mini">+ ' + (on.length - 5) + ' more on</span></div>' : '')
          : lights.length ? '<div class="quiet">' + icon('moon') + '<span>Every light is off</span></div>' : '') + '</div>' +
        (on.length ? '<div class="rowbtns">' + btn('q-off', 'light.all', 'All off', { arg: '0', icon: 'moon' }) + '</div>' : '');
    },
  };

  /** things that want attention right now; the tile only exists while there is one */
  function alertList() {
    const s = D(), out = [], now = OW.nowMs(), st = OW.data.status, S = OW.space, u = OW.usage.data;
    const weather=s.weather?.alert;
    if (weather && (!weather.ends || weather.ends>now)) out.push({icon:'bolt',tone:/extreme|severe/i.test(weather.severity)?'red':'yel',title:weather.event,sub:weather.headline||'National Weather Service',act:'brief.open'});
    if (OW.config.get('visible.alerts')!==false) (S.launches||[]).filter(l=>l.precise&&l.net>now&&l.net-now<=30*60000&&!/hold|scrub|fail/i.test(l.status)).forEach(l=>{
      const v=S.visibleFromHome?.(l);if(v)out.push({icon:'rocket',tone:'grn',title:l.rocket+' · visible from home',sub:'Look '+v.compass+' · '+fmt.hm(l.net),act:'ws',arg:'space'});
    });
    (s.camEvents || []).forEach((e) => { if (/detected now/.test(e.label)) out.push({ icon: e.kind === 'person' ? 'person' : 'motion', tone: 'red', title: (e.where || 'Camera') + ' · ' + e.kind, sub: 'detected now', act: 'ws', arg: 'house' }); });
    (s.cameras || []).forEach((c) => { if (c.last && now - c.last.at < 10 * 60000 && !out.some((o) => o.title.indexOf(c.name) === 0)) out.push({ icon: 'camera', tone: 'yel', title: c.name + ' · ' + c.last.kind.toLowerCase(), sub: fmt.ago(c.last.at), act: 'ws', arg: 'house' }); });
    if (st.provider === 'ha' && !st.connected) out.push({ icon: 'home', tone: 'red', title: 'Home Assistant is offline', sub: st.detail || 'reconnecting', act: 'ws', arg: 'status' });
    if (OW.hub && OW.hub.enabled() && !OW.hub.reachable() && now - (OW.hub.lastTry || now) < 3600000 && OW.hub.lastTry) out.push({ icon: 'satellite', tone: 'yel', title: 'wallhub is unreachable', sub: 'using the public feeds directly', act: 'ws', arg: 'status' });
    (u && !u.mock ? u.machines : []).forEach((m) => { if (now - m.seenAt > 30 * 60000) out.push({ icon: 'desktop', tone: 'yel', title: m.host + ' stopped reporting', sub: 'seen ' + fmt.ago(m.seenAt), act: 'ws', arg: 'status' }); });
    (s.machines || []).forEach((m) => { if (m.status === 'off') out.push({ icon: 'desktop', tone: 'yel', title: m.name + ' is offline', sub: '', act: 'ws', arg: 'status' }); });
    (u ? u.providers : []).forEach((p) => { const w = [p.fiveHour, p.weekly].filter(Boolean).sort((a, b) => b.pct - a.pct)[0]; if (p.limitHit || (w && w.pct >= 90)) out.push({ icon: 'gauge', tone: 'red', title: p.label + (p.limitHit ? ' limit reached' : ' at ' + Math.round(w.pct) + '%'), sub: w && w.resetsAt ? 'resets ' + fmt.when(w.resetsAt) : '', act: 'ws', arg: 'status' }); });
    const pass = S.pass;
    if (pass && pass.visible && pass.start - now < 30 * 60000 && pass.end > now) out.push({ icon: 'satellite', tone: 'grn', title: 'ISS passing overhead', sub: (pass.start > now ? 'rises ' + fmt.hm(pass.start) : 'now') + ' · max ' + pass.maxEl + '°', act: 'ws', arg: 'space' });
    return out;
  }
  T.alerts = {
    title: 'alerts', topics: ['all', 'cams', 'usage', 'status', 'iss', 'weather', 'launches'],
    show() { return alertList().length > 0; },
    meta() { return chip(alertList().length + '', 'red'); },
    render() {
      return '<div class="rows scroll">' + alertList().slice(0, 4).map((a, i) => '<button class="row two alert t-' + a.tone + '" data-focus data-fid="al-' + i + '" data-act="' + a.act + '" data-arg="' + a.arg + '">' + icon(a.icon) + '<div class="grow"><b>' + esc(a.title) + '</b><span>' + esc(a.sub) + '</span></div></button>').join('') + '</div>';
    },
  };

  T.gauges = {
    title: 'plan limits', topics: ['usage'],
    attrs: 'data-focus data-fid="gauges" data-act="ws" data-arg="status"',
    show() { const u = OW.usage.data; return !!(u && u.hasLimits); },
    meta() { const u = OW.usage.data; const n = u ? u.threads.filter((t) => t.status === 'running').length : 0; return n ? '<span>' + n + ' agent' + (n === 1 ? '' : 's') + ' running ›</span>' : '<span>status ›</span>'; },
    render() {
      const u = OW.usage.data;
      return '<div class="gauges">' + u.providers.filter((p) => p.fiveHour || p.weekly).map((p) => [['5 h', p.fiveHour], ['week', p.weekly]].filter((x) => x[1]).map(([label, w]) => {
        const tone = p.limitHit || w.pct >= 90 ? 'red' : w.pct >= 70 ? 'yel' : '';
        return '<div class="gauge t-' + p.tone + '"><span class="g-name">' + esc(p.label) + '<em>' + label + '</em></span>' + bar(w.pct, tone) + '<b class="mono">' + Math.round(w.pct) + '%</b><small>' + (w.resetsAt ? 'resets ' + cd(w.resetsAt, 'span') : '') + '</small></div>';
      }).join('')).join('') + '</div>';
    },
  };

  // Layouts. `cols`: each column is a stack of [tile, weight]; `rows`: each row is a strip of [tile, weight].
  // Hidden tiles drop out and their neighbours take the space. `css` layouts keep a hand-written grid.
  // Home is a list the owner arranges: tiles are placed, in order, into the first of three columns
  // that still has room. Hidden tiles and tiles with nothing behind them simply are not there.
  const HOME_TILES = {
    hero: { name: 'Clock & next up', w: 6, fixed: true },
    weather: { name: 'Weather', w: 3 },
    today: { name: 'Today', w: 8 },
    due: { name: 'Due next', w: 3 },
    sleep: { name: 'Sleep & Wake', w: 4 },
    quick: { name: 'Scenes & lights', w: 5 },
    playingNow: { name: 'Now playing', w: 4 },
    alerts: { name: 'Alerts', w: 3 },
    gauges: { name: 'Plan limits', w: 3 },
  };
  const HOME_DEFAULT = ['hero', 'weather', 'today', 'due', 'sleep', 'quick', 'playingNow', 'alerts', 'gauges'];
  // today's weather: now, the next twelve hours, sun times, and one sentence
  /** a clear sky at night is a moon, not a sun */
  const wxIcon = (o, at) => {
    if(!o)return 'cloud';
    const time=at ?? o.t ?? OW.nowMs(), ref=D().weather || o, d=new Date(time), rise=new Date(ref.sunrise), set=new Date(ref.sunset);
    const night=typeof o.night==='boolean'?o.night:(ref.sunrise&&ref.sunset?(d.getHours()*60+d.getMinutes()<rise.getHours()*60+rise.getMinutes()||d.getHours()*60+d.getMinutes()>=set.getHours()*60+set.getMinutes()):d.getHours()<6||d.getHours()>=18);
    return night && ['clear','partly-cloudy','partlycloudy'].includes(o.condition)?'moon':WX[o.condition]||'cloud';
  };
  function weatherHours(w, n) {
    return '<div class="wx-hours">' + (w.hours || []).slice(0, n).map((h) => '<div><em class="mono">' + fmt.hm(h.t) + '</em>' + icon(wxIcon(h)) + '<b>' + h.temp + '°</b><small' + (h.pop >= 50 ? ' class="wet"' : '') + '>' + (h.pop >= 10 ? h.pop + '%' : '') + '</small></div>').join('') + '</div>';
  }
  T.weather = {
    title: 'weather', topics: ['weather', 'all'],
    attrs: 'data-focus data-fid="wx-tile" data-act="brief.open"',
    show() { return !!D().weather; },
    meta() { const w = D().weather; return (w.alert ? chip(esc(w.alert.event), /Extreme|Severe/.test(w.alert.severity) ? 'red' : 'yel') : '') + '<span class="wx-source" title="'+esc(OW.weatherSource.credit(w))+'">'+esc(OW.weatherSource.credit(w))+'</span>' + OW.weatherLink.button("weather-weatherProvider"); },
    render() {
      const w = D().weather, rain=OW.rainNowcast.visible(w);
      return '<div class="wxc"><div class="wx-now">' + icon(wxIcon(w)) + '<b>' + w.temp + w.unit + '</b><div><span'+(rain?' class="rain-soon"':'')+'>' + esc(rain || OW.time.inline(w.summary || w.text)) + '</span><small>' + esc(w.text) + (w.feels!=null ? ' · '+esc(OW.weatherSource.feel(w)) : '') + (OW.weatherSource.range(w) ? ' · '+esc(OW.weatherSource.range(w)) : '') + '</small></div></div>' +
        OW.rainNowcast.credit(w,'weather-apple-credit') + (w.hours && w.hours.length ? weatherHours(w, 12) : '') + '</div>';
    },
  };
  // Due sources chosen by the house. Not there until that feed exists.
  // An all-day item is due that day, by 23:59; a timed one at its time. The trailing [COURSE] becomes a chip.
  const dueWhen = (d) => {
    const now = OW.nowMs(), late = d.at < now;
    const when = d.allDay ? fmt.when(d.at, false) + ' · by ' + fmt.hm(d.at) : fmt.when(d.at);
    return (late ? 'was due ' : 'due ') + when + (late ? '' : ' · in ' + fmt.span(d.at - now));
  };
  /** not-past items, nearest first, within `days` */
  function dueList(days) { const now = OW.nowMs(); return (D().due || []).filter((d) => d.at >= now && d.at < now + (days || 7) * 86400000); }
  const dueMeta = d => dueWhen(d).split(' · in ').map((part,i)=>'<span class="'+(i?'due-in':'due-when')+'">'+(i?'· in ':'')+esc(part)+'</span>').join('');
  const dueRow = (d, fid) => '<button class="row two due' + (d.at - OW.nowMs() < 24 * 3600000 ? ' soon' : '') + '" data-focus data-fid="' + fid + '" data-act="due.show" data-arg="' + esc(d.id) + '">' + icon('flag') +
    '<div class="grow"><b>' + esc(d.title) + '</b><span class="due-meta">' + dueMeta(d) + '</span></div>' + (d.course ? chip(esc(d.course), 'mut') : '') + '</button>';
  T.due = {
    title: 'due next', topics: ['events', 'all'],
    show() { return dueList().length > 0; },
    meta() { const n = dueList(1).length; return n ? chip(n + ' within a day', 'org') : '<span>' + dueList().length + ' this week</span>'; },
    render() {
      // the nearest item leads; what follows it is listed underneath
      const list = dueList();
      return '<div class="rows scroll">' + list.slice(0, 4).map((d, i) => dueRow(d, 'due-' + i)).join('') + '</div>';
    },
  };
  // Status → Sleep: last night per person (asleep, stages when the source has them) against their own average
  T.sleepStat = {
    title:()=>D().launch?.sleeping?'Sleep and wake history':'Flight Log', topics: ['all','sleepdata'],
    show() { return true; },
    meta() { return '<span>last 7 mornings</span>'; },
    render() {
      const hm = OW.app.hm;
      const mornings=D().launch?.mornings||[];
      return '<p aria-label="Sleep and wake history">Your last 7 mornings</p><div class="rows scroll">'+(mornings.length?mornings.map(m=>'<div class="slp" data-focus tabindex="0" data-fid="morning-'+esc(m.id)+'"><b>'+esc(m.id.slice(0,10))+'</b><div class="slp-sub">Liftoff '+OW.time.text(m.liftoff)+' · '+(m.up?'Up '+OW.time.text(m.up):esc(m.outcome))+' · '+(+m.snoozes||0)+' snoozes'+(m.back_to_bed?' · Back to bed '+OW.time.text(m.back_to_bed):'')+'</div><div class="slp-sub">'+esc(OW.sleepSchedule.comparisonText(m))+'</div></div>').join(''):'<div class="b2-none">No mornings recorded yet</div>') + OW.app.sleepPeople.map((p) => {
        const stages = [['deep', p.deep], ['core', p.core], ['rem', p.rem], ['awake', p.awake]].filter((x) => x[1] > 0), total = stages.reduce((n, x) => n + x[1], 0);
        return '<div class="slp"><div class="slp-top"><b>' + esc(p.name) + '</b><span class="mono">' + hm(p.asleep) + '</span></div>' +
          (total ? '<div class="slp-bar">' + stages.map((x) => '<i class="s-' + x[0] + '" style="flex:' + x[1] + '"></i>').join('') + '</div>' : '') +
          '<div class="slp-sub">' + [p.deep ? hm(p.deep) + ' deep' : '', p.rem ? hm(p.rem) + ' REM' : '', p.bed && p.wake ? fmt.hm(p.bed) + '–' + fmt.hm(p.wake) : '', p.avg ? (p.nights || 7) + '-night avg ' + hm(p.avg) : ''].filter(Boolean).join(' · ') + '</div></div>';
      }).join('') + '</div>';
    },
  };

  T.lastNight = {
    title: 'Last night', topics: ['all', 'sleepdata'],
    show() { return OW.app.sleepPeople.length > 0 || !!D().launch?.scheduleLog?.length; },
    render() { return '<div class="rows scroll">' + (D().launch?.scheduleLog||[]).map(r=>'<div class="slp" data-focus tabindex="0" data-fid="goodnight-'+r.goodnightAt+'"><b>Before '+esc(r.wakeDate||'wake')+'</b><div class="slp-sub">'+esc(OW.sleepSchedule.comparisonText(r))+'</div></div>').join('') + OW.app.sleepPeople.map(p => '<div class="row two"><b>' + esc(p.name) + '</b><span>' + OW.app.hm(p.asleep) + (p.avg ? ' · average ' + OW.app.hm(p.avg) : '') + '</span></div>').join('') + '</div>'; },
  };

  // Status → AI: today's brief (sourced bullets) and the latest AI headlines. Not drawn without a fresh brief.
  T.ai = {
    title: 'ai', topics: ['ai'],
    show() { return !!(OW.app && OW.app.aiBrief && OW.app.aiBrief()); },
    meta() { const b = OW.app.aiBrief(); return b ? '<span>brief · ' + fmt.ago(b.at) + (b.model ? ' · ' + esc(b.model.replace(/^gpt-|^claude-/, '')) : '') + '</span>' : ''; },
    render() {
      const b = OW.app.aiBrief(), news = OW.app.ai.news || [];
      if (!b) return '';
      return '<div class="aib scroll">' + b.bullets.map((x) => '<div class="aib-row"><b>' + esc(x.text) + '</b>' + (x.source ? '<span>' + esc(x.source) + '</span>' : '') + '</div>').join('') + '</div>' +
        (news.length ? '<div class="subhead"><span>latest</span><span>' + news.length + '</span></div><div class="aih">' + news.slice(0, 3).map((n) => '<div class="nrow"><b>' + esc(n.title) + '</b><span>' + esc(n.site) + ' · ' + fmt.ago(n.at) + '</span></div>').join('') + '</div>' : '');
    },
  };
  T.playingNow = Object.assign({}, T.playing, { show() { return OW.data.has('nowPlaying') && D().nowPlaying.state !== 'idle'; } });
  function homePrefs() {
    // one arrangement for every screen when wallhub carries it (prefs.home_tiles), this screen's own otherwise
    const src = OW.config.get('home.tiles') || {};
    const order = (Array.isArray(src.order) ? src.order : []).filter((id) => HOME_TILES[id]);
    HOME_DEFAULT.forEach((id) => { if (!order.includes(id)) order.push(id); });
    return { order, hidden: (Array.isArray(src.hidden) ? src.hidden : []).filter((id) => HOME_TILES[id] && !HOME_TILES[id].fixed) };
  }
  function homeCols() {
    const { order, hidden } = homePrefs();
    const cols = [{ w: '1.2fr', t: [], sum: 0 }, { w: '1fr', t: [], sum: 0 }, { w: '1fr', t: [], sum: 0 }];
    order.filter((id) => !hidden.includes(id) && shown(id)).forEach((id) => {
      const w = HOME_TILES[id].w;
      const c = cols.find((x) => x.sum + w <= 12) || cols.slice().sort((a, b) => a.sum - b.sum)[0];
      c.t.push([id, w]); c.sum += w;
    });
    return cols.filter((c) => c.t.length).map(c=>c.t.length===1?{...c,t:[[c.t[0][0],12]],sum:12}:c);
  }
  const HOME = {
    phone:{cls:'g-phone',css:true,tiles:[['hero','phone-clock'],['sleep','phone-sleep'],['weather','phone-weather'],['due','phone-due']]},
    panel: { cls: 'g-flex g-home', get cols() { return homeCols(); } },
    tv: { cls: 'g-tv', css: true, tiles: [['hero', 'a-hero'], ['today', 'a-today'], ['handoff', 'a-handoff'], ['sleep', 'a-sleep'], ['apps', 'a-apps'], ['alerts', 'a-alerts']] },
  };
  T.comms={show(){return !D().launch?.sleeping;},title:()=>D().launch?.sleeping?'Notices':'Comms',topics:['all','status'],render(){return '<p>Notices from Flight Day and your integrations</p>'+((D().lines||[]).filter(x=>OW.themeFeatures?.eligible(x)).map(x=>'<p>'+esc(x.text)+'</p>').join('')||'<p>No notices reported</p>');}};
  const LAYOUT = {
    home: HOME.panel,
    space: { cls: 'g-mission', css: true, tiles: [['launches', 'a-launches'], ['globe', 'a-globe'], ['brief', 'a-brief'], ['spaceEvents', 'a-events'], ['news', 'a-news']] },
    house: { cls: 'g-flex', get cols() {
      const idle = !OW.data.has('nowPlaying') || D().nowPlaying.state === 'idle';      // an idle player is a slim strip
      return [{ w: '1.1fr', t: [['thermostat', 12]] }, {w:'1.05fr',t:[["robotVacuum",9],['lights',5],['scenes',3]]}, { w: '1.05fr', t: [['playing', idle ? 2 : 5], ['tv', 3.2], ["audioAdapter", idle ? 6.8 : 5], ['favorites', 3]] }, { w: '1.15fr', t: [['camFront', 4.6], ['camDrive', 3], ['camLiving', 3.4], ['camEvents', 4]] }];
    } },
    night: { cls: 'g-flex', cols: [{ w: '1.5fr', t: [['sleepFull', 12]] }, { w: '1fr', t: [['nightPlan', 7], ['lastNight', 5]] }] },
    status: { cls: 'g-flex', top:'houseCheck', cols: [{ w: '.9fr', t: [['comfortHealth',3],['machines', 4], ['homelab', 8]] }, { w: '1.15fr', t: [['usage', 8], ['network', 4]] }, { w: '1fr', t: [['agents', 8], ['builds', 4], ['voice', 3]] }, { w: '1.1fr', t: [['comms',3],['sleepStat', 3], ['ai', 9]] }] },
  };
  const AREAS = [['home', 'Home'], ['space', 'Space'], ['house', 'House'], ['night', 'Night'], ['status', 'Status']];

  function bedtimeLine(){const m=D().sleepSchedule;if(!m)return '';const L=sleepModel();return OW.sleepSchedule.targetLine(m,L.target,L.master,OW.nowMs());}
  const V = { bedtimeLine, tiles: T, layout: LAYOUT, homeMode: 'panel', areas: AREAS, homeTiles: HOME_TILES, homePrefs, sleepModel, space: V_space, vehicle, selectedLaunch, manifest, alerts: alertList, weatherHours, wxIcon, dueList, dueWhen, eventName: (e) => eventParts(e.title).main, refreshStale: () => V_refreshStale(), sleep: V_sleep = { sel: null, localTime: null, localAlarm: null }, soundIcon, volFrac, heroLaunch, climateGlance, climateRoutines, comfortSummary };

  function ready(id) { const t = T[id]; return !t.needs || OW.data.has(t.needs); }
  /** is this tile worth showing at all? (tiles with nothing behind them are hidden, never placeholder billboards) */
  function shown(id) {
    const t = T[id];
    try { return t.show ? !!t.show() : ready(id); } catch (e) { return false; }
  }
  /** what is hidden right now, in plain words — listed once, in the integrations tile */
  V.missing = function () {
    const names = { playing: 'Now playing', lights: 'Lights', tv: 'TVs', audioAdapter: 'Speakers', favorites: 'Favourites', camFront: 'Cameras', camDrive: 'Doorbell', camEvents: 'Camera sensors', usage: 'Plan limits', builds: 'Builds & PRs', voice: 'Voice shortcuts', network: 'Panel network' };
    const out = [];
    Object.keys(names).forEach((id) => { if (T[id] && !shown(id) && !(id === 'network' && OW.mode !== 'panel')) out.push(names[id]); });
    return out;
  };
  /** {at, ttlMin} for tiles fed by something remote; null for local ones */
  function freshness(id) {
    const S = OW.space, u = OW.usage.data, st = OW.data.status;
    const sp = (topic, ttl) => (S.updated[topic] ? { at: S.updated[topic], ttl } : null);
    const ha = () => (st.provider === 'ha' && st.at ? { at: st.connected ? OW.nowMs() : st.at, ttl: 2 } : null);
    switch (id) {
      case 'launches': case 'missions': return sp('launches', 60);
      case 'iss': return sp('iss', 3);
      case 'crew': return sp('crew', 14 * 60);
      case 'spaceEvents': return sp('events', 90);
      case 'news': return sp('news', 45);
      case 'spotlight': return sp('programs', 30 * 60);
      case 'usage': case 'usageMini': case 'agents': case 'gauges': case 'builds': return u && !u.mock ? { at: u.generatedAt, ttl: 20 } : null;
      case 'thermostat': return ha();
      case 'lights': case 'quick': case 'scenes': case 'playing': case 'playingNow': case 'tv': case "audioAdapter": case 'favorites': case 'camFront': case 'camLiving': case 'camDrive': case 'camEvents': case 'handoff': return ha();
      case 'sleep': case 'sleepFull': case 'nightPlan': return D().launch && D().launch.days ? ha() : null;
      case 'weather': case 'hero': return D().weather && D().weather.at ? { at: D().weather.at, ttl: 90 } : null;
      default: return null;
    }
  }
  function staleAt(id) { let f = null; try { f = freshness(id); } catch (e) { f = null; } return f && f.at && OW.nowMs() - f.at > f.ttl * 60000 ? f.at : 0; }
  /** once a minute: tiles whose data aged out get dimmed (and the ones that caught up are restored) */
  V_refreshStale = function () {
    document.querySelectorAll('.view [data-tile]').forEach((el) => {
      const at = staleAt(el.dataset.tile), was = el.classList.contains('stale');
      if (!!at !== was) { el.classList.toggle('stale', !!at); const th = el.querySelector('.th'); if (th) th.outerHTML = tileHead(el.dataset.tile); }
    });
  };
  function tileHead(id) {
    const t = T[id];
    const title = typeof t.title === 'function' ? t.title() : t.title;
    let meta = '';
    try { meta = (t.meta ? t.meta() : '') || (t.needs && OW.data.isDemo(t.needs) ? chip('demo', 'yel') : ''); } catch (e) { meta = ''; }
    const old = staleAt(id);
    const plain={houseCheck:'House check',thermostat:'Climate',sleepStat:'Sleep and wake history',comms:'Notices'}[id];
    return '<header class="th"><span class="tt"'+(plain?' aria-label="'+plain+'"':'')+'>' + title + '</span><span class="tm">' + (old ? '<span class="asof">as of ' + (OW.nowMs() - old > 20 * 3600000 ? fmt.when(old) : fmt.hm(old)) + '</span>' : '') + meta + '</span></header>';
  }
  function safe(id) {
    try { if(['usage','usageMini','agents','machines','gauges'].includes(id)&&!OW.model.builder())return standby('gauge','Builder desk is off','Turn on Builder desk for this home');return T[id].render(); }
    catch (e) { console.error('tile ' + id, e); return empty('This card could not load · try again from Settings → Reload', 'x'); }
  }
  function tileHtml(id, area, style) {
    return '<section class="tile ' + (area || '') + ' tile-' + id + (staleAt(id) ? ' stale' : '') + '" data-tile="' + id + '" ' + (HOME_TILES[id] ? 'data-hold="home.edit" ' : '') + (style ? 'style="' + style + '" ' : '') + (T[id].attrs || '') + '>' + tileHead(id) + '<div class="tb">' + safe(id) + '</div></section>';
  }
  /** visible tiles of a workspace, as a signature (to notice when something appeared or went away) */
  function signature(ws) {
    const L = LAYOUT[ws];
    const ids = L.css ? L.tiles.map((x) => x[0]) : (L.cols || L.rows).reduce((a, g) => a.concat(g.t.map((x) => x[0])), []);
    return (L.top?[L.top,...ids]:ids).filter((id) => ['alerts','apps'].includes(id) ? shown(id) : L.css || shown(id)).join(',')+(L.top&&shown(L.top)?'|'+OW.houseCheck.topRows():'');
  }
  // Reconcile Home without discarding live clock readings or their DOM identity.
  function patchHome(root, html) {
    const template=document.createElement('template'); template.innerHTML=html;
    const key=el=>el.nodeType===1 ? el.hasAttribute('data-tile') ? 'tile:'+el.getAttribute('data-tile') : el.matches('.hero [data-clock]') ? 'clock:'+el.getAttribute('data-clock') : null : null;
    const retained=new Map();root.querySelectorAll('[data-tile],.hero [data-clock]').forEach(el=>retained.set(key(el),el));
    function attributes(el, next) {
      for(const a of [...el.attributes])if(!next.hasAttribute(a.name))el.removeAttribute(a.name);
      for(const a of next.attributes)if(el.getAttribute(a.name)!==a.value)el.setAttribute(a.name,a.value);
    }
    function children(parent, next) {
      const desired=[...next.childNodes], used=new Set();
      desired.forEach((node,index)=>{
        const k=key(node); let old=k ? retained.get(k) : parent.childNodes[index];
        if(!old || used.has(old) || old.nodeType!==node.nodeType || old.nodeName!==node.nodeName || (!k && key(old)))old=null;
        if(!old)old=node.cloneNode(false);
        const at=parent.childNodes[index];if(old!==at)parent.insertBefore(old,at || null);used.add(old);
        if(node.nodeType===3){if(old.nodeValue!==node.nodeValue)old.nodeValue=node.nodeValue;}
        else if(node.nodeType===1){attributes(old,node);if(!node.hasAttribute('data-clock'))children(old,node);}
      });
      for(const child of [...parent.childNodes])if(!used.has(child))child.remove();
    }
    children(root,template.content);
  }
  // Observe the available slot, not the snapped list, to avoid resize feedback.
  const lightSlots = new WeakSet();
  function fitLights(slot) {
    const list = slot.querySelector('.lights'), row = list?.firstElementChild;
    if (!row || !slot.clientHeight) return;
    const height = row.getBoundingClientRect().height;
    if (!height) return;
    const hint = slot.parentElement.querySelector('.lights-more');
    const overflow = list.children.length * height > slot.clientHeight + .5;
    hint.hidden = !overflow;
    const room = slot.clientHeight;
    const rows = Math.min(list.children.length, Math.floor((room + .01) / height));
    list.style.height = Math.max(0, rows * height) + 'px';
  }
  const lightResize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => entries.forEach(e => fitLights(e.target))) : null;
  function sizeLights() {
    document.querySelectorAll('.lights-slot').forEach(slot => {
      if (!lightSlots.has(slot)) { lightSlots.add(slot); lightResize?.observe(slot); }
      fitLights(slot);
    });
  }
  let lightsFrame;
  function queueLights() { cancelAnimationFrame(lightsFrame); lightsFrame = requestAnimationFrame(sizeLights); }
  function buildView(ws) {
    const view = document.getElementById('v-' + ws), L = LAYOUT[ws];
    queueLights();
    view.className = 'view ' + L.cls + (view.classList.contains('on') ? ' on' : '');
    view.dataset.sig = signature(ws);
    view.removeAttribute('style');
    if (L.css) {
      // TV Home honours "hidden" from the shared arrangement (its grid is fixed, so there is no reordering there)
      const hid = ws === 'home' ? homePrefs().hidden : [];
      view.classList.toggle('no-apps',ws==='home'&&!shown('apps'));
      view.classList.toggle('has-alerts',ws==='home'&&!hid.includes('alerts')&&shown('alerts'));
      const html=L.tiles.filter(([id]) => !hid.includes(id) && (!['alerts','apps'].includes(id)||shown(id))).map(([id, area]) => tileHtml(id, area)).join('');
      if(ws==='home')patchHome(view,html);else view.innerHTML=html;
      hid.forEach((id) => view.classList.add('no-' + id));
      return;
    }
    let html = '';
    if (L.cols) {
      const cols = L.cols.map((c) => ({ w: c.w, t: c.t.filter((x) => shown(x[0])) })).filter((c) => c.t.length);
      view.style.gridTemplateColumns = cols.map((c) => c.w).join(' ');
      view.style.gridTemplateRows = 'repeat(120, minmax(0, 1fr))';
      view.style.rowGap = '0';   // 120 fine tracks: the gap is a margin on the tile instead
      const topEnd=L.top&&shown(L.top)?1+OW.houseCheck.topRows():1, tracks=121-topEnd;
      if(topEnd>1)html+=tileHtml(L.top,'','grid-column:1/-1;grid-row:1/'+topEnd+';margin-bottom:.85cqw');
      cols.forEach((c, ci) => {
        // a nearly full column is stretched to the bottom; a short one keeps its tiles at their own size
        const sum = c.t.reduce((n, x) => n + x[1], 0), total = ws === 'home' && sum < 10 ? 12 : sum;
        let at = topEnd;
        c.t.forEach((x, i) => {
          const end = i === c.t.length - 1 && total === sum ? 121 : at + Math.round((x[1] / total) * tracks);
          html += tileHtml(x[0], '', 'grid-column:' + (ci + 1) + ';grid-row:' + at + '/' + end + (i ? ';margin-top:.85cqw' : ''));
          at = end;
        });
      });
    } else {
      const rows = L.rows.map((r) => ({ h: r.h, t: r.t.filter((x) => shown(x[0])) })).filter((r) => r.t.length);
      view.style.gridTemplateColumns = 'repeat(120, minmax(0, 1fr))';
      view.style.columnGap = '0';
      view.style.gridTemplateRows = rows.map((r) => 'minmax(0, ' + r.h + 'fr)').join(' ');
      rows.forEach((r, ri) => {
        const total = r.t.reduce((n, x) => n + x[1], 0);
        let at = 1;
        r.t.forEach((x, i) => {
          const end = i === r.t.length - 1 ? 121 : at + Math.round((x[1] / total) * 120);
          html += tileHtml(x[0], '', 'grid-row:' + (ri + 1) + ';grid-column:' + at + '/' + end + (i ? ';margin-left:.85cqw' : ''));
          at = end;
        });
      });
    }
    const viewOnly=ws==='house'&&OW.data.client?.hasEntityInfo&&OW.data.client.info?.principal==='screen'&&OW.model.screen()?.control==='none';
    if(ws==='home'){patchHome(view,html);return;}
    view.innerHTML = html || '<div class="quiet-view">' + icon('satellite') + '<span>'+(viewOnly?'View only on this screen':'Add integrations in Settings when you’re ready')+'</span></div>';

  }
  const pickHome = () => {const phone=window.innerWidth<700;document.documentElement.classList.toggle('phone-layout',phone);return phone?'phone':OW.isTV?'tv':'panel';};
  /** home column weights follow the content: an idle player is a slim strip, not half a column */
  function tuneHome() { /* the Home columns are computed from the owner's arrangement (homeCols) */ }

  // TV side tile: whatever is real right now - music first, otherwise the agenda
  T.tvside = {
    title() { return OW.data.has('nowPlaying') && D().nowPlaying.state !== 'idle' ? 'now playing' : 'today'; }, topics: ['all', 'media', 'events'],
    meta() { return OW.data.has('nowPlaying') && D().nowPlaying.state !== 'idle' ? T.playing.meta() : T.today.meta(); },
    render() { return OW.data.has('nowPlaying') && D().nowPlaying.state !== 'idle' ? T.playing.render() : T.today.render(); },
  };

  V.build = function () {
    V.homeMode = pickHome();
    tuneHome();
    LAYOUT.home = HOME[V.homeMode];
    Object.keys(LAYOUT).forEach(buildView);
  };

  /** Re-lay a workspace when the set of tiles it can show changed (a source connected or went away). */
  V.syncLayouts = function () {
    let changed = false;
    const mode = pickHome();
    tuneHome();
    if (mode !== V.homeMode) { V.homeMode = mode; LAYOUT.home = HOME[mode]; }
    Object.keys(LAYOUT).forEach((ws) => {
      const view = document.getElementById('v-' + ws);
      const sig = signature(ws) + (ws === 'home' ? '|' + V.homeMode + '|' + (V.homeMode === 'tv' ? homePrefs().hidden.join() : JSON.stringify(homeCols().map((c) => c.t))) : '');
      if (view.dataset.sig2 !== sig) { view.dataset.sig2 = sig; buildView(ws); changed = true; }
    });
    if (changed && OW.app && OW.app.layoutBlur) OW.app.layoutBlur();
    return changed;
  };
  V.syncHomeLayout = V.syncLayouts;
  window.addEventListener('resize',()=>{V.syncLayouts();queueLights();});

  V.renderTile = function (id) {
    if (id === 'lights') queueLights();
    const el = document.querySelector('[data-tile="' + id + '"]');
    if (!el) return;
    el.classList.toggle('stale', !!staleAt(id));
    OW.focus.preserve(el, () => {
      el.querySelector('.th').outerHTML = tileHead(id);
      if(id==='hero')patchHome(el.querySelector('.tb'),safe(id));else el.querySelector('.tb').innerHTML = safe(id);
    });
  };

  /** Re-render every tile subscribed to a topic. */
  V.update = function (topic) {
    if(!OW.data.state)return; // Provisioning/model events can precede provider boot.
    if (['all', 'lights', 'media', 'usage', 'cams', 'machines', 'tv', 'launches', 'live-start', 'status', 'home-tiles', 'iss', 'events', 'weather', 'ai', 'sleepdata'].includes(topic)) V.syncLayouts();
    Object.keys(T).forEach((id) => {
      const topics = T[id].topics || [];
      if (topics.includes(topic) || (topic === 'all' && topics.includes('all'))) V.renderTile(id);
    });
    if (OW.app && OW.app.tick) OW.app.tick(true);
  };

  // Rebuilt with each tile render/model push; this is presentation, never server authorization.
  function projectedControls(html){
    const c=OW.data.client;if(!c?.hasEntityInfo)return html;
    const root=document.createElement('div');root.innerHTML=html;const s=D(),roles=c.model.config.roles,notes=new Set();
    for(const button of root.querySelectorAll('button[data-act]')){
      const a=button.dataset.act,arg=button.dataset.arg;let id;if(a==='scene'&&!arg?.startsWith('scene.'))continue;
      if(a==='scene'||a==='light.toggle')id=arg;
      else if(a==='light.all'){if((s.lights||[]).some(row=>!c.permission(row.id).blocked))continue;id=(s.lights||[])[0]?.id;}
      else if(a==='comfort.action'||a.startsWith('climate.')&&!a.endsWith('.open'))id=roles.thermostat;
      else if(a==='vacuum.action')id=roles.vacuum;
      else if(a.startsWith('media.'))id=s.nowPlaying?.id;
      else if(['tv.power','tv.mute','tv.playpause','tv.input'].includes(a))id=(arg==='bedroom'?s.bedroomTv:s.tv)?.id;
      else if(a==="audioAdapter.play"||a==='sleep.unmute')id=c.currentSpeaker||roles.sleep_speaker;
      if(!id)continue;const p=c.permission(id);if(!p.blocked)continue;
      button.disabled=true;button.classList.add('entity-view-only');button.setAttribute('aria-disabled','true');button.title=p.copy;
      if(!root.textContent.includes(p.copy))notes.add(p.copy);
    }
    for(const copy of notes){const note=document.createElement('p');note.className='entity-note';note.textContent=copy;root.prepend(note);}
    return root.innerHTML;
  }
  for(const tile of Object.values(T))if(typeof tile.render==='function'){const render=tile.render;tile.render=function(){return projectedControls(render.call(this));};}
  V.projectedControls=projectedControls;
  OW.views = V;
})();
