# Changelog: flightday.app

Every release of the Flight Day website, newest first. It is the source of /changelog/ (built by `tools/build-pages.py`),
and `tools/check-site.mjs` fails a deploy whose `public/` changed since the last release without a newer dated entry here.
Format: Keep a Changelog (Added / Changed / Fixed under `## [version] - YYYY-MM-DD`). Batch changes into releases.

## [1.6.6] - 2026-11-16
### Changed
- **Core and packages.** Clarified the small core, first-party package plans for Builder desk and Continue training, and AI brief, Flight Plan and Smart Comfort as built-in Labs features, off by default.

## [1.6.5] - 2026-11-16
### Changed
- **Launch scope.** Fully free at launch, with web/Android and iPhone first, aiming for 8 Dec. Apple TV, Mac and Watch are coming after launch. The app remains in development.
- **Developer direction.** One planned public API: Flight Day API 1.0. Hub HTTP and client internals stay private; agent control is planned for Labs after launch.

## [1.6.4] - 2026-11-16
### Fixed
- **Open-source status.** Flight Day is free and open source (Apache-2.0). It is in development. The install page links to the [app source](https://github.com/CollinCraig/flightday) and [website source](https://github.com/CollinCraig/flightday-site), and states: Free. No accounts. No telemetry. No paid plans.
- **Earlier wording.** Clarified the historical open-source note below; aiming for 8 Dec remains a development target.

## [1.6.3] - 2026-11-16
### Fixed
- Demo code comments cleaned up.

## [1.6.2] - 2026-11-16
### Changed
- **Source is public.** [Flight Day](https://github.com/CollinCraig/flightday) (apps, hub and docs) and [this website](https://github.com/CollinCraig/flightday-site) are open source under Apache-2.0; the hub is MIT OR Apache-2.0. The apps remain in development. Aiming for 8 Dec.

## [1.6.1] - 2026-11-15
### Changed
- **iPhone preview.** Replaced the temporary card with a recorded native-app still, labelled Real app · sample data.

## [1.6.0] - 2026-11-15
### Changed
- **Demo: phone layout, cleaner house, faster loads.** The demo house now uses the clean fixture and steady-clock build, with a phone layout, whole-row Lights controls and content-hashed assets that stay together across updates.
- **Integration status.** Working home-build integrations are labelled “Working · in development”, distinct from unfinished development and Concept, without implying public availability.

## [1.5.13] - 2026-11-14
### Changed
- **Free, with source publication planned at the time.** The hero, home description and launch-kit boilerplate led with that plan. The repositories became public on 16 November 2026; the app remains in development, aiming for 8 Dec.

## [1.5.12] - 2026-11-14
### Changed
- **Development status.** Clarified the home hero, features, install plans, docs, launch kit, integrations and page descriptions: building in public, early access soon, official launch Dec 8. Feature badges and the roadmap no longer imply a public release.

## [1.5.11] - 2026-11-14
### Changed
- **Fresh sample recordings.** Six web clips now show the verified current demo build under new asset names. Captions describe the recorded states; generated sky remains Concept.
- **Apple availability.** Clarified private iPhone, iPad and Watch testing; Mac and Apple TV remain in development.
- **A steadier clock.** [Read the wall panel and TV app’s 1.10.3 release note](/changelog/1.10.3/).
- **iPhone sample.** A temporary development card replaces the sample recording while a documented capture is prepared.
- **Launch timing.** Building in public. Early access soon, official launch Dec 8. Open-source timing remains flexible.
- **Launch artwork.** Refreshed both launch share images with the official launch date.
- **Launch kit attribution.** Added the maker’s website to the launch kit credits.
- **Release checks.** Updated the site’s publishing checks and added video-freshness reporting.

## [1.5.10] - 2026-11-14
### Fixed
- **The demo can load its sample data.** Its security and cache rules now share one header block, so publishing keeps both. The release checks reject duplicate header paths and verify the demo's security policy on the live site.
- **Demo interruption.** The 1.5.9 → 1.5.10 deployment interval was 15 minutes, 23 seconds (15 Nov, 00:45:10–01:00:33 UTC; 14 Nov, 7:45:10–8:00:33 PM Eastern). During that interval the demo received the main site's security policy, which blocked its sample-data requests. Its own policy is restored, with connections restricted to this site (`connect-src 'self'`).

## [1.5.9] - 2026-11-14
### Added
- **Star data credits.** Future sky previews require the approved HYG attribution and licence.
- **Wallpaper download privacy.** The privacy page explains that video packs download from media.flightday.app without an account or device id. Wallpapers remain Concept until the apps ship them.

### Changed
- **Demo image credits.** The audited bundle now includes the cleared Earth texture provenance record.
- **Go / No-Go availability.** The feature descriptions now explain that it is in the demo house and arrives with the next app release. It remains labelled In development.

## [1.5.8] - 2026-11-14
### Changed
- **Mission Log wording.** The 1.5.2 entry now describes the press kit link without naming it; the link itself is in the [launch kit](/press/#family).

## [1.5.7] - 2026-11-14
### Fixed
- **Retired files answer “not found” again.** After 1.5.6, one old stylesheet loaded again from Cloudflare's copy. The site now answers “not found” for every retired file before any cached copy can, as it did in 1.5.3.

## [1.5.6] - 2026-11-14
### Fixed
- **No analytics beacon on “not found” pages either.** Cloudflare's edge was adding its Web Analytics beacon to “not found” pages on flightday.app, and no dashboard setting accounts for it. Those pages are now marked “don't transform” too, so nothing is added. The site's content security policy blocked the beacon throughout.

## [1.5.5] - 2026-11-14
### Fixed
- **Mission Log wording.** The 1.4.1 entry now says exactly where the analytics beacon is gone: from every page served with the site's own headers, but not yet from “not found” pages.

## [1.5.4] - 2026-11-14
### Changed
- **Belt and braces, until 16 Nov.** For now Cloudflare also blocks the retired files' addresses outright, so they answer “forbidden”. After a check on 16 Nov, the temporary cache and block rules come off, and the site's own “not found” from 1.5.3 stays.

## [1.5.3] - 2026-11-14
### Fixed
- **Retired files answer “not found”, whatever any cache holds.** The cache rule in 1.5.2 didn't reach the layer that kept serving old files, so each retired file's address is now answered by the site itself, before any cache, with “not found”.

## [1.5.2] - 2026-11-14
### Added
- **Press kit link.** The launch kit's Family section links to our sister product's press kit. [Launch kit](/press/#family).

### Changed
- **Try the demo house on a phone.** The button now says the demo is best on a laptop, tablet or TV. On a phone it shows the wall-panel layout, small. [Home](/).
- **Go / No-Go** is now marked In development instead of Concept. [The morning briefing](/docs/briefing/).

### Fixed
- **Old files stop loading.** After 1.5.1, 40 old files (pictures, clips, stylesheets and scripts) kept loading on flightday.app even though the site itself answered “not found”. Two full purges of Cloudflare's cache didn't help: a cache layer in front of the site refilled them within seconds. Until 16 Nov, a temporary rule makes the site's files skip Cloudflare's cache. From now on, Cloudflare keeps any file for at most 5 minutes.
- **Burned names.** A picture changed for privacy always gets a new name, and its old name is retired for good: the site refuses to publish a retired name again.
- **Fresh demo files.** Browsers check the demo house's files on every visit, so an update never mixes old and new scripts.

## [1.5.1] - 2026-11-14
### Fixed
- **Deleted files answer “not found”.** The site itself now answers “not found” for old stylesheets, scripts, pictures and clips from earlier releases. Copies held in Cloudflare's cache kept loading on flightday.app; see 1.5.2.

## [1.5.0] - 2026-11-14
### Added
- **Words we use.** A docs page with each space word Flight Day uses, what it means in plain terms, and what always stays plain. [Words we use](/docs/words/).

### Changed
- **Mission Log.** This page is now the Mission Log: what’s new in each release. Its address stays the same.
- **Systems check.** The house check is now called Systems check (what needs attention at home), and its findings are marked Caution or Warning. It’s still in development. [Systems check](/docs/house-check/#house-check).
- **Solo flight.** Flight Day on one device without Home Assistant is now called Solo flight. It’s still in development. [Requirements](/docs/requirements/).

## [1.4.2] - 2026-11-14
### Changed
- **More demo-house pictures.** The Night area, Google TV Home, and the Home screen on Features and in the docs are now demo-house captures. A new "Starts simple" picture on the home page shows the alarm clock before any optional devices are added. Every demo capture is labelled Sample data · demo house, and the Space feed in them is real, as of 14 Nov. [Launch kit](/press/#shots).

## [1.4.1] - 2026-11-14
### Changed
- **New demo-house pictures.** The home page and the launch kit show the demo house (sample data): the Home screen with no devices connected, the morning briefing with Sam and Riley, and liftoff. [Launch kit](/press/#shots).

### Fixed
- **No third-party script on our pages.** Cloudflare had started adding its analytics beacon to every page. The site's content security policy always blocked it, so browsers never loaded it. Every page served with the site's own headers is now free of it. “Not found” pages still carry it, still blocked, until it's switched off at the source.

## [1.4.0] - 2026-11-14
### Added
- **Try the demo house.** The real web app runs in your browser with sample data, with Sam and Riley as the crew. Everything it loads comes from flightday.app, and it never connects to a house. The Space feed is a dated snapshot of the real one. [Try the demo house](/demo/).

## [1.3.1.1] - 2026-11-14
### Fixed
- **Integrations on phones and tablets, properly this time.** The long file names above each example now wrap, so the page no longer scrolls sideways. 1.3.0.1 fixed the code boxes but missed the file names. [Integrations](/integrations/#examples).

## [1.3.1] - 2026-11-14
### Changed
- **Crew.** The people who live in the home are the crew, and each of them is a crew member, across the docs, the privacy page and the integrations page. The Wake times Concept frame (C6) shows the new Crew picker.

### Fixed
- **Globe imagery is now NASA Blue Marble and Black Marble.** The Space clip and the panel Space shots were recorded again from the demo house (sample data) with the new day and night maps.
- **iPad and Mac shots.** Taken out of the galleries until they’re captured again with the new globe imagery. [Launch kit](/press/#shots).

## [1.3.0.1] - 2026-11-14
### Fixed
- **Integrations on phones and tablets.** The example code no longer pushes the page sideways; long lines scroll inside their box. [Integrations](/integrations/#examples).

## [1.3.0] - 2026-11-14
### Added
- **For everyone.** A home-page section about Flight Day in your own home, from 8 Dec, with eight Concept frames of the setup (welcome, finding Home Assistant, pairing a screen, adding Flight Day, integrations, wake times, done, and Settings › Integrations). Each is labelled Concept. They’re also in the [launch kit](/press/#concepts).
- **Integrations.** The built-in integrations with their status, what Settings › Integrations will show, how to build your own, the examples (staging validation pending) and the rules for being listed. [Integrations](/integrations/).
- **Install, coming soon.** What installing will ask for: the app first, then Home Assistant. The guide arrives on 8 Dec. [Install](/install/).
- **Follow along.** Follow the build on X, on the home page and in the launch kit.
- **Launching 8 Dec.** A small banner on every page.
- **Share images.** Four brand images for posts and link cards, 1200 × 675 and 1080 × 1080, in the [launch kit](/press/#share).

### Changed
- **Roadmap.** Flight Day for everyone is in flight, and “Not promised” says what arrives on 8 Dec.
- **Phones.** The top bar keeps the theme button on the first line.
- **Site tools.** Private terms (names, other products, the hub port, the demo swap list and the approved family strings) moved out of the public tools into a private config that is never exported. Without it, the tools still run every generic check and say so.

## [1.2.2] - 2026-11-14
### Fixed
- **Privacy contact.** The contact address shows as plain text with a working email link, and the page names HealthKit alongside Apple Health. [Privacy](/privacy/#health).

## [1.2.1] - 2026-11-14
### Changed
- **Privacy.** How the Apple apps use your calendar (they read it, and write only when you add an event yourself), that Health access is read-only, and that each permission is asked only when a feature first needs it. [Privacy](/privacy/#permissions).

## [1.2] - 2026-11-14
### Added
- **Docs.** A docs section with a sidebar and search: getting started, the alarm clock (the launch alarm, the briefing, Goodnight, the sleep schedule), everything you can add with its status, every setting with its default and where to find it, what each screen shows, things to try, troubleshooting and requirements. [Read the docs](/docs/).
- **Privacy.** No data collected: what each app and the hub talk to, where your data lives, Apple Weather attribution, the Apple Health statement and a contact address. Effective 14 November 2026. [Privacy](/privacy/).

### Changed
- **Alarm clock first.** The home page leads with “A better alarm clock, on every screen you own.”, then how Flight Day grows into your whole home dashboard and day planner. Features and the docs follow the same order, and every addition is marked with its status: Live, In development or Concept.
- **Launch kit.** The one-paragraph description leads with the alarm clock, and the name rules gain a headline row.
- **Navigation.** Docs is in the top bar; Docs and Privacy are in the footer.
- **Go / No-Go.** Mentions of the planned briefing verdict use the design’s own example lines and are labelled Concept.
- **Changelog.** The roadmap links here, and the site is now released in batches, each with a dated entry on this page.

### Fixed
- **Claims that weren’t built yet.** Double tap to snooze on Apple Watch is now marked as in development, and snoozed screens no longer claim to show snoozes left.
- **A location hint.** A home-page card no longer shows which direction launches are visible from home.

## [1.1] - 2026-11-14
### Added
- **Clips recorded from the real app.** Seven short, muted, looping clips: the launch alarm from countdown to briefing, Snooze and Back to bed on a TV, Goodnight and the night screen, Smart Comfort, the Space globe, ambient with a LOOK UP card, and the iPhone alarm. Each is labelled “Recorded from the real app (sample data)”. They play when they scroll into view; with Reduce Motion on, they wait on their poster until you press Play. Downloads are in the [launch kit](/press/#clips).
- **Family.** A family line in the footer, and a Family section in the [launch kit](/press/#family).
- **App Store name.** A launch-kit row for the App Store listing’s name, “Flight Day – Launch Control”.
- **This changelog.**
- **Sign-in callback.** The home page declares the apps’ sign-in callback address (`flightday://auth-callback`).

### Changed
- **Every grid has full rows** on desktop, tablet and phone: feature cards, devices, the gallery, launch-kit downloads, colours, screenshots and the page contents. The features page now has eight sections, with Wake up and Goodnight and the night screen as separate sections.
- **Livelier motion.** The Daybreak Ascent mark rises and draws itself, a sample alarm counts down in the hero, sections ease in as you scroll, and cards, buttons and links respond to hover and focus. All of it is off with Reduce Motion.

### Fixed
- **Privacy masks on five screenshots.** The panel Home, House and Night shots no longer show a background credit that named a bundled wallpaper. The panel and iPad Space shots no longer show the next ISS pass, the local weather or a “visible from home” label, which together hinted at where the home is. Their captions say what was removed.

## [1.0] - 2026-11-14
### Added
- **flightday.app goes live.** Home, features, roadmap and the launch kit, in dark and light.
- **Labelled screenshots.** Every image says whether it is Real or Sample data, and what was edited.
- **A strict, first-party site.** No trackers, no third-party scripts or fonts, and a content security policy that allows only this site’s own files.
