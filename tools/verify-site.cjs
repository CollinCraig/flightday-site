/* Layout check for public/ in a real browser (run in the Playwright Docker image on the build box):
 *
 *   NODE_PATH=<deps>/node_modules node tools/verify-site.cjs public <out-dir>
 *
 * Serves public/ with the Content-Security-Policy from _headers, then for every page × width × theme checks:
 *  - balanced grids: in every .g and .telemetry grid, each row is full (a lone item may only span the whole row);
 *  - no horizontal page scroll;
 *  - with motion: after scrolling through, nothing marked for reveal is still hidden; clips in view are playing;
 *  - with reduced motion: no clip plays on its own and its button offers Play;
 *  - no console errors, page errors or CSP violations.
 * Writes report.json and a few screenshots to <out-dir>. Exits 1 on any problem. */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
const pub = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, { recursive: true });
const csp = (fs.readFileSync(path.join(pub, '_headers'), 'utf8').match(/Content-Security-Policy: (.*)/) || [])[1].replace('; upgrade-insecure-requests', '');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(pub, p);
  if (!f.startsWith(pub) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const data = fs.readFileSync(f), range = req.headers.range;
  const head = { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'Accept-Ranges': 'bytes' };
  if (range) {   // video needs byte ranges
    const [a, b] = range.replace('bytes=', '').split('-').map((x) => (x ? +x : undefined));
    const start = a || 0, end = b !== undefined ? b : data.length - 1;
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }); return res.end(data.subarray(start, end + 1));
  }
  res.writeHead(200, head); res.end(data);
});
// every page in the sitemap plus 404, or PAGES=/a/,/b/ to narrow a run
const sitemapPages = [...fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8').matchAll(/<loc>https:\/\/flightday\.app([^<]*)<\/loc>/g)].map((m) => m[1]);
const pages = process.env.PAGES ? process.env.PAGES.split(',') : sitemapPages.concat(['/404.html']);
const QUICK = !!process.env.QUICK;   // grids, overflow and console at three widths, plus footer shots at phone width
const PORT = +(process.env.PORT || 8793), BASE = 'http://127.0.0.1:' + PORT;   // PORT lets two checks run side by side
const widths = [1440, 1180, 1024, 1023, 900, 768, 640, 639, 414, 390, 360];
const problems = [], report = [];

async function gridCheck(page) {
  return page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.g, .telemetry').forEach((g) => {
      const kids = [...g.children].filter((k) => getComputedStyle(k).display !== 'none' && k.getBoundingClientRect().width > 0);
      if (!kids.length) return;
      const cs = getComputedStyle(g), inner = g.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const gr = { width: inner }, cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length;
      const rows = new Map();
      kids.forEach((k) => { const t = Math.round(k.getBoundingClientRect().top); rows.set(t, (rows.get(t) || []).concat(k)); });
      const sig = (g.id || g.className).toString().slice(0, 40) + ' (' + kids.length + ' items, ' + cols + ' cols)';
      [...rows.values()].forEach((row, i) => {
        const span = row.reduce((n, k) => n + k.getBoundingClientRect().width, 0) + (row.length - 1) * parseFloat(getComputedStyle(g).columnGap || 0);
        if (span < gr.width - 4) bad.push(sig + ': row ' + (i + 1) + ' has ' + row.length + ' item(s), ' + Math.round(span) + ' of ' + Math.round(gr.width) + ' px');
      });
    });
    return bad;
  });
}

