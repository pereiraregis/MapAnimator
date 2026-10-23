import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CameraTimeline from './CameraTimeline';

const point = { id: 'a', time: 0, lng: 0, lat: 0, zoom: 5, pitch: 0, bearing: 0, pathProgress: 0, easing: 'smooth' };
let host, root, props;
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent.includes(text));
const send = (el, type, data = {}) => act(() => el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...data })));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: () => 'captured-view' } });
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
  expect(props.onResize).toHaveBeenCalledWith(370);
  const svg = host.querySelector('.curve-editor svg'); svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 340, height: 160 });
  send(host.querySelector('.curve-handle'), 'pointerdown'); send(svg, 'pointermove', { clientX: 170, clientY: 76 }); send(svg, 'pointerup');
  expect(host.querySelector('[aria-label="Curva X1"]').value).toBe('0.5');
  expect(host.querySelector('[aria-label="Interpolação da vista 1"]').value).toBe('bezier');
  act(() => button('Desfazer').click()); expect(host.querySelector('[aria-label="Interpolação da vista 1"]').value).toBe('smooth');
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
  act(() => host.querySelector('[aria-label="Avançar um frame"]').click()); expect(props.nativeSeek).toHaveBeenLastCalledWith(1.5 + 1 / 30);
  act(() => host.querySelector('[aria-label="Voltar um frame"]').click()); expect(props.nativeSeek).toHaveBeenLastCalledWith(1.5 - 1 / 30);
  act(() => button('Capturar vista').click()); expect(host.querySelector('[aria-label="Keyframe em 1.50 segundos"]')).not.toBeNull();
});
