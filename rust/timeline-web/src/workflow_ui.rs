use super::*;
pub(super) fn ruler_step(span: f64, width: f64, fps: f64) -> f64 {
    let target = (span / (width / 85.).max(1.)).max(1. / fps);
    let power = 10f64.powf(target.log10().floor());
    let step = [1., 2., 5., 10.]
        .into_iter()
        .map(|v| v * power)
        .find(|v| *v >= target)
        .unwrap_or(power * 10.);
    // Small intervals are expressed in whole frames, large ones in round seconds.
    if step < 1. {
        (step * fps).ceil() / fps
    } else {
        step
    }
}
impl TimelineUi {
    pub(super) fn work_area(
        &mut self,
        ui: &mut Ui,
        s: &mut Shared,
        p: &Painter,
        ruler: Rect,
        pps: f64,
    ) {
        let mut range = s.range.unwrap_or([0., s.editor.duration]);
        let x = |t: f64| ruler.left() + ((t - self.start) * pps) as f32;
        let bar = Rect::from_min_max(
            pos2(x(range[0]), ruler.top() + 2.),
            pos2(x(range[1]), ruler.top() + 8.),
        )
        .intersect(ruler);
        p.rect_filled(bar, 1., Color32::from_rgb(105, 152, 171));
        let minimum = (1. / s.editor.fps).min(s.editor.duration);
        for side in 0..2 {
            let handle =
                Rect::from_center_size(pos2(x(range[side]), ruler.top() + 5.), vec2(12., 10.))
                    .intersect(ruler);
            if !handle.is_positive() {
                continue;
            }
            p.rect_filled(handle, 1., Color32::LIGHT_BLUE);
            let r = ui
                .interact(
                    handle,
                    ui.id().with(("work_area", side)),
                    Sense::click_and_drag(),
                )
                .on_hover_text(if side == 0 {
                    "Entrada da prévia · B"
                } else {
                    "Saída da prévia · N"
                });
            if r.hovered() || r.dragged() {
                ui.ctx().set_cursor_icon(CursorIcon::ResizeHorizontal);
            }
            if r.dragged() {
                if let Some(pos) = r.interact_pointer_pos() {
                    let t = s
                        .editor
                        .frame((pos.x - ruler.left()) as f64 / pps + self.start);
                    range[side] = if side == 0 {
                        t.clamp(0., range[1] - minimum)
                    } else {
                        t.clamp(range[0] + minimum, s.editor.duration)
                    };
                    s.range = Some(range);
                    s.playing = false;
                }
            }
        }
    }

