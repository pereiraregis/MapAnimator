# Map Animator V2

**Current release: v0.7.0 — Rust timeline migration, stage 1.** [Open the editor](https://pereiraregis.github.io/MapAnimator/) · [Changelog](CHANGELOG.md)

### Rust / egui timeline (v0.7.0)

The active timeline now runs in **Rust + WebAssembly**, using the actual EffectCraft keyframe/time modules. The map and surrounding workspace remain MapLibre/React. Keyframe interpolation, velocity/influence, Auto/Continuous Bézier, commands and undo are handled by the Rust animation editor. The egui panel provides tracks, drag/marquee, transport, context menus and draggable temporal curve handles.

Use **K** to capture a camera view, or **◇** beside a property to key only that track. Shift-click or drag a rectangle to select; drag keys to retime. **G / Graph Editor** opens value/speed graphs and independent incoming/outgoing velocity/influence. **F9** is Easy Ease, **Shift+F9** incoming and **Ctrl/Cmd+Shift+F9** outgoing. Expand the timeline or scroll its canvas to reach the graphs. Copy/paste and undo are owned by the canvas while focused.

Preview and PNG/MP4 export use the same compiled Rust sampler. Saved scenes retain native key metadata; existing scenes migrate on load. Keep a backup if reopening in an older release, which cannot reproduce native curves. Map camera/reveal bounds still clamp output. The preview work area does not trim export duration.

This is the first migration stage: pin/polygon layers, spatial path editing in the timeline and the complete EffectCraft compositor are not included. Tauri packaging is planned separately. After Effects export is feasible through JSX plus rendered map media and projected editable overlays; no AE exporter ships yet.

[Architecture, build and migration limits](docs/RUST_MIGRATION.md) · [After Effects export study](docs/AFTER_EFFECTS_EXPORT.md) · [Validation](docs/VALIDATION.md)

### Previous React timeline (v0.6.0, historical reference)

The docked timeline now has independent **Longitude, Latitude, Zoom, Inclinação, Rotação and Revelação da rota** tracks. **K / Capturar vista** keys all six; the diamond beside a property keys only that property at the playhead. Moving a zoom key no longer moves the camera-position or route keys. Existing scenes retain their animation and appear as six aligned tracks.

- Click a key to select it, Shift-click to toggle selection, or drag a rectangle through empty lanes. Click a property name to select its keys. Drag selected keys together; arrows nudge by a frame (Shift: ten frames). One drag creates one undo step. The magnet snaps to the playhead, other keys and timeline bounds within eight screen pixels; Shift enables snapping while dragging even with the magnet off. Same-property collisions are rejected.
- With focus in the timeline, use **Ctrl/Cmd+C / V** to copy/paste at the playhead, preserving relative timing. Buttons provide an internal clipboard too. Paste replaces existing keys at the same property/time; undo restores them. **Ctrl/Cmd+D** duplicates at the playhead, **Ctrl/Cmd+A** selects all, **Delete** removes, and **Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z** undo/redo. Clipboard data can be transferred between MapAnimator tabs.
- Double-click a key to edit its value. The inspector edits value, time and interpolation. **F9** applies Easy Ease to both sides of selected keys, **Shift+F9** to the incoming side and **Ctrl/Cmd+Shift+F9** to the outgoing side. Incoming easing changes the previous key's outgoing segment. A previous Hold segment remains Hold. The context menu exposes copy/paste, easing, Linear, Bézier, Hold and deletion.
- Press **G** for docked Bézier handles and numerical controls for the selected property's outgoing segment. **Valor / Velocidade** display the sampled property value or absolute speed per second. The last key has no outgoing curve. Preview and export share the per-property sampler. Horizontal zoom stays anchored at the playhead.
- **Área de prévia → De / Até / Loop** limits local playback. This session-only preview range does not trim exports: PNG/MP4 still use the full export duration. Theatre mode retains its own transport; converting to Theatre creates independent native tracks.

Implementation and pinned upstream references: [EffectCraft adaptation](docs/EFFECTCRAFT_REFERENCE.md). This adapts its keyframe workflow to the existing React/MapLibre project; it does not implement EffectCraft's full compositor. Bézier handles remain normalized to 0–1; spatial paths, roving/auto tangents and an independent incoming/outgoing velocity dialog are not included. The timeline supports up to 500 distinct keyed times (up to 3,000 scalar keys). [Validation and current limits](docs/VALIDATION.md).

### Docked workspace and shortcuts

The editor now uses fixed workspace regions rather than draggable windows: controls/export on the left, map in the center, elements/pin properties/help on the right, and timeline below. **Controles**, **Mapa** and **Elementos** navigate a single-pane layout on narrow screens. On larger screens, the sidebars can be collapsed to enlarge the preview. Search is in the map toolbar; canvas fitting updates as the available area changes.

| Shortcut | Action |
| --- | --- |
| Space | Play/pause |
| K | Capture a view at the current time |
| Left/Right | Previous/next frame |
| Shift + Left/Right | Back/forward ten frames |
| Home/End | Beginning/end |
| `[` / `]` | Previous/next view |
| D / V | Draw route / select |
| P / F / N | Add pin / frame selected feature / north |
| Ctrl/Cmd + S / O | Save/open project |
| T | Show/hide timeline, preserving playback state |
| Backslash | Collapse/restore sidebars |
| 1 / 2 / 3 | Controls / map / elements |
| ? / Escape | Shortcut help / pause and exit drawing/help |

Typing and number/select/range editing do not trigger unmodified shortcuts. Save/open remain available while editing. Shortcuts are suspended during export. Press **?** for the docked shortcut reference. Press **G** for the docked Bézier editor. The native Theatre Studio is available explicitly through the timeline; its own panels appear only while that advanced editor is open.

### Route animation and fine editing (v0.5.1)

Open **Controles → Rota**. Draw points on the map, then choose **Animar rota** to prepare reveal keys from 0% at the start to 100% at the export duration. Press Space to preview. Existing camera view values are kept; route progress is edited on the Revelação da rota track and shaped through that property’s outgoing curve. The **Revelação** slider previews a fraction and captured views retain that fraction.

Use **Editar pontos** to expose vertices and gray midpoint handles. Drag a vertex to reshape the route; click or drag a midpoint to insert a new point. Select a point in the list for exact longitude/latitude entry and press **Aplicar coordenadas**. **Inserir depois**, **Excluir ponto**, **Desfazer rota**, **Refazer rota** and **Enquadrar rota** support fine adjustments. V exits route editing. The dashed full-path guide is only an editing aid and does not appear in captured export frames.

Activating **Animar rota** on an imported LineString hides the original geographic feature to avoid a static copy covering the reveal. That feature remains in the feature list and can be shown again explicitly. The active editable route and its keys are saved with the scene. This is geometric point editing, without road-network snapping or a routing service.

### Motion editing, curves and geographic areas (v0.5.0)

- Drag timeline diamonds to retime views with frame snapping. Shift selects multiple keys. A drag is one undo step; use the timeline undo/redo buttons or Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z while focused in the timeline. Duplicate selected keys at a free playhead time or delete them. Focused diamonds support arrow-key nudging, with Shift for ten frames. Zoom the timeline to work on short intervals. Drag the upper timeline divider to resize its dock.
- Select a departing key, then press **G / Editor de curvas**. Drag the two Bézier handles or edit X1/Y1/X2/Y2. Linear, smooth, ease-in, ease-out and hold remain available. Since v0.6.0 the docked curve controls only the selected property; the same sampler is used for preview and export.
- **Enviar vistas ao Theatre.js** saves a local scene, converts the six camera/route channels into native Theatre tracks, and reloads into the Studio. Click a segment for Tween or a track graph icon for the native curve graph. Conversion replaces previous native Map tracks and keeps the original view keys. After closing Studio, the docked transport plays Theatre tracks while **Usar vistas na exportação** is off. Turn it on to return to the original view animation; native edits are not reverse-converted into views. Saving a scene preserves both sets. Native Studio retains the library's own panel layout; the default editor and its Bézier graph remain docked.
- Open **Elementos → Países, cidades e regiões**. The local catalog contains 177 Natural Earth country/territory features with Portuguese names. Search for Brasil/Portugal/ISO code and choose **Preencher**. For municipal or regional boundaries, use **Cidade / região**, enter a qualified name and explicitly submit. Results with actual polygon geometry can be added, colored, outlined and labeled. Nominatim availability and returned administrative definitions vary.
- Selected polygons have independent fill and outline switches/colors plus highlight, outline-only and solid presets. These styles survive save/reopen and basemap changes.
- The Pin tab lists all pins with visibility and framing. New city callouts use a leader, target dot and rounded text box. Labels expand with text width. Presets, font size, border, opacity, coordinates, duplication and the existing drag controls are available.

Country catalog data is generalized **Natural Earth 1:110m**, suitable for world-scale graphics rather than close-up borders. See [implementation references](docs/MOTION_AND_GEOGRAPHY.md).

### Camera timeline and map styling

Use the bottom timeline to capture the current camera at 0 seconds, enter another time, move the map and capture again. Select an easing curve for each departing view and use **Reproduzir** or the scrubber to preview. **Usar vistas na exportação** sends that same animation to PNG/MP4; disable it to use the existing Theatre Studio animation. Each view also stores `pathProgress` (0–1), so route reveals can run alongside camera moves. Capturing a full view replaces all six keys at that time; capturing one property replaces only its key.

Expand **Estilo do mapa-base** to toggle map labels, roads and buildings, override water/background colors or load a custom HTTPS MapLibre style JSON. Visibility groups use layer/source names and apply best to the bundled OpenFreeMap styles; arbitrary providers may use different naming. Raster basemaps cannot expose these individual vector controls.

Use **Dados CSV / TSV** to import point datasets. Confirm longitude and latitude columns, optionally select a label and numeric value for proportional marker size. Coordinates require decimal points. [Sample CSV](client/public/examples/cities.csv) is included. Imported values and styling are retained in saved projects.

## Geographic editing update

The existing React + MapLibre + Theatre.js editor now includes:

- A geographic feature browser: import WGS84 GeoJSON points, lines, polygons and multi geometries; filter, select, frame, hide and delete elements.
- Per-feature color, opacity, outline width and point radius, preserved when switching basemaps.
- Labels from selected features and conversion of a LineString into the animated route (the **Rota** value on each camera view).
- Numeric longitude, latitude, zoom, pitch and bearing controls. Use **K / Capturar vista** to record the current camera in the docked timeline.
- **Salvar projeto** downloads a versioned JSON file containing map settings, camera, pins, route, feature styles and Theatre timeline, and stores a browser-local copy. **Abrir arquivo** or **Reabrir local** replaces the scene and reloads the editor. Save the current scene first.
- Provider attribution in the editor footer and composited into exported frames. Geocoding runs on Enter with a session cache and request queue.

See [the reference research and implementation roadmap](docs/GEOLAYERS_RESEARCH.md) for official documentation, a capability comparison with GEOlayers 3, limitations and the path toward an independent After Effects bridge. This remains a browser application; it does not yet generate native After Effects layers or 3D terrain.

### Try the feature workflow

1. Click **Exemplo** in the geographic panel to load sample point, line and polygon features near São Paulo.
2. Select an element and edit its style, create a label, or frame it on the map.
3. Select the example LineString and click **Animar rota**. Set **Rota** to 0 on the first captured view and 1 on the final view.
4. Save the project and reopen it to continue editing the same timeline.

GeoJSON exports preserve source properties. Save a MapAnimator project to retain styles and visibility. Files are validated before import (10 MB and 5000 features per GeoJSON). GeometryCollection and projected coordinate systems are not supported. Country labels use Natural Earth label coordinates where available; other polygon labels use bounding-box centers; drag the label if necessary. Framing across the antimeridian needs further work.

Public Nominatim is appropriate only for moderate usage. The local request queue cannot enforce the provider's aggregate application-wide limit across users. A production rollout with more users needs a shared limiter or a suitable provider. The compatible search endpoint can be changed through the localStorage key `mapanimator.geocoder`.

A premium, web-based tool for creating, animating, and exporting high-quality cinematic map sequences. Built with React and designed for seamless keyframe-based animation and high-performance WebGL map rendering.

## Features

- **Keyframe Timelines**: Fully integrated with Theatre.js for professional-grade animation sequencing. Animate camera position, zooming, pitching, and bearing effortlessly.
- **Native WebGL Pins**: Add draggable, customizable pins (icons, colors, labels, shadows, and scalable texts) that hook directly into the MapLibre GL JS symbol layers.
- **Docked Workspace**: Controls, map, element/pin inspector, help and timeline occupy fixed regions with independent scrolling.
- **Draw Routes**: Instantly draw animated route paths using highly accurate GeoJSON rendering.
- **High-Performance Exporting**: Run complex video exports entirely in your browser using WebAssembly (`ffmpeg.wasm`). Export MP4 videos or sequential PNG ZIP packages.
- **Camera Capture**: Press K to capture the map at the current playhead time and Space to preview the animation.
- **Multiple Styles**: Select between OpenFreeMap styles (Dark, Bright, Positron, Liberty). Terrain integration is planned.
- **Search & Geocoding**: Search for anywhere in the world and instantly jump your camera to that location.

## Technologies Used

- **React 18** - Frontend framework.
- **MapLibre GL JS** - Open-source map rendering engine.
- **Theatre.js** - Cinematic animation timeline and state manager.
- **FFmpeg.WASM** - In-browser video encoding capabilities.
- **JSZip** - For bundling high-quality PNG sequences on the client-side.
- **OpenFreeMap** - Map tiles and styling layer base.

## Local Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/pereiraregis/MapAnimator.git
   ```
2. Enter the client directory:
   ```bash
   cd MapAnimator/client
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server (runs on `http://localhost:3000`):
   ```bash
   npm start
   ```

## Exporting & Deployment

Development sources are on `main`; the remote's default `gh-pages` branch contains published files. Start new development branches from `origin/main`. Run checks from `client` with `npm test -- --watchAll=false --runInBand` and `npm run build`.

Map Animator V2 supports GitHub Pages out of the box using `gh-pages`. To deploy your own instance to your bound GitHub repository:

```bash
npm run deploy
```

## Creating a Sequence
1. Set the timeline duration and move to 0 seconds with Home.
2. Move the map to the starting view, focus the map and press K.
3. Choose another time, move the map to the next view and press K again.
4. Choose an easing mode on the captured view and use Space to play/pause.
5. Use arrow keys to step by frames and brackets to jump between views.
6. Export **MP4** or **PNG SEQ** from the fixed left panel. Use Ctrl/Cmd+S to save the editable project.

## License

This project is open-source. Please see the `LICENSE` file for more details.
