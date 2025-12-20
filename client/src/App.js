import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import './App.css';

const SVGS = {
  'classic': `<svg viewBox="0 0 24 24" fill="%C" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="1"/></svg>`,
  'bubble': `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="96" height="46" rx="15" fill="%C" stroke="white" stroke-width="3"/><path d="M50 48 L40 60 L60 60 Z" fill="%C" stroke="white" stroke-width="0"/></svg>`,
  'square': `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="4" fill="%C" stroke="white" stroke-width="2"/><path d="M12 22l-4 4h8l-4-4z" fill="%C"/></svg>`,
  'flag': `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 2v20" stroke="#000" stroke-width="2"/><path d="M5 4h14l-4 5 4 5H5" fill="%C" stroke="none"/></svg>`,
  'dot': `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="%C" stroke="white" stroke-width="2"/></svg>`
};

const EASINGS = {
  linear: t => t,
  easeInQuad: t => t*t,
  easeOutQuad: t => t*(2-t),
  easeInOutQuad: t => t<.5 ? 2*t*t : -1+(4-2*t)*t,
  easeInCubic: t => t*t*t,
  easeOutCubic: t => (--t)*t*t+1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeInQuart: t => t*t*t*t,
  easeOutQuart: t => 1-(--t)*t*t*t,
  easeInOutQuart: t => t<.5 ? 8*t*t*t*t : 1-8*(--t)*t*t*t,
  easeInSine: t => 1 - Math.cos(t * Math.PI / 2),
  easeOutSine: t => Math.sin(t * Math.PI / 2),
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
};

