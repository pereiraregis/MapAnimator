mod layer_ui;
mod upstream_ui;
mod workflow_ui;
use effectcraft_keyframe::{Ease, Interp};
use eframe::egui::*;
use mapanimator_core::{CatalogLayer, Document, Editor, LayerAnimation, scalar};
use serde_json::{Value as Json, json};
use std::{cell::RefCell, rc::Rc};
use wasm_bindgen::prelude::*;

#[derive(Default)]
struct Shared {
    editor: Editor,
    events: Vec<Json>,
    playing: bool,
    enabled: bool,
    disabled: bool,
    curves: bool,
    looped: bool,
    range: Option<[f64; 2]>,
    error: String,
    last_external_animation: Option<Json>,
}
impl Shared {
    fn sync_objects(
        &mut self,
        catalog: &[CatalogLayer],
        animation: &LayerAnimation,
    ) -> Result<(), String> {
        let s = self;
        let incoming = json!(animation);
        let effective = if s.last_external_animation.as_ref() == Some(&incoming) {
            s.editor.doc.animation()
        } else {
            animation.clone()
        };
        s.last_external_animation = Some(incoming);
        let before = s.editor.doc.clone();
        s.editor.doc.set_objects(&catalog, &effective)?;
        if before != s.editor.doc {
            let structural = before
                .properties
                .iter()
                .map(|p| &p.uid)
                .collect::<std::collections::BTreeSet<_>>()
                != s.editor
                    .doc
                    .properties
                    .iter()
                    .map(|p| &p.uid)
                    .collect::<std::collections::BTreeSet<_>>();
            if structural {
                s.editor.undo.clear();
                s.editor.redo.clear();
                s.editor.selected.clear();
            } else {
                for snapshot in s.editor.undo.iter_mut() {
                    let animation = snapshot.animation();
                    snapshot.set_objects(&catalog, &animation)?;
                }
                for snapshot in s.editor.redo.iter_mut() {
                    let animation = snapshot.animation();
                    snapshot.set_objects(&catalog, &animation)?;
                }
            }
            s.playing = false;
        }
        let normalized = s.editor.doc.animation();
        if json!(normalized) != json!(animation) {
            s.events
                .push(json!({"type":"layerAnimation","animation":normalized}));
        }
        Ok(())
    }
    fn seek(&mut self, t: f64) {
        self.editor.time = t.clamp(0., self.editor.duration);
        self.events.push(json!({"type":"seek","time":self.editor.time,"values":self.editor.doc.sample(self.editor.time),"layers":self.editor.doc.sample_objects(self.editor.time),"cameraAnimated":self.editor.doc.tracks.iter().take(5).any(|t|!t.is_empty()),"routeAnimated":!self.editor.doc.tracks[5].is_empty()||self.editor.doc.base[5]!=1.||self.editor.doc.layers.iter().any(|l|l.id=="route"&&(l.muted||l.start>0.||l.end<600.))}));
    }
    fn emit(&mut self) {
        self.events
            .push(json!({"type":"points","points":self.editor.doc.to_legacy()}));
        self.events
            .push(json!({"type":"layerAnimation","animation":self.editor.doc.animation()}));
        self.seek(self.editor.time);
    }
    fn cmd(&mut self, c: Json) {
        let op = c["op"].as_str().unwrap_or("");
        match op {
            "play" => {
                if self.enabled && !self.disabled {
                    let range = self.range.unwrap_or([0., self.editor.duration]);
                    if self.editor.time >= range[1] || self.editor.time < range[0] {
                        self.seek(range[0]);
                    }
                    self.playing = !self.playing;
                }
            }
            "pause" => self.playing = false,
            "seek" => {
                self.playing = false;
                self.seek(c["time"].as_f64().unwrap_or(0.));
            }
            "step" => {
                self.playing = false;
                self.seek(self.editor.frame(
                    self.editor.time + c["amount"].as_f64().unwrap_or(1.) / self.editor.fps,
                ));
            }
            "start" => {
                self.playing = false;
                self.seek(0.);
            }
            "end" => {
                self.playing = false;
                self.seek(self.editor.duration);
            }
            "previous" | "next" => {
                let mut times: Vec<_> = self
                    .editor
                    .doc
                    .tracks
                    .iter()
                    .flatten()
                    .map(|k| k.data.time.seconds())
                    .collect();
                times.sort_by(f64::total_cmp);
                let t = if op == "previous" {
                    times
                        .into_iter()
                        .rev()
                        .find(|t| *t < self.editor.time - 1e-8)
                        .unwrap_or(0.)
                } else {
                    times
                        .into_iter()
                        .find(|t| *t > self.editor.time + 1e-8)
                        .unwrap_or(self.editor.duration)
                };
                self.playing = false;
                self.seek(t);
            }
            "curves" => self.curves = !self.curves,
            "capture_request" => {
                if !self.disabled {
                    let channels: Vec<usize> =
                        serde_json::from_value(c["channels"].clone()).unwrap_or((0..6).collect());
                    let properties: Vec<_> = channels
                        .iter()
                        .filter_map(|i| self.editor.doc.properties.get(*i).map(|p| p.uid.clone()))
                        .collect();
                    let values = self.editor.doc.sample_all(self.editor.time);
                    let mut data = serde_json::Map::new();
                    for i in channels {
                        if let Some(p) = self.editor.doc.properties.get(i) {
                            data.insert(p.uid.clone(), json!(values[i]));
                        }
                    }
                    self.events.push(json!({"type":"capture","channels":c["channels"],"properties":properties,"propertyValues":data}));
                }
            }
            _ => {
                if self.disabled || !self.enabled {
                    return;
                }
                self.playing = false;
                let before = self.editor.doc.clone();
                match self.editor.command(c.clone()) {
                    Ok(()) => {
                        self.error.clear();
                        if self.editor.doc != before || op == "commit" {
                            self.emit();
                        }
                    }
                    Err(e) => self.error = e,
                }
            }
        }
    }
}

