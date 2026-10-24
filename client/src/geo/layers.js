import { renderCollection } from './features';

export function syncFeatureLayers(map, items, styleReady = false) {
  // style.load is safe for mutations even while other newly added sources load.
  if (!map || (!styleReady && !map.getSource('ma-features') && !map.isStyleLoaded())) return;
  const data = renderCollection(items);
  if (!map.getSource('ma-features')) {
    map.addSource('ma-features', { type: 'geojson', data });
    const animated = (state, field) => ['coalesce', ['feature-state',state], ['get',field]];
    const visible = value => ['case', ['==', ['feature-state','maVisible'], false], 0, value];
    const color = animated('maColor','_maColor'), opacity = visible(animated('maOpacity','_maOpacity'));
    const fill = visible(['case',['get','_maFill'],animated('maOpacity','_maOpacity'),0]);
    const outline = visible(['case',['get','_maOutline'],animated('maOpacity','_maOpacity'),0]);
    map.addLayer({ id: 'ma-polygons', type: 'fill', source: 'ma-features', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': fill } });
    map.addLayer({ id: 'ma-outlines', type: 'line', source: 'ma-features', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': ['case',['get','_maStrokeOwn'],['get','_maStroke'],color], 'line-width': animated('maWidth','_maWidth'), 'line-opacity': outline } });
    map.addLayer({ id: 'ma-points', type: 'circle', source: 'ma-features', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': color, 'circle-radius': animated('maRadius','_maRadius'), 'circle-opacity': opacity, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
  } else map.getSource('ma-features').setData(data);
  // Imported polygons must never cover the editable labels/pins.
  ['route-line', 'pins-icon-layer', 'pins-text-layer', 'route-edit-guide', 'route-edit-handles'].forEach(id => { if (map.getLayer?.(id)) map.moveLayer(id); });
}
