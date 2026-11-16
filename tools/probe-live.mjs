#!/usr/bin/env node
/* Post-deploy probe of the live site (run by tools/deploy.sh after a production deploy; light: plain HTTP, no browser).
 *   node tools/probe-live.mjs [https://flightday.app]
 * Fails (exit 1) if:
 *  - any page in the sitemap, or /demo/, has Cloudflare's analytics beacon (cloudflareinsights) in its HTML as a browser
 *    would receive it, or lacks no-transform;
 *  - a page sends a Cloudflare-CDN-Cache-Control other than max-age=300, an edge copy is older than 5 minutes,
 *    or a retired asset (tools/retired-assets.txt) answers 200.
 *  - the 404 page has the beacon. Pages forces no-store on 404s, so no-transform can't reach it; this check passes
 *    once the zone's Web Analytics automatic setup is off at the source.
 * Reports, without failing:
 *  - non-document, non-JS demo assets with a stale CSP header; HTML and JS mismatches fail.
 *  - demo files whose no-cache the zone's Browser Cache TTL rewrote (a zone setting, not ours). */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = (process.argv[2] || 'https://flightday.app').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const problems = [], notes = [];
const demoManifest = JSON.parse(fs.readFileSync(path.join(root, 'public/demo/demo-build.json'), 'utf8'));
const demoCsp = demoManifest.csp;
const connect = demoCsp.split(';').map(s => s.trim()).filter(s => /^connect-src(?:\s|$)/.test(s));
if (connect.length !== 1 || connect[0] !== "connect-src 'self'") throw new Error("Audited demo connect-src must be exactly 'self'");
const get = (u, html) => fetch(u, { headers: { 'User-Agent': UA, ...(html ? { Accept: 'text/html,application/xhtml+xml' } : {}) }, redirect: 'manual', cache: 'no-store' });

const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
const pages = [...sitemap.matchAll(/<loc>https:\/\/flightday\.app([^<]*)<\/loc>/g)].map((m) => m[1]).concat(['/demo/']);
for (const p of pages) {
  const r = await get(base + p, true), body = await r.text(), cc = r.headers.get('cache-control') || '', cdn = r.headers.get('cloudflare-cdn-cache-control');
  if (r.status !== 200) { problems.push(`${p}: ${r.status}`); continue; }
  if (p === '/demo/' && !/no-cache/.test(cc)) problems.push('/demo/: must serve no-cache');
  if (p === '/demo/' && r.headers.get('content-security-policy') !== demoCsp) problems.push('/demo/: served CSP differs from the audited bundle (fixture fetches require connect-src self)');
  if (body.includes('cloudflareinsights')) problems.push(`${p}: Cloudflare's analytics beacon is in the page`);
  if (!/no-transform/.test(cc)) problems.push(`${p}: Cache-Control "${cc}" lacks no-transform`);
  if (cdn !== null && cdn !== 'max-age=300') problems.push(`${p}: Cloudflare-CDN-Cache-Control is "${cdn}"`);
}
// assets: the edge cap and the demo's revalidation (Cloudflare consumes its CDN header, so check the cache age instead)
const globePoster = '/assets/clips/' + fs.readdirSync(path.join(root, 'public/assets/clips')).find(f => /^globe.*\.webp$/.test(f));
const css = '/assets/' + fs.readdirSync(path.join(root, 'public/assets')).find((f) => /^site\.v\d+\.css$/.test(f));
const demoAssets = demoManifest.format === 2 ? demoManifest.files.filter(f => f.path.startsWith(demoManifest.assetPrefix) && /\.(js|css)$/.test(f.path)).map(f => '/demo/' + f.path) : ['/demo/js/app.js', '/demo/css/app.css'];
for (const p of [css, '/assets/shots/demo-home-720.webp', globePoster, ...demoAssets]) {
  const r = await get(base + p), cc = r.headers.get('cache-control') || '', age = +(r.headers.get('age') || 0), st = r.headers.get('cf-cache-status');
  await r.arrayBuffer();
  if (r.status !== 200) { problems.push(`${p}: ${r.status}`); continue; }
  if (!/no-transform/.test(cc)) problems.push(`${p}: Cache-Control "${cc}" lacks no-transform`);
  if (p.startsWith('/demo/') && r.headers.get('content-security-policy') !== demoCsp) {
    const type = r.headers.get('content-type') || '';
    const hard = /\.(?:html?|[cm]?js)(?:$|[?#])/i.test(p) || /(?:text\/html|application\/xhtml\+xml|(?:java|ecma)script)/i.test(type);
    (hard ? problems : notes).push(`${hard ? '' : 'WARNING '}${p}: served CSP differs from audited demo policy${hard ? '' : ' (non-document asset; does not govern the entry document)'}`);
  }
  if (p.startsWith('/demo/v/') && (!/max-age=31536000/.test(cc) || !/immutable/.test(cc))) problems.push(`${p}: hashed asset lacks one-year immutable cache: ${cc}`);
  if (p.startsWith('/demo/') && !p.startsWith('/demo/v/') && !/no-cache/.test(cc)) notes.push(`${p}: sent no-cache, but the zone's Browser Cache TTL rewrote it to "${cc}" (needs the zone setting "Respect Existing Headers")`);
  if (st === 'HIT' && age > 300) problems.push(`${p}: edge copy is ${age} s old (cap is 300)`);
  notes.push(`${p}: ${st || '-'}, age ${age} s, ${cc}`);
}
{
  const r = await get(base + '/no-such-page-probe/', true), body = await r.text();
  notes.push(`404 page: ${r.status}, Cache-Control "${r.headers.get('cache-control')}"`);
  // Pages forces no-store on 404s, so no-transform can't protect them: this passes once the zone's Web Analytics
  // automatic setup is switched off at the source (no Worker or Function for 404s, by decision)
  if (body.includes('cloudflareinsights')) problems.push("404 page: Cloudflare's analytics beacon is in the page (pending the source fix: the zone's Web Analytics automatic setup; the CSP blocks it meanwhile)");
}
const retired = fs.readFileSync(path.join(root, 'tools/retired-assets.txt'), 'utf8').split('\n').filter((l) => l.startsWith('/'));
if (demoManifest.format === 2) for (const old of ['/demo/js/app.js', '/demo/css/app.css']) {
  if (!retired.includes(old)) problems.push(`DEMO RETIREMENT: ${old} missing from retired list`);
}
const alive = [];
for (const p of retired) {
  const r = await get(base + p); await r.arrayBuffer();
  if (demoManifest.format === 2 && p.startsWith('/demo/') && !p.startsWith('/demo/v/') && r.status !== 404) problems.push(`DEMO RETIREMENT: ${p} must return 404, got ${r.status}`);
  if (r.status === 200) alive.push(`${p} (${r.headers.get('cf-cache-status')}, age ${r.headers.get('age') || 0} s)`);
}
notes.push(`retired assets: ${retired.length - alive.length} of ${retired.length} don't answer 200 (404 from the site, or 403 while the temporary WAF rule is on)` + (alive.length ? `; still 200: ${alive.join(', ')}` : ''));
for (const a of alive) problems.push(`RETIRED PATH LIVE: ${a}`);
console.log(notes.map((n) => '  ' + n).join('\n'));
if (problems.length) { console.log(problems.map((p) => '✗ ' + p).join('\n')); process.exit(1); }
console.log("✓ demo CSP: entry and tested JS equal audited policy; connect-src 'self'");
console.log(`✓ live: ${pages.length} pages without the beacon and with no-transform; edge copies within 5 minutes; no retired asset answers 200`);
