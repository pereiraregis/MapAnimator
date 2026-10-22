import { DEMO, normalizeGeoJSON, featureBounds, renderCollection, DEFAULT_STYLE } from './features';
import { validateScene } from './scene';
import { syncFeatureLayers } from './layers';

test('accepts points, lines, polygons, multi geometries and preserves user properties', () => {
  expect(normalizeGeoJSON(DEMO)).toHaveLength(3);
  const multi = { type: 'MultiPolygon', coordinates: [DEMO.features[0].geometry.coordinates] };
  expect(normalizeGeoJSON(multi)[0].geometry).toEqual(multi);
  expect(normalizeGeoJSON(DEMO.features[2])[0].properties.name).toBe('São Paulo');
});

test('rejects invalid positions, unclosed rings and unsupported collections before import', () => {
  for (const geometry of [
    { type: 'Point', coordinates: [190, 20] },
    { type: 'LineString', coordinates: [[1, 2]] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
    { type: 'GeometryCollection', geometries: [] },
    { type: 'Point', coordinates: [null, 20] },
  ]) expect(() => normalizeGeoJSON(geometry)).toThrow();
});

test('computes bounds and excludes hidden features without changing imported properties', () => {
  expect(featureBounds(DEMO.features[0])).toEqual([[-46.67, -23.57], [-46.6, -23.53]]);
  const items = DEMO.features.map((feature, i) => ({ id: String(i), feature, visible: i !== 1, style: DEFAULT_STYLE }));
  const result = renderCollection(items);
  expect(result.features).toHaveLength(2);
  expect(result.features[0].properties._maColor).toBe(DEFAULT_STYLE.color);
  expect(DEMO.features[0].properties._maColor).toBeUndefined();
});

const scene = () => ({ format: 'MapAnimator', version: 1, name: 'Test',
  settings: { resolution: '1920x1080', fps: 30, exportDuration: 3, mapStyle: 'https://tiles.openfreemap.org/styles/bright', pathColor: '#ec4899', pathWidth: 5 },
  camera: { lng: -46.633, lat: -23.55, zoom: 12, pitch: 0, bearing: 0 }, pins: [], route: [],
  features: [{ id: 'test', name: 'SP', visible: true, style: { ...DEFAULT_STYLE }, feature: DEMO.features[0] }],
  theatre: { sheetsById: {}, definitionVersion: '0.4.0', revisionHistory: [] },
});

test('scene JSON round trip retains geographic styles and timeline', () => {
  const original = scene();
  const restored = validateScene(JSON.parse(JSON.stringify(original)));
  expect(restored).toEqual(original);
});

test('rejects incompatible or corrupt projects before replacing the current scene', () => {
  const invalid = scene(); invalid.features[0].style.opacity = 5;
  expect(() => validateScene(invalid)).toThrow();
  const duplicate = scene(); duplicate.features.push(duplicate.features[0]);
  expect(() => validateScene(duplicate)).toThrow();
  expect(() => validateScene({ ...scene(), camera: { lng: 999 } })).toThrow();
  expect(() => validateScene({ ...scene(), version: 2 })).toThrow();
});

test('rebuilds geographic layers after style.load even while pin sources are loading', () => {
  const map = { isStyleLoaded: () => false, getSource: () => undefined, addSource: jest.fn(), addLayer: jest.fn() };
  syncFeatureLayers(map, []);
  expect(map.addSource).not.toHaveBeenCalled();
  syncFeatureLayers(map, [], true);
  expect(map.addSource).toHaveBeenCalledWith('ma-features', expect.any(Object));
  expect(map.addLayer).toHaveBeenCalledTimes(3);
});
