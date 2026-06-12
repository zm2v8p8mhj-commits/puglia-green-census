/* Puglia Green Census — Logica applicativa e interfaccia */
(function (global) {
  'use strict';

  const CFG = global.GC_CONFIG;
  const DB = global.GC_DB;
  const MAP = global.GC_MAP;
  const EXP = global.GC_EXPORT;

  const PROGETTO_ID = 'corrente';

  const state = {
    progetto: null,
    aree: [],
    alberi: [],
    elementi: [],
    tab: 'aree',
    pendingGeometry: null   // geometria appena disegnata in attesa di salvataggio
  };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, attrs, html) => {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'dataset') Object.assign(e.dataset, attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (html != null) e.innerHTML = html;
    return e;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- avvio

  async function start() {
    await DB.open();
    state.progetto = await DB.get('progetto', PROGETTO_ID);
    MAP.init('map');
    bindChrome();
    if (!state.progetto) {
      showOnboarding();
    } else {
      await loadAll();
      enterApp();
    }
  }

  // ---------------------------------------------------------- onboarding

  function showOnboarding() {
    $('#onboarding').classList.remove('hidden');
    $('#app').classList.add('hidden');
    const form = $('#onboarding-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const comune = $('#ob-comune').value.trim();
      const prov = $('#ob-prov').value.trim();
      const pop = parseInt($('#ob-pop').value, 10);
      const livello = CFG.livelloDaPopolazione(pop);
      if (!comune || !livello) { alert('Inserisci il Comune e una popolazione valida.'); return; }
      state.progetto = {
        id: PROGETTO_ID, comune, provincia: prov, popolazione: pop, livello,
        crs: CFG.CRS.epsg, created_at: new Date().toISOString()
      };
      await DB.put('progetto', state.progetto);
      await loadAll();
      enterApp();
    };
    $('#ob-pop').oninput = () => {
      const lv = CFG.livelloDaPopolazione(parseInt($('#ob-pop').value, 10));
      const box = $('#ob-livello');
      if (!lv) { box.className = 'ob-livello'; box.textContent = ''; return; }
      box.className = 'ob-livello lv' + lv;
      box.innerHTML = lv === 2
        ? '<strong>Livello 2</strong> — Anagrafica aree + Catasto alberi (Comune ≤ 15.000 ab.)'
        : '<strong>Livello 3</strong> — Inventario completo del verde (Comune &gt; 15.000 ab.)';
    };
  }

  function enterApp() {
    $('#onboarding').classList.add('hidden');
    $('#app').classList.remove('hidden');
    MAP.invalidate();
    renderHeader();
    renderTabs();
    refreshMap();
    renderList();
    // dopo invalidateSize, altrimenti fitBounds lavora su una mappa 0×0
    setTimeout(() => MAP.fitToData(), 180);
  }

  // ------------------------------------------------------------- caricamento

  async function loadAll() {
    state.aree = await DB.all('aree');
    state.alberi = await DB.all('alberi');
    state.elementi = await DB.all('elementi');
  }

  function areaByCod(cod) { return state.aree.find((a) => a.codice === cod); }
  function areaById(id) { return state.aree.find((a) => a.id === id); }

  // ------------------------------------------------------------- header/chrome

  function renderHeader() {
    const p = state.progetto;
    $('#hdr-comune').textContent = p.comune + (p.provincia ? ' (' + p.provincia + ')' : '');
    $('#hdr-livello').textContent = 'Livello ' + p.livello;
    $('#hdr-livello').className = 'badge lv' + p.livello;
    $('#hdr-pop').textContent = p.popolazione.toLocaleString('it-IT') + ' ab.';
  }

  function bindChrome() {
    $('#btn-gps').onclick = () => MAP.panToCurrent();
    $('#btn-fit').onclick = () => MAP.fitToData(state.aree, state.alberi, state.elementi);
    $('#btn-export').onclick = () => $('#export-menu').classList.toggle('hidden');
    $('#exp-geojson').onclick = () => { closeExport(); EXP.exportGeoJSON(state); };
    $('#exp-csv').onclick = () => { closeExport(); EXP.exportCSV(state); };
    $('#exp-shp').onclick = () => { closeExport(); EXP.exportShapefile(state); };
    $('#btn-reset').onclick = resetProject;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#btn-export') && !e.target.closest('#export-menu')) closeExport();
    });
    $('#panel-close').onclick = closePanel;
  }
  function closeExport() { $('#export-menu').classList.add('hidden'); }

  async function resetProject() {
    if (!confirm('Azzerare il progetto e tutti i dati censiti? Esporta prima i dati: l\'operazione è irreversibile.')) return;
    await DB.clearAll();
    state.progetto = null; state.aree = []; state.alberi = []; state.elementi = [];
    MAP.clearData();
    location.reload();
  }

  // ------------------------------------------------------------- tabs

  function renderTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    const defs = [{ id: 'aree', label: 'Aree verdi' }];
    if (state.progetto.livello >= 2) defs.push({ id: 'alberi', label: 'Catasto alberi' });
    if (state.progetto.livello >= 3) defs.push({ id: 'elementi', label: 'Inventario verde' });
    defs.forEach((d) => {
      const b = el('button', { class: 'tab' + (state.tab === d.id ? ' active' : ''), dataset: { tab: d.id } }, d.label);
      b.onclick = () => { state.tab = d.id; renderTabs(); renderList(); };
      tabs.appendChild(b);
    });
  }

  // ------------------------------------------------------------- liste

  function renderList() {
    const box = $('#list');
    box.innerHTML = '';
    const addBtn = $('#btn-add');

    if (state.tab === 'aree') {
      addBtn.textContent = '+ Nuova area verde';
      addBtn.onclick = () => openAreaForm(null);
      if (!state.aree.length) box.appendChild(emptyMsg('Nessuna area censita. Inizia delimitando un\'area verde.'));
      state.aree.forEach((a) => box.appendChild(listItem(
        a.codice, a.nome, a.istat, () => openAreaForm(a), areaBadge(a))));
    } else if (state.tab === 'alberi') {
      addBtn.textContent = '+ Nuovo albero';
      addBtn.onclick = () => openAlberoForm(null);
      if (!state.alberi.length) box.appendChild(emptyMsg('Nessun albero nel catasto. Aggiungi una pianta georeferenziata.'));
      state.alberi.forEach((t) => box.appendChild(listItem(
        t.codice, t.specie, t.area_cod ? 'Area ' + t.area_cod : '', () => openAlberoForm(t),
        (t.monumentale_albero || t.monumentale_ulivo) ? '★ monumentale' : '')));
    } else {
      addBtn.textContent = '+ Nuovo elemento';
      addBtn.onclick = () => openElementoForm(null);
      if (!state.elementi.length) box.appendChild(emptyMsg('Nessun elemento del verde censito.'));
      state.elementi.forEach((x) => box.appendChild(listItem(
        x.tipo, x.codice || '', x.area_cod ? 'Area ' + x.area_cod : '', () => openElementoForm(x),
        x.impianto_irriguo ? '💧 irriguo' : '')));
    }
    $('#count').textContent = state[state.tab].length;
  }

  function emptyMsg(t) { return el('div', { class: 'empty' }, esc(t)); }
  function areaBadge(a) {
    if (a.asse) return 'viale/filare';
    return a.tipo_perimetro === 'fittizio' ? 'perimetro fittizio' : 'perimetro reale';
  }

  function listItem(title, sub, sub2, onClick, badge) {
    const item = el('div', { class: 'item' });
    item.innerHTML =
      '<div class="item-main"><div class="item-title">' + esc(title || '(senza codice)') + '</div>' +
      '<div class="item-sub">' + esc(sub || '') + (sub2 ? ' · ' + esc(sub2) : '') + '</div></div>' +
      (badge ? '<span class="item-badge">' + esc(badge) + '</span>' : '');
    item.onclick = onClick;
    return item;
  }

  // ------------------------------------------------------------- pannello form

  function openPanel(title) {
    $('#panel-title').textContent = title;
    $('#panel').classList.add('open');
    return $('#panel-body');
  }
  function closePanel() {
    $('#panel').classList.remove('open');
    state.pendingGeometry = null;
    MAP.cancelDraw();
  }

  function field(label, control, hint) {
    const w = el('label', { class: 'field' });
    w.appendChild(el('span', { class: 'field-label' }, esc(label)));
    w.appendChild(control);
    if (hint) w.appendChild(el('span', { class: 'field-hint' }, esc(hint)));
    return w;
  }
  function input(type, value, attrs) {
    const i = el('input', Object.assign({ type: type, value: value == null ? '' : value }, attrs || {}));
    return i;
  }
  function select(options, value, attrs) {
    const s = el('select', attrs || {});
    s.appendChild(el('option', { value: '' }, '— seleziona —'));
    options.forEach((o) => {
      const opt = el('option', { value: o }, esc(o));
      if (o === value) opt.selected = true;
      s.appendChild(opt);
    });
    return s;
  }
  function checkbox(label, checked) {
    const w = el('label', { class: 'check' });
    const c = el('input', { type: 'checkbox' });
    c.checked = !!checked;
    w.appendChild(c);
    w.appendChild(el('span', null, esc(label)));
    return { wrap: w, input: c };
  }

  // ----- Form AREA (Livello 1) ------------------------------------------

  function openAreaForm(area) {
    const isNew = !area;
    area = area || {};
    const body = openPanel(isNew ? 'Nuova area verde' : 'Area ' + (area.codice || ''));
    body.innerHTML = '';

    const fCod = input('text', area.codice, { placeholder: 'es. PG-001', required: 'required' });
    const fNome = input('text', area.nome, { placeholder: 'es. Parco Marconi' });
    const fIstat = select(CFG.ISTAT_CLASSI, area.istat);
    const fPerim = select(['reale', 'fittizio'], area.tipo_perimetro || 'reale');
    const fDegr = state.progetto.livello >= 3 ? select(CFG.STATO_DEGRADO, area.stato_degrado) : null;
    const fNote = el('textarea', { rows: 2, placeholder: 'Annotazioni' }); fNote.value = area.note || '';

    body.appendChild(field('Codice area *', fCod, 'Alfanumerico univoco'));
    body.appendChild(field('Nome area', fNome));
    body.appendChild(field('Classificazione ISTAT 2017', fIstat));
    body.appendChild(field('Tipo di perimetro', fPerim, 'Reale per parchi/giardini, fittizio per viali alberati'));
    if (fDegr) body.appendChild(field('Stato di degrado / riqualificazione', fDegr));

    // Geometria: perimetro disegnato (parchi/giardini) oppure asse del
    // viale alberato/filare, da cui si genera il perimetro fittizio come
    // fascia di larghezza configurabile.
    const geomBox = el('div', { class: 'geom-box' });
    const geomStatus = el('div', { class: 'geom-status' });
    let geometry = area.geometry || null;
    let asse = area.asse || null;
    const fLargh = input('number', area.larghezza_fascia != null ? area.larghezza_fascia : 10,
      { step: '0.5', min: '1', placeholder: 'm' });
    const updateGeomStatus = () => {
      if (asse) {
        const l = MAP.lineLength(asse);
        const a = geometry ? MAP.geodesicArea(geometry) : null;
        geomStatus.innerHTML = '✓ Asse filare acquisito · ' + (l ? Math.round(l) + ' m' : '') +
          (a ? ' · fascia ~' + Math.round(a).toLocaleString('it-IT') + ' m²' : '');
        geomStatus.className = 'geom-status ok';
      } else if (geometry) {
        const a = MAP.geodesicArea(geometry);
        geomStatus.innerHTML = '✓ Perimetro acquisito' + (a ? ' · ~' + Math.round(a).toLocaleString('it-IT') + ' m²' : '');
        geomStatus.className = 'geom-status ok';
      } else {
        geomStatus.textContent = 'Nessun perimetro disegnato';
        geomStatus.className = 'geom-status';
      }
    };
    updateGeomStatus();
    const btnDraw = el('button', { type: 'button', class: 'btn-geom' }, '✏️ Disegna perimetro (parco/giardino)');
    btnDraw.onclick = () => {
      closePanelSoft();
      MAP.startDraw('polygon', (g) => {
        geometry = g; asse = null;
        reopenArea();
      });
    };
    const btnLine = el('button', { type: 'button', class: 'btn-geom alt' }, '🌳 Disegna asse viale alberato / filare');
    btnLine.onclick = () => {
      closePanelSoft();
      MAP.startDraw('line', (g) => {
        asse = g;
        geometry = MAP.bufferLine(asse, parseFloat(fLargh.value));
        reopenArea(true);
      });
    };
    // memorizza stato per riapertura dopo disegno
    function reopenArea(daFilare) {
      const merged = collectArea();
      merged.geometry = geometry;
      merged.asse = asse;
      if (daFilare) merged.tipo_perimetro = 'fittizio';
      openAreaForm(merged);
    }
    geomBox.appendChild(geomStatus);
    geomBox.appendChild(btnDraw);
    geomBox.appendChild(btnLine);
    body.appendChild(field('Perimetro', geomBox,
      'Per i viali alberati disegna l\'asse del filare: il perimetro fittizio viene generato come fascia attorno all\'asse'));
    const wLargh = field('Larghezza fascia filare', fLargh, 'm totali, usata per generare il perimetro fittizio');
    wLargh.style.display = asse ? '' : 'none';
    body.appendChild(wLargh);
    body.appendChild(field('Note', fNote));

    function collectArea() {
      return {
        id: area.id || DB.uid('area'),
        codice: fCod.value.trim(),
        nome: fNome.value.trim(),
        istat: fIstat.value,
        tipo_perimetro: fPerim.value,
        stato_degrado: fDegr ? fDegr.value : (area.stato_degrado || ''),
        note: fNote.value.trim(),
        geometry: geometry,
        asse: asse,
        larghezza_fascia: asse ? (numOrNull(fLargh.value) || 10) : null,
        created_at: area.created_at || new Date().toISOString()
      };
    }
    function closePanelSoft() { $('#panel').classList.remove('open'); }

    const actions = el('div', { class: 'form-actions' });
    const save = el('button', { class: 'btn-primary' }, 'Salva area');
    save.onclick = async () => {
      const rec = collectArea();
      if (!rec.codice) { alert('Il codice area è obbligatorio.'); return; }
      const dup = state.aree.find((a) => a.codice === rec.codice && a.id !== rec.id);
      if (dup) { alert('Codice area già esistente: ' + rec.codice); return; }
      if (rec.asse) {
        // rigenera la fascia con la larghezza definitiva
        rec.geometry = MAP.bufferLine(rec.asse, rec.larghezza_fascia) || rec.geometry;
        rec.lunghezza_m = MAP.lineLength(rec.asse);
      } else {
        rec.lunghezza_m = null;
      }
      if (rec.geometry) rec.area_mq = MAP.geodesicArea(rec.geometry);
      await DB.put('aree', rec);
      await loadAll();
      closePanel(); renderList(); refreshMap();
    };
    actions.appendChild(save);
    if (!isNew) {
      const del = el('button', { class: 'btn-danger' }, 'Elimina');
      del.onclick = async () => {
        const figli = state.alberi.filter((t) => t.area_id === area.id).length +
          state.elementi.filter((x) => x.area_id === area.id).length;
        if (!confirm('Eliminare l\'area' + (figli ? ' e scollegare ' + figli + ' elementi associati?' : '?'))) return;
        await DB.del('aree', area.id);
        await loadAll(); closePanel(); renderList(); refreshMap();
      };
      actions.appendChild(del);
    }
    body.appendChild(actions);
    $('#panel').classList.add('open');
  }

  // ----- Form ALBERO (Livello 2) ----------------------------------------

  function openAlberoForm(tree) {
    const isNew = !tree;
    tree = tree || {};
    const body = openPanel(isNew ? 'Nuovo albero' : 'Albero ' + (tree.codice || ''));
    body.innerHTML = '';

    const fCod = input('text', tree.codice, { placeholder: 'es. ALB-0001' });
    const areeCod = state.aree.map((a) => a.codice).filter(Boolean);
    const fArea = select(areeCod, tree.area_cod);
    const fSpecie = el('input', { type: 'text', list: 'dl-specie', placeholder: 'Nome scientifico *', value: tree.specie || '' });
    const fDiam = input('number', tree.diametro_fusto, { step: '0.1', min: '0', placeholder: 'cm a 1,30 m' });
    const fAlt = input('number', tree.altezza, { step: '0.1', min: '0', placeholder: 'm' });
    const fChioma = input('number', tree.diametro_chioma, { step: '0.1', min: '0', placeholder: 'm (facoltativo)' });
    const fFase = select(CFG.FASE_SVILUPPO, tree.fase_sviluppo);
    const cAlbero = checkbox('Albero monumentale (L. 10/2013)', tree.monumentale_albero);
    const cUlivo = checkbox('Ulivo monumentale (L.R. Puglia 14/2007)', tree.monumentale_ulivo);
    const fNote = el('textarea', { rows: 2 }); fNote.value = tree.note || '';

    body.appendChild(field('ID pianta', fCod, 'Codice univoco'));
    body.appendChild(field('Area di appartenenza', fArea));
    body.appendChild(field('Specie *', fSpecie, 'Nome scientifico obbligatorio'));

    // Posizione GPS
    let coords = (tree.lng != null && tree.lat != null) ? { lng: tree.lng, lat: tree.lat } : null;
    const posStatus = el('div', { class: 'geom-status' });
    const updPos = () => {
      if (coords) {
        posStatus.className = 'geom-status ok';
        posStatus.textContent = '✓ ' + coords.lat.toFixed(6) + ', ' + coords.lng.toFixed(6) + ' (ETRF2000)';
      } else { posStatus.className = 'geom-status'; posStatus.textContent = 'Posizione non acquisita'; }
    };
    updPos();
    const posBox = el('div', { class: 'geom-box' });
    const bGps = el('button', { type: 'button', class: 'btn-geom' }, '📍 Usa posizione GPS attuale');
    bGps.onclick = () => {
      const p = MAP.currentPosition();
      if (!p) { alert('GPS non disponibile. Usa "Posiziona sulla mappa".'); return; }
      coords = { lng: p.lng, lat: p.lat }; reopen();
    };
    const bMap = el('button', { type: 'button', class: 'btn-geom alt' }, '🗺️ Posiziona sulla mappa');
    bMap.onclick = () => {
      $('#panel').classList.remove('open');
      MAP.startDraw('point', (g) => { coords = { lng: g.coordinates[0], lat: g.coordinates[1] }; reopen(); });
    };
    function reopen() { const m = collect(); openAlberoForm(m); }
    posBox.appendChild(posStatus); posBox.appendChild(bGps); posBox.appendChild(bMap);
    body.appendChild(field('Coordinate (ETRF2000 / WGS84)', posBox));

    const grid = el('div', { class: 'grid2' });
    grid.appendChild(field('Diametro fusto', fDiam, 'cm, misurato a 1,30 m'));
    grid.appendChild(field('Altezza stimata', fAlt, 'm'));
    grid.appendChild(field('Diametro chioma', fChioma, 'm, facoltativo'));
    grid.appendChild(field('Fase di sviluppo', fFase));
    body.appendChild(grid);
    body.appendChild(field('Stato di protezione', (() => {
      const w = el('div'); w.appendChild(cAlbero.wrap); w.appendChild(cUlivo.wrap); return w;
    })()));
    body.appendChild(field('Note', fNote));

    function collect() {
      return {
        id: tree.id || DB.uid('alb'),
        codice: fCod.value.trim(),
        area_cod: fArea.value,
        area_id: (areaByCod(fArea.value) || {}).id || null,
        specie: fSpecie.value.trim(),
        diametro_fusto: numOrNull(fDiam.value),
        altezza: numOrNull(fAlt.value),
        diametro_chioma: numOrNull(fChioma.value),
        fase_sviluppo: fFase.value,
        monumentale_albero: cAlbero.input.checked,
        monumentale_ulivo: cUlivo.input.checked,
        note: fNote.value.trim(),
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        created_at: tree.created_at || new Date().toISOString()
      };
    }

    const actions = el('div', { class: 'form-actions' });
    const save = el('button', { class: 'btn-primary' }, 'Salva albero');
    save.onclick = async () => {
      const rec = collect();
      if (!rec.specie) { alert('La specie (nome scientifico) è obbligatoria.'); return; }
      if (rec.lat == null) { alert('La posizione georeferenziata è obbligatoria.'); return; }
      if (rec.codice) {
        const dup = state.alberi.find((t) => t.codice === rec.codice && t.id !== rec.id);
        if (dup) { alert('ID pianta già esistente: ' + rec.codice); return; }
      }
      await DB.put('alberi', rec);
      await loadAll(); closePanel(); renderList(); refreshMap();
    };
    actions.appendChild(save);
    if (!isNew) {
      const del = el('button', { class: 'btn-danger' }, 'Elimina');
      del.onclick = async () => {
        if (!confirm('Eliminare questo albero?')) return;
        await DB.del('alberi', tree.id);
        await loadAll(); closePanel(); renderList(); refreshMap();
      };
      actions.appendChild(del);
    }
    body.appendChild(actions);
    $('#panel').classList.add('open');
  }

  // ----- Form ELEMENTO (Livello 3) --------------------------------------

  function openElementoForm(item) {
    const isNew = !item;
    item = item || {};
    const body = openPanel(isNew ? 'Nuovo elemento del verde' : (item.tipo || 'Elemento'));
    body.innerHTML = '';

    const fTipo = select(CFG.TIPO_ELEMENTO, item.tipo);
    const fCod = input('text', item.codice, { placeholder: 'facoltativo' });
    const areeCod = state.aree.map((a) => a.codice).filter(Boolean);
    const fArea = select(areeCod, item.area_cod);
    const fNote = el('textarea', { rows: 2 }); fNote.value = item.note || '';

    body.appendChild(field('Tipologia elemento *', fTipo));
    body.appendChild(field('Codice', fCod));
    body.appendChild(field('Area di appartenenza', fArea));

    // Campi condizionali per le siepi
    const condBox = el('div');
    const fML = input('number', item.metri_lineari, { step: '0.1', min: '0' });
    const fAlt = input('number', item.altezza, { step: '0.1', min: '0' });
    const fLar = input('number', item.larghezza, { step: '0.1', min: '0' });
    const fTipoSiepe = select(CFG.TIPO_SIEPE, item.tipo_siepe);
    function renderCond() {
      condBox.innerHTML = '';
      if (fTipo.value === 'Siepe') {
        const g = el('div', { class: 'grid2' });
        g.appendChild(field('Metri lineari', fML, 'm (auto dal disegno)'));
        g.appendChild(field('Altezza', fAlt, 'm'));
        g.appendChild(field('Larghezza', fLar, 'm'));
        g.appendChild(field('Tipologia siepe', fTipoSiepe));
        condBox.appendChild(g);
      }
    }
    fTipo.onchange = () => { renderCond(); updateGeomHint(); };
    body.appendChild(condBox);

    // Impianto irriguo
    const cIrr = checkbox('Presenza impianto irriguo', item.impianto_irriguo);
    const fTipoIrr = select(CFG.TIPO_IRRIGUO, item.tipo_irriguo);
    const irrBox = el('div');
    irrBox.appendChild(cIrr.wrap);
    const irrTypeWrap = field('Tipologia irrigazione', fTipoIrr);
    irrBox.appendChild(irrTypeWrap);
    const syncIrr = () => { irrTypeWrap.style.display = cIrr.input.checked ? '' : 'none'; };
    cIrr.input.onchange = syncIrr; syncIrr();
    body.appendChild(field('Impianto irriguo', irrBox));

    // Geometria (dipende dal tipo)
    let geometry = item.geometry || null;
    const geomStatus = el('div', { class: 'geom-status' });
    const geomBox = el('div', { class: 'geom-box' });
    const btnDraw = el('button', { type: 'button', class: 'btn-geom' }, '✏️ Disegna sulla mappa');
    const geomHint = el('div', { class: 'field-hint' });
    function geomKind() { return CFG.GEOM_ELEMENTO[fTipo.value] || 'point'; }
    function updateGeomHint() {
      const k = geomKind();
      geomHint.textContent = k === 'line' ? 'Disegna una linea (siepe)' :
        k === 'polygon' ? 'Disegna un poligono (aiuola/prato)' : 'Disegna un punto o usa il GPS';
    }
    function updateGeomStatus() {
      if (geometry) {
        geomStatus.className = 'geom-status ok';
        let extra = '';
        if (geometry.type === 'LineString') { const l = MAP.lineLength(geometry); extra = l ? ' · ' + Math.round(l) + ' m' : ''; }
        if (geometry.type === 'Polygon') { const a = MAP.geodesicArea(geometry); extra = a ? ' · ~' + Math.round(a) + ' m²' : ''; }
        geomStatus.textContent = '✓ Geometria acquisita (' + geometry.type + ')' + extra;
      } else { geomStatus.className = 'geom-status'; geomStatus.textContent = 'Nessuna geometria'; }
    }
    btnDraw.onclick = () => {
      $('#panel').classList.remove('open');
      const k = geomKind();
      const done = (g) => {
        geometry = g;
        if (g.type === 'LineString') fML.value = Math.round(MAP.lineLength(g));
        reopen();
      };
      if (k === 'point') {
        const p = MAP.currentPosition();
        if (p && confirm('Usare la posizione GPS attuale? (Annulla per disegnare a mano)')) {
          done({ type: 'Point', coordinates: [p.lng, p.lat] }); return;
        }
        MAP.startDraw('point', done);
      } else MAP.startDraw(k === 'line' ? 'line' : 'polygon', done);
    };
    function reopen() { openElementoForm(collect()); }
    geomBox.appendChild(geomStatus); geomBox.appendChild(geomHint); geomBox.appendChild(btnDraw);
    updateGeomHint(); updateGeomStatus(); renderCond();
    body.appendChild(field('Geometria', geomBox));
    body.appendChild(field('Note', fNote));

    function collect() {
      return {
        id: item.id || DB.uid('elm'),
        tipo: fTipo.value,
        codice: fCod.value.trim(),
        area_cod: fArea.value,
        area_id: (areaByCod(fArea.value) || {}).id || null,
        metri_lineari: numOrNull(fML.value),
        altezza: numOrNull(fAlt.value),
        larghezza: numOrNull(fLar.value),
        tipo_siepe: fTipoSiepe.value,
        impianto_irriguo: cIrr.input.checked,
        tipo_irriguo: cIrr.input.checked ? fTipoIrr.value : '',
        note: fNote.value.trim(),
        geometry: geometry,
        created_at: item.created_at || new Date().toISOString()
      };
    }

    const actions = el('div', { class: 'form-actions' });
    const save = el('button', { class: 'btn-primary' }, 'Salva elemento');
    save.onclick = async () => {
      const rec = collect();
      if (!rec.tipo) { alert('La tipologia elemento è obbligatoria.'); return; }
      if (!rec.geometry) { alert('La geometria è obbligatoria.'); return; }
      await DB.put('elementi', rec);
      await loadAll(); closePanel(); renderList(); refreshMap();
    };
    actions.appendChild(save);
    if (!isNew) {
      const del = el('button', { class: 'btn-danger' }, 'Elimina');
      del.onclick = async () => {
        if (!confirm('Eliminare questo elemento?')) return;
        await DB.del('elementi', item.id);
        await loadAll(); closePanel(); renderList(); refreshMap();
      };
      actions.appendChild(del);
    }
    body.appendChild(actions);
    $('#panel').classList.add('open');
  }

  function numOrNull(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }

  // ------------------------------------------------------------- mappa

  function refreshMap() {
    MAP.renderAree(state.aree, (a) => openAreaForm(a));
    MAP.renderAlberi(state.alberi, (t) => openAlberoForm(t));
    MAP.renderElementi(state.elementi, (x) => openElementoForm(x));
  }

  // Datalist specie
  function buildSpeciesDatalist() {
    const dl = el('datalist', { id: 'dl-specie' });
    CFG.SPECIE.forEach((s) => dl.appendChild(el('option', { value: s })));
    document.body.appendChild(dl);
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildSpeciesDatalist();
    start().catch((e) => { console.error(e); alert('Errore di avvio: ' + e.message); });
  });

  global.GC_APP = { state };
})(window);
