#!/usr/bin/env node
/* One-off backfill for tools/retired-assets.txt: every static file any past deployment served that public/ no longer has.
 *
 *   node tools/retired-from-deploys.mjs <deployment-url>…      (e.g. the URLs from `wrangler pages deployment list`)
 *
 * Crawls each deployment's pages (from its sitemap, the home page and every local page link), collects every local
 * href/src/srcset/poster and every url() in its stylesheets, keeps what isn't a page, and prints the paths missing from
 * public/ today, sorted. From now on tools/retire-assets.mjs adds deletions at each deploy, so this is only for history. */
import fs from 'node:fs';
import path from 'node:path';

const pub = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const current = new Set(walk(pub).map((f) => '/' + path.relative(pub, f).split(path.sep).join('/')));
const bases = process.argv.slice(2).map((u) => u.replace(/\/$/, ''));
const assets = new Set();

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { redirect: 'follow' }); return r.ok ? await r.text() : null; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  return null;
}
const isPage = (p) => p.endsWith('/') || p.endsWith('.html');
for (const base of bases) {
  const seen = new Set(), queue = ['/', '/404.html'];
  const sm = await get(base + '/sitemap.xml');
  if (sm) for (const m of sm.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>/g)) queue.push(m[1]);
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p) || seen.size > 200) continue;
    seen.add(p);
    const html = await get(base + p);
    if (!html) continue;
    const refs = [...html.matchAll(/\s(?:href|src|poster)="([^"#?]+)/g)].map((m) => m[1]);
    for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) refs.push(...m[1].split(',').map((x) => x.trim().split(/\s+/)[0]));
    for (let r of refs) {
      if (/^(https?:|mailto:|data:|flightday:)/.test(r)) continue;
      if (!r.startsWith('/')) r = path.posix.join(path.posix.dirname(p.endsWith('/') ? p + 'x' : p), r);
      if (r.startsWith('/demo/')) continue;   // the demo bundle is pinned by its own manifest
      if (isPage(r)) { if (!seen.has(r)) queue.push(r); } else assets.add(r);
    }
  }
  // stylesheets: fonts and images they pull in
  for (const css of [...assets].filter((a) => a.endsWith('.css'))) {
    const text = await get(base + css);
    if (text) for (const m of text.matchAll(/url\(["']?([^"')]+)/g)) if (!/^(data:|https?:)/.test(m[1])) assets.add(m[1].startsWith('/') ? m[1] : path.posix.join(path.posix.dirname(css), m[1]));
  }
  console.error(`${base}: ${seen.size} pages, ${assets.size} assets seen so far`);
}
const retired = [...assets].filter((a) => !current.has(a)).sort();
process.stdout.write(retired.join('\n') + '\n');
console.error(`${retired.length} retired asset paths`);
