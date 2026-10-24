> Current release: v0.8.0 adds object layers, layer timing and animated geographic styles. See [Layer timeline](LAYER_TIMELINE.md). The stage-1 scope and exclusions below describe v0.7.0 historically; build architecture remains applicable.

# Rust timeline migration — v0.7.0, stage 1

The active animation editor now uses an egui canvas compiled to WebAssembly. `App.js` mounts `RustTimeline`, which hosts `TimelineRunner`; the former React `CameraTimeline` is retained only as legacy reference/tests and is not mounted. MapLibre, geographic data/pins, route geometry editing, FFmpeg and the surrounding workspace remain JavaScript in this stage.

## Architecture

- `rust/vendor/effectcraft`: unmodified time, geom, color and keyframe crates from revision `357b4c5bd531f9032ad6dc02937dcc75ab293ee9`. Original Git blob hashes are recorded in `UPSTREAM.json`. MIT license included.
- `rust/timeline-core`: map property tracks, legacy scene conversion, transactional editor commands, selection/clipboard, frame snapping, gesture history and validation. Uses upstream evaluation, velocity, interpolation, ease, auto/continuous temporal behavior and key icon model. No DOM dependency; intended for reuse by a later Tauri application.
- `rust/timeline-web`: egui timeline, tracks, ruler, marquee, context menus, transport, value/speed graphs, incoming/outgoing velocity/influence and draggable temporal handles. WASM bindings host the canvas and exchange commands/events with React. The complete EffectCraft engine/project/compositor UI is not imported.
- `client/src/rust/runtime.js`: loads the generated ES module and caches a Rust sampler per immutable scene point array. Rust editing emits native key metadata and sampled camera values. Preview receives those samples directly; PNG/MP4 explicitly await the Rust module and use that same Rust evaluator.

The scene remains MapAnimator version 1. New keys include `native[channel]` with EffectCraft Keyframe data alongside numeric snapshots, channel membership and stable key IDs. This preserves separate in/out interpolation, speed/influence and temporal flags through save/reopen. Older clients cannot reproduce these native curves; keep an original scene backup before reopening in v0.6.x. Legacy scenes are converted to scalar tracks. Angular values use the shortest path; physical camera/reveal output is clamped to valid MapLibre/reveal ranges. Extremely vertical legacy Bézier handles are approximated with minimum 0.1% influence.

## Current workflow

- K captures all six map/route properties; the diamond beside a track captures one. Click/Shift-click select keys, a drag in empty lanes selects a rectangle, a property name selects its track.
- Key dragging retains its original pointer anchor throughout the gesture, snaps to frames and optionally targets within eight pixels. One completed drag or curve-handle drag is one undo entry. Same-property collisions are rejected atomically. Blur cancels an active gesture and pauses.
- Ctrl/Cmd+A selects all. Ctrl/Cmd+C/V transfers native key data with relative timing, including between editor tabs; toolbar Copy/Paste uses an internal buffer. Paste replaces destination keys. Ctrl/Cmd+D duplicates at the playhead. Delete removes; Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z undo/redo. Capture/play/graph shortcuts are owned by the canvas while focused; global save/open still work.
- F9 applies upstream Easy Ease to both sides; Shift+F9 incoming; Ctrl/Cmd+Shift+F9 outgoing. Context menu offers Linear, Hold, Easy, Auto Bézier and Continuous Bézier. Numeric velocity/influence editing switches edited sides to manual Bézier.
- Graph Editor/G shows the selected property, actual value/speed samples and temporal handles. Speed graphs use upstream numerical differentiation; Hold jumps can appear as sampled spikes. Value graphs permit overshoot in the interpolation model; geographic/camera limits still clamp rendered output. Physical units are degrees/s for longitude, latitude, rotation and pitch; zoom units/s; route fraction/s. Track values/time and in/out speed/influence are editable.
- Zoom keeps the playhead anchored and horizontal navigation reveals the zoomed interval. Preview range/loop are session-local; export still spans full duration. Selection/history do not persist in saved files.
- The Theatre animation mode remains for existing projects. Rust keys are not converted back into Theatre curves. Enable the Rust timeline to edit new keys; disable to play a legacy Theatre scene.

## Build and checks

Install Rust 1.99.1, the `wasm32-unknown-unknown` target, a host C/C++ linker and Node/npm. Install matching bindings CLI: `cargo install wasm-bindgen-cli --version 0.2.129 --locked` (or a verified upstream binary). Rustup configuration is pinned in the repository root. Commands from repository root:

```text
cargo test --manifest-path rust/Cargo.toml -p mapanimator-core -p mapanimator-web -p effectcraft-keyframe -p effectcraft-time --lib --locked
node scripts/build-rust.mjs
node scripts/test-wasm.mjs
npm ci --prefix client
npm test --prefix client -- --watchAll=false --runInBand --cacheDirectory=./node_modules/.cache/jest
npm run build --prefix client
```

`WASM_BINDGEN` can name a matching CLI executable. The Rust build script generates JS/WASM/type declarations, build-info hashes and dependency notices before CRA copies them into its static build. Generated artifacts are committed for static hosting. Only source files maintained by MapAnimator should be formatted; leave vendored sources unchanged. Windows native tests use the MSVC C++ tools; other platforms may need their eframe native backend features configured for native UI tests.

## Remaining migration

This is a working first stage, not complete EffectCraft feature parity. Pins/polygons do not yet have their own layer/property trees; they and the map renderer have not migrated to Rust. Spatial tangents/roving exist in upstream but are not exposed for geographic paths here. Composition layers, expressions, audio, layer trimming and the full EffectCraft compositor are outside this stage. Numeric editing can create multiple undo entries; key and curve pointer gestures are grouped. Canvas accessibility/touch and final responsive/WebGL appearance still need a real browser check, blocked in this session by launcher volume E: error 1393. Tauri packaging is planned for a later stage; no desktop installer is delivered by this release.

After Effects feasibility and projection limits: [AFTER_EFFECTS_EXPORT.md](AFTER_EFFECTS_EXPORT.md). Validation evidence: [VALIDATION.md](VALIDATION.md).
