export function parseTable(text) {
  text = text.replace(/^\uFEFF/, '');
  const header = text.split(/\r?\n/)[0];
  const delimiter = header.includes('\t') ? '\t' : header.includes(';') ? ';' : ',';
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; } else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; closed = false; }
    else if (c === '\n' || c === '\r') {
      row.push(cell); if (row.some(v => v.trim())) rows.push(row);
      row = []; cell = ''; closed = false; if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (closed || c === '"') throw new Error('CSV: aspas ou separadores inválidos.');
    else cell += c;
  }
  if (quoted) throw new Error('CSV: campo com aspas não foi fechado.');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  const columns = rows.shift()?.map(v => v.trim());
  if (!columns?.length || columns.some(v => !v) || new Set(columns).size !== columns.length) throw new Error('CSV: cabeçalhos vazios ou duplicados.');
  if (!rows.length || rows.length > 5000 || rows.some(r => r.length !== columns.length)) throw new Error('CSV: use de 1 a 5000 linhas com o mesmo número de colunas.');
  return { columns, rows };
}

export function tableToFeatures(table, mapping) {
  const { lng, lat, name } = mapping;
  if (!table.columns.includes(lng) || !table.columns.includes(lat) || lng === lat) throw new Error('Selecione colunas distintas de longitude e latitude.');
  return table.rows.map((row, i) => {
    const properties = Object.fromEntries(table.columns.map((c, n) => [c, row[n]]));
    const x = properties[lng].trim(), y = properties[lat].trim();
    const coordinates = [Number(x), Number(y)];
    if (!x || !y || !coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) throw new Error(`CSV: coordenadas inválidas na linha ${i + 2}. Use ponto decimal.`);
    return { type: 'Feature', properties: { ...properties, name: properties[name] || `Ponto ${i + 1}` }, geometry: { type: 'Point', coordinates } };
  });
}

export function scaleByValue(items, field) {
  const values = items.map(item => Number(item.feature.properties[field]));
  if (items.some((item, i) => String(item.feature.properties[field] ?? '').trim() === '' || !Number.isFinite(values[i]))) throw new Error('O campo de valor deve ter números em todas as linhas.');
  const min = Math.min(...values), max = Math.max(...values);
  return items.map((item, i) => ({ ...item, style: { ...item.style, radius: min === max ? 12 : 5 + 20 * Math.sqrt((values[i] - min) / (max - min)), opacity: 0.85 } }));
}
