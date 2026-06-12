/* Puglia Green Census — Mappa Leaflet e strumenti di disegno georeferenziato */
(function (global) {
  'use strict';

  let map = null;
  let layerAree = null;
  let layerAlberi = null;
  let layerElementi = null;
  let locMarker = null;
  let accuracyCircle = null;
  let drawHandler = null;
  let lastPosition = null;

  const STILE_AREA = { color: '#1b7f3b', weight: 2, fillColor: '#3fb564', fillOpacity: 0.18 };
  const STILE_AREA_FITTIZIO = { color: '#1b7f3b', weight: 2, dashArray: '6 5', fillOpacity: 0.05 };

  function init(elId) {
    map = L.map(elId, { zoomControl: true }).setView([41.0, 16.5], 9); // Puglia

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22, maxNativeZoom: 19,
      attribution: '© OpenStreetMap'
    });
    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 22, maxNativeZoom: 19, attribution: 'Esri World Imagery' });

    osm.addTo(map);
    L.control.layers({ 'Mappa OSM': osm, 'Ortofoto satellite': sat }, null,
      { position: 'topright' }).addTo(map);

    layerAree = L.geoJSON(null).addTo(map);
    layerElementi = L.layerGroup().addTo(map);
    layerAlberi = L.layerGroup().addTo(map);

    startLocate();
    return map;
  }

  function getMap() { return map; }

  // Da chiamare quando il contenitore della mappa diventa visibile o cambia
  // dimensione: Leaflet inizializzato in un div nascosto resta a 0×0 e non
  // scarica le tile finché non si ricalcola la dimensione.
  function invalidate() {
    if (!map) return;
    setTimeout(() => map.invalidateSize(), 60);
  }

  // --- Geolocalizzazione continua ---------------------------------------

  function startLocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((pos) => {
      lastPosition = pos;
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!locMarker) {
        locMarker = L.circleMarker(ll, {
          radius: 7, color: '#fff', weight: 2, fillColor: '#1565c0', fillOpacity: 1
        }).addTo(map);
        accuracyCircle = L.circle(ll, { radius: pos.coords.accuracy, color: '#1565c0', weight: 1, fillOpacity: 0.06 }).addTo(map);
      } else {
        locMarker.setLatLng(ll);
        accuracyCircle.setLatLng(ll).setRadius(pos.coords.accuracy);
      }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  }

  function currentPosition() {
    if (!lastPosition) return null;
    return {
      lat: lastPosition.coords.latitude,
      lng: lastPosition.coords.longitude,
      accuracy: lastPosition.coords.accuracy
    };
  }

  function panToCurrent() {
    const p = currentPosition();
    if (p) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 18));
    else alert('Posizione GPS non ancora disponibile.');
  }

  // --- Disegno ----------------------------------------------------------

  function cancelDraw() {
    if (drawHandler) { drawHandler.disable(); drawHandler = null; }
    map.off(L.Draw.Event.CREATED);
  }

  // type: 'polygon' | 'line' | 'point'
  function startDraw(type, onDone) {
    cancelDraw();
    const opts = { shapeOptions: { color: '#e65100', weight: 3 } };
    if (type === 'polygon') drawHandler = new L.Draw.Polygon(map, { shapeOptions: { color: '#1b7f3b', weight: 3 }, allowIntersection: false });
    else if (type === 'line') drawHandler = new L.Draw.Polyline(map, opts);
    else drawHandler = new L.Draw.Marker(map);

    map.on(L.Draw.Event.CREATED, (e) => {
      const gj = e.layer.toGeoJSON();
      cancelDraw();
      onDone(gj.geometry, e.layer);
    });
    drawHandler.enable();
  }

  // Posiziona un punto sulla posizione GPS corrente, senza disegno manuale.
  function placeAtGPS(onDone) {
    const p = currentPosition();
    if (!p) { alert('Posizione GPS non disponibile. Disegna il punto manualmente.'); return false; }
    onDone({ type: 'Point', coordinates: [p.lng, p.lat] }, null);
    return true;
  }

  function geodesicArea(geometry) {
    if (!geometry || geometry.type !== 'Polygon') return null;
    const latlngs = geometry.coordinates[0].map((c) => L.latLng(c[1], c[0]));
    return L.GeometryUtil.geodesicArea(latlngs);
  }

  function lineLength(geometry) {
    if (!geometry || geometry.type !== 'LineString') return null;
    let tot = 0;
    const cs = geometry.coordinates;
    for (let i = 1; i < cs.length; i++) {
      tot += L.latLng(cs[i - 1][1], cs[i - 1][0]).distanceTo(L.latLng(cs[i][1], cs[i][0]));
    }
    return tot;
  }

  // --- Rendering dei dati -----------------------------------------------

  function clearData() {
    layerAree.clearLayers();
    layerAlberi.clearLayers();
    layerElementi.clearLayers();
  }

  function renderAree(aree, onClick) {
    layerAree.clearLayers();
    aree.forEach((a) => {
      if (!a.geometry) return;
      const stile = a.tipo_perimetro === 'fittizio' ? STILE_AREA_FITTIZIO : STILE_AREA;
      const lyr = L.geoJSON(a.geometry, { style: stile });
      lyr.bindTooltip((a.codice || '') + ' · ' + (a.nome || ''), { sticky: true });
      lyr.on('click', () => onClick && onClick(a));
      layerAree.addLayer(lyr);
    });
  }

  function renderAlberi(alberi, onClick) {
    layerAlberi.clearLayers();
    alberi.forEach((t) => {
      if (t.lat == null || t.lng == null) return;
      const mon = t.monumentale_albero || t.monumentale_ulivo;
      const m = L.circleMarker([t.lat, t.lng], {
        radius: mon ? 8 : 6,
        color: mon ? '#b8860b' : '#0b6e2e',
        weight: mon ? 3 : 1.5,
        fillColor: '#2e9e54', fillOpacity: 0.9
      });
      m.bindTooltip((t.codice || '') + ' · ' + (t.specie || ''), { direction: 'top' });
      m.on('click', () => onClick && onClick(t));
      layerAlberi.addLayer(m);
    });
  }

  function renderElementi(elementi, onClick) {
    layerElementi.clearLayers();
    elementi.forEach((el) => {
      if (!el.geometry) return;
      const lyr = L.geoJSON(el.geometry, {
        style: { color: '#7b1fa2', weight: 3, fillColor: '#ce93d8', fillOpacity: 0.3 },
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 5, color: '#7b1fa2', weight: 1.5, fillColor: '#ce93d8', fillOpacity: 0.9
        })
      });
      lyr.bindTooltip((el.tipo || 'Elemento') + (el.codice ? ' · ' + el.codice : ''), { sticky: true });
      lyr.on('click', () => onClick && onClick(el));
      layerElementi.addLayer(lyr);
    });
  }

  function fitToData(aree, alberi, elementi) {
    const group = L.featureGroup([layerAree, layerAlberi, layerElementi]);
    try {
      const b = group.getBounds();
      if (b.isValid()) map.fitBounds(b.pad(0.2));
    } catch (e) { /* nessun dato */ }
  }

  global.GC_MAP = {
    init, getMap, invalidate, startDraw, cancelDraw, placeAtGPS, panToCurrent,
    currentPosition, geodesicArea, lineLength,
    renderAree, renderAlberi, renderElementi, clearData, fitToData
  };
})(window);
