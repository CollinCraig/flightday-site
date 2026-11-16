#!/usr/bin/env python3
"""Assemble public/*.html from src/*.html fragments plus one shared head, header and footer.
The output is plain static HTML; nothing runs at request time. Also writes sitemap.xml.

    python3 tools/build-pages.py

Asset versioning: CSS and JS are named site.v<N>.css / site.v<N>.js and cached as immutable.
When either changes, bump ASSET_VERSION here, rename the files to match and rebuild.
"""
import pathlib, re, datetime, html

ASSET_VERSION = "7"

ORIGIN = "https://flightday.app"
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, PUB = ROOT / "src", ROOT / "public"
NAV = [("/features/", "Features"), ("/docs/", "Docs"), ("/roadmap/", "Roadmap"), ("/press/", "Launch kit")]

# Docs: src/docs/<slug>.html, served at /docs/<slug>/ (index → /docs/). Order and grouping drive the sidebar,
# the previous/next links and the search index (public/assets/docs-index.js). The alarm clock comes first.
DOCS = [
    ("Start here", [("index", "Docs home"), ("getting-started", "Getting started")]),
    ("The alarm clock", [("launch-alarm", "The launch alarm"), ("briefing", "The morning briefing"),
                         ("goodnight", "Goodnight and the night screen"), ("sleep-schedule", "The sleep schedule")]),
    ("Your whole day and home", [("whole-day", "What you can add"), ("dashboard", "The dashboard and your day"),
                                 ("weather", "Weather and rain soon"), ("smart-comfort", "Smart Comfort"),
                                 ("house", "Lights, speakers and cameras"), ("vacuum", "Robot vacuum"),
                                 ("house-check", "Systems check and the AI planner"), ("space", "The Space feed"),
                                 ("ambient", "Ambient")]),
    ("Reference", [("settings", "What’s configurable"), ("screens", "What am I looking at?"),
                   ("things-to-try", "Things to try"), ("troubleshooting", "Troubleshooting and FAQ"),
                   ("requirements", "Requirements and setup"), ("words", "Words we use")]),
]
DOC_LIST = [(g, slug, label) for g, items in DOCS for slug, label in items]
def doc_url(slug): return "/docs/" if slug == "index" else f"/docs/{slug}/"
# The app's sign-in callback, declared on the home page. Permanent; check-site.mjs requires it.
HOME_EXTRA_HEAD = '<link rel="redirect_uri" href="flightday://auth-callback">\n'
LASTMOD = datetime.date.today().isoformat()

# The site's release is the newest entry in CHANGELOG.md (Keep a Changelog), which is also the source of /changelog/.
# check-site.mjs fails when public/ changed since the last recorded release without a newer dated entry there.
import html as _h
CHANGELOG = (ROOT / "CHANGELOG.md").read_text()
RELEASES = [(m.group(1), m.group(2), m.start()) for m in re.finditer(r"^## \[([\d.]+)\] - (\d{4}-\d{2}-\d{2})$", CHANGELOG, re.M)]
SITE_VERSION = RELEASES[0][0]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

def md_inline(t):
    t = _h.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r'<span class="mono">\1</span>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', t)

