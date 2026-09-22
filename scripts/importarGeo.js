'use strict';

const fs = require('fs');
const path = require('path');
const MapaRepository = require('../src/repositories/MapaRepository');
const db = require('../src/config/database');

/**
 * importarGeo.js
 * ----------------------------------------------------------------------
 * Carga data/mapas_geo.json (geografía oficial de los 276 mapas de la
 * Zona Negra) en la tabla `mapas_geo`. Es idempotente: se puede ejecutar
 * las veces que haga falta y solo actualiza.
 *
 * Uso:  npm run db:geo
 * ----------------------------------------------------------------------
 */
function importarGeo(rutaJson = path.join(__dirname, '..', 'data', 'mapas_geo.json')) {
  if (!fs.existsSync(rutaJson)) {
    console.warn(`[geo] No se encontró ${rutaJson}; se omite la carga geográfica.`);
    return { importados: 0 };
  }

  const datos = JSON.parse(fs.readFileSync(rutaJson, 'utf8'));
  const mapaRepo = new MapaRepository();

  let importados = 0;
  db.transaccion(() => {
    for (const geo of datos.mapas) {
      if (!geo.nombre || !Array.isArray(geo.mundo)) continue;
      const mapa = mapaRepo.obtenerOCrear(geo.nombre);
      mapaRepo.guardarGeo(mapa.id, geo);
      importados += 1;
    }
  });

  return { importados, fuente: datos.fuente };
}

if (require.main === module) {
  const resultado = importarGeo(process.argv[2]);
  console.log(`Geografía importada: ${resultado.importados} mapas de Zona Negra.`);
  if (resultado.fuente) console.log(`Fuente: ${resultado.fuente}`);
}

module.exports = importarGeo;
