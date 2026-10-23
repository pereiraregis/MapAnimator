import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyCollection, routeLine, revealRoute, routeHandles, midpoint } from './geo/route';

export default function useRouteEditor({ map, initial = [], initialProgress = 1, color, width, disabled, onPause }) {
  const [coords, setCoords] = useState(() => initial.map(p => p.slice(0, 2)));
  const [editing, setEditing] = useState(false), [selected, setSelected] = useState(null), [progress, setProgressState] = useState(initialProgress);
  const [revision, setRevision] = useState(0);
  const coordsRef = useRef(coords), state = useRef({}), history = useRef({ undo: [], redo: [] }), drag = useRef(null), cleanup = useRef(null);
  const exporting = useRef(false), progressRef = useRef(initialProgress), suppressClick = useRef(0);
  state.current = { editing, selected, color, width, disabled, onPause };
  const sync = useCallback(() => {
    const m = map.current; if (!m?.getSource('route-source')) return;
    m.getSource('route-source').setData(routeLine(revealRoute(coordsRef.current, progressRef.current)));
    m.setPaintProperty('route-line', 'line-color', state.current.color);
    m.setPaintProperty('route-line', 'line-width', Number(state.current.width));
    const show = state.current.editing && !exporting.current;
    m.getSource('route-guide')?.setData(show ? routeLine(coordsRef.current) : emptyCollection());
    m.getSource('route-handles')?.setData(show ? routeHandles(coordsRef.current, state.current.selected) : emptyCollection());
  }, [map]);
  const setProgress = useCallback(value => {
    const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
    progressRef.current = next; setProgressState(next); sync();
  }, [sync]);
  const replace = useCallback(value => { coordsRef.current = value; setCoords(value); sync(); }, [sync]);
  const remember = before => { history.current.undo = [...history.current.undo.slice(-49), before]; history.current.redo = []; setRevision(v => v + 1); };
  const change = useCallback((value, record = true) => {
    if (state.current.disabled || value.length > 10000) return;
    if (JSON.stringify(value) === JSON.stringify(coordsRef.current)) return;
    state.current.onPause(); if (record) remember(coordsRef.current);
    replace(value.map(p => p.slice(0, 2)));
  }, [replace]);
  const finish = useCallback(cancel => {
    const d = drag.current; if (!d) return;
    drag.current = null;
    if (cancel === true) replace(d.before);
    else if (JSON.stringify(d.before) !== JSON.stringify(coordsRef.current)) remember(d.before);
    const m = map.current;
    if (d.pan && m) m.dragPan.enable();
    if (m) m.getCanvasContainer().style.cursor = '';
    suppressClick.current = Date.now() + 250;
  }, [map, replace]);
  const setup = useCallback(() => {
    const m = map.current; if (!m) return;
    if (!m.getSource('route-source')) {
      m.addSource('route-source', { type: 'geojson', data: emptyCollection() });
      m.addLayer({ id: 'route-line', type: 'line', source: 'route-source', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': state.current.color, 'line-width': Number(state.current.width) } });
    }
    if (!m.getSource('route-guide')) {
      m.addSource('route-guide', { type: 'geojson', data: emptyCollection() });
      m.addLayer({ id: 'route-edit-guide', type: 'line', source: 'route-guide', paint: { 'line-color': '#d5e6f0', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': .6 } });
      m.addSource('route-handles', { type: 'geojson', data: emptyCollection() });
      m.addLayer({ id: 'route-edit-handles', type: 'circle', source: 'route-handles', paint: { 'circle-radius': ['case', ['==', ['get', 'kind'], 'midpoint'], 9, ['get', 'selected'], 14, 11], 'circle-color': ['case', ['==', ['get', 'kind'], 'midpoint'], '#52687a', ['get', 'selected'], '#f7c76b', '#69c9d2'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    }
    m.moveLayer('route-line'); m.moveLayer('route-edit-guide'); m.moveLayer('route-edit-handles'); sync();
    if (cleanup.current) return;
    const start = e => {
      if (!state.current.editing || state.current.disabled || exporting.current || (e.originalEvent.button !== undefined && e.originalEvent.button !== 0)) return;
      const hit = e.features?.[0]; if (!hit) return;
      e.preventDefault(); state.current.onPause(); suppressClick.current = 0;
      const before = coordsRef.current, index = Number(hit.properties.index) + (hit.properties.kind === 'midpoint' ? 1 : 0);
      drag.current = { before, index, pan: m.dragPan.isEnabled() };
      if (hit.properties.kind === 'midpoint') replace([...before.slice(0, index), midpoint(before[index - 1], before[index]), ...before.slice(index)]);
      setSelected(index); m.dragPan.disable(); m.getCanvasContainer().style.cursor = 'grabbing';
    };
    const move = e => {
      if (!drag.current) return;
      const position = [e.lngLat.wrap().lng, Math.max(-90, Math.min(90, e.lngLat.lat))];
      replace(coordsRef.current.map((p, i) => i === drag.current.index ? position : p));
    };
    const end = () => finish(false), cancel = () => finish(true);
    m.on('mousedown', 'route-edit-handles', start); m.on('touchstart', 'route-edit-handles', start);
    m.on('mousemove', move); m.on('touchmove', move); m.on('mouseup', end); m.on('touchend', end); m.on('touchcancel', cancel);
    window.addEventListener('mouseup', end); window.addEventListener('touchend', end); window.addEventListener('blur', cancel);
    cleanup.current = () => { cancel(); window.removeEventListener('mouseup', end); window.removeEventListener('touchend', end); window.removeEventListener('blur', cancel); };
  }, [map, sync, finish, replace]);
  useEffect(() => { sync(); }, [coords, editing, selected, color, width, sync]);
  useEffect(() => () => cleanup.current?.(), []);
  const toggleEditing = value => { finish(false); onPause(); setEditing(value); };
  const undo = redo => {
    if (disabled) return; finish(false); onPause();
    const from = redo ? 'redo' : 'undo', to = redo ? 'undo' : 'redo';
    if (!history.current[from].length) return;
    history.current[to].push(coordsRef.current); replace(history.current[from].pop()); setSelected(null); setRevision(v => v + 1);
  };
  return { coords, coordsRef, editing, selected, progress, progressRef, revision, setup, sync, setProgress, change, setSelected,
    setEditing: toggleEditing, finish, undo, canUndo: !!history.current.undo.length, canRedo: !!history.current.redo.length,
    consumeClick: () => { const value = Date.now() < suppressClick.current; suppressClick.current = 0; return value; },
    append: p => { change([...coordsRef.current, p]); setSelected(coordsRef.current.length - 1); },
    remove: index => { change(coordsRef.current.filter((_, i) => i !== index)); setSelected(null); },
    insert: index => { const current = coordsRef.current; if (index < 0 || index >= current.length - 1) return; change([...current.slice(0, index + 1), midpoint(current[index], current[index + 1]), ...current.slice(index + 1)]); setSelected(index + 1); },
    hideHandles: value => { exporting.current = value; sync(); },
  };
}