def changelog_html():
    out = []
    for i, (ver, date, at) in enumerate(RELEASES):
        end = RELEASES[i + 1][2] if i + 1 < len(RELEASES) else len(CHANGELOG)
        y, mo, d = date.split("-")
        vid = "v" + ver.replace(".", "-")
        out.append(f'      <article class="release" id="{vid}" aria-labelledby="{vid}-h">\n        <header><h2 id="{vid}-h">{ver}</h2><p class="asof">{int(d)} {MONTHS[int(mo) - 1]} {y}</p></header>')
        for sec, items in re.findall(r"^### (\w+)\n((?:- .*\n?)+)", CHANGELOG[at:end], re.M):
            lis = "\n".join(f"          <li><span>{md_inline(li[2:].strip())}</span></li>" for li in items.strip().split("\n"))
            out.append(f'        <h3>{sec}</h3>\n        <ul class="list">\n{lis}\n        </ul>')
        out.append("      </article>")
    return "\n".join(out)

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
{canonical}<meta name="theme-color" content="#0A0E1A" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F4F5F9" media="(prefers-color-scheme: light)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Flight Day">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{origin}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Flight Day mark, a half sun on a horizon with an ascent trail, and the line: Every day is a flight day.">
<meta name="twitter:card" content="summary_large_image">
<meta name="fd-version" content="{version}">
{robots}{extra_head}<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.v{v}.css">
<script src="/assets/site.v{v}.js"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="devbar" role="note"><div class="wrap"><span>In development · early access soon · official launch planned for 8 Dec</span><a href="/roadmap/">Roadmap</a></div></div>
<header class="top">
  <div class="wrap">
    <a class="brand" href="/" aria-label="Flight Day home"><img class="logo-dark" src="/assets/brand/flightday-lockup.svg" alt="Flight Day" width="120" height="30"><img class="logo-light" src="/assets/brand/flightday-lockup-on-light.svg" alt="Flight Day" width="120" height="30"></a>
    <nav aria-label="Main"><ul class="nav">
{nav}
    </ul></nav>
    <button class="theme" type="button" data-theme-toggle hidden aria-label="Switch theme"><svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg><svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
  </div>
</header>

"""

# The family line, word for word as approved, lives in private/site-private.json ("family": two sentences). Without
# that file the site builds without it (the public tools carry no product or personal names).
import json as _json
_PRIV = ROOT / "private" / "site-private.json"
FAMILY = tuple(_json.loads(_PRIV.read_text())["family"]) if _PRIV.exists() else None
if FAMILY is None:
    print("private term list not found; building without the family line")

FOOT = """
<footer>
  <div class="wrap">
    <div class="row">
      <a href="/" aria-label="Flight Day home" class="brand"><img class="logo-dark" src="/assets/brand/flightday-lockup.svg" alt="Flight Day" width="96" height="24"><img class="logo-light" src="/assets/brand/flightday-lockup-on-light.svg" alt="Flight Day" width="96" height="24"></a>
      <nav aria-label="Footer"><a href="/features/">Features</a><a href="/roadmap/">Roadmap</a><a href="/docs/">Docs</a><a href="/integrations/">Integrations</a><a href="/install/">Install</a><a href="/press/">Launch kit</a><a href="/privacy/">Privacy</a><a href="/changelog/">Mission Log</a></nav>
    </div>
{family_html}    <p>Open source · <a href="https://github.com/CollinCraig/flightday">Flight Day code</a> · <a href="https://github.com/CollinCraig/flightday-site">Website code</a></p>
    <p>Background imagery: NASA</p>
    <p>Every day is a flight day. Launch data from Launch Library 2 (The Space Devs). Flight Day isn’t affiliated with any launch provider, Apple, Google or Home Assistant.</p>
    <p class="ver">Site {version} · <a href="/changelog/#v{version_id}">What’s new</a></p>
  </div>
