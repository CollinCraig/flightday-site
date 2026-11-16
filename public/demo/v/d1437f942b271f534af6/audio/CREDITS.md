# Audio credits

Sounds bundled with the app (played by the configured screen during the launch alarm). The sleep sound itself
(`thunderstorm.mp3`) is not bundled; it is served by Home Assistant from `/local/sleep/`.

| File | What it is | Source | Licence |
|---|---|---|---|
| `liftoff.m4a` | Falcon 9 liftoff (NASA's SpaceX Crew-12, 13 Feb 2026, SLC-40) recorded by NASA's causeway microphone. Cut: about 80 s from the moment the sound arrives; low-passed at ~420 Hz so it is a rumble, 9 s fade-in, 34 s fade-out. | NASA Image and Video Library, asset `KSC-20260213-AU-LMM01-0001-SpaceX_Crew_12_Live_Launch_Coverage_Beach_Causeway-M19013` ("NASA's SpaceX Crew-12 Live Launch Coverage - Beach (L) Causeway (R)"), right channel, from 2:02:34. https://images.nasa.gov/details/KSC-20260213-AU-LMM01-0001-SpaceX_Crew_12_Live_Launch_Coverage_Beach_Causeway-M19013 | NASA media, public domain (NASA media usage guidelines) |
| `morning.m4a` | Morning birdsong: a flock of house sparrows, pigeons and other birds (recorded 1 March 2007, 07:30). Whole recording (2 min 55 s), gently low-passed at 6.5 kHz, short fades so it loops. | "Réveil des oiseaux" by Joseph Sardin, Wikimedia Commons: https://commons.wikimedia.org/wiki/File:R%C3%A9veil_des_oiseaux.ogg | CC0 1.0 (public domain dedication) |

How they were cut: `tools/audio/make.py` (standard-library Python; decode and encode with macOS `afconvert`).
`tools/audio/scan.py` prints a recording's loudness over time, which is how the liftoff was found in the
two-hour NASA file.

14 Nov 2026: `morning.m4a` uses deterministic quiet-boundary gaps (`tools/audio/space-birds.py`),
174.88 → 282.06 seconds: 38% fewer calls per minute, same voices/pitch/source level. Morning loop
overlap is disabled. The original can be regenerated from the credited CC0 recording and make.py.

Demo-only `demo-rain.wav` and `demo-thunderstorm.wav` are owned procedural noise textures, generated deterministically by `tools/make-demo-sleep-audio.cjs`. They contain no recordings or third-party media. The demo plays these locally; it never requests the real Home Assistant sleep files.

- `quindar.wav` / `quindar.m4a`: original Flight Day synthesised notice tone, owned and licensed by the project. Master, CAF and generator: `../../fixtures/audio/` and `../../tools/generate-quindar.py`. No recording was sampled.

- Flight Day A2+ app sting: first-party synthesis; Apache-2.0 (project licence). Source and measurements: flightday-site/video/promos/logo/app-sting/app-sting.json; credits: flightday-site/video/AUDIO-CREDITS.md, App sting.
