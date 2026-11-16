# Flight Day site

Flight Day is free and open source (Apache-2.0). It is in development. This repository contains its static website.

Fully free at launch. In development, aiming for 8 Dec: web/Android and iPhone first. Apple TV, Mac and Watch are coming after launch.

The single planned public API is **Flight Day API 1.0**: the model and five calls, with a one-page guide and demo-house checks in development. Hub HTTP and client internals stay private. Agent control is a separate contract, planned for Labs after launch.

The core covers the first day on a device and device integrations under safety rules. Builder desk and Continue training are planned as first-party packages. AI brief, Flight Plan and Smart Comfort stay built in, off by default in Labs.

[Flight Day source](https://github.com/CollinCraig/flightday) · [Website source](https://github.com/CollinCraig/flightday-site)

- [Source fragments](src/)
- [Static site files](public/)
- [Build and validation tools](tools/)

Serve `public/` with a static HTTP server. The page builder is `python3 tools/build-pages.py`; the site checker is `node tools/check-site.mjs`. Some maintenance tools depend on separately configured services or source inputs. Read their configuration before running them. Keep credentials and personal configuration outside this repository.

Code is licensed under [Apache-2.0](LICENSE). Third-party materials retain their own terms; see [NOTICE](NOTICE). Brand assets require separate permission.
