import React, { useRef, useState } from 'react';
import { DEMO, makeItems, normalizeGeoJSON } from './geo/features';
import { downloadJSON } from './geo/scene';
import DataImport from './DataImport';

export default function FeatureBrowser({ items, setItems, selected, onSelect, onFocus, onLabel, onRoute, onStatus }) {
  const fileInput = useRef(null);
  const [query, setQuery] = useState('');
  const active = items.find(i => i.id === selected);
  const update = patch => setItems(all => all.map(i => i.id === selected ? { ...i, ...patch } : i));
  const style = (key, value) => update({ style: { ...active.style, [key]: value } });
  const append = (data, name) => {
    const added = makeItems(normalizeGeoJSON(data), name);
    if (items.length + added.length > 5000) { onStatus('Limite de 5000 elementos por projeto.'); return; }
    setItems(all => [...all, ...added]); onSelect(added[0].id); onFocus(added[0].feature);
    onStatus(`${added.length} elementos importados.`);
  };
  const importFile = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('O limite por arquivo é 10 MB.');
      append(JSON.parse(await file.text()), file.name.replace(/\.[^.]+$/, ''));
    } catch (err) { onStatus(`Importação: ${err.message}`); }
  };
  return <section className="feature-browser" aria-label="Elementos geográficos">
    <div className="feature-heading"><span>ELEMENTOS GEOGRÁFICOS</span><span>{items.length}</span></div>
    <p className="feature-hint">Importe países, regiões e trajetos. Selecione um elemento para editar seu estilo.</p>
    <div className="feature-actions">
      <button onClick={() => fileInput.current.click()}>+ GeoJSON</button>
      <button onClick={() => append(DEMO, 'Demo')}>Exemplo</button>
      <button disabled={!items.length} onClick={() => downloadJSON('mapanimator-features.geojson', { type: 'FeatureCollection', features: items.map(i => i.feature) })}>Exportar</button>
    </div>
    <input ref={fileInput} hidden type="file" accept=".geojson,.json" onChange={importFile} />
    <DataImport onStatus={onStatus} onAdd={added => {
      if (items.length + added.length > 5000) throw new Error('Limite de 5000 elementos por projeto.');
      setItems(all => [...all, ...added]); onSelect(added[0].id); onFocus(added[0].feature);
    }} />
    <input className="feature-filter" aria-label="Filtrar elementos" placeholder="Filtrar elementos…" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="feature-list">
      {!items.length && <div className="feature-empty">Nenhum elemento. Abra o exemplo ou importe um GeoJSON WGS84.</div>}
      {items.filter(i => i.name.toLowerCase().includes(query.toLowerCase())).map(item => <div className={`feature-row ${item.id === selected ? 'selected' : ''}`} key={item.id}>
        <input type="checkbox" aria-label={`Mostrar ${item.name}`} checked={item.visible} onChange={e => setItems(all => all.map(i => i.id === item.id ? { ...i, visible: e.target.checked } : i))} />
        <button className="feature-name" onClick={() => onSelect(item.id)}><span>{item.name}</span><small>{item.feature.geometry.type}</small></button>
        <button title="Enquadrar elemento" aria-label={`Enquadrar ${item.name}`} onClick={() => onFocus(item.feature)}>⌖</button>
      </div>)}
    </div>
    {active && <div className="feature-inspector">
      <label>Nome<input value={active.name} onChange={e => update({ name: e.target.value })} /></label>
      <label>Cor<input type="color" value={active.style.color} onChange={e => style('color', e.target.value)} /></label>
      <label>Opacidade<input type="range" min="0" max="1" step="0.05" value={active.style.opacity} onChange={e => style('opacity', Number(e.target.value))} /></label>
      <label>Traço<input type="number" min="1" max="20" value={active.style.width} onChange={e => style('width', Math.min(20, Math.max(1, Number(e.target.value))))} /></label>
      <label>Raio do ponto<input type="number" min="1" max="30" value={active.style.radius} onChange={e => style('radius', Math.min(30, Math.max(1, Number(e.target.value))))} /></label>
      <div className="feature-actions">
        <button onClick={() => onLabel(active)}>+ Rótulo</button>
        <button disabled={active.feature.geometry.type !== 'LineString'} onClick={() => onRoute(active)}>Animar rota</button>
        <button onClick={() => { setItems(all => all.filter(i => i.id !== active.id)); onSelect(null); }}>Excluir</button>
      </div>
      <details><summary>Propriedades originais</summary><pre>{JSON.stringify(active.feature.properties, null, 2)}</pre></details>
    </div>}
  </section>;
}
