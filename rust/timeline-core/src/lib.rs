// MapAnimator editor state. Interpolation/easing uses the unmodified EffectCraft crates.
use effectcraft_keyframe::{self as animation, Ease, Interp, Keyframe, Value};
use effectcraft_time::Tick;
use serde::{Deserialize, Serialize};
use serde_json::{Value as Json, json};
use std::collections::BTreeSet;
mod objects;
pub use objects::{CatalogLayer, Layer, LayerAnimation, PropertySpec};

pub const CHANNELS: [&str; 6] = ["lng", "lat", "zoom", "pitch", "bearing", "pathProgress"];
pub const NAMES: [&str; 6] = [
    "Longitude",
    "Latitude",
    "Zoom",
    "Inclinação",
    "Rotação",
    "Revelação da rota",
];
pub const BOUNDS: [(f64, f64); 6] = [
    (-180., 180.),
    (-85., 85.),
    (0., 24.),
    (0., 85.),
    (-180., 180.),
    (0., 1.),
];
pub fn wrap(v: f64) -> f64 {
    (v + 180.).rem_euclid(360.) - 180.
}
pub fn scalar(k: &Keyframe) -> f64 {
    if let Value::Scalar(v) = k.value {
        v
    } else {
        0.
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Key {
    pub id: String,
    pub data: Keyframe,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Document {
    pub tracks: Vec<Vec<Key>>,
    pub base: Vec<f64>,
    pub properties: Vec<PropertySpec>,
    pub layers: Vec<Layer>,
    pub next_id: u64,
}
impl Default for Document {
    fn default() -> Self {
        Self {
            tracks: vec![vec![]; 6],
            base: vec![0., 0., 5., 0., 0., 1.],
            properties: objects::camera_properties(),
            layers: vec![
                Layer::new("camera", "Câmera", "camera"),
                Layer::new("route", "Rota", "route"),
            ],
            next_id: 1,
        }
    }
}
impl Document {
    pub fn new_id(&mut self) -> String {
        loop {
            let id = format!("rust-key-{}", self.next_id);
            self.next_id += 1;
            if !self.tracks.iter().flatten().any(|k| k.id == id) {
                return id;
            }
        }
    }
    pub fn evaluated_keys(&self, channel: usize) -> Vec<Keyframe> {
        let mut keys: Vec<_> = self.tracks[channel]
            .iter()
            .map(|k| k.data.clone())
            .collect();
        if self.properties[channel].angular {
            for i in 1..keys.len() {
                keys[i].value = Value::Scalar(
                    scalar(&keys[i - 1]) + wrap(scalar(&keys[i]) - scalar(&keys[i - 1])),
                );
            }
        }
        keys
    }
    pub fn sample_track(&self, channel: usize, time: f64) -> f64 {
        match animation::evaluate(
            &self.evaluated_keys(channel),
            Tick::from_seconds_f64(time),
            false,
        ) {
            Some(Value::Scalar(v)) => v,
            _ => self.base[channel],
        }
    }
    pub fn sample(&self, time: f64) -> [f64; 6] {
        let mut values = std::array::from_fn(|c| {
            let v = self.sample_track(c, time);
            if self.properties[c].angular {
                wrap(v)
            } else {
                let (lo, hi) = self.bounds(c);
                v.clamp(lo, hi)
            }
        });
        if !self
            .layers
            .iter()
            .find(|l| l.id == "route")
            .is_none_or(|l| l.visible(time))
        {
            values[5] = 0.;
        }
        values
    }
    pub fn velocity(&self, channel: usize, time: f64) -> f64 {
        animation::velocity(
            &self.evaluated_keys(channel),
            Tick::from_seconds_f64(time),
            false,
        )
        .first()
        .copied()
        .unwrap_or(0.)
    }
    pub fn validate(&self) -> Result<(), String> {
        self.validate_layers()?;
        let mut ids = BTreeSet::new();
        if self
            .tracks
            .iter()
            .flatten()
            .map(|k| k.data.time)
            .collect::<BTreeSet<_>>()
            .len()
            > 500
        {
            return Err("Limite de 500 tempos distintos na cena".into());
        }
        if self
            .base
            .iter()
            .enumerate()
            .any(|(c, v)| !v.is_finite() || *v < self.bounds(c).0 || *v > self.bounds(c).1)
        {
            return Err("Câmera base inválida".into());
        }
        if self.tracks.iter().map(Vec::len).sum::<usize>() > 3000 {
            return Err("Limite de 3.000 keyframes.".into());
        }
        for (c, track) in self.tracks.iter().enumerate() {
            let mut last = None;
            for k in track {
                let t = k.data.time.seconds();
                let v = scalar(&k.data);
                if !matches!(k.data.value, Value::Scalar(_))
                    || !v.is_finite()
                    || v < self.bounds(c).0
                    || v > self.bounds(c).1
                    || !(0. ..=600.).contains(&t)
                    || last.is_some_and(|prev| prev >= k.data.time)
                    || k.id.is_empty()
                    || k.id.len() > 200
                    || !ids.insert(k.id.clone())
                {
                    return Err("Keyframe inválido ou colisão na mesma propriedade.".into());
                }
                if k.data.in_ease.iter().chain(&k.data.out_ease).any(|e| {
                    !e.speed.is_finite()
                        || !e.influence.is_finite()
                        || !(0.001..=1.).contains(&e.influence)
                        || e.speed.abs() > 1e9
                }) {
                    return Err("Velocidade/influência inválida.".into());
                }
                last = Some(k.data.time);
            }
        }
        Ok(())
    }
    pub fn from_legacy(points: &Json) -> Result<Self, String> {
        let list = points.as_array().ok_or("Timeline inválida")?;
        if list.len() > 3000 {
            return Err("Timeline grande demais".into());
        }
        let mut doc = Self::default();
        if let Some(p) = list.first() {
            for (c, name) in CHANNELS.iter().enumerate() {
                doc.base[c] = p[*name].as_f64().ok_or("Valor de câmera inválido")?;
            }
        }
        for (index, p) in list.iter().enumerate() {
            let time = p["time"]
                .as_f64()
                .filter(|t| t.is_finite() && (0. ..=600.).contains(t))
                .ok_or("Tempo inválido")?;
            for (c, name) in CHANNELS.iter().enumerate() {
                if let Some(channels) = p["channels"].as_array() {
                    if !channels.iter().any(|v| v.as_str() == Some(name)) {
                        continue;
                    }
                }
                let value = p[*name].as_f64().ok_or("Valor inválido")?;
                let mut data = if p["native"][*name].is_object() {
                    serde_json::from_value(p["native"][*name].clone())
                        .map_err(|_| "Keyframe Rust inválido")?
                } else {
                    Keyframe::new(Tick::from_seconds_f64(time), Value::Scalar(value))
                };
                data.time = Tick::from_seconds_f64(time);
                data.value = Value::Scalar(value);
                let id = p["keyIds"][*name]
                    .as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| {
                        format!(
                            "{}:{}",
                            p["id"]
                                .as_str()
                                .map(str::to_owned)
                                .unwrap_or(index.to_string()),
                            name
                        )
                    });
                doc.tracks[c].push(Key { id, data });
            }
        }
        for c in 0..6 {
            doc.tracks[c].sort_by_key(|k| k.data.time);
            for i in 0..doc.tracks[c].len().saturating_sub(1) {
                let time = doc.tracks[c][i].data.time.seconds();
                let p = list
                    .iter()
                    .find(|p| (p["time"].as_f64().unwrap_or(-1.) - time).abs() < 1e-8)
                    .ok_or("Tempo ausente")?;
                if p["native"][CHANNELS[c]].is_object() {
                    continue;
                }
                let settings = if p["interpolation"][CHANNELS[c]].is_object() {
                    &p["interpolation"][CHANNELS[c]]
                } else {
                    p
                };
                let easing = settings["easing"].as_str().unwrap_or("linear");
                if easing == "hold" {
                    doc.tracks[c][i].data.out_interp = Interp::Hold;
                    continue;
                }
                let curve = match easing {
                    "smooth" => Some([1. / 3., 0., 2. / 3., 1.]),
                    "easeIn" => Some([1. / 3., 0., 2. / 3., 1. / 3.]),
                    "easeOut" => Some([1. / 3., 2. / 3., 2. / 3., 1.]),
                    "bezier" => {
                        let a = settings["curve"].as_array().ok_or("Curva ausente")?;
                        if a.len() != 4 {
                            return Err("Curva inválida".into());
                        }
                        Some(std::array::from_fn(|i| a[i].as_f64().unwrap_or(f64::NAN)))
                    }
                    _ => None,
                };
                if let Some([x1, y1, x2, y2]) = curve {
                    if [x1, y1, x2, y2]
                        .iter()
                        .any(|v| !v.is_finite() || !(0. ..=1.).contains(v))
                    {
                        return Err("Curva inválida".into());
                    }
                    let a = &doc.tracks[c][i].data;
                    let b = &doc.tracks[c][i + 1].data;
                    let delta = if c == 0 || c == 4 {
                        wrap(scalar(b) - scalar(a))
                    } else {
                        scalar(b) - scalar(a)
                    };
                    let rate = delta / (b.time.seconds() - a.time.seconds()).max(1e-12);
                    let out = Ease {
                        speed: rate * y1 / x1.max(0.001),
                        influence: x1.max(0.001),
                    };
                    let incoming = Ease {
                        speed: rate * (1. - y2) / (1. - x2).max(0.001),
                        influence: (1. - x2).max(0.001),
                    };
                    doc.tracks[c][i].data.out_interp = Interp::Bezier;
                    doc.tracks[c][i].data.out_ease = vec![out];
                    doc.tracks[c][i + 1].data.in_interp = Interp::Bezier;
                    doc.tracks[c][i + 1].data.in_ease = vec![incoming];
                }
            }
        }
        doc.validate()?;
        Ok(doc)
    }
    pub fn to_legacy(&self) -> Json {
        let mut times = BTreeSet::new();
        for k in self.tracks.iter().take(6).flatten() {
            times.insert(k.data.time);
        }
        Json::Array(times.into_iter().map(|t| {
            let values = self.sample(t.seconds()); let mut p = json!({"id":format!("rust-time-{}",t.0),"time":t.seconds(),"easing":"linear","channels":[],"keyIds":{},"native":{}});
            for (c,name) in CHANNELS.iter().enumerate() { p[*name] = json!(values[c]); if let Some(k) = self.tracks[c].iter().find(|k| k.data.time == t) { p["channels"].as_array_mut().unwrap().push(json!(name)); p["keyIds"][*name] = json!(k.id); p["native"][*name] = json!(k.data); p[*name] = json!(scalar(&k.data)); } }
            p
        }).collect())
    }
}

#[derive(Clone)]
pub struct Editor {
    pub doc: Document,
    pub selected: BTreeSet<String>,
    pub time: f64,
    pub duration: f64,
    pub fps: f64,
    pub undo: Vec<Document>,
    pub redo: Vec<Document>,
    pub gesture: Option<Document>,
    pub clipboard: Vec<(String, Key)>,
    pub revision: u64,
}
impl Default for Editor {
    fn default() -> Self {
        Self {
            doc: Document::default(),
            selected: BTreeSet::new(),
            time: 0.,
            duration: 10.,
            fps: 30.,
            undo: vec![],
            redo: vec![],
            gesture: None,
            clipboard: vec![],
            revision: 0,
        }
    }
}
impl Editor {
    pub fn frame(&self, t: f64) -> f64 {
        (t * self.fps).round() / self.fps
    }
    pub fn remember(&mut self, before: Document) {
        if before != self.doc {
            self.undo.push(before);
            if self.undo.len() > 100 {
                self.undo.remove(0);
            }
            self.redo.clear();
            self.revision += 1;
        }
    }
    pub fn select(&mut self, ids: impl IntoIterator<Item = String>) {
        self.selected = ids.into_iter().collect();
    }
    pub fn command(&mut self, cmd: Json) -> Result<(), String> {
        let before = self.doc.clone();
        let selected = self.selected.clone();
        let result = self
            .check_locks(&cmd)
            .and_then(|_| self.apply(&cmd))
            .and_then(|_| self.doc.validate());
        if let Err(err) = result {
            self.doc = before;
            self.selected = selected;
            return Err(err);
        }
        if !matches!(
            cmd["op"].as_str(),
            Some("begin" | "commit" | "cancel" | "undo" | "redo" | "select" | "copy")
        ) && self.gesture.is_none()
        {
            self.remember(before);
        }
        self.selected
            .retain(|id| self.doc.tracks.iter().flatten().any(|k| &k.id == id));
        Ok(())
    }
    fn apply(&mut self, cmd: &Json) -> Result<(), String> {
        match cmd["op"].as_str().unwrap_or("") {
            "begin" => {
                if self.gesture.is_none() {
                    self.gesture = Some(self.doc.clone());
                }
            }
            "commit" => {
                if let Some(before) = self.gesture.take() {
                    self.remember(before);
                }
            }
            "cancel" => {
                if let Some(before) = self.gesture.take() {
                    self.doc = before;
                    self.revision += 1;
                }
            }
            "undo" => {
                if let Some(doc) = self.undo.pop() {
                    self.redo.push(std::mem::replace(&mut self.doc, doc));
                    self.revision += 1;
                }
            }
            "redo" => {
                if let Some(doc) = self.redo.pop() {
                    self.undo.push(std::mem::replace(&mut self.doc, doc));
                    self.revision += 1;
                }
            }
            "select" => self.select(
                cmd["ids"]
                    .as_array()
                    .ok_or("Seleção inválida")?
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_owned)),
            ),
            "capture" => {
                let vals: Vec<f64> =
                    serde_json::from_value(cmd["values"].clone()).map_err(|_| "Câmera inválida")?;
                for (c, v) in vals.iter().enumerate().take(self.doc.base.len()) {
                    if self.doc.tracks[c].is_empty() {
                        self.doc.base[c] = *v;
                    }
                }
                let channels = self.capture_channels(cmd)?;
                self.selected.clear();
                let time = Tick::from_seconds_f64(self.frame(self.time));
                for c in channels {
                    if c >= self.doc.tracks.len() {
                        return Err("Propriedade inválida".into());
                    }
                    let value = if c < 6 {
                        vals.get(c).copied()
                    } else {
                        cmd["propertyValues"][&self.doc.properties[c].uid]
                            .as_f64()
                            .or_else(|| vals.get(c).copied())
                    }
                    .ok_or("Valor de captura ausente")?;
                    let found = self.doc.tracks[c].iter().position(|k| k.data.time == time);
                    let id = if let Some(i) = found {
                        self.doc.tracks[c][i].data.value = Value::Scalar(value);
                        self.doc.tracks[c][i].id.clone()
                    } else {
                        let id = self.doc.new_id();
                        self.doc.tracks[c].push(Key {
                            id: id.clone(),
                            data: Keyframe::new(time, Value::Scalar(value)),
                        });
                        id
                    };
                    self.selected.insert(id);
                    self.doc.tracks[c].sort_by_key(|k| k.data.time);
                }
            }
            "move" => {
                let source = self.gesture.clone().unwrap_or_else(|| self.doc.clone());
                let moving: Vec<_> = source
                    .tracks
                    .iter()
                    .flatten()
                    .filter(|k| self.selected.contains(&k.id))
                    .collect();
                if moving.is_empty() {
                    return Ok(());
                }
                let anchor = moving
                    .iter()
                    .find(|k| Some(k.id.as_str()) == cmd["anchor"].as_str())
                    .copied()
                    .unwrap_or(moving[0]);
                let delta = cmd["delta"]
                    .as_f64()
                    .filter(|v| v.is_finite())
                    .ok_or("Deslocamento inválido")?;
                let mut offset =
                    self.frame(anchor.data.time.seconds() + delta) - anchor.data.time.seconds();
                if cmd["snap"].as_bool().unwrap_or(false) {
                    let mut targets = vec![0., self.duration, self.time];
                    targets.extend(
                        source
                            .tracks
                            .iter()
                            .flatten()
                            .filter(|k| !self.selected.contains(&k.id))
                            .map(|k| k.data.time.seconds()),
                    );
                    offset = self.frame(snap_time(
                        &targets,
                        anchor.data.time.seconds() + offset,
                        cmd["tolerance"].as_f64().unwrap_or(0.),
                    )) - anchor.data.time.seconds();
                }
                let lo = moving
                    .iter()
                    .map(|k| k.data.time.seconds())
                    .fold(f64::INFINITY, f64::min);
                let hi = moving
                    .iter()
                    .map(|k| k.data.time.seconds())
                    .fold(0., f64::max);
                if hi > self.duration {
                    return Err("Aumente a duração para mover esses keyframes".into());
                }
                offset = offset.clamp(-lo, self.duration - hi);
                self.doc = source;
                for track in &mut self.doc.tracks {
                    for k in track.iter_mut().filter(|k| self.selected.contains(&k.id)) {
                        k.data.time = Tick::from_seconds_f64(k.data.time.seconds() + offset);
                    }
                    track.sort_by_key(|k| k.data.time);
                }
            }
            "delete" => {
                self.doc.base = self.doc.sample_all(self.time);
                for track in &mut self.doc.tracks {
                    track.retain(|k| !self.selected.contains(&k.id));
                }
            }
            "value" => {
                let v = cmd["value"].as_f64().ok_or("Valor inválido")?;
                for k in self
                    .doc
                    .tracks
                    .iter_mut()
                    .flatten()
                    .filter(|k| self.selected.contains(&k.id))
                {
                    k.data.value = Value::Scalar(v);
                }
            }
            "ease" => {
                let mode = cmd["mode"].as_str().unwrap_or("linear");
                for k in self
                    .doc
                    .tracks
                    .iter_mut()
                    .flatten()
                    .filter(|k| self.selected.contains(&k.id))
                {
                    match mode {
                        "easy" | "in" | "out" => {
                            animation::easy_ease(&mut k.data, mode != "out", mode != "in")
                        }
                        "auto" | "continuous" => {
                            k.data.in_interp = Interp::Bezier;
                            k.data.out_interp = Interp::Bezier;
                            k.data.auto_bezier = mode == "auto";
                            k.data.continuous = mode == "continuous";
                        }
                        "hold" => {
                            k.data.in_interp = Interp::Hold;
                            k.data.out_interp = Interp::Hold;
                            k.data.auto_bezier = false;
                        }
                        _ => {
                            k.data.in_interp = Interp::Linear;
                            k.data.out_interp = Interp::Linear;
                            k.data.auto_bezier = false;
                            k.data.continuous = false;
                        }
                    }
                }
            }
            "velocity" => {
                for k in self
                    .doc
                    .tracks
                    .iter_mut()
                    .flatten()
                    .filter(|k| self.selected.contains(&k.id))
                {
                    if cmd["in_speed"].is_number() {
                        k.data.in_interp = Interp::Bezier;
                        k.data.in_ease = vec![Ease {
                            speed: cmd["in_speed"].as_f64().unwrap_or(0.),
                            influence: cmd["in_influence"].as_f64().unwrap_or(1. / 3.),
                        }];
                    }
                    if cmd["out_speed"].is_number() {
                        k.data.out_interp = Interp::Bezier;
                        k.data.out_ease = vec![Ease {
                            speed: cmd["out_speed"].as_f64().unwrap_or(0.),
                            influence: cmd["out_influence"].as_f64().unwrap_or(1. / 3.),
                        }];
                    }
                    k.data.auto_bezier = false;
                    k.data.continuous = false;
                }
            }
            "copy" => {
                let properties = &self.doc.properties;
                self.clipboard = self
                    .doc
                    .tracks
                    .iter()
                    .enumerate()
                    .flat_map(|(c, t)| {
                        t.iter()
                            .filter(|k| self.selected.contains(&k.id))
                            .map(move |k| (properties[c].uid.clone(), k.clone()))
                    })
                    .collect();
                let start = self
                    .clipboard
                    .iter()
                    .map(|(_, k)| k.data.time)
                    .min()
                    .unwrap_or(Tick(0));
                for (_, k) in &mut self.clipboard {
                    k.data.time = k.data.time - start;
                }
            }
            "paste" => {
                let clip = self.clipboard.clone();
                self.selected.clear();
                for (uid, mut k) in clip {
                    let c = self
                        .doc
                        .properties
                        .iter()
                        .position(|p| p.uid == uid)
                        .ok_or("A propriedade copiada não existe nesta cena")?;
                    k.data.time =
                        Tick::from_seconds_f64(self.frame(self.time + k.data.time.seconds()));
                    if k.data.time.seconds() > self.duration {
                        return Err("Colagem ultrapassa a duração".into());
                    }
                    k.id = self.doc.new_id();
                    self.doc.tracks[c].retain(|old| old.data.time != k.data.time);
                    self.selected.insert(k.id.clone());
                    self.doc.tracks[c].push(k);
                    self.doc.tracks[c].sort_by_key(|k| k.data.time);
                }
            }
            "layer" => self.edit_layer(cmd)?,
            "object_values" => self.edit_object_values(cmd)?,
            "reverse" => {
                for track in &mut self.doc.tracks {
                    let mut subset: Vec<_> = track
                        .iter()
                        .filter(|k| self.selected.contains(&k.id))
                        .cloned()
                        .collect();
                    let mut keys: Vec<_> = subset.iter().map(|k| k.data.clone()).collect();
                    animation::time_reverse(&mut keys);
                    subset.reverse();
                    for (k, data) in subset.iter_mut().zip(keys) {
                        k.data = data;
                    }
                    for k in track.iter_mut() {
                        if let Some(v) = subset.iter().find(|v| v.id == k.id) {
                            *k = v.clone();
                        }
                    }
                    track.sort_by_key(|k| k.data.time);
                }
            }
            _ => return Err("Comando desconhecido".into()),
        }
        Ok(())
    }
}
// Adapted from EffectCraft ui-egui timeline.rs (MIT), pinned in vendor/README.md.
pub fn snap_time(candidates: &[f64], time: f64, tolerance: f64) -> f64 {
    candidates
        .iter()
        .copied()
        .filter(|t| (*t - time).abs() <= tolerance)
        .min_by(|a, b| (a - time).abs().total_cmp(&(b - time).abs()))
        .unwrap_or(time)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn points() -> Json {
        json!([
            {"id":"a","time":0.,"lng":170.,"lat":-23.,"zoom":4.,"pitch":0.,"bearing":170.,"pathProgress":0.,"easing":"linear"},
            {"id":"b","time":3.,"lng":-170.,"lat":-20.,"zoom":10.,"pitch":30.,"bearing":-170.,"pathProgress":1.,"easing":"linear"}
        ])
    }
    fn editor() -> Editor {
        Editor {
            doc: Document::from_legacy(&points()).unwrap(),
            duration: 3.,
            ..Default::default()
        }
    }
    #[test]
    fn legacy_linear_and_shortest_angles() {
        let d = Document::from_legacy(&points()).unwrap();
        let v = d.sample(1.5);
        assert_eq!(v, [-180., -21.5, 7., 15., -180., 0.5]);
        let d2 = Document::from_legacy(&d.to_legacy()).unwrap();
        for t in [0., 0.2, 1.5, 2.7, 3.] {
            assert_eq!(d.sample(t), d2.sample(t));
        }
    }
    #[test]
    fn legacy_smooth_and_per_channel_curves() {
        let mut p = points();
        p[0]["easing"] = json!("smooth");
        p[0]["interpolation"] = json!({"zoom":{"easing":"hold"}});
        let d = Document::from_legacy(&p).unwrap();
        assert!((d.sample(0.75)[1] - (-22.53125)).abs() < 1e-7);
        assert_eq!(d.sample(1.5)[2], 4.);
        assert_eq!(d.sample(3.)[2], 10.);
    }
    #[test]
    fn retime_group_one_undo_and_collision_rollback() {
        let mut e = editor();
        e.selected.insert("b:zoom".into());
        let original = e.doc.clone();
        e.command(json!({"op":"begin"})).unwrap();
        for delta in [-0.1, -0.2, -0.6] {
            e.command(json!({"op":"move","delta":delta})).unwrap();
        }
        e.command(json!({"op":"commit"})).unwrap();
        assert_eq!(e.undo.len(), 1);
        assert!((e.doc.tracks[2][1].data.time.seconds() - 2.4).abs() < 1e-8);
        assert_eq!(e.doc.tracks[0][1].data.time.seconds(), 3.);
        let before = e.doc.clone();
        assert!(e.command(json!({"op":"move","delta":-2.4})).is_err());
        assert_eq!(e.doc, before);
        e.command(json!({"op":"undo"})).unwrap();
        assert_eq!(e.doc, original);
    }
    #[test]
    fn independent_sides_and_native_scene_roundtrip() {
        let mut e = editor();
        e.selected.insert("a:zoom".into());
        e.command(json!({"op":"ease","mode":"out"})).unwrap();
        assert_eq!(e.doc.tracks[2][0].data.out_interp, Interp::Bezier);
        assert_eq!(e.doc.tracks[2][0].data.in_interp, Interp::Linear);
        assert_eq!(e.doc.tracks[0][0].data.out_interp, Interp::Linear);
        assert!(e.doc.sample(0.75)[2] < 5.5);
        let reopened = Document::from_legacy(&e.doc.to_legacy()).unwrap();
        for t in [0., 0.35, 1.2, 2.5, 3.] {
            assert_eq!(e.doc.sample(t), reopened.sample(t));
        }
    }
    #[test]
    fn velocity_supports_overshoot_and_preserves_other_side() {
        let mut e = editor();
        e.selected.insert("a:zoom".into());
        e.command(json!({"op":"velocity","out_speed":30.,"out_influence":0.8}))
            .unwrap();
        assert_eq!(e.doc.tracks[2][0].data.in_interp, Interp::Linear);
        assert!(e.doc.sample_track(2, 1.5) > 10.);
        assert!(
            e.command(json!({"op":"velocity","out_speed":2.,"out_influence":1.1}))
                .is_err()
        );
        assert_eq!(e.doc.tracks[2][0].data.out_ease[0].speed, 30.);
    }
    #[test]
    fn capture_one_property_paste_replace_and_delete_freeze() {
        let mut e = Editor::default();
        e.time = 1.;
        e.command(json!({"op":"capture","values":[-46.,-23.,8.,20.,30.,0.5],"channels":[2]}))
            .unwrap();
        assert_eq!(e.doc.sample(0.), [-46., -23., 8., 20., 30., 0.5]);
        let id = e.doc.tracks[2][0].id.clone();
        e.selected = [id].into_iter().collect();
        e.command(json!({"op":"copy"})).unwrap();
        e.time = 2.;
        e.command(json!({"op":"paste"})).unwrap();
        assert_eq!(e.doc.tracks[2].len(), 2);
        e.command(json!({"op":"paste"})).unwrap();
        assert_eq!(e.doc.tracks[2].len(), 2);
        e.selected = e.doc.tracks[2].iter().map(|k| k.id.clone()).collect();
        e.command(json!({"op":"delete"})).unwrap();
        assert!(e.doc.tracks[2].is_empty());
        assert_eq!(e.doc.sample(2.)[2], 8.);
    }
    #[test]
    fn cancel_restores_drag_without_undo_entry() {
        let mut e = editor();
        let before = e.doc.clone();
        e.selected.insert("b:zoom".into());
        e.command(json!({"op":"begin"})).unwrap();
        e.command(json!({"op":"move","delta":-1.})).unwrap();
        e.command(json!({"op":"cancel"})).unwrap();
        assert_eq!(e.doc, before);
        assert!(e.undo.is_empty());
    }
    #[test]
    fn snapshots_keep_base_and_identity_and_reject_corrupt_native() {
        let mut e = editor();
        e.selected.insert("b:zoom".into());
        e.command(json!({"op":"move","delta":-0.5})).unwrap();
        let mut p = e.doc.to_legacy();
        let d = Document::from_legacy(&p).unwrap();
        assert_eq!(d.tracks[2][1].id, "b:zoom");
        p[0]["native"]["zoom"]["out_ease"] = json!([{"speed":1.,"influence":3.}]);
        assert!(Document::from_legacy(&p).is_err());
    }
    #[test]
    fn auto_ease_uses_upstream_neighbors() {
        let mut e = editor();
        e.selected.insert("a:zoom".into());
        e.command(json!({"op":"ease","mode":"auto"})).unwrap();
        assert!(e.doc.tracks[2][0].data.auto_bezier);
        assert!(e.doc.sample(1.)[2].is_finite());
        assert_eq!(snap_time(&[0., 2., 3.], 1.95, 0.1), 2.);
    }
}
