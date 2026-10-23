# Motion and geography references — v0.5.0

## Primary references

- [GEOlayers 3 product and feature reference](https://aescripts.com/geolayers/): online feature discovery, drawing feature geometry, labels, map styling and camera animation.
- [GEOlayers official help](https://github.com/GEOlayers/Help): feature browser, geographic features and labeling workflows. The implementation here is independent and uses the existing MapAnimator codebase.
- [Theatre.js sequences](https://www.theatrejs.com/docs/latest/manual/sequences): keyframe retiming, selection, native Tween, custom cubic Bézier and multi-track graph editing.
- [Theatre Studio API](https://www.theatrejs.com/docs/latest/api/studio): public show/hide, selection, save-state and core sequence APIs. The installed 0.7.2 exported TypeScript declarations define the 0.4.0 on-disk track schema used by the explicit converter.
- [Nominatim search API](https://nominatim.org/release-docs/latest/api/Search/): GeoJSON polygon output (`polygon_geojson=1`) and simplification (`polygon_threshold=0.001`). Search is submitted explicitly, cached and serialized through the same queue as normal geocoding; timeout 20 s, response limit 10 MB.
- [Natural Earth source](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson) and [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/). Retrieved 2026-10-22. The bundled catalog retains geometry, Portuguese/English names, ADM0_A3 code and label coordinates. The source contains 177 features; these are countries and territories, not a complete high-resolution administrative database.

## Modes and limits

The docked view timeline animates six channels together with a shared outgoing curve. Native Theatre exposes independent tracks and its original Studio panels only on explicit request. Conversion saves and reloads the complete scene, replaces native Map tracks, and preserves original view keys; switching back does not reverse-convert native changes. Both modes remain in saved scene files and the active mode selects the export sampler.

The docked graph shows normalized transition progress against time, rather than claiming to plot actual per-channel velocity. The native graph provides the library's property-specific editing. Retiming cannot overwrite another key; collisions reject the move. Undo history is per session and limited to 50 steps. Keys beyond a shortened export duration remain saved.

Country geometry is generalized for world-scale maps. Municipal geometry depends on OSM coverage and the geographic meaning returned by the provider. Use qualified place names, review results and import a higher-resolution GeoJSON when needed. The shared provider limit across all app users still requires a hosted proxy or a suitable provider at production scale.

This release does not implement AE integration, a complete GEOlayers clone, animated pin properties, route routing, terrain, multi-layer compositing or custom image-marker assets. Polygon labels use dataset label coordinates where supplied and otherwise a draggable bounding-box-center placement.
