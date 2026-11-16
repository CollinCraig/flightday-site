/* Builds the site's raster assets from the brand SVGs and the chosen screenshots.
 * Needs playwright-core (any recent version) and a Chromium build, plus cwebp on PATH.
 *   NODE_PATH=<dir with playwright-core>/node_modules node tools/build-assets.cjs <app repo dir> <apple dir> <sample-capture dir>
 * Writes into public/. Privacy edits (crop/mask) are listed in SHOTS and in public/press/index.html. */
const { chromium } = require('playwright-core');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [wall, apple, sample] = process.argv.slice(2).map((p) => path.resolve(p));
const site = path.resolve(__dirname, '..'), pub = path.join(site, 'public'), tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fd-assets-'));
const brand = path.join(pub, 'assets/brand');
const CHROME = process.env.FD_CHROMIUM || process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell';

// name, source, widths, edits. crop = [x, y, w, h] in source pixels; mask = list of [x, y, w, h] to pixelate away.
const SHOTS = [
  ['panel-home', path.join(sample, 'home-panel.png'), [1440, 720]],
  ['panel-house', path.join(sample, 'house-panel.png'), [1440, 720]],
  ['panel-night', path.join(sample, 'night-panel.png'), [1440, 720]],
  ['panel-night-overlay', path.join(sample, 'night-overlay-panel.png'), [1440, 720]],
  ['tv-home', path.join(sample, 'home-tv.png'), [1440, 720]],
  ['panel-alarm', path.join(wall, 'screenshots/panel-alarm-ignition.png'), [1440, 720]],
  // Real capture: the globe's "home" marker and label are pixelated so the home region is not shown.
  ['panel-space', path.join(wall, 'screenshots/panel-space.png'), [1440, 720], { mask: [[1337, 412, 64, 25]] }],
  // Real capture: the iPadOS status bar (which still carried the old app name) is cropped off.
  ['ipad-space', path.join(apple, 'ipad-landscape-space.png'), [1440, 720], { crop: [0, 64, 2752, 2000] }],
  ['mac-home', path.join(apple, 'mac-home.png'), [1440, 720]],
  ['iphone-home', path.join(apple, 'iphone-home.png'), [600, 360]],
  ['iphone-alarm', path.join(apple, 'alarm-iphone-countdown.png'), [600, 360]],
  ['appletv-alarm', path.join(apple, 'alarm-tv-countdown.png'), [1440, 720]],
  ['watch-alarm', path.join(apple, 'alarm-watch-countdown.png'), [416]],
];

