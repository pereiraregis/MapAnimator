import { sampleCamera } from './animation';

// Coordinates and reveal sampling are shared by preview, edits and export.
export const emptyCollection = () => ({ type: 'FeatureCollection', features: [] });
export function routeLine(coords) {
  return coords.length >= 2 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] } : emptyCollection();
}
const deltaLng = (a, b) => ((b - a + 540) % 360) - 180;
export function midpoint(a, b) { return [((a[0] + deltaLng(a[0], b[0]) / 2 + 540) % 360) - 180, (a[1] + b[1]) / 2]; }
const length = (a, b) => Math.hypot(deltaLng(a[0], b[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), b[1] - a[1]);
export function revealRoute(coords, progress) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 1));
  if (coords.length < 2 || p <= 0) return [];
  if (p >= 1) return coords.map(c => [...c]);
  const lengths = coords.slice(1).map((c, i) => length(coords[i], c));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return [];
  const target = total * p, result = [[...coords[0]]]; let distance = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (!lengths[i]) continue;
    if (distance + lengths[i] >= target) {
      const t = (target - distance) / lengths[i], a = coords[i], b = coords[i + 1];
      result.push([((a[0] + deltaLng(a[0], b[0]) * t + 540) % 360) - 180, a[1] + (b[1] - a[1]) * t]); return result;
    }
    result.push([...coords[i + 1]]); distance += lengths[i];
  }
  return result;
}
export function routeHandles(coords, selected) {
  return { type: 'FeatureCollection', features: coords.flatMap((c, i) => [
    { type: 'Feature', properties: { kind: 'vertex', index: i, selected: i === selected }, geometry: { type: 'Point', coordinates: c } },
    ...(i < coords.length - 1 ? [{ type: 'Feature', properties: { kind: 'midpoint', index: i, selected: false }, geometry: { type: 'Point', coordinates: midpoint(c, coords[i + 1]) } }] : []),
  ]) };
}
export function animateRouteViews(points, camera, duration, id = () => crypto.randomUUID()) {
  const active = points.filter(p => p.time <= duration).sort((a, b) => a.time - b.time);
  const first = sampleCamera(points, 0) || camera, last = sampleCamera(points, duration) || camera;
  const result = active.map(p => ({ ...p, pathProgress: p.time / duration }));
  if (!result.some(p => p.time === 0)) result.unshift({ ...first, id: id(), time: 0, easing: 'linear', pathProgress: 0 });
  if (!result.some(p => p.time === duration)) result.push({ ...last, id: id(), time: duration, easing: 'linear', pathProgress: 1 });
  return [...result, ...points.filter(p => p.time > duration)].sort((a, b) => a.time - b.time);
}
