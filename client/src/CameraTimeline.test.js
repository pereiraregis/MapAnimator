import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CameraTimeline from './CameraTimeline';

const point = { id: 'a', time: 0, lng: 0, lat: 0, zoom: 5, pitch: 0, bearing: 0, pathProgress: 0, easing: 'smooth' };
let host, root, props;
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent.includes(text));
const send = (el, type, data = {}) => act(() => el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...data })));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: (() => { let id = 0; return () => `captured-${++id}`; })() } });
  Element.prototype.setPointerCapture = jest.fn();
  props = { duration: 3, fps: 30, enabled: true, visible: true, disabled: false, onDuration: jest.fn(), onSeek: jest.fn(), onCapture: () => point, onEnabled: jest.fn(), onStatus: jest.fn(), onTheatre: jest.fn(), onResize: jest.fn(), nativeSeek: jest.fn(), nativePlay: jest.fn(), nativePause: jest.fn(), nativeTime: 1.5, nativePlaying: false };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = extra => {
  function Harness() { const [points, setPoints] = useState([point, { ...point, id: 'b', time: 3, zoom: 9 }]); return <CameraTimeline {...props} {...extra} points={points} setPoints={setPoints} />; }
  act(() => root.render(<Harness />));
};
test('dragging retimes a key with one undo step and redo restores it', () => {
  render(); host.querySelector('.timeline-ruler').getBoundingClientRect = () => ({ width: 1000, left: 0 });
  const key = host.querySelectorAll('[data-keyframe]')[1];
  send(key, 'pointerdown', { clientX: 1000 }); send(key, 'pointermove', { clientX: 800 }); send(key, 'pointerup', { clientX: 800 });
  expect(host.querySelectorAll('[data-keyframe]')[1].getAttribute('aria-label')).toContain('2.40');
  act(() => button('Desfazer').click()); expect(host.querySelectorAll('[data-keyframe]')[1].getAttribute('aria-label')).toContain('3.00');
  act(() => button('Refazer').click()); expect(host.querySelectorAll('[data-keyframe]')[1].getAttribute('aria-label')).toContain('2.40');
});
test('Bezier handle updates interpolation, supports undo, and expands the dock', () => {
  render(); const key = host.querySelector('[data-keyframe]');
  send(key, 'pointerdown'); send(key, 'pointerup'); act(() => button('Editor de curvas').click());
  expect(props.onResize).toHaveBeenCalledWith(420);
  const svg = host.querySelector('.curve-editor svg'); svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 340, height: 160 });
  send(host.querySelector('.curve-handle'), 'pointerdown'); send(svg, 'pointermove', { clientX: 170, clientY: 76 }); send(svg, 'pointerup');
  expect(host.querySelector('[aria-label="Curva X1"]').value).toBe('0.5');
  expect(host.querySelector('[aria-label="Interpolação do keyframe"]').value).toBe('bezier');
  act(() => button('Desfazer').click()); expect(host.querySelector('[aria-label="Interpolação do keyframe"]').value).toBe('smooth');
});
test('timeline separator resizes by pointer and keyboard', () => {
  render(); host.querySelector('section').getBoundingClientRect = () => ({ height: 284 });
  const divider = host.querySelector('[role="separator"]');
  send(divider, 'pointerdown', { clientY: 400 }); send(divider, 'pointermove', { clientY: 340 }); send(divider, 'pointerup');
  expect(props.onResize).toHaveBeenCalledWith(344);
  act(() => divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  expect(props.onResize).toHaveBeenCalledWith(304);
});
test('native transport frame steps and capture use native playhead time', () => {
  render({ enabled: false });
  act(() => host.querySelector('[aria-label="Avançar um frame"]').click()); expect(props.nativeSeek.mock.calls.at(-1)[0]).toBeCloseTo(1.5 + 1 / 30, 7);
  act(() => host.querySelector('[aria-label="Voltar um frame"]').click()); expect(props.nativeSeek.mock.calls.at(-1)[0]).toBeCloseTo(1.5 - 1 / 30, 7);
  act(() => button('Capturar vista').click()); expect(host.querySelector('[aria-label="Keyframe de Longitude em 1.50 segundos"]')).not.toBeNull();
});

test('dragging a property key keeps the other property rows at their original times', () => {
  render(); host.querySelector('.timeline-ruler').getBoundingClientRect = () => ({ width: 1000, left: 0 });
  const key = host.querySelector('[data-channel="zoom"][data-keyframe-id="b:zoom"]');
  send(key, 'pointerdown', { clientX: 1000 });
  for (const x of [950, 900, 850, 800]) send(key, 'pointermove', { clientX: x });
  send(key, 'pointerup', { clientX: 800 });
  expect(host.querySelector('[data-keyframe-id="b:zoom"]').getAttribute('aria-label')).toContain('2.40');
  expect(host.querySelector('[data-keyframe-id="b:lng"]').getAttribute('aria-label')).toContain('3.00');
  act(() => button('Desfazer').click()); expect(host.querySelector('[data-keyframe-id="b:zoom"]').getAttribute('aria-label')).toContain('3.00');
  expect(button('Desfazer').disabled).toBe(true);
});
test('copy and paste clipboard events paste a property at the playhead and undo restores it', () => {
  render(); const key = host.querySelector('[data-keyframe-id="b:zoom"]'); send(key, 'pointerdown'); send(key, 'pointerup');
  let text = ''; const copied = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(copied, 'clipboardData', { value: { setData: (_, value) => { text = value; } } }); act(() => key.dispatchEvent(copied));
  expect(JSON.parse(text).keys[0].channel).toBe('zoom');
  const input = host.querySelector('[aria-label="Tempo da timeline"]');
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1.5'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const pasted = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(pasted, 'clipboardData', { value: { getData: () => text } });
  act(() => host.querySelector('section').dispatchEvent(pasted));
  expect(host.querySelector('[aria-label="Keyframe de Zoom em 1.50 segundos"]')).not.toBeNull();
  expect(host.querySelectorAll('[data-channel="lng"][data-keyframe]')).toHaveLength(2);
  act(() => button('Desfazer').click()); expect(host.querySelectorAll('[data-keyframe]')).toHaveLength(12);
});
test('box selection spans properties and deletion is a single undoable operation', () => {
  render(); const lanes = host.querySelectorAll('.property-lane'), body = host.querySelector('.track-body');
  body.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 200 });
  lanes.forEach((lane, row) => { lane.getBoundingClientRect = () => ({ left: 100, top: 50 + row * 31, width: 1000, height: 31 }); lane.querySelectorAll('[data-keyframe]').forEach((el, i) => { el.getBoundingClientRect = () => ({ left: 95 + i * 1000, right: 105 + i * 1000, top: 55 + row * 31, bottom: 65 + row * 31 }); }); });
  send(lanes[0], 'pointerdown', { clientX: 90, clientY: 52 }); send(body, 'pointermove', { clientX: 1110, clientY: 97 }); send(body, 'pointerup', { clientX: 1110, clientY: 97 });
  expect(host.querySelectorAll('[data-keyframe][aria-pressed="true"]')).toHaveLength(4);
  act(() => body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
  expect(host.querySelectorAll('[data-keyframe]')).toHaveLength(8);
  act(() => button('Desfazer').click()); expect(host.querySelectorAll('[data-keyframe]')).toHaveLength(12);
});
test('F9 and context menu change only the selected key and show value/speed graphs', () => {
  render(); const key = host.querySelector('[data-keyframe-id="a:zoom"]'); send(key, 'pointerdown'); send(key, 'pointerup');
  act(() => key.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })));
  expect(host.querySelector('[aria-label="Interpolação do keyframe"]').value).toBe('bezier');
  send(key, 'contextmenu', { clientX: 100, clientY: 100 }); act(() => [...host.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === 'Hold').click());
  expect(host.querySelector('[aria-label="Interpolação do keyframe"]').value).toBe('hold');
  act(() => button('Editor de curvas').click()); expect(host.querySelector('[aria-label="Gráfico de valor de Zoom"]')).not.toBeNull();
  act(() => button('Velocidade').click()); expect(host.querySelector('[aria-label="Gráfico de velocidade de Zoom"]')).not.toBeNull();
});
