import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { getProject, types, onChange } from '@theatre/core';
import studio from '@theatre/studio';
import JSZip from 'jszip';
import FeatureBrowser from './FeatureBrowser';
import CameraTimeline from './CameraTimeline';
import ShortcutHelp from './ShortcutHelp';
import { shortcutAction } from './shortcuts';
import { viewsToTheatre } from './geo/theatre';
import { createPinImage, PIN_PRESETS } from './geo/pins';
import { sampleCamera } from './geo/animation';
import { BASEMAP_DEFAULTS, isBasemapLayer, applyBasemap } from './geo/basemap';
import { featureBounds } from './geo/features';
import { syncFeatureLayers } from './geo/layers';
import { geocode } from './geo/geocoding';
import { STORAGE_KEY, REOPEN_KEY, readReopenedScene, validateScene, downloadJSON } from './geo/scene';
import './workspace.css';

const reopenedScene = readReopenedScene();
const openNativeStudio = sessionStorage.getItem('mapanimator.openStudio') === 'yes';
sessionStorage.removeItem('mapanimator.openStudio');
studio.initialize({ usePersistentStorage: !reopenedScene });
studio.ui.hide();
const project = getProject('MapAnimator v2', reopenedScene ? { state: reopenedScene.theatre } : undefined);
const sheet = project.sheet('Main Scene');

const distance = (p1, p2) => Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
const getInterpolatedPath = (coords, progress) => {
  if (coords.length < 2 || progress <= 0) return [];
  if (progress >= 0.99) return coords;
  const total = coords.reduce((acc, p, i) => i === 0 ? 0 : acc + distance(coords[i - 1], p), 0);
  const target = total * progress;
  let acc = 0; const path = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i], p2 = coords[i + 1], seg = distance(p1, p2);
    path.push(p1);
    if (acc + seg >= target) {
      const r = (target - acc) / seg;
      path.push([p1[0] + (p2[0] - p1[0]) * r, p1[1] + (p2[1] - p1[1]) * r]);
      return path;
    }
    acc += seg;
  }
  return path;
};

/**
 * Capture the map's WebGL canvas using the 'render' event.
 * This is the most reliable method because it fires exactly after
 * the GPU writes a new frame, while preserveDrawingBuffer=true keeps
 * the buffer alive until we read it.
 */
const captureMapFrame = (mapInstance, [W, H]) =>
  new Promise(resolve => {
    const doCapture = () => {
      const src = mapInstance.getCanvas();
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const ctx = out.getContext('2d');
      ctx.drawImage(src, 0, 0, W, H);
      // DOM controls are outside WebGL; burn provider attribution into exports.
      const text = [...mapInstance.getContainer().closest('.app-container').querySelectorAll('.maplibregl-ctrl-attrib-inner')].map(el => el.textContent).join(' · ') || '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors';
      const fontSize = Math.max(12, Math.round(W / 120));
      ctx.font = `${fontSize}px Arial`;
      const boxWidth = Math.min(W, ctx.measureText(text).width + 20);
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillRect(W - boxWidth, H - fontSize - 12, boxWidth, fontSize + 12);
      ctx.fillStyle = '#222'; ctx.fillText(text, W - boxWidth + 8, H - 8, boxWidth - 16);
      out.toBlob(async blob => resolve(new Uint8Array(await blob.arrayBuffer())), 'image/png', 0.95);
    };
    mapInstance.once('render', doCapture);
    mapInstance.triggerRepaint();
  });

// Panels belong to the workspace grid; their content scrolls independently.
function DockPanel({ title, visible = true, className = '', children, footerChildren }) {
  if (!visible) return null;
  return <section className={`dock-panel ${className}`} aria-label={title}>
    <header className="panel-header"><span className="panel-dot" /><h2>{title}</h2></header>
    <div className="panel-body">{children}</div>
    {footerChildren && <footer className="panel-footer">{footerChildren}</footer>}
  </section>;
}

const Section = ({ title, id, collapsed, onToggle, children }) => (
  <div className="section-group">
    <button className="section-header" type="button" aria-expanded={!collapsed} onClick={() => onToggle(id)}>
      <span className="chevron">{collapsed ? '▶' : '▼'}</span>{title}
    </button>
    {!collapsed && <div className="section-body">{children}</div>}
  </div>
);

