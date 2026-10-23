import { renderCollection } from './features';

export function syncFeatureLayers(map, items, styleReady = false) {
  // style.load is safe for mutations even while other newly added sources load.
  if (!map || (!styleReady && !map.isStyleLoaded())) return;
  const data = renderCollection(items);
  if (!map.getSource('ma-features')) {
    map.addSource('ma-features', { type: 'geojson', data });
    const color = ['get', '_maColor'], opacity = ['get', '_maOpacity'];
    map.addLayer({ id: 'ma-polygons', type: 'fill', source: 'ma-features', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': ['get', '_maFillOpacity'] } });
    map.addLayer({ id: 'ma-outlines', type: 'line', source: 'ma-features', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': ['get', '_maStroke'], 'line-width': ['get', '_maWidth'], 'line-opacity': ['get', '_maLineOpacity'] } });
    map.addLayer({ id: 'ma-points', type: 'circle', source: 'ma-features', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': color, 'circle-radius': ['get', '_maRadius'], 'circle-opacity': opacity, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
  } else map.getSource('ma-features').setData(data);
  // Imported polygons must never cover the editable labels/pins.
  ['pins-icon-layer', 'pins-text-layer'].forEach(id => { if (map.getLayer?.(id)) map.moveLayer(id); });
}
