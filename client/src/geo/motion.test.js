import { bezierProgress, sampleCamera, validateWaypoints, moveKeyframes, CURVES } from './animation';
import { viewsToTheatre } from './theatre';
import { renderCollection, DEFAULT_STYLE, normalizeGeoJSON } from './features';
import { pinLayout } from './pins';

const a = { id: 'a', time: 0, lng: 179, lat: 0, zoom: 5, pitch: 0, bearing: 170, pathProgress: 0, easing: 'smooth' };
const b = { ...a, id: 'b', time: 4, lng: -179, zoom: 9, bearing: -170, pathProgress: 1 };
test('custom Bezier is sampled by the camera and accepts only finite normalized handles', () => {
  const p = { ...a, easing: 'bezier', curve: CURVES.easeIn };
  expect(bezierProgress(.5, CURVES.easeIn)).toBeCloseTo(.25, 6);
  expect(sampleCamera([p, b], 2).zoom).toBeCloseTo(6, 6);
  expect(sampleCamera([{ ...a, easing: 'hold' }, b], 3.9).zoom).toBe(5);
  expect(sampleCamera([{ ...a, easing: 'hold' }, b], 4).zoom).toBe(9);
  expect(() => validateWaypoints([p, b])).not.toThrow();
  expect(() => validateWaypoints([{ ...p, curve: [0, 0, NaN, 1] }])).toThrow();
});
test('key retiming snaps to frames, clamps group and rejects collisions', () => {
  const c = { ...a, id: 'c', time: 2 };
  expect(moveKeyframes([a, c, b], ['c'], .117, 4, 30)[1].time).toBeCloseTo(2 + 4 / 30);
  expect(moveKeyframes([a, c, b], ['c'], -2, 4, 30)).toEqual([a, c, b]);
  const moved = moveKeyframes([a, c, b], ['a', 'c'], -10, 4, 30);
  expect(moved.map(p => p.time)).toEqual([0, 2, 4]);
  expect(moveKeyframes([a, c, b], ['a', 'c'], .5, 4, 30).map(p => p.time)).toEqual([.5, 2.5, 4]);
});
test('Theatre conversion preserves channels, handles and shortest angular path', () => {
  const state = viewsToTheatre([a, b], 5, 30);
  const seq = state.sheetsById['Main Scene'].sequence;
  const tracks = seq.tracksByObject.Map.trackData;
  expect(seq.subUnitsPerUnit).toBe(30); expect(seq.length).toBe(5);
  expect(tracks['camera-lng'].keyframes[1].value).toBe(181);
  expect(tracks['camera-bearing'].keyframes[1].value).toBe(190);
  expect(tracks['camera-zoom'].keyframes[0].handles.slice(2)).toEqual(CURVES.smooth.slice(0, 2));
  expect(tracks['camera-zoom'].keyframes[1].handles.slice(0, 2)).toEqual(CURVES.smooth.slice(2));
});
test('fill and outline render independently and preserve legacy styles', () => {
  const feature = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } };
  const item = { id: 'x', feature, visible: true, style: { ...DEFAULT_STYLE, fill: false, strokeColor: '#ff0000' } };
  const props = renderCollection([item]).features[0].properties;
  expect(props._maFillOpacity).toBe(0); expect(props._maLineOpacity).toBe(.45); expect(props._maStroke).toBe('#ff0000');
  expect(renderCollection([{ ...item, style: DEFAULT_STYLE }]).features[0].properties._maFillOpacity).toBe(.45);
});
test('Natural Earth catalog contains valid fillable country polygons', () => {
  const fs = require('fs'), path = require('path');
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/countries.geojson'), 'utf8'));
  const features = normalizeGeoJSON(data);
  expect(features).toHaveLength(177);
  expect(features.find(f => f.properties.code === 'BRA').properties.name).toBe('Brasil');
});
test('long labels grow the marker and callouts include the leader and target', () => {
  const small = pinLayout({ style: 'bubble', text: 'A' }, 20);
  const long = pinLayout({ style: 'bubble', text: 'A long city label' }, 300);
  expect(long.width).toBeGreaterThan(small.width);
  const callout = pinLayout({ style: 'callout', text: 'City' }, 80);
  expect(callout.halfWidth).toBeGreaterThan(callout.textX + 40);
  expect(callout.bottom).toBeGreaterThan(0);
});