    pub(super) fn fit_selection(&mut self, s: &Shared) {
        if let Some((a, b)) = s.editor.selection_range() {
            let width = (b - a).max(4. / s.editor.fps);
            let padding = width * 0.15;
            self.zoom = (s.editor.duration / (width + padding * 2.)).clamp(1., 64.);
            self.start = (a - padding).clamp(
                0.,
                (s.editor.duration - s.editor.duration / self.zoom).max(0.),
            );
        } else {
            self.zoom = 1.;
            self.start = 0.;
        }
    }
    pub(super) fn workflow_toolbar(&mut self, ui: &mut Ui, s: &mut Shared) {
        ui.horizontal_wrapped(|ui| {
            ui.menu_button("Editar", |ui| {
                for (label,op) in [("Copiar","copy"),("Colar","paste"),("Excluir","delete"),("Inverter tempo","reverse")] {
                    if ui.button(label).clicked() { Self::action(s,op);ui.close(); }
                }
                if ui.button("Selecionar tudo").clicked() {
                    s.editor.selected=s.editor.doc.tracks.iter().flatten().map(|k|k.id.clone()).collect(); ui.close();
                }
            });
            ui.menu_button("Interpolação", |ui| {
                for (label,mode) in [("Linear","linear"),("Hold","hold"),("Easy Ease · F9","easy"),("Ease In · Shift+F9","in"),("Ease Out · Ctrl+Shift+F9","out"),("Auto Bézier","auto"),("Bézier contínuo","continuous")] {
                    if ui.button(label).clicked() {s.cmd(json!({"op":"ease","mode":mode}));ui.close();}
                }
            });
            ui.menu_button("Tempo", |ui| {
                ui.set_min_width(250.);
                ui.strong("Ajustar keyframes selecionados");
                if let Some((a,b))=s.editor.selection_range() {
                    ui.weak(format!("Seleção: {a:.2}–{b:.2} s"));
                    if ui.button("Usar intervalo da seleção").clicked(){self.retime_start=a;self.retime_duration=b-a;}
                }
                ui.horizontal(|ui|{ui.label("Início (s)");ui.add(DragValue::new(&mut self.retime_start).speed(1./s.editor.fps).range(0. ..=s.editor.duration));});
                ui.horizontal(|ui|{ui.label("Duração (s)");ui.add(DragValue::new(&mut self.retime_duration).speed(1./s.editor.fps).range(1./s.editor.fps..=s.editor.duration));});
                if ui.add_enabled(s.editor.selection_range().is_some_and(|(a,b)| b>a),Button::new("Aplicar duração")).clicked() {
                    s.cmd(json!({"op":"retime","start":self.retime_start,"duration":self.retime_duration}));
                }
                ui.separator();
                ui.label("Sequenciar camadas no cursor");
                ui.horizontal(|ui|{ui.label("Intervalo (s)");ui.add(DragValue::new(&mut self.sequence_gap).speed(1./s.editor.fps).range(0. ..=s.editor.duration));});
                ui.horizontal(|ui|{
                    if ui.button("Alinhar").clicked(){s.cmd(json!({"op":"sequence","gap":0.}));}
                    if ui.button("Escalonar").clicked(){s.cmd(json!({"op":"sequence","gap":self.sequence_gap}));}
                });
                ui.weak("Usa a ordem das camadas e apenas os keys selecionados.");
            });
            ui.menu_button("Presets", |ui| {
                ui.set_min_width(235.);
                let layer=self.active_layer.as_ref().and_then(|id|s.editor.doc.layers.iter().find(|l|&l.id==id)).cloned();
                if let Some(layer)=layer.filter(|l|l.kind!="camera") {
                    ui.strong(&layer.name);
                    ui.horizontal(|ui| {ui.label("Duração (s)");ui.add(DragValue::new(&mut self.preset_duration).speed(1./s.editor.fps).range(1./s.editor.fps..=s.editor.duration));});
                    ui.weak("Começa no cursor. Substitui keys no intervalo.");
                    let mut modes=vec![];
                    if s.editor.doc.properties.iter().any(|p|p.layer==layer.id && p.key=="opacity") {modes.extend([("Entrada suave","fade_in"),("Saída suave","fade_out")]);}
                    if layer.kind=="pin" {modes.extend([("Pop de entrada","pop"),("Pulso de destaque","pulse")]);}
                    if layer.id=="route" {modes.push(("Desenhar rota","draw"));}
                    for (label,mode) in modes {
                        if ui.add_enabled(!layer.locked,Button::new(label)).clicked() {
                            s.cmd(json!({"op":"preset","id":layer.id,"mode":mode,"duration":self.preset_duration}));
                            self.collapsed.remove(&layer.id);self.animated_only=false;self.filter.clear();ui.close();
                        }
                    }
                    if layer.locked {ui.weak("Desbloqueie a camada para aplicar.");}
                } else {ui.label("Selecione o nome de um pin, área ou rota.");}
            });
            ui.separator();
            ui.checkbox(&mut self.animated_only, "Animadas · U");
            ui.add(TextEdit::singleline(&mut self.filter).hint_text("Buscar camada ou propriedade").desired_width(160.));
            if ui.small_button("Enquadrar · F").clicked(){self.fit_selection(s);}
            ui.menu_button("Exibição", |ui| {
                if ui.button("Expandir camadas").clicked(){self.collapsed.clear();ui.close();}
                if ui.button("Recolher camadas").clicked(){self.collapsed=s.editor.doc.layers.iter().map(|l|l.id.clone()).collect();ui.close();}
                ui.add(Slider::new(&mut self.label_width,140. ..=420.).text("Coluna de propriedades"));
            });
            ui.menu_button("Área de prévia", |ui| {
                let mut range=s.range.unwrap_or([0.,s.editor.duration]);
                ui.label("Entrada / saída (s)");
                let a=ui.add(DragValue::new(&mut range[0]).speed(1./s.editor.fps).range(0. ..=s.editor.duration));
                let b=ui.add(DragValue::new(&mut range[1]).speed(1./s.editor.fps).range(0. ..=s.editor.duration));
                if (a.changed()||b.changed()) && range[1]>range[0] {s.range=Some(range);s.playing=false;}
                ui.checkbox(&mut s.looped,"Loop");
                if ui.button("Restaurar duração inteira").clicked(){s.range=None;}
                ui.weak("B / N: entrada / saída no cursor. Não recorta a exportação.");
            });
        });
        ui.horizontal(|ui| {
            ui.monospace(format!(
                "{:05} f",
                (s.editor.time * s.editor.fps).round() as u64
            ));
            ui.weak(format!(
                "/ {:.0} f · {} keys selecionados",
                (s.editor.duration * s.editor.fps).round(),
                s.editor.selected.len()
            ));
            if let Some(id) = &self.active_layer {
                if let Some(l) = s.editor.doc.layers.iter().find(|l| &l.id == id) {
                    ui.weak(format!("· {}", l.name));
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> (Context, TimelineUi, Rc<RefCell<Shared>>) {
        let mut shared = Shared {
            enabled: true,
            ..Default::default()
        };
        let catalog: Vec<CatalogLayer>=serde_json::from_value(json!([
            {"id":"pin:a","name":"Cidade","kind":"pin","values":{"lng":0.,"lat":0.,"opacity":1.,"scale":1.,"rotation":0.}}
        ])).unwrap();
        shared
            .sync_objects(&catalog, &LayerAnimation::default())
            .unwrap();
        let shared = Rc::new(RefCell::new(shared));
        let mut view = TimelineUi::new(shared.clone());
        view.active_layer = Some("pin:a".into());
        (Context::default(), view, shared)
    }
    fn toolbar_frame(
        ctx: &Context,
        view: &mut TimelineUi,
        shared: &Rc<RefCell<Shared>>,
        events: Vec<Event>,
        time: f64,
    ) -> Vec<(String, Pos2)> {
        let mut output = ctx.run_ui(
            RawInput {
                screen_rect: Some(Rect::from_min_size(Pos2::ZERO, vec2(1000., 600.))),
                events,
                time: Some(time),
                ..Default::default()
            },
            |ui| {
                view.toolbar(ui, &mut shared.borrow_mut());
            },
        );
        fn visit(shape: &Shape, text: &mut Vec<(String, Pos2)>) {
            match shape {
                Shape::Text(t) => text.push((
                    t.galley.job.text.clone(),
                    t.pos + t.galley.rect.center().to_vec2(),
                )),
                Shape::Vec(shapes) => {
                    for s in shapes {
                        visit(s, text);
                    }
                }
                _ => {}
            }
        }
        output.textures_delta.clear();
        let mut text = vec![];
        for s in &output.shapes {
            visit(&s.shape, &mut text);
        }
        text
    }
    fn click(
        ctx: &Context,
        view: &mut TimelineUi,
        shared: &Rc<RefCell<Shared>>,
        labels: &[(String, Pos2)],
        text: &str,
        t: f64,
    ) -> Vec<(String, Pos2)> {
        let pos = labels
            .iter()
            .find(|(s, _)| s == text)
            .unwrap_or_else(|| panic!("Missing {text}: {labels:?}"))
            .1;
        toolbar_frame(ctx, view, shared, vec![Event::PointerMoved(pos)], t);
        toolbar_frame(
            ctx,
            view,
            shared,
            vec![Event::PointerButton {
                pos,
                button: PointerButton::Primary,
                pressed: true,
                modifiers: Modifiers::NONE,
            }],
            t + 0.01,
        );
        toolbar_frame(
            ctx,
            view,
            shared,
            vec![Event::PointerButton {
                pos,
                button: PointerButton::Primary,
                pressed: false,
                modifiers: Modifiers::NONE,
            }],
            t + 0.02,
        );
        toolbar_frame(ctx, view, shared, vec![], t + 0.2)
    }
    #[test]
    fn preset_menu_creates_editable_keys_and_opens_the_layer() {
        let (ctx, mut view, shared) = scene();
        view.collapsed.insert("pin:a".into());
        toolbar_frame(&ctx, &mut view, &shared, vec![], 0.);
        let labels = toolbar_frame(&ctx, &mut view, &shared, vec![], 0.1);
        let labels = click(&ctx, &mut view, &shared, &labels, "Presets", 0.3);
        click(&ctx, &mut view, &shared, &labels, "Pop de entrada", 0.6);
        assert_eq!(shared.borrow().editor.selected.len(), 6);
        assert_eq!(shared.borrow().editor.undo.len(), 1);
        assert!(!view.collapsed.contains("pin:a"));
        assert!(
            shared
                .borrow()
                .events
                .iter()
                .any(|e| e["type"] == "layerAnimation")
        );
    }
    #[test]
    fn time_menu_applies_duration_to_selected_native_keys() {
        let (ctx, mut view, shared) = scene();
        shared
            .borrow_mut()
            .cmd(json!({"op":"preset","id":"pin:a","mode":"fade_in","duration":1.}));
        view.retime_start = 2.;
        view.retime_duration = 3.;
        toolbar_frame(&ctx, &mut view, &shared, vec![], 0.);
        let labels = toolbar_frame(&ctx, &mut view, &shared, vec![], 0.1);
        let labels = click(&ctx, &mut view, &shared, &labels, "Tempo", 0.3);
        click(&ctx, &mut view, &shared, &labels, "Aplicar duração", 0.6);
        assert_eq!(shared.borrow().editor.selection_range(), Some((2., 5.)));
        assert_eq!(shared.borrow().editor.undo.len(), 2);
    }
    #[test]
    fn fitting_and_ruler_ticks_remain_bounded_at_short_and_long_durations() {
        for span in [0.01, 0.1, 3., 600.] {
            let step = ruler_step(span, 600., 30.);
            assert!(step >= 1. / 30. && step.is_finite());
            assert!(span / step <= 8.);
        }
        let (_, mut view, shared) = scene();
        shared
            .borrow_mut()
            .cmd(json!({"op":"preset","id":"pin:a","mode":"fade_in","duration":1.}));
        view.fit_selection(&shared.borrow());
        assert!(view.zoom > 1. && view.start >= 0.);
        shared.borrow_mut().editor.selected.clear();
        view.fit_selection(&shared.borrow());
        assert_eq!(view.zoom, 1.);
    }
}

#[cfg(test)]
mod navigation_tests {
    use super::*;
    fn frame(
        ctx: &Context,
        view: &mut TimelineUi,
        shared: &Rc<RefCell<Shared>>,
        events: Vec<Event>,
        time: f64,
    ) -> Rect {
        let mut rect = Rect::NOTHING;
        let mut output = ctx.run_ui(
            RawInput {
                screen_rect: Some(Rect::from_min_size(Pos2::ZERO, vec2(1000., 600.))),
                events,
                time: Some(time),
                ..Default::default()
            },
            |ui| {
                rect = ui.available_rect_before_wrap();
                view.tracks(ui, &mut shared.borrow_mut());
            },
        );
        output.textures_delta.clear();
        rect
    }
    #[test]
    fn native_zoom_event_keeps_time_under_pointer_and_regular_scroll_does_not_zoom() {
        let ctx = Context::default();
        let shared = Rc::new(RefCell::new(Shared {
            enabled: true,
            ..Default::default()
        }));
        let mut view = TimelineUi::new(shared.clone());
        let rect = frame(&ctx, &mut view, &shared, vec![], 0.);
        let pos = pos2(
            rect.left() + view.label_width + (rect.width() - view.label_width) * 0.5,
            rect.top() + 60.,
        );
        frame(
            &ctx,
            &mut view,
            &shared,
            vec![Event::PointerMoved(pos), Event::Zoom(2.)],
            0.1,
        );
        assert!((view.zoom - 2.).abs() < 1e-9);
        assert!((view.start - 2.5).abs() < 1e-9);
        frame(
            &ctx,
            &mut view,
            &shared,
            vec![Event::MouseWheel {
                unit: MouseWheelUnit::Point,
                phase: TouchPhase::Move,
                delta: vec2(0., 20.),
                modifiers: Modifiers::NONE,
            }],
            0.2,
        );
        assert_eq!(view.zoom, 2.);
    }
    #[test]
    fn work_area_handle_changes_preview_without_editing_scene_history() {
        let ctx = Context::default();
        let shared = Rc::new(RefCell::new(Shared {
            enabled: true,
            ..Default::default()
        }));
        let mut view = TimelineUi::new(shared.clone());
        let rect = frame(&ctx, &mut view, &shared, vec![], 0.);
        let p = pos2(rect.right() - 2., rect.top() + 5.);
        let q = pos2(
            rect.left() + view.label_width + (rect.width() - view.label_width) * 0.5,
            p.y,
        );
        frame(&ctx, &mut view, &shared, vec![Event::PointerMoved(p)], 0.1);
        frame(
            &ctx,
            &mut view,
            &shared,
            vec![Event::PointerButton {
                pos: p,
                button: PointerButton::Primary,
                pressed: true,
                modifiers: Modifiers::NONE,
            }],
            0.2,
        );
        frame(&ctx, &mut view, &shared, vec![Event::PointerMoved(q)], 0.3);
        frame(
            &ctx,
            &mut view,
            &shared,
            vec![Event::PointerButton {
                pos: q,
                button: PointerButton::Primary,
                pressed: false,
                modifiers: Modifiers::NONE,
            }],
            0.4,
        );
        let s = shared.borrow();
        assert!((s.range.unwrap()[1] - 5.).abs() < 0.04);
        assert!(s.editor.undo.is_empty());
        assert_eq!(s.editor.time, 0.);
    }
}
