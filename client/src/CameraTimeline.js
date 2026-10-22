import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EASINGS } from './geo/animation';

export default forwardRef(function CameraTimeline({ points, setPoints, duration, fps, onDuration, onSeek, onCapture, enabled, onEnabled, disabled, onStatus, visible }, ref) {
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const frame = useRef(null);
  const seekRef = useRef(onSeek); seekRef.current = onSeek;
  const seek = t => { const value = Math.min(duration, Math.max(0, t)); setPlaying(false); setTime(value); if (points.length) onSeek(value); };
  const togglePlay = () => {
    if (disabled || !enabled || !points.length) { onStatus('Capture uma vista para começar a reprodução.'); return; }
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
    const t = Math.round(time * 100) / 100;
    setPoints(all => [...all.filter(x => x.time !== t), { ...p, time: t, easing: 'smooth' }].sort((a, b) => a.time - b.time));
    onStatus(`Vista capturada em ${t.toFixed(2)} s.`);
  };
  const update = (i, key, value) => setPoints(all => all.map((p, j) => i === j ? { ...p, [key]: value } : p));
  useImperativeHandle(ref, () => ({
    play: togglePlay, capture: add, pause: () => setPlaying(false),
    start: () => seek(0), end: () => seek(duration),
    step: frames => seek(time + frames / (fps || 30)),
    previous: () => seek([...points].sort((a, b) => b.time - a.time).find(p => p.time < time - .0001)?.time ?? 0),
    next: () => seek([...points].sort((a, b) => a.time - b.time).find(p => p.time > time + .0001)?.time ?? duration),
  }));
  const frameIndex = Math.round(time * (fps || 30));
  const timecode = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time) % 60).padStart(2, '0')}:${String(frameIndex % (fps || 30)).padStart(2, '0')}`;
  return <section className={`camera-timeline ${visible ? '' : 'is-hidden'}`} aria-label="Timeline de câmera" hidden={!visible}>
    <div className="timeline-top"><strong>TIMELINE DE CÂMERA</strong>
      <label><input type="checkbox" checked={enabled} disabled={disabled} onChange={e => { setPlaying(false); onEnabled(e.target.checked); }} /> Usar vistas na exportação</label>
    </div>
    <div className="timeline-transport">
      <button aria-keyshortcuts="Space" title="Reproduzir / pausar (Espaço)" className={playing ? 'transport-playing' : ''} disabled={!points.length || disabled || !enabled} onClick={togglePlay}>{playing ? 'Ⅱ Pausar' : '▶ Reproduzir'}</button>
      <button aria-label="Ir ao início" title="Início (Home)" disabled={disabled} onClick={() => seek(0)}>⏮</button>
      <button aria-label="Voltar um frame" title="Voltar um frame (←)" disabled={disabled} onClick={() => seek(time - 1 / (fps || 30))}>◀</button>
      <button aria-label="Avançar um frame" title="Avançar um frame (→)" disabled={disabled} onClick={() => seek(time + 1 / (fps || 30))}>▶</button>
      <button aria-keyshortcuts="K" title="Capturar vista (K)" disabled={disabled || points.length >= 500} onClick={add}>◇ Capturar vista</button>
      <output className="timeline-timecode" aria-label="Timecode">{timecode}</output>
      <label>Tempo <input aria-label="Tempo da timeline" type="number" min="0" max={duration} step="0.1" value={Number(time.toFixed(2))} disabled={disabled} onChange={e => { const t = Math.min(duration, Math.max(0, Number(e.target.value))); setPlaying(false); setTime(t); if (enabled) onSeek(t); }} /> s</label>
      <label>Duração <input aria-label="Duração da timeline" type="number" min="1" max="600" value={duration} disabled={disabled} onChange={e => { setPlaying(false); onDuration(Math.min(600, Math.max(1, Number(e.target.value)))); }} /> s</label>
    </div>
    <div className="timeline-ruler" aria-label="Vistas na timeline">
      {[0, 1, 2, 3, 4].map(i => <span className="ruler-tick" key={i} style={{ left: `${i * 25}%` }}>{(duration * i / 4).toFixed(1)}s</span>)}
      {points.filter(p => p.time <= duration).map((p, i) => <button key={p.time} className={`timeline-key ${Math.abs(p.time - time) < .02 ? 'active' : ''}`} style={{ left: `${p.time / duration * 100}%` }} title={`Vista ${i + 1} · ${p.time.toFixed(2)} s`} aria-label={`Ir à vista em ${p.time.toFixed(2)} segundos`} disabled={disabled} onClick={() => seek(p.time)}>◆</button>)}
      <span className="timeline-playhead" style={{ left: `${Math.min(time, duration) / duration * 100}%` }} />
    </div>
    <input className="timeline-scrubber" aria-label="Percorrer animação" type="range" min="0" max={duration} step={1 / (fps || 30)} value={Math.min(time, duration)} disabled={disabled || !enabled} onChange={e => seek(Number(e.target.value))} />
    <div className="waypoint-list">
      {!points.length && <p>Capture a vista inicial em 0 s. Mova a câmera, escolha outro tempo e capture a próxima vista.</p>}
      {points.map((p, i) => <div className="waypoint" key={p.time}>
        <button disabled={disabled} onClick={() => { setPlaying(false); setTime(p.time); onSeek(p.time); }}>{p.time.toFixed(2)} s · {p.zoom.toFixed(1)}z</button>
        <select aria-label={`Interpolação da vista ${i + 1}`} value={p.easing} disabled={disabled} onChange={e => update(i, 'easing', e.target.value)}>{EASINGS.map(v => <option key={v} value={v}>{v}</option>)}</select>
        <label>Rota <input aria-label={`Progresso da rota na vista ${i + 1}`} type="number" min="0" max="1" step="0.1" value={p.pathProgress} disabled={disabled} onChange={e => update(i, 'pathProgress', Math.min(1, Math.max(0, Number(e.target.value))))} /></label>
        <button aria-label={`Excluir vista ${i + 1}`} disabled={disabled} onClick={() => setPoints(all => all.filter((_, j) => j !== i))}>×</button>
      </div>)}
    </div>
  </section>;
});
