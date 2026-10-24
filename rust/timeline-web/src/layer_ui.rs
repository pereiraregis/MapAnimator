use super::*;
impl TimelineUi {
    pub(super) fn layer_row(
        &mut self,
        ui: &mut Ui,
        s: &mut Shared,
        p: &Painter,
        layer: &mapanimator_core::Layer,
        row: Rect,
        lane: Rect,
        pps: f64,
    ) -> bool {
        let mut used = false;
        let y = row.center().y;
        let label = Rect::from_min_max(row.min, pos2(lane.left(), row.bottom()));
        p.rect_filled(row, 0., Color32::from_rgb(43, 49, 57));
        let arrow = Rect::from_center_size(pos2(row.left() + 12., y), vec2(22., row.height()));
        let r = ui.interact(arrow, ui.id().with(("fold", &layer.id)), Sense::click());
        p.text(
            arrow.center(),
            Align2::CENTER_CENTER,
            if self.collapsed.contains(&layer.id) {
                "▸"
            } else {
                "▾"
            },
            FontId::proportional(15.),
            Color32::LIGHT_GRAY,
        );
        if r.clicked() {
            if !self.collapsed.remove(&layer.id) {
                self.collapsed.insert(layer.id.clone());
            }
            self.active_layer = Some(layer.id.clone());
        }
        used |= r.hovered();
        let eye = Rect::from_center_size(pos2(row.left() + 37., y), vec2(22., row.height()));
        let r = ui.interact(eye, ui.id().with(("eye", &layer.id)), Sense::click());
        p.text(
            eye.center(),
            Align2::CENTER_CENTER,
            if layer.kind == "camera" {
                "·"
            } else if layer.muted {
                "–"
            } else {
                "●"
            },
            FontId::proportional(12.),
            if layer.muted {
                Color32::GRAY
            } else {
                Color32::LIGHT_BLUE
            },
        );
        if r.clicked() && layer.kind != "camera" {
            s.cmd(json!({"op":"layer","id":layer.id,"muted":!layer.muted}));
        }
        used |= r.hovered();
        let lock = Rect::from_center_size(pos2(row.left() + 62., y), vec2(22., row.height()));
        let r = ui.interact(lock, ui.id().with(("lock", &layer.id)), Sense::click());
        p.text(
            lock.center(),
            Align2::CENTER_CENTER,
            if layer.locked { "L" } else { "·" },
            FontId::monospace(11.),
            if layer.locked {
                Color32::GOLD
            } else {
                Color32::GRAY
            },
        );
        if r.clicked() {
            s.cmd(json!({"op":"layer","id":layer.id,"locked":!layer.locked}));
        }
        used |= r.hovered();
        let name = Rect::from_min_max(pos2(row.left() + 77., row.top()), label.max);
        let r = ui.interact(name, ui.id().with(("layer", &layer.id)), Sense::click());
        p.with_clip_rect(name).text(
            name.left_center(),
            Align2::LEFT_CENTER,
            &layer.name,
            FontId::proportional(11.),
            Color32::WHITE,
        );
        r.clone().on_hover_text(&layer.name);
        if r.clicked() {
            self.active_layer = Some(layer.id.clone());
            s.editor.selected = s
                .editor
                .doc
                .tracks
                .iter()
                .enumerate()
                .filter(|(c, _)| s.editor.doc.properties[*c].layer == layer.id)
                .flat_map(|(_, t)| t.iter().map(|k| k.id.clone()))
                .collect();
        }
        used |= r.hovered();
        let x = |t: f64| lane.left() + ((t - self.start) * pps) as f32;
        let start = layer.start;
        let end = layer.end.min(s.editor.duration);
        if start >= end {
            return used;
        }
        let bar = Rect::from_min_max(pos2(x(start), y - 7.), pos2(x(end), y + 7.));
        let bar_clip = bar.intersect(Rect::from_min_max(pos2(lane.left(), row.top()), row.max));
        if !bar_clip.is_positive() {
            return used;
        }
        let color = upstream_ui::bar_color(
            Color32::from_rgb(100, 170, 198),
            self.active_layer.as_deref() == Some(&layer.id),
        );
        p.with_clip_rect(bar_clip).rect_filled(bar, 2., color);
        if layer.kind == "camera" {
            return used;
        }
        let (body, left, right) = upstream_ui::trim_zones(bar);
        for (part, zone) in [(0u8, body), (1, left), (2, right)] {
            let zone = zone.intersect(Rect::from_min_max(pos2(lane.left(), row.top()), row.max));
            if !zone.is_positive() {
                continue;
            }
            let r = ui.interact(
                zone,
                ui.id().with(("bar", &layer.id, part)),
                if layer.locked {
                    Sense::hover()
                } else {
                    Sense::click_and_drag()
                },
            );
            used |= r.hovered() || r.dragged();
            if r.hovered() && !layer.locked {
                ui.ctx().set_cursor_icon(if part == 0 {
                    CursorIcon::Grab
                } else {
                    CursorIcon::ResizeHorizontal
                });
            }
            r.clone().on_hover_text(format!(
                "{} · {:.2}–{:.2}s · arraste a barra ou suas bordas",
                layer.name, start, end
            ));
            if r.clicked() {
                self.active_layer = Some(layer.id.clone());
            }
            if r.drag_started() {
                self.active_layer = Some(layer.id.clone());
                self.bar_drag = Some((
                    layer.id.clone(),
                    part,
                    r.interact_pointer_pos()
                        .map(|p| p.x - r.drag_delta().x)
                        .unwrap_or(0.),
                    start,
                    end,
                ));
                Self::action(s, "begin");
            }
            if r.dragged()
                && let Some((id, kind, origin, a, b)) = self.bar_drag.clone()
            {
                if id == layer.id && kind == part {
                    let pointer = r.interact_pointer_pos().map(|p| p.x).unwrap_or(origin);
                    let mut delta = (pointer - origin) as f64 / pps;
                    let min = (1. / s.editor.fps).min(b - a);
                    if self.snap || ui.input(|i| i.modifiers.shift) {
                        let anchor = if part == 2 { b } else { a };
                        let mut candidates = vec![0., s.editor.duration, s.editor.time];
                        candidates.extend(
                            s.editor
                                .doc
                                .tracks
                                .iter()
                                .flatten()
                                .map(|k| k.data.time.seconds()),
                        );
                        delta = mapanimator_core::snap_time(&candidates, anchor + delta, 8. / pps)
                            - anchor;
                    }
                    delta = s.editor.frame(delta);
                    let (from, to) = match part {
                        1 => ((a + delta).clamp(0., b - min), b),
                        2 => (a, (b + delta).clamp(a + min, s.editor.duration)),
                        _ => {
                            let shift = delta.clamp(-a, s.editor.duration - b);
                            (a + shift, b + shift)
                        }
                    };
                    if (from - a).abs() > 1e-9 || (to - b).abs() > 1e-9 {
                        s.cmd(
                            json!({"op":"layer","id":id,"start":from,"end":to,"translate":part==0}),
                        );
                    }
                }
            }
            if r.drag_stopped() {
                Self::action(s, "commit");
                self.bar_drag = None;
            }
        }
        used
    }
    pub(super) fn layer_inspector(&mut self, ui: &mut Ui, s: &mut Shared) {
        let Some(layer) = self
            .active_layer
            .as_ref()
            .and_then(|id| s.editor.doc.layers.iter().find(|l| &l.id == id))
            .cloned()
        else {
            return;
        };
        ui.horizontal_wrapped(|ui| {
            ui.strong(&layer.name);
            if layer.locked {
                ui.weak("Camada bloqueada");
            }
            if layer.kind != "camera" {
                if layer.start >= s.editor.duration {
                    ui.weak(format!(
                        "Intervalo {:.2}–{:.2}s fora da composição",
                        layer.start, layer.end
                    ));
                    if ui.button("Trazer para a composição").clicked() {
                        s.cmd(
                            json!({"op":"layer","id":layer.id,"start":0.,"end":s.editor.duration}),
                        );
                    }
                    return;
                }
                let min = (1. / s.editor.fps).min(layer.end.min(s.editor.duration) - layer.start);
                let mut a = layer.start;
                let mut b = layer.end.min(s.editor.duration);
                ui.label("Entrada");
                let ra = ui.add_enabled(
                    !layer.locked,
                    DragValue::new(&mut a)
                        .speed(1. / s.editor.fps)
                        .range(0. ..=b - min),
                );
                ui.label("Saída");
                let rb = ui.add_enabled(
                    !layer.locked,
                    DragValue::new(&mut b)
                        .speed(1. / s.editor.fps)
                        .range(a + min..=s.editor.duration),
                );
                if ra.drag_started() || rb.drag_started() {
                    Self::action(s, "begin");
                }
                if ra.changed() || rb.changed() {
                    s.cmd(json!({"op":"layer","id":layer.id,"start":a,"end":b}));
                }
                if ra.drag_stopped() || rb.drag_stopped() {
                    Self::action(s, "commit");
                }
            }
        });
    }
}
