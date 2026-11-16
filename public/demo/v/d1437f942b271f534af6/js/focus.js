/* D-pad / keyboard spatial navigation.
 * Every interactive element carries [data-focus]. Arrow keys move to the
 * nearest focusable in that direction (within the current scope: the open
 * modal, or the bar + LIVE banner + active workspace). The focus ring is only
 * shown in "keyboard mode" so touch use on the panel stays clean. */
(function () {
  'use strict';
  const OW = window.OW;
  const F = { kb: false, last: {} };

  function visible(el) {
    if (!el || el.disabled) return false;
    if (el.closest('[hidden]')) return false;
    if (getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).display === 'none') return false;
    return el.getClientRects().length > 0;
  }

  F.scopeRoots = function () {
    const shutdown=document.getElementById('shutdown');
    if(OW.app?.shutdownComfort&&shutdown&&!shutdown.hidden)return [shutdown];
    const alarm = document.getElementById('alarmControls');
    if (alarm && !alarm.hidden) return [alarm];
    const ringing=OW.app?.briefAlarm && OW.app?.alarm?.state==='ringing' && document.querySelector('.b2-head .alarm-actions');
    if(ringing)return [ringing];
    const modal = document.querySelector('.modal:not([hidden])') || document.querySelector('.watch:not([hidden])') || document.querySelector('.liftoff.briefing:not([hidden]) .brief');
    if (modal) return [modal];
    const roots = [document.getElementById('bar')];
    const live = document.getElementById('live');
    if (live && !live.hidden) roots.push(live);
    const view = document.querySelector('.view.on');
    if (view) roots.push(view);
    return roots;
  };

  F.candidates = function () {
    const out = [];
    F.scopeRoots().forEach((r) => r.querySelectorAll('[data-focus]').forEach((el) => { if (visible(el)) out.push(el); }));
    return out;
  };

  F.setKb = function (on) {
    if (F.kb === on) return;
    F.kb = on;
    document.getElementById('stage').classList.toggle('kb', on);
  };

  F.current = function () {
    const a = document.activeElement;
    return a && a.hasAttribute && a.hasAttribute('data-focus') && visible(a) && F.scopeRoots().some(root=>root && root.contains(a)) ? a : null;
  };

  F.focus = function (el) {
    if (!el) return false;
    if (!el.hasAttribute('tabindex') && !/^(BUTTON|INPUT|A)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');   // tiles and field wrappers
    el.focus({ preventScroll: true });
    const row = el.closest('.scroll,.tb');
    if (row && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    const view = el.closest('.view');
    if (view && el.dataset.fid) F.last[view.dataset.ws] = el.dataset.fid;
    return true;
  };

  /** Focus the remembered (or first) control of the active scope. */
  F.enter = function (preferView) {
    const roots = F.scopeRoots();
    const root = preferView ? roots[roots.length - 1] : roots[0];
    if (!root) return;
    let target = null;
    if (root.classList.contains('view')) {
      const fid = F.last[root.dataset.ws];
      if (fid) target = root.querySelector('[data-fid="' + fid + '"]');
    }
    if (!target || !visible(target)) target = Array.from(root.querySelectorAll('[data-focus-first]')).find(visible) || Array.from(root.querySelectorAll('[data-focus]')).find(visible);
    F.focus(target);
  };

  F.move = function (dir) {
    const cur = F.current();
    if (!cur) { F.enter(true); return; }
    // A focused reading card scrolls through its content before moving to the next card.
    if (cur.hasAttribute('data-scroll-focus') && (dir==='down'||dir==='up')) {
      const before=cur.scrollTop,delta=(dir==='down'?1:-1)*Math.max(48,cur.clientHeight*.65);
      cur.scrollTop+=delta;if(Math.abs(cur.scrollTop-before)>1)return true;
    }
    const c = cur.getBoundingClientRect();
    const horizontal = dir === 'left' || dir === 'right';
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    let best = null, bestScore = Infinity;
    F.candidates().forEach((el) => {
      if (el === cur) return;
      const r = el.getBoundingClientRect();
      // gap along the travel axis (must be ahead of us)
      const ahead = horizontal
        ? (sign > 0 ? r.left - c.right : c.left - r.right)
        : (sign > 0 ? r.top - c.bottom : c.top - r.bottom);
      const centerAhead = horizontal
        ? sign * ((r.left + r.right) / 2 - (c.left + c.right) / 2)
        : sign * ((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2);
      if (ahead < -Math.min(horizontal ? c.width : c.height, horizontal ? r.width : r.height) * 0.5 || centerAhead <= 1) return;
      // sideways miss: zero when the two boxes overlap on the cross axis
      const cross = horizontal
        ? Math.max(0, r.top - c.bottom, c.top - r.bottom)
        : Math.max(0, r.left - c.right, c.left - r.right);
      const crossCenter = horizontal
        ? Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2)
        : Math.abs((r.left + r.right) / 2 - (c.left + c.right) / 2);
      const score = Math.max(0, ahead) + cross * 3 + crossCenter * 0.35 + (cross > 0 ? 40 : 0);
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) F.focus(best);
    return !!best;
  };

  /** Keep focus on the "same" control when a tile re-renders. */
  F.preserve = function (container, renderFn) {
    const a = document.activeElement;
    const fid = a && container.contains(a) && a.dataset ? a.dataset.fid : null;
    renderFn();
    if (fid) {
      const again = container.querySelector('[data-fid="' + fid + '"]');
      if (again && visible(again)) F.focus(again);
      else { const next=Array.from(container.querySelectorAll('[data-focus]')).find(visible); if(next)F.focus(next);else F.enter(true); }
    }
  };

  OW.focus = F;
})();