#[wasm_bindgen]
pub fn sample_points(points: &str, time: f64) -> Result<String, JsValue> {
    let input = serde_json::from_str(points).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let doc = Document::from_legacy(&input).map_err(|e| JsValue::from_str(&e))?;
    Ok(json!(doc.sample(time)).to_string())
}
#[wasm_bindgen]
pub struct Sampler {
    doc: Document,
}
#[wasm_bindgen]
impl Sampler {
    #[wasm_bindgen(constructor)]
    pub fn new(points: &str) -> Result<Sampler, JsValue> {
        let input = serde_json::from_str(points).map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(Self {
            doc: Document::from_legacy(&input).map_err(|e| JsValue::from_str(&e))?,
        })
    }
    pub fn sample(&self, time: f64) -> String {
        json!(self.doc.sample(time)).to_string()
    }
}
#[wasm_bindgen]
pub struct SceneSampler {
    doc: Document,
}
#[wasm_bindgen]
impl SceneSampler {
    #[wasm_bindgen(constructor)]
    pub fn new(points: &str, catalog: &str, animation: &str) -> Result<SceneSampler, JsValue> {
        let p = serde_json::from_str(points).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let c: Vec<CatalogLayer> =
            serde_json::from_str(catalog).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let a: LayerAnimation =
            serde_json::from_str(animation).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let mut doc = Document::from_legacy(&p).map_err(|e| JsValue::from_str(&e))?;
        doc.set_objects(&c, &a).map_err(|e| JsValue::from_str(&e))?;
        Ok(Self { doc })
    }
    pub fn sample(&self, time: f64) -> String {
        json!({"values":self.doc.sample(time),"layers":self.doc.sample_objects(time),"cameraAnimated":self.doc.tracks.iter().take(5).any(|t|!t.is_empty()),"routeAnimated":!self.doc.tracks[5].is_empty()||self.doc.base[5]!=1.||self.doc.layers.iter().any(|l|l.id=="route"&&(l.muted||l.start>0.||l.end<600.))}).to_string()
    }
}
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub struct TimelineRunner {
    runner: eframe::WebRunner,
    shared: Rc<RefCell<Shared>>,
}
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl TimelineRunner {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        Self {
            runner: eframe::WebRunner::new(),
            shared: Rc::new(RefCell::new(Shared {
                enabled: true,
                ..Default::default()
            })),
        }
    }
    pub async fn start(&self, canvas: web_sys::HtmlCanvasElement) -> Result<(), JsValue> {
        let shared = self.shared.clone();
        self.runner
            .start(
                canvas,
                eframe::WebOptions::default(),
                Box::new(move |cc| {
                    cc.egui_ctx.set_visuals(Visuals::dark());
                    Ok(Box::new(TimelineUi::new(shared)))
                }),
            )
            .await
    }
    pub fn set_scene(
        &self,
        points: &str,
        duration: f64,
        fps: f64,
        enabled: bool,
        disabled: bool,
    ) -> Result<(), JsValue> {
        if !duration.is_finite()
            || !(0.1..=600.).contains(&duration)
            || !fps.is_finite()
            || !(10. ..=60.).contains(&fps)
        {
            return Err(JsValue::from_str("Configuração inválida"));
        }
        let input = serde_json::from_str(points).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let camera = Document::from_legacy(&input).map_err(|e| JsValue::from_str(&e))?;
        let mut s = self.shared.borrow_mut();
        let mut doc = s.editor.doc.clone();
        for c in 0..6 {
            doc.tracks[c] = camera.tracks[c].clone();
            doc.base[c] = camera.base[c];
        }
        if s.editor.doc != doc {
            s.editor.doc = doc;
            s.editor.undo.clear();
            s.editor.redo.clear();
            s.editor.selected.clear();
            s.playing = false;
        }
        if s.editor.duration != duration {
            s.range = None;
        }
        s.editor.time = s.editor.time.min(duration);
        s.editor.duration = duration;
        s.editor.fps = fps;
        s.enabled = enabled;
        s.disabled = disabled;
        if disabled || !enabled {
            s.playing = false;
        }
        Ok(())
    }
    pub fn set_objects(&self, catalog: &str, animation: &str) -> Result<(), JsValue> {
        let catalog: Vec<CatalogLayer> =
            serde_json::from_str(catalog).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let animation: LayerAnimation =
            serde_json::from_str(animation).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.shared
            .borrow_mut()
            .sync_objects(&catalog, &animation)
            .map_err(|e| JsValue::from_str(&e))?;
        Ok(())
    }
    pub fn configure(&self, duration: f64, fps: f64, enabled: bool, disabled: bool) {
        let mut s = self.shared.borrow_mut();
        if s.editor.duration != duration {
            s.range = None;
        }
        s.editor.duration = duration;
        s.editor.fps = fps;
        s.enabled = enabled;
        s.disabled = disabled;
        if disabled || !enabled {
            s.playing = false;
        }
        s.editor.time = s.editor.time.min(duration);
    }
    pub fn command(&self, cmd: &str) -> Result<(), JsValue> {
        let c = serde_json::from_str(cmd).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.shared.borrow_mut().cmd(c);
        Ok(())
    }
    pub fn snapshot(&self) -> String {
        let s = self.shared.borrow();
        json!({"points":s.editor.doc.to_legacy(),"animation":s.editor.doc.animation()}).to_string()
    }
    pub fn take_events(&self) -> String {
        json!(std::mem::take(&mut self.shared.borrow_mut().events)).to_string()
    }
    pub fn destroy(&self) {
        self.runner.destroy();
    }
}

