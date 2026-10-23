import { curveOf, wrap } from './animation';

// On-disk schema exported by the installed Theatre.js 0.7.2 (definition 0.4.0).
// Conversion is explicit; the original docked view keys remain in the scene.
export function viewsToTheatre(points, duration, fps, previous) {
  const ordered = [...points].sort((a, b) => a.time - b.time);
  const tracks = {}, paths = {};
  ['lng', 'lat', 'zoom', 'pitch', 'bearing', 'pathProgress'].forEach(key => {
    const id = `camera-${key}`; paths[JSON.stringify([key])] = id;
    let value;
    tracks[id] = { type: 'BasicKeyframedTrack', keyframes: ordered.map((p, i) => {
      value = i && ['lng', 'bearing'].includes(key) ? value + wrap(p[key] - value) : p[key];
      const incoming = i ? curveOf(ordered[i - 1]) : [0, 0, 1, 1], outgoing = curveOf(p);
      return { id: `${key}-${i}`, position: p.time, value, handles: [incoming[2], incoming[3], outgoing[0], outgoing[1]], connectedRight: p.easing !== 'hold', type: p.easing === 'hold' ? 'hold' : 'bezier' };
    }) };
  });
  const old = previous?.sheetsById?.['Main Scene'];
  return { definitionVersion: '0.4.0', revisionHistory: [], sheetsById: { ...previous?.sheetsById, 'Main Scene': {
    staticOverrides: old?.staticOverrides || { byObject: {} },
    sequence: { type: 'PositionalSequence', length: duration, subUnitsPerUnit: fps, tracksByObject: { ...old?.sequence?.tracksByObject, Map: { trackIdByPropPath: paths, trackData: tracks } } },
  } } };
}
