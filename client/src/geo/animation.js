export const CHANNELS = ['lng', 'lat', 'zoom', 'pitch', 'bearing', 'pathProgress'];
export const channelPoint = (p, key) => ({ ...p, ...(p.interpolation?.[key] || {}) });
export const hasChannel = (p, key) => !p.channels || p.channels.includes(key);
export const EASINGS = ['linear', 'smooth', 'easeIn', 'easeOut', 'bezier', 'hold'];
export const CURVES = { linear: [0, 0, 1, 1], smooth: [1 / 3, 0, 2 / 3, 1], easeIn: [1 / 3, 0, 2 / 3, 1 / 3], easeOut: [1 / 3, 2 / 3, 2 / 3, 1] };
export const curveOf = point => point.easing === 'bezier' ? (point.curve || CURVES.smooth) : (CURVES[point.easing] || CURVES.linear);
export function bezierProgress(t, curve) {
  if (t <= 0 || t >= 1) return Math.max(0, Math.min(1, t));
  const [x1, y1, x2, y2] = curve;
  const value = (s, a, b) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (value(mid, x1, x2) < t) lo = mid; else hi = mid; }
  return value((lo + hi) / 2, y1, y2);
}
export function moveKeyframes(points, ids, delta, duration, fps) {
  const selected = points.filter(p => ids.includes(p.id));
  if (!selected.length) return points;
  const lo = Math.min(...selected.map(p => p.time)), hi = Math.max(...selected.map(p => p.time));
  const offset = Math.max(-lo, Math.min(duration - hi, Math.round(delta * fps) / fps));
  const result = points.map(p => ids.includes(p.id) ? { ...p, time: Number((p.time + offset).toFixed(8)) } : p);
  if (result.some((p, i) => result.some((q, j) => i !== j && Math.abs(p.time - q.time) < 1e-7))) return points;
  return result.sort((a, b) => a.time - b.time);
}
export function validateWaypoints(points) {
  if (!Array.isArray(points) || points.length > 500) throw new Error('Timeline: máximo de 500 vistas.');
  const times = new Set();
  points.forEach(p => {
    if (!p || !Number.isFinite(p.time) || p.time < 0 || p.time > 600 || times.has(p.time) || !EASINGS.includes(p.easing) ||
      !['lng', 'lat', 'zoom', 'pitch', 'bearing', 'pathProgress'].every(k => Number.isFinite(p[k])) ||
      Math.abs(p.lng) > 180 || Math.abs(p.lat) > 85 || p.zoom < 0 || p.zoom > 24 || p.pitch < 0 || p.pitch > 85 || Math.abs(p.bearing) > 180 || p.pathProgress < 0 || p.pathProgress > 1) throw new Error('Timeline: vista ou tempo inválido/duplicado.');
    if (p.easing === 'bezier' && (!Array.isArray(p.curve) || p.curve.length !== 4 || !p.curve.every(v => Number.isFinite(v) && v >= 0 && v <= 1))) throw new Error('Timeline: curva Bézier inválida.');
    if (p.channels !== undefined && (!Array.isArray(p.channels) || !p.channels.length || new Set(p.channels).size !== p.channels.length || p.channels.some(k => !CHANNELS.includes(k)))) throw new Error('Timeline: propriedades inválidas.');
    if (p.keyIds !== undefined && (!p.keyIds || typeof p.keyIds !== 'object' || Array.isArray(p.keyIds) || Object.entries(p.keyIds).some(([k, v]) => !CHANNELS.includes(k) || typeof v !== 'string' || !v.length || v.length > 200))) throw new Error('Timeline: identificação de keyframe inválida.');
    if (p.interpolation !== undefined) {
      if (!p.interpolation || typeof p.interpolation !== 'object' || Array.isArray(p.interpolation)) throw new Error('Timeline: interpolação inválida.');
      Object.entries(p.interpolation).forEach(([k, v]) => { if (!CHANNELS.includes(k) || !v || !EASINGS.includes(v.easing) || (v.easing === 'bezier' && (!Array.isArray(v.curve) || v.curve.length !== 4 || !v.curve.every(n => Number.isFinite(n) && n >= 0 && n <= 1)))) throw new Error('Timeline: curva por propriedade inválida.'); });
    }
    times.add(p.time);
  });
  return points;
}
export const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180;
export const easeProgress = (point, t) => point.easing === 'bezier' ? bezierProgress(t, curveOf(point)) : point.easing === 'hold' ? 0 : point.easing === 'smooth' ? t * t * (3 - 2 * t) : point.easing === 'easeIn' ? t * t : point.easing === 'easeOut' ? 1 - (1 - t) ** 2 : t;
export function sampleCamera(points, time) {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const result = {};
  CHANNELS.forEach(key => {
    const track = sorted.filter(p => hasChannel(p, key));
    if (!track.length) { result[key] = sorted[0][key]; return; }
    if (time <= track[0].time) { result[key] = track[0][key]; return; }
    if (time >= track[track.length - 1].time) { result[key] = track[track.length - 1][key]; return; }
    const end = track.findIndex(p => p.time > time), a = track[end - 1], b = track[end];
    const u = easeProgress(channelPoint(a, key), (time - a.time) / (b.time - a.time));
    result[key] = ['lng', 'bearing'].includes(key) ? wrap(a[key] + wrap(b[key] - a[key]) * u) : a[key] + (b[key] - a[key]) * u;
  });
  return result;
}
