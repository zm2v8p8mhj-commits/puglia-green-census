/* Puglia Green Census — Esportazione in formati aperti (GeoJSON, CSV, Shapefile) */
(function (global) {
  'use strict';

  const CRS = global.GC_CONFIG.CRS;

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

  // --- Shapefile (via @mapbox/shp-write, output zip) ---------------------

  function exportShapefile(data) {
    if (typeof shpwrite === 'undefined') {
      alert('Libreria Shapefile non disponibile offline. Riprova quando sei online almeno una volta.');
      return;
    }
    const c = buildCollections(data);
    const groups = [
      { fc: c.aree, name: 'aree', types: { polygon: 'aree_poligoni' } },
      { fc: c.alberi, name: 'alberi', types: { point: 'alberi_punti' } },
      { fc: c.elementi, name: 'elementi', types: { point: 'elementi_punti', polyline: 'elementi_linee', polygon: 'elementi_poligoni' } }
    ];
    // shp-write separa automaticamente per tipo di geometria nello stesso zip.
    const combined = {
      type: 'FeatureCollection',
      features: [].concat(c.aree.features, c.assi.features, c.alberi.features, c.elementi.features)
    };
    if (!combined.features.length) {
      alert('Nessuna geometria da esportare.');
      return;
    }
    const options = {
      folder: 'puglia_green_census',
      types: {
        point: 'punti', polygon: 'poligoni', polyline: 'linee'
      }
    };
    try {
      shpwrite.download(combined, options);
    } catch (e) {
      console.error(e);
      alert('Errore durante la generazione dello Shapefile: ' + e.message);
    }
  }

  global.GC_EXPORT = { exportGeoJSON, exportCSV, exportShapefile, buildCollections };
})(window);
