import { flattenKeys, packKeys, moveTrackKeys, patchTrackKeys, captureTrackKeys, copyTrackKeys, pasteTrackKeys, snapTime, deleteTrackKeys, easyEaseKeys } from './keyframes';
import { sampleCamera, validateWaypoints } from './animation';
import { animateRouteViews } from './route';
import { viewsToTheatre } from './theatre';
const a = { id: 'a', time: 0, lng: 0, lat: 0, zoom: 4, pitch: 0, bearing: 0, pathProgress: 0, easing: 'linear' };
const b = { ...a, id: 'b', time: 4, lng: 10, lat: 10, zoom: 8, pathProgress: 1 };
const source = [a, b];
beforeEach(() => { let n = 0; Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: () => `generated-${++n}` } }); });
const factory = () => { let n = 0; return () => `new-${++n}`; };
test('legacy snapshots round-trip into tracks without changing preview/export samples', () => {
  const flat = flattenKeys(source), points = packKeys(flat, source, factory());
  expect(flat).toHaveLength(12);
  for (const t of [0, .5, 1, 2, 3.99, 4]) expect(sampleCamera(points, t)).toEqual(sampleCamera(source, t));
  expect(() => validateWaypoints(JSON.parse(JSON.stringify(points)))).not.toThrow();
});
test('retiming one property preserves all other channels and key identity across the gesture', () => {
  let points = moveTrackKeys(source, ['b:zoom'], -2, 4, 30);
  const moved = flattenKeys(points).find(k => k.id === 'b:zoom');
  expect(moved.time).toBe(2); expect(sampleCamera(points, 2).zoom).toBe(8);
  expect(sampleCamera(points, 2).lng).toBe(5); expect(sampleCamera(points, 2).pathProgress).toBe(.5);
  points = moveTrackKeys(points, ['b:zoom'], -1, 4, 30); expect(flattenKeys(points).find(k => k.id === 'b:zoom').time).toBe(1);
});
test('track collisions reject movement atomically while different properties can share a time', () => {
  expect(() => moveTrackKeys(source, ['b:zoom'], -4, 4, 30)).toThrow();
  const moved = moveTrackKeys(source, ['a:zoom'], 2, 4, 30);
  expect(flattenKeys(moved).filter(k => k.time === 2)).toHaveLength(1);
  expect(source[0].time).toBe(0);
});
test('snap uses closest candidate at the same pixel tolerance as the reference workflow', () => {
  expect(snapTime([0, 1, 2], 1.04, .05)).toBe(1);
  expect(snapTime([0, 1, 2], 1.04, .02)).toBe(1.04);
  const moved = moveTrackKeys(source, ['b:zoom'], -2.9, 4, 30, { snap: true, playhead: 1, tolerance: .15 });
  expect(flattenKeys(moved).find(k => k.id === 'b:zoom').time).toBe(1);
});
test('clipboard preserves relative timing, replaces destination keys and creates fresh ids', () => {
  const clip = copyTrackKeys(source, ['a:zoom', 'b:zoom']);
  const pasted = pasteTrackKeys(source, clip, 1, 8, 30, factory());
  expect(flattenKeys(pasted.points).filter(k => pasted.selected.includes(k.id)).map(k => k.time)).toEqual([1, 5]);
  expect(flattenKeys(pasted.points)).toHaveLength(14);
  const replaced = pasteTrackKeys(source, clip, 0, 4, 30, factory()); expect(flattenKeys(replaced.points)).toHaveLength(12);
  expect(() => pasteTrackKeys(source, clip, 2, 4, 30, factory())).toThrow();
});
test('per-channel value, hold and easing change only the selected property', () => {
  const points = patchTrackKeys(source, ['a:zoom'], { easing: 'hold', value: 6 });
  expect(sampleCamera(points, 2).zoom).toBe(6); expect(sampleCamera(points, 2).lng).toBe(5);
  expect(sampleCamera(points, 4).zoom).toBe(8);
  expect(flattenKeys(deleteTrackKeys(source, ['a:zoom']))).toHaveLength(11);
});
test('property-only capture and route preparation retain independent camera tracks', () => {
  const capture = captureTrackKeys(source, { ...a, zoom: 10 }, 2, ['zoom'], factory());
  expect(flattenKeys(capture.points).filter(k => k.time === 2).map(k => k.channel)).toEqual(['zoom']);
  const animated = animateRouteViews(capture.points, a, 4, factory());
  expect(sampleCamera(animated, 2).zoom).toBe(10); expect(sampleCamera(animated, 2).pathProgress).toBe(.5);
});
test('Theatre conversion preserves independent key times and channel easing', () => {
  const points = patchTrackKeys(moveTrackKeys(source, ['b:zoom'], -2, 4, 30), ['a:zoom'], { easing: 'hold' });
  const tracks = viewsToTheatre(points, 4, 30).sheetsById['Main Scene'].sequence.tracksByObject.Map.trackData;
  expect(tracks['camera-zoom'].keyframes.map(k => k.position)).toEqual([0, 2]);
  expect(tracks['camera-lng'].keyframes.map(k => k.position)).toEqual([0, 4]);
  expect(tracks['camera-zoom'].keyframes[0].type).toBe('hold');
});
test('clipboard and persisted metadata reject invalid channels, values and curves', () => {
  expect(() => pasteTrackKeys(source, { format: 'MapAnimatorKeys', version: 1, keys: [{ id: 'x', time: 0, channel: 'zoom', value: Infinity, easing: 'linear' }] }, 1, 4, 30, factory())).toThrow();
  expect(() => validateWaypoints([{ ...a, channels: ['unknown'] }])).toThrow();
  expect(() => validateWaypoints([{ ...a, interpolation: { zoom: { easing: 'bezier', curve: [0, NaN, 1, 1] } } }])).toThrow();
});

