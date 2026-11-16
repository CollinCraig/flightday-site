/* Screenshot the Concept frames (concepts/build/*.html, from concepts/make-frames.py) at 1600 × 1000 to PNG.
 * Runs in the Playwright Docker image on the build box, through the heavy-job gate:
 *   NODE_PATH=<deps>/node_modules node tools/render-frames.cjs concepts/build <out-dir>
 * The pages are local files with no network access at all. */
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
const src = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await ctx.route('**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.html')).sort()) {
    await page.goto('file://' + path.join(src, f));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, f.replace('.html', '.png')) });
    console.log('rendered', f);
  }
  await browser.close();
})();
