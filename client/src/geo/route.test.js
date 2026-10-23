import { revealRoute, routeLine, animateRouteViews, midpoint } from './route';
import { sampleCamera } from './animation';
import { syncFeatureLayers } from './layers';
import { DEFAULT_STYLE } from './features';
const coords = [[0, 0], [10, 0], [10, 10]];
const camera = { lng: 0, lat: 0, zoom: 5, pitch: 0, bearing: 0, pathProgress: 1 };
test('route reveal has valid empty/start/mid/end GeoJSON and does not snap at 99%', () => {
  expect(routeLine(revealRoute(coords, 0)).features).toEqual([]);
  expect(revealRoute(coords, .25)).toEqual([[0, 0], [5, 0]]);
  expect(revealRoute(coords, .75)).toEqual([[0, 0], [10, 0], [10, 5]]);
  expect(revealRoute(coords, .995).at(-1)[1]).toBeCloseTo(9.9);
  expect(revealRoute(coords, 1)).toEqual(coords);
  expect(routeLine([[0, 0]]).features).toEqual([]);
});
test('repeated vertices do not create NaN and date-line interpolation follows shortest path', () => {
  expect(revealRoute([[0, 0], [0, 0], [10, 0]], .5)).toEqual([[0, 0], [5, 0]]);
  expect(revealRoute([[0, 0], [0, 0]], .5)).toEqual([]);
  expect(revealRoute([[179, 0], [-179, 0]], .5)).toEqual([[179, 0], [-180, 0]]);
  expect(midpoint([179, 1], [-179, 3])).toEqual([-180, 2]);
});
test('animate route adds endpoint keys while preserving camera motion and later keys', () => {
  const views = [{ ...camera, id: 'a', time: 1, easing: 'linear' }, { ...camera, id: 'b', zoom: 9, time: 3, easing: 'linear' }, { ...camera, id: 'c', time: 10, easing: 'smooth' }];
  const result = animateRouteViews(views, camera, 4, () => 'new');
  expect(result.map(p => p.time)).toEqual([0, 1, 3, 4, 10]);
  expect(result[1].zoom).toBe(5); expect(result[2].zoom).toBe(9);
  expect(result[0].pathProgress).toBe(0); expect(result[3].pathProgress).toBe(1);
  expect(result[4]).toEqual(views[2]);
  const value = sampleCamera(result, 2); expect(value.pathProgress).toBeCloseTo(.5); expect(value.zoom).toBe(7);
});
test('route animation can be created for a stationary camera and feeds reveal sampler', () => {
  const points = animateRouteViews([], camera, 3, () => 'new');
  expect(sampleCamera(points, 0).pathProgress).toBe(0);
  expect(revealRoute(coords, sampleCamera(points, 1.5).pathProgress).at(-1)).toEqual([10, 0]);
  expect(sampleCamera(points, 3).pathProgress).toBe(1);
});
test('hiding imported static line updates existing source even while route data loads', () => {
  const source = { setData: jest.fn() };
  const map = { isStyleLoaded: () => false, getSource: () => source };
  syncFeatureLayers(map, [{ id: 'line', visible: false, feature: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }, style: DEFAULT_STYLE }]);
  expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
});

test('animation boundary keeps sampled camera when a later view lies beyond export duration', () => {
  const points = [{ ...camera, id: 'a', time: 0, zoom: 4, easing: 'linear' }, { ...camera, id: 'b', time: 6, zoom: 10, easing: 'linear' }];
  const result = animateRouteViews(points, camera, 3, () => 'new');
  expect(result.find(p => p.time === 3).zoom).toBe(7);
  expect(result.find(p => p.time === 3).pathProgress).toBe(1);
  expect(result.find(p => p.time === 6)).toEqual(points[1]);
});
