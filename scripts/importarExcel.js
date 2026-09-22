'use strict';

/**
 * Importa un archivo .xlsx con el mismo formato que el original
 * ("Mapas BZ": columna A = mapa, columnas B..K = HO 1..HO 10) y lo carga
 * como una nueva temporada en la base de datos, sin tocar el historial
 * de temporadas anteriores.
 *
 * Uso: npm run db:import -- ./ruta/Nuevo_Buscador_S35.xlsx S35
 */

const path = require('path');

const MapaRepository = require('../src/repositories/MapaRepository');
const GremioRepository = require('../src/repositories/GremioRepository');
const HideoutRepository = require('../src/repositories/HideoutRepository');
const TemporadaRepository = require('../src/repositories/TemporadaRepository');

const HOJA_DATOS = 'Mapas BZ';
const REGEX_TIPO = /\((HQ|P)\)\s*$/;

/**
 * `xlsx` es la única dependencia externa que queda y solo hace falta para
 * este script de importación puntual, no para servir la web. Se carga de
 * forma perezosa: si no está instalada, el resto de la aplicación sigue
 * funcionando y aquí se explica cómo instalarla.
 */
function cargarXLSX() {
  try {
    // eslint-disable-next-line global-require
    return require('xlsx');
  } catch (error) {
    throw new Error(
      'Para importar un Excel hace falta el paquete "xlsx". Instálalo con: npm install xlsx'
    );
  }
}

function extraerFilas(rutaArchivo) {
  const XLSX = cargarXLSX();
  const libro = XLSX.readFile(rutaArchivo);
  const hoja = libro.Sheets[HOJA_DATOS];
  if (!hoja) {
    throw new Error(`El archivo no contiene una hoja llamada "${HOJA_DATOS}".`);
  }

  const filas = cargarXLSX().utils.sheet_to_json(hoja, { header: 1, defval: null });
  const [, ...datos] = filas; // se descarta el encabezado

  return datos
    .filter((fila) => fila[0])
    .map((fila) => {
      const mapa = String(fila[0]).trim();
      const hideouts = [];

      for (let col = 1; col <= 10; col += 1) {
        const valor = fila[col];
        if (!valor) continue;

        const texto = String(valor).trim();
        const match = texto.match(REGEX_TIPO);
        const tipo = match ? match[1] : 'ESTANDAR';
        const gremio = match ? texto.slice(0, match.index).trim() : texto;

        hideouts.push({ slot: col, gremio, tipo });
      }

      return { mapa, hideouts };
    });
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