function App() {
  const mapContainer = useRef(null), map = useRef(null), mapWrapper = useRef(null);
  const searchContainer = useRef(null), creditsContainer = useRef(null);
  const [pins, setPins] = useState(reopenedScene?.pins || []);
  const [features, setFeatures] = useState(reopenedScene?.features || []);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [browserVisible, setBrowserVisible] = useState(true);
  const [rightTab, setRightTab] = useState('features');
  const [mobilePane, setMobilePane] = useState('map');
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const timelineRef = useRef(null), shortcutsRef = useRef({});
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const [projectName, setProjectName] = useState(reopenedScene?.name || 'Main Scene');
  const [cameraView, setCameraView] = useState(reopenedScene?.camera || { lng: -46.633, lat: -23.550, zoom: 12, pitch: 0, bearing: 0 });
  const [waypoints, setWaypoints] = useState(() => (reopenedScene?.waypoints || []).map(p => ({ ...p, id: p.id || crypto.randomUUID() })));
  const [nativeStudio, setNativeStudio] = useState(openNativeStudio);
  const [nativeTime, setNativeTime] = useState(0), [nativePlaying, setNativePlaying] = useState(false);
  useEffect(() => onChange(sheet.sequence.pointer.position, setNativeTime), []);
  const [waypointMode, setWaypointMode] = useState(reopenedScene ? reopenedScene.cameraMode === 'waypoints' : true);
  const [timelineVisible, setTimelineVisible] = useState(true);
  const [timelineHeight, setTimelineHeight] = useState(284);
  const [appearance, setAppearance] = useState(reopenedScene?.appearance || { ...BASEMAP_DEFAULTS });
  const [styleURL, setStyleURL] = useState('');
  const basemapOriginals = useRef([]), appearanceRef = useRef(appearance), animationModeRef = useRef(false);
  appearanceRef.current = appearance; animationModeRef.current = waypointMode && waypoints.length > 0;
  const projectInput = useRef(null), featuresRef = useRef(features);
  const setupLayersRef = useRef(null);
  const syncPathLayerRef = useRef(null);
  featuresRef.current = features;
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState('Ready.');
  const [isRendering, setIsRendering] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  const [sec, setSec] = useState({});
  const [settings, setSettings] = useState(reopenedScene?.settings || {
    resolution: '1920x1080', mapStyle: 'https://tiles.openfreemap.org/styles/bright',
    pathColor: '#ec4899', pathWidth: 5, fps: 30, exportDuration: 3,
    // Animation timing controls
    animStart: 0,       // sequence start time (seconds)
    animEnd: 0,         // 0 = use full sequence length
    pathStart: 0,       // pathProgress animation: start time
    pathEnd: 0,         // 0 = use full sequence length
  });
  const [activePinId, setActivePinId] = useState(null);
  const toggleSec = id => setSec(p => ({ ...p, [id]: !p[id] }));

  const customPathCoords = useRef(reopenedScene?.route || []), pinsRef = useRef(reopenedScene?.pins || []);
  const isDrawingRef = useRef(false);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

  const ffmpegRef = useRef(new FFmpeg());
  const mapObj = useRef(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  // Dragging state for pins
  const dragState = useRef({ id: null, active: false });

  useEffect(() => {
    (async () => {
      try {
        const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpegRef.current.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setFfmpegLoaded(true);
      } catch (e) { console.warn('FFmpeg load failed:', e); }
    })();
  }, []);

  const syncPathLayer = useCallback((coords = customPathCoords.current) => {
    if (map.current?.getSource('route-source')) {
      map.current.setPaintProperty('route-line', 'line-color', settings.pathColor);
      map.current.setPaintProperty('route-line', 'line-width', parseFloat(settings.pathWidth));
      map.current.getSource('route-source').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
    }
  }, [settings.pathColor, settings.pathWidth]);
  syncPathLayerRef.current = syncPathLayer;

  const syncPinsLayer = useCallback(() => {
    if (map.current?.getSource('pins-source')) {
      const features = pinsRef.current.filter(p => p.visible !== false).map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          imageId: `pin-${p.id}`,
          iconOffset: p.iconOffset || [0, 3],
          opacity: p.opacity ?? 1,
          text: p.text || '',
          textScale: p.textScale || 1,
          textOffsetX: p.textOffsetX || 0,
          textOffsetY: p.textOffsetY || 0,
          textColor: p.textColor || '#ffffff',
          fontFamily: p.fontFamily || 'Inter, sans-serif'
        }
      }));
      console.log('Syncing pins layer with features:', features.length);
      map.current.getSource('pins-source').setData({ type: 'FeatureCollection', features });
    } else {
      console.warn('pins-source not found!');
    }
  }, []);

  const setupLayers = useCallback(() => {
    if (!map.current) return;
    if (!map.current.getSource('route-source')) {
      map.current.addSource('route-source', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
      map.current.addLayer({ id: 'route-line', type: 'line', source: 'route-source', paint: { 'line-color': settings.pathColor, 'line-width': parseFloat(settings.pathWidth) } });
    }
    if (!map.current.getSource('pins-source')) {
      map.current.addSource('pins-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // Layer 1: The Pin Icon
      map.current.addLayer({
        id: 'pins-icon-layer',
        type: 'symbol',
        source: 'pins-source',
        layout: {
          'icon-image': ['get', 'imageId'],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'bottom',
          'icon-offset': ['get', 'iconOffset']
        },
        paint: { 'icon-opacity': ['get', 'opacity'] }
      });

      // Labels are rasterized into each icon; a second symbol layer would
      // unnecessarily request glyphs and delay placement of this source.
    }
    syncPathLayer();
    syncPinsLayer();
  }, [settings.pathColor, settings.pathWidth, syncPathLayer, syncPinsLayer]);
  setupLayersRef.current = setupLayers;

  const updateViewport = useCallback(() => {
    if (!mapWrapper.current) return;
    const [w, h] = settings.resolution.split('x').map(Number);
    mapWrapper.current.style.width = w + 'px'; mapWrapper.current.style.height = h + 'px';
    const vp = mapWrapper.current.parentElement;
    if (vp.clientWidth < 1 || vp.clientHeight < 1) return;
    const scale = Math.max(.01, Math.min((vp.clientWidth - 32) / w, (vp.clientHeight - 32) / h));
    mapWrapper.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
    requestAnimationFrame(() => map.current?.resize());
  }, [settings.resolution]);

  useEffect(() => {
    const observer = new ResizeObserver(updateViewport);
    if (mapWrapper.current?.parentElement) observer.observe(mapWrapper.current.parentElement);
    window.addEventListener('resize', updateViewport); updateViewport();
    return () => { observer.disconnect(); window.removeEventListener('resize', updateViewport); };
  }, [updateViewport]);

  useEffect(() => {
    // Full reload emits style.load so custom pin/route/feature sources rebuild.
    // Style diffing removes those sources without running our setup callback.
    if (map.current) map.current.setStyle(settings.mapStyle, { diff: false });
  }, [settings.mapStyle]);

  useEffect(() => { syncPathLayer(); }, [syncPathLayer]);
  useEffect(() => { syncFeatureLayers(map.current, features); }, [features]);
  useEffect(() => { applyBasemap(map.current, basemapOriginals.current, appearance); }, [appearance]);

  useEffect(() => {
    if (map.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current, style: settings.mapStyle,
      center: reopenedScene ? [reopenedScene.camera.lng, reopenedScene.camera.lat] : [-46.633, -23.550],
      zoom: reopenedScene?.camera.zoom ?? 12, pitch: reopenedScene?.camera.pitch ?? 0, bearing: reopenedScene?.camera.bearing ?? 0,
      preserveDrawingBuffer: true, antialias: true, attributionControl: false,
    });

    const attribution = new maplibregl.AttributionControl({ compact: false });
    creditsContainer.current.appendChild(attribution.onAdd(map.current));

    map.current.on('style.load', () => {
      basemapOriginals.current = map.current.getStyle().layers.filter(isBasemapLayer);
      applyBasemap(map.current, basemapOriginals.current, appearanceRef.current);
      setupLayersRef.current();
      syncFeatureLayers(map.current, featuresRef.current, true);
      pinsRef.current.forEach(pin => createPinMarker(pin));
    });
    map.current.on('error', e => setStatus(`Mapa: ${e.error?.message || 'Falha ao carregar dados.'}`));

      map.current.on('styleimagemissing', e => {
        // Pins are supplied asynchronously at their actual size. A 1px placeholder
        // would make MapLibre cache the wrong icon dimensions on project restore.
        if (e.id.startsWith('pin-')) return;
        const c = document.createElement('canvas'); c.width = 1; c.height = 1;
        if (!map.current.hasImage(e.id)) map.current.addImage(e.id, c.getContext('2d').getImageData(0, 0, 1, 1));
      });
      const geocoder = new MaplibreGeocoder({
        forwardGeocode: async (cfg) => {
          try {
            const g = await geocode(cfg.query, localStorage.getItem('mapanimator.geocoder') || undefined);
            return { features: g.features.map(f => ({ ...f, place_name: f.properties.display_name, center: f.geometry.coordinates })) };
          } catch (err) { setStatus(err.message); return { features: [] }; }
        },
      }, { maplibregl, showResultsWhileTyping: false, minLength: 3, placeholder: 'Buscar lugar e pressionar Enter' });
      searchContainer.current.appendChild(geocoder.onAdd(map.current));
      updateViewport();

    map.current.on('click', e => {
      if (isDrawingRef.current) { customPathCoords.current.push([e.lngLat.lng, e.lngLat.lat]); syncPathLayerRef.current(); }
      else {
        if (map.current.queryRenderedFeatures(e.point, { layers: ['pins-icon-layer'].filter(id => map.current.getLayer(id)) }).length) return;
        const layers = ['ma-points', 'ma-outlines', 'ma-polygons'].filter(id => map.current.getLayer(id));
        const hit = layers.length && map.current.queryRenderedFeatures(e.point, { layers })[0];
        if (hit) { setSelectedFeature(hit.properties._maId); setRightTab('features'); setBrowserVisible(true); }
      }
    });

    // Native pin dragging logic (bind to icon layer)
    map.current.on('mousedown', 'pins-icon-layer', e => {
      if (isDrawingRef.current || e.originalEvent.button !== 0) return;
      e.preventDefault();
      const feature = e.features[0];
      if (feature) {
        setActivePinId(feature.properties.id); setRightTab('pin'); setBrowserVisible(true);
        dragState.current = { id: feature.properties.id, active: true, panEnabled: map.current.dragPan.isEnabled() };
        map.current.dragPan.disable();
        map.current.getCanvasContainer().style.cursor = 'grabbing';
      }
    });

    map.current.on('mousemove', e => {
      if (dragState.current.active) {
        const id = dragState.current.id;
        const pList = pinsRef.current;
        const idx = pList.findIndex(p => p.id === id);
        if (idx !== -1) {
          pList[idx].lng = e.lngLat.lng;
          pList[idx].lat = e.lngLat.lat;
          syncPinsLayer();
        }
      }
    });

    const finishPinDrag = () => {
      if (dragState.current.active) {
        dragState.current.active = false;
        if (dragState.current.panEnabled) map.current.dragPan.enable();
        map.current.getCanvasContainer().style.cursor = '';
        setPins([...pinsRef.current]);
      }
    };
    map.current.on('mouseup', finishPinDrag);
    window.addEventListener('mouseup', finishPinDrag);
    window.addEventListener('blur', finishPinDrag);

    map.current.on('moveend', () => {
      const center = map.current.getCenter();
      setCameraView({ lng: center.wrap().lng, lat: center.lat, zoom: map.current.getZoom(), pitch: map.current.getPitch(), bearing: map.current.getBearing() });
    });

    const c = map.current.getCenter();
    mapObj.current = sheet.object('Map', {
      lng: types.number(c.lng, { range: [-180, 180] }),
      lat: types.number(c.lat, { range: [-90, 90] }),
      zoom: types.number(map.current.getZoom(), { range: [0, 24] }),
      pitch: types.number(map.current.getPitch(), { range: [0, 85] }),
      bearing: types.number(map.current.getBearing(), { range: [-180, 180] }),
      pathProgress: types.number(1, { range: [0, 1] }),
    });

    project.ready.then(() => { if (openNativeStudio) { studio.setSelection([mapObj.current]); studio.ui.restore(); } });
    const unsubscribe = mapObj.current.onValuesChange(v => {
      if (!map.current || animationModeRef.current) return;
      const lng = typeof v.lng === 'number' ? v.lng : map.current.getCenter().lng;
      const lat = typeof v.lat === 'number' ? v.lat : map.current.getCenter().lat;
      const zoom = typeof v.zoom === 'number' ? v.zoom : map.current.getZoom();
      const pitch = typeof v.pitch === 'number' ? v.pitch : map.current.getPitch();
      const bearing = typeof v.bearing === 'number' ? v.bearing : map.current.getBearing();
      map.current.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
      if (customPathCoords.current.length > 1) syncPathLayerRef.current(getInterpolatedPath(customPathCoords.current, v.pathProgress || 0));
    });
    return () => { window.removeEventListener('mouseup', finishPinDrag); window.removeEventListener('blur', finishPinDrag); unsubscribe(); attribution.onRemove(); geocoder.onRemove(); map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line

  /* ── Pin helpers ─────────────────────────── */
  const createPinMarker = useCallback(pin => {
    if (!map.current?.getSource('pins-source')) return;
    try {
      const { data, pixelRatio, offset } = createPinImage(pin);
      pin.iconOffset = offset;
      const imgId = `pin-${pin.id}`;
      if (map.current.hasImage(imgId)) map.current.removeImage(imgId);
      map.current.addImage(imgId, data, { pixelRatio });
      syncPinsLayer();
      map.current.triggerRepaint();
    } catch (err) {
      setStatus(`Pin: ${err.message}`);
    }
  }, [syncPinsLayer]);

  const updatePin = async (id, field, value) => {
    const isFloat = ['scale', 'textScale', 'fontSize', 'strokeWidth', 'opacity'].includes(field);
    const isInt = ['textOffsetX', 'textOffsetY'].includes(field);
    let val = value;
    if (isFloat) val = parseFloat(value);
    if (isInt) val = parseInt(value, 10);
    if (field === 'text') val = value.slice(0, 500);
    if (field === 'scale') val = Math.min(3, Math.max(.5, val));
    if (field === 'textScale') val = Math.min(5, Math.max(.5, val));
    if ((isFloat || isInt || ['lng', 'lat'].includes(field)) && !Number.isFinite(Number(val))) return;
    if (['lng', 'lat'].includes(field)) val = Number(value);
    if (field === 'lng' && (val < -180 || val > 180)) return;
    if (field === 'lat' && (val < -85 || val > 85)) return;

    const idx = pinsRef.current.findIndex(p => p.id === id);
    if (idx !== -1) {
      const p = { ...pinsRef.current[idx], [field]: val };
      pinsRef.current = pinsRef.current.map(x => x.id === id ? p : x); createPinMarker(p);
      setPins(prev => prev.map(x => x.id === id ? p : x));
    }
  };

  const addPin = async () => {
    if (!map.current?.getSource('pins-source')) { setStatus('Aguarde o mapa carregar para adicionar um pin.'); return; }
    const c = map.current.getCenter();
    const p = {
      id: crypto.randomUUID(), lng: c.lng, lat: c.lat, text: 'Pin', color: '#ec4899',
      scale: 1.0, ...PIN_PRESETS[0], visible: true, opacity: 1, textScale: 1, textOffsetX: 0, textOffsetY: 0,
      textColor: '#ffffff', fontFamily: 'Inter, sans-serif', marker: null
    };
    pinsRef.current = [...pinsRef.current, p];
    createPinMarker(p);
    setPins([...pinsRef.current]);
    setStatus('Pin adicionado. Arraste no mapa ou ajuste as propriedades.');
    setActivePinId(p.id); setRightTab('pin'); setBrowserVisible(true);
    if (compact) setMobilePane('features');
  };

  const removePin = id => {
    pinsRef.current = pinsRef.current.filter(x => x.id !== id);
    setPins(prev => prev.filter(x => x.id !== id));
    if (activePinId === id) setActivePinId(null);
    syncPinsLayer();
    if (map.current?.hasImage(`pin-${id}`)) map.current.removeImage(`pin-${id}`);
  };

  /* ── Export helpers ──────────────────────── */
  const getResolution = () => settings.resolution.split('x').map(Number);

  const collectFrames = async (fps) => {
    // If the user specifies an export duration, use it! Otherwise fallback.
    const duration = settings.exportDuration > 0 ? settings.exportDuration : (sheet.sequence.length > 0 ? sheet.sequence.length : 10);
    const start = 0;

    if (duration <= 0) {
      throw new Error(`Duração inválida (${duration.toFixed(2)}s).`);
    }
    const total = Math.ceil(duration * fps);
    const frames = [];
    for (let i = 0; i < total; i++) {
      if (waypointMode && waypoints.length) seekCamera(start + i / fps);
      else sheet.sequence.position = start + (i / fps);
      await new Promise(r => setTimeout(r, 60));
      await new Promise((resolve, reject) => {
        if (map.current.loaded()) { resolve(); return; }
        const timer = setTimeout(() => { map.current.off('idle', done); reject(new Error('Tempo excedido ao carregar os tiles.')); }, 30000);
        const done = () => { clearTimeout(timer); resolve(); };
        map.current.once('idle', done); map.current.triggerRepaint();
      });
      frames.push(await captureMapFrame(map.current, getResolution()));
      setStatus(`Rendering: ${Math.round(((i + 1) / total) * 100)}%`);
    }
    return frames;
  };

  const generateMP4 = async () => {
    if (!ffmpegLoaded) { alert('FFmpeg still loading...'); return; }
    setIsRendering(true);
    const ffmpeg = ffmpegRef.current;
    try {
      // Wipe any old files from MEMFS
      try { const ls = await ffmpeg.listDir('/'); for (const f of ls) if (!f.isDir) await ffmpeg.deleteFile(f.name).catch(() => { }); } catch (_) { }

      setStatus('Capturing frames...');
      const fps = settings.fps || 30;
      const frames = await collectFrames(fps);

      setStatus('Writing frames...');
      for (let i = 0; i < frames.length; i++) await ffmpeg.writeFile(`f${i.toString().padStart(5, '0')}.png`, frames[i]);

      setStatus('Encoding...');
      await ffmpeg.exec(['-framerate', String(fps), '-i', 'f%05d.png', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', 'o.mp4']);

      const data = await ffmpeg.readFile('o.mp4');
      const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
      Object.assign(document.createElement('a'), { href: url, download: `map_${Date.now()}.mp4` }).click();
      setStatus('Done! 🎉'); setTimeout(() => setStatus('Ready.'), 3000);
    } catch (e) { console.error(e); alert(`Export failed: ${e?.message}`); }
    finally { setIsRendering(false); }
  };

  const generatePNGSequence = async () => {
    setIsRendering(true);
    try {
      setStatus('Capturing frames...');
      const fps = settings.fps || 30;
      const frames = await collectFrames(fps);
      setStatus('Zipping...');
      const zip = new JSZip(), folder = zip.folder('frames');
      frames.forEach((f, i) => folder.file(`f${i.toString().padStart(5, '0')}.png`, f));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `frames_${Date.now()}.zip` }).click();
      setStatus('Done! 🎉'); setTimeout(() => setStatus('Ready.'), 3000);
    } catch (e) { console.error(e); alert(`PNG export failed: ${e?.message}`); }
    finally { setIsRendering(false); }
  };

  const focusFeature = feature => {
    if (!map.current) return;
    const bounds = featureBounds(feature);
    map.current.fitBounds(bounds, { padding: 100, maxZoom: 14, duration: 800 });
  };

  const labelFeature = async item => {
    const b = featureBounds(item.feature);
    const p = { id: crypto.randomUUID(), lng: Number.isFinite(item.feature.properties.label_lng) ? item.feature.properties.label_lng : (b[0][0] + b[1][0]) / 2, lat: Number.isFinite(item.feature.properties.label_lat) ? item.feature.properties.label_lat : (b[0][1] + b[1][1]) / 2,
      text: item.name, ...PIN_PRESETS[0], scale: 1, visible: true, opacity: 1, textScale: 1,
      textOffsetX: 0, textOffsetY: 0, textColor: '#ffffff', fontFamily: 'Inter, sans-serif' };
    pinsRef.current = [...pinsRef.current, p];
    setPins([...pinsRef.current]); await createPinMarker(p);
    setActivePinId(p.id); setRightTab('pin'); setBrowserVisible(true); if (compact) setMobilePane('features');
    setStatus('Rótulo adicionado. Arraste o pin para ajustar a posição.');
  };

  const sceneSnapshot = () => {
    const c = map.current.getCenter();
    return validateScene({ format: 'MapAnimator', version: 1, name: projectName,
        settings, pins: pinsRef.current.map(({ marker, ...pin }) => pin), features,
        waypoints, cameraMode: waypointMode ? 'waypoints' : 'theatre', appearance,
        route: customPathCoords.current, camera: { lng: c.wrap().lng, lat: c.lat, zoom: map.current.getZoom(), pitch: map.current.getPitch(), bearing: map.current.getBearing() },
        theatre: studio.createContentOfSaveFile(project.address.projectId),
      });
  };
  const saveScene = () => {
    try {
      const scene = sceneSnapshot();
      downloadJSON(`${projectName.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'scene'}.mapanimator.json`, scene);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scene)); } catch { setStatus('Arquivo salvo. Sem espaço para a cópia local.'); return; }
      setStatus('Projeto e timeline salvos; uma cópia local também está disponível.');
    } catch (err) { setStatus(`Não foi possível salvar: ${err.message}`); }
  };

  const reopenScene = scene => {
    validateScene(scene);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
    sessionStorage.setItem(REOPEN_KEY, 'yes');
    window.location.reload();
  };

  const openSceneFile = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('O limite do projeto é 20 MB.');
      reopenScene(JSON.parse(await file.text()));
    } catch (err) { setStatus(`Projeto: ${err.message}`); }
  };

  const nativePause = () => { sheet.sequence.pause(); setNativePlaying(false); };
  const nativeSeek = value => { nativePause(); sheet.sequence.position = value; };
  const nativePlay = () => {
    if (nativePlaying) { nativePause(); return; }
    if (sheet.sequence.position >= settings.exportDuration) sheet.sequence.position = 0;
    setNativePlaying(true); sheet.sequence.play({ range: [0, settings.exportDuration] }).then(() => setNativePlaying(false)).catch(err => { setNativePlaying(false); setStatus(err.message); });
  };
  const showTheatre = () => {
    timelineRef.current?.pause();
    if (waypointMode && waypoints.length) {
      try {
        const scene = sceneSnapshot();
        scene.theatre = viewsToTheatre(waypoints, settings.exportDuration, settings.fps, scene.theatre);
        scene.cameraMode = 'theatre';
        sessionStorage.setItem('mapanimator.openStudio', 'yes');
        reopenScene(scene);
      } catch (err) { setStatus(`Theatre: ${err.message}`); }
      return;
    }
    setWaypointMode(false); setNativeStudio(true); studio.setSelection([mapObj.current]); studio.ui.restore();
  };
  const closeTheatre = () => { sheet.sequence.pause(); studio.ui.hide(); setNativeStudio(false); setStatus('Modo Theatre ativo. As curvas editadas serão usadas na exportação. Use a timeline para voltar às vistas.'); };
  const duplicatePin = pin => {
    const p = { ...pin, id: crypto.randomUUID(), lng: ((pin.lng + .001 + 180) % 360) - 180, text: `${pin.text} cópia` };
    pinsRef.current = [...pinsRef.current, p]; createPinMarker(p); setPins([...pinsRef.current]); setActivePinId(p.id);
  };
  const presetPin = (id, preset) => {
    const p = { ...pinsRef.current.find(pin => pin.id === id), ...preset, textScale: 1, textOffsetX: 0, textOffsetY: 0 };
    pinsRef.current = pinsRef.current.map(pin => pin.id === id ? p : pin); createPinMarker(p); setPins([...pinsRef.current]);
  };
  const captureCamera = () => {
    if (!map.current) return null;
    const c = map.current.getCenter();
    return { lng: c.wrap().lng, lat: c.lat, zoom: map.current.getZoom(), pitch: map.current.getPitch(), bearing: map.current.getBearing(), pathProgress: 1 };
  };
  const seekCamera = time => {
    const v = sampleCamera(waypoints, time); if (!v || !map.current) return;
    map.current.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom, pitch: v.pitch, bearing: v.bearing });
    if (customPathCoords.current.length > 1) syncPathLayerRef.current(getInterpolatedPath(customPathCoords.current, v.pathProgress));
  };

  const activatePane = pane => {
    setMobilePane(pane);
    if (pane === 'features') setRightTab('features');
    if (!compact) {
      if (pane === 'controls') setPanelVisible(v => !v);
      if (pane === 'features') setBrowserVisible(v => rightTab === 'features' ? !v : true);
    }
    if (pane === 'map') map.current?.getCanvas().focus();
  };
  const showHelp = () => { setRightTab('help'); setBrowserVisible(true); if (compact) setMobilePane('features'); };
  const fitSelection = () => {
    const item = features.find(f => f.id === selectedFeature);
    if (item) focusFeature(item.feature); else setStatus('Selecione um elemento para enquadrar.');
  };
  shortcutsRef.current = {
    disabled: isRendering || nativeStudio,
    play: () => timelineRef.current?.play(), capture: () => timelineRef.current?.capture(),
    back: () => timelineRef.current?.step(-1), forward: () => timelineRef.current?.step(1),
    backTen: () => timelineRef.current?.step(-10), forwardTen: () => timelineRef.current?.step(10),
    start: () => timelineRef.current?.start(), end: () => timelineRef.current?.end(),
    previous: () => timelineRef.current?.previous(), next: () => timelineRef.current?.next(),
    draw: () => { timelineRef.current?.pause(); setIsDrawing(true); }, select: () => setIsDrawing(false),
    pin: addPin, fit: fitSelection, north: () => map.current?.easeTo({ bearing: 0, duration: 300 }),
    save: saveScene, open: () => projectInput.current?.click(), help: showHelp,
    curves: () => { setTimelineVisible(true); timelineRef.current?.curves(); },
    timeline: () => setTimelineVisible(v => !v),
    controls: () => activatePane('controls'), map: () => activatePane('map'), features: () => activatePane('features'),
    focus: () => { const show = !panelVisible && !browserVisible; setPanelVisible(show); setBrowserVisible(show); setMobilePane('map'); },
    escape: () => { timelineRef.current?.pause(); setIsDrawing(false); setRightTab('features'); },
  };
  useEffect(() => {
    const keydown = event => {
      if (shortcutsRef.current.disabled) return;
      const action = shortcutAction(event);
      if (!action || !shortcutsRef.current[action]) return;
      event.preventDefault(); event.stopPropagation(); shortcutsRef.current[action]();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, []);

  /* ── Render ── */
  return (
    <div className={`app-container ${timelineVisible ? 'with-timeline' : ''}`} style={{ '--left-width': panelVisible ? 'var(--panel-left-size)' : '0px', '--right-width': browserVisible ? 'var(--panel-right-size)' : '0px', '--timeline-height': timelineVisible ? `min(65vh, ${timelineHeight}px)` : '0px' }}>
      <header className="workspace-bar">
        <div className="workspace-brand"><strong>MAP ANIMATOR <span className="version-badge">0.5.0</span></strong><small>GEOGRAPHIC MOTION STUDIO</small></div>
        <input aria-label="Nome do projeto" value={projectName} onChange={e => setProjectName(e.target.value)} />
        <nav className="workspace-navigation" aria-label="Áreas do editor">
          <button title="Controles (1)" aria-pressed={compact ? mobilePane === 'controls' : panelVisible} onClick={() => activatePane('controls')}>Controles</button>
          <button title="Mapa (2)" aria-pressed={compact && mobilePane === 'map'} onClick={() => activatePane('map')}>Mapa</button>
          <button title="Elementos (3)" aria-pressed={compact ? mobilePane === 'features' : browserVisible} onClick={() => activatePane('features')}>Elementos</button>
        </nav>
        <button title="Mostrar / ocultar timeline (T)" aria-pressed={timelineVisible} onClick={() => setTimelineVisible(v => !v)}>Timeline</button>
        <button title="Salvar projeto (Ctrl/⌘ + S)" aria-keyshortcuts="Control+S Meta+S" onClick={saveScene}>Salvar</button>
        <button title="Substitui a cena e recarrega a página. Salve o projeto atual primeiro." onClick={() => projectInput.current.click()}>Abrir</button>
        <button onClick={() => { try { reopenScene(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch (err) { setStatus(`Cópia local: ${err.message}`); } }}>Reabrir local</button>
        <button title="Atalhos (?)" aria-keyshortcuts="?" onClick={showHelp}>?</button>
        <input ref={projectInput} hidden type="file" accept=".json" onChange={openSceneFile} />
      </header>
      {nativeStudio && <div className="native-studio-bar"><strong>THEATRE.JS · EDITOR NATIVO</strong><span>Map → propriedades sequenciadas · Clique no segmento para Tween ou no ícone da track para curvas. Salvar preserva as edições.</span><button onClick={saveScene}>Salvar</button><button onClick={closeTheatre}>Fechar Studio</button></div>}
      <CameraTimeline ref={timelineRef} visible={timelineVisible} fps={settings.fps} points={waypoints} setPoints={setWaypoints} duration={settings.exportDuration}
        onDuration={exportDuration => setSettings(s => ({ ...s, exportDuration }))} onSeek={seekCamera} onCapture={captureCamera}
        onResize={setTimelineHeight} onTheatre={showTheatre} nativeSeek={nativeSeek} nativePlay={nativePlay} nativePause={nativePause} nativeTime={nativeTime} nativePlaying={nativePlaying} enabled={waypointMode} onEnabled={value => { nativePause(); setWaypointMode(value); }} disabled={isRendering} onStatus={setStatus} />
      <footer className="workspace-status"><span role="status">{status}</span><div ref={creditsContainer} className="map-credits" aria-label="Créditos do mapa" /><span className="status-hint">Espaço · Play/Pause <span>◇ K · Capturar</span> <span>? · Atalhos</span></span></footer>
      {(compact ? mobilePane === 'features' : browserVisible) && <aside className="geographic-panel" aria-label="Navegador e propriedades">
        <nav className="inspector-tabs" aria-label="Painel direito">
          {[['features', 'Elementos'], ['pin', 'Pin'], ['help', 'Atalhos']].map(([id, label]) => <button key={id} aria-pressed={rightTab === id} onClick={() => setRightTab(id)}>{label}</button>)}
        </nav>
        <div className="inspector-content">
          {rightTab === 'features' && <>
        <FeatureBrowser items={features} setItems={setFeatures} selected={selectedFeature} onSelect={setSelectedFeature}
          onFocus={focusFeature} onLabel={labelFeature} onStatus={setStatus}
          onRoute={item => { customPathCoords.current = item.feature.geometry.coordinates.map(p => [...p]); syncPathLayer(); setStatus('Rota pronta. Ajuste Rota de 0 a 1 nas vistas da timeline.'); }} />
          </>}
          {rightTab === 'pin' && <>
            <div className="pin-library" aria-label="Lista de pins">{pins.map(pin => <div key={pin.id} className={pin.id === activePinId ? 'selected' : ''}><input type="checkbox" aria-label={`Mostrar pin ${pin.text}`} checked={pin.visible !== false} onChange={e => updatePin(pin.id, 'visible', e.target.checked)} /><button onClick={() => setActivePinId(pin.id)}><span style={{ background: pin.color }} />{pin.text || 'Sem nome'}</button><button aria-label={`Enquadrar pin ${pin.text}`} onClick={() => map.current?.easeTo({ center: [pin.lng, pin.lat], duration: 500 })}>⌖</button></div>)}</div>
            <div className="feature-actions"><button onClick={addPin}>+ Adicionar pin · P</button>{activePinId !== null && <button onClick={() => removePin(activePinId)}>Excluir pin</button>}</div>

      {activePinId !== null && pins.find(p => p.id === activePinId) && (() => {
        const p = pins.find(x => x.id === activePinId);
        return (
          <DockPanel
            title={`PIN · ${p.text || 'Sem nome'}`}
            visible={true}
          >
            <div className="pin-presets">{PIN_PRESETS.map(preset => <button key={preset.name} onClick={() => presetPin(p.id, preset)}>{preset.name}</button>)}</div>
            <div className="feature-actions"><button onClick={() => duplicatePin(p)}>Duplicar pin</button></div>
            <div style={{ padding: '8px 0' }}>
              <div className="prop-row"><label htmlFor="pin-label">Texto</label><input id="pin-label" value={p.text} onChange={e => updatePin(p.id, 'text', e.target.value)} style={{ width: '60%' }} /></div>
              <div className="prop-row"><label htmlFor="pin-color">Cor do pin</label><input id="pin-color" type="color" value={p.color} onChange={e => updatePin(p.id, 'color', e.target.value)} /></div>
              <div className="prop-row"><label htmlFor="pin-lng">Longitude</label><input id="pin-lng" type="number" step="0.0001" value={p.lng} onChange={e => updatePin(p.id, 'lng', e.target.value)} /></div>
              <div className="prop-row"><label htmlFor="pin-lat">Latitude</label><input id="pin-lat" type="number" step="0.0001" value={p.lat} onChange={e => updatePin(p.id, 'lat', e.target.value)} /></div>
              <div className="prop-hint">Arraste o pin no mapa para reposicionar.</div>
              <div className="prop-row">
                <label>Estilo</label>
                <select value={p.style} onChange={e => updatePin(p.id, 'style', e.target.value)}>
                  <option value="callout">Chamada com linha</option>
                  <option value="bubble">Etiqueta</option>
                  <option value="classic">Pin</option>
                  <option value="square">Square</option>
                  <option value="flag">Flag</option>
                  <option value="dot">Dot</option>
                </select>
              </div>
              <div className="prop-row">
                <label>Escala do pin</label>
                <input type="number" min="0.5" max="3" step="0.1" value={p.scale} onChange={e => updatePin(p.id, 'scale', e.target.value)} />
              </div>
              <div className="prop-row"><label htmlFor="pin-outline">Contorno</label><input id="pin-outline" type="color" value={p.strokeColor || '#ffffff'} onChange={e => updatePin(p.id, 'strokeColor', e.target.value)} /></div>
              <div className="prop-row"><label htmlFor="pin-stroke">Espessura</label><input id="pin-stroke" type="number" min="0" max="10" step="0.5" value={p.strokeWidth ?? 2} onChange={e => updatePin(p.id, 'strokeWidth', Math.min(10, Math.max(0, Number(e.target.value))))} /></div>
              <div className="prop-row"><label htmlFor="pin-opacity">Opacidade</label><input id="pin-opacity" type="range" min="0" max="1" step="0.05" value={p.opacity ?? 1} onChange={e => updatePin(p.id, 'opacity', e.target.value)} /></div>
              <div className="prop-row"><label htmlFor="pin-fontsize">Texto (px)</label><input id="pin-fontsize" type="number" min="8" max="120" value={p.fontSize || 18} onChange={e => updatePin(p.id, 'fontSize', Math.min(120, Math.max(8, Number(e.target.value))))} /></div>
              <div className="prop-hint">Texto do pin · largura automática</div>
              <div className="prop-row">
                <label>Cor do texto</label>
                <input type="color" value={p.textColor || '#ffffff'} onChange={e => updatePin(p.id, 'textColor', e.target.value)} />
              </div>
              <div className="prop-row">
                <label>Fonte</label>
                <select value={p.fontFamily || 'Inter, sans-serif'} onChange={e => updatePin(p.id, 'fontFamily', e.target.value)}>
                  <option value="Inter, sans-serif">Inter</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="'Courier New', monospace">Courier New</option>
                  <option value="'Times New Roman', serif">Times New Roman</option>
                  <option value="'Comic Sans MS', cursive">Comic Sans</option>
                  <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                  <option value="Impact, sans-serif">Impact</option>
                </select>
              </div>
              <div className="prop-row">
                <label>Escala do texto</label>
                <input type="number" min="0.5" max="5" step="0.1" value={p.textScale || 1} onChange={e => updatePin(p.id, 'textScale', e.target.value)} />
              </div>
              <div className="prop-row">
                <label>Posição X/Y</label>
                <input type="number" step="1" value={p.textOffsetX || 0} onChange={e => updatePin(p.id, 'textOffsetX', e.target.value)} style={{ width: '40%' }} />
                <input type="number" step="1" value={p.textOffsetY || 0} onChange={e => updatePin(p.id, 'textOffsetY', e.target.value)} style={{ width: '40%' }} />
              </div>
            </div>
          </DockPanel>
        );
      })()}

            {!pins.some(p => p.id === activePinId) && <div className="inspector-empty">Selecione um pin nos controles ou use P para adicionar um no centro do mapa.</div>}
          </>}
          {rightTab === 'help' && <ShortcutHelp />}
        </div>
      </aside>}
      {isRendering && (
        <div className="render-overlay">
          <div>
            <div className="render-label">RENDERING</div>
            <div className="render-pct">{status.match(/\d+%/)?.[0] || status}</div>
          </div>
        </div>
      )}

      <DockPanel
        className="editor-sidebar"
        title="MAPA E CÂMERA"
        visible={compact ? mobilePane === 'controls' : panelVisible}
        footerChildren={
          <>
            <div className="export-heading"><span>EXPORTAR SEQUÊNCIA</span><span>{settings.fps} fps</span></div>
            <div className="prop-row" style={{ marginTop: '4px' }}>
              <label>Duração (s)</label>
              <input type="number" min="1" step="0.5" value={settings.exportDuration} onChange={e => setSettings(s => ({ ...s, exportDuration: parseFloat(e.target.value) || 3 }))} style={{ width: '60px' }} />
            </div>

            <div className="prop-row" style={{ gap: '4px', marginTop: '4px' }}>
              <button className="act-btn export-mp4" onClick={generateMP4} disabled={!ffmpegLoaded || isRendering}>
                ▶ MP4
              </button>
              <button className="act-btn export-png" onClick={generatePNGSequence} disabled={isRendering}>
                ⬛ PNG SEQ
              </button>
            </div>
            {status !== 'Ready.' && !isRendering && <div className="status-text">{status}</div>}
          </>
        }
      >
        <Section title="Câmera" id="camera" collapsed={sec.camera} onToggle={toggleSec}>
          {[['lng', 'Longitude', -180, 180], ['lat', 'Latitude', -85, 85], ['zoom', 'Zoom', 0, 24], ['pitch', 'Inclinação', 0, 85], ['bearing', 'Rotação', -180, 180]].map(([key, label, min, max]) => <div className="prop-row" key={key}>
            <label htmlFor={`camera-${key}`}>{label}</label>
            <input id={`camera-${key}`} type="number" step={key === 'lng' || key === 'lat' ? '0.001' : '0.1'} min={min} max={max} value={Number(cameraView[key].toFixed(4))}
              onChange={e => {
                if (e.target.value === '') return;
                const v = { ...cameraView, [key]: Math.min(max, Math.max(min, Number(e.target.value))) };
                setCameraView(v); map.current?.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom, pitch: v.pitch, bearing: v.bearing });
              }} />
          </div>)}
          <div className="prop-hint">K captura esta vista no tempo da timeline.</div>
        </Section>
        <Section title="Composição" id="ws" collapsed={sec.ws} onToggle={toggleSec}>
          <div className="prop-row"><label>Formato</label>
            <select value={settings.resolution} onChange={e => setSettings(s => ({ ...s, resolution: e.target.value }))}>
              <option value="1920x1080">1920×1080</option>
              <option value="1080x1920">1080×1920</option>
              <option value="1080x1080">1080×1080</option>
            </select>
          </div>
          <div className="prop-row"><label>Estilo</label>
            <select value={settings.mapStyle} onChange={e => setSettings(s => ({ ...s, mapStyle: e.target.value }))}>
              {!['bright', 'dark', 'positron', 'liberty'].some(v => settings.mapStyle === `https://tiles.openfreemap.org/styles/${v}`) && <option value={settings.mapStyle}>Personalizado</option>}
              <option value="https://tiles.openfreemap.org/styles/bright">Bright</option>
              <option value="https://tiles.openfreemap.org/styles/dark">Dark</option>
              <option value="https://tiles.openfreemap.org/styles/positron">Positron</option>
              <option value="https://tiles.openfreemap.org/styles/liberty">Liberty</option>
            </select>
          </div>
          <div className="prop-row"><label>FPS</label>
            <input type="number" min="10" max="60" value={settings.fps} onChange={e => setSettings(s => ({ ...s, fps: parseInt(e.target.value) }))} />
          </div>
        </Section>

        <Section title="Estilo do mapa-base" id="basemap" collapsed={sec.basemap !== false} onToggle={id => setSec(s => ({ ...s, [id]: s[id] === false }))}>
          {[['labels', 'Rótulos do mapa'], ['roads', 'Estradas'], ['buildings', 'Edifícios']].map(([key, label]) => <div className="prop-row" key={key}><label htmlFor={`base-${key}`}>{label}</label><input id={`base-${key}`} type="checkbox" checked={appearance[key]} onChange={e => setAppearance(a => ({ ...a, [key]: e.target.checked }))} /></div>)}
          {[['water', 'Cor da água', '#39596f'], ['land', 'Cor do fundo', '#e8e4db']].map(([key, label, fallback]) => <div className="prop-row" key={key}>
            <label htmlFor={`color-${key}`}>{label}</label><input aria-label={`Personalizar ${label}`} type="checkbox" checked={!!appearance[key]} onChange={e => setAppearance(a => ({ ...a, [key]: e.target.checked ? fallback : null }))} />
            <input id={`color-${key}`} type="color" value={appearance[key] || fallback} disabled={!appearance[key]} onChange={e => setAppearance(a => ({ ...a, [key]: e.target.value }))} />
          </div>)}
          <label className="prop-hint" htmlFor="style-url">URL HTTPS de um style.json MapLibre</label>
          <input id="style-url" className="style-url" placeholder="https://…/style.json" value={styleURL} onChange={e => setStyleURL(e.target.value)} />
          <button className="panel-btn" onClick={() => { try { const u = new URL(styleURL); if (u.protocol !== 'https:') throw new Error('Use uma URL HTTPS.'); setSettings(s => ({ ...s, mapStyle: u.href })); } catch (err) { setStatus(`Estilo: ${err.message}`); } }}>Aplicar estilo externo</button>
        </Section>

        <Section title="Rota" id="draw" collapsed={sec.draw} onToggle={toggleSec}>
          <div className="prop-row"><label>Cor</label>
            <input type="color" value={settings.pathColor} onChange={e => { setSettings(s => ({ ...s, pathColor: e.target.value })); syncPathLayer(); }} />
          </div>
          <div className="prop-row"><label>Traço</label>
            <input type="number" min="1" max="20" value={settings.pathWidth} onChange={e => setSettings(s => ({ ...s, pathWidth: e.target.value }))} />
          </div>
          <div className="prop-row" style={{ gap: '4px' }}>
            <button className={`panel-btn ${isDrawing ? 'active' : ''}`} onClick={() => setIsDrawing(!isDrawing)}>
              {isDrawing ? 'Concluir rota · V' : 'Desenhar rota · D'}
            </button>
            <button className="panel-btn" onClick={() => { customPathCoords.current = []; syncPathLayer(); }}>Limpar</button>
          </div>
        </Section>

        <Section title="Pins" id="pins" collapsed={sec.pins} onToggle={toggleSec}>
          {pins.map(p => (
            <div key={p.id} className="pin-card" style={{ paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="pin-row">
                <input type="color" value={p.color} onChange={e => updatePin(p.id, 'color', e.target.value)} className="color-dot" />
                <input type="text" value={p.text} onChange={e => updatePin(p.id, 'text', e.target.value)} className="pin-text-input" />
                <button className="pin-del" aria-label={`Editar pin ${p.text}`} onClick={() => { setActivePinId(p.id); setRightTab('pin'); setBrowserVisible(true); if (compact) setMobilePane('features'); }}>⚙</button>
                <button className="pin-del" aria-label={`Excluir pin ${p.text}`} onClick={() => removePin(p.id)}>×</button>
              </div>
            </div>
          ))}
          <div className="prop-row">
            <button className="panel-btn" onClick={addPin}>+ Adicionar pin · P</button>
          </div>
        </Section>
      </DockPanel>

      <main className="map-workspace" aria-label="Prévia do mapa" hidden={compact && mobilePane !== 'map'}>
        <div className="map-toolbar"><span className="view-mode-tag">{isDrawing ? 'DESENHANDO ROTA' : 'PRÉVIA'}</span><span>{settings.resolution.replace('x', ' × ')} · {settings.fps} fps</span><div className="map-search" ref={searchContainer} />
          <div className="map-tools"><button title="Selecionar (V)" aria-pressed={!isDrawing} onClick={() => setIsDrawing(false)}>↖ Selecionar</button><button title="Desenhar rota (D)" aria-pressed={isDrawing} onClick={() => setIsDrawing(v => !v)}>⌁ Rota</button><button title="Enquadrar seleção (F)" onClick={fitSelection}>⌖</button><button title="Norte (N)" onClick={() => map.current?.easeTo({ bearing: 0, duration: 300 })}>N ↑</button></div>
        </div>
        <div className="map-viewport">
        <div ref={mapWrapper} className="map-container">
          <div ref={mapContainer} className="map-element" />
        </div>
        </div>
      </main>
    </div>
  );
}

export default App;
