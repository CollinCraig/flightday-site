/* Network helper. Inside the Android app every remote request goes through the
 * native same-origin proxy (/net/json, /net/img): disk cache with TTL, stale
 * copies when offline or rate-limited, and images downscaled before decode.
 * In a plain browser it falls back to direct fetch + a small in-page cache. */
(function () {
  'use strict';
  const OW = window.OW;
  const native = !OW.demo?.active && location.hostname === 'appassets.androidplatform.net';
  const mem = new Map();

  function lsGet(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; } }
  function lsSet(key, v) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* quota */ } }

  OW.net = {
    native,

    /** Returns {data, stale, ageSec}. Throws when there is neither a response nor a cached copy. */
    async json(url, ttlSec) {
      ttlSec = ttlSec || 900;
      if (native) {
        const r = await fetch('/net/json?ttl=' + ttlSec + '&u=' + encodeURIComponent(url), { cache: 'no-store' });
        if (!r.ok) throw new Error('feed ' + r.status);
        const data = await r.json();
        return { data, stale: r.headers.get('X-OW-Cache') === 'stale', ageSec: +(r.headers.get('X-OW-Age') || 0) };
      }
      const key = 'ow.net.' + OW.hash(url);
      const hit = mem.get(key) || lsGet(key);
      const now = Date.now();
      if (hit && now - hit.t < ttlSec * 1000) return { data: hit.d, stale: false, ageSec: (now - hit.t) / 1000 };
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        const r = await fetch(url, { signal: ctl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error('feed ' + r.status);
        const data = await r.json();
        const rec = { t: now, d: data };
        mem.set(key, rec);
        if (JSON.stringify(data).length < 200000) lsSet(key, rec);
        return { data, stale: false, ageSec: 0 };
      } catch (e) {
        if (hit) return { data: hit.d, stale: true, ageSec: (now - hit.t) / 1000 };
        throw e;
      }
    },

    /** URL for a remote image, w pixels wide (cached + downscaled natively). */
    img(url, w) {
      if (!url) return '';
      if (/^(data:|blob:|img\/|\.\/|\/)/.test(url)) return url;
      return native ? '/net/img?w=' + (w || 1920) + '&u=' + encodeURIComponent(url) : url;
    },

    /** Loads an image element. Resolves with the element, rejects on error/timeout. */
    load(src, timeoutMs) {
      return new Promise((resolve, reject) => {
        const im = new Image();
        if (!native && /^https?:/.test(src)) im.crossOrigin = 'anonymous';
        const timer = setTimeout(() => { im.src = ''; reject(new Error('image timeout')); }, timeoutMs || 45000);
        im.onload = () => { clearTimeout(timer); resolve(im); };
        im.onerror = () => { clearTimeout(timer); reject(new Error('image failed')); };
        im.decoding = 'async';
        im.src = src;
      });
    },
  };
})();