struct TimelineUi {
    shared: Rc<RefCell<Shared>>,
    zoom: f64,
    start: f64,
    snap: bool,
    speed: bool,
    last: f64,
    drag_anchor: Option<String>,
    drag_origin_x: Option<f32>,
    marquee: Option<(Pos2, std::collections::BTreeSet<String>)>,
    curve_drag: bool,
    filter: String,
    collapsed: std::collections::BTreeSet<String>,
    known: std::collections::BTreeSet<String>,
    active_layer: Option<String>,
    bar_drag: Option<(String, u8, f32, f64, f64)>,
    animated_only: bool,
    label_width: f32,
    preset_duration: f64,
    retime_start: f64,
    retime_duration: f64,
    sequence_gap: f64,
}
impl TimelineUi {
    fn new(shared: Rc<RefCell<Shared>>) -> Self {
        Self {
            shared,
            zoom: 1.,
            start: 0.,
            snap: true,
            speed: false,
            last: 0.,
            drag_anchor: None,
            drag_origin_x: None,
            marquee: None,
            curve_drag: false,
            filter: String::new(),
            collapsed: Default::default(),
            known: Default::default(),
            active_layer: None,
            bar_drag: None,
            animated_only: false,
            label_width: 260.,
            preset_duration: 1.,
            retime_start: 0.,
            retime_duration: 2.,
            sequence_gap: 0.2,
        }
    }
    fn action(s: &mut Shared, op: &str) {
        s.cmd(json!({"op":op}));
    }
    fn shortcuts(&mut self, ctx: &Context, s: &mut Shared) {
        if ctx.egui_wants_keyboard_input() {
            return;
        }
        let events = ctx.input(|i| i.events.clone());
        for event in events {
            match event {
                Event::Copy => Self::action(s, "copy"),
                Event::Paste(text) => {
                    if text.len() > 2_000_000 {
                        s.error = "Clipboard grande demais".into();
                        continue;
                    }
                    if let Ok(clip) =
                        serde_json::from_str::<Vec<(String, mapanimator_core::Key)>>(&text)
                    {
                        if clip.len() <= 3000 && clip.iter().all(|(c, _)| c.len() <= 300) {
                            s.editor.clipboard = clip;
                            Self::action(s, "paste");
                        }
                    }
                }
                Event::Key {
                    key,
                    pressed: true,
                    modifiers,
                    repeat: false,
                    ..
                } => {
                    let m = modifiers.command || modifiers.ctrl;
                    match key{
                Key::Space if !m && !modifiers.alt=>Self::action(s,"play"),Key::K if !m && !modifiers.alt=>Self::action(s,"capture_request"),Key::G if !m && !modifiers.alt=>s.curves=!s.curves,Key::U if !m && !modifiers.alt=>self.animated_only=!self.animated_only,
                Key::F if !m && !modifiers.alt=>self.fit_selection(s),
                Key::B if !m && !modifiers.alt=>{let mut r=s.range.unwrap_or([0.,s.editor.duration]);if s.editor.time<r[1]{r[0]=s.editor.time;s.range=Some(r);}},
                Key::N if !m && !modifiers.alt=>{let mut r=s.range.unwrap_or([0.,s.editor.duration]);if s.editor.time>r[0]{r[1]=s.editor.time;s.range=Some(r);}},
                Key::Delete|Key::Backspace=>Self::action(s,"delete"),
                Key::A if m=>s.editor.selected=s.editor.doc.tracks.iter().flatten().map(|k|k.id.clone()).collect(),
                Key::Z if m=>Self::action(s,if modifiers.shift{"redo"}else{"undo"}),
                Key::D if m=>{Self::action(s,"copy");Self::action(s,"paste");},
                Key::F9=>s.cmd(json!({"op":"ease","mode":if modifiers.shift{if m{"out"}else{"in"}}else{"easy"}})),
                Key::ArrowLeft|Key::ArrowRight=>{let amount=if key==Key::ArrowLeft{-1.}else{1.}*if modifiers.shift{10.}else{1.};if s.editor.selected.is_empty(){s.cmd(json!({"op":"step","amount":amount}));}else{s.cmd(json!({"op":"move","delta":amount/s.editor.fps}));}},
                Key::Home=>Self::action(s,"start"),Key::End=>Self::action(s,"end"),Key::Escape=>{Self::action(s,"cancel");self.drag_anchor=None;self.marquee=None;s.editor.selected.clear();s.playing=false;},_=>{}
            }
                }
                _ => {}
            }
        }
        if ctx.input(|i| i.events.iter().any(|e| matches!(e, Event::Copy))) {
            ctx.copy_text(json!(s.editor.clipboard).to_string());
        }
    }
    fn toolbar(&mut self, ui: &mut Ui, s: &mut Shared) {
        ui.horizontal_wrapped(|ui| {
            ui.strong("TIMELINE");
            ui.weak("Camadas e propriedades");
            if ui
                .button(if s.playing { "Ⅱ Pausar" } else { "▶ Play" })
                .clicked()
            {
                Self::action(s, "play");
            }
            for (label, op) in [("|◀", "start"), ("◀", "previous"), ("▶|", "next")] {
                if ui.small_button(label).clicked() {
                    Self::action(s, op);
                }
            }
            if ui.button("◇ Capturar · K").clicked() {
                Self::action(s, "capture_request");
            }
            let mut time = s.editor.time;
            if ui
                .add(
                    DragValue::new(&mut time)
                        .speed(1. / s.editor.fps)
                        .range(0. ..=s.editor.duration)
                        .suffix(" s"),
                )
                .changed()
            {
                s.cmd(json!({"op":"seek","time":time}));
            }
            if ui
                .add_enabled(!s.editor.undo.is_empty(), Button::new("↶"))
                .clicked()
            {
                Self::action(s, "undo");
            }
            if ui
                .add_enabled(!s.editor.redo.is_empty(), Button::new("↷"))
                .clicked()
            {
                Self::action(s, "redo");
            }
            if ui.selectable_label(s.curves, "Graph Editor · G").clicked() {
                s.curves = !s.curves;
            }
            ui.checkbox(&mut self.snap, "Ímã");
            let old = self.zoom;
            for (label, factor) in [("−", 0.5), ("+", 2.)] {
                if ui.small_button(label).clicked() {
                    self.zoom = (self.zoom * factor).clamp(1., 64.);
                }
            }
            if old != self.zoom {
                self.start = (s.editor.time - (s.editor.time - self.start) * old / self.zoom)
                    .clamp(
                        0.,
                        (s.editor.duration - s.editor.duration / self.zoom).max(0.),
                    );
            }
            if ui.small_button("Ajustar").clicked() {
                self.zoom = 1.;
                self.start = 0.;
            }
        });
        self.workflow_toolbar(ui, s);
    }

