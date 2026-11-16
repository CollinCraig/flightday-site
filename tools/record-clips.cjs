/* Feature clips for the public site, recorded from the real Flight Day web build in its demo mode.
 *
 *   NODE_PATH=<dir>/node_modules node tools/record-clips.cjs <app repo>/web <out-dir> [clip,clip…] [--demo-only]
 *
 * Same sanitization as capture-sample.cjs: the web app is served read-only with demo data on, no Home Assistant
 * and no hub, generic names swapped in (in this process's responses only), the two bundled wallpapers refused
 * outright (img/liftoff-*, img/dawn-*), and every request to a private address aborted.
 *
 * Where a clip needs the house to answer (Snooze, I'm up, Back to bed, a thermostat mode), a stand-in inside the page
 * replies with the same wall event or state the house would send. Nothing leaves the machine except public data
 * (launch schedule, ISS position, NASA images). The Smart Comfort clip loads a made-up set of thermostat states.
 *
 * Frames come from Chrome's screencast with their timestamps and are resampled to a constant 30 fps as JPEGs in
 * <out-dir>/<clip>/, ready for tools/encode-clip.swift. A small ring marks each tap (a recording overlay, not app UI). */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require('playwright-core');
const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const only = process.argv[4] ? process.argv[4].split(',') : null;
const demoOnly = process.argv.includes('--demo-only');
const FPS = 30, W = 1280, H = 720;
fs.mkdirSync(out, { recursive: true });

const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.m4a': 'audio/mp4' };
// Demo strings to swap for generic ones come from private/site-private.json ("demoSwaps"); without it, none are swapped.
const privFile = path.join(__dirname, '../private/site-private.json');
const swaps = fs.existsSync(privFile) ? JSON.parse(fs.readFileSync(privFile, 'utf8')).demoSwaps : [];
if (!swaps.length) console.log('private term list not found; no demo swaps (check every frame by hand)');
const baseCfg = { provider: 'local', demo: true, people: { partner: { name: 'Sam' } }, schedule: { launchEnabled: false, offEnabled: false },
  ambient: { idleMin: 120 }, cams: { autoLive: false }, units: 'f', display: { timeFormat: '12h' } };
const captureEvidence = [];
let cfg = baseCfg, hideBg = true, injectCfg = true;   // injectCfg false = the FE-W5 demo house (demo=1) drives the data
const TAP_CSS = '.fd-tap{position:fixed;z-index:2147483647;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:3px solid rgba(255,255,255,.9);background:rgba(255,255,255,.18);pointer-events:none;animation:fd-tap .6s cubic-bezier(.2,.7,.1,1) forwards}@keyframes fd-tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.25);opacity:0}}';

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') { res.writeHead(403); return res.end(); }
    if (/\/img\/(liftoff|dawn)-/.test(url.pathname)) { res.writeHead(404); return res.end(); }   // restricted wallpapers: never served
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    let data = fs.readFileSync(file);
    if (/\.(js|html)$/.test(file)) {
      let s = data.toString();
      for (const [a, b] of swaps) s = s.split(a).join(b);
      if (file.endsWith('index.html')) s = s.replace('<script src="js/config.js">', (injectCfg ? '<script>localStorage.setItem("ow.settings.v1",' + JSON.stringify(JSON.stringify(cfg)) + ');</script>' : '') + '<style>' + (hideBg ? '#bgA,#bgB{display:none!important}' : '') + TAP_CSS + '</style><script src="js/config.js">');
      data = Buffer.from(s);
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});

const iso = (ms) => new Date(ms).toISOString();
/** the house, played locally: answers the alarm actions with the wall events Home Assistant sends */
function houseStandIn() {
  const call = OW.data.call.bind(OW.data);
  const A = OW.app, ev = (d) => setTimeout(() => A.onWallEvent(Object.assign({ screens: [A.deviceId()], crew: 'both', time_fired: new Date(OW.nowMs()).toISOString() }, d)), 450);
  OW.data.call = (action, p) => {
    const al = A.alarm || {}, now = OW.nowMs();
    if (action === 'alarm.snooze') { ev({ action: 'snooze', alarm_id: al.alarm_id, deadline: al.deadline, snoozes: 1, until: new Date(now + 9 * 60000).toISOString(), launch_at: new Date(now + 10 * 60000).toISOString() }); return Promise.resolve(); }
    if (action === 'alarm.up') { ev({ action: 'up', alarm_id: al.alarm_id, launch_at: al.launch_at, deadline: al.deadline, up_at: new Date(now).toISOString(), by: A.deviceId() }); return Promise.resolve(); }
    if (action === 'back_to_bed') { ev({ action: 'back_to_bed', sound: 'Thunderstorm' }); return Promise.resolve(); }
    if (action === 'sleep.goodnight' || action === 'night.wake') return Promise.resolve();
    if (window.__fdComfort && /^(climate\.|comfort\.)/.test(action)) return window.__fdComfort(action, p);
    try { return call(action, p); } catch (e) { return Promise.reject(e); }
  };
}

