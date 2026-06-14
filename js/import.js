/* Puglia Green Census — Import di dati da QGIS (GeoJSON o Shapefile .zip)
 * Pensato per il round-trip: i file esportati dall'app hanno la proprietà
 * `livello` e i campi noti, quindi i record vengono ricostruiti in modo
 * affidabile. Tollerante ai nomi DBF troncati a 10 caratteri e alle
 * coordinate proiettate (riproiezione UTM 33N -> WGS84). */
(function (global) {
  'use strict';

  const CFG = global.GC_CONFIG;
  const PROJ = CFG.PROJ_CRS;

  // --- utilità ----------------------------------------------------------

  function pick(props, names) {
    for (const n of names) {
      if (props[n] !== undefined && props[n] !== null && props[n] !== '') return props[n];
    }
    return '';
  }
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
  const yes = (v) => String(v).trim().toUpperCase() === 'SI' || v === true || v === 1;

  function toFeatures(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj.reduce((a, o) => a.concat(toFeatures(o)), []);
    if (obj.type === 'FeatureCollection') return obj.features || [];
    if (obj.type === 'Feature') return [obj];
    return [];
  }

  // --- riproiezione UTM 33N -> WGS84 (se le coordinate sono in metri) -----

  let _projReady = false;
  function ensureProj() {
    if (_projReady || typeof proj4 === 'undefined') return;
    proj4.defs(PROJ.epsg, PROJ.proj4);
    _projReady = true;
  }
  function firstCoord(g) {
    let c = g && g.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    return Array.isArray(c) ? c : null;
  }
  function invPt(c) {
    const r = proj4(PROJ.epsg, 'EPSG:4326', [c[0], c[1]]);
    return [r[0], r[1]];
  }
  function mapCoords(c) {
    return (Array.isArray(c[0])) ? c.map(mapCoords) : invPt(c);
  }
  function maybeReproject(g) {
    const s = firstCoord(g);
    if (!s || Math.abs(s[0]) <= 180) return g; // già lon/lat
    if (typeof proj4 === 'undefined') return g;
    ensureProj();
    return { type: g.type, coordinates: mapCoords(g.coordinates) };
  }

  function area_mq(g) {
    try { return (typeof turf !== 'undefined') ? turf.area(turf.feature(g)) : null; }
    catch (e) { return null; }
  }
  function lineLen(g) {
    try { return (typeof turf !== 'undefined') ? turf.length(turf.feature(g), { units: 'meters' }) : null; }
    catch (e) { return null; }
  }

  // --- classificazione delle feature ------------------------------------

  function livelloDi(p, g) {
    const lv = parseInt(p.livello, 10);
    if (lv) return lv;
    // fallback per geometria se manca la proprietà livello
    if (g.type === 'Point') return 2;
    if (g.type === 'LineString' || g.type === 'MultiLineString') return 1;
    return 1;
  }

  function buildArea(p, g) {
    return {
      codice: String(pick(p, ['codice']) || '').trim(),
      nome: String(pick(p, ['nome']) || '').trim(),
      istat: String(pick(p, ['istat']) || ''),
      tipo_perimetro: String(pick(p, ['tipo_perimetro', 'tipo_perim']) || 'reale'),
      stato_degrado: String(pick(p, ['stato_degrado', 'stato_degr']) || ''),
      note: String(pick(p, ['note']) || ''),
      geometry: g
    };
  }
  function buildAlbero(p, g) {
    const c = firstCoord(g) || [];
    return {
      codice: String(pick(p, ['id_pianta', 'codice']) || '').trim(),
      area_cod: String(pick(p, ['area_cod']) || ''),
      specie: String(pick(p, ['specie']) || '').trim(),
      diametro_fusto: num(pick(p, ['diametro_fusto', 'diam_fusto'])),
      altezza: num(pick(p, ['altezza'])),
      diametro_chioma: num(pick(p, ['diametro_chioma', 'diam_chiom', 'diam_chioma'])),
      fase_sviluppo: String(pick(p, ['fase_sviluppo', 'fase']) || ''),
      monumentale_albero: yes(pick(p, ['monumentale_albero', 'mon_albero'])),
      monumentale_ulivo: yes(pick(p, ['monumentale_ulivo', 'mon_ulivo'])),
      note: String(pick(p, ['note']) || ''),
      lng: c[0], lat: c[1]
    };
  }
  function buildElemento(p, g) {
    return {
      codice: String(pick(p, ['codice']) || '').trim(),
      area_cod: String(pick(p, ['area_cod']) || ''),
      tipo: String(pick(p, ['tipo']) || ''),
      metri_lineari: num(pick(p, ['metri_lineari', 'ml'])),
      altezza: num(pick(p, ['altezza'])),
      larghezza: num(pick(p, ['larghezza'])),
      tipo_siepe: String(pick(p, ['tipo_siepe']) || ''),
      impianto_irriguo: yes(pick(p, ['impianto_irriguo', 'irriguo'])),
      tipo_irriguo: String(pick(p, ['tipo_irriguo', 'tipo_irr']) || ''),
      note: String(pick(p, ['note']) || ''),
      geometry: g
    };
  }

  // --- parsing del file --------------------------------------------------

  async function parseFile(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.zip')) {
      if (typeof shp === 'undefined') throw new Error('Libreria Shapefile (shpjs) non disponibile: apri l\'app online una volta.');
      const ab = await file.arrayBuffer();
      return toFeatures(await shp(ab));
    }
    // GeoJSON / JSON
    const txt = await file.text();
    return toFeatures(JSON.parse(txt));
  }

  // --- import principale -------------------------------------------------

  // Ritorna { aree, alberi, elementi, assi, ignorati } già normalizzati.
  function classify(features) {
    const out = { aree: [], alberi: [], elementi: [], assi: [], ignorati: 0 };
    features.forEach((f) => {
      if (!f || !f.geometry) { out.ignorati++; return; }
      const g = maybeReproject(f.geometry);
      const p = f.properties || {};
      const lv = livelloDi(p, g);
      const t = g.type;
      if (lv === 1 && (t === 'LineString' || t === 'MultiLineString')) {
        out.assi.push({ codice: String(pick(p, ['codice']) || '').trim(), geometry: g, fascia: num(pick(p, ['fascia_m', 'larghezza_fascia'])) });
      } else if (lv === 1) {
        out.aree.push(buildArea(p, g));
      } else if (lv === 2) {
        out.alberi.push(buildAlbero(p, g));
      } else if (lv === 3) {
        out.elementi.push(buildElemento(p, g));
      } else { out.ignorati++; }
    });
    return out;
  }

  global.GC_IMPORT = { parseFile, classify, maybeReproject, area_mq, lineLen, firstCoord };
})(window);
