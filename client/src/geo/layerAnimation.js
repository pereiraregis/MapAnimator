// The catalog contains original editable object values; animation never mutates them.
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export const EMPTY_LAYER_ANIMATION = { version: 1, layers: [], tracks: [], constants: {} };
export function buildLayerCatalog(pins, features, route, settings) {
  const layers = route.length ? [{ id: 'route', name: 'Rota', kind: 'route', values: Object.fromEntries(['opacity','width','red','green','blue'].map((key,i) => [key, [1, Number(settings.pathWidth), ...rgb(settings.pathColor)][i]])) }] : [];
  pins.forEach(p => layers.push({ id: `pin:${p.id}`, name: p.text || `Pin ${p.id}`, kind: 'pin', values: { lng: p.lng, lat: p.lat, opacity: p.opacity ?? 1, scale: p.scale, rotation: p.rotation ?? 0 } }));
  features.forEach(f => layers.push({ id: `feature:${f.id}`, name: String(f.name).slice(0,500), kind: /Point$/.test(f.feature.geometry.type) ? 'feature_point' : /LineString$/.test(f.feature.geometry.type) ? 'feature_line' : 'feature_polygon', values: { opacity: f.style.opacity, width: f.style.width, radius: f.style.radius, ...Object.fromEntries(['red','green','blue'].map((k,i) => [k,rgb(f.style.color)[i]])) } }));
  return layers;
}
export function colorAt(base, values) {
  const original = rgb(base);
  return '#' + ['red','green','blue'].map((key,i) => Math.round(Math.max(0, Math.min(255, values[key] ?? original[i]))).toString(16).padStart(2, '0')).join('');
}
export function pinCollection(pins, updates = [], draggedId = null) {
  const index = new Map(updates.map(u => [u.id,u]));
  return { type: 'FeatureCollection', features: pins.flatMap(p => {
    const u = index.get(`pin:${p.id}`), v = { ...(u?.values || {}) };
    if(p.id === draggedId) { delete v.lng; delete v.lat; }
    if(p.visible === false || u?.visible === false) return [];
    return [{ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lng ?? p.lng, v.lat ?? p.lat] }, properties: { id: p.id, imageId: `pin-${p.id}`, iconOffset: p.iconOffset || [0,3], opacity: v.opacity ?? p.opacity ?? 1, iconSize: (v.scale ?? p.scale) / p.scale, rotation: v.rotation ?? p.rotation ?? 0 } }];
  }) };
}
const applied = new WeakMap();
const stateKeys = ['maVisible','maOpacity','maColor','maWidth','maRadius'];
export function applyFeatureAnimation(map, items, updates = []) {
  if(!map?.getSource('ma-features') || !map.setFeatureState) return;
  const byId = new Map(items.map(f => [`feature:${f.id}`,f])), states = new Map();
  updates.forEach(u => { const item = byId.get(u.id); if(!item) return; const v=u.values || {}, state={maVisible:u.visible !== false};
    if(v.opacity !== undefined) state.maOpacity=v.opacity;
    if(v.width !== undefined) state.maWidth=v.width;
    if(v.radius !== undefined) state.maRadius=v.radius;
    if(['red','green','blue'].some(k=>v[k] !== undefined)) state.maColor=colorAt(item.style.color,v);
    states.set(item.id,state);
  });
  for(const id of new Set([...(applied.get(map) || []),...states.keys()])) {
    const target={source:'ma-features',id}, state=states.get(id) || {};
    for(const key of stateKeys) if(!(key in state)) map.removeFeatureState?.(target,key);
    if(states.has(id)) map.setFeatureState(target,state);
  }
  applied.set(map,new Set(states.keys()));
}
export function applyRouteAnimation(map, updates, settings) {
  if(!map?.getLayer('route-line')) return;
  const u=updates.find(u=>u.id==='route'), v=u?.values || {};
  map.setPaintProperty('route-line','line-opacity',u?.visible===false ? 0 : v.opacity ?? 1);
  map.setPaintProperty('route-line','line-width',v.width ?? Number(settings.pathWidth));
  map.setPaintProperty('route-line','line-color',colorAt(settings.pathColor,v));
}
export function validateLayerAnimation(value) {
  if(!value || value.version!==1 || !Array.isArray(value.layers) || !Array.isArray(value.tracks) || value.layers.length>10002 || value.tracks.length>3000) throw Error('Animação de camadas inválida.');
  if(value.constants !== undefined && (!value.constants || typeof value.constants !== 'object' || Array.isArray(value.constants) || Object.entries(value.constants).some(([key,v]) => key.length>300 || !Number.isFinite(v)))) throw Error('Valores estáticos de camada inválidos.');
  const ids=new Set(), keys=new Set(), props=new Set(); let count=0;
  value.layers.forEach(l=>{if(typeof l.id!=='string'||l.id.length>220||ids.has(l.id)||typeof l.name!=='string'||l.name.length>500||typeof l.kind!=='string'||typeof l.locked!=='boolean'||typeof l.muted!=='boolean'||!Number.isFinite(l.start)||!Number.isFinite(l.end)||l.start<0||l.start>=l.end||l.end>600)throw Error('Estado de camada inválido.');ids.add(l.id);});
  value.tracks.forEach(t=>{if(typeof t.property!=='string'||t.property.length>300||props.has(t.property)||!Array.isArray(t.keys))throw Error('Track de camada inválida.');props.add(t.property);let time=-1;
    t.keys.forEach(k=>{const d=k?.data;count++;if(count>3000||typeof k.id!=='string'||k.id.length>200||keys.has(k.id)||!Number.isSafeInteger(d?.time)||d.time<0||d.time>600*254016000000||d.time<=time||d.value?.t!=='Scalar'||!Number.isFinite(d.value.v)||!['Linear','Bezier','Hold'].includes(d.in_interp)||!['Linear','Bezier','Hold'].includes(d.out_interp))throw Error('Keyframe de camada inválido.');keys.add(k.id);time=d.time;
      for(const side of ['in_ease','out_ease']) if(!Array.isArray(d[side])||d[side].some(e=>!Number.isFinite(e.speed)||Math.abs(e.speed)>1e9||!Number.isFinite(e.influence)||e.influence<.001||e.influence>1))throw Error('Curva de camada inválida.');
    });
  });return value;
}

export const hasLayerAnimation = animation => !!(animation?.tracks?.length || animation?.layers?.length || Object.keys(animation?.constants || {}).length);