server.listen(PORT, '127.0.0.1', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const scheme of ['dark', 'light']) for (const motion of (QUICK ? ['no-preference'] : ['no-preference', 'reduce'])) {
    const ctx = await browser.newContext({ colorScheme: scheme, reducedMotion: motion, viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    for (const p of (process.env.SHOTS_ONLY ? [] : pages)) for (const w of (motion === 'reduce' || QUICK ? [1440, 768, 390] : widths)) {
      await page.setViewportSize({ width: w, height: 900 });
      errs.length = 0;
      await page.goto(BASE + p, { waitUntil: 'load' });
      await page.waitForTimeout(250);
      const tag = `${p} @${w} ${scheme}${motion === 'reduce' ? ' reduced' : ''}`;
      for (const b of await gridCheck(page)) problems.push(`${tag}: ${b}`);
      const overflow = await page.evaluate(() => {
        const px = document.documentElement.scrollWidth - innerWidth;
        if (px <= 0) return null;
        // name the deepest elements that stick out past the right edge, so the report says what to fix
        const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
        const wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('[style*="overflow"], .tablewrap, pre'));
        const leaves = wide.filter((el) => !wide.some((o) => o !== el && el.contains(o))).slice(0, 3).map((el) => (el.parentElement ? name(el.parentElement) + ' > ' : '') + name(el));
        return { px, leaves };
      });
      if (overflow) problems.push(`${tag}: horizontal scroll ${overflow.px}px (${overflow.leaves.join('; ')})`);
      // scroll through like a reader, then nothing may still be hidden
      // scroll through like a reader: whatever is on screen must be revealed, and fully visible once transitions end
      const scrollPass = !QUICK && scheme === 'dark' && motion === 'no-preference' && [1440, 768, 390].includes(w);
      const hidden = !scrollPass ? [] : await page.evaluate(async () => {
        const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
        const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > innerHeight * 0.12 && r.top < innerHeight * 0.88; };
        const seen = new Set(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const motion = document.documentElement.classList.contains('fd-motion');
        for (let y = 0; ; y += Math.round(innerHeight * 0.6)) {
          scrollTo({ top: y, behavior: 'instant' }); await sleep(260);
          if (motion) document.querySelectorAll('.rv:not(.in)').forEach((el) => { if (onScreen(el)) seen.add('on screen but not revealed: ' + name(el)); });
          await sleep(1300);
          document.querySelectorAll('main *').forEach((el) => { if (onScreen(el) && !el.closest('svg,.clip-btn,[hidden]') && getComputedStyle(el).opacity === '0') seen.add('on screen at opacity 0: ' + name(el)); });
          if (y + innerHeight >= document.documentElement.scrollHeight) break;
        }
        return [...seen];
      });
      for (const h of hidden) problems.push(`${tag}: ${h}`);
      if (p === '/docs/' && (w === 1440 || w === 390)) {   // the search box finds a page and links to a section
        const found = await page.evaluate(async () => {
          const input = [...document.querySelectorAll('[data-docs-search] input')].find((i) => i.offsetParent);
          if (!input) return 'no visible search box';
          input.value = 'snooze'; input.dispatchEvent(new Event('input'));
          await new Promise((r) => setTimeout(r, 300));
          const links = [...input.closest('[data-docs-search]').querySelectorAll('.docs-results a')].map((a) => a.getAttribute('href'));
          return links.length ? links : 'no results';
        });
        if (!Array.isArray(found)) problems.push(`${tag}: docs search: ${found}`);
        else report.push({ tag, search: found.slice(0, 3) });
      }
      if (p === '/' && (w === 1440 || w === 390)) {
        const clip = await page.evaluate(async () => {
          const fig = document.querySelector('#motion .clip'); fig.scrollIntoView({ block: 'center' });
          await new Promise((r) => setTimeout(r, 1500));
          const v = fig.querySelector('video'), b = fig.querySelector('.clip-btn');
          return { paused: v.paused, time: v.currentTime, controls: v.hasAttribute('controls'), btnHidden: b.hidden, label: b.getAttribute('aria-label') };
        });
        report.push({ tag, clip });
        if (motion === 'reduce' && !clip.paused) problems.push(`${tag}: a clip plays under reduced motion`);
        if (motion === 'reduce' && !/^Play/.test(clip.label)) problems.push(`${tag}: clip button doesn't offer Play`);
        if (motion !== 'reduce' && (clip.paused || clip.time <= 0)) problems.push(`${tag}: the clip in view isn't playing`);
        if (clip.controls || clip.btnHidden) problems.push(`${tag}: clip button not set up`);
      }
      for (const e of errs) problems.push(`${tag}: console ${e.slice(0, 160)}`);
    }
    if (QUICK) {   // the footer (and the press Family block) at phone width
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(BASE + '/press/', { waitUntil: 'load' });
      await page.evaluate(() => { document.querySelectorAll('.rv').forEach((el) => el.classList.add('in')); document.querySelector('#family').scrollIntoView(); });
      await page.waitForTimeout(800);
      await page.locator('#family').screenshot({ path: path.join(out, `press-family-phone-${scheme}.png`) });
      await page.locator('footer').screenshot({ path: path.join(out, `footer-phone-${scheme}.png`) });
      const fo = await page.evaluate(() => { const f = document.querySelector('footer'); return f.scrollWidth - f.clientWidth; });
      if (fo > 0) problems.push(`footer @390 ${scheme}: overflows by ${fo}px`);
    }
    // screenshots: the page as a reader sees it (reduced motion = everything already in place)
    if (motion === 'reduce' || (process.env.SHOTS_ONLY && motion === 'no-preference' && false)) {
      const shots = scheme === 'dark' ? [['/', 1440, 'home-desktop-dark'], ['/', 390, 'home-phone-dark'], ['/install/', 390, 'install-phone-dark']] : [['/integrations/', 1440, 'integrations-desktop-light'], ['/press/', 1440, 'press-desktop-light'], ['/', 768, 'home-tablet-light']];
      for (const [p, w, name] of shots) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto(BASE + p, { waitUntil: 'load' });
        await page.evaluate(async () => {   // let lazy images load, as they would for a reader
          for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 120)); }
          scrollTo({ top: 0, behavior: 'instant' });
          // a lazy image that never started loading fires nothing, so give each one 4 s at most
          await Promise.all([...document.images].map((i) => (i.complete ? null : Promise.race([new Promise((r) => { i.onload = i.onerror = r; }), new Promise((r) => setTimeout(r, 4000))]))));
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 78, fullPage: true });
      }
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ problems, report }, null, 1));
  console.log(problems.length ? problems.join('\n') : '✓ grids balanced, no overflow, nothing left hidden, clips behave, no console errors');
  await browser.close(); server.close();
  process.exit(problems.length ? 1 : 0);
});
