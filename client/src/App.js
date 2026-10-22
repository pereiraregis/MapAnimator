import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { getProject, types } from '@theatre/core';
import studio from '@theatre/studio';
import JSZip from 'jszip';
import FeatureBrowser from './FeatureBrowser';
import CameraTimeline from './CameraTimeline';
import { sampleCamera } from './geo/animation';
import { BASEMAP_DEFAULTS, isBasemapLayer, applyBasemap } from './geo/basemap';
import { featureBounds } from './geo/features';
import { syncFeatureLayers } from './geo/layers';
import { geocode } from './geo/geocoding';
import { STORAGE_KEY, REOPEN_KEY, readReopenedScene, validateScene, downloadJSON } from './geo/scene';
import './App.css';

const reopenedScene = readReopenedScene();
studio.initialize({ usePersistentStorage: !reopenedScene });
studio.ui.hide();
const project = getProject('MapAnimator v2', reopenedScene ? { state: reopenedScene.theatre } : undefined);
const sheet = project.sheet('Main Scene');

let studioHidden = true;
const toggleStudio = () => {
  if (studioHidden) { studio.ui.restore(); studioHidden = false; }
  else { studio.ui.hide(); studioHidden = true; }
};

const SVGS = {
  'classic': `<svg viewBox="0 0 24 24" fill="%C" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="1"/></svg>`,
  'bubble': `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="96" height="46" rx="15" fill="%C" stroke="white" stroke-width="3"/><path d="M50 48 L40 60 L60 60 Z" fill="%C"/></svg>`,
  'square': `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="4" fill="%C" stroke="white" stroke-width="2"/><path d="M12 22l-4 4h8l-4-4z" fill="%C"/></svg>`,
  'flag': `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 2v20" stroke="white" stroke-width="2"/><path d="M5 4h14l-4 5 4 5H5" fill="%C"/></svg>`,
  'dot': `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="%C" stroke="white" stroke-width="2"/></svg>`
};

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
      const text = [...mapInstance.getContainer().querySelectorAll('.maplibregl-ctrl-attrib-inner')].map(el => el.textContent).join(' · ') || '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors';
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

// Draggable Floating Panel
function FloatingPanel({ title, visible, onClose, defaultPos, children, footerChildren }) {
  const [pos, setPos] = useState(defaultPos || { x: 20, y: 80 });
  const [collapsed, setPanelCollapsed] = useState(false);
  const dragRef = useRef(null);

  const onMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    dragRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
  };
  useEffect(() => {
    const move = e => {
      if (!dragRef.current) return;
      setPos({ x: Math.max(0, dragRef.current.px + e.clientX - dragRef.current.mx), y: Math.max(0, dragRef.current.py + e.clientY - dragRef.current.my) });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  if (!visible) return null;
  return (
    <div className="floating-panel" style={{ left: pos.x, top: pos.y }}>
      <div className="panel-header" onMouseDown={onMouseDown}>
        <div className="panel-title-row">
          <span className="panel-dot" />
          <span className="panel-title">{title}</span>
        </div>
        <div className="no-drag panel-controls">
          <button className="panel-ctrl-btn" onClick={() => setPanelCollapsed(!collapsed)}>{collapsed ? '▼' : '▲'}</button>
          <button className="panel-ctrl-btn" onClick={onClose}>×</button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="panel-body">{children}</div>
          {footerChildren && <div className="panel-footer">{footerChildren}</div>}
        </>
      )}
    </div>
  );
}

const Section = ({ title, id, collapsed, onToggle, children }) => (
  <div className="section-group">
    <div className="section-header" onClick={() => onToggle(id)}>
      <span className="chevron">{collapsed ? '▶' : '▼'}</span>{title}
    </div>
    {!collapsed && <div className="section-body">{children}</div>}
  </div>
);

