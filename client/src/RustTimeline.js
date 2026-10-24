import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { loadRustTimeline, cameraValues } from './rust/runtime';

export default forwardRef(function RustTimeline(props, ref) {
  const current = useRef(props); current.current = props;
  const canvas = useRef(null), host = useRef(null), written = useRef(null), writtenLayers = useRef(null), resize = useRef(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const command = value => { if (host.current) host.current.command(JSON.stringify(value)); };
  useEffect(() => {
    let closed = false, started = false, runner, poll;
    setError(''); setReady(false);
    (async () => {
      const module = await loadRustTimeline(); if (closed) return;
      runner = new module.TimelineRunner(); host.current = runner;
      const p = current.current;
      runner.set_scene(JSON.stringify(p.points), p.duration, p.fps, p.enabled, p.disabled);
      runner.set_objects(JSON.stringify(p.catalog || []), JSON.stringify(p.layerAnimation || {version:1,layers:[],tracks:[],constants:{}}));
      await runner.start(canvas.current); started = true;
      if (closed) { runner.destroy(); runner.free(); return; }
      setReady(true);
      const tick = () => {
        if (closed) return;
        const p = current.current;
        try {
          for (const event of JSON.parse(runner.take_events())) {
            if (event.type === 'points') { written.current = event.points; p.setPoints(event.points); }
            if (event.type === 'layerAnimation') { writtenLayers.current=event.animation; p.onLayerAnimation?.(event.animation); }
            if (event.type === 'seek' && p.enabled) p.onSeek(event.time, event.values, event.layers, event.cameraAnimated, event.routeAnimated);
            if (event.type === 'capture') {
              const values = cameraValues(p.onCapture()); if (!values) continue;
              runner.configure(p.duration, p.fps, true, p.disabled); p.nativePause(); p.onEnabled(true);
              runner.command(JSON.stringify({ op: 'capture', values, ...(Array.isArray(event.channels) ? { channels: event.channels } : {}), ...(event.properties ? {properties:event.properties,propertyValues:event.propertyValues} : {}) }));
            }
          }
          poll = requestAnimationFrame(tick);
        } catch (e) { setError(String(e.message || e)); p.onStatus(`Timeline Rust: ${e.message || e}`); }
      };
      tick();
    })().catch(e => { if (!closed) { setError(String(e.message || e)); current.current.onStatus(`Timeline Rust: ${e.message || e}`); } });
    return () => { closed = true; cancelAnimationFrame(poll); host.current = null; if (runner) { runner.destroy(); if (started) runner.free(); /* A pending start retains ownership until it resolves. */ } };
  }, [attempt]);
  useEffect(() => {
    const runner = host.current; if (!runner || !ready) return;
    try {
      if (props.points !== written.current) { runner.set_scene(JSON.stringify(props.points), props.duration, props.fps, props.enabled, props.disabled); written.current = props.points; }
      if (props.layerAnimation !== writtenLayers.current || props.catalog !== runner.lastCatalog) { runner.set_objects(JSON.stringify(props.catalog || []), JSON.stringify(props.layerAnimation || {version:1,layers:[],tracks:[],constants:{}})); writtenLayers.current=props.layerAnimation; runner.lastCatalog=props.catalog; }
      runner.configure(props.duration, props.fps, props.enabled, props.disabled);
    } catch (e) { setError(String(e.message || e)); }
  }, [props.points, props.duration, props.fps, props.enabled, props.disabled, props.catalog, props.layerAnimation, ready]);
  useEffect(() => { if (!props.visible) command({ op: 'pause' }); }, [props.visible]);
  useEffect(() => { const cancel = () => { command({ op: 'cancel' }); command({ op: 'pause' }); }; window.addEventListener('blur', cancel); return () => window.removeEventListener('blur', cancel); }, []);
  useImperativeHandle(ref, () => ({
    snapshot: () => host.current ? JSON.parse(host.current.snapshot()) : null,
    editObjectValues: values => command({ op: 'object_values', values }),
    play: () => props.enabled ? command({ op: 'play' }) : props.nativePlay(),
    pause: () => { command({ op: 'pause' }); props.nativePause(); },
    capture: () => command({ op: 'capture_request' }), curves: () => { command({ op: 'curves' }); props.onResize(600); },
    start: () => props.enabled ? command({ op: 'start' }) : props.nativeSeek(0),
    end: () => props.enabled ? command({ op: 'end' }) : props.nativeSeek(props.duration),
    step: amount => props.enabled ? command({ op: 'step', amount }) : props.nativeSeek(props.nativeTime + amount / props.fps),
    previous: () => command({ op: 'previous' }), next: () => command({ op: 'next' }),
  }));
  return <section data-rust-timeline="true" className={`rust-timeline ${props.visible ? '' : 'is-hidden'}`} hidden={!props.visible} aria-label="Timeline Rust" onKeyDownCapture={e => { if (((e.ctrlKey || e.metaKey) && ['a', 'd', 'z', 'y'].includes(e.key.toLowerCase())) || e.key === 'F9') e.preventDefault(); }} onKeyDown={e => { if (!((e.ctrlKey || e.metaKey) && ['s', 'o'].includes(e.key.toLowerCase()))) e.stopPropagation(); }}>
    <div className="timeline-resize" role="separator" aria-label="Altura da timeline" aria-orientation="horizontal" tabIndex="0" onKeyDown={e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); props.onResize(Math.max(200, Math.min(window.innerHeight * .75, e.currentTarget.parentElement.getBoundingClientRect().height + (e.key === 'ArrowUp' ? 20 : -20)))); } }} onPointerDown={e => { resize.current = { y: e.clientY, height: e.currentTarget.parentElement.getBoundingClientRect().height }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (resize.current) props.onResize(Math.max(200, Math.min(window.innerHeight * .75, resize.current.height + resize.current.y - e.clientY))); }} onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }} />
    <div className="rust-timeline-status"><strong>TIMELINE</strong><span>{ready ? 'Camadas · Keyframes · Curvas' : 'Carregando editor…'}</span><label><input type="checkbox" checked={props.enabled} disabled={!ready || props.disabled} onChange={e => { command({ op: 'pause' }); props.nativePause(); props.onEnabled(e.target.checked); }} /> Usar na exportação</label>{!props.enabled && <button disabled={props.disabled} onClick={props.nativePlay}>{props.nativePlaying ? 'Pausar' : 'Play'} Theatre legado</button>}{!props.enabled && <button disabled={props.disabled} onClick={props.onTheatre}>Editor Theatre legado</button>}<button onClick={() => props.onResize(600)}>Expandir timeline</button></div>
    {error && <div className="rust-timeline-error" role="alert">{error}<button onClick={() => setAttempt(v => v + 1)}>Tentar novamente</button></div>}
    <div className="rust-canvas-host"><canvas ref={canvas} aria-label="Tracks, keyframes e curvas da timeline Rust" /></div>
  </section>;
});
