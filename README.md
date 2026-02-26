# Map Animator V2

A web-based tool for creating, animating, and exporting high-quality cinematic map sequences. Built with React and designed for seamless keyframe-based animation and high-performance WebGL map rendering.

## Features

- **Keyframe Timelines**: Fully integrated with Theatre.js for professional-grade animation sequencing. Animate camera position, zooming, pitching, and bearing effortlessly.
- **Native WebGL Pins**: Add draggable, customizable pins (icons, colors, labels, shadows, and scalable texts) that hook directly into the MapLibre GL JS symbol layers.
- **Floating Properties Panels**: Clean, collapsible "Studio" UI that stays out of your way while you work.
- **Draw Routes**: Instantly draw animated route paths using highly accurate GeoJSON rendering.
- **High-Performance Exporting**: Run complex video exports entirely in your browser using WebAssembly (`ffmpeg.wasm`). Export MP4 videos or sequential PNG ZIP packages.
- **Live Sync**: Sync your live map movements and pan/zoom gestures directly into timeline keyframes on the fly.
- **3D Terrain & Multiple Styles**: Toggle 3D extrusion terrain and select between multiple OpenFreeMap styles (Dark, Bright, Positron, Liberty).
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

Map Animator V2 supports GitHub Pages out of the box using `gh-pages`. To deploy your own instance to your bound GitHub repository:

```bash
npm run deploy
```

## Creating a Sequence
1. Toggle the **Studio** button in the sidebar to open the Theatre.js timeline timeline.
2. Select the "Map" object in the left panel to expose coordinate tracks.
3. Right click Props then Sequence All.
4. Move the map to your desired starting position.
5. Click the small diamond icon next to coordinates in Theatre.js or Capture in the left side panel to create a start keyframe.
6. Move the timeline playhead to 5 seconds.
7. Move the map to your ending position. Animate!
8. Ensure your **Export Len (s)** in the floating sidebar matches your timeline limit.
9. Hit **MP4** or **PNG SEQ** to capture locally.

## License

This project is open-source. Please see the `LICENSE` file for more details.
