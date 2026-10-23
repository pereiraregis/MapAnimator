// EffectCraft interaction reference: 357b4c5bd531f9032ad6dc02937dcc75ab293ee9.
// React implementation for MapAnimator. See docs/EFFECTCRAFT_REFERENCE.md.
import { CHANNELS, hasChannel, channelPoint, sampleCamera, validateWaypoints, curveOf } from './animation';
export const PROPERTIES = [
  { key: 'lng', name: 'Longitude', min: -180, max: 180, step: .0001, unit: '°', color: '#ea917a' },
  { key: 'lat', name: 'Latitude', min: -85, max: 85, step: .0001, unit: '°', color: '#80c7a8' },
  { key: 'zoom', name: 'Zoom', min: 0, max: 24, step: .1, unit: 'z', color: '#e8bf68' },
  { key: 'pitch', name: 'Inclinação', min: 0, max: 85, step: .1, unit: '°', color: '#89afed' },
  { key: 'bearing', name: 'Rotação', min: -180, max: 180, step: .1, unit: '°', color: '#c29bea' },
  { key: 'pathProgress', name: 'Revelação da rota', min: 0, max: 1, step: .01, unit: '', color: '#70d8d2' },
];
export const frameTime = (t, fps) => Number((Math.round(t * fps) / fps).toFixed(8));
export function flattenKeys(points) {
  return points.flatMap((p, index) => CHANNELS.filter(key => hasChannel(p, key)).map(channel => {
    const value = channelPoint(p, channel);
    return { id: p.keyIds?.[channel] || `${p.id || index}:${channel}`, channel, time: p.time, value: p[channel], easing: value.easing, ...(value.curve ? { curve: [...value.curve] } : {}) };
  })).sort((a, b) => a.time - b.time || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel));
}
export function packKeys(keys, baseline, id = () => crypto.randomUUID()) {
  const groups = new Map(), ids = new Set();
  keys.forEach(k => {
    const prop = PROPERTIES.find(p => p.key === k.channel);
    if (!prop || typeof k.id !== 'string' || ids.has(k.id) || !Number.isFinite(k.time) || k.time < 0 || k.time > 600 || !Number.isFinite(k.value) || k.value < prop.min || k.value > prop.max) throw Error('Keyframe inválido.');
    ids.add(k.id); const t = Number(k.time.toFixed(8));
    if (!groups.has(t)) {
      const sample = sampleCamera(baseline, t) || { lng: 0, lat: 0, zoom: 5, pitch: 0, bearing: 0, pathProgress: 1 };
      groups.set(t, { ...sample, id: baseline.find(p => Math.abs(p.time - t) < 1e-7)?.id || id(), time: t, easing: 'linear', channels: [], keyIds: {}, interpolation: {} });
    }
    const point = groups.get(t);
    if (point.channels.includes(k.channel)) throw Error('Já existe um keyframe dessa propriedade nesse tempo.');
    point.channels.push(k.channel); point[k.channel] = k.value; point.keyIds[k.channel] = k.id;
    point.interpolation[k.channel] = { easing: k.easing, ...(k.curve ? { curve: [...k.curve] } : {}) };
  });
  const result = [...groups.values()].sort((a, b) => a.time - b.time);
  validateWaypoints(result); return result;
}
// Adapted from EffectCraft snap_time (MIT): closest target within a pixel-derived tolerance.
export function snapTime(candidates, time, tolerance) {
  return candidates.filter(t => Math.abs(t - time) <= tolerance).sort((a, b) => Math.abs(a - time) - Math.abs(b - time))[0] ?? time;
}
export function moveTrackKeys(points, selected, delta, duration, fps, options = {}) {
  const keys = flattenKeys(points), moving = keys.filter(k => selected.includes(k.id));
  if (!moving.length) return points;
  const anchor = moving.find(k => k.id === options.anchor) || moving[0];
  let offset = frameTime(anchor.time + delta, fps) - anchor.time;
  if (options.snap) {
    const candidates = [0, duration, options.playhead ?? 0, ...keys.filter(k => !selected.includes(k.id)).map(k => k.time)];
    const target = snapTime(candidates, anchor.time + offset, options.tolerance || 0);
    offset = frameTime(target, fps) - anchor.time;
  }
  offset = Math.max(-Math.min(...moving.map(k => k.time)), Math.min(duration - Math.max(...moving.map(k => k.time)), offset));
  if (Math.abs(offset) < 1e-9) return points;
  return packKeys(keys.map(k => selected.includes(k.id) ? { ...k, time: Number((k.time + offset).toFixed(8)) } : k), points);
}
export function patchTrackKeys(points, selected, patch) {
  const keys = flattenKeys(points), after = keys.map(k => selected.includes(k.id) ? { ...k, ...patch } : k);
  return JSON.stringify(keys) === JSON.stringify(after) ? points : packKeys(after, points);
}
export function deleteTrackKeys(points, selected, frozen) {
  if (!selected.length) return points;
  const remaining = flattenKeys(points).filter(k => !selected.includes(k.id)), result = packKeys(remaining, points);
  CHANNELS.filter(channel => !remaining.some(k => k.channel === channel)).forEach(channel => result.forEach(p => { p[channel] = frozen?.[channel] ?? sampleCamera(points, 0)?.[channel] ?? p[channel]; }));
  return result;
}
export function copyTrackKeys(points, selected) {
  const keys = flattenKeys(points).filter(k => selected.includes(k.id));
  if (!keys.length) return null;
  const start = Math.min(...keys.map(k => k.time));
  return { format: 'MapAnimatorKeys', version: 1, keys: keys.map(k => ({ ...k, time: k.time - start })) };
}
export function pasteTrackKeys(points, clip, time, duration, fps, id = () => crypto.randomUUID(), frozen) {
  if (clip?.format !== 'MapAnimatorKeys' || clip.version !== 1 || !Array.isArray(clip.keys) || !clip.keys.length || clip.keys.length > 3000) throw Error('Área de transferência de keyframes inválida.');
  const pasted = clip.keys.map(k => ({ ...k, id: id(), time: frameTime(time + k.time, fps) }));
  if (pasted.some(k => k.time < 0 || k.time > duration)) throw Error('Os keyframes colados ultrapassam a duração.');
  const old = flattenKeys(points).filter(k => !pasted.some(p => p.channel === k.channel && Math.abs(p.time - k.time) < 1e-7));
  return { points: packKeys([...old, ...pasted], points.length ? points : frozen ? [{ ...frozen, id: id(), time: 0, easing: 'linear', channels: [] }] : [], id), selected: pasted.map(k => k.id) };
}
export function captureTrackKeys(points, values, time, channels = CHANNELS, id = () => crypto.randomUUID()) {
  const old = flattenKeys(points).filter(k => !(channels.includes(k.channel) && Math.abs(k.time - time) < 1e-7));
  const added = channels.map(channel => ({ id: id(), channel, time, value: values[channel], easing: 'smooth' }));
  return { points: packKeys([...old, ...added], points.length ? points : [{ ...values, id: id(), time, easing: 'linear', channels: [] }], id), selected: added.map(k => k.id) };
}

// Easy Ease affects both sides of a selected key, not every channel at that time.
export function easyEaseKeys(points, selected, mode = 'both') {
  const keys = flattenKeys(points).map(k => ({ ...k }));
  CHANNELS.forEach(channel => {
    const track = keys.filter(k => k.channel === channel).sort((a, b) => a.time - b.time);
    track.forEach((key, i) => {
      if (!selected.includes(key.id)) return;
      if (mode !== 'in') { const curve = [...curveOf(key)]; curve[0] = 1 / 3; curve[1] = 0; key.easing = 'bezier'; key.curve = curve; }
      if (mode !== 'out' && i && track[i - 1].easing !== 'hold') { const previous = track[i - 1], curve = [...curveOf(previous)]; curve[2] = 2 / 3; curve[3] = 1; previous.easing = 'bezier'; previous.curve = curve; }
    });
  });
  return JSON.stringify(keys) === JSON.stringify(flattenKeys(points)) ? points : packKeys(keys, points);
}
