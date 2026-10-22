import { pinLayout } from './pins';

test('keeps the pin tip anchored while allowing labels below it', () => {
  const p = { style: 'bubble', scale: 1, text: 'São Paulo', textScale: 1, textOffsetY: 100 };
  const g = pinLayout(p, 80);
  expect(g.bottom).toBeGreaterThan(g.textY + g.fontSize);
  expect(g.top).toBeGreaterThanOrEqual(g.height);
  expect(g.halfWidth).toBeLessThan(60);
});

test('includes long labels and negative offsets without clipping', () => {
  const g = pinLayout({ text: 'Label', textOffsetX: -200, textOffsetY: -300, scale: 2 }, 400);
  expect(g.halfWidth).toBeGreaterThan(400);
  expect(g.top).toBeGreaterThan(-g.textY + g.fontSize);
});

test('uses stable dimensions independent of display density', () => {
  const p = { style: 'classic', scale: 1 };
  const one = pinLayout(p);
  window.devicePixelRatio = 2;
  expect(pinLayout(p)).toEqual(one);
});
