/* Sample-data captures of the Flight Day web build for the public site.
 * Serves the web app (web/ in the app repo) read-only with: demo data on, no HA/hub, generic names.
 * All rewrites happen in this process's responses only; source files are untouched.
 * Any request to a private address is aborted. Household actions are refused. */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
const root = process.argv[2], out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.m4a': 'audio/mp4' };
// Demo strings to swap for generic ones come from private/site-private.json ("demoSwaps"); without it, none are swapped.
const privFile = path.join(__dirname, '../private/site-private.json');
const swaps = fs.existsSync(privFile) ? JSON.parse(fs.readFileSync(privFile, 'utf8')).demoSwaps : [];
if (!swaps.length) console.log('private term list not found; no demo swaps (check every frame by hand)');
const cfg = { provider: 'local', demo: true, people: { partner: { name: 'Sam' } }, schedule: { launchEnabled: false, offEnabled: false },
  ambient: { idleMin: 120 }, cams: { autoLive: false }, units: 'f', display: { timeFormat: '12h' } };
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') { res.writeHead(403); return res.end(); }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    let data = fs.readFileSync(file);
    if (/\.(js|html)$/.test(file)) {
      let s = data.toString();
      for (const [a, b] of swaps) s = s.split(a).join(b);
      if (file.endsWith('index.html')) s = s.replace('<script src="js/config.js">', '<script>localStorage.setItem("ow.settings.v1",' + JSON.stringify(JSON.stringify(cfg)) + ');</script><style>#bgA,#bgB{display:none!important}</style><script src="js/config.js">');
      data = Buffer.from(s);
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
const shots = [
  // name, query, viewport, wait ms
  ['home-panel', 'mode=panel&ws=home', 1920, 1080, 9000],
  ['house-panel', 'mode=panel&ws=house', 1920, 1080, 7000],
  ['night-panel', 'mode=panel&ws=night', 1920, 1080, 7000],
  ['status-panel', 'mode=panel&ws=status', 1920, 1080, 7000],
  ['space-panel', 'mode=panel&ws=space', 1920, 1080, 12000],
  ['briefing-panel', 'mode=panel&brief=1', 1920, 1080, 9000],
  ['ambient-panel', 'mode=panel&ambient=1', 1920, 1080, 9000],
  ['night-overlay-panel', 'mode=panel&night=1', 1920, 1080, 6000],
  ['countdown-panel', 'mode=panel&seq=45&dur=60', 1920, 1080, 6000],
  ['home-tv', 'mode=tv&ws=home', 1920, 1080, 9000],
  ['space-tv', 'mode=tv&ws=space', 1920, 1080, 12000],
];
server.listen(8791, '127.0.0.1', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'], executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
  const only = process.argv[4] ? process.argv[4].split(',') : null;
  const blocked = [];
  for (const [name, q, w, h, wait] of shots) {
    if (only && !only.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'America/New_York', locale: 'en-US' });
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname !== '127.0.0.1' && /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost)/.test(u.hostname)) { blocked.push(u.href); return route.abort(); }
      if (u.hostname === '127.0.0.1' && u.port !== '8791') { blocked.push(u.href); return route.abort(); }
      return route.continue();
    });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:8791/?' + q, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { if (window.OW && OW.data) OW.data.call = () => Promise.reject(Error('capture refuses household actions')); }).catch(() => {});
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log(name, errors.length ? 'errors: ' + errors.slice(0, 2).join(' | ') : 'ok');
    await ctx.close();
  }
  console.log('blocked private requests:', blocked.length);
  await browser.close(); server.close();
});
