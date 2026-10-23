import { shortcutAction } from './shortcuts';

const event = (key, rest = {}) => ({ key, target: { closest: () => null }, ...rest });
test('maps transport, capture and navigation shortcuts', () => {
  expect(shortcutAction(event(' '))).toBe('play');
  expect(shortcutAction(event('k'))).toBe('capture');
  expect(shortcutAction(event('ArrowRight'))).toBe('forward');
  expect(shortcutAction(event('ArrowLeft', { shiftKey: true }))).toBe('backTen');
  expect(shortcutAction(event(']'))).toBe('next');
});
test('leaves text, numeric, range and select editing to the focused control', () => {
  for (const key of [' ', 'k', 'ArrowLeft', 'Home', 'd', '?']) {
    expect(shortcutAction(event(key, { target: { closest: () => ({ tagName: 'INPUT' }) } }))).toBeNull();
  }
});
test('allows intentional save/open commands while editing but preserves browser commands', () => {
  const target = { closest: () => ({}) };
  expect(shortcutAction(event('s', { ctrlKey: true, target }))).toBe('save');
  expect(shortcutAction(event('o', { metaKey: true, target }))).toBe('open');
  expect(shortcutAction(event('l', { ctrlKey: true }))).toBeNull();
  expect(shortcutAction(event('Tab'))).toBeNull();
});
test('ignores IME composition, alt chords and repeated toggles while permitting frame repeat', () => {
  expect(shortcutAction(event('k', { isComposing: true }))).toBeNull();
  expect(shortcutAction(event('ArrowLeft', { altKey: true }))).toBeNull();
  expect(shortcutAction(event(' ', { repeat: true }))).toBeNull();
  expect(shortcutAction(event('ArrowRight', { repeat: true }))).toBe('forward');
});
test('exposes focus mode, workspace panes and contextual help', () => {
  expect(shortcutAction(event('\\'))).toBe('focus');
  expect(shortcutAction(event('1'))).toBe('controls');
  expect(shortcutAction(event('3'))).toBe('features');
  expect(shortcutAction(event('?', { shiftKey: true }))).toBe('help');
  expect(shortcutAction(event('Escape'))).toBe('escape');
});

test('Rust canvas owns timeline keys while global save/open remain available', () => {
  const target={closest: selector => selector === '[data-rust-timeline]' ? {} : null};
  for(const key of [' ', 'k', 'g', 'ArrowLeft', 'Home', 'Escape']) expect(shortcutAction(event(key,{target}))).toBeNull();
  expect(shortcutAction(event('s',{target,ctrlKey:true}))).toBe('save');
});
