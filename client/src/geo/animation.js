export const EASINGS = ['linear', 'smooth', 'easeIn', 'easeOut'];
export function validateWaypoints(points) {
  if (!Array.isArray(points) || points.length > 500) throw new Error('Timeline: máximo de 500 vistas.');
  const times = new Set();
  points.forEach(p => {
    if (!p || !Number.isFinite(p.time) || p.time < 0 || p.time > 600 || times.has(p.time) || !EASINGS.includes(p.easing) ||
      !['lng', 'lat', 'zoom', 'pitch', 'bearing', 'pathProgress'].every(k => Number.isFinite(p[k])) ||
      Math.abs(p.lng) > 180 || Math.abs(p.lat) > 85 || p.zoom < 0 || p.zoom > 24 || p.pitch < 0 || p.pitch > 85 || Math.abs(p.bearing) > 180 || p.pathProgress < 0 || p.pathProgress > 1) throw new Error('Timeline: vista ou tempo inválido/duplicado.');
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
  const u = a.easing === 'smooth' ? t * t * (3 - 2 * t) : a.easing === 'easeIn' ? t * t : a.easing === 'easeOut' ? 1 - (1 - t) ** 2 : t;
  const lerp = key => a[key] + (b[key] - a[key]) * u;
  return { lng: wrap(a.lng + wrap(b.lng - a.lng) * u), lat: lerp('lat'), zoom: lerp('zoom'), pitch: lerp('pitch'),
    bearing: wrap(a.bearing + wrap(b.bearing - a.bearing) * u), pathProgress: lerp('pathProgress') };
}
