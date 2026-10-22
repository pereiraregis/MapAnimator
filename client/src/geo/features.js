// WGS84 GeoJSON only. Keep imported properties separate from renderer metadata.
export const DEFAULT_STYLE = { color: '#4fc3d4', opacity: 0.45, width: 3, radius: 7 };
const position = p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const line = c => Array.isArray(c) && c.length >= 2 && c.every(position);
const ring = c => line(c) && c.length >= 4 && c[0].length === c[c.length - 1].length && c[0].every((v, i) => v === c[c.length - 1][i]);
const polygon = c => Array.isArray(c) && c.length > 0 && c.every(ring);
const validators = {
  Point: position, MultiPoint: c => Array.isArray(c) && c.length > 0 && c.every(position),
  LineString: line, MultiLineString: c => Array.isArray(c) && c.length > 0 && c.every(line),
  Polygon: polygon, MultiPolygon: c => Array.isArray(c) && c.length > 0 && c.every(polygon),
};

export function normalizeGeoJSON(input) {
  const raw = input?.type === 'FeatureCollection' ? input.features : input?.type === 'Feature' ? [input] : [{ type: 'Feature', properties: {}, geometry: input }];
  if (!Array.isArray(raw) || !raw.length || raw.length > 5000) throw new Error('Importe entre 1 e 5000 elementos por arquivo.');
  return raw.map((f, i) => {
    const g = f?.geometry;
    if (f?.type !== 'Feature' || !validators[g?.type]?.(g.coordinates)) throw new Error(`Geometria inválida no elemento ${i + 1}. Use GeoJSON WGS84 com coordenadas [longitude, latitude]. GeometryCollection não é suportada.`);
    if (f.properties != null && (typeof f.properties !== 'object' || Array.isArray(f.properties))) throw new Error('As propriedades devem ser um objeto.');
    return { type: 'Feature', ...(f.id !== undefined ? { id: f.id } : {}), properties: f.properties || {}, geometry: g };
  });
}

export function featureBounds(feature) {
  const points = [];
  function walk(c) { if (typeof c[0] === 'number') points.push(c); else c.forEach(walk); }
  walk(feature.geometry.coordinates);
  return points.reduce((b, p) => [[Math.min(b[0][0], p[0]), Math.min(b[0][1], p[1])], [Math.max(b[1][0], p[0]), Math.max(b[1][1], p[1])]], [[180, 90], [-180, -90]]);
}

export function makeItems(features, filename = 'Elemento') {
  return features.map((feature, i) => ({
    id: crypto.randomUUID(), feature, name: String(feature.properties.name || feature.properties.display_name || `${filename} ${i + 1}`),
    visible: true, style: { ...DEFAULT_STYLE },
  }));
}

export function renderCollection(items) {
  return { type: 'FeatureCollection', features: items.filter(i => i.visible).map(i => ({
    ...i.feature, properties: { ...i.feature.properties, _maId: i.id, _maColor: i.style.color, _maOpacity: i.style.opacity, _maWidth: i.style.width, _maRadius: i.style.radius },
  })) };
}

export const DEMO = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { name: 'Área de destaque · São Paulo' }, geometry: { type: 'Polygon', coordinates: [[[-46.67, -23.57], [-46.60, -23.57], [-46.60, -23.53], [-46.67, -23.53], [-46.67, -23.57]]] } },
  { type: 'Feature', properties: { name: 'Conexão ilustrativa' }, geometry: { type: 'LineString', coordinates: [[-46.655, -23.565], [-46.633, -23.55], [-46.612, -23.54]] } },
  { type: 'Feature', properties: { name: 'São Paulo' }, geometry: { type: 'Point', coordinates: [-46.633, -23.55] } },
] };
