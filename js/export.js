/* Puglia Green Census — Esportazione in formati aperti (GeoJSON, CSV, Shapefile) */
(function (global) {
  'use strict';

  const CRS = global.GC_CONFIG.CRS;
  const PROJ_CRS = global.GC_CONFIG.PROJ_CRS;

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // --- Costruzione FeatureCollection -------------------------------------

  function areaFeature(a) {
    return {
      type: 'Feature',
      geometry: a.geometry || null,
      properties: {
        livello: 1,
        codice: a.codice || '',
        nome: a.nome || '',
        istat: a.istat || '',
        tipo_perimetro: a.tipo_perimetro || '',
        stato_degrado: a.stato_degrado || '',
        area_mq: a.area_mq != null ? Math.round(a.area_mq) : '',
        lungh_m: a.lunghezza_m != null ? Math.round(a.lunghezza_m) : '',
        fascia_m: a.larghezza_fascia != null ? a.larghezza_fascia : '',
        note: a.note || ''
      }
    };
  }

  // Asse dei viali alberati/filari come layer lineare separato.
  function asseFeature(a) {
    return {
      type: 'Feature',
      geometry: a.asse,
      properties: {
        livello: 1,
        codice: a.codice || '',
        nome: a.nome || '',
        tipo: 'asse viale/filare',
        lungh_m: a.lunghezza_m != null ? Math.round(a.lunghezza_m) : '',
        fascia_m: a.larghezza_fascia != null ? a.larghezza_fascia : ''
      }
    };
  }

  function alberoFeature(t) {
    return {
      type: 'Feature',
      geometry: (t.lng != null && t.lat != null)
        ? { type: 'Point', coordinates: [t.lng, t.lat] } : null,
      properties: {
        livello: 2,
        id_pianta: t.codice || '',
        area_cod: t.area_cod || '',
        specie: t.specie || '',
        diam_fusto: t.diametro_fusto != null ? t.diametro_fusto : '',
        altezza: t.altezza != null ? t.altezza : '',
        diam_chioma: t.diametro_chioma != null ? t.diametro_chioma : '',
        fase: t.fase_sviluppo || '',
        mon_albero: t.monumentale_albero ? 'SI' : 'NO',
        mon_ulivo: t.monumentale_ulivo ? 'SI' : 'NO',
        note: t.note || ''
      }
    };
  }

  function elementoFeature(el) {
    return {
      type: 'Feature',
      geometry: el.geometry || null,
      properties: {
        livello: 3,
        codice: el.codice || '',
        area_cod: el.area_cod || '',
        tipo: el.tipo || '',
        ml: el.metri_lineari != null ? el.metri_lineari : '',
        altezza: el.altezza != null ? el.altezza : '',
        larghezza: el.larghezza != null ? el.larghezza : '',
        tipo_siepe: el.tipo_siepe || '',
        irriguo: el.impianto_irriguo ? 'SI' : 'NO',
        tipo_irr: el.tipo_irriguo || '',
        note: el.note || ''
      }
    };
  }

  function featureCollection(features) {
    return {
      type: 'FeatureCollection',
      name: 'puglia_green_census',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:' + CRS.epsg.replace(':', '::') } },
      features: features.filter((f) => f.geometry)
    };
  }

  function buildCollections(data) {
    return {
      aree: featureCollection(data.aree.map(areaFeature)),
      assi: featureCollection(data.aree.filter((a) => a.asse).map(asseFeature)),
      alberi: featureCollection(data.alberi.map(alberoFeature)),
      elementi: featureCollection(data.elementi.map(elementoFeature))
    };
  }

  // --- GeoJSON -----------------------------------------------------------

  function exportGeoJSON(data) {
    const c = buildCollections(data);
    const all = {
      type: 'FeatureCollection',
      name: 'puglia_green_census',
      crs: c.aree.crs,
      features: [].concat(c.aree.features, c.assi.features, c.alberi.features, c.elementi.features)
    };
    download('puglia_green_census.geojson',
      new Blob([JSON.stringify(all, null, 2)], { type: 'application/geo+json' }));
  }

  // --- CSV ---------------------------------------------------------------

  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(';')];
    rows.forEach((r) => lines.push(cols.map((c) => esc(r[c])).join(';')));
    return '﻿' + lines.join('\r\n');
  }

  function centroid(geom) {
    if (!geom) return [null, null];
    if (geom.type === 'Point') return geom.coordinates;
    let coords = [];
    if (geom.type === 'LineString') coords = geom.coordinates;
    else if (geom.type === 'Polygon') coords = geom.coordinates[0];
    if (!coords.length) return [null, null];
    const sum = coords.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
    return [sum[0] / coords.length, sum[1] / coords.length];
  }

  function exportCSV(data) {
    const areeRows = data.aree.map((a) => {
      const c = centroid(a.geometry);
      return {
        codice: a.codice, nome: a.nome, istat: a.istat,
        tipo_perimetro: a.tipo_perimetro, stato_degrado: a.stato_degrado || '',
        area_mq: a.area_mq != null ? Math.round(a.area_mq) : '',
        lunghezza_m: a.lunghezza_m != null ? Math.round(a.lunghezza_m) : '',
        larghezza_fascia_m: a.larghezza_fascia != null ? a.larghezza_fascia : '',
        lon: c[0], lat: c[1], note: a.note || ''
      };
    });
    const alberiRows = data.alberi.map((t) => ({
      id_pianta: t.codice, area_cod: t.area_cod || '', specie: t.specie,
      diam_fusto_cm: t.diametro_fusto != null ? t.diametro_fusto : '',
      altezza_m: t.altezza != null ? t.altezza : '',
      diam_chioma_m: t.diametro_chioma != null ? t.diametro_chioma : '',
      fase_sviluppo: t.fase_sviluppo || '',
      monumentale_albero: t.monumentale_albero ? 'SI' : 'NO',
      monumentale_ulivo: t.monumentale_ulivo ? 'SI' : 'NO',
      lon: t.lng, lat: t.lat, note: t.note || ''
    }));
    const elemRows = data.elementi.map((el) => {
      const c = centroid(el.geometry);
      return {
        codice: el.codice || '', area_cod: el.area_cod || '', tipo: el.tipo,
        metri_lineari: el.metri_lineari != null ? el.metri_lineari : '',
        altezza_m: el.altezza != null ? el.altezza : '',
        larghezza_m: el.larghezza != null ? el.larghezza : '',
        tipo_siepe: el.tipo_siepe || '',
        impianto_irriguo: el.impianto_irriguo ? 'SI' : 'NO',
        tipo_irriguo: el.tipo_irriguo || '',
        lon: c[0], lat: c[1], note: el.note || ''
      };
    });

    if (areeRows.length) download('aree.csv', new Blob([toCSV(areeRows)], { type: 'text/csv' }));
    if (alberiRows.length) download('alberi.csv', new Blob([toCSV(alberiRows)], { type: 'text/csv' }));
    if (elemRows.length) download('elementi.csv', new Blob([toCSV(elemRows)], { type: 'text/csv' }));
  }

  // --- Riproiezione WGS84 (lon/lat) -> EPSG:32633 (UTM 33N, metri) -------

  let _projReady = false;
  function ensureProj() {
    if (_projReady) return true;
    if (typeof proj4 === 'undefined') return false;
    proj4.defs(PROJ_CRS.epsg, PROJ_CRS.proj4);
    _projReady = true;
    return true;
  }

  function projPt(c) {
    const r = proj4('EPSG:4326', PROJ_CRS.epsg, [c[0], c[1]]);
    // arrotondamento al mm: sufficiente e tiene puliti i file
    return [Math.round(r[0] * 1000) / 1000, Math.round(r[1] * 1000) / 1000];
  }

  function reprojGeom(g) {
    if (!g) return g;
    switch (g.type) {
      case 'Point': return { type: 'Point', coordinates: projPt(g.coordinates) };
      case 'LineString': return { type: 'LineString', coordinates: g.coordinates.map(projPt) };
      case 'MultiLineString':
      case 'Polygon': return { type: g.type, coordinates: g.coordinates.map((r) => r.map(projPt)) };
      case 'MultiPolygon': return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map((r) => r.map(projPt))) };
      default: return g;
    }
  }

  // --- Shapefile (via @mapbox/shp-write) riproiettato in EPSG:32633 ------

  async function exportShapefile(data) {
    if (typeof shpwrite === 'undefined' || typeof JSZip === 'undefined' || typeof proj4 === 'undefined') {
      alert('Librerie GIS non ancora disponibili offline. Apri l\'app online una volta, poi riprova.');
      return;
    }
    ensureProj();
    const c = buildCollections(data);
    const feats = [].concat(c.aree.features, c.assi.features, c.alberi.features, c.elementi.features)
      .filter((f) => f.geometry)
      .map((f) => ({ type: 'Feature', properties: f.properties, geometry: reprojGeom(f.geometry) }));
    if (!feats.length) { alert('Nessuna geometria da esportare.'); return; }

    const combined = { type: 'FeatureCollection', features: feats };
    const options = {
      outputType: 'blob',
      folder: 'puglia_green_census',
      types: { point: 'punti', polygon: 'poligoni', polyline: 'linee' }
    };
    try {
      // shp-write scrive un .prj WGS84 fisso: lo sostituiamo con il WKT di EPSG:32633.
      const rawZip = await shpwrite.zip(combined, options);
      const zip = await JSZip.loadAsync(rawZip);
      Object.keys(zip.files).filter((p) => /\.prj$/i.test(p)).forEach((p) => zip.file(p, PROJ_CRS.wkt));
      const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      download('puglia_green_census_EPSG32633.zip', out);
    } catch (e) {
      console.error(e);
      alert('Errore durante la generazione dello Shapefile: ' + e.message);
    }
  }

  global.GC_EXPORT = { exportGeoJSON, exportCSV, exportShapefile, buildCollections };
})(window);
