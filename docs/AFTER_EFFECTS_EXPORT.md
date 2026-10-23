# After Effects export feasibility — 2026-10-23

**Feasible; not implemented in v0.7.0.** The recommended first interchange is an ExtendScript `.jsx` plus rendered map media and a JSON manifest, rather than writing an `.aep` file directly. Adobe documents running `.jsx` through File > Scripts > Run Script File: [Scripts in After Effects](https://helpx.adobe.com/ca/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html).

## Proposed export package

1. A full-resolution map background sequence (existing PNG export) or video. This preserves tiles, labels, perspective and attribution without trying to recreate MapLibre inside AE.
2. `project.json`: composition width/height/fps/duration, map samples, layer identities and supported keyframes. Preserve the original geographic coordinates as metadata.
3. `import-mapanimator.jsx`: create a composition, import background footage and construct editable overlay layers. Supported first targets would be pin nulls/text, route shapes with Trim Paths, and polygon shape layers.
4. Native AE keyframes with separate interpolation and `KeyframeEase` speed/influence where the values are directly convertible. Bake projected screen-space transforms per frame when the map camera changes nonlinearly; do not claim original geographic curves map exactly onto screen-space curves.

Adobe's current [Property API](https://developer.adobe.com/after-effects/uxp/after-effects-api/property) and [KeyframeEase API](https://developer.adobe.com/after-effects/uxp/after-effects-api/keyframeease) document time-based values and temporal ease. Those current pages describe UXP (minimum versions shown there); implementation in JSX must use/test the corresponding ExtendScript API for the user's installed AE version. Adobe explains [keyframe interpolation](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animation-keyframes/keyframe-interpolation.html) and [speed/influence / Easy Ease](https://helpx.adobe.com/mena_en/after-effects/desktop/animate-in-after-effects/speed-between-keyframes/speed.html).

## Conversion boundaries

- Longitude/latitude are geographic coordinates, not AE Position pixels. Project coordinates through the same MapLibre camera at each sampled time, scaling from preview dimensions to export dimensions. Static-camera shapes can remain compact editable paths; moving/pitched/rotated-camera paths can require baked shape keys.
- Map zoom is not directly AE Scale, and map pitch/bearing is not a drop-in AE Camera reconstruction. A rendered background is the reliable initial visual reference.
- Scalar properties that retain units can use native temporal curves; convert influence fraction to percent. Projected positions need converted velocity units or sampled keys. Upstream temporal semantics align well but do not prove a lossless full-scene round trip.
- Route reveal fraction can correspond to Trim Paths End percent only after matching path direction, segment order and distance parameterization; MapAnimator's geographic-length approximation is not automatically identical to AE's screen-path length.
- Transparent overlays must be exported separately from the map if editable reconstructed layers are included, preventing duplicates. Keep provider/data attribution with the visual export.
- Font availability, geographic clipping, label layout, multipolygons, long routes and coordinate wrap require explicit tests in AE. Native AE project generation and live bidirectional synchronization are separate future features.

## Suggested next validation

Export a tiny scene with a camera move, one labeled pin and one revealing route. Run the JSX in the actual installed After Effects, compare sample frames and edit the imported keys. No After Effects project/script was created or executed as part of this feasibility check, and no AE import compatibility is claimed yet.
