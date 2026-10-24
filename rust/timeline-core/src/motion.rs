// MapAnimator motion tools. Native easing is provided by EffectCraft.
use super::*;
impl Editor {
    pub fn selection_range(&self) -> Option<(f64, f64)> {
        let mut times = self
            .doc
            .tracks
            .iter()
            .flatten()
            .filter(|k| self.selected.contains(&k.id))
            .map(|k| k.data.time.seconds());
        let first = times.next()?;
        Some(times.fold((first, first), |(a, b), t| (a.min(t), b.max(t))))
    }
    pub(crate) fn retime_selection(&mut self, cmd: &Json) -> Result<(), String> {
        let (lo, hi) = self.selection_range().ok_or("Selecione keyframes")?;
        if hi - lo < 1e-9 {
            return Err("Selecione keys em pelo menos dois tempos".into());
        }
        let start = cmd["start"]
            .as_f64()
            .filter(|v| v.is_finite())
            .ok_or("Início inválido")?;
        let duration = cmd["duration"]
            .as_f64()
            .filter(|v| v.is_finite() && *v > 0.)
            .ok_or("Duração inválida")?;
        let end = self.frame(start + duration);
        let start = self.frame(start);
        if start < 0. || end > self.duration + 1e-9 || end <= start {
            return Err("O intervalo deve caber na composição".into());
        }
        let factor = (end - start) / (hi - lo);
        for track in &mut self.doc.tracks {
            for k in track.iter_mut().filter(|k| self.selected.contains(&k.id)) {
                let t = start + (k.data.time.seconds() - lo) * factor;
                k.data.time = Tick::from_seconds_f64((t * self.fps).round() / self.fps);
                // Maintain speed per second when the selected animation changes duration.
                for ease in k.data.in_ease.iter_mut().chain(k.data.out_ease.iter_mut()) {
                    ease.speed /= factor;
                }
            }
            track.sort_by_key(|k| k.data.time);
        }
        Ok(()) // Command validation rejects any frame collisions atomically.
    }
    pub(crate) fn sequence_selection(&mut self, cmd: &Json) -> Result<(), String> {
        let gap = cmd["gap"]
            .as_f64()
            .filter(|v| v.is_finite() && *v >= 0.)
            .ok_or("Intervalo inválido")?;
        let mut index = 0;
        for layer in self.doc.layers.clone() {
            let origin = self
                .doc
                .tracks
                .iter()
                .enumerate()
                .filter(|(c, _)| self.doc.properties[*c].layer == layer.id)
                .flat_map(|(_, t)| t)
                .filter(|k| self.selected.contains(&k.id))
                .map(|k| k.data.time.seconds())
                .reduce(f64::min);
            let Some(origin) = origin else {
                continue;
            };
            let offset = self.frame(self.time + index as f64 * gap) - origin;
            for (c, track) in self.doc.tracks.iter_mut().enumerate() {
                if self.doc.properties[c].layer != layer.id {
                    continue;
                }
                for k in track.iter_mut().filter(|k| self.selected.contains(&k.id)) {
                    let t = k.data.time.seconds() + offset;
                    if t < -1e-9 || t > self.duration + 1e-9 {
                        return Err("A sequência ultrapassa a composição".into());
                    }
                    k.data.time = Tick::from_seconds_f64(t.max(0.));
                }
                track.sort_by_key(|k| k.data.time);
            }
            index += 1;
        }
        if index == 0 {
            return Err("Selecione keyframes de uma ou mais camadas".into());
        }
        Ok(())
    }
    pub(crate) fn motion_preset(&mut self, cmd: &Json) -> Result<(), String> {
        let id = cmd["id"].as_str().ok_or("Selecione uma camada")?;
        let layer = self
            .doc
            .layers
            .iter()
            .find(|l| l.id == id)
            .ok_or("Camada inexistente")?
            .clone();
        if layer.locked {
            return Err("Camada bloqueada".into());
        }
        if layer.kind == "camera" {
            return Err("Escolha um pin, área ou rota".into());
        }
        let start = self.frame(self.time);
        let duration = cmd["duration"]
            .as_f64()
            .filter(|v| v.is_finite() && *v > 0.)
            .ok_or("Duração inválida")?;
        let end = self.frame(start + duration);
        if start < layer.start || end > layer.end.min(self.duration) + 1e-9 || end <= start {
            return Err("O preset deve caber no intervalo visível da camada".into());
        }
        let mode = cmd["mode"].as_str().unwrap_or("");
        let mut specs: Vec<(usize, Vec<(f64, f64)>)> = vec![];
        let current = self.doc.sample_all(start);
        let mut add = |name: &str, fractions: &[(f64, f64)]| -> Result<(), String> {
            let c = self
                .doc
                .properties
                .iter()
                .position(|p| p.layer == id && p.key == name)
                .ok_or("Preset incompatível com a camada")?;
            let p = &self.doc.properties[c];
            let target = p.default_value;
            let values = fractions
                .iter()
                .map(|(f, m)| {
                    let value = if *m < 0. { current[c] } else { target * m };
                    (*f, value.clamp(p.min, p.max))
                })
                .collect();
            specs.push((c, values));
            Ok(())
        };
        match mode {
            "fade_in" => add("opacity", &[(0., 0.), (1., 1.)])?,
            "fade_out" => add("opacity", &[(0., -1.), (1., 0.)])?,
            "pop" if layer.kind == "pin" => {
                add("opacity", &[(0., 0.), (0.65, 1.), (1., 1.)])?;
                add("scale", &[(0., 0.65), (0.65, 1.12), (1., 1.)])?;
            }
            "pulse" if layer.kind == "pin" => add("scale", &[(0., 1.), (0.5, 1.2), (1., 1.)])?,
            "draw" if id == "route" => {
                specs.push((5, vec![(0., 0.), (1., 1.)]));
            }
            _ => return Err("Preset incompatível com a camada".into()),
        }
        self.selected.clear();
        for (c, values) in specs {
            let mut times = BTreeSet::new();
            for (f, _) in &values {
                let t = Tick::from_seconds_f64(self.frame(start + (end - start) * f));
                if !times.insert(t) {
                    return Err("Aumente a duração do preset para separar seus keyframes".into());
                }
            }
            self.doc.tracks[c].retain(|k| {
                k.data.time.seconds() < start - 1e-9 || k.data.time.seconds() > end + 1e-9
            });
            for (f, value) in values {
                let time = Tick::from_seconds_f64(self.frame(start + (end - start) * f));
                let mut data = Keyframe::new(time, Value::Scalar(value));
                animation::easy_ease(&mut data, true, true);
                let id = self.doc.new_id();
                self.selected.insert(id.clone());
                self.doc.tracks[c].push(Key { id, data });
            }
            self.doc.tracks[c].sort_by_key(|k| k.data.time);
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn editor() -> Editor {
        let mut e = Editor::default();
        let catalog: Vec<CatalogLayer> = serde_json::from_value(json!([
            {"id":"pin:a","name":"A","kind":"pin","values":{"lng":0.,"lat":0.,"rotation":0.,"opacity":0.8,"scale":1.}},
            {"id":"pin:b","name":"B","kind":"pin","values":{"lng":0.,"lat":0.,"rotation":0.,"opacity":1.,"scale":1.}}
        ])).unwrap();
        e.doc
            .set_objects(&catalog, &LayerAnimation::default())
            .unwrap();
        e
    }
    fn preset(e: &mut Editor, id: &str, mode: &str) {
        e.command(json!({"op":"preset","id":id,"mode":mode,"duration":1.}))
            .unwrap();
    }
    #[test]
    fn pop_is_native_editable_persisted_and_one_undo() {
        let mut e = editor();
        let before = e.doc.clone();
        preset(&mut e, "pin:a", "pop");
        assert_eq!(e.selected.len(), 6);
        assert_eq!(e.undo.len(), 1);
        let updates = e.doc.sample_objects(1.);
        assert_eq!(updates[0]["values"]["opacity"], 0.8);
        assert_eq!(updates[0]["values"]["scale"], 1.);
        assert_eq!(e.doc.to_legacy(), json!([]));
        let mut reopened = before.clone();
        let catalog: Vec<CatalogLayer>=serde_json::from_value(json!([{"id":"pin:a","name":"A","kind":"pin","values":{"lng":0.,"lat":0.,"rotation":0.,"opacity":0.8,"scale":1.}},{"id":"pin:b","name":"B","kind":"pin","values":{"lng":0.,"lat":0.,"rotation":0.,"opacity":1.,"scale":1.}}])).unwrap();
        reopened.set_objects(&catalog, &e.doc.animation()).unwrap();
        assert_eq!(reopened.sample_objects(0.5), e.doc.sample_objects(0.5));
        e.command(json!({"op":"undo"})).unwrap();
        assert_eq!(e.doc, before);
    }
    #[test]
    fn presets_preserve_other_keys_and_reject_short_or_locked_intervals() {
        let mut e = editor();
        preset(&mut e, "pin:a", "fade_in");
        e.time = 2.;
        preset(&mut e, "pin:a", "fade_out");
        let c = e
            .doc
            .properties
            .iter()
            .position(|p| p.uid == "pin:a/opacity")
            .unwrap();
        assert_eq!(e.doc.tracks[c].len(), 4);
        let before = e.doc.clone();
        e.time = 9.8;
        assert!(
            e.command(json!({"op":"preset","id":"pin:a","mode":"pop","duration":1.}))
                .is_err()
        );
        assert_eq!(e.doc, before);
        e.time = 0.;
        assert!(
            e.command(json!({"op":"preset","id":"pin:a","mode":"pop","duration":1./30.}))
                .is_err()
        );
        assert_eq!(e.doc, before);
        e.command(json!({"op":"layer","id":"pin:a","locked":true}))
            .unwrap();
        assert!(
            e.command(json!({"op":"preset","id":"pin:a","mode":"fade_in","duration":1.}))
                .is_err()
        );
    }
    #[test]
    fn retime_scales_native_velocity_and_rejects_collisions_atomically() {
        let mut e = editor();
        preset(&mut e, "pin:a", "fade_in");
        e.command(json!({"op":"velocity","out_speed":0.4,"out_influence":0.3}))
            .unwrap();
        e.command(json!({"op":"retime","start":2.,"duration":2.}))
            .unwrap();
        assert_eq!(e.selection_range(), Some((2., 4.)));
        let c = e
            .doc
            .properties
            .iter()
            .position(|p| p.uid == "pin:a/opacity")
            .unwrap();
        assert_eq!(e.doc.tracks[c][0].data.out_ease[0].speed, 0.2);
        e.time = 0.;
        preset(&mut e, "pin:a", "fade_in");
        let before = e.doc.clone();
        assert!(
            e.command(json!({"op":"retime","start":1.,"duration":1.}))
                .is_err()
        );
        assert_eq!(e.doc, before);
    }
    #[test]
    fn sequencing_preserves_group_offsets_and_is_one_transaction() {
        let mut e = editor();
        preset(&mut e, "pin:a", "pop");
        let a = e.selected.clone();
        preset(&mut e, "pin:b", "pop");
        e.selected.extend(a);
        e.time = 2.;
        let before = e.doc.clone();
        let count = e.undo.len();
        e.command(json!({"op":"sequence","gap":0.25})).unwrap();
        assert_eq!(e.undo.len(), count + 1);
        for (uid, expected) in [("pin:a/scale", 2.), ("pin:b/scale", 2.2666666666666666)] {
            let c = e.doc.properties.iter().position(|p| p.uid == uid).unwrap();
            assert!((e.doc.tracks[c][0].data.time.seconds() - expected).abs() < 1e-8);
        }
        e.command(json!({"op":"undo"})).unwrap();
        assert_eq!(e.doc, before);
        e.time = 9.5;
        assert!(e.command(json!({"op":"sequence","gap":1.})).is_err());
        assert_eq!(e.doc, before);
    }
    #[test]
    fn locked_retiming_and_invalid_preset_do_not_modify_the_document() {
        let mut e = editor();
        preset(&mut e, "pin:a", "pulse");
        e.command(json!({"op":"layer","id":"pin:a","locked":true}))
            .unwrap();
        let before = e.doc.clone();
        assert!(
            e.command(json!({"op":"retime","start":0.,"duration":2.}))
                .is_err()
        );
        assert!(e.command(json!({"op":"sequence","gap":0.})).is_err());
        assert_eq!(e.doc, before);
        assert!(
            e.command(json!({"op":"preset","id":"camera","mode":"pop","duration":1.}))
                .is_err()
        );
        assert_eq!(e.doc, before);
    }
    #[test]
    fn draw_preset_uses_the_existing_route_channel() {
        let mut e = editor();
        preset(&mut e, "route", "draw");
        assert_eq!(e.doc.sample(0.)[5], 0.);
        assert_eq!(e.doc.sample(1.)[5], 1.);
        assert_eq!(e.doc.to_legacy().as_array().unwrap().len(), 2);
    }
}
