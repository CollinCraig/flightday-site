/* Mission-control globe (Space area).
 *
 * globe.gl (WebGL, bundled in vendor/) draws the Earth with a real day/night terminator: NASA's Blue
 * Marble on the lit side, city lights on the dark side, split along today's subsolar point. On top:
 * the home marker, tracked spacecraft (positions from wallhub / the ISS propagator), the ISS ground
 * track (past = blue, predicted = amber dashes), launch pads, and a look line from home to the
 * selected pad when that launch can be seen from home.
 *
 * Cost control (wall panel SoC, TVs):
 *   - the library is loaded only when the Space area is first opened
 *   - nothing spins by itself: frames are rendered while something moves (fly-to, a drag, new data)
 *     and the render loop is paused in between
 *   - the first seconds are timed; if a frame takes longer than 28 ms on average the globe is
 *     dropped for the 2D map (OW.globe.mode === '2d') and the choice is remembered for a week
 */
(function () {
  'use strict';
  const OW = window.OW;
  const G = OW.emitter({ mode: 'none', ready: false });      // mode: none | 3d | 2d
  const SLOW_MS = 28, RE = 6371;
  let globe = null, host = null, lib = null, pauseTimer = null, sunTimer = null, visible = false;
  // quality: 'full' (anti-aliased, atmosphere) or 'lite' (no anti-aliasing, 0.75x resolution, no atmosphere) for slower GPUs
  let tier = 'full';
  const sun = [1, 0, 0];
  const data = { home: null, craft: [], pads: [], past: [], future: [], look: null, arc: null };
  const els = new Map();

  const remembered = OW.store.get('globe.mode.v3', null);
  if (remembered && remembered.mode === '2d' && Date.now() - remembered.at < 7 * 86400000) G.mode = '2d';
  if (remembered && remembered.tier) tier = remembered.tier;

  function loadLib() {
    return lib || (lib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = OW.asset?OW.asset('vendor/globe.gl.min.js'):'vendor/globe.gl.min.js';
      s.onload = () => (window.Globe ? resolve() : reject(new Error('globe.gl did not load')));
      s.onerror = () => reject(new Error('globe.gl missing'));
      document.head.appendChild(s);
    }));
  }

  /** where the sun is overhead right now: {lat, lng} (good to a fraction of a degree, plenty for a terminator) */
  G.subsolar = function (t) {
    const d = new Date(t || Date.now());
    const start = Date.UTC(d.getUTCFullYear(), 0, 0), day = (d.getTime() - start) / 86400000;
    const g = (2 * Math.PI / 365.24) * (day - 81);
    const decl = 23.44 * Math.sin(g);
    const eot = 9.87 * Math.sin(2 * g) - 7.53 * Math.cos(g) - 1.5 * Math.sin(g);          // minutes
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    let lng = -15 * (utcH - 12 + eot / 60);
    lng = ((lng + 540) % 360) - 180;
    return { lat: decl, lng };
  };
  /** unit vector in the globe's scene coordinates (three-globe's polar2Cartesian) */
  function dir(lat, lng) {
    const phi = (90 - lat) * Math.PI / 180, th = (90 - lng) * Math.PI / 180;
    return [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
  }
  function updateSun() { const s = G.subsolar(), v = dir(s.lat, s.lng); sun[0] = v[0]; sun[1] = v[1]; sun[2] = v[2]; }

  /** day side = Blue Marble, night side = city lights, blended across the terminator */
  function dayNight() {
    const mat = globe.globeMaterial();
    if (!mat || !mat.map || mat.userData.dayNight) return;
    const img = new Image();
    img.onload = () => {
      const night = new mat.map.constructor(img);
      night.colorSpace = mat.map.colorSpace;
      night.needsUpdate = true;
      mat.userData.dayNight = true;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.nightMap = { value: night };
        shader.uniforms.sunDir = { value: sun };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWorldN;')
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWorldN = normalize(mat3(modelMatrix) * objectNormal);');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D nightMap;\nuniform vec3 sunDir;\nvarying vec3 vWorldN;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' +
            'float sunAmt = smoothstep(-0.10, 0.22, dot(normalize(vWorldN), normalize(sunDir)));\n' +
            'vec3 nightCol = texture2D(nightMap, vMapUv).rgb;\n' +
            'diffuseColor.rgb *= mix(0.05, 1.0, sunAmt);\n' +
            'totalEmissiveRadiance += nightCol * (1.0 - sunAmt) * 1.25;');
      };
      mat.needsUpdate = true;
      kick(600);
    };
    img.src = OW.asset?OW.asset('img/earth-night.webp'):'img/earth-night.webp';
  }

  /** render for a while, then stop the loop again */
  function kick(ms) {
    if (!globe || !visible) return;
    globe.resumeAnimation();
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { if (globe && !G.dragging) globe.pauseAnimation(); }, ms || 500);
  }

  function marker(d) {
    let el = els.get(d.key);
    if (!el) {
      el = document.createElement('div');
      els.set(d.key, el);
    }
    el.className = 'gm gm-' + d.kind + (d.sel ? ' sel' : '') + (d.dim ? ' dim' : '') + (d.left ? ' left' : '');
    const html = '<i></i>' + (d.label ? '<span>' + OW.esc(d.label) + '</span>' : '');
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
    return el;
  }

  function apply() {
    if (!globe) return;
    const marks = [];
    // with a look line the pad is close by: the home label says how far and sits on the other side of its dot
    if (data.home) marks.push({ key: 'home', kind: 'home', lat: data.home.lat, lng: data.home.lng, alt: 0, label: data.look && data.look.km ? 'Home · ' + data.look.km + ' km to pad' : 'Home', left: !!data.look });
    data.pads.forEach((p) => marks.push({ key: 'pad-' + p.id, kind: 'pad', lat: p.lat, lng: p.lng, alt: 0, label: p.sel ? p.label : '', sel: p.sel }));
    data.craft.forEach((c) => marks.push({ key: 'craft-' + c.id, kind: 'craft', lat: c.lat, lng: c.lng, alt: (c.alt || 400) / RE, label: c.label, dim: !c.main }));
    globe.htmlElementsData(marks);
    const paths = [];
    data.past.forEach((seg) => paths.push({ kind: 'past', pts: seg }));
    data.future.forEach((seg) => paths.push({ kind: 'future', pts: seg }));
    if (data.arc) paths.push({ kind: 'ascent', pts: data.arc });
    globe.pathsData(paths);
    globe.arcsData(data.look ? [data.look] : []);
    kick(500);
  }

  let sizeWatch = null;
  function build() {
    const rect = host.getBoundingClientRect();
    // the tile may not be laid out yet (area just switched, fonts still loading): a globe built at 0x0 draws nothing
    // the tile can be re-rendered under us (its element is replaced): a detached host is abandoned, the app hands over the new one
    if (!host.isConnected) { host = null; return; }
    if (rect.width < 80 || rect.height < 80) { const el = host; setTimeout(() => { if (visible && host === el && !globe) build(); }, 250); return; }
    if (window.ResizeObserver) { if (sizeWatch) sizeWatch.disconnect(); sizeWatch = new ResizeObserver(() => G.resize()); sizeWatch.observe(host); }
    const lite = tier === 'lite';
    globe = new window.Globe(host, { rendererConfig: { antialias: !lite, alpha: true, powerPreference: 'high-performance' }, animateIn: false, waitForGlobeReady: true })
      .width(Math.round(rect.width)).height(Math.round(rect.height))
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl(OW.asset?OW.asset('img/earth-day.jpg'):'img/earth-day.jpg')
      .showAtmosphere(!lite).atmosphereColor('#7aa2f7').atmosphereAltitude(0.13)
      .htmlLat('lat').htmlLng('lng').htmlAltitude('alt').htmlElement(marker).htmlTransitionDuration(0)
      .pathPoints('pts').pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathPointAlt((p) => p[2] || 0)
      .pathColor((d) => (d.kind === 'past' ? '#7aa2f7' : d.kind === 'ascent' ? '#ff9e64' : '#ff9e64'))
      .pathStroke((d) => (d.kind === 'ascent' ? 2 : 1.3))
      .pathDashLength((d) => (d.kind === 'future' ? 0.012 : 1)).pathDashGap((d) => (d.kind === 'future' ? 0.008 : 0)).pathDashAnimateTime(0).pathTransitionDuration(0)
      .arcStartLat('fromLat').arcStartLng('fromLng').arcEndLat('toLat').arcEndLng('toLng').arcColor(() => ['#9ece6a', '#9ece6a'])
      .arcAltitude(0.004).arcStroke(0.9).arcDashLength(1).arcDashGap(0).arcsTransitionDuration(0);
    if (globe.htmlElementVisibilityModifier) globe.htmlElementVisibilityModifier((el, vis) => { el.style.opacity = vis ? '' : '0'; });
    try { globe.renderer().setPixelRatio(lite ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.25)); } catch (e) { /* default ratio */ }
    const c = globe.controls();
    c.enableZoom = !OW.isTV; c.enablePan = false; c.autoRotate = false; c.minDistance = 160; c.maxDistance = 520; c.rotateSpeed = 0.5;
    c.addEventListener('start', () => { G.dragging = true; clearTimeout(pauseTimer); globe.resumeAnimation(); });
    c.addEventListener('end', () => { G.dragging = false; kick(900); });
    const home = data.home || { lat: 28, lng: -80 };
    globe.pointOfView({ lat: home.lat, lng: home.lng - 14, altitude: 2.3 }, 0);
    updateSun();
    clearInterval(sunTimer);
    sunTimer = setInterval(() => { updateSun(); kick(300); }, 60000);
    globe.onGlobeReady(() => {
      G.ready = true;
      dayNight();
      apply();
      probe();
      G.emit('ready');
    });
  }

  /** time the first seconds; too slow means this device gets the 2D map instead */
  function probe() {
    if (remembered && remembered.mode === '3d' && Date.now() - remembered.at < 7 * 86400000) { G.mode = '3d'; return; }
    const t0 = performance.now(); let last = t0, n = 0, total = 0;
    clearTimeout(pauseTimer); globe.resumeAnimation();
    { const h = data.home || { lat: 28, lng: -80 }; globe.pointOfView({ lat: h.lat, lng: h.lng, altitude: 2.3 }, OW.reduceMotion() ? 0 : 2200); }   // something has to move for the timing to mean anything
    const step = (t) => {
      if (!globe) return;
      const dt = t - last; last = t;
      if (t - t0 > 500) { n++; total += dt; }                // skip the first half second (texture upload, shader compile)
      if (t - t0 < 2800) return requestAnimationFrame(step);
      const avg = n ? total / n : 0;
      const slow = avg > SLOW_MS;
      OW.host.log('globe (' + tier + '): ' + avg.toFixed(1) + ' ms per frame over ' + n + ' frames -> ' + (!slow ? '3D' : tier === 'full' ? 'trying the lighter 3D' : '2D map'));
      if (slow && tier === 'full') { const el = host; tier = 'lite'; G.destroy(); if (visible && el) { host = el; try { build(); } catch (e) { G.mode = '2d'; G.emit('mode'); } } }
      else if (slow) { OW.store.set('globe.mode.v3', { mode: '2d', at: Date.now(), ms: avg }); G.destroy(); G.mode = '2d'; G.emit('mode'); }
      else { OW.store.set('globe.mode.v3', { mode: '3d', tier, at: Date.now(), ms: avg }); G.mode = '3d'; kick(400); }
    };
    requestAnimationFrame(step);
  }

  /** Put the globe into `el` (the Space area is on screen). Returns false when this device uses the 2D map. */
  G.show = function (el) {
    if (G.mode === '2d' || !el) return false;
    visible = true;
    if (globe && host === el && el.isConnected) { kick(600); return true; }
    if (host === el && !globe && lib) return true;          // already on its way
    if (globe) G.destroy();
    host = el;
    loadLib().then(() => { if (visible && host === el && !globe) { try { build(); } catch (e) { OW.host.log('globe failed: ' + (e.message || e)); G.mode = '2d'; G.emit('mode'); } } })
      .catch((e) => { OW.host.log('globe unavailable: ' + (e.message || e)); G.mode = '2d'; G.emit('mode'); });
    return true;
  };
  /** the Space area left the screen: stop rendering (the scene stays for a quick return) */
  G.hide = function () { visible = false; clearTimeout(pauseTimer); if (globe) globe.pauseAnimation(); };
  G.destroy = function () {
    clearTimeout(pauseTimer); clearInterval(sunTimer);
    if (globe) { try { globe.pauseAnimation(); if (globe._destructor) globe._destructor(); } catch (e) { /* already gone */ } }
    if (sizeWatch) { sizeWatch.disconnect(); sizeWatch = null; }
    globe = null; G.ready = false; els.clear();
    if (host) host.innerHTML = '';
    host = null;
  };
  /** new positions / tracks / pads: {home, craft:[{id,label,lat,lng,alt,main}], pads:[{id,lat,lng,label,sel}], past, future, look, arc} */
  G.set = function (next) {
    Object.assign(data, next);
    if (G.ready) apply();
  };
  G.flyTo = function (lat, lng, altitude) {
    if (!globe || !G.ready) return;
    clearTimeout(pauseTimer); globe.resumeAnimation();
    globe.pointOfView({ lat, lng, altitude: altitude || 2.2 }, OW.reduceMotion() ? 0 : 850);
    pauseTimer = setTimeout(() => { if (globe && !G.dragging) globe.pauseAnimation(); }, 1300);
  };
  G.resize = function () {
    if (!globe || !host) return;
    const r = host.getBoundingClientRect();
    if (r.width > 10 && r.height > 10) { globe.width(Math.round(r.width)).height(Math.round(r.height)); kick(300); }
  };
  /** forget a remembered "too slow" verdict (settings) */
  G.retry = function () { OW.store.set('globe.mode.v3', null); tier = 'full'; G.mode = 'none'; G.emit('mode'); };

  OW.globe = G;
})();
