# Flight Day site

Flight Day is in development and going open source. This repository contains its static website.

- [Source fragments](src/)
- [Static site files](public/)
- [Build and validation tools](tools/)

Serve `public/` with a static HTTP server. The page builder is `python3 tools/build-pages.py`; the site checker is `node tools/check-site.mjs`. Some maintenance tools depend on separately configured services or source inputs. Read their configuration before running them. Keep credentials and personal configuration outside this repository.

Code is licensed under [Apache-2.0](LICENSE). Third-party materials retain their own terms; see [NOTICE](NOTICE). Brand assets require separate permission.
