'use strict';

/**
 * Importa un archivo .xlsx con el mismo formato que el original
 * ("Mapas BZ": columna A = mapa, columnas B..K = HO 1..HO 10) y lo carga
 * como una nueva temporada en la base de datos, sin tocar el historial
 * de temporadas anteriores.
 *
 * Uso: npm run db:import -- ./ruta/Nuevo_Buscador_S35.xlsx S35
 */

const fs = require('fs');
const path = require('path');

const MapaRepository = require('../src/repositories/MapaRepository');
const GremioRepository = require('../src/repositories/GremioRepository');
const HideoutRepository = require('../src/repositories/HideoutRepository');
const TemporadaRepository = require('../src/repositories/TemporadaRepository');
const { leerHideoutsXlsx } = require('../src/excel/hojaHideouts');

/**
 * El Excel se lee con el lector propio (src/excel/leerXlsx.js): el paquete
 * `xlsx` de npm tiene fallos de seguridad sin corregir y ya no se usa.
 */
function extraerFilas(rutaArchivo) {
  return leerHideoutsXlsx(fs.readFileSync(rutaArchivo));
}

function importarExcel(rutaArchivo, codigoTemporada) {
  const mapas = extraerFilas(rutaArchivo);

  const temporadaRepo = new TemporadaRepository();
  const mapaRepo = new MapaRepository();
  const gremioRepo = new GremioRepository();
  const hideoutRepo = new HideoutRepository();

  const temporada = temporadaRepo.crear(codigoTemporada, { activar: true });

  let totalHideouts = 0;
  for (const entradaMapa of mapas) {
    const mapa = mapaRepo.obtenerOCrear(entradaMapa.mapa);
    const registros = entradaMapa.hideouts.map((h) => {
      const gremio = gremioRepo.obtenerOCrear(h.gremio);
      totalHideouts += 1;
      return { gremioId: gremio.id, slot: h.slot, tipo: h.tipo };
    });

    if (registros.length > 0) {
      hideoutRepo.insertarLote(temporada.id, mapa.id, registros);
    }
  }

  console.log(
    `Temporada ${temporada.codigo}: ${mapas.length} mapas, ${totalHideouts} hideouts importados desde ${path.basename(
      rutaArchivo
    )}.`
  );
}

if (require.main === module) {
  const [, , rutaArchivo, codigoTemporada] = process.argv;
  if (!rutaArchivo || !codigoTemporada) {
    console.error('Uso: npm run db:import -- <ruta_del_excel.xlsx> <CODIGO_TEMPORADA>');
    process.exit(1);
  }
  importarExcel(path.resolve(rutaArchivo), codigoTemporada);
}

module.exports = importarExcel;
