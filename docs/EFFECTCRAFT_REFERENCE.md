> v0.7.0 update: the active timeline now uses actual vendored EffectCraft Rust modules and an egui/WASM panel. The document below describes the earlier React adaptation. See [RUST_MIGRATION.md](RUST_MIGRATION.md) for the current architecture and limitations.

# EffectCraft timeline reference — MapAnimator v0.6.0

Reviewed upstream revision: [`357b4c5bd531f9032ad6dc02937dcc75ab293ee9`](https://github.com/storytold/effectcraft/tree/357b4c5bd531f9032ad6dc02937dcc75ab293ee9), accessed 2026-10-23. EffectCraft uses Rust/egui; MapAnimator retains React, MapLibre and its existing scene/export pipeline.

## Primary sources and adaptation

| Upstream source | Observed behavior | MapAnimator implementation |
| --- | --- | --- |
| [Keyframe model](https://github.com/storytold/effectcraft/blob/357b4c5bd531f9032ad6dc02937dcc75ab293ee9/crates/keyframe/src/lib.rs) | Property tracks, temporal interpolation, keyframe values | Six scalar map/route tracks; independent sampling; legacy scenes without channel metadata still key all six properties |
| [Timeline panel](https://github.com/storytold/effectcraft/blob/357b4c5bd531f9032ad6dc02937dcc75ab293ee9/crates/ui-egui/src/panels/timeline.rs) | Multi-selection, marquee, drag gesture, clipboard events, context menu, value editing, graph modes, zoom around CTI | React pointer capture, rectangle selection, internal/system clipboard events, docked inspector and value/absolute-speed graphs |
| [Timeline snap_time helper](https://github.com/storytold/effectcraft/blob/357b4c5bd531f9032ad6dc02937dcc75ab293ee9/crates/ui-egui/src/panels/timeline.rs#L465) | Nearest snap target inside a time tolerance | `snapTime` adapted in `client/src/geo/keyframes.js`; tolerance derived from eight screen pixels; group movement snaps around its anchor |
| [Keyframe interaction tests](https://github.com/storytold/effectcraft/blob/357b4c5bd531f9032ad6dc02937dcc75ab293ee9/crates/ui-egui/tests/it/ui_keyframes.rs) | Selection, interpolation, copy/paste and key manipulation | Regression tests adapted to MapAnimator's React state and DOM event model |
| [Timeline zoom tests](https://github.com/storytold/effectcraft/blob/357b4c5bd531f9032ad6dc02937dcc75ab293ee9/crates/ui-egui/tests/it/ui_timeline_zoom.rs) | CTI-centered timeline zoom | Retain the playhead's viewport position when zoom changes; center it if previously offscreen |

The reference guided interaction behavior. The React components, camera sampler, geographic features and export integration remain MapAnimator implementations. The small nearest-target snapping helper is adapted from the MIT-licensed upstream implementation. No EffectCraft assets or branding were imported.

## Scene representation and compatibility

`waypoints` retain the existing six numeric snapshot values. Optional `channels` defines which properties actually have keys at a time, `keyIds` retains each scalar key's stable identity, and `interpolation` stores easing/curve per property. Legacy records without these fields still key all six channels with their original easing. Metadata is preserved in saved scenes; the new sampler is shared by preview/export. Theatre conversion reads the same property membership and interpolation. Native edits are still a separate animation mode, without reverse conversion.

Group dragging rejects collisions within the same property; different properties can share a time. Paste replaces destination keys of matching property/time and preserves other keys. Undo stores one history entry per completed drag. Clipboard format is `MapAnimatorKeys`, version 1; it supports cross-tab transfer through browser copy/paste events. Clipboard buttons use the timeline's in-memory buffer. Imported keys and values are validated before application.

## Scope and differences

- Six fixed map/route tracks, rather than a general multilayer compositor. No roving keys, spatial Bézier tangents, automatic/continuous temporal tangents, or separate velocity/influence dialog.
- F9 modifies both sides of selected keys; Shift+F9 incoming, Ctrl/Cmd+Shift+F9 outgoing. Incoming easing is stored on the previous outgoing segment. A preceding Hold segment is preserved.
- Bézier handles remain inside 0–1, so overshoot is not supported. Speed is an absolute numerical derivative. Hold has zero speed between keys; its discontinuous jump is not represented as finite speed.
- Preview range/loop and timeline selection/history are session-local. Export uses full duration. Maximum 500 distinct keyed times and 3,000 scalar keys; 600 seconds maximum duration.
- The final browser/WebGL visual check was unavailable because the browser launcher failed on volume E:. Automated logic/React tests and the production build are recorded in [VALIDATION.md](VALIDATION.md); these are not a substitute for a real pointer/canvas check.

## License

Upstream offers MIT or Apache-2.0. The adapted helper uses the MIT option. Copyright (c) 2026 ArtCraft Team and the EffectCraft contributors. The complete notice is included in [`client/public/licenses/effectcraft-MIT.txt`](../client/public/licenses/effectcraft-MIT.txt) and bundled into the published site at `licenses/effectcraft-MIT.txt`. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