    fn tracks(&mut self, ui: &mut Ui, s: &mut Shared) {
        self.start = self.start.clamp(
            0.,
            (s.editor.duration - s.editor.duration / self.zoom).max(0.),
        );
        let row = 29.;
        let label = self
            .label_width
            .min((ui.available_width() - 100.).max(110.));
        let mut groups: std::collections::BTreeMap<String, Vec<usize>> = Default::default();
        for (c, p) in s.editor.doc.properties.iter().enumerate() {
            groups.entry(p.layer.clone()).or_default().push(c);
        }
        let mut rows = Vec::new();
        let filter = self.filter.to_lowercase();
        for (li, layer) in s.editor.doc.layers.iter().enumerate() {
            let channels = groups.get(&layer.id).cloned().unwrap_or_default();
            if self.known.insert(layer.id.clone())
                && layer.kind != "camera"
                && layer.kind != "route"
                && !channels.iter().any(|c| !s.editor.doc.tracks[*c].is_empty())
            {
                self.collapsed.insert(layer.id.clone());
            }
            let visible: Vec<_> = channels
                .into_iter()
                .filter(|c| {
                    (!self.animated_only || !s.editor.doc.tracks[*c].is_empty())
                        && (filter.is_empty()
                            || layer.name.to_lowercase().contains(&filter)
                            || s.editor.doc.name(*c).to_lowercase().contains(&filter))
                })
                .collect();
            if visible.is_empty() && (self.animated_only || !filter.is_empty()) {
                continue;
            }
            rows.push((li, None));
            if !self.collapsed.contains(&layer.id) || !filter.is_empty() || self.animated_only {
                for c in visible {
                    rows.push((li, Some(c)));
                }
            }
        }
        let width = ui.available_width().max(label + 120.);
        let (rect, response) = ui.allocate_exact_size(
            vec2(width, row * (rows.len() + 1) as f32),
            Sense::click_and_drag(),
        );
        let lane = Rect::from_min_max(pos2(rect.left() + label, rect.top()), rect.max);
        let divider = Rect::from_min_max(
            pos2(lane.left() - 3., rect.top()),
            pos2(lane.left() + 3., rect.bottom()),
        );
        let split = ui.interact(divider, ui.id().with("property_divider"), Sense::drag());
        if split.hovered() || split.dragged() {
            ui.ctx().set_cursor_icon(CursorIcon::ResizeHorizontal);
        }
        if split.dragged() {
            self.label_width =
                (self.label_width + ui.input(|i| i.pointer.delta().x)).clamp(140., 420.);
        }
        if let Some(pointer) = ui
            .input(|i| i.pointer.hover_pos())
            .filter(|p| lane.contains(*p))
        {
            let factor = ui.input(|i| {
                let native: f64 = i
                    .events
                    .iter()
                    .filter_map(|e| {
                        if let Event::Zoom(v) = e {
                            Some(*v as f64)
                        } else {
                            None
                        }
                    })
                    .product();
                if native != 1. {
                    native
                } else if i.modifiers.ctrl || i.modifiers.command {
                    (i.smooth_scroll_delta.y as f64 * 0.01).exp()
                } else {
                    1.
                }
            });
            if factor.is_finite() && factor > 0. && factor != 1. {
                let fraction = ((pointer.x - lane.left()) / lane.width()).clamp(0., 1.) as f64;
                let anchor = self.start + fraction * s.editor.duration / self.zoom;
                self.zoom = (self.zoom * factor).clamp(1., 64.);
                self.start = (anchor - fraction * s.editor.duration / self.zoom).clamp(
                    0.,
                    (s.editor.duration - s.editor.duration / self.zoom).max(0.),
                );
                ui.input_mut(|i| i.smooth_scroll_delta.y = 0.);
            }
        }
        let pps = lane.width() as f64 / (s.editor.duration / self.zoom);
        let view_start = self.start;
        let x = |time: f64| lane.left() + ((time - view_start) * pps) as f32;
        let painter = ui.painter().with_clip_rect(rect);
        painter.rect_filled(rect, 0., Color32::from_rgb(29, 34, 40));
        let step = workflow_ui::ruler_step(
            s.editor.duration / self.zoom,
            lane.width() as f64,
            s.editor.fps,
        );
        let first = (self.start / step).ceil() as i64;
        let last = ((self.start + s.editor.duration / self.zoom) / step).floor() as i64;
        for i in first..=last {
            let t = i as f64 * step;
            let px = x(t);
            painter.line_segment(
                [pos2(px, rect.top()), pos2(px, rect.bottom())],
                Stroke::new(1., Color32::from_gray(55)),
            );
            painter.text(
                pos2(px + 3., rect.top() + 11.),
                Align2::LEFT_TOP,
                format!("{t:.2}s"),
                FontId::monospace(10.),
                Color32::GRAY,
            );
        }
        let ruler = Rect::from_min_max(lane.min, pos2(lane.right(), rect.top() + row));
        self.work_area(ui, s, &painter, ruler, pps);
        let rr = ui.interact(
            Rect::from_min_max(pos2(ruler.left(), ruler.top() + 11.), ruler.max),
            ui.id().with("ruler"),
            Sense::click_and_drag(),
        );
        if (rr.clicked() || rr.dragged())
            && let Some(pos) = rr.interact_pointer_pos()
        {
            s.cmd(json!({"op":"seek","time":((pos.x-lane.left())as f64/pps+self.start)}));
        }
        let mut hits = Vec::new();
        let mut on_key = false;
        for (row_index, (li, channel)) in rows.into_iter().enumerate() {
            let y = rect.top() + row * (row_index as f32 + 1.5);
            if y + row * 0.5 < ui.clip_rect().top() || y - row * 0.5 > ui.clip_rect().bottom() {
                continue;
            }
            let layer = s.editor.doc.layers[li].clone();
            let Some(c) = channel else {
                on_key |= self.layer_row(
                    ui,
                    s,
                    &painter,
                    &layer,
                    Rect::from_min_max(
                        pos2(rect.left(), y - row * 0.5),
                        pos2(rect.right(), y + row * 0.5),
                    ),
                    lane,
                    pps,
                );
                continue;
            };
            let locked = layer.locked;
            let property_name = s.editor.doc.name(c).to_owned();
            let color = Color32::from_rgb(
                [233, 120, 227, 130, 190, 100][c % 6],
                [140, 200, 190, 170, 150, 215][c % 6],
                [115, 165, 100, 235, 220, 210][c % 6],
            );
            painter.line_segment(
                [
                    pos2(rect.left(), y - row * 0.5),
                    pos2(rect.right(), y - row * 0.5),
                ],
                Stroke::new(1., Color32::from_gray(51)),
            );
            let capture = Rect::from_center_size(pos2(rect.left() + 15., y), vec2(22., row - 2.));
            let r = ui.interact(capture, ui.id().with(("capture", c)), Sense::click());
            painter.text(
                capture.center(),
                Align2::CENTER_CENTER,
                "◇",
                FontId::proportional(17.),
                color,
            );
            if r.clicked() && !locked {
                s.cmd(json!({"op":"capture_request","channels":[c]}));
            }
            let name = Rect::from_min_max(
                pos2(rect.left() + 30., y - row * 0.5),
                pos2(
                    lane.left() - if label >= 240. { 68. } else { 0. },
                    y + row * 0.5,
                ),
            );
            painter.with_clip_rect(name).text(
                name.left_center(),
                Align2::LEFT_CENTER,
                property_name.as_str(),
                FontId::proportional(11.),
                color,
            );
            if ui
                .interact(name, ui.id().with(("name", c)), Sense::click())
                .clicked()
            {
                self.active_layer = Some(layer.id.clone());
                let ids: std::collections::BTreeSet<String> = s.editor.doc.tracks[c]
                    .iter()
                    .map(|k| k.id.clone())
                    .collect();
                if ui.input(|i| i.modifiers.shift) {
                    if !ids.is_empty() && ids.iter().all(|id| s.editor.selected.contains(id)) {
                        s.editor.selected.retain(|id| !ids.contains(id));
                    } else {
                        s.editor.selected.extend(ids);
                    }
                } else {
                    s.editor.selected = ids;
                }
            }
            if label >= 240. {
                painter.text(
                    pos2(lane.left() - 9., y),
                    Align2::RIGHT_CENTER,
                    format!("{:.2}", s.editor.doc.sample_track(c, s.editor.time)),
                    FontId::monospace(10.),
                    Color32::LIGHT_GRAY,
                );
            }
            let keys = s.editor.doc.tracks[c].clone();
            for k in keys {
                let px = x(k.data.time.seconds());
                if px < lane.left() - 8. || px > lane.right() + 8. {
                    continue;
                }
                let pos = pos2(px, y);
                let hit = Rect::from_center_size(pos, vec2(17., 23.));
                hits.push((k.id.clone(), pos));
                let kr = ui.interact(
                    hit,
                    ui.id().with(&k.id),
                    if locked {
                        Sense::click()
                    } else {
                        Sense::click_and_drag()
                    },
                );
                on_key |= kr.hovered() || kr.dragged();
                let selected = s.editor.selected.contains(&k.id);
                draw_key(
                    &painter,
                    pos,
                    &k.data,
                    if selected {
                        Color32::from_rgb(255, 213, 120)
                    } else {
                        color
                    },
                );
                kr.clone().on_hover_text(format!(
                    "{}: {:.5}\n{:.4}s",
                    property_name.as_str(),
                    scalar(&k.data),
                    k.data.time.seconds()
                ));
                if kr.clicked() {
                    self.active_layer = Some(layer.id.clone());
                    if ui.input(|i| i.modifiers.shift) {
                        if !s.editor.selected.remove(&k.id) {
                            s.editor.selected.insert(k.id.clone());
                        }
                    } else {
                        s.editor.selected = [k.id.clone()].into_iter().collect();
                    }
                }
                if kr.double_clicked() {
                    s.curves = true;
                }
                if kr.drag_started() {
                    if !selected {
                        if !ui.input(|i| i.modifiers.shift) {
                            s.editor.selected.clear();
                        }
                        s.editor.selected.insert(k.id.clone());
                    }
                    self.drag_anchor = Some(k.id.clone());
                    self.drag_origin_x = kr.interact_pointer_pos().map(|p| p.x - kr.drag_delta().x);
                    Self::action(s, "begin");
                }
                if kr.dragged() {
                    s.cmd(json!({"op":"move","delta":(kr.interact_pointer_pos().map(|p|p.x).unwrap_or(0.)-self.drag_origin_x.unwrap_or(0.)) as f64/pps,"anchor":self.drag_anchor,"snap":self.snap||ui.input(|i|i.modifiers.shift),"tolerance":8./pps}));
                }
                if kr.drag_stopped() {
                    Self::action(s, "commit");
                    self.drag_anchor = None;
                }
                kr.context_menu(|ui| {
                    if !s.editor.selected.contains(&k.id) {
                        s.editor.selected = [k.id.clone()].into_iter().collect();
                    }
                    for (label, mode) in [
                        ("Linear", "linear"),
                        ("Hold", "hold"),
                        ("Easy Ease", "easy"),
                        ("Ease In", "in"),
                        ("Ease Out", "out"),
                        ("Auto Bézier", "auto"),
                        ("Continuous Bézier", "continuous"),
                    ] {
                        if ui.button(label).clicked() {
                            s.cmd(json!({"op":"ease","mode":mode}));
                            ui.close();
                        }
                    }
                    ui.separator();
                    for (label, op) in [
                        ("Copiar", "copy"),
                        ("Colar no cursor", "paste"),
                        ("Excluir", "delete"),
                        ("Inverter tempo", "reverse"),
                    ] {
                        if ui.button(label).clicked() {
                            Self::action(s, op);
                            ui.close();
                        }
                    }
                });
            }
        }
        let play = x(s.editor.time);
        if play >= lane.left() && play <= lane.right() {
            painter.line_segment(
                [pos2(play, rect.top()), pos2(play, rect.bottom())],
                Stroke::new(1.5, Color32::from_rgb(100, 210, 230)),
            );
        }
        if response.drag_started()
            && !on_key
            && let Some(pos) = response.interact_pointer_pos()
        {
            if pos.x >= lane.left() && pos.y > ruler.bottom() {
                self.marquee = Some((
                    pos - response.drag_delta(),
                    if ui.input(|i| i.modifiers.shift) {
                        s.editor.selected.clone()
                    } else {
                        Default::default()
                    },
                ));
            }
        }
        if let Some((origin, previous)) = &self.marquee {
            if let Some(pos) = response.interact_pointer_pos() {
                let box_rect = Rect::from_two_pos(*origin, pos);
                painter.rect_filled(
                    box_rect,
                    0.,
                    Color32::from_rgba_unmultiplied(100, 180, 220, 35),
                );
                painter.rect_stroke(
                    box_rect,
                    0.,
                    Stroke::new(1., Color32::LIGHT_BLUE),
                    StrokeKind::Inside,
                );
                s.editor.selected = previous
                    .iter()
                    .cloned()
                    .chain(
                        hits.iter()
                            .filter(|(_, p)| box_rect.contains(*p))
                            .map(|(id, _)| id.clone()),
                    )
                    .collect();
            }
            if response.drag_stopped() {
                self.marquee = None;
            }
        }
        if response.clicked()
            && !on_key
            && let Some(pos) = response.interact_pointer_pos()
        {
            if lane.contains(pos) {
                s.editor.selected.clear();
                s.cmd(json!({"op":"seek","time":(pos.x-lane.left())as f64/pps+self.start}));
            }
        }
        if response.hovered() {
            let scroll = ui.input(|i| i.smooth_scroll_delta.x);
            if scroll != 0. {
                self.start = (self.start - scroll as f64 / pps).clamp(
                    0.,
                    (s.editor.duration - s.editor.duration / self.zoom).max(0.),
                );
            }
        }
        if self.zoom > 1. {
            let end = (s.editor.duration - s.editor.duration / self.zoom).max(0.);
            ui.add(
                Slider::new(&mut self.start, 0. ..=end)
                    .text("Navegação horizontal")
                    .show_value(false),
            );
        }
    }
    fn inspector(&mut self, ui: &mut Ui, s: &mut Shared) {
        self.layer_inspector(ui, s);
        let active = s.editor.doc.tracks.iter().enumerate().find_map(|(c, t)| {
            t.iter()
                .position(|k| s.editor.selected.contains(&k.id))
                .map(|i| (c, i, t[i].clone()))
        });
        let Some((c, i, key)) = active else {
            ui.weak("Selecione keys para editar valores e curvas. Shift+clique / retângulo: seleção múltipla.");
            return;
        };
        ui.horizontal_wrapped(|ui| {
            ui.strong(format!(
                "{} / {}",
                s.editor.doc.layer_of(c).name,
                s.editor.doc.name(c)
            ));
            let mut value = scalar(&key.data);
            ui.label("Valor");
            if ui
                .add(
                    DragValue::new(&mut value)
                        .speed(if c == 0 || c == 1 { 0.0001 } else { 0.01 })
                        .range(s.editor.doc.bounds(c).0..=s.editor.doc.bounds(c).1),
                )
                .changed()
            {
                let selected = s.editor.selected.clone();
                s.editor.selected = [key.id.clone()].into_iter().collect();
                s.cmd(json!({"op":"value","value":value}));
                s.editor.selected = selected;
            }
            let mut time = key.data.time.seconds();
            ui.label("Tempo");
            if ui
                .add(
                    DragValue::new(&mut time)
                        .speed(1. / s.editor.fps)
                        .range(0. ..=s.editor.duration),
                )
                .changed()
            {
                let selected = s.editor.selected.clone();
                s.editor.selected = [key.id.clone()].into_iter().collect();
                s.cmd(json!({"op":"move","delta":time-key.data.time.seconds()}));
                s.editor.selected = selected;
            }
            if ui.small_button("Ir ao key").clicked() {
                s.cmd(json!({"op":"seek","time":time}));
            }
        });
        if !s.curves {
            return;
        }
        ui.horizontal_wrapped(|ui|{ui.strong("KEYFRAME VELOCITY");let mut ei=key.data.in_ease.first().copied().unwrap_or(Ease::EASY);let mut eo=key.data.out_ease.first().copied().unwrap_or(Ease::EASY);ui.label("Entrada: velocidade");let a=ui.add(DragValue::new(&mut ei.speed).speed(0.1));ui.label("influência %");let mut infi=ei.influence*100.;let b=ui.add(DragValue::new(&mut infi).range(0.1..=100.).speed(0.5));ui.label("Saída: velocidade");let d=ui.add(DragValue::new(&mut eo.speed).speed(0.1));ui.label("influência %");let mut info=eo.influence*100.;let e=ui.add(DragValue::new(&mut info).range(0.1..=100.).speed(0.5));if a.changed()||b.changed()||d.changed()||e.changed(){let selected=s.editor.selected.clone();s.editor.selected=[key.id.clone()].into_iter().collect();s.cmd(json!({"op":"velocity","in_speed":ei.speed,"in_influence":infi/100.,"out_speed":eo.speed,"out_influence":info/100.}));s.editor.selected=selected;}});
        ui.horizontal(|ui| {
            ui.selectable_value(&mut self.speed, false, "Value Graph");
            ui.selectable_value(&mut self.speed, true, "Speed Graph");
            ui.weak("Arraste as alças para editar velocidade e influência.");
        });
        let track = s.editor.doc.evaluated_keys(c);
        if track.len() < 2 {
            ui.weak("Adicione outro keyframe para formar um segmento.");
            return;
        }
        let seg = i.min(track.len() - 2);
        let a = &track[seg];
        let b = &track[seg + 1];
        let t0 = a.time.seconds();
        let t1 = b.time.seconds();
        let duration = t1 - t0;
        let values: Vec<f64> = (0..=100)
            .map(|n| {
                let time = t0 + duration * n as f64 / 100.;
                if self.speed {
                    s.editor.doc.velocity(c, time).abs()
                } else {
                    s.editor.doc.sample_track(c, time)
                }
            })
            .collect();
        let low = values.iter().copied().fold(f64::INFINITY, f64::min);
        let high = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let span = (high - low).max(0.001);
        let (outer, _) = ui.allocate_exact_size(vec2(ui.available_width(), 160.), Sense::hover());
        let rect = outer.shrink2(vec2(30., 20.));
        let painter = ui.painter().with_clip_rect(outer);
        painter.rect_filled(outer, 0., Color32::from_rgb(19, 25, 31));
        for n in 0..=4 {
            let y = rect.top() + rect.height() * n as f32 / 4.;
            painter.line_segment(
                [pos2(rect.left(), y), pos2(rect.right(), y)],
                Stroke::new(1., Color32::from_gray(45)),
            );
        }
        let y = |v: f64| rect.bottom() - ((v - low) / span) as f32 * rect.height();
        let xy = |u: f64, v: f64| pos2(rect.left() + u as f32 * rect.width(), y(v));
        let line: Vec<_> = values
            .iter()
            .enumerate()
            .map(|(n, v)| xy(n as f64 / 100., *v))
            .collect();
        painter.add(Shape::line(line, Stroke::new(2., Color32::LIGHT_BLUE)));
        painter.text(
            outer.left_top(),
            Align2::LEFT_TOP,
            format!("{high:.3} {}", if self.speed { "un/s" } else { "" }),
            FontId::monospace(10.),
            Color32::GRAY,
        );
        painter.text(
            outer.left_bottom(),
            Align2::LEFT_BOTTOM,
            format!("{t0:.3}s → {t1:.3}s"),
            FontId::monospace(10.),
            Color32::GRAY,
        );
        if !self.speed && a.out_interp != Interp::Hold {
            let eo = effectcraft_keyframe::side_ease(&track, seg, 0, false, true).unwrap_or(Ease {
                speed: (scalar(b) - scalar(a)) / duration,
                influence: 1. / 3.,
            });
            let ei =
                effectcraft_keyframe::side_ease(&track, seg + 1, 0, false, false).unwrap_or(Ease {
                    speed: (scalar(b) - scalar(a)) / duration,
                    influence: 1. / 3.,
                });
            let handles = [
                (
                    xy(eo.influence, scalar(a) + eo.speed * eo.influence * duration),
                    xy(0., scalar(a)),
                    true,
                    seg,
                ),
                (
                    xy(
                        1. - ei.influence,
                        scalar(b) - ei.speed * ei.influence * duration,
                    ),
                    xy(1., scalar(b)),
                    false,
                    seg + 1,
                ),
            ];
            for (pos, origin, out, index) in handles {
                painter.line_segment([origin, pos], Stroke::new(1., Color32::GOLD));
                painter.circle_filled(pos, 4., Color32::GOLD);
                let response = ui.interact(
                    Rect::from_center_size(pos, vec2(16., 16.)),
                    ui.id().with(("handle", out)),
                    Sense::drag(),
                );
                if response.drag_started() {
                    self.curve_drag = true;
                    Self::action(s, "begin");
                }
                if response.dragged()
                    && let Some(pointer) = response.interact_pointer_pos()
                {
                    let u = ((pointer.x - rect.left()) / rect.width()) as f64;
                    let v = low + ((rect.bottom() - pointer.y) / rect.height()) as f64 * span;
                    let influence = if out { u } else { 1. - u }.clamp(0.001, 1.);
                    let rate = if out {
                        (v - scalar(a)) / (influence * duration)
                    } else {
                        (scalar(b) - v) / (influence * duration)
                    };
                    let selected = s.editor.selected.clone();
                    s.editor.selected = [s.editor.doc.tracks[c][index].id.clone()]
                        .into_iter()
                        .collect();
                    s.cmd(if out {
                        json!({"op":"velocity","out_speed":rate,"out_influence":influence})
                    } else {
                        json!({"op":"velocity","in_speed":rate,"in_influence":influence})
                    });
                    s.editor.selected = selected;
                }
                if response.drag_stopped() {
                    self.curve_drag = false;
                    Self::action(s, "commit");
                }
            }
        }
    }
}
impl eframe::App for TimelineUi {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        let shared = self.shared.clone();
        let mut s = shared.borrow_mut();
        let now = ui.input(|i| i.time);
        let dt = (now - self.last).clamp(0., 0.1);
        self.last = now;
        if s.playing {
            let range = s.range.unwrap_or([0., s.editor.duration]);
            let mut time = s.editor.time + dt;
            if time >= range[1] {
                if s.looped {
                    time = range[0] + (time - range[0]) % (range[1] - range[0]).max(0.001);
                } else {
                    time = range[1];
                    s.playing = false;
                }
            }
            s.seek(time);
        }
        if s.disabled || !s.enabled {
            ui.weak(if s.disabled {
                "Renderização em andamento · edição suspensa"
            } else {
                "Theatre ativo · ative a timeline Rust para editar"
            });
        } else {
            self.shortcuts(ui.ctx(), &mut s);
        }
        let enabled = !s.disabled && s.enabled;
        ui.add_enabled_ui(enabled, |ui| {
            self.toolbar(ui, &mut s);
            if !s.error.is_empty() {
                ui.colored_label(Color32::LIGHT_RED, &s.error);
            }
            ui.separator();
            let available = ui.available_height();
            let track_height = if s.curves {
                (available * 0.45).max(80.)
            } else {
                (available - 100.).max(80.)
            };
            ScrollArea::vertical()
                .id_salt("property_tracks")
                .max_height(track_height)
                .show(ui, |ui| {
                    self.tracks(ui, &mut s);
                });
            ui.separator();
            ScrollArea::vertical()
                .id_salt("key_inspector")
                .show(ui, |ui| {
                    self.inspector(ui, &mut s);
                });
        });
        ui.ctx()
            .request_repaint_after(std::time::Duration::from_millis(if s.playing {
                8
            } else {
                40
            }));
    }
}
// EffectCraft-style split interpolation icons: keyframe::KeyIcon is the upstream model.
fn draw_key(p: &Painter, pos: Pos2, key: &effectcraft_keyframe::Keyframe, color: Color32) {
    use effectcraft_keyframe::KeyHalf;
    let icon = key.icon();
    for (left, half) in [(true, icon.left), (false, icon.right)] {
        let sign = if left { -1. } else { 1. };
        let points = match half {
            KeyHalf::Linear => vec![
                pos + vec2(0., -6.),
                pos + vec2(sign * 6., 0.),
                pos + vec2(0., 6.),
            ],
            KeyHalf::Hold => vec![
                pos + vec2(0., -5.),
                pos + vec2(sign * 5., -5.),
                pos + vec2(sign * 5., 5.),
                pos + vec2(0., 5.),
            ],
            KeyHalf::Bezier => vec![
                pos + vec2(0., -6.),
                pos + vec2(sign * 5., -6.),
                pos + vec2(sign * 2., 0.),
                pos + vec2(sign * 5., 6.),
                pos + vec2(0., 6.),
            ],
            KeyHalf::Auto => {
                p.circle_filled(pos, 5., color);
                continue;
            }
        };
        p.add(Shape::convex_polygon(points, color, Stroke::NONE));
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn frame(
        ctx: &Context,
        view: &mut TimelineUi,
        shared: &Rc<RefCell<Shared>>,
        events: Vec<Event>,
        time: f64,
    ) -> Pos2 {
        let mut position = Pos2::ZERO;
        let mut output = ctx.run_ui(
            RawInput {
                screen_rect: Some(Rect::from_min_size(Pos2::ZERO, vec2(1000., 700.))),
                time: Some(time),
                events,
                ..Default::default()
            },
            |ui| {
                let ctx = ui.ctx().clone();
                {
                    let r = ui.available_rect_before_wrap();
                    let s = &mut shared.borrow_mut();
                    position = pos2(
                        r.left() + 172. + (r.width() - 172.) * 2. / 3.,
                        r.top() + 29. * 4.5,
                    );
                    view.shortcuts(&ctx, s);
                    view.tracks(ui, s);
                }
            },
        );
        output.textures_delta.clear();
        position
    }
    fn setup() -> (Context, TimelineUi, Rc<RefCell<Shared>>) {
        let mut e = Editor::default();
        e.duration = 3.;
        e.time = 0.;
        let vals = [0., 0., 4., 0., 0., 0.];
        e.command(json!({"op":"capture","values":vals})).unwrap();
        e.time = 2.;
        e.command(json!({"op":"capture","values":[10.,10.,10.,10.,10.,1.]}))
            .unwrap();
        e.time = 0.;
        e.selected.clear();
        e.undo.clear();
        let shared = Rc::new(RefCell::new(Shared {
            editor: e,
            enabled: true,
            ..Default::default()
        }));
        let mut view = TimelineUi::new(shared.clone());
        view.label_width = 172.;
        (Context::default(), view, shared)
    }
    #[test]
    fn egui_drag_keeps_property_identity_and_commits_one_undo() {
        let (ctx, mut view, s) = setup();
        let p = frame(&ctx, &mut view, &s, vec![], 0.);
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(p)], 0.01);
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: p,
                button: PointerButton::Primary,
                pressed: true,
                modifiers: Modifiers::NONE,
            }],
            0.02,
        );
        let q = p - vec2(120., 0.);
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(q)], 0.03);
        let q = p - vec2(160., 0.);
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(q)], 0.04);
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: q,
                button: PointerButton::Primary,
                pressed: false,
                modifiers: Modifiers::NONE,
            }],
            0.05,
        );
        let s = s.borrow();
        assert!(s.editor.doc.tracks[2][1].data.time.seconds() < 1.5);
        assert_eq!(s.editor.doc.tracks[0][1].data.time.seconds(), 2.);
        assert_eq!(s.editor.undo.len(), 1);
        assert!(!s.events.is_empty());
    }
    #[test]
    fn egui_f9_and_undo_use_the_same_editor_state() {
        let (ctx, mut view, s) = setup();
        let id = s.borrow().editor.doc.tracks[2][0].id.clone();
        s.borrow_mut().editor.selected.insert(id);
        let event = Event::Key {
            key: Key::F9,
            physical_key: None,
            pressed: true,
            repeat: false,
            modifiers: Modifiers::NONE,
        };
        frame(&ctx, &mut view, &s, vec![event], 0.);
        assert_eq!(
            s.borrow().editor.doc.tracks[2][0].data.out_interp,
            Interp::Bezier
        );
        s.borrow_mut().cmd(json!({"op":"undo"}));
        assert_eq!(
            s.borrow().editor.doc.tracks[2][0].data.out_interp,
            Interp::Linear
        );
    }
    #[test]
    fn egui_marquee_selects_multiple_tracks_and_delete_undo_restores_them() {
        let (ctx, mut view, s) = setup();
        frame(&ctx, &mut view, &s, vec![], 0.);
        let p = pos2(680., 60.);
        let q = pos2(800., 112.);
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(p)], 0.01);
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: p,
                button: PointerButton::Primary,
                pressed: true,
                modifiers: Modifiers::NONE,
            }],
            0.02,
        );
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(q)], 0.03);
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: q,
                button: PointerButton::Primary,
                pressed: false,
                modifiers: Modifiers::NONE,
            }],
            0.04,
        );
        assert_eq!(s.borrow().editor.selected.len(), 2);
        s.borrow_mut().cmd(json!({"op":"delete"}));
        assert_eq!(s.borrow().editor.doc.tracks[0].len(), 1);
        assert_eq!(s.borrow().editor.doc.tracks[1].len(), 1);
        s.borrow_mut().cmd(json!({"op":"undo"}));
        assert_eq!(s.borrow().editor.doc.tracks[0].len(), 2);
        assert_eq!(s.borrow().editor.doc.tracks[1].len(), 2);
    }
    fn graph_frame(
        ctx: &Context,
        view: &mut TimelineUi,
        s: &Rc<RefCell<Shared>>,
        events: Vec<Event>,
        time: f64,
    ) -> Vec<Pos2> {
        let mut output = ctx.run_ui(
            RawInput {
                screen_rect: Some(Rect::from_min_size(Pos2::ZERO, vec2(1000., 700.))),
                time: Some(time),
                events,
                ..Default::default()
            },
            |ui| view.inspector(ui, &mut s.borrow_mut()),
        );
        let positions = output
            .shapes
            .iter()
            .filter_map(|shape| {
                if let Shape::Circle(c) = &shape.shape {
                    if c.fill == Color32::GOLD && c.radius == 4. {
                        Some(c.center)
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();
        output.textures_delta.clear();
        positions
    }
    #[test]
    fn egui_curve_handle_edits_native_velocity_in_one_gesture() {
        let (ctx, mut view, s) = setup();
        let id = s.borrow().editor.doc.tracks[2][0].id.clone();
        s.borrow_mut().editor.selected.insert(id);
        s.borrow_mut().cmd(json!({"op":"ease","mode":"easy"}));
        s.borrow_mut().editor.undo.clear();
        s.borrow_mut().curves = true;
        let handles = graph_frame(&ctx, &mut view, &s, vec![], 0.);
        assert_eq!(handles.len(), 2);
        let p = handles[0];
        let q = p + vec2(30., -20.);
        graph_frame(&ctx, &mut view, &s, vec![Event::PointerMoved(p)], 0.01);
        graph_frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: p,
                button: PointerButton::Primary,
                pressed: true,
                modifiers: Modifiers::NONE,
            }],
            0.02,
        );
        graph_frame(&ctx, &mut view, &s, vec![Event::PointerMoved(q)], 0.03);
        graph_frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: q,
                button: PointerButton::Primary,
                pressed: false,
                modifiers: Modifiers::NONE,
            }],
            0.04,
        );
        assert!(s.borrow().editor.doc.tracks[2][0].data.out_ease[0].speed > 0.);
        assert_eq!(s.borrow().editor.undo.len(), 1);
        s.borrow_mut().cmd(json!({"op":"undo"}));
        assert_eq!(
            s.borrow().editor.doc.tracks[2][0].data.out_ease[0].speed,
            0.
        );
    }
    fn pin_catalog() -> Vec<CatalogLayer> {
        serde_json::from_value(json!([{"id":"pin:a","name":"Cidade","kind":"pin","values":{"lng":-46.,"lat":-23.,"opacity":1.,"scale":1.,"rotation":0.}}])).unwrap()
    }
    fn click(ctx: &Context, view: &mut TimelineUi, s: &Rc<RefCell<Shared>>, p: Pos2, time: f64) {
        frame(ctx, view, s, vec![Event::PointerMoved(p)], time);
        frame(
            ctx,
            view,
            s,
            vec![Event::PointerButton {
                pos: p,
                button: PointerButton::Primary,
                pressed: true,
                modifiers: Modifiers::NONE,
            }],
            time + 0.01,
        );
        frame(
            ctx,
            view,
            s,
            vec![Event::PointerButton {
                pos: p,
                button: PointerButton::Primary,
                pressed: false,
                modifiers: Modifiers::NONE,
            }],
            time + 0.02,
        );
    }
    #[test]
    fn egui_object_tree_capture_and_lock_are_connected_to_property_identity() {
        let (ctx, mut view, s) = setup();
        s.borrow_mut()
            .sync_objects(&pin_catalog(), &LayerAnimation::default())
            .unwrap();
        frame(&ctx, &mut view, &s, vec![], 0.);
        assert!(view.collapsed.contains("pin:a"));
        click(&ctx, &mut view, &s, pos2(12., 275.5), 0.01);
        assert!(!view.collapsed.contains("pin:a"));
        s.borrow_mut().events.clear();
        click(&ctx, &mut view, &s, pos2(15., 362.5), 0.1);
        assert!(
            s.borrow()
                .events
                .iter()
                .any(|e| e["type"] == "capture" && e["properties"] == json!(["pin:a/opacity"]))
        );
        click(&ctx, &mut view, &s, pos2(62., 275.5), 0.2);
        assert!(
            s.borrow()
                .editor
                .doc
                .layers
                .iter()
                .find(|l| l.id == "pin:a")
                .unwrap()
                .locked
        );
        s.borrow_mut().events.clear();
        click(&ctx, &mut view, &s, pos2(15., 362.5), 0.3);
        assert!(!s.borrow().events.iter().any(|e| e["type"] == "capture"));
    }
    #[test]
    fn egui_trim_handle_changes_the_interval_once_without_moving_camera_keys() {
        let (ctx, mut view, s) = setup();
        s.borrow_mut()
            .sync_objects(&pin_catalog(), &LayerAnimation::default())
            .unwrap();
        frame(&ctx, &mut view, &s, vec![], 0.);
        let p = pos2(997., 275.5);
        let q = pos2(721., 275.5);
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(p)], 0.01);
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: p,
                button: PointerButton::Primary,
                pressed: true,
                modifiers: Modifiers::NONE,
            }],
            0.02,
        );
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(q)], 0.03);
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: q,
                button: PointerButton::Primary,
                pressed: false,
                modifiers: Modifiers::NONE,
            }],
            0.04,
        );
        let b = s.borrow();
        let layer = b
            .editor
            .doc
            .layers
            .iter()
            .find(|l| l.id == "pin:a")
            .unwrap();
        assert!((layer.end - 2.).abs() < 0.04);
        assert_eq!(b.editor.undo.len(), 1);
        assert_eq!(b.editor.doc.tracks[0][1].data.time.seconds(), 2.);
    }
    #[test]
    fn catalog_refresh_preserves_pending_native_edits_and_rebases_history() {
        let mut s = Shared {
            enabled: true,
            ..Default::default()
        };
        let mut catalog = pin_catalog();
        s.sync_objects(&catalog, &LayerAnimation::default())
            .unwrap();
        s.editor.time = 1.;
        s.cmd(json!({"op":"capture","values":[0.,0.,5.,0.,0.,1.],"properties":["pin:a/opacity"],"propertyValues":{"pin:a/opacity":0.2}}));
        assert_eq!(s.editor.undo.len(), 1);
        catalog[0].name = "Renomeada".into();
        catalog[0].values.insert("opacity".into(), 0.4);
        s.sync_objects(&catalog, &LayerAnimation::default())
            .unwrap();
        assert_eq!(s.editor.doc.animation().tracks.len(), 1);
        assert_eq!(s.editor.undo.len(), 1);
        s.cmd(json!({"op":"undo"}));
        assert!(s.editor.doc.animation().tracks.is_empty());
        assert_eq!(
            s.editor
                .doc
                .layers
                .iter()
                .find(|l| l.id == "pin:a")
                .unwrap()
                .name,
            "Renomeada"
        );
    }
    #[test]
    fn egui_layer_body_moves_its_keys_with_one_undo() {
        let (ctx, mut view, s) = setup();
        s.borrow_mut()
            .sync_objects(&pin_catalog(), &LayerAnimation::default())
            .unwrap();
        for (time, value) in [(1., 1.), (2., 0.)] {
            s.borrow_mut().editor.time = time;
            s.borrow_mut().cmd(json!({"op":"capture","values":[0.,0.,5.,0.,0.,1.],"properties":["pin:a/opacity"],"propertyValues":{"pin:a/opacity":value}}));
        }
        s.borrow_mut()
            .cmd(json!({"op":"layer","id":"pin:a","start":1.,"end":2.}));
        s.borrow_mut().editor.undo.clear();
        s.borrow_mut().editor.time = 0.;
        frame(&ctx, &mut view, &s, vec![], 0.);
        let p = pos2(586., 275.5);
        let q = p + vec2(138., 0.);
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(p)], 0.01);
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: p,
                button: PointerButton::Primary,
                pressed: true,
                modifiers: Modifiers::NONE,
            }],
            0.02,
        );
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerMoved(p + vec2(70., 0.))],
            0.03,
        );
        frame(&ctx, &mut view, &s, vec![Event::PointerMoved(q)], 0.04);
        frame(
            &ctx,
            &mut view,
            &s,
            vec![Event::PointerButton {
                pos: q,
                button: PointerButton::Primary,
                pressed: false,
                modifiers: Modifiers::NONE,
            }],
            0.05,
        );
        let b = s.borrow();
        let anim = b.editor.doc.animation();
        assert_eq!(anim.tracks[0].keys[0].data.time.seconds(), 1.5);
        assert_eq!(anim.tracks[0].keys[1].data.time.seconds(), 2.5);
        assert_eq!(b.editor.undo.len(), 1);
    }
    #[test]
    fn interval_inspector_handles_layers_outside_a_shortened_composition() {
        let (ctx, mut view, s) = setup();
        s.borrow_mut()
            .sync_objects(&pin_catalog(), &LayerAnimation::default())
            .unwrap();
        s.borrow_mut()
            .cmd(json!({"op":"layer","id":"pin:a","start":5.,"end":6.}));
        view.active_layer = Some("pin:a".into());
        let mut output = ctx.run_ui(
            RawInput {
                screen_rect: Some(Rect::from_min_size(Pos2::ZERO, vec2(1000., 700.))),
                ..Default::default()
            },
            |ui| view.inspector(ui, &mut s.borrow_mut()),
        );
        output.textures_delta.clear();
        assert_eq!(s.borrow().editor.doc.layers.last().unwrap().start, 5.);
    }
}