const CollapsibleSection = ({ title, id, isCollapsed, onToggle, children }) => {
  return (
    <div>
      <div className="section-title collapsible-header" onClick={() => onToggle(id)}>
        <span>{isCollapsed ? '▶' : '▼'}</span> {title}
      </div>
      {!isCollapsed && (
        <div className="collapsible-content">
          {children}
        </div>
      )}
    </div>
  );
};

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const mapWrapper = useRef(null); // Para html2canvas
  
  // State
  const [waypoints, setWaypoints] = useState([]);
  const [pins, setPins] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [aeData, setAeData] = useState([]);
  const [isRendering, setIsRendering] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [settings, setSettings] = useState({
    resolution: '1920x1080',
    mapStyle: 'https://tiles.openfreemap.org/styles/bright',
    pathColor: '#F72210',
    pathWidth: 5,
    pathStyle: 'dashed',
    duration: 3,
    fps: 30,
    easing: 'easeInOutCubic',
    lineAnimDelay: 0,
    lineAnimDuration: 3,
    lineEasing: 'linear'
  });

  const toggleCollapsed = (id) => {
    setCollapsed(prev => ({...prev, [id]: !prev[id]}));
  };

  // Refs para dados mutáveis acessados em callbacks do mapa
  const customPathCoords = useRef([]);
  const pinsRef = useRef([]); // Mantém referência atualizada dos pins para manipulação direta
  const isDrawingRef = useRef(isDrawing); // Ref para acesso atualizado dentro do listener
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

  // Inicialização do Mapa
  useEffect(() => {
    if (map.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: settings.mapStyle,
      center: [-46.633, -23.550],
      zoom: 12,
      preserveDrawingBuffer: true,
      antialias: true,
      attributionControl: false
    });

    map.current.on('load', () => {
      setupLayers();
      updateViewport();
    });

    map.current.on('click', (e) => {
      if (isDrawingRef.current) {
        customPathCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
        syncPathLayer();
      }
    });
  }, []); // Executa apenas uma vez

  // Efeito para atualizar viewport quando resolução muda
  useEffect(() => {
    const handleResize = () => updateViewport();
    window.addEventListener('resize', handleResize);
    updateViewport();
    return () => window.removeEventListener('resize', handleResize);
  }, [settings.resolution]);

  // Efeito para atualizar estilo do mapa
  useEffect(() => {
    if (!map.current) return;
    map.current.setStyle(settings.mapStyle);
    map.current.once('styledata', setupLayers);
  }, [settings.mapStyle]);

  // Efeito para atualizar estilo da linha dinamicamente
  useEffect(() => {
    if (map.current && map.current.getLayer('route-line')) {
      map.current.setPaintProperty('route-line', 'line-color', settings.pathColor);
      map.current.setPaintProperty('route-line', 'line-width', parseFloat(settings.pathWidth));
      map.current.setPaintProperty('route-line', 'line-dasharray', 
        settings.pathStyle === 'dashed' ? [2, 2] : 
        settings.pathStyle === 'dotted' ? [0.1, 2] : [1, 0]
      );
    }
  }, [settings.pathColor, settings.pathWidth, settings.pathStyle]);

  const setupLayers = () => {
    if (!map.current) return;
    const style = map.current.getStyle();
    if (style && style.layers) {
      style.layers.forEach(l => {
        if (l.type === 'symbol' && !l.id.includes('pins')) map.current.setLayoutProperty(l.id, 'visibility', 'none');
      });
    }
    if (!map.current.getSource('route-source')) {
      map.current.addSource('route-source', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-source',
        paint: { 
          'line-color': settings.pathColor, 
          'line-width': parseFloat(settings.pathWidth), 
          'line-dasharray': settings.pathStyle === 'dashed' ? [2, 2] : settings.pathStyle === 'dotted' ? [0.1, 2] : [1, 0]
        }
      });
    }
    syncPathLayer();
  };

  const syncPathLayer = (coords = customPathCoords.current) => {
    if (map.current && map.current.getSource('route-source')) {
      map.current.setPaintProperty('route-line', 'line-color', settings.pathColor);
      map.current.getSource('route-source').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
    }
  };

  const updateViewport = () => {
    if (!mapWrapper.current || !mapContainer.current) return;
    const [w, h] = settings.resolution.split('x').map(Number);
    mapWrapper.current.style.width = w + 'px';
    mapWrapper.current.style.height = h + 'px';
    
    // Calcular Scale para caber na tela
    const vp = mapWrapper.current.parentElement;
    const scale = Math.min((vp.clientWidth - 40) / w, (vp.clientHeight - 40) / h);
    mapWrapper.current.style.transform = `scale(${scale})`;
    requestAnimationFrame(() => {
      if (map.current) map.current.resize();
    });
  };

  const importInputRef = useRef(null);

  const handleSave = () => {
    const cleanPins = pins.map(p => {
      const { marker, ...rest } = p;
      return rest;
    });

    const dataToSave = {
      settings,
      waypoints,
      pins: cleanPins,
      customPath: customPathCoords.current,
    };

    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `map-anim-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleLoad = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        
        // Clear existing markers and refs before loading new data
        pinsRef.current.forEach(p => p.marker?.remove());
        pinsRef.current = [];
        
        setSettings(data.settings);
        setWaypoints(data.waypoints || []);
        customPathCoords.current = data.customPath || [];

        // Set pins state first
        setPins(data.pins || []);

        // Re-create markers for loaded pins
        for (const pin of (data.pins || [])) {
          await createPinMarker(pin);
          pinsRef.current.push(pin);
        }

        // Update map view and layers
        if (map.current) {
          map.current.setStyle(data.settings.mapStyle); // This will trigger resync via 'styledata'
          syncPathLayer();
        }

      } catch (err) {
        alert('Failed to load or parse project file.');
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset file input
  };

  // --- Lógica de Pins ---

  // Efeito para recriar os pins quando o estilo do mapa é alterado, pois a troca de estilo limpa os marcadores.
  useEffect(() => {
    if (!map.current) return;

    const resyncPins = async () => {
      // Itera sobre a referência dos pins e recria cada um no mapa.
      for (const pin of pinsRef.current) {
        await createPinMarker(pin);
      }
    };

    map.current.on('styledata', resyncPins);

    return () => {
      if (map.current) {
        map.current.off('styledata', resyncPins);
      }
    };
  }, []); // Registra o listener uma única vez após a montagem do mapa.

  const createPinCanvas = async (pin) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const baseWidth = (pin.style === 'bubble') ? 100 : 50;
    const baseHeight = 50;
    const scale = pin.scale || 1.0;
    const dpr = window.devicePixelRatio || 1;

    const canvasWidth = baseWidth * scale * dpr;
    const canvasHeight = baseHeight * scale * dpr;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = `${baseWidth * scale}px`;
    canvas.style.height = `${baseHeight * scale}px`;

    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent((SVGS[pin.style] || SVGS.classic).replace(/%C/g, pin.color));
    
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
    
    if (pin.text) {
      const textScale = pin.textScale || 1.0;
      const fontSize = 12 * scale * textScale * dpr;
      ctx.font = `800 ${fontSize}px sans-serif`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 2 * dpr;
      ctx.shadowOffsetX = 1 * dpr;
      ctx.shadowOffsetY = 1 * dpr;
      
      const textX = (canvasWidth / 2) + ((pin.textOffsetX || 0) * scale * dpr);
      const textY = (canvasHeight / 2) + ((pin.textOffsetY || 0) * scale * dpr);

      ctx.fillText(pin.text, textX, textY);
    }
    
    return canvas;
  }

  const addPin = async () => {
    const center = map.current.getCenter();
    const newPin = {
      id: Date.now(),
      lng: center.lng, lat: center.lat,
      text: "Label", color: "#F72210", scale: 1.0, textScale: 1.0,
      style: 'bubble', textOffsetX: 0, textOffsetY: 0,
      marker: null
    };
    
    await createPinMarker(newPin);
    setPins(prev => [...prev, newPin]);
    pinsRef.current.push(newPin);
  };

  const createPinMarker = async (pin) => {
    const oldMarker = pin.marker;

    if (oldMarker) {
      oldMarker.getElement().style.visibility = 'hidden';
    }

    const pinElement = await createPinCanvas(pin);
    pinElement.style.cursor = 'move';

    const marker = new maplibregl.Marker({
      element: pinElement,
      draggable: true,
      anchor: (pin.style === 'dot') ? 'center' : 'bottom'
    })
    .setLngLat([pin.lng, pin.lat])
    .addTo(map.current);

    marker.on('dragend', () => {
      const l = marker.getLngLat();
      pin.lng = l.lng;
      pin.lat = l.lat;
      setPins(prev => prev.map(p => p.id === pin.id ? { ...p, lng: l.lng, lat: l.lat } : p));
    });

    pin.marker = marker;

    if (oldMarker) {
      oldMarker.remove();
    }
  };

  const updatePin = async (id, field, value) => {
    const val = ['scale', 'textScale', 'textOffsetX', 'textOffsetY'].includes(field) ? parseFloat(value) : value;
    
    const pinIdx = pinsRef.current.findIndex(p => p.id === id);
    if (pinIdx !== -1) {
      const p = pinsRef.current[pinIdx];
      p[field] = val;
      await createPinMarker(p);
      
      setPins(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
    }
  };

  const removePin = (id) => {
    const p = pinsRef.current.find(x => x.id === id);
    if (p && p.marker) p.marker.remove();
    pinsRef.current = pinsRef.current.filter(x => x.id !== id);
    setPins(prev => prev.filter(x => x.id !== id));
  };

  // --- Lógica de Waypoints ---
  const addWaypoint = () => {
    const c = map.current.getCenter();
    const w = {
      id: Date.now(),
      lat: c.lat, lng: c.lng,
      zoom: map.current.getZoom(),
      pitch: map.current.getPitch(),
      bearing: map.current.getBearing()
    };
    setWaypoints([...waypoints, w]);
  };

  const updateWaypoint = (id) => {
    const c = map.current.getCenter();
    setWaypoints(waypoints.map(w => w.id === id ? {
      ...w, lat: c.lat, lng: c.lng, zoom: map.current.getZoom(), pitch: map.current.getPitch(), bearing: map.current.getBearing()
    } : w));
  };

  const exportPNG = async (id) => {
    const w = waypoints.find(x => x.id === id);
    if (!w || !map.current) return;
    
    map.current.jumpTo({
      center: [w.lng, w.lat],
      zoom: w.zoom,
      pitch: w.pitch,
      bearing: w.bearing
    });

    await new Promise(r => map.current.once('idle', r));

    // Utiliza html2canvas para capturar o container, que inclui os pins em HTML.
    const canvas = await html2canvas(mapWrapper.current, { useCORS: true, scale: 1, allowTaint: true, logging: false, backgroundColor: null });
    
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `waypoint_${id}.png`;
    a.click();
  };

  const distance = (p1, p2) => Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));

  const getInterpolatedPath = (coords, progress) => {
    if (coords.length < 2 || progress <= 0) return [];
    if (progress >= 1) return coords;

    const totalLength = coords.reduce((length, point, i) => {
      if (i === 0) return 0;
      return length + distance(coords[i - 1], point);
    }, 0);

    const targetLength = totalLength * progress;
    let accumulatedLength = 0;
    const newPath = [];

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const segmentLength = distance(p1, p2);

      newPath.push(p1);

      if (accumulatedLength + segmentLength >= targetLength) {
        const remainingLength = targetLength - accumulatedLength;
        const ratio = remainingLength / segmentLength;
        const interpolatedPoint = [
          p1[0] + (p2[0] - p1[0]) * ratio,
          p1[1] + (p2[1] - p1[1]) * ratio,
        ];
        newPath.push(interpolatedPoint);
        return newPath;
      }
      accumulatedLength += segmentLength;
    }
    return newPath;
  };

  // --- Renderização (Zip) ---
  const generateZip = async () => {
    if (waypoints.length < 2) { alert("Min 2 Waypoints"); return; }
    
    setIsRendering(true);
    setStatus("Initializing...");

    try {
      const zip = new JSZip();
      const framesPerLeg = Math.ceil(settings.duration * settings.fps);
      const totalFrames = framesPerLeg * (waypoints.length - 1);
      const easingFunc = EASINGS[settings.easing];
      const lineEasingFunc = EASINGS[settings.lineEasing] || EASINGS.linear;
      let totalIdx = 0;
      let collectedAeData = [];

      for (let p = 0; p < waypoints.length - 1; p++) {
        const A = waypoints[p];
        const B = waypoints[p + 1];

        for (let i = 0; i < framesPerLeg; i++) {
          const t = i / framesPerLeg;
          const easedT = easingFunc(t);
          
          map.current.jumpTo({
            center: [A.lng + (B.lng - A.lng) * easedT, A.lat + (B.lat - A.lat) * easedT],
            zoom: A.zoom + (B.zoom - A.zoom) * easedT,
            pitch: A.pitch + (B.pitch - A.pitch) * easedT,
            bearing: A.bearing + (B.bearing - A.bearing) * easedT
          });

          // Atualizar linha
          const currentTime = totalIdx / settings.fps;
          let lineProgress = 0;
          const lDelay = settings.lineAnimDelay || 0;
          const lDur = settings.lineAnimDuration || 0.1;

          if (currentTime > lDelay) {
              lineProgress = Math.min(1, (currentTime - lDelay) / lDur);
              lineProgress = lineEasingFunc(lineProgress);
          }

          if (customPathCoords.current.length > 1) {
              syncPathLayer(getInterpolatedPath(customPathCoords.current, lineProgress));
          }

          await new Promise(r => map.current.once('idle', r));

          // AE Data
          const c = map.current.getCenter();
          const wpProjections = waypoints.map(wp => {
              const px = map.current.project([wp.lng, wp.lat]);
              return { id: wp.id, x: px.x, y: px.y };
          });

          const pinProjections = pinsRef.current.map(pin => {
            const px = map.current.project([pin.lng, pin.lat]);
            return { id: pin.id, text: pin.text, x: px.x, y: px.y };
          });

          collectedAeData.push({
              time: totalIdx / settings.fps,
              zoom: map.current.getZoom(),
              bearing: map.current.getBearing(),
              pitch: map.current.getPitch(),
              center: [c.lng, c.lat],
              waypoints: wpProjections,
              pins: pinProjections
          });

          // Capture
          map.current.triggerRepaint();
          await new Promise(r => setTimeout(r, 50)); // Pequeno delay para garantir sync do DOM
          const canvas = await html2canvas(mapWrapper.current, { useCORS: true, scale: 1, allowTaint: true, logging: false, backgroundColor: null });
          zip.file(`frame_${totalIdx.toString().padStart(5, '0')}.png`, canvas.toDataURL('image/png').split(',')[1], { base64: true });

          totalIdx++;
          setStatus(`Rendering: ${Math.round((totalIdx / totalFrames) * 100)}%`);
        }
      }

      setAeData(collectedAeData);
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = "anim.zip";
      a.click();
    } finally {
      setIsRendering(false);
      setStatus("Ready.");
      syncPathLayer(); // Reset path
    }
  };

  const downloadAEScript = () => {
    if (!aeData || aeData.length === 0) return;
    const [w, h] = settings.resolution.split('x').map(Number);
    const duration = aeData[aeData.length - 1].time;

    const waypointLayers = waypoints.map((wp, i) => `
        var wp_${wp.id} = comp.layers.addNull();
        wp_${wp.id}.name = "Tracker WP ${i + 1}";
        wp_${wp.id}.label = 10;
        wpNulls[${wp.id}] = wp_${wp.id};
    `).join('');

    const pinLayers = pins.map(p => {
        const safeName = p.text ? p.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '') : '';
        return `
        var pin_${p.id} = comp.layers.addNull();
        pin_${p.id}.name = "Pin ${safeName}";
        pin_${p.id}.label = 9;
        pinNulls[${p.id}] = pin_${p.id};
    `}).join('');

    const keyframes = aeData.map(d => {
        const wpKeyframes = d.waypoints.map(wp =>
            `if (wpNulls[${wp.id}]) { wpNulls[${wp.id}].transform.position.setValueAtTime(${d.time}, [${wp.x}, ${wp.y}]); }`
        ).join('\n            ');
        const pinKeyframes = (d.pins || []).map(p =>
            `if (pinNulls[${p.id}]) { pinNulls[${p.id}].transform.position.setValueAtTime(${d.time}, [${p.x}, ${p.y}]); }`
        ).join('\n            ');

        return `
            sZoom.property("Slider").setValueAtTime(${d.time}, ${d.zoom});
            sBear.property("Slider").setValueAtTime(${d.time}, ${d.bearing});
            sPitch.property("Slider").setValueAtTime(${d.time}, ${d.pitch});
            ${wpKeyframes}
            ${pinKeyframes}
        `
    }).join('');

    let script = `
    (function() {
        app.beginUndoGroup("Import Map Data");
        var comp = app.project.items.addComp("Map Animation", ${w}, ${h}, 1, ${duration + 1}, ${settings.fps});
        if (!comp) {
            alert("Failed to create composition.");
            return;
        }
        var camNull = comp.layers.addNull();
        camNull.name = "Map Camera Control";
        var sZoom = camNull.Effects.addProperty("ADBE Slider Control");
        sZoom.name = "Map Zoom";
        var sBear = camNull.Effects.addProperty("ADBE Slider Control");
        sBear.name = "Map Bearing";
        var sPitch = camNull.Effects.addProperty("ADBE Slider Control");
        sPitch.name = "Map Pitch";
        
        var wpNulls = {};
        ${waypointLayers}
        
        var pinNulls = {};
        ${pinLayers}

        try {
            ${keyframes}
        } catch(e) {
            alert("Error setting keyframes on line " + e.line.toString() + ": " + e.toString());
        }

        app.endUndoGroup();
        alert("Map Data Imported!");
    })();`;

    const blob = new Blob([script], {type: 'text/javascript'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = "import_map_ae.jsx"; a.click();
  };

  return (
    <div className="app-container">
      {isRendering && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
              background: '#222',
              color: 'white',
              padding: '25px 50px',
              borderRadius: '15px',
              textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
              <h2 style={{margin: 0, marginBottom: '15px'}}>Rendering...</h2>
              <div style={{fontSize: '1.8em', fontWeight: 'bold', color: '#10b981'}}>{status.split(':')[1]}</div>
          </div>
        </div>
      )}
      <div className="sidebar">
        <h2 style={{ margin: '0 0 10px 0' }}>Map Animator PRO (React)</h2>
        <div className="flex-row">
          <button onClick={handleSave} style={{background: '#4b5563'}}>Save Project</button>
          <button onClick={() => importInputRef.current?.click()} style={{background: '#4b5563'}}>Import Project</button>
          <input type="file" accept=".json" style={{display: 'none'}} ref={importInputRef} onChange={handleLoad} />
        </div>
        
        <CollapsibleSection title="Canvas Settings" id="canvasSettings" isCollapsed={collapsed['canvasSettings']} onToggle={toggleCollapsed}>
          <label>Output Resolution</label>
          <select value={settings.resolution} onChange={e => setSettings({...settings, resolution: e.target.value})}>
              <option value="1920x1080">Full HD (16:9)</option>
              <option value="1080x1920">Vertical (9:16)</option>
          </select>

          {/* ... Resto dos controles mapeados para o state 'settings' ... */}
          <label>Map Theme</label>
          <select value={settings.mapStyle} onChange={e => setSettings({...settings, mapStyle: e.target.value})}>
              <option value="https://tiles.openfreemap.org/styles/bright">Bright</option>
              <option value="https://tiles.openfreemap.org/styles/liberty">Liberty</option>
              <option value="https://tiles.openfreemap.org/styles/positron">Positron</option>
              <option value="https://tiles.openfreemap.org/styles/dark">Dark Matter</option>
          </select>
        </CollapsibleSection>

        <CollapsibleSection title="Path Tools" id="pathTools" isCollapsed={collapsed['pathTools']} onToggle={toggleCollapsed}>
          <div className="flex-row">
              <button onClick={() => setIsDrawing(!isDrawing)} style={{ background: isDrawing ? '#10b981' : '#4b5563' }}>
                  {isDrawing ? 'Stop Drawing' : 'Draw Mode'}
              </button>
              <button onClick={() => { customPathCoords.current = []; syncPathLayer(); }} style={{ background: '#991b1b' }}>Clear</button>
          </div>

          <label style={{marginTop:'10px'}}>Line Style</label>
          <div className="flex-row">
              <input type="color" value={settings.pathColor} onChange={e => setSettings({...settings, pathColor: e.target.value})} style={{height: '38px', width:'40px', padding:'2px'}} />
              <input type="number" min="1" max="20" value={settings.pathWidth} onChange={e => setSettings({...settings, pathWidth: e.target.value})} style={{width:'50px'}} title="Width" />
              <select value={settings.pathStyle} onChange={e => setSettings({...settings, pathStyle: e.target.value})} style={{flex:1}}>
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
              </select>
          </div>

          <label style={{marginTop:'10px'}}>Line Animation (Delay / Duration)</label>
          <div className="flex-row">
              <input type="number" placeholder="Start (s)" value={settings.lineAnimDelay} onChange={e => setSettings({...settings, lineAnimDelay: parseFloat(e.target.value)})} />
              <input type="number" placeholder="Dur (s)" value={settings.lineAnimDuration} onChange={e => setSettings({...settings, lineAnimDuration: parseFloat(e.target.value)})} />
          </div>
          <select value={settings.lineEasing} onChange={e => setSettings({...settings, lineEasing: e.target.value})} style={{marginBottom:'5px'}}>
              {Object.keys(EASINGS).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </CollapsibleSection>

        <CollapsibleSection title="Animation Settings" id="animationSettings" isCollapsed={collapsed['animationSettings']} onToggle={toggleCollapsed}>
          <div className="flex-row">
              <div style={{flex:1}}><label>Secs/Leg</label><input type="number" value={settings.duration} onChange={e => setSettings({...settings, duration: parseFloat(e.target.value)})} /></div>
              <div style={{flex:1}}><label>FPS</label><input type="number" value={settings.fps} onChange={e => setSettings({...settings, fps: parseInt(e.target.value)})} /></div>
          </div>
          <label>Easing</label>
          <select value={settings.easing} onChange={e => setSettings({...settings, easing: e.target.value})}>
              {Object.keys(EASINGS).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </CollapsibleSection>

        <CollapsibleSection title="Camera Path" id="cameraPath" isCollapsed={collapsed['cameraPath']} onToggle={toggleCollapsed}>
          {waypoints.map((w, i) => {
            const id = `waypoint_${w.id}`;
            return (
              <CollapsibleSection key={w.id} title={`Waypoint ${i + 1}`} id={id} isCollapsed={collapsed[id]} onToggle={toggleCollapsed}>
                <div className="card" style={{border: 'none', padding: '10px 0 0 0', margin: 0}}>
                    <div className="waypoint-controls">
                        <button onClick={() => updateWaypoint(w.id)}>Update</button>
                        <button onClick={() => exportPNG(w.id)}>PNG</button>
                        <button className="btn-remove" onClick={() => setWaypoints(waypoints.filter(x => x.id !== w.id))}>×</button>
                    </div>
                </div>
              </CollapsibleSection>
            )
          })}
          <button onClick={addWaypoint}>+ Add Waypoint</button>
        </CollapsibleSection>

        <CollapsibleSection title="Draggable Pins" id="draggablePins" isCollapsed={collapsed['draggablePins']} onToggle={toggleCollapsed}>
          {pins.map(p => {
            const id = `pin_${p.id}`;
            return (
              <div key={p.id} className="card">
                  <button className="btn-remove" onClick={() => removePin(p.id)}>×</button>
                  <CollapsibleSection title={p.text || "Pin"} id={id} isCollapsed={collapsed[id]} onToggle={toggleCollapsed}>
                    <input type="text" value={p.text} onChange={e => updatePin(p.id, 'text', e.target.value)} placeholder="Pin Label"/>
                    <label>Scale: {p.scale}</label>
                    <input type="range" min="0.5" max="3.0" step="0.1" value={p.scale} onChange={e => updatePin(p.id, 'scale', e.target.value)} />
                    
                    <label>Text Size: {p.textScale || 1.0}</label>
                    <input type="range" min="0.5" max="3.0" step="0.1" value={p.textScale || 1.0} onChange={e => updatePin(p.id, 'textScale', e.target.value)} />

                    <div className="flex-row">
                        <div style={{flex:1}}><label>Text X</label><input type="number" value={p.textOffsetX || 0} onChange={e => updatePin(p.id, 'textOffsetX', e.target.value)} /></div>
                        <div style={{flex:1}}><label>Text Y</label><input type="number" value={p.textOffsetY || 0} onChange={e => updatePin(p.id, 'textOffsetY', e.target.value)} /></div>
                    </div>

                    <div className="flex-row" style={{marginTop: '5px'}}>
                        <select value={p.style} onChange={e => updatePin(p.id, 'style', e.target.value)} style={{flex:2}}>
                            <option value="classic">Classic</option>
                            <option value="bubble">Bubble</option>
                            <option value="square">Square</option>
                            <option value="flag">Flag</option>
                            <option value="dot">Dot</option>
                        </select>
                        <input type="color" value={p.color} onChange={e => updatePin(p.id, 'color', e.target.value)} style={{flex:1, height:'32px', padding:'2px'}} />
                    </div>
                  </CollapsibleSection>
              </div>
            )
          })}
          <button style={{ background: '#F72210' }} onClick={addPin}>+ Add Pin</button>
        </CollapsibleSection>

        <button style={{ background: '#10b981', marginTop: '15px', padding: '12px' }} onClick={generateZip}>
            RENDER SEQUENCE (ZIP)
        </button>
        {aeData && aeData.length > 0 && (
            <button style={{ background: '#8b5cf6', marginTop: '5px', padding: '12px' }} onClick={downloadAEScript}>
                DOWNLOAD AE SCRIPT
            </button>
        )}
        <div className="status-text">{status}</div>
      </div>

      <div className="map-viewport">
        <div id="map-container" className={`map-container ${isDrawing ? 'cursor-draw' : ''}`} ref={mapWrapper}>
            <div ref={mapContainer} className="map-element" />
        </div>
      </div>
    </div>
  );
}

export default App;
