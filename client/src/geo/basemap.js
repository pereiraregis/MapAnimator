export const BASEMAP_DEFAULTS = { labels: true, roads: true, buildings: true, water: null, land: null };
export const isBasemapLayer = layer => !/^(ma-|pins-|route-)/.test(layer.id);
export function applyBasemap(map, originals, appearance) {
  if (!map || !originals.length) return;
  const a = { ...BASEMAP_DEFAULTS, ...appearance };
  originals.forEach(layer => {
    if (!map.getLayer(layer.id)) return;
    const key = `${layer.id} ${layer['source-layer'] || ''}`.toLowerCase();
    const visible = (a.labels || layer.type !== 'symbol') && (a.roads || !/road|transportation|highway|motorway/.test(key)) && (a.buildings || !/building/.test(key));
    map.setLayoutProperty(layer.id, 'visibility', visible ? layer.layout?.visibility || 'visible' : 'none');
    if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', a.land || layer.paint?.['background-color'] || null);
    if (layer.type === 'fill' && /water/.test(key)) map.setPaintProperty(layer.id, 'fill-color', a.water || layer.paint?.['fill-color'] || null);
  });
}
