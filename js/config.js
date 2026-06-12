/* Puglia Green Census — Configurazione, tassonomie e logica dei livelli */
(function (global) {
  'use strict';

  // Classificazione ISTAT del verde urbano (rif. "Dati ambientali nelle città",
  // tassonomia ISTAT 2017 delle tipologie di verde pubblico comunale).
  const ISTAT_CLASSI = [
    'Verde storico (vincolato D.Lgs. 42/2004)',
    'Grandi parchi urbani (> 1 ha)',
    'Verde attrezzato (giardini e parchi di quartiere)',
    'Aree di arredo urbano (aiuole, rotatorie, spartitraffico)',
    'Forestazione urbana e periurbana',
    'Giardini scolastici',
    'Orti urbani',
    'Verde incolto',
    'Aree sportive all’aperto',
    'Cimiteri',
    'Verde di rispetto / funzionale (stradale, fluviale, ferroviario)',
    'Aree boschive',
    'Giardini e orti botanici',
    'Aree naturali protette',
    'Altro verde pubblico'
  ];

  // Specie più diffuse nel verde urbano pugliese (nome scientifico).
  // L'elenco è suggerito ma il campo resta a testo libero per specie non presenti.
  const SPECIE = [
    'Olea europaea',
    'Quercus ilex',
    'Quercus pubescens',
    'Pinus halepensis',
    'Pinus pinea',
    'Cupressus sempervirens',
    'Ceratonia siliqua',
    'Celtis australis',
    'Tilia cordata',
    'Tilia platyphyllos',
    'Platanus × acerifolia',
    'Acer campestre',
    'Acer negundo',
    'Fraxinus ornus',
    'Fraxinus angustifolia',
    'Jacaranda mimosifolia',
    'Brachychiton populneus',
    'Melia azedarach',
    'Morus alba',
    'Phoenix canariensis',
    'Phoenix dactylifera',
    'Washingtonia robusta',
    'Nerium oleander',
    'Laurus nobilis',
    'Cercis siliquastrum',
    'Eriobotrya japonica',
    'Citrus aurantium',
    'Ligustrum lucidum',
    'Robinia pseudoacacia',
    'Schinus molle',
    'Pinus pinaster'
  ];

  const FASE_SVILUPPO = ['Nuovo impianto', 'Giovane', 'Adulta', 'Senescente'];

  // Tipologie elemento del verde (Livello 3 - inventario completo).
  const TIPO_ELEMENTO = [
    'Palma',
    'Arbusto',
    'Siepe',
    'Aiuola',
    'Formella vuota',
    'Prato',
    'Cespuglio',
    'Arredo verde'
  ];

  const TIPO_SIEPE = ['Formale', 'Libera'];

  const TIPO_IRRIGUO = [
    'Goccia / ala gocciolante',
    'Aspersione (irrigatori)',
    'Subirrigazione',
    'Manuale / botte',
    'Non specificato'
  ];

  const STATO_DEGRADO = [
    'Ottimo - nessun intervento',
    'Buono - manutenzione ordinaria',
    'Mediocre - manutenzione straordinaria',
    'Scadente - riqualificazione necessaria',
    'Critico - rifacimento'
  ];

  // Geometria attesa per ciascun tipo di elemento L3.
  const GEOM_ELEMENTO = {
    'Palma': 'point',
    'Arbusto': 'point',
    'Cespuglio': 'point',
    'Arredo verde': 'point',
    'Formella vuota': 'point',
    'Siepe': 'line',
    'Aiuola': 'polygon',
    'Prato': 'polygon'
  };

  // Soglia di popolazione che attiva il Livello 3.
  const SOGLIA_POPOLAZIONE = 15000;

  function livelloDaPopolazione(pop) {
    const n = Number(pop);
    if (!isFinite(n) || n <= 0) return null;
    return n > SOGLIA_POPOLAZIONE ? 3 : 2;
  }

  // Sistema di riferimento: i punti GPS sono raccolti in WGS84 (lat/lng),
  // compatibile con ETRF2000 (epoca 2008.0) entro la tolleranza del rilievo GNSS
  // di campo. EPSG dichiarato negli export.
  const CRS = {
    nome: 'ETRF2000 / RDN2008 geografiche',
    epsg: 'EPSG:4258',
    note: 'Coordinate raccolte in WGS84 (GNSS), compatibili ETRF2000 per il rilievo del verde urbano.'
  };

  global.GC_CONFIG = {
    ISTAT_CLASSI,
    SPECIE,
    FASE_SVILUPPO,
    TIPO_ELEMENTO,
    TIPO_SIEPE,
    TIPO_IRRIGUO,
    STATO_DEGRADO,
    GEOM_ELEMENTO,
    SOGLIA_POPOLAZIONE,
    CRS,
    livelloDaPopolazione
  };
})(window);
