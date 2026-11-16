/* Shared wake calculations. HA remains authoritative; this also powers the offline backstop. */
(function () {
  const OW = window.OW;
  const W = OW.wake = { skew: 0 };
  W.now = () => OW.nowMs() + W.skew;
  W.clock = (fired) => { const offset = Date.parse(fired) - OW.nowMs(); if (Number.isFinite(offset) && Math.abs(offset - W.skew) > 1500) { W.skew = offset; OW.host.log('alarm clock skew corrected ' + Math.round(offset) + ' ms'); } };
  // Exact HA select options; no numeric-helper or zero encoding.
  W.briefingHours = value => ['1','2','3','noon'].includes(value) ? value : '2';
  W.briefingEnd = (alarm, hours, fallback) => {
    const at = Date.parse(alarm?.launch_at) || fallback;
    if (!Number.isFinite(at)) return 0;
    if (W.briefingHours(hours)!=='noon') return at + Number(W.briefingHours(hours))*3600000;
    const noon = new Date(at); noon.setHours(12,0,0,0); return +noon;
  };
  W.next = (now, deadline, minutes) => { const at = Math.min(now + (minutes + 1) * 60000, deadline); return { at, allowed: at - now >= 180000, minutes: Math.max(0, Math.ceil((at - now) / 60000) - 1), final: at >= deadline }; };
  W.advance = (now, at, immediate) => immediate ? now + 10000 : Math.min(at, Math.max(now + 60000, at - 60000));
  W.volume = (live, cap, p) => live >= cap ? live : Math.min(cap, Math.round(live + (cap-live)*p*p));
  W.preview = (M, events) => {
    const T = M.target; if (!T) return null;
    const choices = [{ at: T.at + (M.snoozeWindow ?? 30) * 60000, reason: (M.snoozeWindow ?? 30) + ' min after wake' }];
    if (T.upBy && T.upBy !== '00:00') { const d = new Date(T.at), [h,m] = T.upBy.split(':').map(Number); d.setHours(h,m,0,0); choices.push({at:+d, reason:'up by (' + T.name + ' setting)'}); }
    (events || []).filter(e => !e.allDay && e.start >= T.at && e.start <= T.at + 21600000 && (!(OW.roles.get('due')||[]).includes(e.calendar||e.source) || OW.roles.get('wake_rule_due')&&new Date(e.start).getHours()<12)).forEach(e => choices.push({at:e.start - (M.readyLead ?? 45)*60000, reason:e.title + ' ' + OW.fmt.hm(e.start) + ' − ' + (M.readyLead ?? 45) + ' min'}));
    choices.sort((a,b)=>a.at-b.at); return {at:Math.max(T.at,choices[0].at),reason:choices[0].reason};
  };
  W.isEveryone=crew=>crew==='both'||crew==='everyone'||Array.isArray(crew)&&OW.model.config.people.filter(p=>p.wakes).every(p=>crew.includes(p.id));
  W.isQuiet=d=>typeof d?.quiet==='boolean'?d.quiet:!W.isEveryone(d?.crew||'both');
  W.crewName = crew => OW.model.name(crew);
  W.crewLine = M => { const crew = M.target?.crew || 'both'; return !W.isEveryone(crew) && !M.phones?.[crew] ? OW.crewText('quiet_fallback',{name:W.crewName(crew)}) : W.crewName(crew) + (!W.isEveryone(crew) ? ' · quiet launch' : ' · full launch'); };
})();
