use super::*;
use std::collections::BTreeMap;
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PropertySpec {
    pub uid: String,
    pub layer: String,
    pub key: String,
    pub name: String,
    pub min: f64,
    pub max: f64,
    pub angular: bool,
    pub default_value: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Layer {
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub start: f64,
    #[serde(default = "full")]
    pub end: f64,
}
fn full() -> f64 {
    600.
}
impl Layer {
    pub fn new(id: &str, name: &str, kind: &str) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            kind: kind.into(),
            muted: false,
            locked: false,
            start: 0.,
            end: 600.,
        }
    }
    pub fn visible(&self, time: f64) -> bool {
        !self.muted && time >= self.start && (time < self.end || self.end == 600. && time == 600.)
    }
}
#[derive(Clone, Debug, Deserialize)]
pub struct CatalogLayer {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub values: BTreeMap<String, f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedTrack {
    pub property: String,
    pub keys: Vec<Key>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LayerAnimation {
    pub version: u8,
    #[serde(default)]
    pub layers: Vec<Layer>,
    #[serde(default)]
    pub tracks: Vec<SavedTrack>,
    #[serde(default)]
    pub constants: BTreeMap<String, f64>,
}
impl Default for LayerAnimation {
    fn default() -> Self {
        Self {
            version: 1,
            layers: vec![],
            tracks: vec![],
            constants: BTreeMap::new(),
        }
    }
}
pub fn camera_properties() -> Vec<PropertySpec> {
    CHANNELS
        .iter()
        .enumerate()
        .map(|(c, key)| PropertySpec {
            uid: format!("{}/{}", if c == 5 { "route" } else { "camera" }, key),
            layer: if c == 5 {
                "route".into()
            } else {
                "camera".into()
            },
            key: key.to_string(),
            name: NAMES[c].into(),
            min: BOUNDS[c].0,
            max: BOUNDS[c].1,
            angular: c == 0 || c == 4,
            default_value: [0., 0., 5., 0., 0., 1.][c],
        })
        .collect()
}
fn definitions(kind: &str) -> Result<Vec<(&'static str, &'static str, f64, f64, bool)>, String> {
    Ok(match kind {
        "pin" => vec![
            ("lng", "Longitude", -180., 180., true),
            ("lat", "Latitude", -90., 90., false),
            ("opacity", "Opacidade", 0., 1., false),
            ("scale", "Escala", 0.5, 3., false),
            ("rotation", "Rotação", -180., 180., true),
        ],
        "feature" => vec![
            ("opacity", "Opacidade", 0., 1., false),
            ("width", "Contorno · largura", 1., 20., false),
            ("radius", "Raio", 1., 30., false),
            ("red", "Cor · R", 0., 255., false),
            ("green", "Cor · G", 0., 255., false),
            ("blue", "Cor · B", 0., 255., false),
        ],
        "feature_polygon" | "feature_line" => definitions("feature")?
            .into_iter()
            .filter(|p| p.0 != "radius")
            .collect(),
        "feature_point" => definitions("feature")?
            .into_iter()
            .filter(|p| p.0 != "width")
            .collect(),
        "route" => vec![
            ("opacity", "Opacidade", 0., 1., false),
            ("width", "Largura", 1., 20., false),
            ("red", "Cor · R", 0., 255., false),
            ("green", "Cor · G", 0., 255., false),
            ("blue", "Cor · B", 0., 255., false),
        ],
        _ => return Err("Tipo de camada inválido".into()),
    })
}
impl Document {
    pub fn bounds(&self, c: usize) -> (f64, f64) {
        (self.properties[c].min, self.properties[c].max)
    }
    pub fn name(&self, c: usize) -> &str {
        &self.properties[c].name
    }
    pub fn layer_of(&self, c: usize) -> &Layer {
        self.layers
            .iter()
            .find(|l| l.id == self.properties[c].layer)
            .expect("validated property layer")
    }
    pub fn sample_all(&self, time: f64) -> Vec<f64> {
        (0..self.tracks.len())
            .map(|c| {
                let v = self.sample_track(c, time);
                if self.properties[c].angular {
                    wrap(v)
                } else {
                    let (a, b) = self.bounds(c);
                    v.clamp(a, b)
                }
            })
            .collect()
    }
    pub fn validate_layers(&self) -> Result<(), String> {
        if self.tracks.len() < 6
            || self.tracks.len() != self.properties.len()
            || self.base.len() != self.tracks.len()
            || self.tracks.len() > 60006
            || self.layers.len() > 10002
        {
            return Err("Estrutura de camadas inválida".into());
        }
        let mut ids = BTreeSet::new();
        for l in &self.layers {
            if l.id.is_empty()
                || l.id.len() > 220
                || l.name.len() > 500
                || !ids.insert(&l.id)
                || !l.start.is_finite()
                || !l.end.is_finite()
                || l.start < 0.
                || l.start >= l.end
                || l.end > 600.
            {
                return Err("Intervalo/ID de camada inválido".into());
            }
        }
        let mut uids = BTreeSet::new();
        if self.properties.iter().any(|p| {
            !ids.contains(&p.layer)
                || !uids.insert(&p.uid)
                || p.uid.len() > 300
                || !p.min.is_finite()
                || !p.max.is_finite()
                || p.min >= p.max
        }) {
            return Err("Propriedade de camada inválida".into());
        }
        Ok(())
    }
    pub fn set_objects(
        &mut self,
        catalog: &[CatalogLayer],
        animation: &LayerAnimation,
    ) -> Result<(), String> {
        if animation.version != 1 || catalog.len() > 10001 || animation.tracks.len() > 3000 {
            return Err("Animação de camadas inválida".into());
        }
        let mut doc = self.clone();
        doc.tracks.truncate(6);
        doc.base.truncate(6);
        doc.properties = camera_properties();
        doc.layers = vec![
            Layer::new("camera", "Câmera", "camera"),
            Layer::new("route", "Rota", "route"),
        ];
        let mut seen = BTreeSet::new();
        for item in catalog {
            if !seen.insert(&item.id)
                || !((item.kind == "pin" && item.id.starts_with("pin:"))
                    || (item.kind.starts_with("feature") && item.id.starts_with("feature:"))
                    || (item.kind == "route" && item.id == "route"))
            {
                return Err("Identificação de camada inválida".into());
            }
            if item.id != "route" {
                doc.layers
                    .push(Layer::new(&item.id, &item.name, &item.kind));
            }
            for (key, name, min, max, angular) in definitions(&item.kind)? {
                let base = *item.values.get(key).ok_or("Valor de propriedade ausente")?;
                doc.properties.push(PropertySpec {
                    uid: format!("{}/{}", item.id, key),
                    layer: item.id.clone(),
                    key: key.into(),
                    name: name.into(),
                    min,
                    max,
                    angular,
                    default_value: base,
                });
                doc.base.push(base);
                doc.tracks.push(vec![]);
            }
        }
        let mut states = BTreeSet::new();
        for state in &animation.layers {
            if !states.insert(&state.id) {
                return Err("Camada repetida".into());
            }
            if let Some(l) = doc.layers.iter_mut().find(|l| l.id == state.id) {
                l.muted = state.muted;
                l.locked = state.locked;
                l.start = state.start;
                l.end = state.end;
            }
        }
        let mut tracks = BTreeSet::new();
        for saved in &animation.tracks {
            if !tracks.insert(&saved.property) {
                return Err("Track repetida".into());
            }
            if let Some(c) = doc.properties.iter().position(|p| p.uid == saved.property) {
                if c < 6 {
                    return Err("Tracks da câmera usam waypoints".into());
                }
                doc.tracks[c] = saved.keys.clone();
            }
        }
        for (uid, value) in &animation.constants {
            if let Some(c) = doc.properties.iter().position(|p| &p.uid == uid) {
                if c >= 5 && doc.tracks[c].is_empty() {
                    doc.base[c] = *value;
                }
            }
        }
        doc.validate()?;
        *self = doc;
        Ok(())
    }
    pub fn animation(&self) -> LayerAnimation {
        LayerAnimation {
            version: 1,
            layers: self
                .layers
                .iter()
                .filter(|l| l.muted || l.locked || l.start > 0. || l.end < 600.)
                .cloned()
                .collect(),
            tracks: self
                .tracks
                .iter()
                .enumerate()
                .skip(6)
                .filter(|(_, t)| !t.is_empty())
                .map(|(c, t)| SavedTrack {
                    property: self.properties[c].uid.clone(),
                    keys: t.clone(),
                })
                .collect(),
            constants: self
                .properties
                .iter()
                .enumerate()
                .skip(5)
                .filter(|(c, p)| self.tracks[*c].is_empty() && self.base[*c] != p.default_value)
                .map(|(c, p)| (p.uid.clone(), self.base[c]))
                .collect(),
        }
    }
    pub fn sample_objects(&self, time: f64) -> Json {
        let mut updates: BTreeMap<String, Json> = BTreeMap::new();
        for (c, p) in self.properties.iter().enumerate().skip(6) {
            if self.tracks[c].is_empty() && self.base[c] == p.default_value {
                continue;
            }
            let layer = self.layer_of(c);
            let entry = updates.entry(layer.id.clone()).or_insert_with(
                || json!({"id":layer.id,"visible":layer.visible(time),"values":{}}),
            );
            let mut v = self.sample_track(c, time);
            if p.angular {
                v = wrap(v);
            } else {
                v = v.clamp(p.min, p.max);
            }
            entry["values"][&p.key] = json!(v);
        }
        for l in &self.layers {
            if l.id == "camera" {
                continue;
            }
            if l.muted || l.start > 0. || l.end < 600. {
                updates
                    .entry(l.id.clone())
                    .or_insert_with(|| json!({"id":l.id,"visible":l.visible(time),"values":{}}));
            }
        }
        Json::Array(updates.into_values().collect())
    }
}
impl Editor {
    pub fn capture_channels(&self, cmd: &Json) -> Result<Vec<usize>, String> {
        if let Some(props) = cmd["properties"].as_array() {
            return props
                .iter()
                .map(|p| {
                    self.doc
                        .properties
                        .iter()
                        .position(|v| Some(v.uid.as_str()) == p.as_str())
                        .ok_or("Propriedade removida")
                        .map_err(str::to_string)
                })
                .collect();
        }
        serde_json::from_value(
            cmd.get("channels")
                .cloned()
                .unwrap_or(json!((0..6).collect::<Vec<_>>())),
        )
        .map_err(|_| "Propriedades inválidas".into())
    }
    pub fn edit_object_values(&mut self, cmd: &Json) -> Result<(), String> {
        let edits = cmd["values"].as_object().ok_or("Valores inválidos")?;
        let time = Tick::from_seconds_f64(self.frame(self.time));
        for (uid, value) in edits {
            let c = self
                .doc
                .properties
                .iter()
                .position(|p| &p.uid == uid)
                .ok_or("Propriedade ausente")?;
            if self.doc.layer_of(c).locked {
                return Err("Camada bloqueada".into());
            }
            let value = value.as_f64().ok_or("Valor inválido")?;
            if self.doc.tracks[c].is_empty() {
                self.doc.base[c] = value;
                continue;
            }
            if let Some(k) = self.doc.tracks[c].iter_mut().find(|k| k.data.time == time) {
                k.data.value = Value::Scalar(value);
            } else {
                let id = self.doc.new_id();
                self.doc.tracks[c].push(Key {
                    id,
                    data: Keyframe::new(time, Value::Scalar(value)),
                });
                self.doc.tracks[c].sort_by_key(|k| k.data.time);
            }
        }
        Ok(())
    }
    pub fn check_locks(&self, cmd: &Json) -> Result<(), String> {
        let op = cmd["op"].as_str().unwrap_or("");
        if ["move", "delete", "value", "ease", "velocity", "reverse"].contains(&op)
            && self.doc.tracks.iter().enumerate().any(|(c, t)| {
                self.doc.layer_of(c).locked && t.iter().any(|k| self.selected.contains(&k.id))
            })
        {
            return Err("A seleção contém uma camada bloqueada".into());
        }
        if op == "capture" {
            let channels = self.capture_channels(cmd)?;
            if channels
                .iter()
                .any(|c| *c >= self.doc.tracks.len() || self.doc.layer_of(*c).locked)
            {
                return Err("Propriedade inválida ou camada bloqueada".into());
            }
        }
        if op == "paste"
            && self.clipboard.iter().any(|(uid, _)| {
                self.doc
                    .properties
                    .iter()
                    .position(|p| p.uid == *uid)
                    .is_none_or(|c| self.doc.layer_of(c).locked)
            })
        {
            return Err("Destino ausente ou bloqueado".into());
        }
        Ok(())
    }
    pub fn edit_layer(&mut self, cmd: &Json) -> Result<(), String> {
        let id = cmd["id"].as_str().ok_or("Camada ausente")?;
        let source = self.gesture.clone().unwrap_or_else(|| self.doc.clone());
        let old = source
            .layers
            .iter()
            .find(|l| l.id == id)
            .ok_or("Camada inexistente")?
            .clone();
        if old.locked && (cmd["start"].is_number() || cmd["muted"].is_boolean()) {
            return Err("Camada bloqueada".into());
        }
        let mut layer = old.clone();
        if let Some(v) = cmd["locked"].as_bool() {
            layer.locked = v;
        }
        if let Some(v) = cmd["muted"].as_bool() {
            if id == "camera" {
                return Err("A câmera não tem visibilidade".into());
            }
            layer.muted = v;
        }
        if let Some(start) = cmd["start"].as_f64() {
            if id == "camera" {
                return Err("Intervalo da câmera não é recortável".into());
            }
            layer.start = start;
            layer.end = cmd["end"].as_f64().ok_or("Fim ausente")?;
        }
        self.doc = source;
        if cmd["translate"].as_bool().unwrap_or(false) {
            let delta = layer.start - old.start;
            for (c, track) in self.doc.tracks.iter_mut().enumerate() {
                if self.doc.properties[c].layer == id {
                    for k in track {
                        k.data.time = Tick::from_seconds_f64(k.data.time.seconds() + delta);
                    }
                }
            }
        }
        *self
            .doc
            .layers
            .iter_mut()
            .find(|l| l.id == id)
            .ok_or("Camada inexistente")? = layer;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn catalog() -> Vec<CatalogLayer> {
        serde_json::from_value(json!([
  {"id":"pin:a","name":"Cidade A","kind":"pin","values":{"lng":170.,"lat":-23.,"opacity":1.,"scale":1.,"rotation":0.}},
  {"id":"pin:b","name":"Cidade B","kind":"pin","values":{"lng":-46.,"lat":-22.,"opacity":1.,"scale":1.,"rotation":0.}},
  {"id":"feature:area","name":"País","kind":"feature","values":{"opacity":0.5,"width":3.,"radius":7.,"red":20.,"green":100.,"blue":200.}}
 ])).unwrap()
    }
    fn setup() -> Editor {
        let mut e = Editor::default();
        e.duration = 3.;
        e.doc
            .set_objects(&catalog(), &LayerAnimation::default())
            .unwrap();
        e
    }
    fn capture(e: &mut Editor, uid: &str, value: f64, time: f64) {
        e.time = time;
        e.command(json!({"op":"capture","values":[-46.,-23.,8.,0.,0.,1.],"properties":[uid],"propertyValues":{uid:value}})).unwrap();
    }
    fn update(e: &Editor, id: &str, time: f64) -> Json {
        e.doc
            .sample_objects(time)
            .as_array()
            .unwrap()
            .iter()
            .find(|u| u["id"] == id)
            .cloned()
            .unwrap_or(Json::Null)
    }
    #[test]
    fn object_keys_do_not_create_camera_waypoints() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 1., 0.);
        capture(&mut e, "pin:a/opacity", 0., 2.);
        assert_eq!(e.doc.to_legacy(), json!([]));
        assert_eq!(update(&e, "pin:a", 1.)["values"]["opacity"], 0.5);
        assert!(update(&e, "pin:b", 1.).is_null());
    }
    #[test]
    fn dynamic_properties_have_independent_native_curves() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 1., 0.);
        let id = e
            .doc
            .properties
            .iter()
            .position(|p| p.uid == "pin:a/opacity")
            .unwrap();
        capture(&mut e, "pin:a/opacity", 0., 2.);
        capture(&mut e, "feature:area/red", 20., 0.);
        capture(&mut e, "feature:area/red", 220., 2.);
        e.selected = [e.doc.tracks[id][0].id.clone()].into_iter().collect();
        e.command(json!({"op":"ease","mode":"hold"})).unwrap();
        assert_eq!(update(&e, "pin:a", 1.)["values"]["opacity"], 1.);
        assert_eq!(update(&e, "feature:area", 1.)["values"]["red"], 120.);
    }
    #[test]
    fn saved_layer_tracks_roundtrip_without_camera() {
        let mut e = setup();
        capture(&mut e, "pin:a/scale", 1., 0.);
        e.command(json!({"op":"ease","mode":"out"})).unwrap();
        capture(&mut e, "pin:a/scale", 2., 2.);
        let saved: LayerAnimation =
            serde_json::from_str(&json!(e.doc.animation()).to_string()).unwrap();
        let mut d = Document::default();
        d.set_objects(&catalog(), &saved).unwrap();
        for t in [0., 0.4, 1.3, 2.] {
            assert_eq!(d.sample_objects(t), e.doc.sample_objects(t));
        }
    }
    #[test]
    fn deleting_last_key_freezes_and_saves_the_current_value() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 1., 0.);
        capture(&mut e, "pin:a/opacity", 0., 2.);
        e.time = 1.;
        e.selected = e
            .doc
            .tracks
            .iter()
            .flatten()
            .map(|k| k.id.clone())
            .collect();
        e.command(json!({"op":"delete"})).unwrap();
        let saved = e.doc.animation();
        assert_eq!(saved.constants["pin:a/opacity"], 0.5);
        let mut d = Document::default();
        d.set_objects(&catalog(), &saved).unwrap();
        assert_eq!(d.sample_objects(0.)[0]["values"]["opacity"], 0.5);
    }
    #[test]
    fn locked_layers_block_edits_atomically_but_can_be_unlocked() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 1., 0.);
        e.command(json!({"op":"layer","id":"pin:a","locked":true}))
            .unwrap();
        let before = e.doc.clone();
        for op in [
            json!({"op":"delete"}),
            json!({"op":"move","delta":1.}),
            json!({"op":"ease","mode":"easy"}),
            json!({"op":"object_values","values":{"pin:a/opacity":0.2}}),
        ] {
            assert!(e.command(op).is_err());
            assert_eq!(e.doc, before);
        }
        e.command(json!({"op":"layer","id":"pin:a","locked":false}))
            .unwrap();
        e.command(json!({"op":"delete"})).unwrap();
    }
    #[test]
    fn clipboard_uses_stable_property_ids_after_catalog_reordering() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 0.2, 0.);
        e.command(json!({"op":"copy"})).unwrap();
        let mut c = catalog();
        c.swap(0, 1);
        let saved = e.doc.animation();
        e.doc.set_objects(&c, &saved).unwrap();
        e.time = 1.;
        e.command(json!({"op":"paste"})).unwrap();
        assert_eq!(update(&e, "pin:a", 1.)["values"]["opacity"], 0.2);
        assert!(update(&e, "pin:b", 1.).is_null());
    }
    #[test]
    fn trimming_controls_visibility_without_retiming_keys() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 1., 0.);
        capture(&mut e, "pin:a/opacity", 0., 3.);
        let times: Vec<_> = e.doc.tracks.iter().flatten().map(|k| k.data.time).collect();
        e.command(json!({"op":"layer","id":"pin:a","start":1.,"end":2.}))
            .unwrap();
        assert_eq!(update(&e, "pin:a", 0.)["visible"], false);
        assert_eq!(update(&e, "pin:a", 1.)["visible"], true);
        assert_eq!(update(&e, "pin:a", 2.)["visible"], false);
        assert_eq!(
            times,
            e.doc
                .tracks
                .iter()
                .flatten()
                .map(|k| k.data.time)
                .collect::<Vec<_>>()
        );
    }
    #[test]
    fn layer_translation_is_anchored_and_one_undo() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 1., 0.);
        capture(&mut e, "pin:a/opacity", 0., 1.);
        e.command(json!({"op":"layer","id":"pin:a","start":0.,"end":1.}))
            .unwrap();
        e.undo.clear();
        let before = e.doc.clone();
        e.command(json!({"op":"begin"})).unwrap();
        for shift in [0.25, 0.5, 1.] {
            e.command(
                json!({"op":"layer","id":"pin:a","start":shift,"end":1.+shift,"translate":true}),
            )
            .unwrap();
        }
        e.command(json!({"op":"commit"})).unwrap();
        assert_eq!(e.undo.len(), 1);
        assert_eq!(e.doc.animation().tracks[0].keys[0].data.time.seconds(), 1.);
        assert_eq!(e.doc.animation().tracks[0].keys[1].data.time.seconds(), 2.);
        e.command(json!({"op":"undo"})).unwrap();
        assert_eq!(e.doc, before);
    }
    #[test]
    fn reverse_calls_upstream_and_keeps_key_identities() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 1., 0.);
        let a = e.selected.iter().next().unwrap().clone();
        e.command(json!({"op":"ease","mode":"out"})).unwrap();
        capture(&mut e, "pin:a/opacity", 0., 2.);
        e.selected = e
            .doc
            .tracks
            .iter()
            .flatten()
            .map(|k| k.id.clone())
            .collect();
        e.command(json!({"op":"reverse"})).unwrap();
        let keys = &e.doc.animation().tracks[0].keys;
        assert_eq!(scalar(&keys[0].data), 0.);
        assert_eq!(keys[1].id, a);
        assert_eq!(keys[1].data.in_interp, Interp::Bezier);
    }
    #[test]
    fn removed_objects_are_pruned_and_invalid_import_is_atomic() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 0.5, 0.);
        let saved = e.doc.animation();
        let mut catalog = catalog();
        catalog.remove(0);
        e.doc.set_objects(&catalog, &saved).unwrap();
        assert!(e.doc.animation().tracks.is_empty());
        let before = e.doc.clone();
        catalog[0].values.insert("opacity".into(), 2.);
        assert!(
            e.doc
                .set_objects(&catalog, &LayerAnimation::default())
                .is_err()
        );
        assert_eq!(e.doc, before);
    }
    #[test]
    fn capture_property_identity_survives_row_changes() {
        let mut e = setup();
        let mut c = catalog();
        c.swap(0, 2);
        e.doc.set_objects(&c, &LayerAnimation::default()).unwrap();
        capture(&mut e, "pin:a/lng", -170., 1.);
        assert_eq!(update(&e, "pin:a", 1.)["values"]["lng"], -170.);
        assert_eq!(e.doc.sample(1.)[0], -46.);
    }
    #[test]
    fn editing_a_frozen_property_changes_its_static_value_without_creating_keys() {
        let mut e = setup();
        capture(&mut e, "pin:a/opacity", 1., 0.);
        capture(&mut e, "pin:a/opacity", 0., 2.);
        e.time = 1.;
        e.selected = e
            .doc
            .tracks
            .iter()
            .flatten()
            .map(|k| k.id.clone())
            .collect();
        e.command(json!({"op":"delete"})).unwrap();
        e.command(json!({"op":"object_values","values":{"pin:a/opacity":0.3}}))
            .unwrap();
        assert!(e.doc.animation().tracks.is_empty());
        assert_eq!(update(&e, "pin:a", 1.)["values"]["opacity"], 0.3);
        let saved = e.doc.animation();
        let mut c = catalog();
        c[0].values.insert("opacity".into(), 0.3);
        e.doc.set_objects(&c, &saved).unwrap();
        assert!(e.doc.animation().constants.is_empty());
    }
    #[test]
    fn deleting_the_last_route_key_preserves_its_static_reveal_without_camera_keys() {
        let mut e = setup();
        e.time = 0.;
        e.command(json!({"op":"capture","values":[0.,0.,5.,0.,0.,0.],"channels":[5]}))
            .unwrap();
        e.time = 2.;
        e.command(json!({"op":"capture","values":[0.,0.,5.,0.,0.,1.],"channels":[5]}))
            .unwrap();
        e.time = 1.;
        e.selected = e.doc.tracks[5].iter().map(|k| k.id.clone()).collect();
        e.command(json!({"op":"delete"})).unwrap();
        assert_eq!(e.doc.to_legacy(), json!([]));
        let saved = e.doc.animation();
        assert_eq!(saved.constants["route/pathProgress"], 0.5);
        let mut doc = Document::default();
        doc.set_objects(&catalog(), &saved).unwrap();
        assert_eq!(doc.sample(1.)[5], 0.5);
    }
}
