import { sampleCamera, validateWaypoints } from './animation';
import { parseTable, tableToFeatures, scaleByValue } from './csv';
import { DEFAULT_STYLE } from './features';
import { applyBasemap } from './basemap';

const a = { time: 0, lng: 179, lat: 0, zoom: 5, pitch: 0, bearing: 170, pathProgress: 0, easing: 'linear' };
const b = { ...a, time: 4, lng: -179, lat: 20, zoom: 9, bearing: -170, pathProgress: 1 };
test('samples camera, rotation and route along shortest angular path', () => {
  const mid = sampleCamera([b, a], 2);
  expect(mid.lng).toBe(-180); expect(mid.bearing).toBe(-180);
  expect(mid.lat).toBe(10); expect(mid.zoom).toBe(7); expect(mid.pathProgress).toBe(.5);
  expect(sampleCamera([a, b], -1).lng).toBe(179);
  expect(sampleCamera([a, b], 10).lng).toBe(-179);
});
test('easing preserves exact endpoints and timeline rejects duplicate times', () => {
  const eased = { ...a, easing: 'easeIn' };
  expect(sampleCamera([eased, b], 2).pathProgress).toBe(.25);
  expect(sampleCamera([eased, b], 4).pathProgress).toBe(1);
  expect(() => validateWaypoints([a, { ...b, time: 0 }])).toThrow();
  expect(() => validateWaypoints([{ ...a, lat: 91 }])).toThrow();
});
test('parses quoted CSV, escaped quotes, line breaks, BOM and semicolon tables', () => {
  const t = parseTable('\uFEFFname,longitude,latitude,value\r\n"São Paulo, BR",-46.63,-23.55,10\r\n"Rio ""RJ""\nBrasil",-43.2,-22.9,30\r\n');
  expect(t.rows).toHaveLength(2); expect(t.rows[1][0]).toBe('Rio "RJ"\nBrasil');
  const features = tableToFeatures(t, { lng: 'longitude', lat: 'latitude', name: 'name' });
  expect(features[0].geometry.coordinates).toEqual([-46.63, -23.55]);
  const sized = scaleByValue(features.map(feature => ({ feature, style: DEFAULT_STYLE })), 'value');
  expect(sized[0].style.radius).toBe(5); expect(sized[1].style.radius).toBe(25);
  expect(parseTable('name;lng;lat\nSP;-46;-23').columns).toHaveLength(3);
});
test('rejects malformed tables and missing coordinates instead of importing zero', () => {
  expect(() => parseTable('a,a\n1,2')).toThrow();
  expect(() => parseTable('a,b\n"unclosed,2')).toThrow();
  expect(() => tableToFeatures(parseTable('lng,lat\n,10'), { lng: 'lng', lat: 'lat' })).toThrow();
});
test('basemap appearance restores original visibility and colors', () => {
  const map = { getLayer: () => true, setLayoutProperty: jest.fn(), setPaintProperty: jest.fn() };
  const layers = [{ id: 'water', type: 'fill', paint: { 'fill-color': '#123456' } }, { id: 'road', type: 'line' }];
  applyBasemap(map, layers, { roads: false, water: '#abcdef' });
  expect(map.setLayoutProperty).toHaveBeenCalledWith('road', 'visibility', 'none');
  expect(map.setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', '#abcdef');
  applyBasemap(map, layers, {});
  expect(map.setLayoutProperty).toHaveBeenLastCalledWith('road', 'visibility', 'visible');
  expect(map.setPaintProperty).toHaveBeenLastCalledWith('water', 'fill-color', '#123456');
});