function App() {
  const mapContainer = useRef(null), map = useRef(null), mapWrapper = useRef(null);
  const [pins, setPins] = useState(reopenedScene?.pins || []);
  const [features, setFeatures] = useState(reopenedScene?.features || []);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [browserVisible, setBrowserVisible] = useState(true);
  const [projectName, setProjectName] = useState(reopenedScene?.name || 'Main Scene');
  const [cameraView, setCameraView] = useState(reopenedScene?.camera || { lng: -46.633, lat: -23.550, zoom: 12, pitch: 0, bearing: 0 });
  const [waypoints, setWaypoints] = useState(reopenedScene?.waypoints || []);
  const [waypointMode, setWaypointMode] = useState(reopenedScene?.cameraMode === 'waypoints');
  const [timelineVisible, setTimelineVisible] = useState(true);
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
  const [liveSync, setLiveSync] = useState(false); // live map→Theatre sync toggle
  const toggleSec = id => setSec(p => ({ ...p, [id]: !p[id] }));

  const customPathCoords = useRef(reopenedScene?.route || []), pinsRef = useRef(reopenedScene?.pins || []);
  const isDrawingRef = useRef(false);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

  const ffmpegRef = useRef(new FFmpeg());
  const mapObj = useRef(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const liveSyncRef = useRef(liveSync);
  useEffect(() => { liveSyncRef.current = liveSync; }, [liveSync]);

  // Debounce ref for live sync
  const syncTimer = useRef(null);

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
      const features = pinsRef.current.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          imageId: `pin-${p.id}`,
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
          'icon-anchor': 'bottom'
        }
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
    const scale = Math.min((vp.clientWidth - 40) / w, (vp.clientHeight - 40) / h);
    mapWrapper.current.style.transform = `scale(${scale})`;
    requestAnimationFrame(() => map.current?.resize());
  }, [settings.resolution]);

  useEffect(() => {
    window.addEventListener('resize', updateViewport); updateViewport();
    return () => window.removeEventListener('resize', updateViewport);
  }, [updateViewport]);

  useEffect(() => {
    if (map.current) map.current.setStyle(settings.mapStyle);
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
      preserveDrawingBuffer: true, antialias: true, attributionControl: { compact: false },
    });

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
      map.current.addControl(geocoder, 'top-left');
      updateViewport();

    map.current.on('click', e => {
      if (isDrawingRef.current) { customPathCoords.current.push([e.lngLat.lng, e.lngLat.lat]); syncPathLayerRef.current(); }
      else {
        const layers = ['ma-points', 'ma-outlines', 'ma-polygons'].filter(id => map.current.getLayer(id));
        const hit = layers.length && map.current.queryRenderedFeatures(e.point, { layers })[0];
        if (hit) setSelectedFeature(hit.properties._maId);
      }
    });

    // Native pin dragging logic (bind to icon layer)
    map.current.on('mousedown', 'pins-icon-layer', e => {
      e.preventDefault();
      const feature = e.features[0];
      if (feature) {
        dragState.current = { id: feature.properties.id, active: true };
        map.current.getCanvasContainer().style.cursor = 'grabbing';
      }
    });

    map.current.on('mousemove', e => {
      if (dragState.current.active && dragState.current.id) {
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

    map.current.on('mouseup', () => {
      if (dragState.current.active) {
        dragState.current.active = false;
        map.current.getCanvasContainer().style.cursor = '';
        setPins([...pinsRef.current]); // trigger React re-render
      }
    });

    // Live sync: when map moves, debounce-update Theatre.js props
    map.current.on('moveend', () => {
      const center = map.current.getCenter();
      setCameraView({ lng: center.wrap().lng, lat: center.lat, zoom: map.current.getZoom(), pitch: map.current.getPitch(), bearing: map.current.getBearing() });
      if (!liveSyncRef.current || !mapObj.current || animationModeRef.current) return;
      clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        const c = map.current.getCenter();
        studio.transaction(({ set }) => {
          set(mapObj.current.props, {
            lng: c.lng, lat: c.lat,
            zoom: map.current.getZoom(),
            pitch: map.current.getPitch(),
            bearing: map.current.getBearing(),
            pathProgress: 1,
          });
        });
      }, 300);
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
    return () => { unsubscribe(); clearTimeout(syncTimer.current); map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line

  /* ── Pin helpers ─────────────────────────── */
  const createPinCanvas = async pin => {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    const bw = pin.style === 'bubble' ? 100 : 50, scale = pin.scale || 1, dpr = window.devicePixelRatio || 1;

    // We add a large padding to the canvas so text doesn't clip when offset.
    const padX = 150 * dpr; // padding on each side
    const padY = 150 * dpr; // padding on top/bottom
    const imgW = bw * scale * dpr;
    const imgH = 50 * scale * dpr;

    canvas.width = imgW + (padX * 2);
    canvas.height = imgH + (padY * 2);

    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent((SVGS[pin.style] || SVGS.classic).replace(/%C/g, pin.color));
    await new Promise(r => img.onload = r);

    // Draw the pin image in the center horizontally, and offset vertically so the tip of the pin
    // is exactly sitting at a predictable anchor. We anchor nearest to the bottom.
    // We leave padY space above, and padY space below the image.
    const drawX = padX;
    const drawY = padY;
    ctx.drawImage(img, drawX, drawY, imgW, imgH);

    // Draw text natively directly onto the image buffer
    if (pin.text) {
      const fs = 12 * scale * (pin.textScale || 1) * dpr;
      const font = pin.fontFamily || 'Inter, sans-serif';
      ctx.font = `800 ${fs}px ${font}`;
      ctx.fillStyle = pin.textColor || '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Simple dark shadow outline for contrast
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 2 * dpr;

      // We can also stroke the text slightly to make it pop like MapLibre does
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 2 * dpr;

      // Base text coordinates (centered over the image)
      const textBaseX = drawX + (imgW / 2);
      const textBaseY = drawY + (imgH / 2.3);

      const px = textBaseX + (pin.textOffsetX || 0) * dpr;
      const py = textBaseY + (pin.textOffsetY || 0) * dpr;

      ctx.strokeText(pin.text, px, py);
      ctx.fillText(pin.text, px, py);
    }

    // Since the canvas is now much taller to accommodate the text offset, MapLibre's 'bottom' anchor
    // would target the bottom of the padded canvas, not the tip of the pin.
    // We can offset the icon rendering in MapLibre or pass a custom anchor/height.
    // MapLibre centers the icon above the point if anchor is 'bottom', assuming the
    // point is at the bottom middle. 
    // Since our pin image sits at drawY, the tip of the pin is at `drawY + imgH`.
    // The empty padding below the pin is `padY`.
    // We'll leave the anchor at 'bottom' in MapLibre, but we'll trim the canvas exactly at the pin's tip
    // so we don't have to fight map offset math.

    // Create a new strictly trimmed canvas that cuts off everything below the pin tip,
    // so the 'bottom' anchor of MapLibre aligns perfectly with the pin tip, but leaves the huge ceiling for text.
    const trimmedH = drawY + imgH;
    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = canvas.width;
    trimmedCanvas.height = trimmedH;
    const tCtx = trimmedCanvas.getContext('2d');
    tCtx.drawImage(canvas, 0, 0, canvas.width, trimmedH, 0, 0, canvas.width, trimmedH);

    return {
      data: tCtx.getImageData(0, 0, trimmedCanvas.width, trimmedCanvas.height),
      w: trimmedCanvas.width,
      h: trimmedCanvas.height,
      style: pin.style
    };
  };

  const createPinMarker = useCallback(async pin => {
    if (!map.current) return;
    try {
      const { data } = await createPinCanvas(pin);
      const imgId = `pin-${pin.id}`;
      // MapLibre requires removing an image before updating it if it already exists
      if (map.current.hasImage(imgId)) {
        map.current.removeImage(imgId);
      }
      map.current.addImage(imgId, data);
      syncPinsLayer();
      // Force repaint to make it appear immediately
      map.current.triggerRepaint();
    } catch (err) {
      console.error('Failed to create pin marker image:', err);
    }
  }, [syncPinsLayer]); // eslint-disable-line

  const updatePin = async (id, field, value) => {
    const isFloat = ['scale', 'textScale'].includes(field);
    const isInt = ['textOffsetX', 'textOffsetY'].includes(field);
    let val = value;
    if (isFloat) val = parseFloat(value);
    if (isInt) val = parseInt(value, 10);

    const idx = pinsRef.current.findIndex(p => p.id === id);
    if (idx !== -1) {
      const p = { ...pinsRef.current[idx], [field]: val };
      pinsRef.current[idx] = p; await createPinMarker(p);
      setPins(prev => prev.map(x => x.id === id ? p : x));
    }
  };

  const addPin = async () => {
    const c = map.current.getCenter();
    const p = {
      id: crypto.randomUUID(), lng: c.lng, lat: c.lat, text: 'Pin', color: '#ec4899',
      scale: 1.0, style: 'bubble', textScale: 1, textOffsetX: 0, textOffsetY: 0,
      textColor: '#ffffff', fontFamily: 'Inter, sans-serif', marker: null
    };
    pinsRef.current.push(p);
    await createPinMarker(p);
    setPins(prev => [...prev, p]);
  };

  const removePin = id => {
    pinsRef.current = pinsRef.current.filter(x => x.id !== id);
    setPins(prev => prev.filter(x => x.id !== id));
    if (activePinId === id) setActivePinId(null);
    if (map.current?.hasImage(`pin-${id}`)) map.current.removeImage(`pin-${id}`);
    syncPinsLayer();
  };

  const syncToTimeline = () => {
    if (!map.current || !mapObj.current) return;
    const c = map.current.getCenter();
    studio.transaction(({ set }) => {
      set(mapObj.current.props, { lng: c.lng, lat: c.lat, zoom: map.current.getZoom(), pitch: map.current.getPitch(), bearing: map.current.getBearing(), pathProgress: 1 });
    });
    setStatus('Captured!'); setTimeout(() => setStatus('Ready.'), 1500);
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
    const p = { id: crypto.randomUUID(), lng: (b[0][0] + b[1][0]) / 2, lat: (b[0][1] + b[1][1]) / 2,
      text: item.name, color: item.style.color, scale: 1, style: 'bubble', textScale: 1,
      textOffsetX: 0, textOffsetY: 0, textColor: '#ffffff', fontFamily: 'Inter, sans-serif' };
    pinsRef.current = [...pinsRef.current, p];
    setPins([...pinsRef.current]); await createPinMarker(p);
    setStatus('Rótulo adicionado. Arraste o pin para ajustar a posição.');
  };

  const saveScene = () => {
    try {
      const c = map.current.getCenter();
      const scene = validateScene({ format: 'MapAnimator', version: 1, name: projectName,
        settings, pins: pinsRef.current.map(({ marker, ...pin }) => pin), features,
        waypoints, cameraMode: waypointMode ? 'waypoints' : 'theatre', appearance,
        route: customPathCoords.current, camera: { lng: c.wrap().lng, lat: c.lat, zoom: map.current.getZoom(), pitch: map.current.getPitch(), bearing: map.current.getBearing() },
        theatre: studio.createContentOfSaveFile(project.address.projectId),
      });
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

  /* ── Render ── */
  return (
    <div className={`app-container ${timelineVisible ? 'with-timeline' : ''}`}>
      <header className="workspace-bar">
        <div className="workspace-brand"><strong>MAP ANIMATOR <span className="version-badge">0.3.0</span></strong><small>GEOGRAPHIC MOTION STUDIO</small></div>
        <input aria-label="Nome do projeto" value={projectName} onChange={e => setProjectName(e.target.value)} />
        <button onClick={() => setBrowserVisible(v => !v)}>Elementos</button>
        <button onClick={() => setTimelineVisible(v => !v)}>Timeline</button>
        <button onClick={saveScene}>Salvar projeto</button>
        <button title="Substitui a cena e recarrega a página. Salve o projeto atual primeiro." onClick={() => projectInput.current.click()}>Abrir arquivo</button>
        <button onClick={() => { try { reopenScene(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch (err) { setStatus(`Cópia local: ${err.message}`); } }}>Reabrir local</button>
        <input ref={projectInput} hidden type="file" accept=".json" onChange={openSceneFile} />
      </header>
      {timelineVisible && <CameraTimeline points={waypoints} setPoints={setWaypoints} duration={settings.exportDuration}
        onDuration={exportDuration => setSettings(s => ({ ...s, exportDuration }))} onSeek={seekCamera} onCapture={captureCamera}
        enabled={waypointMode} onEnabled={setWaypointMode} disabled={isRendering} onStatus={setStatus} />}
      <div className="workspace-status" role="status">{status}</div>
      {browserVisible && <aside className="geographic-panel">
        <FeatureBrowser items={features} setItems={setFeatures} selected={selectedFeature} onSelect={setSelectedFeature}
          onFocus={focusFeature} onLabel={labelFeature} onStatus={setStatus}
          onRoute={item => { customPathCoords.current = item.feature.geometry.coordinates.map(p => [...p]); syncPathLayer(); setStatus('Rota pronta. Anime pathProgress no Studio de 0 a 1.'); }} />
      </aside>}
      {isRendering && (
        <div className="render-overlay">
          <div>
            <div className="render-label">RENDERING</div>
            <div className="render-pct">{status.match(/\d+%/)?.[0] || status}</div>
          </div>
        </div>
      )}

      <div className="side-toggle" onClick={() => setPanelVisible(!panelVisible)} title={panelVisible ? 'Hide' : 'Show'}>
        {panelVisible ? '◀' : '▶'}
      </div>

      <FloatingPanel
        title={`${projectName} → Map`}
        visible={panelVisible}
        onClose={() => setPanelVisible(false)}
        defaultPos={{ x: 20, y: 80 }}
        footerChildren={
          <>
            <div className="prop-row" style={{ gap: '4px' }}>
              <button className="act-btn secondary" onClick={toggleStudio}>Studio</button>
              <button className="act-btn secondary" onClick={syncToTimeline}>Capture</button>
              <button
                className={`act-btn ${liveSync ? 'live-on' : 'live-off'}`}
                onClick={() => setLiveSync(!liveSync)}
                title="Auto-capture map position on every move"
              >
                {liveSync ? '⬤ LIVE' : '○ LIVE'}
              </button>
            </div>

            <div className="prop-row" style={{ marginTop: '4px' }}>
              <label>Export Len (s)</label>
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
          <div className="prop-hint">Use Capture para gravar a vista no Studio.</div>
        </Section>
        <Section title="Workspace" id="ws" collapsed={sec.ws} onToggle={toggleSec}>
          <div className="prop-row"><label>Format</label>
            <select value={settings.resolution} onChange={e => setSettings(s => ({ ...s, resolution: e.target.value }))}>
              <option value="1920x1080">1920×1080</option>
              <option value="1080x1920">1080×1920</option>
              <option value="1080x1080">1080×1080</option>
            </select>
          </div>
          <div className="prop-row"><label>Style</label>
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

        <Section title="Drawing" id="draw" collapsed={sec.draw} onToggle={toggleSec}>
          <div className="prop-row"><label>Color</label>
            <input type="color" value={settings.pathColor} onChange={e => { setSettings(s => ({ ...s, pathColor: e.target.value })); syncPathLayer(); }} />
          </div>
          <div className="prop-row"><label>Width</label>
            <input type="number" min="1" max="20" value={settings.pathWidth} onChange={e => setSettings(s => ({ ...s, pathWidth: e.target.value }))} />
          </div>
          <div className="prop-row" style={{ gap: '4px' }}>
            <button className={`panel-btn ${isDrawing ? 'active' : ''}`} onClick={() => setIsDrawing(!isDrawing)}>
              {isDrawing ? 'LOCK PATH' : 'DRAW PATH'}
            </button>
            <button className="panel-btn" onClick={() => { customPathCoords.current = []; syncPathLayer(); }}>CLEAR</button>
          </div>
        </Section>

        <Section title="Pins" id="pins" collapsed={sec.pins} onToggle={toggleSec}>
          {pins.map(p => (
            <div key={p.id} className="pin-card" style={{ paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="pin-row">
                <input type="color" value={p.color} onChange={e => updatePin(p.id, 'color', e.target.value)} className="color-dot" />
                <input type="text" value={p.text} onChange={e => updatePin(p.id, 'text', e.target.value)} className="pin-text-input" />
                <button className="pin-del" onClick={() => setActivePinId(p.id)} style={{ color: '#bbb' }}>⚙️</button>
                <button className="pin-del" onClick={() => removePin(p.id)}>×</button>
              </div>
            </div>
          ))}
          <div className="prop-row">
            <button className="panel-btn" onClick={addPin}>+ ADD PIN</button>
          </div>
        </Section>
      </FloatingPanel>

      {/* Pin Properties Floating Window */}
      {activePinId && pins.find(p => p.id === activePinId) && (() => {
        const p = pins.find(x => x.id === activePinId);
        return (
          <FloatingPanel
            title={`Properties: ${p.text || 'Pin'}`}
            visible={true}
            onClose={() => setActivePinId(null)}
            defaultPos={{ x: window.innerWidth - 300, y: 80 }}
          >
            <div style={{ padding: '8px 0' }}>
              <div className="prop-row">
                <label>Style</label>
                <select value={p.style} onChange={e => updatePin(p.id, 'style', e.target.value)}>
                  <option value="bubble">Bubble</option>
                  <option value="classic">Pin</option>
                  <option value="square">Square</option>
                  <option value="flag">Flag</option>
                  <option value="dot">Dot</option>
                </select>
              </div>
              <div className="prop-row">
                <label>Pin Scale</label>
                <input type="number" min="0.5" max="3" step="0.1" value={p.scale} onChange={e => updatePin(p.id, 'scale', e.target.value)} />
              </div>
              <div className="prop-hint" style={{ marginTop: '8px', color: '#888' }}>Text Settings</div>
              <div className="prop-row">
                <label>Text Color</label>
                <input type="color" value={p.textColor || '#ffffff'} onChange={e => updatePin(p.id, 'textColor', e.target.value)} />
              </div>
              <div className="prop-row">
                <label>Font</label>
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
                <label>Text Scale</label>
                <input type="number" min="0.5" max="5" step="0.1" value={p.textScale || 1} onChange={e => updatePin(p.id, 'textScale', e.target.value)} />
              </div>
              <div className="prop-row">
                <label>Offset X/Y</label>
                <input type="number" step="1" value={p.textOffsetX || 0} onChange={e => updatePin(p.id, 'textOffsetX', e.target.value)} style={{ width: '40%' }} />
                <input type="number" step="1" value={p.textOffsetY || 0} onChange={e => updatePin(p.id, 'textOffsetY', e.target.value)} style={{ width: '40%' }} />
              </div>
            </div>
          </FloatingPanel>
        );
      })()}

      <div className="map-viewport">
        <div ref={mapWrapper} className="map-container">
          <div ref={mapContainer} className="map-element" />
        </div>
      </div>
    </div>
  );
}

export default App;
