// Extracted from EffectCraft ui-egui timeline.rs at 357b4c5 (MIT).
// Imports, visibility and formatting adapted; original interaction logic retained. Original license: rust/vendor/effectcraft/LICENSE-MIT.
use eframe::egui::*;
const TRIM_OUTSIDE: f32 = 4.;
const TRIM_INSIDE: f32 = 5.;
pub(super) fn bar_color(label: Color32, selected: bool) -> Color32 {
    let k = if selected { 0.62 } else { 0.45 };
    let g = 0x3a as f32;
    let mix = |c: u8| (c as f32 * k + g * (1.0 - k)).round() as u8;
    Color32::from_rgb(mix(label.r()), mix(label.g()), mix(label.b()))
}
pub(super) fn trim_zones(bar: Rect) -> (Rect, Rect, Rect) {
    let inside = TRIM_INSIDE.min(bar.width() / 3.0).max(0.0);
    let in_r = Rect::from_min_max(
        pos2(bar.min.x - TRIM_OUTSIDE, bar.min.y),
        pos2(bar.min.x + inside, bar.max.y),
    );
    let out_r = Rect::from_min_max(
        pos2(bar.max.x - inside, bar.min.y),
        pos2(bar.max.x + TRIM_OUTSIDE, bar.max.y),
    );
    (bar.shrink2(vec2(inside, 0.0)), in_r, out_r)
}
