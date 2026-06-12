# Puglia Green Census

Web app GIS (PWA offline-first) per il censimento del verde urbano della Regione Puglia.

Il livello di censimento si attiva automaticamente in base alla popolazione del Comune:

- **≤ 15.000 abitanti → Livello 2**: anagrafica aree verdi + catasto alberi.
- **> 15.000 abitanti → Livello 3**: in più l'inventario completo del verde (arbusti, siepi, aiuole, formelle, prati, impianto irriguo, stato di degrado).

## Funzionalità

- Mappa Leaflet (OSM + ortofoto satellitare) con disegno di punti, linee e poligoni.
- Rilievo georeferenziato GPS in sistema **ETRF2000 / WGS84** (EPSG:4258, compatibile INSPIRE).
- Anagrafica aree con classificazione **ISTAT 2017** e perimetro reale/fittizio.
- Catasto alberi: specie, dati biometrici, fase di sviluppo, flag albero monumentale (L. 10/2013) e ulivo monumentale (L.R. Puglia 14/2007).
- **Funziona offline** (service worker + IndexedDB): rilievo in campo senza connessione.
- Esportazione in formati aperti: **GeoJSON, CSV, Shapefile**.

## Tecnologia

HTML/CSS/JavaScript puro, Leaflet + Leaflet.draw + shp-write (via CDN). Nessuna build necessaria.

## Uso locale

```
python3 -m http.server 8765
```

poi apri http://localhost:8765/
