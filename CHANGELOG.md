# Changelog

## v0.3.0 — 2026-10-22

- Geographic feature browser with GeoJSON import, selection, per-element styles, visibility, labels, framing and export.
- Camera timeline with timed view capture, scrubbing, preview playback, four easing options and route-progress keys. Longitude and bearing interpolate along the shortest angular path. Preview and export share the same sampler.
- Basemap visibility controls for labels, roads and buildings; optional background/water colors; custom HTTPS MapLibre style URLs.
- CSV/TSV point import with explicit longitude, latitude, label and optional numeric-value mapping. Proportional point sizes, quoted fields, escaped quotes, BOM and comma/semicolon/tab delimiters supported.
- Versioned projects include Theatre state, camera waypoints, basemap appearance, features, styles, pins and route. Existing v1 scene files remain compatible.
- Fixed canvas aspect ratio, route-style updates, restored pin rendering, export frame count and attribution, geocoder submission/queue/cache, and Express 5 fallback routing.
- This is a browser map-animation editor. Native AE layers, terrain/DEM, road routing and full GEOlayers parity are still future work.

Sample CSV values are illustrative; use your own verified data for production.
