'use strict';

/**
 * Importa data/hideouts_seed.json (generado a partir del Excel original)
 * hacia la base de datos relacional SQLite. Es la carga inicial del
 * proyecto (temporada S34). Para importar una temporada nueva desde un
 * archivo .xlsx directamente, usa scripts/importarExcel.js.
 *
 * Uso: npm run db:init
 */

const fs = require('fs');
const path = require('path');

const MapaRepository = require('../src/repositories/MapaRepository');
const GremioRepository = require('../src/repositories/GremioRepository');
const HideoutRepository = require('../src/repositories/HideoutRepository');
const TemporadaRepository = require('../src/repositories/TemporadaRepository');

function importar(seedPath) {
  const contenido = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const { temporada: codigoTemporada, mapas } = contenido;

  const temporadaRepo = new TemporadaRepository();
  const mapaRepo = new MapaRepository();
  const gremioRepo = new GremioRepository();
  const hideoutRepo = new HideoutRepository();

  const temporada = temporadaRepo.crear(codigoTemporada, { activar: true });

  let totalMapas = 0;
  let totalHideouts = 0;

  for (const entradaMapa of mapas) {
    const mapa = mapaRepo.obtenerOCrear(entradaMapa.mapa);
    totalMapas += 1;

    const registros = entradaMapa.hideouts.map((h) => {
      const gremio = gremioRepo.obtenerOCrear(h.gremio);
      totalHideouts += 1;
      return { gremioId: gremio.id, slot: h.slot, tipo: h.tipo || 'ESTANDAR' };
    });

    if (registros.length > 0) {
      hideoutRepo.insertarLote(temporada.id, mapa.id, registros);
    }
  }

  console.log(`Temporada ${temporada.codigo}: ${totalMapas} mapas, ${totalHideouts} hideouts importados.`);
}

if (require.main === module) {
  const seedPath = process.argv[2] || path.join(__dirname, '..', 'data', 'hideouts_seed.json');
  importar(seedPath);
}

module.exports = importar;
