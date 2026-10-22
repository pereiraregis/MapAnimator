// Draw synchronously: SVG image decoding can fail or finish after a newer edit.
export function pinLayout(pin, textWidth = 0) {
  const scale = Number(pin.scale) || 1;
  const width = (pin.style === 'bubble' ? 100 : 50) * scale;
  const height = 50 * scale;
  const fontSize = 12 * scale * (Number(pin.textScale) || 1);
  const textX = Number(pin.textOffsetX) || 0;
  const textY = -height + height / 2.3 + (Number(pin.textOffsetY) || 0);
  const halfWidth = Math.ceil(Math.max(width / 2 + 3, pin.text ? Math.abs(textX) + textWidth / 2 + 4 : 0));
  const top = Math.ceil(Math.max(height + 3, pin.text ? -textY + fontSize + 4 : 0));
  const bottom = Math.ceil(Math.max(3, pin.text ? textY + fontSize + 4 : 0));
  return { width, height, fontSize, textX, textY, halfWidth, top, bottom };
}

export function createPinImage(pin) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const initial = pinLayout(pin);
  const font = `800 ${initial.fontSize}px ${pin.fontFamily || 'Inter, sans-serif'}`;
  ctx.font = font;
  const g = pinLayout(pin, ctx.measureText(pin.text || '').width);
  // A stable pixel ratio keeps symbols consistent on Retina screens and exports.
  const pixelRatio = 2;
  canvas.width = g.halfWidth * 2 * pixelRatio;
  canvas.height = (g.top + g.bottom) * pixelRatio;
  ctx.scale(pixelRatio, pixelRatio);
  ctx.translate(g.halfWidth, g.top);
  ctx.save();
  ctx.scale(g.width / (pin.style === 'bubble' ? 100 : 50), g.height / 50);
  ctx.fillStyle = pin.color || '#ec4899';
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (pin.style === 'dot') ctx.arc(0, -25, 20, 0, Math.PI * 2);
  else if (pin.style === 'flag') {
    ctx.moveTo(-16, 0); ctx.lineTo(-16, -48); ctx.lineTo(20, -48);
    ctx.lineTo(10, -34); ctx.lineTo(20, -20); ctx.lineTo(-16, -20);
  } else if (pin.style === 'classic') {
    ctx.moveTo(0, 0); ctx.bezierCurveTo(-36, -34, -18, -49, 0, -49);
    ctx.bezierCurveTo(18, -49, 36, -34, 0, 0);
  } else {
    const w = pin.style === 'bubble' ? 48 : 23;
    ctx.moveTo(0, 0); ctx.lineTo(-7, -9); ctx.lineTo(-w, -9);
    ctx.lineTo(-w, -48); ctx.lineTo(w, -48); ctx.lineTo(w, -9);
    ctx.lineTo(7, -9); ctx.closePath();
  }
  ctx.fill(); ctx.stroke(); ctx.restore();
  if (pin.text) {
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 2;
    ctx.fillStyle = pin.textColor || '#ffffff';
    ctx.strokeText(pin.text, g.textX, g.textY); ctx.fillText(pin.text, g.textX, g.textY);
  }
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio, offset: [0, g.bottom] };
}
