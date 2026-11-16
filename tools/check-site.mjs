#!/usr/bin/env node
/* Pre-deploy audit for public/. No dependencies.  node tools/check-site.mjs
 * 1. Link audit: every local href/src/srcset resolves to a file, and every #fragment exists on its page.
 * 2. CSP fit: no inline <script>, inline style attributes, <style> blocks or on* handlers in HTML.
 * 3. Privacy denylist: no private addresses, tokens, entity ids or voice-rule breaks. Private terms (names, places,
 *    other products, the hub port, the old product name and the exact approved strings that may contain them) load
 *    from private/site-private.json when it's present; without it, only the generic rules run.
 * 4. Feature clips: every <video> is muted, inline, looping, has a poster and an MP4, and its caption says
 *    "Recorded from the real app (sample data)"; every clip file is referenced, at most 3 MiB, and its metadata
 *    (first and last 64 KiB) passes the privacy denylist.
 * 5. FE-S2 (permanent): the home page declares <link rel="redirect_uri" href="flightday://auth-callback"> in <head>.
 * 6. Release gate: the site version in <meta name="fd-version"> has a dated entry on /changelog/.
 * 7. FE-S1: /privacy/ exists with its Apple Health section, and every page's footer links to it.
 * 8. Docs: every page under /docs/ has the docs sidebar and is in the search index (assets/docs-index.js).
 * 10. X drafts stay private: nothing under x-drafts/ (post texts, previews, indexes) may appear in public/, and no
 *     published path may contain an x-drafts or launch-drafts folder. (Draft media may reuse published shots; that's fine.)
 * 14. Caching headers: every response says no-transform (Cloudflare must not rewrite pages); Cloudflare's own cache is capped
 *     at 5 minutes (Cloudflare-CDN-Cache-Control: max-age=300 on /*, nowhere detached or changed); and /demo/* files are
 *     revalidated every time (Cache-Control: no-cache), except content-addressed /demo/v/* assets (one year immutable).
 * 13. Retired assets: every path in tools/retired-assets.txt is gone from public/ (a burned name can never come back)
 *     and answered by its 404 rule in the generated block of public/_redirects (tools/retire-assets.mjs keeps them in step).
 * 15. The one Function: functions/ holds only _middleware.js and the generated retired.js. The middleware's code is
 *     exactly the approved version (comments aside), retired.js matches tools/retired-assets.txt and the site's /*
 *     headers, and _routes.json sends every path through it. Tests: a retired path gets a 404 with the site headers
 *     without next(); a 404 from Pages keeps its status, body and headers and gains no-transform; live files and
 *     other statuses pass through untouched (same object).
 * 16. Starfield/Tonight's sky previews carry the exact HYG CC BY-SA 4.0 credit; never Yale BSC or public-domain star data.
 * 12. Theme lexicon (THEME-LEXICON §2, §5.3): no rejected theme word in site copy, Morrowdock's words (academy, lesson,
 *     training) only in the approved Continue training line, "Mission control" at most once and only in home-page prose,
 *     "House check" is "Systems check" (past changelog entries stay as written), and the Quindar tone and "On this day"
 *     only ever appear labelled Concept.
 * 11. /demo (FE-S3): the static demo house is a built bundle, checked as one: demo-build.json must hash to the audited
 *     receipt (DEMO_MANIFEST_SHA256), every file must match its listed size and SHA-256 with nothing extra or missing, and
 *     _headers must carry the bundle's /demo/* block byte for byte (detach the global CSP, then the demo CSP, whose
 *     connect-src is 'self'). Only that block may allow 'unsafe-inline'. The site-copy rules (voice, entity ids, old
 *     name, page chrome) don't apply to app code; a strict privacy scan does (addresses, keys, names, local paths).
 * 9. Changelog gate: CHANGELOG.md's newest entry is the site version and is dated; and if public/ differs from the last
 *    recorded release (tools/released.json, written by tools/deploy.sh via --record-release), CHANGELOG.md must have a
 *    newer entry than that release. So no deploy goes out without its changelog entry.
 * Exits 1 on any problem. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { demoBundleProblems, demoHeaderProblems } from './demo-bundle.mjs';
import { developmentCopyProblems } from './development-copy.mjs';
import { betaScopeProblems } from './beta-scope.mjs';
import { starfieldCreditProblems } from './starfield-credit.mjs';

const pub = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public');
const problems = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(pub);
const DEMO_DIR = path.join(pub, 'demo'), inDemo = (f) => f.startsWith(DEMO_DIR + path.sep);
const html = files.filter((f) => f.endsWith('.html') && !inDemo(f));   // site pages; the demo bundle is rule 11
const text = files.filter((f) => !inDemo(f) && (/\.(html|css|js|txt|xml|webmanifest|svg|json)$/.test(f) || path.basename(f) === '_headers'));

function resolve(fromFile, ref) {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return fromFile;
  let p = clean.startsWith('/') ? path.join(pub, clean) : path.join(path.dirname(fromFile), clean);
  if (clean.endsWith('/')) p = path.join(p, 'index.html');
  return p;
}
// Private terms and the exact strings approved word for word (e.g. the family line) live in private/site-private.json,
// which is gitignored and never exported. Approved strings are removed before the privacy scan; nothing looser.
const privFile = path.resolve(pub, '../private/site-private.json');
const priv = fs.existsSync(privFile) ? JSON.parse(fs.readFileSync(privFile, 'utf8')) : null;
if (!priv) console.log('private term list not found; generic checks only');
const ALLOW = priv ? priv.allowText.slice().sort((x, y) => y.length - x.length) : [];
const ALLOW_URLS = new Set(priv ? priv.allowUrls : []);
const ALLOW_URL_PREFIXES = priv?.allowUrlPrefixes || [];
// approved strings that may appear on one page only ("pageOnly" in the private config: string → page)
const PAGE_ONLY = Object.entries(priv && priv.pageOnly ? priv.pageOnly : {});
const allowed = (s) => ALLOW.reduce((t, a) => t.split(a).join(''), s);
const REDIRECT_URI = '<link rel="redirect_uri" href="flightday://auth-callback">';
const ids = new Map(html.map((f) => [f, new Set([...fs.readFileSync(f, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));

let links = 0, oldNameCount = 0;
const clipRefs = new Set();
for (const f of html) {
  const s = allowed(fs.readFileSync(f, 'utf8')).split(REDIRECT_URI).join(''), rel = path.relative(pub, f);
  problems.push(...developmentCopyProblems(fs.readFileSync(f, 'utf8'), {betaApproved:priv?.publicBetaApproved === true}).map(p => rel + ': ' + p));
  problems.push(...betaScopeProblems(fs.readFileSync(f, 'utf8')).map(p => rel + ': ' + p));
  // Starfield attribution is literal, including future Concept previews and /press.
  for (const problem of starfieldCreditProblems(fs.readFileSync(f, 'utf8'))) problems.push(`${rel}: ${problem}`);
  const refs = [...s.matchAll(/\s(?:href|src|poster)="([^"]+)"/g)].map((m) => m[1]);
  for (const m of s.matchAll(/\ssrcset="([^"]+)"/g)) refs.push(...m[1].split(',').map((x) => x.trim().split(/\s+/)[0]));
  for (const ref of refs) {
    if (/^(https?:|mailto:|data:)/.test(ref)) { if (!ref.startsWith('https://flightday.app') && ref !== 'mailto:hello@flightday.app' && !ALLOW_URLS.has(ref) && !ALLOW_URL_PREFIXES.some(prefix => ref.startsWith(prefix))) problems.push(`${rel}: external link ${ref}`); continue; }
    links++;
    const target = resolve(f, ref);
    if (!fs.existsSync(target)) { problems.push(`${rel}: missing ${ref}`); continue; }
    const frag = ref.includes('#') ? ref.split('#')[1] : '';
    if (frag && target.endsWith('.html') && !ids.get(target)?.has(frag)) problems.push(`${rel}: no #${frag} in ${path.relative(pub, target)}`);
  }
  for (const [str, page] of PAGE_ONLY) if (rel !== page && fs.readFileSync(f, 'utf8').includes(str)) problems.push(`${rel}: an approved string that belongs only on ${page}`);
  if (/<script(?![^>]*\ssrc=)[^>]*>/.test(s)) problems.push(`${rel}: inline <script>`);
  if (/<style[\s>]/.test(s)) problems.push(`${rel}: <style> block`);
  if (/\sstyle="/.test(s)) problems.push(`${rel}: inline style attribute`);
  if (/\son[a-z]+="/.test(s)) problems.push(`${rel}: inline event handler`);
  if (!/<html lang="en">/.test(s)) problems.push(`${rel}: missing lang`);
  // Cloudflare's email obfuscation would turn a contact into “[email protected]”: keep every address inside email_off.
  for (const m of s.replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, '').matchAll(/[\w.+-]+@flightday\.app/g)) problems.push(`${rel}: ${m[0]} outside <!--email_off--> (Cloudflare would obfuscate it)`);
  for (const img of s.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(img[0])) problems.push(`${rel}: <img> without alt`);
  for (const fig of s.matchAll(/<figure class="clip">([\s\S]*?)<\/figure>/g)) {
    const v = (fig[1].match(/<video\b[^>]*>/) || [''])[0];
    for (const attr of ['muted', 'loop', 'playsinline', 'poster=', 'aria-label=']) if (!v.includes(attr)) problems.push(`${rel}: clip video without ${attr.replace('=', '')}`);
    if (/\sautoplay/.test(v)) problems.push(`${rel}: clip video with autoplay (the script plays clips in view, never under reduced motion)`);
    if (!/<source src="[^"]+\.mp4" type="video\/mp4">/.test(fig[1])) problems.push(`${rel}: clip without an MP4 source`);
    if (!fig[1].includes('Recorded from the real app (sample data)')) problems.push(`${rel}: clip without the "Recorded from the real app (sample data)" label`);
    for (const m of fig[1].matchAll(/(?:src|poster)="([^"]+)"/g)) clipRefs.add(m[1]);
  }
  if ((s.match(/<video\b/g) || []).length !== (s.match(/<figure class="clip">/g) || []).length) problems.push(`${rel}: <video> outside a labelled clip figure`);
  // Concept frames (FE-S4, D17) are always captioned Concept
  for (const fig of s.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/g)) if (/\/assets\/concepts\//.test(fig[1]) && !/class="tag concept">Concept</.test(fig[1])) problems.push(`${rel}: Concept frame without its Concept label`);
  if ((s.match(/src="\/assets\/concepts\//g) || []).length > (s.match(/<figure\b[^>]*>[\s\S]*?<\/figure>/g) || []).join('').split('src="/assets/concepts/').length - 1) problems.push(`${rel}: Concept frame outside a labelled figure`);
}
const home = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
// 6. Release gate: the site version (<meta name="fd-version"> on every page) needs a dated entry on /changelog/.
const ver = (home.match(/<meta name="fd-version" content="([^"]+)">/) || [])[1];
const logFile = path.join(pub, 'changelog/index.html'), log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
if (!ver) problems.push('index.html: no <meta name="fd-version">');
else {
  const id = 'v' + ver.replace(/\./g, '-');
  if (!new RegExp(`<article class="release" id="${id}"[^>]*>\\s*<header><h2[^>]*>${ver.replace('.', '\\.')}</h2><p class="asof">\\d{1,2} [A-Z][a-z]+ \\d{4}</p>`).test(log)) problems.push(`release gate: /changelog/ has no dated entry for ${ver} (id="${id}")`);
  for (const f of html) if (!fs.readFileSync(f, 'utf8').includes(`<meta name="fd-version" content="${ver}">`)) problems.push(`${path.relative(pub, f)}: site version is not ${ver}`);
}
if (!home.slice(0, home.indexOf('</head>')).includes(REDIRECT_URI)) problems.push(`index.html: missing ${REDIRECT_URI} in <head> (FE-S2, permanent)`);

const deny = [
  [/\b192\.168\.\d+\.\d+/, 'private IP'], [/\b10\.\d+\.\d+\.\d+\b/, 'private IP'], [/:8123\b/, 'Home Assistant port'],
  [/(?<![\w-])(?:sensor|input_boolean|input_select|input_datetime|weather|climate|vacuum|person|switch|light)\.(?!svg\b|png\b|webp\b)[a-z0-9_]{3,}/, 'entity id'],
 [/token\s*[:=]|Bearer\s+\S/i, 'token'], [/App Store (?:now|today)|available on the App Store|Download on the App Store/i, 'App Store availability claim'],
  [/!\s*<\/|🚀|Blast off|commander|astronaut|cadet/i, 'voice rule'],
];
if (priv) for (const [re, why] of priv.deny) deny.push([new RegExp(re, 'i'), why]);
const oldName = priv && priv.oldName ? new RegExp(priv.oldName.pattern, 'gi') : null;
for (const f of text) {
  const s = allowed(fs.readFileSync(f, 'utf8')), rel = path.relative(pub, f);
  // Integration examples (verbatim from oss/examples) use placeholder entity ids; only that one rule skips them.
  const sNoExamples = s.replace(/<pre class="code" data-example="[^"]*">[\s\S]*?<\/pre>/g, '');
  for (const [re, why] of deny) { const m = (why === 'entity id' ? sNoExamples : s).match(re); if (m && !(rel === '_headers' && why === 'token')) problems.push(`${rel}: ${why} → "${m[0]}"`); }
  const n = oldName ? (s.match(oldName) || []).length : 0;
  oldNameCount += n;
  if (n && rel !== priv.oldName.page) problems.push(`${rel}: mentions the old product name`);
}
if (oldName && oldNameCount !== priv.oldName.count) problems.push(`the old product name appears ${oldNameCount} times (expected ${priv.oldName.count}, on ${priv.oldName.page})`);
// 7. FE-S1 privacy page, linked from every footer
const privacyFile = path.join(pub, 'privacy/index.html');
if (!fs.existsSync(privacyFile) || !/id="health"/.test(fs.readFileSync(privacyFile, 'utf8'))) problems.push('privacy/index.html: missing, or without its Apple Health section (FE-S1)');
for (const f of html) { const footer = (fs.readFileSync(f, 'utf8').split('<footer>')[1] || ''); if (!footer.includes('href="/privacy/"')) problems.push(`${path.relative(pub, f)}: footer has no Privacy link (FE-S1)`); }
// 8. docs: sidebar on every docs page, and every docs page in the search index
const docsIndexFile = path.join(pub, 'assets/docs-index.js'), docsIndex = fs.existsSync(docsIndexFile) ? fs.readFileSync(docsIndexFile, 'utf8') : '';
for (const f of html.filter((f) => path.relative(pub, f).startsWith('docs' + path.sep))) {
  const rel = path.relative(pub, f), url = '/' + path.dirname(rel).split(path.sep).join('/') + '/';
  const s = fs.readFileSync(f, 'utf8');
  if (!s.includes('class="docs-nav"') || !s.includes('src="/assets/docs-index.js"')) problems.push(`${rel}: docs page without the docs sidebar or search index`);
  if (!docsIndex.includes(`"u":"${url}"`)) problems.push(`${rel}: not in the docs search index`);
}
// clips: referenced, small, and their metadata clean (only the privacy patterns: binary data would trip the voice rules)
const privacy = deny.filter(([, why]) => !/voice rule|App Store/.test(why)).concat(oldName ? [[new RegExp(priv.oldName.pattern, 'i'), 'old product name']] : [], [[/\/Users\/|\/home\/[a-z]/, 'local file path']]);
for (const f of files.filter((f) => /\/assets\/clips\//.test(f))) {
  const rel = path.relative(pub, f), buf = fs.readFileSync(f), size = buf.length;
  if (path.basename(f) !== 'ORIGINALS.json' && !clipRefs.has('/' + rel)) problems.push(`${rel}: clip file not used by any page`);
  if (/\.(mp4|webm)$/.test(f) && size > 3 * 1048576) problems.push(`${rel}: ${(size / 1048576).toFixed(2)} MiB, over the 3 MiB clip budget`);
  const head = buf.subarray(0, 65536).toString('latin1'), tail = buf.subarray(Math.max(0, size - 65536)).toString('latin1');
  for (const [re, why] of privacy) { const m = (head + '\n' + tail).match(re); if (m) problems.push(`${rel}: metadata ${why} → "${m[0]}"`); }
}
for (const ref of clipRefs) if (!fs.existsSync(path.join(pub, ref))) problems.push(`clip file missing: ${ref}`);
// 12. Theme lexicon: rejected words never appear in site copy (code examples, ids and links aside)
const THEME_REJECTED = [
  [/Ground Station/i, 'Ground Station'], [/(?<!Space |International Space )\bStations?\b/, 'Station (a screen is a screen)'],   // the ISS stays "the space station"
  [/pre-?flight briefing/i, 'Pre-flight briefing'], [/launch weather/i, 'Launch weather'], [/no-go poll/i, 'Go/No-Go poll'],
  [/\bnominal\b/i, 'Nominal'], [/\banomal(?:y|ies)\b/i, 'Anomaly'], [/\blanding\b/i, 'Landing'], [/night ops/i, 'Night Ops'],
  [/life support/i, 'Life support'], [/\bRovers?\b/, 'Rover (it\'s the robot vacuum)'], [/\bModules?\b/, 'Modules (they\'re integrations)'],
  [/\bacadem(?:y|ies)\b/i, 'academy (a Morrowdock word)'], [/\blessons?\b/i, 'lesson (a Morrowdock word)'],
  [/(?<!continue[ -])\btraining\b/i, 'training (a Morrowdock word; only the approved Continue training line)'],
];
let missionControl = 0;
for (const f of html) {
  const rel = path.relative(pub, f), raw = fs.readFileSync(f, 'utf8');
  const copy = allowed(raw).replace(/<pre class="code"[\s\S]*?<\/pre>/g, '').replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/g, '');
  for (const [re, why] of THEME_REJECTED) { const m = copy.match(re); if (m) problems.push(`${rel}: rejected theme word ${why} → "${m[0]}"`); }
  if (rel !== path.join('changelog', 'index.html')) { const m = copy.match(/\bhouse check\b/i); if (m) problems.push(`${rel}: "${m[0]}" is now "Systems check"`); }
  const mc = (copy.match(/mission control/gi) || []).length;
  missionControl += mc;
  if (mc && rel !== 'index.html') problems.push(`${rel}: "Mission control" belongs only in home-page prose`);
  if ([...copy.matchAll(/<nav\b[\s\S]*?<\/nav>/g)].some((n) => /mission control/i.test(n[0]))) problems.push(`${rel}: "Mission control" in a nav`);
  for (const m of copy.matchAll(/Quindar|On this day in/gi)) if (!copy.slice(Math.max(0, m.index - 300), m.index + 300).includes('st-concept')) problems.push(`${rel}: "${m[0]}" without its Concept label`);
}
if (missionControl > 1) problems.push(`"Mission control" appears ${missionControl} times (at most once, in home-page prose)`);
// 11. /demo (FE-S3): the audited static demo house, byte for byte, behind its own CSP
// Clean Apps receipt includes canonical provenance, originals and the independently reproducible namespace.
const DEMO_MANIFEST_SHA256 = '165222378f49c8255a22fb7d180a7053f05da95f1950021a65543975307a0622'; // exact refresh-2026-11-15/receipt.md, version d1437f942b271f534af6
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const headersText = fs.readFileSync(path.join(pub, '_headers'), 'utf8');
const blocks = [];   // _headers rules: an unindented path pattern, then its indented header lines
for (const line of headersText.split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  if (/^\S/.test(line)) blocks.push({ pattern: line, lines: [] }); else if (blocks.length) blocks[blocks.length - 1].lines.push(line);
}
const headerPatterns = new Set();
for (const b of blocks) {
  if (headerPatterns.has(b.pattern)) problems.push(`_headers: duplicate path ${b.pattern} (Wrangler keeps only the last block)`);
  headerPatterns.add(b.pattern);
}
for (const b of blocks) if (b.pattern !== '/demo/*' && b.lines.some((l) => l.includes("'unsafe-inline'"))) problems.push(`_headers: ${b.pattern} allows 'unsafe-inline' (only /demo/* may)`);
for (const f of html) if (fs.readFileSync(f, 'utf8').includes("'unsafe-inline'")) problems.push(`${path.relative(pub, f)}: 'unsafe-inline' outside /demo/`);
const demoFiles = files.filter(inDemo).map((f) => path.relative(DEMO_DIR, f).split(path.sep).join('/'));
const demoBlock = blocks.find((b) => b.pattern === '/demo/*' && b.lines.some((l) => l.includes('Content-Security-Policy')));
if (demoFiles.length || demoBlock) {
  const manFile = path.join(DEMO_DIR, 'demo-build.json');
  if (!fs.existsSync(manFile)) problems.push('demo/: no demo-build.json');
  else {
    const manBuf = fs.readFileSync(manFile), man = JSON.parse(manBuf);
    if (sha(manBuf) !== DEMO_MANIFEST_SHA256) problems.push(`demo/demo-build.json: SHA-256 ${sha(manBuf).slice(0, 12)}… is not the audited receipt's ${DEMO_MANIFEST_SHA256.slice(0, 12)}…`);
    problems.push(...demoBundleProblems(man, fs.readFileSync(path.join(DEMO_DIR, 'index.html'), 'utf8')).map(p => 'demo/: ' + p));
    if (man.format === 2 && !blocks.some(b => b.pattern === '/demo/v/*' && b.lines.includes('  ! Cache-Control') && b.lines.includes('  Cache-Control: public, max-age=31536000, immutable, no-transform'))) problems.push('_headers: format-2 demo requires immutable /demo/v/* cache policy');
    if (man.format === 2) {
      const retiredDemo = new Set(fs.readFileSync(path.resolve(pub, '../tools/retired-assets.txt'), 'utf8').split('\n'));
      for (const old of ['/demo/js/app.js', '/demo/css/app.css']) if (!retiredDemo.has(old)) problems.push(`demo retirement: ${old} must be burned before format-2 deployment`);
    }
    const demoAsset = man.files.find(f => (man.format !== 2 || f.path.startsWith(man.assetPrefix)) && /\.(?:js|css)$/.test(f.path));
    if (!demoAsset) problems.push('demo/: no asset available for CSP regression gate');
    else problems.push(...demoHeaderProblems(blocks, man.csp, '/demo/' + demoAsset.path).map(p => '_headers: ' + p));
    if (demoFiles.includes('assets.sha256.json')) problems.push('demo/assets.sha256.json: verification-only metadata must not be deployed');
    const listed = new Map(man.files.map((x) => [x.path, x]));
    for (const rel of demoFiles) {
      if (rel === 'demo-build.json') continue;
      const want = listed.get(rel);
      if (!want || rel === '_headers') { problems.push(`demo/${rel}: not in the audited bundle`); continue; }
      const buf = fs.readFileSync(path.join(DEMO_DIR, rel));
      if (buf.length !== want.bytes || sha(buf) !== want.sha256) problems.push(`demo/${rel}: differs from the audited bundle`);
    }
    for (const x of man.files) if (x.path !== '_headers' && !(man.assetManifest === 'assets.sha256.json' && x.path === 'assets.sha256.json') && !demoFiles.includes(x.path)) problems.push(`demo/${x.path}: missing from the bundle`);
    // the bundle's _headers snippet goes into the root _headers as it is, not as a file under /demo/
    const want = listed.get('_headers');
    // Keep the audited CSP snippet exact; the separately gated site cache policy shares this one path block.
    const cspLines = demoBlock ? demoBlock.lines.filter((l) => /^\s+(?:! )?Content-Security-Policy(?::|$)/.test(l)) : [];
    const got = demoBlock ? demoBlock.pattern + '\n' + cspLines.join('\n') + '\n' : '';
    if (demoBlock && demoBlock.lines.some((l) => !/^\s+(?:! )?(?:Content-Security-Policy|Cache-Control)(?::|$)/.test(l))) problems.push('_headers: /demo/* may contain only its audited CSP and gated cache policy');
    if (!demoBlock) problems.push('_headers: no /demo/* block');
    else {
      if (!want || sha(got) !== want.sha256) problems.push("_headers: the /demo/* block isn't the bundle's snippet byte for byte");
      if (demoBlock.lines[0] !== '  ! Content-Security-Policy') problems.push('_headers: the /demo/* block must first detach the global CSP');
      const csp = (demoBlock.lines.find((l) => l.startsWith('  Content-Security-Policy:')) || '').replace('  Content-Security-Policy: ', '');
      if (csp !== man.csp) problems.push("_headers: the /demo/* CSP isn't the bundle's");
      if (!/(^|; )connect-src 'self'(;|$)/.test(csp)) problems.push("_headers: /demo/* connect-src must be exactly 'self'");
      if (/(^|; )script-src [^;]*'unsafe-inline'/.test(csp)) problems.push("_headers: /demo/* must not allow inline scripts");
    }
    // the entry page: first-party scripts only, and every local reference resolves
    const entry = path.join(DEMO_DIR, 'index.html'), es = fs.existsSync(entry) ? fs.readFileSync(entry, 'utf8') : '';
    if (/<script(?![^>]*\ssrc=)[^>]*>/.test(es)) problems.push('demo/index.html: inline <script>');
    if (/\son[a-z]+="/.test(es)) problems.push('demo/index.html: inline event handler');
    for (const m of es.matchAll(/\s(?:href|src)="([^"]+)"/g)) if (!/^(https?:|data:|#)/.test(m[1]) && !fs.existsSync(resolve(entry, m[1]))) problems.push(`demo/index.html: missing ${m[1]}`);
    // privacy, app-code edition: no private addresses, keys, local paths or private names (whole words)
    const names = priv ? priv.deny.filter(([, why]) => why === 'personal name or place').map(([re]) => new RegExp(`\\b(?:${re})\\b`, 'i')) : [];
    const demoDeny = [[/\b192\.168\.\d+\.\d+/, 'private IP'], [/\b10\.\d+\.\d+\.\d+\b/, 'private IP'], [/\b172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/, 'private IP'],
      [/\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+/, 'tailnet IP'], [/\.ts\.net\b/, 'tailnet name'], [/\beyJ[\w-]{10,}\.[\w-]{10,}\./, 'token (JWT)'],
      [/\/Users\/|\/home\/[a-z]|[A-Z]:\\{1,2}Users\\{1,2}/, 'local file path'], [/[\w.+-]+@(?!flightday\.app)[\w-]+\.[\w.]+/, 'email address'], ...names.map((re) => [re, 'personal name or place'])];
    for (const rel of demoFiles.filter((r) => /\.(html|css|js|json|svg|txt|md)$/.test(r))) {
      const t = fs.readFileSync(path.join(DEMO_DIR, rel), 'utf8');
      for (const [re, why] of demoDeny) { const m = t.match(re); if (m) problems.push(`demo/${rel}: ${why} → "${m[0]}"`); }
    }
  }
}
// 14. caching headers can't drift
{
  const all = blocks.find((b) => b.pattern === '/*');
  if (!all || !all.lines.includes('  Cloudflare-CDN-Cache-Control: max-age=300')) problems.push('_headers: /* must set Cloudflare-CDN-Cache-Control: max-age=300');
  for (const b of blocks) {
    for (const l of b.lines) {
      if (/^\s*(!\s*)?Cloudflare-CDN-Cache-Control/i.test(l) && b.pattern !== '/*') problems.push(`_headers: ${b.pattern} changes Cloudflare-CDN-Cache-Control (only /* sets it, to max-age=300)`);
      if (/^\s*Cache-Control:/i.test(l) && !/no-transform/.test(l)) problems.push(`_headers: ${b.pattern} sets Cache-Control without no-transform`);
    }
    if (b.lines.some((l) => /^\s*Cache-Control:/i.test(l)) && b.pattern !== '/*' && !b.lines.includes('  ! Cache-Control')) problems.push(`_headers: ${b.pattern} sets Cache-Control without detaching the global one first`);
  }
  if (!blocks.some((b) => b.pattern === '/demo/*' && b.lines.includes('  Cache-Control: no-cache, no-transform'))) problems.push('_headers: /demo/* must revalidate every file (Cache-Control: no-cache, no-transform)');
}
// 15. the one Function, pinned and tested
{
  const fdir = path.resolve(pub, '../functions'), mwFile = path.join(fdir, '_middleware.js'), genFile = path.join(fdir, 'retired.js');
  const listing = fs.existsSync(fdir) ? walk(fdir).map((f) => path.relative(fdir, f)).sort() : [];
  if (listing.join(',') !== '_middleware.js,retired.js') problems.push(`functions/: must hold only _middleware.js and the generated retired.js (has: ${listing.join(', ') || 'nothing'})`);
  const src = fs.existsSync(mwFile) ? fs.readFileSync(mwFile, 'utf8') : '';
  const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
  const approved = "import { RETIRED, HEADERS } from './retired.js'; export async function onRequest({ request, next }) { if (RETIRED.has(new URL(request.url).pathname)) return new Response('Not found\\n', { status: 404, headers: HEADERS }); const r = await next(); if (r.status === 404) { const h = new Headers(r.headers); h.set('Cache-Control', 'no-store, no-transform'); return new Response(r.body, { status: 404, headers: h }); } return r; }";
  if (code !== approved) problems.push('functions/_middleware.js: code differs from the approved version (retired 404, then the 404 no-transform step)');
  const routes = fs.existsSync(path.join(pub, '_routes.json')) ? JSON.parse(fs.readFileSync(path.join(pub, '_routes.json'), 'utf8')) : null;
  if (!routes || JSON.stringify(routes.include) !== '["/*"]' || (routes.exclude || []).length) problems.push('_routes.json: must send every path ("/*") through the middleware, excluding nothing');
  // the tests run even when the pin check fails, so a removed condition trips both
  let mod = null;
  try {
    // run it as Pages does (an ES module), with the generated file inlined in place of its import
    mod = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(genFile, 'utf8') + '\n' + src.replace(/^import .*$/m, '')));
  } catch (e) { problems.push(`functions/: can't load the middleware with retired.js (${e.message.split('\n')[0]})`); }
  if (mod) {
    const listFile = path.resolve(pub, '../tools/retired-assets.txt');
    const retired = fs.readFileSync(listFile, 'utf8').split('\n').filter((l) => l.startsWith('/'));
    if (JSON.stringify([...mod.RETIRED].sort()) !== JSON.stringify([...retired].sort())) problems.push('functions/retired.js: list differs from tools/retired-assets.txt (run tools/retire-assets.mjs)');
    const all = blocks.find((b) => b.pattern === '/*'), want = {};
    for (const l of all ? all.lines : []) { const [k, ...v] = l.trim().split(':'); if (!/^(cache-control|cloudflare-cdn-cache-control)$/i.test(k)) want[k] = v.join(':').trim(); }
    Object.assign(want, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, no-transform' });
    if (JSON.stringify(mod.HEADERS) !== JSON.stringify(want)) problems.push("functions/retired.js: headers differ from the site's /* headers (run tools/retire-assets.mjs)");
    const { onRequest } = mod, req = (p) => new Request('https://flightday.app' + p);
    const nope = async () => { throw new Error('next() called'); };
    // REGRESSION GATE (the check that would have stopped 1.5.6): every retired path must get a 404 with the site
    // headers, and next() (here a stub that would serve the stale 200 copy) must never be called
    const leaks = [];
    for (const p of retired) {
      let called = false, r = null;
      const stale = async () => { called = true; return new Response('stale copy', { status: 200 }); };
      try { r = await onRequest({ request: req(p), next: stale }); } catch { r = null; }
      if (called || !r || r.status !== 404 || r.headers.get('cache-control') !== 'no-store, no-transform' || r.headers.get('content-security-policy') !== want['Content-Security-Policy'] || r.headers.get('x-frame-options') !== 'DENY') leaks.push(p + (called ? ' (next() called)' : ` (${r ? r.status : 'threw'})`));
    }
    if (leaks.length) problems.push(`RETIRED PATH GATE: ${leaks.length} of ${retired.length} retired paths would reach next() or not get the site's 404: ${leaks.slice(0, 5).join(', ')}${leaks.length > 5 ? '…' : ''}`);
    // a 404 from Pages: same status, body and headers, plus no-transform
    const page = new Response('<!doctype html><title>Not found</title>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'", 'X-Frame-Options': 'DENY' } });
    const out = await onRequest({ request: req('/no-such-page/'), next: async () => page });
    const ok404 = out.status === 404 && out.headers.get('cache-control') === 'no-store, no-transform' && out.headers.get('content-security-policy') === "default-src 'none'"
      && out.headers.get('x-frame-options') === 'DENY' && out.headers.get('content-type') === 'text/html; charset=utf-8' && (await out.text()).includes('Not found');
    if (!ok404) problems.push('functions/_middleware.js test: a 404 must keep its status, body and headers and gain no-transform');
    // live files and other statuses: the very same response object
    for (const [p, status] of [['/assets/' + fs.readdirSync(path.join(pub, 'assets')).find((f) => /^site\.v\d+\.css$/.test(f)), 200], ['/', 200], ['/' + path.relative(pub, files.find(f => inDemo(f) && f.endsWith('.js'))).split(path.sep).join('/'), 200], ['/privacy', 301], ['/', 304]]) {
      const res = new Response(status === 200 ? 'ok' : null, { status, headers: { 'Cache-Control': 'public, max-age=0, must-revalidate, no-transform' } });
      if ((await onRequest({ request: req(p), next: async () => res })) !== res) problems.push(`functions/_middleware.js test: ${p} (${status}) must pass through untouched`);
    }
  }
}
// 13. retired assets stay retired
{
  const listFile = path.resolve(pub, '../tools/retired-assets.txt');
  const retired = fs.existsSync(listFile) ? fs.readFileSync(listFile, 'utf8').split('\n').filter((l) => l.startsWith('/')) : [];
  const red = fs.existsSync(path.join(pub, '_redirects')) ? fs.readFileSync(path.join(pub, '_redirects'), 'utf8') : '';
  const block = (red.match(/# BEGIN retired assets[^\n]*\n([\s\S]*?)# END retired assets/) || [])[1] || '';
  const rules = block.split('\n').filter(Boolean);
  for (const p of retired) {
    if (fs.existsSync(path.join(pub, p))) problems.push(`${p}: retired, but back in public/ (run tools/retire-assets.mjs)`);
    if (!rules.includes(`${p} /404.html 404`)) problems.push(`_redirects: no 404 rule for retired ${p} (run tools/retire-assets.mjs)`);
  }
  if (rules.length !== retired.length) problems.push(`_redirects: ${rules.length} retired-asset rules for ${retired.length} listed paths (run tools/retire-assets.mjs)`);
  if (red.split('\n').filter((l) => l && !l.startsWith('#')).length > 2000) problems.push("_redirects: over Cloudflare Pages' 2,000 static rules");
}
// 10. x-drafts never reach public/
const draftsDir = path.join(path.resolve(pub, '..'), 'x-drafts');
if (fs.existsSync(draftsDir)) {
  const draftTexts = new Set(walk(draftsDir).filter((f) => /\.(md|json|html|txt|py)$/.test(f)).map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')));
  for (const f of files) {
    const rel = path.relative(pub, f);
    if (/(^|[\/])(x-drafts|launch-day|batch-\d+\w*)([\/]|$)/.test(rel)) problems.push(`${rel}: a drafts folder is in public/`);
    if (/\.(md|json|html|txt|py)$/.test(f) && draftTexts.has(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'))) problems.push(`${rel}: identical to a file in x-drafts/ (drafts are never published)`);
  }
}
// 9. changelog gate
const root = path.resolve(pub, '..'), changelog = fs.existsSync(path.join(root, 'CHANGELOG.md')) ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') : '';
const top = changelog.match(/^## \[([\d.]+)\] - (\d{4}-\d{2}-\d{2})$/m);
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
const contentHash = crypto.createHash('sha256');
for (const f of files.filter((f) => path.basename(f) !== 'sitemap.xml').sort()) { contentHash.update(path.relative(pub, f)); contentHash.update(fs.readFileSync(f)); }
const hash = contentHash.digest('hex').slice(0, 16), releasedFile = path.join(root, 'tools/released.json');
const released = fs.existsSync(releasedFile) ? JSON.parse(fs.readFileSync(releasedFile, 'utf8')) : null;
if (!top) problems.push('CHANGELOG.md: no dated release entry (## [x.y] - YYYY-MM-DD)');
else {
  if (ver && top[1] !== ver) problems.push(`CHANGELOG.md: newest entry ${top[1]} is not the site version ${ver} (rebuild with tools/build-pages.py)`);
  if (released && cmp(top[1], released.version) < 0) problems.push(`CHANGELOG.md: newest entry ${top[1]} is older than the released ${released.version}`);
  if (released && hash !== released.hash && cmp(top[1], released.version) <= 0) problems.push(`changelog gate: public/ changed since release ${released.version} (${released.date}), but CHANGELOG.md has no newer entry. Add one, dated, then rebuild.`);
  if (released && top[2] < released.date) problems.push(`CHANGELOG.md: newest entry is dated before the last release (${released.date})`);
}
for (const need of ['_headers', 'robots.txt', 'sitemap.xml', 'og.png', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'site.webmanifest', '404.html']) if (!fs.existsSync(path.join(pub, need))) problems.push(`missing ${need}`);

const size = files.reduce((n, f) => n + fs.statSync(f).size, 0), big = files.filter((f) => fs.statSync(f).size > 25 * 1024 * 1024);
for (const f of big) problems.push(`${path.relative(pub, f)} is over Cloudflare Pages' 25 MiB file limit`);
console.log(`${html.length} pages, ${links} local links, ${files.length} files, ${(size / 1048576).toFixed(1)} MiB · release ${top ? top[1] : '?'}${released ? ` (last released ${released.version})` : ''}`);
if (problems.length) { console.log(problems.map((p) => '✗ ' + p).join('\n')); process.exit(1); }
console.log('✓ links, CSP fit, privacy denylist, changelog gate and required files all pass');
if (process.argv.includes('--record-release')) {
  // the file list lets tools/retire-assets.mjs retire whatever the next release deletes
  const fileList = files.map((f) => '/' + path.relative(pub, f).split(path.sep).join('/')).sort();
  fs.writeFileSync(releasedFile, JSON.stringify({ version: top[1], date: top[2], hash, recorded: new Date().toISOString(), files: fileList }, null, 1) + '\n');
  console.log(`recorded release ${top[1]} (${hash})`);
}
