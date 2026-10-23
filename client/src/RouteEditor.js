import React, { useEffect, useState } from 'react';

export default function RouteEditor({ route, drawing, onDrawing, onAnimate, onProgress, onFrame, disabled }) {
  const point = route.coords[route.selected], [lng, setLng] = useState(''), [lat, setLat] = useState(''), [error, setError] = useState('');
  useEffect(() => { setLng(point ? String(point[0]) : ''); setLat(point ? String(point[1]) : ''); setError(''); }, [point]);
  const apply = e => {
    e.preventDefault(); const x = Number(lng), y = Number(lat);
    if (!lng.trim() || !lat.trim() || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) { setError('Use longitude entre −180 e 180 e latitude entre −90 e 90.'); return; }
    route.change(route.coords.map((p, i) => i === route.selected ? [x, y] : p));
  };
  return <div className="route-editor" aria-label="Editar rota">
    <div className="feature-actions"><button disabled={disabled} aria-pressed={drawing} onClick={() => onDrawing(!drawing)}>{drawing ? 'Concluir desenho' : '+ Desenhar rota'}</button><button disabled={disabled || !route.coords.length} aria-pressed={route.editing} onClick={() => { onDrawing(false); route.setEditing(!route.editing); }}>Editar pontos</button></div>
    <div className="feature-actions"><button disabled={disabled || route.coords.length < 2} onClick={onAnimate}>▶ Animar rota</button><button disabled={disabled || !route.coords.length} onClick={onFrame}>Enquadrar rota</button></div>
    <label className="route-progress">Revelação <input aria-label="Revelação da rota" type="range" min="0" max="1" step="0.001" value={route.progress} disabled={disabled} onChange={e => onProgress(Number(e.target.value))} /><output>{Math.round(route.progress * 100)}%</output></label>
    <p className="prop-hint">“Animar rota” cria revelação de 0 a 100% na timeline, preservando a câmera. {route.editing ? 'Arraste os vértices; arraste ou clique nos pontos cinza para inserir.' : 'Ative “Editar pontos” para ajustar o traçado.'}</p>
    {route.editing && <>
      <div className="route-vertex-list" aria-label="Pontos da rota">{route.coords.map((p, i) => <button key={i} aria-pressed={route.selected === i} onClick={() => route.setSelected(i)}>{i + 1}<small>{p[0].toFixed(5)}, {p[1].toFixed(5)}</small></button>)}</div>
      {point && <form className="route-coordinate-form" onSubmit={apply}>
        <strong>Ponto {route.selected + 1}</strong>
        <label>Longitude<input aria-label="Longitude do ponto da rota" inputMode="decimal" value={lng} disabled={disabled} onChange={e => setLng(e.target.value)} /></label>
        <label>Latitude<input aria-label="Latitude do ponto da rota" inputMode="decimal" value={lat} disabled={disabled} onChange={e => setLat(e.target.value)} /></label>
        {error && <p role="alert">{error}</p>}<button disabled={disabled}>Aplicar coordenadas</button>
        <div className="feature-actions"><button type="button" disabled={disabled || route.selected >= route.coords.length - 1} onClick={() => route.insert(route.selected)}>Inserir depois</button><button type="button" disabled={disabled} onClick={() => route.remove(route.selected)}>Excluir ponto</button></div>
      </form>}
    </>}
    <div className="feature-actions"><button disabled={disabled || !route.canUndo} onClick={() => route.undo(false)}>Desfazer rota</button><button disabled={disabled || !route.canRedo} onClick={() => route.undo(true)}>Refazer rota</button><button disabled={disabled || !route.coords.length} onClick={() => { route.change([]); route.setSelected(null); }}>Limpar rota</button></div>
    <p className="prop-hint">{route.coords.length} pontos · Edição geométrica e animação são salvas no projeto.</p>
  </div>;
}
