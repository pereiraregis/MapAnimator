import React, { useRef, useState } from 'react';
import { geocode } from './geo/geocoding';

const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export default function AreaSearch({ onAdd, onStatus }) {
  const [open, setOpen] = useState(false), [source, setSource] = useState('countries');
  const [query, setQuery] = useState(''), [countries, setCountries] = useState([]), [results, setResults] = useState([]), [busy, setBusy] = useState(false);
  const catalog = useRef(null), request = useRef(0);
  const load = async () => {
    setOpen(v => !v);
    if (catalog.current) return;
    try {
      const r = await fetch(`${process.env.PUBLIC_URL}/data/countries.geojson`);
      if (!r.ok) throw Error('Catálogo indisponível');
      const data = await r.json(); catalog.current = data.features;
      setCountries(data.features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'pt')));
    } catch (err) { onStatus(err.message); }
  };
  const search = async e => {
    e.preventDefault(); if (query.trim().length < 3 || busy) return;
    const version = ++request.current; setBusy(true); setResults([]);
    try {
      const data = await geocode(query, localStorage.getItem('mapanimator.geocoder') || undefined, true);
      if (version !== request.current) return;
      const areas = (data.features || []).filter(f => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type));
      setResults(areas); onStatus(areas.length ? `${areas.length} limites encontrados. Escolha uma área para preencher.` : 'Nenhum limite encontrado. Inclua cidade, estado e país na busca ou importe GeoJSON.');
    } catch (err) { onStatus(`Limites: ${err.message}`); }
    finally { setBusy(false); }
  };
  const matches = countries.filter(f => normalize(`${f.properties.name} ${f.properties.name_en} ${f.properties.code}`).includes(normalize(query)));
  return <div className="area-search">
    <button className="area-toggle" aria-expanded={open} onClick={load}>◫ Países, cidades e regiões</button>
    {open && <div>
      <div className="area-source"><button aria-pressed={source === 'countries'} onClick={() => { request.current++; setSource('countries'); }}>Países</button><button aria-pressed={source === 'online'} onClick={() => setSource('online')}>Cidade / região</button></div>
      <form onSubmit={search}><input aria-label="Buscar área geográfica" placeholder={source === 'countries' ? 'Brasil, Portugal, BRA…' : 'Campinas, São Paulo, Brasil'} value={query} onChange={e => setQuery(e.target.value)} />{source === 'online' && <button disabled={busy || query.trim().length < 3}>{busy ? 'Buscando…' : 'Buscar limites'}</button>}</form>
      <div className="area-results">{(source === 'countries' ? matches.slice(0, 25) : results).map((f, i) => <div key={f.properties.code || f.properties.place_id || i}><span>{f.properties.name || f.properties.display_name}<small>{source === 'countries' ? f.properties.code : f.properties.display_name}</small></span><button aria-label={`Preencher ${f.properties.name || f.properties.display_name}`} onClick={() => onAdd({ ...f, properties: { ...f.properties, name: f.properties.name || f.properties.display_name.split(',')[0], source: source === 'countries' ? 'Natural Earth 1:110m' : '© OpenStreetMap contributors · Nominatim' } })}>+ Preencher</button></div>)}</div>
      <p className="feature-hint">{source === 'countries' ? '177 países e territórios · Natural Earth · limites simplificados para mapas de escala mundial.' : 'Busca por envio · OpenStreetMap / Nominatim. A disponibilidade e a definição dos limites variam por local.'}</p>
    </div>}
  </div>;
}
