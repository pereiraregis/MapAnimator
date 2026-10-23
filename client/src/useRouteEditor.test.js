import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import useRouteEditor from './useRouteEditor';
import RouteEditor from './RouteEditor';

let root, host, route, map, handlers, sources, color, onPause;
const original = [[0, 0], [10, 0], [10, 10]];
const lngLat = (lng, lat) => ({ lat, wrap: () => ({ lng }) });
function Harness() {
  route = useRouteEditor({ map, initial: original, color, width: 5, disabled: false, onPause });
  return <RouteEditor route={route} drawing={false} onDrawing={() => {}} onAnimate={() => {}} onProgress={route.setProgress} onFrame={() => {}} disabled={false} />;
}
const render = () => act(() => root.render(<Harness />));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; color = '#ec4899'; handlers = {}; sources = {}; onPause = jest.fn();
  const style = {}, pan = { enabled: true, isEnabled: () => pan.enabled, disable: () => { pan.enabled = false; }, enable: () => { pan.enabled = true; } };
  map = { current: { getSource: id => sources[id], addSource: (id, spec) => { const source = { data: spec.data, setData: data => { source.data = data; } }; sources[id] = source; }, addLayer: jest.fn(), moveLayer: jest.fn(), setPaintProperty: jest.fn(), getCanvasContainer: () => ({ style }), dragPan: pan,
    on: (event, layer, fn) => { handlers[event + (fn ? ':' + layer : '')] = fn || layer; },
  } };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); render(); act(() => route.setup());
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
test('route progress survives style/color/geometry changes and hides overlays during export', () => {
  act(() => { route.setProgress(.75); route.setEditing(true); });
  expect(sources['route-source'].data.features[0].geometry.coordinates.at(-1)).toEqual([10, 5]);
  expect(sources['route-handles'].data.features).toHaveLength(5);
  color = '#ffffff'; render();
  expect(sources['route-source'].data.features[0].geometry.coordinates.at(-1)).toEqual([10, 5]);
  act(() => route.hideHandles(true)); expect(sources['route-handles'].data.features).toHaveLength(0); expect(sources['route-guide'].data.features).toHaveLength(0);
  act(() => route.hideHandles(false)); expect(sources['route-handles'].data.features).toHaveLength(5);
  act(() => route.change([[0, 0], [20, 0]])); expect(sources['route-source'].data.features[0].geometry.coordinates.at(-1)).toEqual([15, 0]);
});
test('dragging midpoint inserts a vertex, locks camera, and is undone in one operation', () => {
  act(() => route.setEditing(true));
  act(() => handlers['mousedown:route-edit-handles']({ originalEvent: { button: 0 }, preventDefault() {}, features: [{ properties: { kind: 'midpoint', index: 0 } }] }));
  expect(map.current.dragPan.enabled).toBe(false); expect(route.coords).toHaveLength(4);
  act(() => handlers.mousemove({ lngLat: lngLat(2, 3) }));
  act(() => window.dispatchEvent(new MouseEvent('mouseup')));
  expect(route.coords[1]).toEqual([2, 3]); expect(map.current.dragPan.enabled).toBe(true);
  act(() => route.undo(false)); expect(route.coords).toEqual(original);
  act(() => route.undo(true)); expect(route.coords[1]).toEqual([2, 3]);
});
test('numeric coordinates apply precisely, reject invalid input and support deleting a point', () => {
  act(() => { route.setEditing(true); route.setSelected(1); });
  const lng = host.querySelector('[aria-label="Longitude do ponto da rota"]'), lat = host.querySelector('[aria-label="Latitude do ponto da rota"]');
  act(() => { Simulate.change(lng, { target: { value: '11.123456' } }); Simulate.change(lat, { target: { value: '-5.654321' } }); });
  act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(route.coords[1]).toEqual([11.123456, -5.654321]);
  act(() => Simulate.change(lng, { target: { value: '999' } })); act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(route.coords[1][0]).toBe(11.123456);
  act(() => route.remove(1)); expect(route.coords).toEqual([[0, 0], [10, 10]]);
});
test('blur cancels a drag and restores original geometry and pan state', () => {
  act(() => route.setEditing(true));
  act(() => handlers['mousedown:route-edit-handles']({ originalEvent: { button: 0 }, preventDefault() {}, features: [{ properties: { kind: 'vertex', index: 1 } }] }));
  act(() => handlers.mousemove({ lngLat: lngLat(2, 3) })); act(() => window.dispatchEvent(new Event('blur')));
  expect(route.coords).toEqual(original); expect(map.current.dragPan.enabled).toBe(true);
});

test('style reload reconstructs the current edited geometry at the current progress', () => {
  act(() => { route.change([[0, 0], [20, 0]]); route.setProgress(.25); route.setEditing(true); });
  sources = {}; act(() => route.setup());
  expect(sources['route-source'].data.features[0].geometry.coordinates).toEqual([[0, 0], [5, 0]]);
  expect(sources['route-handles'].data.features).toHaveLength(3);
});

test('release outside the map does not swallow a later drawing click', () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  act(() => route.setEditing(true));
  act(() => handlers['mousedown:route-edit-handles']({ originalEvent: { button: 0 }, preventDefault() {}, features: [{ properties: { kind: 'vertex', index: 1 } }] }));
  act(() => window.dispatchEvent(new MouseEvent('mouseup')));
  now.mockReturnValue(1500); expect(route.consumeClick()).toBe(false); now.mockRestore();
});
