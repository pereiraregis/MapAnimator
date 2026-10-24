# Changelog

## v0.9.0 — 2026-10-24

- Keep timeline transport/menus fixed, with separate scrolling for tracks and inspector; group editing/interpolation/time/preset/view controls into compact menus.
- Add a resizable property column with live values, fit-selection, cursor-anchored wheel/gesture zoom, adaptive ruler and absolute frame counter.
- Add editable native motion presets: fade in/out, pin pop, pin pulse and route draw, with single-step undo and preservation of keys outside the effect interval.
- Add proportional duration changes with temporal speed scaling, layer sequencing/alignment at the playhead and Shift-click group selection. Reject collisions, bounds violations and locked edits atomically.
- Add draggable preview-range handles and B/N shortcuts; reset preview range when composition duration changes.
- Validate with 131 Rust tests, 68 JavaScript tests, compiled WASM sampling and production build. Real-browser visual/WebGL/media validation remains blocked by the CUA volume E: initialization failure.


## v0.8.0 — 2026-10-23

- Add Rust layer/property tracks for pins, geographic features and route styling, with stable property identities and saved layer animation.
- Add layer visibility, locking, bar dragging, in/out trimming, animated-only filtering and native EffectCraft key time reversal. Reuse upstream egui bar/trim helpers alongside existing unmodified keyframe/time crates.
- Animate pin coordinates/opacity/scale/rotation and feature/route colors, opacity and sizes. Manual edits to animated pins update the current key; object-only animations preserve the camera.
- Share a compiled scene sampler for preview/export, preserve frozen values after deleting the last key, and read direct native snapshots when saving/exporting. Reapply MapLibre feature states after style changes.
- Validate with 120 Rust tests, 68 JavaScript tests, two 91-frame compiled WASM sampling flows and production build. Browser visual/media verification remains blocked by CUA volume E: initialization failure. See docs/VALIDATION.md.


## v0.7.0 — 2026-10-23

- First Rust migration stage: the active timeline is an egui canvas compiled to WebAssembly; map and surrounding UI remain MapLibre/React.
- Reuse unmodified EffectCraft time/geometry/color/keyframe modules, with pinned source hashes and MIT notices. Actual Rust evaluation supports independent temporal sides, velocity/influence and Auto/Continuous Bézier.
- Rust command/history model, property capture, frame/magnetic snapping, group drag, rectangle selection, clipboard, context menus, transport and value/speed graphs with draggable temporal handles. Key/curve gestures create one undo entry; cancellation restores the original document.
- Native key metadata persists in existing scene files. Preview and PNG/MP4 await/use the compiled Rust sampler; route preparation preserves native camera keys while resetting route reveal interpolation.
- Reproducible Rust/WASM build and real-binary smoke checks, core and headless egui event tests, and React bridge tests. Source adaptation/provenance and distributed dependency/font licenses included.
- Document future Tauri reuse and After Effects JSX export feasibility/projection limits. No desktop package or After Effects exporter in this stage.


## v0.6.0 — 2026-10-23

- Replace aggregate view diamonds with six independent property tracks, preserving existing scene animation. Property-only capture, timing, values and interpolation share a sampler across preview, export and Theatre conversion.
- Multi-key/group dragging, Shift selection, rectangle selection, frame nudging, eight-pixel magnetic snapping, property filtering and playhead-anchored zoom. One gesture is one undo step; same-property move collisions are rejected.
- Copy/paste with relative timing and destination replacement, duplication at the playhead, selection/deletion and timeline-scoped keyboard shortcuts. Value/time inspector and key context menu.
- Easy Ease with incoming/outgoing variants, docked per-property Bézier editing and value/absolute-speed graphs. Local preview range and looping; exports retain full duration.
- Route preparation preserves independent camera keys. Unkeyed camera properties retain their actual values during first capture/paste; deleting a property's last key freezes it at the current value.
- Record EffectCraft source references and include its MIT notice for the adapted magnetic snapping helper.


## v0.5.1 — 2026-10-23

