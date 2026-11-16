# HYG star data adaptation

- Maintainer: David Nash (astronexus), official HYG-Database repository.
- Version: 4.1; exact commit: c7f7f883fe678cc7680169a50ccd7dcc49b060ce.
- Exact source: https://raw.githubusercontent.com/astronexus/HYG-Database/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/hygdata_v41.csv
- Licence declaration: https://raw.githubusercontent.com/astronexus/HYG-Database/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/LICENSE; SHA-256 f404190403d31e0ce7223f4cb7af954485ad88077358330754dc5c892a856627.
- Fetch UTC: 2026-11-15T00:23:31.343Z.
- Input bytes: 33932548; input SHA-256: d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd.
- Rule: exclude Sol (id 0), select finite magnitude <= 5.0; keep id, RA (hours converted to degrees, rounded to 6 decimals), Dec (degrees), magnitude, colour index, proper name and Bayer designation with constellation. Missing optional fields are null. Sort by numeric HYG id. J2000 positions; no precession or proper-motion update.
- Output: 1637 stars, 160265 bytes. SHA-256: 7dc7c7985a91d01fb05df189174aef620f0c5f19a045655c6f314da2bfccfa8b.
- Data adaptation: CC BY-SA 4.0; full text in LICENSE-DATA. Code remains separately licensed.
- Public parallel distribution must include this JSON, LICENSE-DATA, NOTICE, PROVENANCE.md and tools/build-stars-hyg.cjs. Store packaging does not restrict these separately available data bytes.
- Credit: Generated · Tonight's sky, HYG star data (CC BY-SA 4.0).
- Notice: Star data: HYG database by David Nash (astronexus), CC BY-SA 4.0, adapted: subset to magnitude 5.0
- No endorsement by the catalogue maintainers.
