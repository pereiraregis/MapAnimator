use effectcraft_keyframe::{Ease, Interp};
use eframe::egui::*;
use mapanimator_core::{BOUNDS, Document, Editor, NAMES, scalar};
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
}
impl Shared {
    fn seek(&mut self, t: f64) {
        self.editor.time = t.clamp(0., self.editor.duration);
        self.events.push(json!({"type":"seek","time":self.editor.time,"values":self.editor.doc.sample(self.editor.time)}));
    }
    fn emit(&mut self) {
        self.events
            .push(json!({"type":"points","points":self.editor.doc.to_legacy()}));
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
                    self.events
                        .push(json!({"type":"capture","channels":c["channels"]}));
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
        let doc = Document::from_legacy(&input).map_err(|e| JsValue::from_str(&e))?;
        let mut s = self.shared.borrow_mut();
        if s.editor.doc != doc {
            s.editor.doc = doc;
            s.editor.undo.clear();
            s.editor.redo.clear();
            s.editor.selected.clear();
            s.playing = false;
        }
        s.editor.duration = duration;
        s.editor.fps = fps;
        s.enabled = enabled;
        s.disabled = disabled;
        if disabled || !enabled {
            s.playing = false;
        }
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
                    if let Ok(clip) =
                        serde_json::from_str::<Vec<(usize, mapanimator_core::Key)>>(&text)
                    {
                        if clip.len() <= 3000 && clip.iter().all(|(c, _)| *c < 6) {
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
                Key::Space=>Self::action(s,"play"),Key::K=>Self::action(s,"capture_request"),Key::G=>s.curves=!s.curves,
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
            ui.weak("Rust · egui / EffectCraft");
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
        ui.horizontal_wrapped(|ui| {
            ui.label(format!("{} keys selecionados", s.editor.selected.len()));
            for (label, op) in [
                ("Copiar", "copy"),
                ("Colar", "paste"),
                ("Excluir", "delete"),
            ] {
                if ui.small_button(label).clicked() {
                    Self::action(s, op);
                }
            }
            for (label, mode) in [
                ("Linear", "linear"),
                ("Hold", "hold"),
                ("Easy Ease · F9", "easy"),
                ("Auto Bézier", "auto"),
            ] {
                if ui.small_button(label).clicked() {
                    s.cmd(json!({"op":"ease","mode":mode}));
                }
            }
            ui.add(
                TextEdit::singleline(&mut self.filter)
                    .hint_text("Filtrar propriedades")
                    .desired_width(125.),
            );
            let mut range = s.range.unwrap_or([0., s.editor.duration]);
            ui.label("Prévia");
            let a = ui.add(
                DragValue::new(&mut range[0])
                    .speed(1. / s.editor.fps)
                    .range(0. ..=s.editor.duration),
            );
            let b = ui.add(
                DragValue::new(&mut range[1])
                    .speed(1. / s.editor.fps)
                    .range(0. ..=s.editor.duration),
            );
            if a.changed() || b.changed() {
                if range[1] > range[0] {
                    s.range = Some(range);
                    s.playing = false;
                }
            }
            ui.checkbox(&mut s.looped, "Loop");
        });
    }
    fn tracks(&mut self, ui: &mut Ui, s: &mut Shared) {
        let row = 29.;
        let label = 172.;
        let width = ui.available_width().max(label + 120.);
        let (rect, response) =
            ui.allocate_exact_size(vec2(width, row * 8.), Sense::click_and_drag());
        let lane = Rect::from_min_max(pos2(rect.left() + label, rect.top()), rect.max);
        let pps = lane.width() as f64 / (s.editor.duration / self.zoom);
        let x = |time: f64| lane.left() + ((time - self.start) * pps) as f32;
        let painter = ui.painter().with_clip_rect(rect);
        painter.rect_filled(rect, 0., Color32::from_rgb(29, 34, 40));
        for i in 0..=8 {
            let t = self.start + i as f64 * s.editor.duration / self.zoom / 8.;
            let px = x(t);
            painter.line_segment(
                [pos2(px, rect.top()), pos2(px, rect.bottom())],
                Stroke::new(1., Color32::from_gray(55)),
            );
            painter.text(
                pos2(px + 3., rect.top() + 4.),
                Align2::LEFT_TOP,
                format!("{t:.2}s"),
                FontId::monospace(10.),
                Color32::GRAY,
            );
        }
        let ruler = Rect::from_min_max(lane.min, pos2(lane.right(), rect.top() + row));
        let rr = ui.interact(ruler, ui.id().with("ruler"), Sense::click_and_drag());
        if (rr.clicked() || rr.dragged())
            && let Some(pos) = rr.interact_pointer_pos()
        {
            s.cmd(json!({"op":"seek","time":((pos.x-lane.left())as f64/pps+self.start)}));
        }
        painter.text(
            pos2(rect.left() + 8., rect.top() + row + 5.),
            Align2::LEFT_TOP,
            "▾ Câmera / Rota",
            FontId::proportional(12.),
            Color32::LIGHT_GRAY,
        );
        let mut hits = Vec::new();
        let mut on_key = false;
        for c in 0..6 {
            let y = rect.top() + row * (c as f32 + 2.5);
            let color = Color32::from_rgb(
                [233, 120, 227, 130, 190, 100][c],
                [140, 200, 190, 170, 150, 215][c],
                [115, 165, 100, 235, 220, 210][c],
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
            if r.clicked() {
                s.cmd(json!({"op":"capture_request","channels":[c]}));
            }
            let name = Rect::from_min_max(
                pos2(rect.left() + 30., y - row * 0.5),
                pos2(lane.left(), y + row * 0.5),
            );
            painter.text(
                name.left_center(),
                Align2::LEFT_CENTER,
                NAMES[c],
                FontId::proportional(11.),
                color,
            );
            if ui
                .interact(name, ui.id().with(("name", c)), Sense::click())
                .clicked()
            {
                s.editor.selected = s.editor.doc.tracks[c]
                    .iter()
                    .map(|k| k.id.clone())
                    .collect();
            }
            if !self.filter.is_empty()
                && !NAMES[c]
                    .to_lowercase()
                    .contains(&self.filter.to_lowercase())
            {
                continue;
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
                let kr = ui.interact(hit, ui.id().with(&k.id), Sense::click_and_drag());
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
                    NAMES[c],
                    scalar(&k.data),
                    k.data.time.seconds()
                ));
                if kr.clicked() {
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
            ui.strong(NAMES[c]);
            let mut value = scalar(&key.data);
            ui.label("Valor");
            if ui
                .add(
                    DragValue::new(&mut value)
                        .speed(if c == 0 || c == 1 { 0.0001 } else { 0.01 })
                        .range(BOUNDS[c].0..=BOUNDS[c].1),
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
        ui.add_enabled_ui(enabled,|ui|{ScrollArea::vertical().show(ui,|ui|{self.toolbar(ui,&mut s);ui.separator();self.tracks(ui,&mut s);ui.separator();self.inspector(ui,&mut s);if !s.error.is_empty(){ui.colored_label(Color32::LIGHT_RED,&s.error);}ui.weak("F9 Easy Ease · Shift+F9 entrada · Ctrl+Shift+F9 saída · Ctrl+C/V · Ctrl+Z · Delete");});});
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
        (Context::default(), TimelineUi::new(shared.clone()), shared)
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
}