test('the first property-only capture keeps other camera properties static at their actual values', () => {
  const values = { ...a, lng: -46.6, lat: -23.5, zoom: 12 };
  const captured = captureTrackKeys([], values, 1, ['zoom'], factory());
  expect(sampleCamera(captured.points, 0)).toMatchObject({ lng: -46.6, lat: -23.5, zoom: 12 });
  const pasted = pasteTrackKeys([], copyTrackKeys(captured.points, captured.selected), 0, 4, 30, factory(), values);
  expect(sampleCamera(pasted.points, 0).lng).toBe(-46.6);
});
test('deleting the last keys of a property freezes it at the current camera value', () => {
  const result = deleteTrackKeys(source, ['a:zoom', 'b:zoom'], { ...a, zoom: 6 });
  expect(sampleCamera(result, 1).zoom).toBe(6); expect(sampleCamera(result, 2).zoom).toBe(6);
  expect(sampleCamera(result, 2).lng).toBe(5);
});

test('Easy Ease changes incoming and outgoing handles of only the selected property', () => {
  const middle = { ...a, id: 'm', time: 2, zoom: 6 };
  const points = [a, middle, b];
  const result = flattenKeys(easyEaseKeys(points, ['m:zoom']));
  expect(result.find(k => k.id === 'a:zoom').curve.slice(2)).toEqual([2 / 3, 1]);
  expect(result.find(k => k.id === 'm:zoom').curve.slice(0, 2)).toEqual([1 / 3, 0]);
  expect(result.find(k => k.id === 'a:lng').easing).toBe('linear');
  const incoming = flattenKeys(easyEaseKeys(points, ['m:zoom'], 'in'));
  expect(incoming.find(k => k.id === 'm:zoom').easing).toBe('linear');
  const outgoing = flattenKeys(easyEaseKeys(points, ['m:zoom'], 'out'));
  expect(outgoing.find(k => k.id === 'a:zoom').easing).toBe('linear');
});
