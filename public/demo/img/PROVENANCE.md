# Demo image provenance

Generated from canonical web/img/PROVENANCE.md. Asset paths are relative to the demo bundle root. First-party illustrations retain their adjacent ORIGINALS.json.

```json
{
  "schema": "flightday.asset-provenance/v1",
  "assets": [
    {
      "asset": "v/bb1c4064378025e1de36/img/earth-day.jpg",
      "sha256": "9b89238783cd170f558e8272e68fbd8bd14ab1c1f0256f8246c79a8c035a856d",
      "source_url": "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x5400x2700.jpg",
      "terms_url": "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      "licence": "NASA public domain (United States); NASA media usage guidelines",
      "credit": "NASA / NASA Earth Observatory; Reto Stöckli",
      "fetched_utc": "2026-11-14T21:59:00.653800+00:00"
    },
    {
      "asset": "v/bb1c4064378025e1de36/img/earth-night.webp",
      "sha256": "b7a293fcb0c36a028fae34757fd1ec814affabfb886639b71a8eb9cd2332f938",
      "source_url": "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg",
      "terms_url": "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      "licence": "NASA public domain (United States); NASA media usage guidelines",
      "credit": "NASA / NASA Earth Observatory; Joshua Stevens; Suomi NPP VIIRS data from Miguel Román, NASA GSFC",
      "fetched_utc": "2026-11-14T22:06:54.803672+00:00"
    },
    {
      "asset": "v/bb1c4064378025e1de36/js/wallpaper/earth.webp",
      "sha256": "2bba0e48a919223e07c5d9ce2b266b17a95132620cef2984d43a31d80e01a55e",
      "source_url": "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x5400x2700.jpg",
      "terms_url": "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      "licence": "NASA public domain (United States); NASA media usage guidelines",
      "credit": "Generated Flight Day scene; NASA / NASA Earth Observatory; Reto Stöckli",
      "fetched_utc": "2026-11-14T21:59:00.653800+00:00",
      "derivation": "Original generated globe poster using the existing NASA Blue Marble texture; source fetch time inherited from that texture record. Processing documented in web/js/wallpaper/PROVENANCE.md."
    },
    {
      "asset": "v/bb1c4064378025e1de36/js/wallpaper/stars.webp",
      "sha256": "588f5c35078386a32a211f2b49d1254ee9abab84c022fe3071344cc23a719108",
      "source_url": "https://raw.githubusercontent.com/astronexus/HYG-Database/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/hygdata_v41.csv",
      "terms_url": "https://raw.githubusercontent.com/astronexus/HYG-Database/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/LICENSE",
      "licence": "CC-BY-SA-4.0 (HYG data adaptation and generated derivative)",
      "credit": "Generated Flight Day star field; HYG database by David Nash (astronexus), CC BY-SA 4.0",
      "fetched_utc": "2026-11-15T00:23:31.343Z",
      "derivation": "Generated scene poster from the pinned HYG 4.1 subset. fetched_utc is the documented upstream data fetch; this asset is a generated derivative, not a downloaded photograph. Processing documented in web/js/wallpaper/PROVENANCE.md."
    }
  ]
}
```