- Restore route reveal workflow with an explicit Animate Route command that prepares 0%/100% view keys, retaining existing camera view values. Captured views now use the current route progress.
- Hide the imported static LineString when activating it as an animated route, including updates while map sources are loading.
- Keep route progress when changing color/width, editing vertices or rebuilding map styles. Empty and single-point routes use valid empty GeoJSON; repeated vertices no longer produce NaN and the final 1% no longer snaps to completion.
- Route vertex editor: drag vertices and midpoint handles, insert/delete points, apply exact numeric coordinates, frame the route, and undo/redo geometric edits. Release outside the canvas finishes dragging; blur cancels it and restores map pan.
- Editing overlays are omitted from frame capture and return after export. Saved scene files retain edited route coordinates and animation keys.

## v0.5.0 — 2026-10-23

- Draggable view keyframes with frame snapping, multi-selection, duplication at the playhead, deletion, undo/redo, keyboard nudging, timeline zoom and a resizable dock.
- Docked cubic Bézier editor with pointer/keyboard handles and numeric inputs; custom curves and hold interpolation persist in scenes and drive preview/export.
- Explicit conversion of view animation to native Theatre.js camera/route tracks. Native Tween and per-property graph editor available; docked transport also previews native tracks. Original view keys remain available in a separate mode.
- Local catalog of 177 Natural Earth country/territory polygons, with Portuguese/English/code search. Explicit Nominatim polygon search for city/region boundaries.
- Independent fill/outline styles and highlight/outline-only/solid presets.
- Auto-width pin labels, city callouts with leader/target, rounded tags, visibility, framing, duplication, font size, border and opacity.

## v0.4.1 — 2026-10-22

- Rebuild custom layers after basemap changes instead of losing pin, route and feature sources during style diffing.
- Generate pin images synchronously with stable display density, tight bounds and offset labels below the anchor. Avoid asynchronous edits overwriting newer values.
- Pin dragging locks camera pan and finishes when releasing outside the canvas; restored scenes add pins without duplicating state.
- Pin inspector now includes add/delete, text, color and coordinates.
- Move dynamic provider credits out of the scaled map preview into the editor footer. Exported frames keep provider attribution.

## v0.4.0 — 2026-10-22

- Replaced floating windows with a docked workspace: controls/export on the left, central composition preview, feature/pin/help inspector on the right, bottom timeline and status bar.
- Responsive single-pane workspace at narrow widths; toolbar navigation between controls, map and elements. Sidebars and timeline can be hidden without overlaying the composition.
- Search moved to the map toolbar at readable UI size. Canvas fitting responds to dock changes with ResizeObserver while preserving export aspect ratio.
- Timeline ruler, clickable view diamonds, playhead, timecode and frame stepping. Hiding the timeline preserves playback and playhead state.
- Keyboard shortcuts for playback, capture, frame/view navigation, drawing, pins, framing, north, save/open, workspace focus and help. Text/value editing, IME composition, browser modifier shortcuts and render operations are protected.
- Removed the floating Theatre UI entry point; existing Theatre project state and legacy export remain supported. New animation editing uses the docked camera timeline.

## v0.3.0 — 2026-10-22

- Geographic feature browser with GeoJSON import, selection, per-element styles, visibility, labels, framing and export.
- Camera timeline with timed view capture, scrubbing, preview playback, four easing options and route-progress keys. Longitude and bearing interpolate along the shortest angular path. Preview and export share the same sampler.
- Basemap visibility controls for labels, roads and buildings; optional background/water colors; custom HTTPS MapLibre style URLs.
- CSV/TSV point import with explicit longitude, latitude, label and optional numeric-value mapping. Proportional point sizes, quoted fields, escaped quotes, BOM and comma/semicolon/tab delimiters supported.
- Versioned projects include Theatre state, camera waypoints, basemap appearance, features, styles, pins and route. Existing v1 scene files remain compatible.
- Fixed canvas aspect ratio, route-style updates, restored pin rendering, export frame count and attribution, geocoder submission/queue/cache, and Express 5 fallback routing.
- This is a browser map-animation editor. Native AE layers, terrain/DEM, road routing and full GEOlayers parity are still future work.

Sample CSV values are illustrative; use your own verified data for production.
