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
    times.add(p.time);
  });
  return points;
}
export const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180;
export function sampleCamera(points, time) {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return { ...sorted[0] };
  if (time >= sorted[sorted.length - 1].time) return { ...sorted[sorted.length - 1] };
  const end = sorted.findIndex(p => p.time > time), a = sorted[end - 1], b = sorted[end];
  const t = (time - a.time) / (b.time - a.time);
  const u = a.easing === 'bezier' ? bezierProgress(t, curveOf(a)) : a.easing === 'hold' ? 0 : a.easing === 'smooth' ? t * t * (3 - 2 * t) : a.easing === 'easeIn' ? t * t : a.easing === 'easeOut' ? 1 - (1 - t) ** 2 : t;
  const lerp = key => a[key] + (b[key] - a[key]) * u;
  return { lng: wrap(a.lng + wrap(b.lng - a.lng) * u), lat: lerp('lat'), zoom: lerp('zoom'), pitch: lerp('pitch'),
    bearing: wrap(a.bearing + wrap(b.bearing - a.bearing) * u), pathProgress: lerp('pathProgress') };
}
