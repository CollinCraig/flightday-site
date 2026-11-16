/* Bridge to the Android host (window.flightdayNative, see WallActivity.Bridge).
 * Every call is safe in a plain browser: it just reports "unavailable". */
(function () {
  'use strict';
  const OW = window.OW;
  const N = OW.demo?.active ? null : window.flightdayNative || null;

  function call(name, ...args) {
    try {
      if (N && typeof N[name] === 'function') return N[name](...args);
    } catch (e) { console.warn('native ' + name + ' failed', e); }
    return undefined;
  }

  let info = { mode: OW.mode, rooted: false, version: 'web', model: 'browser', sdk: 0 };
  try { if (N) info = Object.assign(info, JSON.parse(N.info())); } catch (e) { /* keep defaults */ }

  OW.host = {
    available: !!N,
    info,
    /** Optional power hook; null means native delivery is pending. */
    wallpaperPower() { try { const v=call('wallpaperPower'); return typeof v==='string'?JSON.parse(v):v||null; } catch (_) { return null; } },
    /** Native visibility includes a paused activity that is still visible. Null means an older bridge. */
    foreground() { const value=call('isForeground'); return typeof value==='boolean'?value:null; },
    /** "root" (backlight really off), "soft" (dimmed + black overlay) or "unavailable" */
    screenOff() { return call('screenOff') || 'unavailable'; },
    screenOn() { return call('screenOn') || 'unavailable'; },
    setBrightness(pct) { return call('setBrightness', Math.round(pct)) || 'unavailable'; },
    getBrightness() { const v = call('getBrightness'); return typeof v === 'number' ? v : -1; },
    setSchedule(s) { call('setSchedule', JSON.stringify(s)); },
    exitToSystemLauncher() { call('exitToSystemLauncher'); },
    openSystemSettings() { call('openSystemSettings'); },
    exit() { call('exit'); },
    reload() { if (N) call('reload'); else location.reload(); },
    log(msg) { call('log', String(msg)); },
    /** Real device calendar: array of events, {error} or null when there is no native host. */
    calendar(fromMs, toMs) {
      const raw = call('calendar', fromMs, toMs);
      if (typeof raw !== 'string') return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    requestCalendarPermission() { call('requestCalendarPermission'); },
  };

  // Native -> page events arrive through OW.native(name, payload); app.js subscribes.
  const handlers = [];
  OW.native = function (name, payload) { if (OW.demo?.active) return; handlers.forEach((h) => { try { h(name, payload); } catch (e) { console.error(e); } }); };
  OW.onNative = (fn) => handlers.push(fn);
})();

// Origin-bound native power channel is present in both Android flavors and dreams.
(function(){const c=window.FlightDayPower;if(!c||!window.OW||OW.demo?.active)return;let last=null;c.onmessage=e=>{try{last=JSON.parse(e.data);OW.native('wallpaper-power',last);}catch(_){}};const read=()=>{c.postMessage('read');return last;};OW.host.wallpaperPower=read;read();})();
