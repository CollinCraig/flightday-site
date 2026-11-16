# Generated scene sources — FE-W16

All scene rendering and posters are original Flight Day work; no agency endorsement.
Posters are generated 1920×1080 WebP stills, not photographs or observations.

## HYG v4.1 (CC BY-SA 4.0)

Canonical shared bytes: `fixtures/wallpaper/stars-hyg-v4-mag5.json` at repository root. See its adjacent PROVENANCE.md, LICENSE-DATA (full text) and NOTICE, and public generator `tools/build-stars-hyg.cjs`.

Web copy is produced without modification by `tools/copy-wallpaper-fixture.cjs`; it is gitignored and included in static/Android assets. The loader verifies SHA-256 before use. Verification failure uses a deterministic generated field, credited `Generated · Star field (not the real sky)`.

Credit: Generated · Tonight's sky, HYG star data (CC BY-SA 4.0).
Notice: Star data: HYG database by David Nash (astronexus), CC BY-SA 4.0, adapted: subset to magnitude 5.0.

Yale BSC is not bundled or claimed public domain. HYG's adaptation is separately licensed from app code. The JSON, full licence and generator must be included in unrestricted public parallel distribution; no publication is performed by this ticket.

## Algorithms and existing live inputs

- Solar elevation/azimuth: NOAA General Solar Position Calculations, https://gml.noaa.gov/grad/solcalc/solareqns.PDF (US government equations); leap-year fractional year, UTC/east-positive longitude. No network at render time.
- Sidereal time: Julian-date GMST; J2000 catalogue coordinates. Lunar Kepler orbit is an approximate visual position and synodic phase, not a navigation ephemeris. No claims of observatory precision.
- Earth texture: existing NASA Blue Marble `img/earth-day.jpg`; see ../../img/PROVENANCE.md for its licence/hash. Original lightweight WebGL sphere shader. ISS uses existing space.js orbit/fix only, omitted after 90 minutes; credit includes source and fix time.
- Weather: existing role-ordered cached weather, current freshness limit 90 minutes; stale observations never drive precipitation. Demo credits say Sample data. No new weather or ISS endpoints.
- Sky/weather credits: Generated · Sky now, sun from your location; Generated · Weather now, {source} as of {ISO timestamp}. Missing location/data is explicitly labelled.
- No videos, video URLs, downloads or video licences ship in FE-W16. FE-W17 owns verified pack playback.

## Bundled posters

Original scene renders at 1920×1080, demo time 2026-11-14T17:00Z, home 40° N / 100° W. Captured through the authorised heavy-job gate, converted PNG → WebP with ImageMagick quality 72, no resize except enforcing 1920×1080. Star poster uses HYG data (CC BY-SA 4.0 adaptation); NASA Earth texture attribution above applies to Earth poster. Other posters are original generated art.

| Output | Bytes | SHA-256 |
|---|---:|---|
| sky.webp | 4370 | 9172643a35396bdc318513cb436f90e75448c51fe6f27ebd11c37736993e1236 |
| stars.webp | 5948 | 588f5c35078386a32a211f2b49d1254ee9abab84c022fe3071344cc23a719108 |
| earth.webp | 22838 | 2bba0e48a919223e07c5d9ce2b266b17a95132620cef2984d43a31d80e01a55e |
| weather.webp | 4120 | 663ce76ae01deb3430b847aefda30588f72be38ac2745487c545cdbff1ebdbd8 |

## Guard record (NASA-derived poster)

`earth.webp` is not first-party: it is a render of the globe using the NASA Blue Marble texture, so it is recorded here and never in ORIGINALS.json. `fetched_utc` is the upstream texture fetch, inherited from `../../img/PROVENANCE.md`; it is not a capture time.

```json
{
  "schema": "flightday.asset-provenance/v1",
  "assets": [
    {
      "asset": "earth.webp",
      "sha256": "2bba0e48a919223e07c5d9ce2b266b17a95132620cef2984d43a31d80e01a55e",
      "source_url": "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x5400x2700.jpg",
      "terms_url": "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      "licence": "NASA public domain (United States); NASA media usage guidelines",
      "credit": "Generated Flight Day scene; NASA / NASA Earth Observatory; Reto Stöckli",
      "fetched_utc": "2026-11-14T21:59:00.653800+00:00",
      "derivation": "Generated globe poster (WebGL sphere shader, tools/capture-wallpaper.cjs then tools/verify-wallpaper-gated.sh) using the bundled NASA Blue Marble texture web/img/earth-day.jpg (sha256 9b89238783cd170f558e8272e68fbd8bd14ab1c1f0256f8246c79a8c035a856d)."
    }
  ]
}
```
