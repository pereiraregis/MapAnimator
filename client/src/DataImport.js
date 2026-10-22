import React, { useRef, useState } from 'react';
import { parseTable, tableToFeatures, scaleByValue } from './geo/csv';
import { makeItems } from './geo/features';

export default function DataImport({ onAdd, onStatus }) {
  const file = useRef(null), [table, setTable] = useState(null), [mapping, setMapping] = useState({ lng: '', lat: '', name: '', value: '' });
  const read = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error('Limite de 10 MB.');
      const data = parseTable(await f.text()); setTable(data);
      const find = names => data.columns.find(c => names.includes(c.toLowerCase())) || '';
      setMapping({ lng: find(['lng', 'lon', 'longitude']), lat: find(['lat', 'latitude']), name: find(['name', 'nome', 'label']), value: '' });
    } catch (err) { onStatus(err.message); }
  };
  const apply = () => {
    try {
      let items = makeItems(tableToFeatures(table, mapping), 'CSV');
      if (mapping.value) items = scaleByValue(items, mapping.value);
      onAdd(items); setTable(null); onStatus(`${items.length} pontos CSV importados.`);
    } catch (err) { onStatus(err.message); }
  };
  return <div className="data-import">
    <button onClick={() => file.current.click()}>+ Dados CSV / TSV</button>
    <input ref={file} type="file" accept=".csv,.tsv" hidden onChange={read} />
    {table && <div className="feature-inspector">
      <p>{table.rows.length} linhas · confirme as colunas</p>
      {[['lng', 'Longitude'], ['lat', 'Latitude'], ['name', 'Nome'], ['value', 'Tamanho pelo valor']].map(([key, label]) => <label key={key}>{label}
        <select aria-label={`Coluna ${label}`} value={mapping[key]} onChange={e => setMapping(m => ({ ...m, [key]: e.target.value }))}>
          <option value="">Selecionar…</option>{table.columns.map(c => <option key={c}>{c}</option>)}
        </select>
      </label>)}
      <div className="feature-actions"><button onClick={apply}>Importar dados</button><button onClick={() => setTable(null)}>Cancelar</button></div>
    </div>}
  </div>;
}
