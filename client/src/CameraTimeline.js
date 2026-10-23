import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { CHANNELS, CURVES, EASINGS, easeProgress, wrap } from './geo/animation';
import { PROPERTIES, flattenKeys, frameTime, moveTrackKeys, patchTrackKeys, deleteTrackKeys, copyTrackKeys, pasteTrackKeys, captureTrackKeys, snapTime, easyEaseKeys } from './geo/keyframes';
import CurveEditor from './CurveEditor';

function PropertyPlot({ point, next, mode, property }) {
  const delta = ['lng', 'bearing'].includes(property.key) ? wrap(next.value - point.value) : next.value - point.value;
  const duration = next.time - point.time;
  const values = Array.from({ length: 65 }, (_, i) => {
    const t = i / 64;
    if (mode === 'value') return point.value + delta * (t === 1 ? 1 : easeProgress(point, t));
    if (point.easing === 'hold') return 0;
    const a = Math.max(0, t - .001), b = Math.min(1, t + .001);
    return Math.abs(delta * (easeProgress(point, b) - easeProgress(point, a)) / ((b - a) * duration));
  });
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${20 + i / 64 * 280},${100 - (v - min) / span * 75}`).join(' ');
  return <svg className="property-plot" viewBox="0 0 320 125" role="img" aria-label={`Gráfico de ${mode === 'value' ? 'valor' : 'velocidade'} de ${property.name}`}><path d="M20 20V100H300" fill="none" stroke="#456070" /><path d={path} fill="none" stroke={property.color} strokeWidth="2" /><text x="22" y="14">{max.toFixed(3)} {property.unit}{mode === 'speed' ? '/s' : ''}</text><text x="22" y="118">{point.time.toFixed(2)} s</text><text x="250" y="118">{next.time.toFixed(2)} s</text></svg>;
}

export default forwardRef(function CameraTimeline({ points, setPoints, duration, fps = 30, onDuration, onSeek, onCapture, enabled, onEnabled, disabled, onStatus, visible, onTheatre, onResize, nativeSeek, nativePlay, nativePause, nativeTime = 0, nativePlaying }, ref) {
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [selected, setSelected] = useState([]);
  const [curves, setCurves] = useState(false), [zoom, setZoom] = useState(1), [snap, setSnap] = useState(true), [filter, setFilter] = useState('');
  const [revision, setRevision] = useState(0), [marquee, setMarquee] = useState(null), [menu, setMenu] = useState(null), [graphMode, setGraphMode] = useState('value');
  const [loop, setLoop] = useState(false), [range, setRange] = useState([0, duration]);
  const scrollRef = useRef(null), zoomAnchor = useRef(null), previousDuration = useRef(duration);
  const frame = useRef(null), ruler = useRef(null), body = useRef(null), valueInput = useRef(null), drag = useRef(null), resize = useRef(null), gesture = useRef(null), clip = useRef(null);
  const latest = useRef(points), written = useRef(points), history = useRef({ undo: [], redo: [] }), seekRef = useRef(onSeek);
  latest.current = points; seekRef.current = onSeek;
  const keys = flattenKeys(points), editable = !disabled && enabled, displayTime = enabled ? time : nativeTime;
  const active = keys.find(k => selected.includes(k.id)), property = PROPERTIES.find(p => p.key === active?.channel);
  const next = active && keys.filter(k => k.channel === active.channel && k.time > active.time).sort((a, b) => a.time - b.time)[0];
  const apply = value => { latest.current = value; written.current = value; setPoints(value); };
  const remember = before => { history.current.undo = [...history.current.undo.slice(-49), before]; history.current.redo = []; setRevision(v => v + 1); };
  const perform = operation => {
    if (!editable) return false;
    try {
      const after = typeof operation === 'function' ? operation(latest.current) : operation;
      if (JSON.stringify(latest.current) !== JSON.stringify(after)) { const before = latest.current; apply(after); remember(before); setPlaying(false); }
      return true;
    } catch (err) { onStatus(err.message); return false; }
  };
  const begin = () => { setPlaying(false); gesture.current = latest.current; };
  const endGesture = () => { if (gesture.current && JSON.stringify(gesture.current) !== JSON.stringify(latest.current)) remember(gesture.current); gesture.current = null; };
  const undo = redo => {
    if (!editable) return;
    const from = redo ? 'redo' : 'undo', to = redo ? 'undo' : 'redo';
    if (!history.current[from].length) return;
    history.current[to].push(latest.current); apply(history.current[from].pop()); setRevision(v => v + 1); setPlaying(false);
  };
  const pause = () => { setPlaying(false); nativePause(); };
  const seek = value => {
    const t = Math.max(0, Math.min(duration, frameTime(value, fps)));
    pause(); setTime(t); if (enabled) { if (points.length) onSeek(t); } else nativeSeek(t);
  };
  const togglePlay = () => {
    if (disabled) return;
    if (!enabled) { nativePlay(); return; }
    if (!keys.length) { onStatus('Capture uma vista ou adicione um keyframe para reproduzir.'); return; }
    if (time >= range[1] || time < range[0]) setTime(range[0]);
    setPlaying(v => !v);
  };
  const capture = (channels = CHANNELS) => {
    if (disabled) return;
    const values = onCapture(); if (!values) return;
    const t = Math.min(duration, Math.max(0, frameTime(displayTime, fps)));
    try {
      const result = captureTrackKeys(latest.current, values, t, channels);
      const before = latest.current; pause(); apply(result.points); remember(before); setSelected(result.selected); setTime(t); onEnabled(true);
      onStatus(`${channels.length === 6 ? 'Vista' : 'Propriedade'} capturada em ${t.toFixed(2)} s.`);
    } catch (err) { onStatus(err.message); }
  };
  const patch = (ids, value, temporary = false) => {
    if (!editable) return;
    if (temporary) { try { apply(patchTrackKeys(latest.current, ids, value)); } catch (err) { onStatus(err.message); } }
    else perform(all => patchTrackKeys(all, ids, value));
  };
  const easing = value => patch(selected, { easing: value, ...(value === 'bezier' ? { curve: CURVES.smooth } : { curve: undefined }) });
  const easy = (mode = 'both') => perform(all => easyEaseKeys(all, selected, mode));
  const copy = event => {
    const value = copyTrackKeys(latest.current, selected); if (!value) return;
    clip.current = value;
    if (event?.clipboardData) { event.preventDefault(); event.clipboardData.setData('text/plain', JSON.stringify(value)); }
    onStatus(`${value.keys.length} keyframes copiados.`); setRevision(v => v + 1);
  };
  const paste = event => {
    if (!editable) return;
    let payload = clip.current;
    if (event?.clipboardData) {
      const text = event.clipboardData.getData('text/plain');
      if (text.startsWith('{') && text.length < 2000000) { try { payload = JSON.parse(text); } catch { return; } }
      else if (text) return;
      event.preventDefault();
    }
    try { const result = pasteTrackKeys(latest.current, payload, displayTime, duration, fps, undefined, onCapture()); if (perform(result.points)) setSelected(result.selected); }
    catch (err) { onStatus(err.message); }
  };
  const remove = () => { if (perform(all => deleteTrackKeys(all, selected, onCapture()))) setSelected([]); };
  const duplicate = () => { clip.current = copyTrackKeys(latest.current, selected); paste(); };
  const adjacent = direction => {
    const list = keys.filter(k => !active || k.channel === active.channel).map(k => k.time).sort((a, b) => a - b);
    seek(direction < 0 ? [...list].reverse().find(t => t < displayTime - .0001) ?? 0 : list.find(t => t > displayTime + .0001) ?? duration);
  };
  useEffect(() => {
    if (points !== written.current) { history.current = { undo: [], redo: [] }; setSelected([]); written.current = points; setRevision(v => v + 1); }
    if (enabled && points.length) seekRef.current(time);
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (disabled || !enabled) setPlaying(false); }, [disabled, enabled]);
  useEffect(() => { const oldDuration = previousDuration.current; previousDuration.current = duration; setRange(([a, b]) => [Math.min(a, Math.max(0, duration - 1 / fps)), Math.max(1 / fps, Math.abs(b - oldDuration) < 1e-7 ? duration : Math.min(b, duration))]); if (time > duration) seek(duration); }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (curves) onResize(420); }, [curves]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing || disabled || !enabled) return;
    const start = performance.now() - time * 1000, span = range[1] - range[0];
    const tick = now => {
      const raw = (now - start) / 1000;
      const t = loop && raw >= range[1] ? range[0] + (raw - range[0]) % span : Math.min(range[1], raw);
      setTime(t); seekRef.current(t);
      if (loop || raw < range[1]) frame.current = requestAnimationFrame(tick); else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame.current);
  }, [playing, disabled, enabled, duration, loop, range]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!menu) return; const close = e => { if (!e.target.closest('.key-context-menu')) setMenu(null); }; window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close); }, [menu]);
  useImperativeHandle(ref, () => ({ play: togglePlay, capture, pause, curves: () => setCurves(v => !v), start: () => seek(0), end: () => seek(duration), step: amount => seek(displayTime + amount / fps), previous: () => adjacent(-1), next: () => adjacent(1) }));

  useLayoutEffect(() => {
    if (!zoomAnchor.current || !ruler.current || !scrollRef.current) return;
    const r = ruler.current.getBoundingClientRect(), viewport = scrollRef.current.getBoundingClientRect(), a = zoomAnchor.current;
    if (r.width) scrollRef.current.scrollLeft += r.left - viewport.left + a.time / duration * r.width - a.px;
    zoomAnchor.current = null;
  }, [zoom, duration]);
  const changeZoom = value => {
    const r = ruler.current.getBoundingClientRect(), viewport = scrollRef.current.getBoundingClientRect();
    const cursor = r.left - viewport.left + displayTime / duration * r.width;
    zoomAnchor.current = { time: displayTime, px: cursor >= 0 && cursor <= viewport.width ? cursor : viewport.width / 2 };
    setZoom(value);
  };
  const startDrag = (e, key) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault(); e.currentTarget.focus(); setMenu(null); begin();
    const ids = selected.includes(key.id) ? selected : e.shiftKey ? [...selected, key.id] : [key.id]; setSelected(ids);
    drag.current = { kind: 'keys', before: latest.current, ids, x: e.clientX, width: ruler.current.getBoundingClientRect().width, anchor: key.id, shiftToggle: e.shiftKey && selected.includes(key.id), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const startBox = e => {
    if (!editable || e.button !== 0 || e.target.closest('button,input,select')) return;
    const lane = e.target.closest('.property-lane'); if (!lane) return;
    e.currentTarget.focus();
    const r = body.current.getBoundingClientRect(), rect = lane.getBoundingClientRect();
    drag.current = { kind: 'box', x: e.clientX, y: e.clientY, rect: r, lane: rect, selected, add: e.shiftKey };
    setMenu(null); e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = e => {
    const d = drag.current; if (!d) return;
    if (d.kind === 'keys') {
      if (!d.moved && Math.abs(e.clientX - d.x) < 3) return;
      d.moved = true;
      try { apply(moveTrackKeys(d.before, d.ids, (e.clientX - d.x) / d.width * duration, duration, fps, { anchor: d.anchor, snap: snap || e.shiftKey, playhead: displayTime, tolerance: 8 / d.width * duration })); }
      catch (err) { onStatus(err.message); }
    } else if (d.kind === 'scrub') {
      const rect = ruler.current.getBoundingClientRect(); let value = (e.clientX - rect.left) / rect.width * duration; if (e.shiftKey) value = snapTime([0, duration, ...keys.map(k => k.time)], value, 8 / rect.width * duration); seek(value);
    } else {
      const left = Math.min(d.x, e.clientX), right = Math.max(d.x, e.clientX), top = Math.min(d.y, e.clientY), bottom = Math.max(d.y, e.clientY);
      setMarquee({ left: left - d.rect.left, top: top - d.rect.top, width: right - left, height: bottom - top });
      const ids = [...body.current.querySelectorAll('[data-keyframe-id]')].filter(el => { const r = el.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2; return x >= left && x <= right && y >= top && y <= bottom; }).map(el => el.dataset.keyframeId);
      setSelected([...new Set([...(d.add ? d.selected : []), ...ids])]);
    }
  };
  const end = e => {
    const d = drag.current; if (!d) return;
    drag.current = null;
    if (e.type === 'pointercancel') { if (d.before) apply(d.before); if (d.selected) setSelected(d.selected); gesture.current = null; }
    else if (d.kind === 'keys') { if (!d.moved && d.shiftToggle) setSelected(all => all.filter(id => !d.ids.includes(id) || id !== d.anchor)); endGesture(); }
    else if (d.kind === 'box' && Math.abs(e.clientX - d.x) < 3 && Math.abs(e.clientY - d.y) < 3) { if (!d.add) setSelected([]); seek((e.clientX - d.lane.left) / d.lane.width * duration); }
    setMarquee(null);
  };
  const keyboard = e => {
    if (e.target.closest('input,select,textarea,[contenteditable=true]') || disabled) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && ['c', 'v'].includes(key)) { e.stopPropagation(); return; }
    if (mod && ['z', 'y', 'a', 'c', 'v', 'd'].includes(key)) {
      e.preventDefault(); e.stopPropagation();
      if (key === 'z' || key === 'y') undo(e.shiftKey || key === 'y');
      if (key === 'a') setSelected(keys.map(k => k.id)); if (key === 'c') copy(); if (key === 'v') paste(); if (key === 'd') duplicate(); return;
    }
    if (e.key === 'F9') { e.preventDefault(); easy(e.shiftKey ? (mod ? 'out' : 'in') : 'both'); }
    if (['Delete', 'Backspace'].includes(e.key)) { e.preventDefault(); remove(); }
    if (e.key === 'Escape') { e.preventDefault(); setSelected([]); setMenu(null); }
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const delta = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1) / fps; if (selected.length) perform(all => moveTrackKeys(all, selected, delta, duration, fps)); else seek(displayTime + delta); }
  };
  const frameIndex = Math.round(displayTime * fps), code = `${String(Math.floor(displayTime / 60)).padStart(2, '0')}:${String(Math.floor(displayTime) % 60).padStart(2, '0')}:${String(frameIndex % fps).padStart(2, '0')}`;
  return <section data-timeline="true" className={`camera-timeline ${visible ? '' : 'is-hidden'}`} aria-label="Timeline de câmera" hidden={!visible} data-revision={revision} tabIndex="-1" onKeyDown={keyboard} onCopy={e => { if (!e.target.closest('input,textarea')) copy(e); }} onPaste={e => { if (!e.target.closest('input,textarea')) paste(e); }}>
    <div className="timeline-resize" role="separator" aria-label="Altura da timeline" aria-orientation="horizontal" tabIndex="0" onKeyDown={e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); onResize(Math.max(170, Math.min(window.innerHeight * .65, e.currentTarget.parentElement.getBoundingClientRect().height + (e.key === 'ArrowUp' ? 20 : -20)))); } }} onPointerDown={e => { resize.current = { y: e.clientY, height: e.currentTarget.parentElement.getBoundingClientRect().height }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (resize.current) onResize(Math.max(170, Math.min(window.innerHeight * .65, resize.current.height + resize.current.y - e.clientY))); }} onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }} />
    <div className="timeline-top"><strong>TIMELINE · {enabled ? 'PROPRIEDADES' : 'THEATRE'}</strong><button disabled={disabled} title="Converte os keyframes por propriedade, salva e reabre a cena no Studio. Substitui tracks nativas de câmera anteriores; preserva os keyframes originais." onClick={onTheatre}>{enabled && points.length ? 'Enviar ao Theatre.js ↗' : 'Theatre.js · Editor nativo ↗'}</button><label><input type="checkbox" checked={enabled} disabled={disabled} onChange={e => { pause(); onEnabled(e.target.checked); }} /> Usar timeline na exportação</label></div>
    <div className="timeline-transport">
      <button disabled={disabled || (enabled && !keys.length)} aria-keyshortcuts="Space" className={(enabled ? playing : nativePlaying) ? 'transport-playing' : ''} onClick={togglePlay}>{(enabled ? playing : nativePlaying) ? 'Ⅱ Pausar' : '▶ Reproduzir'}</button>
      <button aria-label="Ir ao início" disabled={disabled} onClick={() => seek(0)}>⏮</button><button aria-label="Voltar um frame" disabled={disabled} onClick={() => seek(displayTime - 1 / fps)}>◀</button><button aria-label="Avançar um frame" disabled={disabled} onClick={() => seek(displayTime + 1 / fps)}>▶</button>
      <button disabled={disabled} aria-keyshortcuts="K" onClick={() => capture()}>◇ Capturar vista</button><output className="timeline-timecode" aria-label="Timecode">{code}</output>
      <label>Tempo <input aria-label="Tempo da timeline" type="number" min="0" max={duration} step={1 / fps} value={Number(displayTime.toFixed(3))} disabled={disabled} onChange={e => seek(Number(e.target.value))} /> s</label><label>Duração <input aria-label="Duração da timeline" type="number" min="1" max="600" value={duration} disabled={disabled} onChange={e => { pause(); onDuration(Math.min(600, Math.max(1, Number(e.target.value)))); }} /> s</label>
    </div>
    <div className="timeline-edit-tools"><button aria-pressed={curves} disabled={disabled} onClick={() => setCurves(v => !v)}>⌁ Editor de curvas · G</button><button disabled={!editable || !history.current.undo.length} onClick={() => undo(false)}>↶ Desfazer</button><button disabled={!editable || !history.current.redo.length} onClick={() => undo(true)}>↷ Refazer</button><button disabled={!selected.length} onClick={() => copy()}>Copiar</button><button disabled={!editable || !clip.current} onClick={() => paste()}>Colar no cursor</button><button disabled={!editable || !selected.length} onClick={duplicate}>Duplicar no cursor</button><button disabled={!editable || !selected.length} onClick={remove}>Excluir keyframes</button><button disabled={!editable || !selected.length} onClick={() => easy()}>Easy Ease · F9</button><button aria-pressed={snap} onClick={() => setSnap(v => !v)}>Ímã</button><label>Zoom <select aria-label="Zoom da timeline" value={zoom} onChange={e => changeZoom(Number(e.target.value))}>{[1, 2, 4, 8].map(v => <option key={v} value={v}>{v}×</option>)}</select></label><input className="track-filter" aria-label="Filtrar propriedades" placeholder="Filtrar propriedades…" value={filter} onChange={e => setFilter(e.target.value)} /></div>
    {!enabled && <p className="timeline-engine-hint">Reprodução/exportação: Theatre.js. Ative a timeline para editar as propriedades abaixo.</p>}
    <div className="preview-range"><span>Área de prévia</span><label>De <input aria-label="Início da prévia" type="number" min="0" max={range[1] - 1 / fps} step={1 / fps} value={Number(range[0].toFixed(3))} disabled={!editable} onChange={e => { pause(); setRange([Math.max(0, Math.min(range[1] - 1 / fps, Number(e.target.value))), range[1]]); }} /></label><label>Até <input aria-label="Fim da prévia" type="number" min={range[0] + 1 / fps} max={duration} step={1 / fps} value={Number(range[1].toFixed(3))} disabled={!editable} onChange={e => { pause(); setRange([range[0], Math.min(duration, Math.max(range[0] + 1 / fps, Number(e.target.value)))]); }} /></label><label><input type="checkbox" checked={loop} disabled={!editable} onChange={e => { pause(); setLoop(e.target.checked); }} /> Loop</label><small>A exportação usa a duração completa.</small></div>
    <div className={`track-workspace ${curves ? 'with-inspector' : ''}`}>
      <div ref={scrollRef} className="timeline-tracks-scroll"><div className="property-tracks" style={{ width: `${zoom * 100}%` }}>
        <div className="track-ruler-row"><strong>Propriedade <small>{selected.length} selecionados</small></strong><div ref={ruler} className="timeline-ruler" aria-label="Vistas na timeline" onPointerDown={e => { if (disabled || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { kind: 'scrub' }; move(e); }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>{[0, 1, 2, 3, 4].map(i => <span className="ruler-tick" key={i} style={{ left: `${i * 25}%` }}>{(duration * i / 4).toFixed(2)}s</span>)}<span className="timeline-playhead" style={{ left: `${displayTime / duration * 100}%` }} /></div></div>
        <div ref={body} className="track-body" tabIndex="-1" onPointerDown={startBox} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          {PROPERTIES.filter(p => p.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(prop => <div className="property-track" key={prop.key}>
            <div className="property-track-label" style={{ borderLeftColor: prop.color }}><button disabled={disabled} aria-label={`Capturar keyframe de ${prop.name}`} onClick={() => capture([prop.key])}>◇</button><button disabled={disabled} title="Selecionar todos os keyframes desta propriedade" onClick={() => setSelected(keys.filter(k => k.channel === prop.key).map(k => k.id))}>{prop.name}</button></div>
            <div className="property-lane" data-channel={prop.key}>
              <span className="track-range" style={{ left: `${range[0] / duration * 100}%`, width: `${(range[1] - range[0]) / duration * 100}%` }} />
              {keys.filter(k => k.channel === prop.key && k.time <= duration).map(k => <button key={k.id} data-keyframe="true" data-keyframe-id={k.id} data-channel={k.channel} aria-label={`Keyframe de ${prop.name} em ${k.time.toFixed(2)} segundos`} aria-pressed={selected.includes(k.id)} title={`${prop.name}: ${k.value.toFixed(4)} · ${k.time.toFixed(3)} s · ${k.easing}`} className={`timeline-key ${selected.includes(k.id) ? 'active' : ''}`} disabled={!editable} style={{ left: `${k.time / duration * 100}%`, color: selected.includes(k.id) ? '#ffe09a' : prop.color }} onPointerDown={e => startDrag(e, k)} onDoubleClick={() => { setSelected([k.id]); valueInput.current?.focus(); }} onContextMenu={e => { if (!editable) return; e.preventDefault(); if (!selected.includes(k.id)) setSelected([k.id]); const r = e.currentTarget.closest('section').getBoundingClientRect(); setMenu({ x: Math.min(e.clientX - r.left, r.width - 190), y: e.clientY - r.top }); }}>{k.easing === 'hold' ? '■' : ['smooth', 'easeIn', 'easeOut', 'bezier'].includes(k.easing) ? '◈' : '◆'}</button>)}
              <span className="timeline-playhead" style={{ left: `${displayTime / duration * 100}%` }} />
            </div>
          </div>)}
          {marquee && <span className="key-marquee" style={marquee} />}
        </div>
      </div></div>
      {!active && <aside className="key-inspector key-inspector-empty"><strong>PROPRIEDADES DO KEYFRAME</strong><p>Selecione um keyframe para editar valor, tempo e interpolação. Shift+clique adiciona à seleção; arraste na área vazia para selecionar por retângulo.</p></aside>}
      {active && <aside className="key-inspector" aria-label="Propriedades do keyframe"><strong>{property.name} · {active.time.toFixed(3)} s</strong><label>Valor <input ref={valueInput} aria-label="Valor do keyframe" key={`${active.id}:${active.value}`} type="number" min={property.min} max={property.max} step={property.step} defaultValue={active.value} disabled={!editable} onBlur={e => { const value = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(value)) patch([active.id], { value: Math.max(property.min, Math.min(property.max, value)) }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label><label>Tempo <input aria-label="Tempo do keyframe" key={`${active.id}:${active.time}`} type="number" min="0" max={duration} step={1 / fps} defaultValue={Number(active.time.toFixed(8))} disabled={!editable} onBlur={e => { const value = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(value)) perform(all => moveTrackKeys(all, [active.id], value - active.time, duration, fps)); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label><label>Interpolação <select aria-label="Interpolação do keyframe" value={active.easing} disabled={!editable} onChange={e => easing(e.target.value)}>{EASINGS.map(v => <option key={v} value={v}>{v}</option>)}</select></label><button onClick={() => seek(active.time)}>Ir ao keyframe</button>
        {curves && (next ? <><div className="graph-modes"><button aria-pressed={graphMode === 'value'} onClick={() => setGraphMode('value')}>Valor</button><button aria-pressed={graphMode === 'speed'} onClick={() => setGraphMode('speed')}>Velocidade</button></div><PropertyPlot point={active} next={next} mode={graphMode} property={property} /><CurveEditor point={active} next={next} disabled={!editable} onBegin={begin} onEnd={endGesture} onChange={value => patch([active.id], value, true)} /></> : <p>Este é o último keyframe da propriedade. Selecione um anterior para editar sua curva de saída.</p>)}
      </aside>}
    </div>
    {!keys.length && <p className="curve-empty">Capture a vista com K ou use ◇ ao lado da propriedade. Arraste na área vazia para selecionar vários keys.</p>}
    {menu && <div className="key-context-menu" role="menu" style={{ left: Math.max(4, menu.x), top: menu.y }}>
      {['Copiar', 'Colar no cursor', 'Easy Ease · F9', 'Linear', 'Bézier', 'Hold', 'Excluir'].map((name, i) => <button role="menuitem" key={name} onClick={() => { if (i === 0) copy(); if (i === 1) paste(); if (i === 2) easy(); if (i === 3) easing('linear'); if (i === 4) easing('bezier'); if (i === 5) easing('hold'); if (i === 6) remove(); setMenu(null); }}>{name}</button>)}
    </div>}
    <p className="timeline-help">Shift+clique: seleção múltipla · Arraste na área vazia: retângulo · Ctrl/⌘+C/V: copiar/colar · F9: Easy Ease · Delete: excluir</p>
  </section>;
});
