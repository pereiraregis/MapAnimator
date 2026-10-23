import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EASINGS, CURVES, moveKeyframes } from './geo/animation';
import CurveEditor from './CurveEditor';

export default forwardRef(function CameraTimeline({ points, setPoints, duration, fps, onDuration, onSeek, onCapture, enabled, onEnabled, disabled, onStatus, visible, onTheatre, onResize, nativeSeek, nativePlay, nativePause, nativeTime, nativePlaying }, ref) {
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const frame = useRef(null), ruler = useRef(null), drag = useRef(null), gesture = useRef(null);
  const latest = useRef(points); latest.current = points;
  const history = useRef({ undo: [], redo: [] });
  const [selected, setSelected] = useState([]), [curves, setCurves] = useState(false), [revision, setRevision] = useState(0);
  const resize = useRef(null);
  useEffect(() => { if (curves) onResize(370); }, [curves]); // eslint-disable-line react-hooks/exhaustive-deps
  const [zoom, setZoom] = useState(1);
  const ordered = [...points].sort((a, b) => a.time - b.time);
  const active = ordered.find(p => selected.includes(p.id));
  const next = active && ordered[ordered.indexOf(active) + 1];
  const begin = () => { setPlaying(false); gesture.current = latest.current; };
  const endGesture = () => {
    if (gesture.current && JSON.stringify(gesture.current) !== JSON.stringify(latest.current)) {
      history.current.undo = [...history.current.undo.slice(-49), gesture.current]; history.current.redo = []; setRevision(v => v + 1);
    }
    gesture.current = null;
  };
  const commit = fn => {
    const before = latest.current, after = typeof fn === 'function' ? fn(before) : fn;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    history.current.undo = [...history.current.undo.slice(-49), before]; history.current.redo = [];
    latest.current = after; setPoints(after); setRevision(v => v + 1);
  };
  const replace = value => { latest.current = value; setPoints(value); };
  const undo = redo => {
    const from = redo ? 'redo' : 'undo', to = redo ? 'undo' : 'redo';
    if (!history.current[from].length || disabled) return;
    history.current[to].push(latest.current); replace(history.current[from].pop()); setRevision(v => v + 1); setPlaying(false);
  };
  const patch = (id, value, temporary = false) => {
    const after = latest.current.map(p => p.id === id ? { ...p, ...value } : p);
    if (temporary) replace(after); else commit(after);
  };
  const deleteKeys = () => { if (!disabled) { commit(all => all.filter(p => !selected.includes(p.id))); setSelected([]); } };
  const duplicate = () => {
    const keys = ordered.filter(p => selected.includes(p.id)); if (!keys.length || disabled) return;
    const first = keys[0].time, pasted = keys.map(p => ({ ...p, id: crypto.randomUUID(), time: Number((p.time - first + time).toFixed(8)) }));
    if (pasted.some(p => p.time > duration || points.some(q => Math.abs(q.time - p.time) < 1e-7))) { onStatus('Mova o cursor para um tempo livre para duplicar os keyframes.'); return; }
    commit(all => [...all, ...pasted].sort((a, b) => a.time - b.time)); setSelected(pasted.map(p => p.id));
  };
  const retimeStart = (e, p) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault(); e.currentTarget.focus(); const ids = e.shiftKey ? (selected.includes(p.id) ? selected.filter(id => id !== p.id) : [...selected, p.id]) : (selected.includes(p.id) ? selected : [p.id]);
    setSelected(ids); begin();
    drag.current = { x: e.clientX, points: latest.current, ids, width: ruler.current.getBoundingClientRect().width, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const retimeMove = e => {
    const d = drag.current; if (!d || disabled) return;
    if (Math.abs(e.clientX - d.x) < 3 && !d.moved) return;
    d.moved = true; replace(moveKeyframes(d.points, d.ids, (e.clientX - d.x) / d.width * duration, duration, fps || 30));
  };
  const retimeEnd = (e, p) => {
    const d = drag.current; if (!d) return;
    if (e.type === 'pointercancel') replace(d.points); else if (!d.moved) seek(p.time);
    drag.current = null; endGesture();
  };
  const seekRef = useRef(onSeek); seekRef.current = onSeek;
  useEffect(() => { if (enabled && points.length) seekRef.current(time); }, [points]); // eslint-disable-line react-hooks/exhaustive-deps
  const seek = t => { const value = Math.min(duration, Math.max(0, t)); setPlaying(false); setTime(value); if (enabled && points.length) onSeek(value); else if (!enabled) nativeSeek(value); };
  const togglePlay = () => {
    if (!enabled && !disabled) { nativePlay(); return; }
    if (disabled || !points.length) { onStatus('Capture uma vista para começar a reprodução.'); return; }
    if (time >= duration) setTime(0);
    setPlaying(v => !v);
  };
  useEffect(() => { if (disabled || !enabled) setPlaying(false); }, [disabled, enabled]);
  useEffect(() => { if (time > duration) seek(duration); }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing || disabled || !enabled) return;
    const start = performance.now() - time * 1000;
    const tick = now => {
      const t = Math.min(duration, (now - start) / 1000);
      setTime(t); seekRef.current(t);
      if (t < duration) frame.current = requestAnimationFrame(tick); else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, duration, disabled, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = () => {
    if (disabled || points.length >= 500) return;
    setPlaying(false);
    const p = onCapture(); if (!p) return;
    onEnabled(true);
    const captureTime = enabled ? time : nativeTime;
    setTime(captureTime);
    const t = Number((Math.round(captureTime * (fps || 30)) / (fps || 30)).toFixed(8));
    const id = crypto.randomUUID();
    commit(all => [...all.filter(x => Math.abs(x.time - t) > 1e-7), { ...p, id, time: t, easing: 'smooth' }].sort((a, b) => a.time - b.time));
    setSelected([id]);
    onStatus(`Vista capturada em ${t.toFixed(2)} s.`);
  };
  const update = (id, key, value) => patch(id, { [key]: value, ...(key === 'easing' && value === 'bezier' ? { curve: CURVES.smooth } : {}) });
  useImperativeHandle(ref, () => ({
    play: togglePlay, capture: add, curves: () => setCurves(v => !v), pause: () => { setPlaying(false); nativePause(); },
    start: () => seek(0), end: () => seek(duration),
    step: frames => seek((enabled ? time : nativeTime) + frames / (fps || 30)),
    previous: () => seek([...points].sort((a, b) => b.time - a.time).find(p => p.time < time - .0001)?.time ?? 0),
    next: () => seek([...points].sort((a, b) => a.time - b.time).find(p => p.time > time + .0001)?.time ?? duration),
  }));
  const displayTime = enabled ? time : nativeTime;
  const frameIndex = Math.round(displayTime * (fps || 30));
  const timecode = `${String(Math.floor(displayTime / 60)).padStart(2, '0')}:${String(Math.floor(displayTime) % 60).padStart(2, '0')}:${String(frameIndex % (fps || 30)).padStart(2, '0')}`;
  return <section className={`camera-timeline ${visible ? '' : 'is-hidden'}`} aria-label="Timeline de câmera" hidden={!visible} data-revision={revision} onKeyDown={e => {
    if (e.target.closest('input,select,textarea') || disabled) return;
    if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); undo(e.shiftKey || e.key.toLowerCase() === 'y'); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteKeys(); }
  }}>
    <div className="timeline-resize" role="separator" aria-label="Altura da timeline" aria-orientation="horizontal" tabIndex="0" onKeyDown={e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); onResize(Math.max(170, Math.min(window.innerHeight * .65, e.currentTarget.parentElement.getBoundingClientRect().height + (e.key === 'ArrowUp' ? 20 : -20)))); } }} onPointerDown={e => { resize.current = { y: e.clientY, height: e.currentTarget.parentElement.getBoundingClientRect().height }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (resize.current) onResize(Math.max(170, Math.min(window.innerHeight * .65, resize.current.height + resize.current.y - e.clientY))); }} onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }} />
    <div className="timeline-top"><strong>TIMELINE · {enabled ? 'VISTAS' : 'THEATRE'}</strong>
      <button disabled={disabled} title={enabled && points.length ? 'Salva a cena local, converte as vistas para tracks de câmera do Theatre e reabre no Studio. Substitui as tracks de câmera nativas anteriores; preserva as vistas originais.' : 'Abrir o Studio nativo para editar tracks e curvas por propriedade.'} onClick={onTheatre}>{enabled && points.length ? 'Enviar vistas ao Theatre.js ↗' : 'Theatre.js · Editor nativo ↗'}</button><label><input type="checkbox" checked={enabled} disabled={disabled} onChange={e => { setPlaying(false); onEnabled(e.target.checked); }} /> Usar vistas na exportação</label>
    </div>
    <div className="timeline-transport">
      <button aria-keyshortcuts="Space" title="Reproduzir / pausar (Espaço)" className={(enabled ? playing : nativePlaying) ? 'transport-playing' : ''} disabled={disabled || (enabled && !points.length)} onClick={togglePlay}>{(enabled ? playing : nativePlaying) ? 'Ⅱ Pausar' : '▶ Reproduzir'}</button>
      <button aria-label="Ir ao início" title="Início (Home)" disabled={disabled} onClick={() => seek(0)}>⏮</button>
      <button aria-label="Voltar um frame" title="Voltar um frame (←)" disabled={disabled} onClick={() => seek(displayTime - 1 / (fps || 30))}>◀</button>
      <button aria-label="Avançar um frame" title="Avançar um frame (→)" disabled={disabled} onClick={() => seek(displayTime + 1 / (fps || 30))}>▶</button>
      <button aria-keyshortcuts="K" title="Capturar vista (K)" disabled={disabled || points.length >= 500} onClick={add}>◇ Capturar vista</button>
      <output className="timeline-timecode" aria-label="Timecode">{timecode}</output>
      <label>Tempo <input aria-label="Tempo da timeline" type="number" min="0" max={duration} step="0.1" value={Number(displayTime.toFixed(2))} disabled={disabled} onChange={e => seek(Number(e.target.value))} /> s</label>
      <label>Duração <input aria-label="Duração da timeline" type="number" min="1" max="600" value={duration} disabled={disabled} onChange={e => { setPlaying(false); onDuration(Math.min(600, Math.max(1, Number(e.target.value)))); }} /> s</label>
    </div>
    <div className="timeline-edit-tools">
      <button aria-pressed={curves} disabled={disabled} onClick={() => setCurves(v => !v)}>⌁ Editor de curvas · G</button>
      <button disabled={disabled || !history.current.undo.length} onClick={() => undo(false)}>↶ Desfazer</button>
      <button disabled={disabled || !history.current.redo.length} onClick={() => undo(true)}>↷ Refazer</button>
      <button disabled={disabled || !selected.length} onClick={duplicate}>Duplicar no cursor</button>
      <button disabled={disabled || !selected.length} onClick={deleteKeys}>Excluir keyframes</button>
      <label>Zoom <select aria-label="Zoom da timeline" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[1, 2, 4, 8].map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
      <span>Arraste ◆ · Shift: seleção múltipla · snap por frame</span>
    </div>
    {!enabled && points.length > 0 && <p className="timeline-engine-hint">Reprodução e exportação: Theatre.js. Para usar os keyframes de vistas abaixo, ative “Usar vistas na exportação”.</p>}
    <div className={`timeline-edit-area ${curves ? 'with-curves' : ''}`}>
    <div className="timeline-tracks-scroll"><div className="timeline-tracks" style={{ width: `${zoom * 100}%` }}>
      <div ref={ruler} className="timeline-ruler" aria-label="Vistas na timeline" onPointerDown={e => { if (e.target === e.currentTarget && !disabled) { const r = e.currentTarget.getBoundingClientRect(); setSelected([]); seek(Math.round((e.clientX - r.left) / r.width * duration * fps) / fps); } }}>
        {[0, 1, 2, 3, 4].map(i => <span className="ruler-tick" key={i} style={{ left: `${i * 25}%` }}>{(duration * i / 4).toFixed(1)}s</span>)}
        {ordered.filter(p => p.time <= duration).map(p => <button key={p.id} data-keyframe="true" className={`timeline-key ${selected.includes(p.id) ? 'active' : ''}`} style={{ left: `${p.time / duration * 100}%` }} title={`Arrastar vista · ${p.time.toFixed(2)} s`} aria-label={`Keyframe em ${p.time.toFixed(2)} segundos`} disabled={disabled} onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation();
          commit(all => moveKeyframes(all, selected.includes(p.id) ? selected : [p.id], (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1) / (fps || 30), duration, fps || 30));
        }} onPointerDown={e => retimeStart(e, p)} onPointerMove={retimeMove} onPointerUp={e => retimeEnd(e, p)} onPointerCancel={e => retimeEnd(e, p)}>◆</button>)}
        <span className="timeline-playhead" style={{ left: `${Math.min(displayTime, duration) / duration * 100}%` }} />
      </div>
      <input className="timeline-scrubber" aria-label="Percorrer animação" type="range" min="0" max={duration} step={1 / (fps || 30)} value={Math.min(displayTime, duration)} disabled={disabled} onChange={e => seek(Number(e.target.value))} />
      <div className="timeline-channel-labels"><span>◈ Câmera</span><span>Posição · Zoom · Inclinação · Rotação · Rota</span></div>
    </div></div>
    {curves && (active && next ? <CurveEditor point={active} next={next} disabled={disabled} onBegin={begin} onEnd={endGesture} onChange={value => patch(active.id, value, true)} /> : <p className="curve-empty">Selecione um keyframe que tenha outro à direita para editar a curva de saída.</p>)}
    </div>
    <div className="waypoint-list">
      {!points.length && <p>Capture a vista inicial em 0 s. Mova a câmera, escolha outro tempo e capture a próxima vista.</p>}
      {ordered.map((p, i) => <div className="waypoint" key={p.id}>
        <button disabled={disabled} onClick={() => { setSelected([p.id]); seek(p.time); }}>{p.time.toFixed(2)} s · {p.zoom.toFixed(1)}z</button>
        <select aria-label={`Interpolação da vista ${i + 1}`} value={p.easing} disabled={disabled} onChange={e => update(p.id, 'easing', e.target.value)}>{EASINGS.map(v => <option key={v} value={v}>{v}</option>)}</select>
        <label>Rota <input aria-label={`Progresso da rota na vista ${i + 1}`} type="number" min="0" max="1" step="0.1" value={p.pathProgress} disabled={disabled} onChange={e => update(p.id, 'pathProgress', Math.min(1, Math.max(0, Number(e.target.value))))} /></label>
        <button aria-label={`Excluir vista ${i + 1}`} disabled={disabled} onClick={() => commit(all => all.filter(x => x.id !== p.id))}>×</button>
      </div>)}
    </div>
  </section>;
});