async function recorder(page) {
  // Frames are kept with their capture time and cut into takes afterwards: Chrome can deliver them a beat late.
  const cdp = await page.context().newCDPSession(page);
  const frames = [], windows = [];
  cdp.on('Page.screencastFrame', (f) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    frames.push({ t: f.metadata.timestamp, data: Buffer.from(f.data, 'base64') });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  let t0 = 0;
  return {
    start() { t0 = Date.now() / 1000; },
    stop() { windows.push([t0, Date.now() / 1000]); },
    async finish() {
      await new Promise((r) => setTimeout(r, 1500));
      await cdp.send('Page.stopScreencast').catch(() => {});
      frames.sort((a, b) => a.t - b.t);
      return windows.map(([a, b]) => {
        const before = frames.filter((f) => f.t <= a).pop();
        return { t0: a, t1: b, frames: (before ? [{ t: a, data: before.data }] : []).concat(frames.filter((f) => f.t > a && f.t <= b)) };
      });
    },
  };
}
/** resample a take to constant FPS: each output tick shows the newest frame at or before it */
function resample(seg) {
  const fr = seg.frames;
  if (!fr.length) return [];
  const outFrames = [];
  let j = 0;
  for (let t = seg.t0; t < seg.t1; t += 1 / FPS) { while (j + 1 < fr.length && fr[j + 1].t <= t) j++; outFrames.push(fr[j].data); }
  return outFrames;
}
/** each take goes to <out>/<clip>/take<N>/00000.jpg… at a constant FPS; tools/encode-clips.sh joins takes with a short dip */
async function writeClip(name, segs) {
  const dir = path.join(out, name);
  fs.rmSync(dir, { recursive: true, force: true });
  segs.forEach((seg, i) => {
    const f = resample(seg), td = path.join(dir, 'take' + (i + 1));
    fs.mkdirSync(td, { recursive: true });
    f.forEach((b, k) => fs.writeFileSync(path.join(td, String(k).padStart(5, '0') + '.jpg'), b));
  });
  const n = segs.map((sg) => resample(sg).length);
  const fps = segs.map((sg) => (sg.frames.length / Math.max(0.1, sg.t1 - sg.t0)).toFixed(0)).join('/');
  console.log(name, n.join('+'), 'frames', (n.reduce((x, y) => x + y, 0) / FPS).toFixed(1) + 's', 'capture fps', fps);
}
async function tap(page, sel, ring = true) {
  const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
  await el.waitFor({ state: 'visible', timeout: 8000 });
  const b = await el.boundingBox();
  if (!b) { await el.click(); return; }
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  if (ring) await page.evaluate(([x, y]) => { const d = document.createElement('div'); d.className = 'fd-tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, [x, y]);
  await el.click();
}
const wait = (page, ms) => page.waitForTimeout(ms);
const ISS = 'nasa:iss071e439624';
/** photo layer hidden: name a NASA picture in the credit strip and keep the rotation still (the image itself is never drawn) */
async function pinCredit(page) {
  await page.evaluate((id) => {
    const item = Object.assign({ source: 'nasa' }, OW.bgCurated.find((x) => x.id === id));
    OW.bg.next = async () => {}; OW.bg.reschedule = () => {}; OW.bg.retarget = () => {};
    OW.bg.current = item; OW.bg.reason = 'nasa'; OW.bg.emit('change', item);
  }, ISS);
}
/** photo layer shown: put a NASA picture up through the app's own background engine, trying candidates until one loads */
async function showNasa(page, ids) {
  for (const id of ids) {
    const ok = await page.evaluate(async (id) => {
      const item = Object.assign({ source: 'nasa' }, OW.bgCurated.find((x) => x.id === id));
      await OW.bg.next({ item, force: true });
      await new Promise((r) => setTimeout(r, 2500));
      return OW.bg.current && OW.bg.current.id === id;
    }, id);
    if (ok) return id;
  }
  return null;
}

// Made-up thermostat and Smart Comfort states, in Home Assistant's shape, for the comfort clip.
function comfortStandIn() {
  const ent = OW.climate.entity, now = () => new Date(OW.nowMs()).toISOString();
  const S = {
    [ent]: { state: 'heat', last_updated: now(), attributes: { current_temperature: 71, temperature: 72, hvac_modes: ['off', 'heat', 'cool'], hvac_action: 'heating', min_temp: 50, max_temp: 90, target_temp_step: 1, temperature_unit: '°F' } },
    'sensor.comfort_status': { state: 'auto', attributes: { status_line: 'Auto · Day 73° · outside 64°', briefing_line: 'Auto · Day 73°', shadow: false, indoor: { rooms: [{ name: 'Living room', temp: 71, humidity: 46, age_min: 3 }, { name: 'Bedroom', temp: 70, humidity: 48, age_min: 4 }, { name: 'Office', temp: 72, humidity: 44, age_min: 2 }] } } },
    'input_number.night_temperature': { state: '69', attributes: { min: 60, max: 80, step: 1 } },
    'input_number.wake_temperature': { state: '74', attributes: { min: 60, max: 80, step: 1 } },
    'input_number.day_temperature': { state: '73', attributes: { min: 60, max: 80, step: 1 } },
    'input_boolean.comfort_schedule_enabled': { state: 'on', attributes: {} },
    'input_datetime.day_temperature_time': { state: '11:00:00', attributes: {} },
    'input_select.comfort_period': { state: 'day', attributes: {} },
    'input_boolean.comfort_auto': { state: 'on', attributes: {} },
    'input_boolean.sleep_mode': { state: 'off', attributes: {} },
  };
  ['comfort_fresh_air_start', 'comfort_fresh_air_end', 'comfort_resume', 'comfort_keep_open', 'comfort_dismiss', 'comfort_plan_skip'].forEach((s) => { S['script.' + s] = { state: 'off', attributes: {} }; });
  const publish = () => { OW.data.state.climate = OW.climate.read(S, true, '°F'); OW.data.state.smartComfort = OW.smartComfort.read(S, true); OW.data.emit('climate'); OW.data.emit('comfort'); };
  window.__fdComfort = (action, p) => new Promise((ok) => setTimeout(() => {
    const c = S[ent], st = S['sensor.comfort_status'];
    if (action === 'climate.mode') { c.state = p.mode; c.attributes.temperature = p.mode === 'cool' ? 74 : p.mode === 'heat' ? 72 : null; c.attributes.hvac_action = p.mode === 'cool' ? 'idle' : p.mode === 'heat' ? 'heating' : 'off'; st.state = p.mode === 'off' ? 'manual_off' : 'manual_hold'; st.attributes.status_line = p.mode === 'off' ? 'Off · stays off until you resume' : 'Manual ' + p.mode + ' ' + c.attributes.temperature + '° · until Day at 11:00 AM'; }
    if (action === 'climate.step') { c.attributes.temperature += p.delta; st.attributes.status_line = 'Manual ' + c.state + ' ' + c.attributes.temperature + '° · until Day at 11:00 AM'; }
    if (action === 'comfort.action' && p.kind === 'resume') { st.state = 'auto'; c.state = 'heat'; c.attributes.temperature = 72; c.attributes.hvac_action = 'heating'; st.attributes.status_line = 'Auto · Day 73° · outside 64°'; }
    const m = /^climate\.(night|wake|day)\.step$/.exec(action); if (m) { const h = S['input_number.' + m[1] + '_temperature']; h.state = String(+h.state + p.delta); }
    c.last_updated = now(); publish(); ok();
  }, 500));
  publish();
}

const clips = {
  // Launch alarm: the count, liftoff on time, then the morning briefing. Wall panel.
  async alarm(browser) {
    cfg = baseCfg; hideBg = true;
    const { page, rec } = await open(browser, 'mode=panel&ws=home&now=2026-11-16T06:49:41-05:00', 1920, 1080);
    await wait(page, 7000);
    await page.evaluate(() => OW.app.runSequence(OW.nowMs() + 5600, { dur: 9, preview: true }));
    await wait(page, 900); rec.start();
    await wait(page, 4700 + 3000);
    await page.evaluate(() => OW.app.wakeUp());                    // the house's `wake` (the app also does this itself after 9 s)
    await wait(page, 2700); rec.stop();
    await writeClip('alarm', await rec.finish()); await page.context().close();
  },
  // Snooze, then (second take) I'm up and Back to bed. Bedroom Google TV, remote keys.
  async snooze(browser) {
    cfg = Object.assign({}, baseCfg, { room: 'Bedroom', sleep: { behavior: 'dim', look: 'clock' } }); hideBg = true;
    const { page, rec } = await open(browser, 'mode=tv&ws=home&scenario=clear&now=2026-11-16T06:49:50-05:00', 1920, 1080);
    if (demoOnly) {
      await page.evaluate(() => {const e=OW.demo.engine;e.action({action:'test_alarm'});e.advance(Date.parse(e.launch.launch_at)-e.now()+1);e.action({action:'snooze'});});
      console.log('snooze demo state', JSON.stringify(await page.evaluate(() => ({engine:OW.demo.engine.launch.state,app:OW.app.alarm?.state}))));
      await page.waitForFunction(() => OW.app.alarm?.state === 'snoozed', null, {timeout:8000});
      await wait(page, 1800); rec.start(); await wait(page, 6000); rec.stop();
      await writeClip('snooze', await rec.finish()); await page.context().close(); return;
    }
    await wait(page, 7000);
    if (!demoOnly) await page.evaluate(houseStandIn);
    await page.evaluate(() => OW.app.runSequence(OW.nowMs() + 900, { dur: 600 }));
    await wait(page, 1600);
    await page.evaluate(() => OW.app.wakeUp());
    await wait(page, 1400); rec.start();
    await wait(page, 1800);
    await page.keyboard.press('Escape');                           // Back on the remote = Snooze while it rings
    await wait(page, 3200); rec.stop();
    console.log('  after Back:', await page.evaluate(() => OW.app.alarm && OW.app.alarm.state));
    // take two: the alarm again, I'm up, then Back to bed returns the bedroom to night
    await page.evaluate(() => { OW.app.exitNight?.('user'); });
    await page.evaluate(() => OW.app.onWallEvent({ action: 'launch_sequence', alarm_id: 'demo-2', screens: [OW.app.deviceId()], crew: 'both', launch_at: new Date(OW.nowMs() + 900).toISOString(), deadline: new Date(OW.nowMs() + 1800000).toISOString(), duration_s: 600 }));
    await wait(page, 1600);
    await page.evaluate(() => OW.app.wakeUp());
    await wait(page, 1500);
    await page.keyboard.press('ArrowRight');                       // I'm up
    await wait(page, 300);
    await page.keyboard.press('Enter');
    await wait(page, 1600); rec.start();
    await wait(page, 1300);
    await page.keyboard.press('ArrowLeft');                        // Back to bed
    await wait(page, 700);
    await page.keyboard.press('Enter');
    await wait(page, 3400); rec.stop();
    await writeClip('snooze', await rec.finish()); await page.context().close();
  },
  // Goodnight: the power-down list, the dark night clock, a touch for the dim red controls. Wall panel.
  async goodnight(browser) {
    cfg = Object.assign({}, baseCfg, { sleep: { behavior: 'dim', look: 'clock' } }); hideBg = true;
    const { page, rec } = await open(browser, 'mode=panel&ws=night&now=2026-11-15T20:41:20-05:00', 1920, 1080);
    await wait(page, 7000);
    if (!demoOnly) await page.evaluate(houseStandIn);
    rec.start(); await wait(page, 900);
    await tap(page, '[data-act="sleep.go"]:visible');
    await wait(page, 5600);
    await tap(page, '#softoff');
    await wait(page, 3200); rec.stop();
    await writeClip('goodnight', await rec.finish()); await page.context().close();
  },
  // Ambient: clock, date, next event and wake time over a NASA picture (Artemis II launch), animated mode. Wall panel.
  async ambient(browser) {
    // A neutral, public home location (NASA Johnson Space Center, Houston) so the LOOK UP card has a sky to point at.
    cfg = Object.assign({}, baseCfg, { ambient: { idleMin: 120, mode: 'animated' }, bg: { mode: 'auto' }, home: { name: 'Houston', lat: 29.559, lon: -95.089, source: 'settings' } }); hideBg = false;
    const { page, rec } = await open(browser, 'mode=panel&ws=home&amode=animated&now=2026-11-16T07:42:10-05:00', 1920, 1080);
    await wait(page, 3000);
    const first = demoOnly ? await page.evaluate(() => { OW.config.set('ambient.mode', 'wallpaper'); OW.config.set('ambient.wallpaper.source', 'scenes'); OW.config.set('ambient.wallpaper.scene', 'sky'); return 'generated:sky'; }) : await showNasa(page, [ISS, 'nasa:iss072e159172', 'nasa:iss066e146457']);
    await page.evaluate(() => { OW.bg.reschedule = () => {}; OW.app.enterAmbient('manual'); });
    await wait(page, 2500); rec.start();
    await wait(page, 3800);
    if (!demoOnly) await page.evaluate(() => { OW.space.lookTest(true); OW.bg.emit('change', OW.bg.current); });   // the app's LOOK UP test: an ISS pass card
    await wait(page, 5200); rec.stop();
    console.log('ambient background:', first);
    if (!first) throw Error('ambient: the NASA background did not load');
    await writeClip('ambient', await rec.finish()); await page.context().close();
  },
  // Smart Comfort controls with sample thermostat states: Cool, one degree up, then Resume Auto. Wall panel.
  async comfort(browser) {
    cfg = baseCfg; hideBg = true;
    const { page, rec } = await open(browser, 'mode=panel&ws=house&now=2026-11-16T15:12:00-05:00', 1920, 1080);
    await wait(page, 6000);
    if (!demoOnly) await page.evaluate(houseStandIn);
    if (!demoOnly) await page.evaluate(comfortStandIn);
    if (demoOnly) { const opener = page.locator('[data-act="climate.open"]:visible').first(); if (await opener.count()) await opener.click(); }
    if (demoOnly) {
      await wait(page, 1500); rec.start(); await wait(page, 900);
      await tap(page, '[data-fid="climate-mode-cool"]');
      await wait(page, 6500); rec.stop();
      await writeClip('comfort', await rec.finish()); await page.context().close(); return;
    }
    await wait(page, 1500); rec.start();
    await wait(page, 900);
    await tap(page, '[data-fid="climate-mode-cool"]');
    await wait(page, demoOnly ? 6000 : 1900);
    await tap(page, '[data-fid="climate-plus"]');
    await wait(page, demoOnly ? 6000 : 1700);
    await tap(page, '[data-fid="climate-mode-auto"]');
    await wait(page, 2300); rec.stop();
    await writeClip('comfort', await rec.finish()); await page.context().close();
  },
  // Space on the living-room Google TV: the globe with the ISS, then a launch picked from the manifest.
  async globe(browser) {
    // Stepped capture of the demo house's Space area on a TV (FE-W5, DEMO-HOUSE §8 recipe, space=snapshot: fixture launch
    // and ISS data, no network). The page clock is paused and advanced 1/30 s per screenshot, so the globe stays smooth.
    injectCfg = false; hideBg = true;
    const { page } = await open(browser, 'mode=tv&ws=space&demo=1&scenario=clear&now=2026-11-16T09:30&space=snapshot&theme=tokyo-night', 1920, 1080, { clock: true, demo: true });
    const rows = page.locator('[data-act="launch.select"]:visible');
    await rows.nth(2).waitFor({ state: 'visible', timeout: 30000 });
    await wait(page, 4000);
    const td = path.join(out, 'globe', 'take1');
    fs.rmSync(path.join(out, 'globe'), { recursive: true, force: true }); fs.mkdirSync(td, { recursive: true });
    await page.clock.pauseAt(Date.now() + 1000);
    let k = 0;
    const step = async (sec) => {
      for (let i = 0; i < Math.round(sec * FPS); i++) {
        await page.clock.runFor(1000 / FPS);
        fs.writeFileSync(path.join(td, String(k++).padStart(5, '0') + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 88 }));
      }
    };
    await step(1.6);
    await rows.nth(1).click();
    await step(3.8);
    await rows.nth(2).click();
    await step(3.4);
    console.log('globe', k, 'frames', (k / FPS).toFixed(1) + 's', 'stepped');
    await page.context().close(); injectCfg = true;
  },
  // A still of the demo house's Space area on the wall panel (1920 × 1080 PNG), same recipe.
  async spaceshot(browser) {
    injectCfg = false; hideBg = true;
    const { page } = await open(browser, 'mode=panel&ws=space&demo=1&scenario=clear&now=2026-11-16T09:30&space=snapshot&theme=tokyo-night', 1920, 1080, { demo: true });
    await page.locator('[data-act="launch.select"]:visible').first().waitFor({ state: 'visible', timeout: 30000 });
    await wait(page, 9000);
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, 'panel-space.png') });
    console.log('spaceshot written');
    await page.context().close(); injectCfg = true;
  },
};

