# Map Animator V2

**Current release: v0.3.0.** [Open the editor](https://pereiraregis.github.io/MapAnimator/) · [Changelog](CHANGELOG.md)

### Camera timeline and map styling

Use the bottom timeline to capture the current camera at 0 seconds, enter another time, move the map and capture again. Select an easing curve for each departing view and use **Reproduzir** or the scrubber to preview. **Usar vistas na exportação** sends that same animation to PNG/MP4; disable it to use the existing Theatre Studio animation. Each view also stores `pathProgress` (0–1), so route reveals can run alongside camera moves. Capturing at an existing time replaces that view.

Expand **Estilo do mapa-base** to toggle map labels, roads and buildings, override water/background colors or load a custom HTTPS MapLibre style JSON. Visibility groups use layer/source names and apply best to the bundled OpenFreeMap styles; arbitrary providers may use different naming. Raster basemaps cannot expose these individual vector controls.

Use **Dados CSV / TSV** to import point datasets. Confirm longitude and latitude columns, optionally select a label and numeric value for proportional marker size. Coordinates require decimal points. [Sample CSV](client/public/examples/cities.csv) is included. Imported values and styling are retained in saved projects.

## Geographic editing update

The existing React + MapLibre + Theatre.js editor now includes:

- A geographic feature browser: import WGS84 GeoJSON points, lines, polygons and multi geometries; filter, select, frame, hide and delete elements.
- Per-feature color, opacity, outline width and point radius, preserved when switching basemaps.
- Labels from selected features and conversion of a LineString into the animated route (`pathProgress` in Theatre Studio).
- Numeric longitude, latitude, zoom, pitch and bearing controls. Use **Capture** to write the current view to Theatre.
- **Salvar projeto** downloads a versioned JSON file containing map settings, camera, pins, route, feature styles and Theatre timeline, and stores a browser-local copy. **Abrir arquivo** or **Reabrir local** replaces the scene and reloads the editor. Save the current scene first.
- Visible provider attribution in the preview and composited into exported frames. Geocoding runs on Enter with a session cache and request queue.

See [the reference research and implementation roadmap](docs/GEOLAYERS_RESEARCH.md) for official documentation, a capability comparison with GEOlayers 3, limitations and the path toward an independent After Effects bridge. This remains a browser application; it does not yet generate native After Effects layers or 3D terrain.

### Try the feature workflow

1. Click **Exemplo** in the geographic panel to load sample point, line and polygon features near São Paulo.
2. Select an element and edit its style, create a label, or frame it on the map.
3. Select the example LineString and click **Animar rota**. Open **Studio** to animate `pathProgress` from 0 to 1.
4. Save the project and reopen it to continue editing the same timeline.

GeoJSON exports preserve source properties. Save a MapAnimator project to retain styles and visibility. Files are validated before import (10 MB and 5000 features per GeoJSON). GeometryCollection and projected coordinate systems are not supported. Polygon labels use bounding-box centers; drag the label if necessary. Framing across the antimeridian needs further work.

Public Nominatim is appropriate only for moderate usage. The local request queue cannot enforce the provider's aggregate application-wide limit across users. A production rollout with more users needs a shared limiter or a suitable provider. The compatible search endpoint can be changed through the localStorage key `mapanimator.geocoder`.

A premium, web-based tool for creating, animating, and exporting high-quality cinematic map sequences. Built with React and designed for seamless keyframe-based animation and high-performance WebGL map rendering.

## Features

- **Keyframe Timelines**: Fully integrated with Theatre.js for professional-grade animation sequencing. Animate camera position, zooming, pitching, and bearing effortlessly.
- **Native WebGL Pins**: Add draggable, customizable pins (icons, colors, labels, shadows, and scalable texts) that hook directly into the MapLibre GL JS symbol layers.
- **Floating Properties Panels**: Clean, collapsible "Studio" UI that stays out of your way while you work.
- **Draw Routes**: Instantly draw animated route paths using highly accurate GeoJSON rendering.
- **High-Performance Exporting**: Run complex video exports entirely in your browser using WebAssembly (`ffmpeg.wasm`). Export MP4 videos or sequential PNG ZIP packages.
- **Live Sync**: Sync your live map movements and pan/zoom gestures directly into timeline keyframes on the fly.
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
1. Toggle the **Studio** button in the sidebar to open the Theatre.js timeline timeline.
2. Select the "Map" object in the left panel to expose coordinate tracks.
3. Move the map to your desired starting position.
4. Click the small diamond icon next to coordinates in Theatre.js to create a start keyframe.
5. Move the timeline playhead to 5 seconds.
6. Move the map to your ending position. Animate!
7. Ensure your **Export Len (s)** in the floating sidebar matches your timeline limit.
8. Hit **MP4** or **PNG SEQ** to capture locally.

## License

This project is open-source. Please see the `LICENSE` file for more details.