</footer>
</body>
</html>
"""

# Feature clips: {{clip <name>}} in a page fragment becomes the same accessible, muted, looping video everywhere.
# (title, caption line, description for screen readers). Files live in public/assets/clips/<name>.mp4|.webm|.webp.
CLIPS = {
    "alarm": ("Launch alarm", "Wall panel · the countdown while the screen brightens, liftoff on time, then the morning briefing",
              "The wall panel's launch alarm: a dawn sky brightens behind a rocket on the pad as the count reaches zero, the rocket lifts off, and the morning briefing slides in with the weather and the day ahead."),
    "snooze": ("Snoozed night clock", "TV · the dim night clock shows the next liftoff",
               "The demo TV shows its dim red snoozed clock and the time of the next liftoff."),
    "goodnight": ("Goodnight", "Wall panel · one tap powers the house down, then a touch shows the dim red night controls",
                  "On the wall panel's Night screen, Goodnight is tapped. A short systems-powering-down list runs, the screen goes to a dim red night clock, and a touch brings up quiet red controls for the wake time, alarm and this screen."),
    "ambient": ("Ambient", "Wall panel · the clock and the day over a generated sky (Concept)",
                "The ambient screen shows the time, date, temperature and next event over a generated sky. The sky is labelled Generated and remains Concept."),
    "comfort": ("Smart Comfort", "Wall panel · thermostat controls with sample data",
                "The House screen shows the thermostat controls, Cool selected and a manual-hold setpoint, using sample data."),
    "globe": ("Space", "Living-room Google TV · the globe flies to each launch picked from the manifest",
              "The Space screen on a TV: the launch manifest beside a globe with the space station's track. Picking a launch flies the globe to its pad and updates the brief below."),
    "iphone": ("iPhone launch alarm", "iPhone · ignition and liftoff, then (after a cut) the snoozed screen with the next liftoff",
               "The iPhone app's launch alarm: the count reaches zero and a rocket lifts off, with Snooze, Scrub and I'm up below it. After a cut, the snoozed screen shows the new liftoff time, a countdown to it, Scrub and I'm up."),
}
ICON_PAUSE = '<svg class="i-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
ICON_PLAY = '<svg class="i-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>'

# A re-recorded clip gets a new file name, because the edge serves media by name for a day.
CLIP_FILE = {'alarm': 'alarm-ember-ccd25ed60d26', 'snooze': 'snooze-ember-413ccb3f6568', 'goodnight': 'goodnight-ember-1effcd92c411', 'ambient': 'ambient-ember-060622a0f576', 'comfort': 'comfort-ember-b75e55743ede', 'globe': 'globe-ember-b56551ad4552'}

def clip(m):
    name = m.group(1)
    if name == "iphone":
        return '<figure class="shot portrait"><a href="/assets/shots/iphone-alarm-v3-full.png"><img loading="lazy" src="/assets/shots/iphone-alarm-v3-full.png" width="1206" height="2622" alt="Flight Day launch alarm on iPhone, showing a sample countdown and Snooze, Scrub and I’m up controls."></a><figcaption><span>iPhone · launch alarm · In development</span><span class="tag real">Real app · sample data</span></figcaption></figure>'
    title, line, desc = CLIPS[name]
    base = f"/assets/clips/{CLIP_FILE.get(name, name)}"
    return (f'<figure class="clip">\n  <div class="clip-frame">\n'
            f'    <video muted loop playsinline controls preload="none" poster="{base}.webp" width="1280" height="720" aria-label="{desc}">'
            f'<source src="{base}.mp4" type="video/mp4"><source src="{base}.webm" type="video/webm"></video>\n'
            f'    <button class="clip-btn" type="button" hidden data-name="{title}" aria-label="Play video: {title}">{ICON_PAUSE}{ICON_PLAY}</button>\n'
            f'  </div>\n  <figcaption><b>{title}</b><span>{line}</span><span class="rec">Recorded from the real app (sample data)</span></figcaption>\n</figure>')

# Integration examples (FE-O8) are included verbatim at build time from oss/examples/integrations/, so edits there flow
# through. {{example <path>}} becomes a collapsible code block; every example shows "Staging validation: pending" until a
# pass is reported for it (STAGING_PASSED).
EXAMPLES = ROOT.parent / "oss" / "examples" / "integrations"
STAGING_PASSED = set()

def example(m):
    rel = m.group(1)
    f = EXAMPLES / rel
    if not f.exists():
        raise SystemExit(f"example file missing: {f}")
    code = _h.escape(f.read_text().rstrip("\n"))
    return (f'<details class="example"><summary><span class="mono">{_h.escape(rel)}</span></summary>'
            f'<pre class="code" data-example="{_h.escape(rel)}"><code>{code}</code></pre></details>')

def staging(m):
    name = m.group(1)
    return ('<span class="st st-live">Staging validation: passed</span>' if name in STAGING_PASSED
            else '<span class="st st-dev">Staging validation: pending</span>')

# Concept frames C1–C8 (ONBOARDING §7, FE-S4), rendered from concepts/make-frames.py. Always labelled Concept; never
# store screenshots; each is replaced by a Real or Sample capture once its screen is built.
CONCEPTS = [
    ("C1", "Welcome", "The first screen on a wall panel and an iPhone: Flight Day, Your alarm clock and day, in one place, with Get started and Try the demo house."),
    ("C2", "Find Home Assistant", "An iPhone listing two Home Assistant houses found on the network, Home and Cabin, with Enter an address and Continue without Home Assistant."),
    ("C3", "Pair this screen", "A TV showing the pairing code 7K3Q-M2 and a QR code, beside an iPhone approving Living room TV in Home Assistant."),
    ("C4", "Add Flight Day", "A Mac showing three steps to add Flight Day to Home Assistant: Open in HACS, Restart Home Assistant, Add Flight Day."),
    ("C5", "Integrations & devices", "An iPad showing the house set up: your alarm clock, the launch alarm, Goodnight, the robot vacuum and a comfort schedule offering Turn on."),
    ("C6", "Wake times", "An iPhone asking when you wake up: Mon–Fri 6:45 AM with the alarm on, weekends 8:30 AM off, and the crew who wakes with the alarm: Everyone, Sam or Riley."),
    ("C7", "Done", "A wall panel saying Done. Next liftoff Mon 6:45 AM, with Preview the launch alarm and Go to Home."),
    ("C8", "Settings › Integrations", "A Mac listing each integration with its status and summary, including Bin day added by you."),
]

# Re-rendered frames get a new file name, because the edge serves images by name for a day.
CONCEPT_FILE = {"C6": "C6-v2"}

def concepts_html():
    figs = []
    for cid, name, alt in CONCEPTS:
        f = CONCEPT_FILE.get(cid, cid)
        figs.append(f'<figure class="shot"><a href="/assets/concepts/{f}-dark.png"><img class="only-dark" loading="lazy" src="/assets/concepts/{f}-dark.webp" width="1600" height="1000" alt="Concept: {_h.escape(alt)}"><img class="only-light" loading="lazy" src="/assets/concepts/{f}-light.webp" width="1600" height="1000" alt="Concept: {_h.escape(alt)}"></a>'
                    f'<figcaption><span>{cid} · {_h.escape(name)}</span><span class="tag concept">Concept</span></figcaption></figure>')
    return '<div class="g g-8 rv-kids">\n' + "\n".join(figs) + "\n</div>"

def follow_html():
    if _PRIV.exists():
        f = _json.loads(_PRIV.read_text()).get("follow")
        if f:
            return (f'<div class="follow-links"><a class="btn" href="{f["x_url"]}">{f["x_text"]}</a>'
                    '<a href="https://github.com/CollinCraig/flightday">Watch the code on GitHub</a></div>')
    return '<div class="follow-links"><a href="https://github.com/CollinCraig/flightday">Watch the code on GitHub</a></div>'

def meta(text, key):
    m = re.search(r"<!--\s*" + key + r":\s*(.*?)\s*-->", text)
    return m.group(1) if m else None

import html as _html, json

SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'

def docs_nav(slug, which):
    """The docs sidebar. Rendered twice (desktop aside, phone disclosure); CSS shows one."""
    out = [f'<nav class="docs-nav" aria-label="Docs{" menu" if which == "m" else ""}">',
           f'<div class="docs-search" role="search" data-docs-search hidden><label for="ds-{which}" class="sr">Search the docs</label>'
           f'{SEARCH_ICON}<input id="ds-{which}" type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false">'
           f'<p class="docs-hits sr" aria-live="polite"></p><ul class="docs-results"></ul></div>']
    for group, items in DOCS:
        out.append(f'<p class="docs-group">{group}</p><ul>')
        for s2, label in items:
            cur = ' aria-current="page"' if s2 == slug else ""
            out.append(f'<li><a href="{doc_url(s2)}"{cur}>{label}</a></li>')
        out.append("</ul>")
    out.append("</nav>")
    return "".join(out)

def docs_page(slug, body):
    i = next(n for n, d in enumerate(DOC_LIST) if d[1] == slug)
    group, _, label = DOC_LIST[i]
    prev_ = DOC_LIST[i - 1] if i > 0 else None
    next_ = DOC_LIST[i + 1] if i + 1 < len(DOC_LIST) else None
    pager = '<nav class="docs-pager" aria-label="Previous and next page">' + \
        (f'<a class="prev" href="{doc_url(prev_[1])}"><small>Previous</small><span>{prev_[2]}</span></a>' if prev_ else '<span></span>') + \
        (f'<a class="next" href="{doc_url(next_[1])}"><small>Next</small><span>{next_[2]}</span></a>' if next_ else '<span></span>') + '</nav>'
    return (f'<main id="main" class="docs">\n<div class="wrap docs-layout">\n'
            f'<details class="docs-mobile"><summary><span>Docs</span><b>{label}</b></summary>{docs_nav(slug, "m")}</details>\n'
            f'<aside class="docs-side">{docs_nav(slug, "d")}</aside>\n'
            f'<article class="docs-body">\n<p class="eyebrow">{group}</p>\n{body.strip()}\n{pager}\n</article>\n</div>\n</main>\n'
            f'<script src="/assets/docs-index.js" defer></script>')

def plain(fragment):
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", _html.unescape(t)).strip()

pages, index = [], []
sources = sorted(SRC.glob("*.html")) + [SRC / "docs" / f"{slug}.html" for _, slug, _ in DOC_LIST]
for f in sources:
    text = f.read_text()
    is_doc = f.parent.name == "docs"
    slug = f.stem if is_doc else None
    path = doc_url(slug) if is_doc else meta(text, "path")
    out = ("docs/" + ("" if slug == "index" else slug + "/") + "index.html") if is_doc else meta(text, "out")
    body = re.sub(r"^(<!--.*?-->\n)+", "", text, flags=re.S)
    body = re.sub(r"\{\{clip (\w+)\}\}", clip, body)
    body = re.sub(r"\{\{example ([\w./-]+)\}\}", example, body)
    body = re.sub(r"\{\{staging ([\w-]+)\}\}", staging, body)
    body = body.replace("{{concepts}}", concepts_html()).replace("{{follow}}", follow_html())
    body = body.replace("{{family}}", f'<p>{FAMILY[0]}</p>\n        <p>{FAMILY[1]}</p>' if FAMILY else '<p class="muted">The family line is added when the site is built with its private configuration.</p>')
    body = body.replace("{{changelog}}", changelog_html()) if "{{changelog}}" in body else body
    body = body.replace("{{docsearch}}", re.search(r'<div class="docs-search".*?</ul></div>', docs_nav("index", "h"), re.S).group(0))
    if is_doc:
        g, _, label = next(d for d in DOC_LIST if d[1] == slug)
        heads = [(m.group(1), plain(m.group(2))) for m in re.finditer(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>', body, re.S)]
        index.append({"t": label, "u": path, "g": g, "s": meta(text, "description"), "h": heads, "x": plain(body)[:6000]})
        body = docs_page(slug, body)
    current = ' aria-current="page"'
    nav = "\n".join(
        f'      <li><a href="{href}"{current if (path == href or (href != "/" and path and path.startswith(href))) else ""}>{label}</a></li>' for href, label in NAV
    )
    listed = meta(text, "sitemap") != "no"
    html = HEAD.format(
        title=meta(text, "title"), description=meta(text, "description"), url=ORIGIN + (path or "/"), origin=ORIGIN,
        canonical=f'<link rel="canonical" href="{ORIGIN}{path}">\n' if listed else "",
        robots="" if listed else '<meta name="robots" content="noindex">\n', nav=nav, v=ASSET_VERSION,
        extra_head=HOME_EXTRA_HEAD if path == "/" else "", version=SITE_VERSION,
    ) + body.strip() + "\n" + FOOT.format(family_html=(f'    <p class="family">{FAMILY[0]}<br>{FAMILY[1]}</p>\n' if FAMILY else ''), version=SITE_VERSION, version_id=SITE_VERSION.replace(".", "-"))
    target = PUB / out
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html)
    if listed:
        pages.append(path)
    print("wrote", target.relative_to(ROOT))

(PUB / "assets" / "docs-index.js").write_text("/* Generated by tools/build-pages.py: the docs search index. */\nwindow.FD_DOCS=" + json.dumps(index, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("wrote public/assets/docs-index.js with", len(index), "pages")

urls = "\n".join(f"  <url><loc>{ORIGIN}{p}</loc><lastmod>{LASTMOD}</lastmod></url>" for p in sorted(pages, key=lambda p: (p != "/", p)))
(PUB / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n')
print("wrote public/sitemap.xml with", len(pages), "pages")