const blocked = [];
async function open(browser, q, w, h, opts = {}) {
  if (demoOnly) { const params = new URLSearchParams(q); params.set('demo', '1'); params.set('space', 'snapshot'); params.delete('amode'); if (!params.has('scenario')) params.set('scenario', 'clear'); q = params.toString(); opts = {...opts, demo:true}; injectCfg = false; }
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'America/New_York', locale: 'en-US', reducedMotion: 'no-preference' });
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    const h = u.hostname.replace(/^\[|\]$/g, '');
    const lan = /^(10\.|127\.|0\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|localhost$)/.test(h)
      || /\.(local|lan|home|internal|home\.arpa)$/.test(h) || /^(::1|f[cd][0-9a-f]{2}:|fe80:)/i.test(h) || !h.includes('.');
    if (demoOnly && h !== '127.0.0.1') { blocked.push(u.href); return route.abort(); }
    if (h !== '127.0.0.1' && lan) { blocked.push(u.href); return route.abort(); }   // the recording box can reach the LAN: never let a request through
    if (u.hostname === '127.0.0.1' && u.port !== '8792') { blocked.push(u.href); return route.abort(); }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message.slice(0, 160)));
  if (process.env.DEBUG) page.on('console', (m) => console.log('  console:', m.text().slice(0, 200)));
  if (opts.clock) await page.clock.install();                    // time still flows until a clip pauses it
  await page.goto('http://127.0.0.1:8792/?' + q, { waitUntil: 'domcontentloaded' });
  if (!demoOnly) await page.evaluate(() => { const real = OW.data.call.bind(OW.data); OW.data.call = (a, p) => (/^(alarm|sleep|night|back_to_bed|climate|comfort|light|scene|media|tv|sonos|vacuum|machine)/.test(a) ? Promise.reject(Error('recording refuses household actions')) : real(a, p)); }).catch(() => {});
  if (opts.demo) {
    // the demo house (space=snapshot) loads no photo background at all: wait for the demo itself, nothing to pin
    await page.waitForFunction(() => window.OW && OW.demo && OW.demo.active && OW.data?.status?.connected && OW.data?.state?.weather, null, { timeout: 30000 });
    if (demoOnly && await page.evaluate(() => OW.demo.spaceMode) !== 'snapshot') throw Error('Recording requires snapshot demo mode');
    if (demoOnly && cfg.sleep) await page.evaluate(sleep => { OW.config.set('sleep.behavior',sleep.behavior); OW.config.set('sleep.look',sleep.look); }, cfg.sleep);
    if (demoOnly) { captureEvidence.push(await page.evaluate(() => ({ demo:OW.demo.active, space:OW.demo.spaceMode, scenario:OW.demo.scenario, theme:OW.config.get('theme'), body:document.body.innerText }))); }
  } else {
    await page.waitForFunction(() => window.OW && OW.bg && OW.bg.current, null, { timeout: 15000 });
    if (hideBg) { await page.waitForTimeout(2200); await pinCredit(page); }
  }
  const rec = await recorder(page);
  return { page, rec };
}

server.listen(8792, '127.0.0.1', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'], executablePath: process.env.FD_CHROME || undefined });   // in the Playwright Docker image the bundled browser is found by itself
  let failures = 0;
  for (const [name, fn] of Object.entries(clips)) {
    if (only && !only.includes(name)) continue;
    try { await fn(browser); } catch (e) { failures++; console.log(name, 'FAILED', e.message.split('\n')[0]); for (const context of browser.contexts()) { for (const page of context.pages()) await page.screenshot({path:path.join(out, 'failure-'+name+'.png')}).catch(()=>{}); await context.close(); } }
  }
  console.log('blocked private requests:', blocked.length);
  fs.writeFileSync(path.join(out, 'capture-evidence.json'), JSON.stringify({demoOnly,failures,command:[process.execPath,...process.argv.slice(1)],toolSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),blockedRequests:blocked,captures:captureEvidence},null,2)+'\n');
  await browser.close(); server.close();
  if (failures || blocked.length) process.exitCode = 1;
});
