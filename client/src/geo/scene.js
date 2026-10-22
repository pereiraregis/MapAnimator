import { normalizeGeoJSON } from './features';
import { validateWaypoints } from './animation';

export const STORAGE_KEY = 'mapanimator.scene.v1';
export const REOPEN_KEY = 'mapanimator.reopen.v1';
const finiteRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
export function validateScene(s) {
  if (s?.format !== 'MapAnimator' || s.version !== 1) throw new Error('Formato de projeto não suportado.');
  if (typeof s.name !== 'string' || s.name.length > 500) throw new Error('Nome do projeto inválido.');
  if (!s.settings || !['1920x1080', '1080x1920', '1080x1080'].includes(s.settings.resolution) || !finiteRange(s.settings.fps, 10, 60) || !finiteRange(s.settings.exportDuration, 0.1, 600)) throw new Error('Configurações de exportação inválidas.');
  if (!/^https:\/\//.test(s.settings.mapStyle) || !/^#[0-9a-f]{6}$/i.test(s.settings.pathColor) || !finiteRange(Number(s.settings.pathWidth), 1, 20)) throw new Error('Estilo de mapa inválido.');
  const c = s.camera;
  if (!c || !finiteRange(c.lng, -180, 180) || !finiteRange(c.lat, -85, 85) || !finiteRange(c.zoom, 0, 24) || !finiteRange(c.pitch, 0, 85) || !finiteRange(c.bearing, -180, 180)) throw new Error('Câmera inválida.');
  if (!Array.isArray(s.pins) || s.pins.length > 5000 || !Array.isArray(s.features) || s.features.length > 5000 || !Array.isArray(s.route)) throw new Error('Elementos do projeto inválidos.');
  const ids = new Set();
  s.features.forEach(item => {
    normalizeGeoJSON(item.feature);
    if (typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string' || typeof item.visible !== 'boolean') throw new Error('Identificação de elemento inválida.');
    ids.add(item.id);
    const t = item.style;
    if (!t || !/^#[0-9a-f]{6}$/i.test(t.color) || !finiteRange(t.opacity, 0, 1) || !finiteRange(t.width, 1, 20) || !finiteRange(t.radius, 1, 30)) throw new Error('Estilo de elemento inválido.');
  });
  const pinIds = new Set();
  s.pins.forEach(p => {
    if ((!Number.isFinite(p.id) && typeof p.id !== 'string') || pinIds.has(p.id) || !finiteRange(p.lng, -180, 180) || !finiteRange(p.lat, -90, 90) || typeof p.text !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.color) || !finiteRange(p.scale, 0.5, 3) || !finiteRange(p.textScale, 0.5, 5) || !finiteRange(p.textOffsetX, -10000, 10000) || !finiteRange(p.textOffsetY, -10000, 10000)) throw new Error('Pin inválido.');
    pinIds.add(p.id);
  });
  if (s.route.length) normalizeGeoJSON({ type: 'LineString', coordinates: s.route.length === 1 ? [s.route[0], s.route[0]] : s.route });
  if (!s.theatre || typeof s.theatre !== 'object' || s.theatre.definitionVersion !== '0.4.0' || !Array.isArray(s.theatre.revisionHistory) || !s.theatre.sheetsById || typeof s.theatre.sheetsById !== 'object' || Array.isArray(s.theatre.sheetsById)) throw new Error('Timeline inválida.');
  if (s.waypoints !== undefined) validateWaypoints(s.waypoints);
  if (s.cameraMode !== undefined && !['waypoints', 'theatre'].includes(s.cameraMode)) throw new Error('Modo de câmera inválido.');
  if (s.appearance && (!['labels', 'roads', 'buildings'].every(k => typeof s.appearance[k] === 'boolean') || !['water', 'land'].every(k => s.appearance[k] === null || /^#[0-9a-f]{6}$/i.test(s.appearance[k])))) throw new Error('Aparência do mapa inválida.');
  return s;
}
export function readReopenedScene() {
  try {
    if (sessionStorage.getItem(REOPEN_KEY) !== 'yes') return null;
    sessionStorage.removeItem(REOPEN_KEY);
    return validateScene(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (e) { console.warn('Não foi possível reabrir o projeto:', e); return null; }
}

export function downloadJSON(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