// Drop eXIf chunks: one Apple capture carries a stray rotate-270 tag that Chrome would apply.
function stripExif(buf) {
  const parts = [buf.subarray(0, 8)];
  for (let i = 8; i < buf.length;) { const n = buf.readUInt32BE(i), t = buf.toString('latin1', i + 4, i + 8); if (t !== 'eXIf') parts.push(buf.subarray(i, i + 12 + n)); i += 12 + n; }
  return Buffer.concat(parts);
}
function webp(png, out, w) { execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-resize', String(w), '0', png, '-o', out]); }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const sizes = {};

  // ---- screenshots: crop / mask on a canvas, then WebP at each width
  fs.writeFileSync(path.join(tmp, 'blank.html'), '<!doctype html><body></body>');
  await page.goto('file://' + path.join(tmp, 'blank.html'));
  for (const [name, src, widths, edit = {}] of SHOTS) {
    const b64 = stripExif(fs.readFileSync(src)).toString('base64');
    const data = await page.evaluate(async ({ b64, edit }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const [cx, cy, cw, ch] = edit.crop || [0, 0, img.naturalWidth, img.naturalHeight];
      const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
      g.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
      for (const [x, y, w, h] of edit.mask || []) {
        // Pixelate hard (4×2 cells) with smoothing, then a soft blur: no text or dot survives.
        const t = document.createElement('canvas'); t.width = 4; t.height = 2; const tg = t.getContext('2d');
        tg.drawImage(c, x - cx - 20, y - cy - 20, w + 40, h + 40, 0, 0, 4, 2);
        g.save(); g.filter = 'blur(6px)'; g.imageSmoothingEnabled = true; g.drawImage(t, 0, 0, 4, 2, x - cx, y - cy, w, h); g.restore();
      }
      return { url: c.toDataURL('image/png'), w: cw, h: ch };
    }, { b64, edit });
    const png = path.join(tmp, name + '.png'); fs.writeFileSync(png, Buffer.from(data.url.split(',')[1], 'base64'));
    for (const w of widths) webp(png, path.join(pub, 'assets/shots', `${name}-${w}.webp`), Math.min(w, data.w));
    // Full-size download for the press kit (PNG, privacy edits applied).
    fs.copyFileSync(png, path.join(pub, 'assets/shots', `${name}-full.png`));
    sizes[name] = { w: data.w, h: data.h };
  }
  fs.writeFileSync(path.join(site, 'tools/shot-sizes.json'), JSON.stringify(sizes, null, 1));

  // ---- SVG → PNG renders (transparent background)
  async function renderSvg(svgFile, out, w, h, bg) {
    const svg = fs.readFileSync(svgFile, 'utf8');
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:${bg || 'transparent'}}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`);
    await page.screenshot({ path: out, omitBackground: !bg });
  }
  const icon = path.join(brand, 'flightday-app-icon-1024.svg');
  for (const s of [512, 192, 180, 48, 32, 16]) await renderSvg(icon, path.join(tmp, `icon-${s}.png`), s, s);
  fs.copyFileSync(path.join(tmp, 'icon-512.png'), path.join(pub, 'assets/icons/icon-512.png'));
  fs.copyFileSync(path.join(tmp, 'icon-192.png'), path.join(pub, 'assets/icons/icon-192.png'));
  fs.copyFileSync(path.join(tmp, 'icon-180.png'), path.join(pub, 'apple-touch-icon.png'));
  // favicon.ico with embedded PNGs (16, 32, 48)
  const pngs = [16, 32, 48].map((s) => [s, fs.readFileSync(path.join(tmp, `icon-${s}.png`))]);
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length; const dirs = [];
  for (const [s, buf] of pngs) { const d = Buffer.alloc(16); d.writeUInt8(s, 0); d.writeUInt8(s, 1); d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(buf.length, 8); d.writeUInt32LE(offset, 12); offset += buf.length; dirs.push(d); }
  fs.writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([head, ...dirs, ...pngs.map((p) => p[1])]));
  // Press downloads
  await renderSvg(icon, path.join(brand, 'flightday-app-icon-1024.png'), 1024, 1024);
  await renderSvg(path.join(brand, 'flightday-mark.svg'), path.join(brand, 'flightday-mark-512.png'), 512, 512);
  await renderSvg(path.join(brand, 'flightday-mark-on-light.svg'), path.join(brand, 'flightday-mark-on-light-512.png'), 512, 512);
  await renderSvg(path.join(brand, 'flightday-lockup.svg'), path.join(brand, 'flightday-lockup-1600.png'), 1600, 400);
  await renderSvg(path.join(brand, 'flightday-lockup-on-light.svg'), path.join(brand, 'flightday-lockup-on-light-1600.png'), 1600, 400);

  // ---- Open Graph image, 1200 × 630, built from the brand only
  const lockup = fs.readFileSync(path.join(brand, 'flightday-lockup.svg'), 'utf8');
  const font = 'file://' + path.join(pub, 'assets/fonts/Inter-Variable.woff2'), mono = 'file://' + path.join(pub, 'assets/fonts/JetBrainsMono-Medium.woff2');
  fs.writeFileSync(path.join(tmp, 'og.html'), `<!doctype html><style>
@font-face{font-family:Inter;src:url(${font}) format("woff2");font-weight:100 900}
@font-face{font-family:JBM;src:url(${mono}) format("woff2")}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0A0E1A;font-family:Inter}
.sky{position:absolute;inset:0;background:radial-gradient(70% 55% at 72% 100%,rgba(255,138,61,.30),rgba(255,197,107,.08) 45%,transparent 70%),linear-gradient(#05070F,#0C1328 60%,#1A2547)}
.ground{position:absolute;left:0;right:0;bottom:0;height:110px;background:linear-gradient(#1A1420,#05070D)}
.dawn{position:absolute;left:0;right:0;bottom:110px;height:3px;background:#FFD9A8;opacity:.85}
.star{position:absolute;width:3px;height:3px;border-radius:50%;background:#F1F3F9;opacity:.55}
.lock{position:absolute;left:84px;top:118px;width:620px}.lock svg{width:620px;height:155px;display:block}
h1{position:absolute;left:92px;top:316px;margin:0;color:#F1F3F9;font-weight:620;font-size:58px;letter-spacing:-.02em;font-variation-settings:"opsz" 32}
p{position:absolute;left:92px;top:396px;margin:0;color:#C9CFE0;font-size:28px}
.url{position:absolute;left:92px;bottom:40px;font:500 24px JBM;color:#FFC56B;letter-spacing:.02em}
</style><div class="sky"></div><span class="star" style="left:910px;top:90px"></span><span class="star" style="left:1040px;top:170px"></span><span class="star" style="left:820px;top:210px;opacity:.35"></span>
<div class="dawn"></div><div class="ground"></div><div class="lock">${lockup}</div>
<h1>Every day is a flight day.</h1><p>Launch control for your home and your day.</p><div class="url">flightday.app</div>`);
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto('file://' + path.join(tmp, 'og.html')); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(pub, 'og.png') });
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('assets built', Object.keys(sizes).length, 'screenshots');
})();
