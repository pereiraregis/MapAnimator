export const PIN_PRESETS = [
  { name: 'Cidade · chamada', style: 'callout', color: '#19384b', textColor: '#ffffff', fontSize: 22, strokeColor: '#77dbe5', strokeWidth: 2 },
  { name: 'Etiqueta', style: 'bubble', color: '#ec4899', textColor: '#ffffff', fontSize: 20, strokeColor: '#ffffff', strokeWidth: 1.5 },
  { name: 'Localização', style: 'classic', color: '#ec6b3f', textColor: '#ffffff', fontSize: 20, strokeColor: '#ffffff', strokeWidth: 2 },
  { name: 'Ponto', style: 'dot', color: '#69c9d2', textColor: '#ffffff', fontSize: 20, strokeColor: '#ffffff', strokeWidth: 2 },
];
export function pinLayout(pin, textWidth = 0) {
  const scale = Number(pin.scale) || 1;
  const fontSize = (Number(pin.fontSize) || 18) * scale * (Number(pin.textScale) || 1);
  const label = ['bubble', 'callout'].includes(pin.style);
  const width = label ? Math.max(100 * scale, textWidth + 28 * scale) : 50 * scale;
  const height = label ? Math.max(50 * scale, fontSize + 22 * scale) : 50 * scale;
  const textX = (pin.style === 'callout' ? 40 * scale + width / 2 : 0) + (Number(pin.textOffsetX) || 0);
  const baseY = pin.style === 'callout' ? -60 * scale : label || pin.style === 'square' ? -height / 2 - 4 * scale : -height - fontSize / 2 - 8 * scale;
  const textY = baseY + (Number(pin.textOffsetY) || 0);
  const margin = Math.max(4, (Number(pin.strokeWidth) || 2) * scale + 2);
  const shapeRight = pin.style === 'callout' ? 40 * scale + width : width / 2;
  const shapeTop = pin.style === 'callout' ? 60 * scale + height / 2 : height;
  const halfWidth = Math.ceil(Math.max(shapeRight + margin, pin.text ? Math.abs(textX) + textWidth / 2 + margin : 0));
  const top = Math.ceil(Math.max(shapeTop + margin, pin.text ? -textY + fontSize + margin : 0));
  const bottom = Math.ceil(Math.max(margin, pin.text ? textY + fontSize + margin : 0));
  return { width, height, fontSize, textX, textY, halfWidth, top, bottom };
}
const rounded = (ctx, x, y, w, h, r) => {
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};
export function createPinImage(pin) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  const initial = pinLayout(pin), font = `600 ${initial.fontSize}px ${pin.fontFamily || 'Inter, sans-serif'}`;
  ctx.font = font;
  const g = pinLayout(pin, ctx.measureText(pin.text || '').width), scale = Number(pin.scale) || 1;
  const pixelRatio = 2;
  canvas.width = g.halfWidth * 2 * pixelRatio; canvas.height = (g.top + g.bottom) * pixelRatio;
  ctx.scale(pixelRatio, pixelRatio); ctx.translate(g.halfWidth, g.top);
  ctx.fillStyle = pin.color || '#ec4899'; ctx.strokeStyle = pin.strokeColor || '#ffffff';
  ctx.lineWidth = (pin.strokeWidth ?? 2) * scale; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  if (pin.style === 'callout') {
    ctx.moveTo(0, 0); ctx.lineTo(20 * scale, -60 * scale); ctx.lineTo(40 * scale, -60 * scale); ctx.stroke();
    ctx.beginPath(); rounded(ctx, 40 * scale, -60 * scale - g.height / 2, g.width, g.height, 9 * scale); ctx.fill(); if (ctx.lineWidth) ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 5 * scale, 0, Math.PI * 2);
  } else if (pin.style === 'bubble') {
    rounded(ctx, -g.width / 2, -g.height, g.width, g.height - 9 * scale, 10 * scale); ctx.fill(); if (ctx.lineWidth) ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7 * scale, -10 * scale); ctx.lineTo(0, 0); ctx.lineTo(7 * scale, -10 * scale);
  } else if (pin.style === 'square') rounded(ctx, -g.width / 2, -g.height, g.width, g.height, 7 * scale);
  else if (pin.style === 'dot') ctx.arc(0, -20 * scale, 18 * scale, 0, Math.PI * 2);
  else if (pin.style === 'flag') {
    ctx.moveTo(-16 * scale, 0); ctx.lineTo(-16 * scale, -48 * scale); ctx.lineTo(20 * scale, -48 * scale);
    ctx.lineTo(10 * scale, -34 * scale); ctx.lineTo(20 * scale, -20 * scale); ctx.lineTo(-16 * scale, -20 * scale);
  } else {
    ctx.moveTo(0, 0); ctx.bezierCurveTo(-36 * scale, -34 * scale, -18 * scale, -49 * scale, 0, -49 * scale);
    ctx.bezierCurveTo(18 * scale, -49 * scale, 36 * scale, -34 * scale, 0, 0);
  }
  ctx.fill(); if (pin.strokeWidth !== 0) ctx.stroke();
  if (pin.style === 'classic') { ctx.beginPath(); ctx.arc(0, -32 * scale, 6 * scale, 0, Math.PI * 2); ctx.fillStyle = pin.strokeColor || '#fff'; ctx.fill(); }
  if (pin.text) {
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!['bubble', 'callout', 'square'].includes(pin.style)) { ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 3; ctx.strokeText(pin.text, g.textX, g.textY); }
    ctx.fillStyle = pin.textColor || '#ffffff'; ctx.fillText(pin.text, g.textX, g.textY);
  }
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio, offset: [0, g.bottom] };
}
