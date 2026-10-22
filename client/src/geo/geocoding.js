// Public Nominatim: explicit submission only; cache and serialize requests.
const cache = new Map();
let queue = Promise.resolve(), nextRequestAt = 0;
export function geocode(query, endpoint = 'https://nominatim.openstreetmap.org/search') {
  const term = query.trim();
  const key = `${endpoint}:${term.toLowerCase()}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const job = queue.then(async () => {
    if (cache.has(key)) return cache.get(key);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextRequestAt - Date.now())));
    nextRequestAt = Date.now() + 1100;
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ q: term, format: 'geojson', addressdetails: '1', limit: '5' }).toString();
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Busca indisponível (${response.status})`);
    const data = await response.json();
    cache.set(key, data);
    return data;
  });
  queue = job.catch(() => {});
  return job;
}
