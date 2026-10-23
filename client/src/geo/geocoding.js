// Public Nominatim: explicit submission only; cache and serialize requests.
const cache = new Map();
let queue = Promise.resolve(), nextRequestAt = 0;
export function geocode(query, endpoint = 'https://nominatim.openstreetmap.org/search', polygons = false) {
  const term = query.trim();
  const key = `${endpoint}:${polygons}:${term.toLowerCase()}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const job = queue.then(async () => {
    if (cache.has(key)) return cache.get(key);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextRequestAt - Date.now())));
    nextRequestAt = Date.now() + 1100;
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ q: term, format: 'geojson', addressdetails: '1', limit: '5' }).toString();
    if (polygons) { url.searchParams.set('polygon_geojson', '1'); url.searchParams.set('polygon_threshold', '0.001'); }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    let data;
    try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) throw new Error(`Busca indisponível (${response.status})`);
    const text = await response.text();
    if (text.length > 10 * 1024 * 1024) throw new Error('Geometria muito grande. Importe um GeoJSON simplificado.');
    data = JSON.parse(text);
    } finally { clearTimeout(timer); }
    cache.set(key, data);
    return data;
  });
  queue = job.catch(() => {});
  return job;
}
