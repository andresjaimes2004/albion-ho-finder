'use strict';

const { leerHoja, ErrorExcel } = require('./leerXlsx');

/**
 * hojaHideouts.js
 * ----------------------------------------------------------------------
 * Formato del Excel de hideouts (el original "Nuevo Buscador"):
 *
 *   Hoja "Mapas BZ": columna A = mapa, columnas B..K = HO 1..HO 10.
 *   Cada celda de HO es el nombre del gremio, con "(HQ)" o "(P)" al final
 *   si es su sede o un hideout de tipo P. La primera fila es el encabezado.
 *
 *   Hoja "Caminos Avalon" (opcional): columna A = camino de Avalon de
 *   hideouts, columnas B..K = gremios con hideout allí. La crea la propia
 *   web la primera vez que tiene gremios que agregar (ver
 *   SincronizacionExcelService). La primera fila es el encabezado.
 *
 * Lo usan el importador manual (scripts/importarExcel.js) y la
 * sincronización con Google Drive.
 * ----------------------------------------------------------------------
 */

const HOJA_DATOS = 'Mapas BZ';
const HOJA_CAMINOS = 'Caminos Avalon';
/** Columnas de gremios por fila (B..K), en las dos hojas. */
const COLUMNAS_GREMIOS = 10;
const ENCABEZADO_CAMINOS = ['Camino', ...Array.from({ length: COLUMNAS_GREMIOS }, (_, i) => `Gremio ${i + 1}`)];
const REGEX_TIPO = /\((HQ|P)\)\s*$/i;
const MAX_NOMBRE = 60;

/**
 * @param {Array<Array>} filas  Filas de la hoja (la primera, el encabezado).
 * @returns {Array<{mapa: string, hideouts: Array<{slot: number, gremio: string, tipo: string}>}>}
 */
function interpretarFilas(filas) {
  const [, ...datos] = filas;
  const mapas = [];
  const vistos = new Set();
  for (const fila of datos) {
    if (!fila || fila[0] === null || fila[0] === undefined || String(fila[0]).trim() === '') continue;
    const mapa = String(fila[0]).trim().replace(/\s+/g, ' ').slice(0, MAX_NOMBRE);
    // Un mapa repetido en el Excel: cuenta la primera fila.
    if (vistos.has(mapa.toLowerCase())) continue;
    vistos.add(mapa.toLowerCase());

    const hideouts = [];
    for (let col = 1; col <= 10; col += 1) {
      const valor = fila[col];
      if (valor === null || valor === undefined) continue;
      const celda = String(valor).trim();
      if (!celda) continue;
      const tipoLeido = celda.match(REGEX_TIPO);
      const tipo = tipoLeido ? tipoLeido[1].toUpperCase() : 'ESTANDAR';
      const gremio = (tipoLeido ? celda.slice(0, tipoLeido.index) : celda).trim().replace(/\s+/g, ' ').slice(0, MAX_NOMBRE);
      if (gremio) hideouts.push({ slot: col, gremio, tipo });
    }
    mapas.push({ mapa, hideouts });
  }
  return mapas;
}

/** Nombre de gremio de una celda, sin el "(HQ)" o "(P)" del final. */
function gremioDeCelda(valor) {
  if (valor === null || valor === undefined) return '';
  const celda = String(valor).trim();
  const tipo = celda.match(REGEX_TIPO);
  return (tipo ? celda.slice(0, tipo.index) : celda).trim().replace(/\s+/g, ' ').slice(0, MAX_NOMBRE);
}

/**
 * Hoja "Caminos Avalon": camino y gremios (sin validar: lo hace la
 * sincronización contra el catálogo de caminos).
 * @returns {Array<{camino: string, gremios: string[]}>}
 */
function interpretarFilasCaminos(filas) {
  const [, ...datos] = filas;
  const caminos = [];
  for (const fila of datos) {
    if (!fila || fila[0] === null || fila[0] === undefined || String(fila[0]).trim() === '') continue;
    const camino = String(fila[0]).trim().replace(/\s+/g, ' ').slice(0, MAX_NOMBRE);
    const gremios = [];
    for (let col = 1; col <= COLUMNAS_GREMIOS; col += 1) {
      const gremio = gremioDeCelda(fila[col]);
      if (gremio) gremios.push(gremio);
    }
    caminos.push({ camino, gremios });
  }
  return caminos;
}

/** Lee el .xlsx (Buffer) y devuelve sus mapas con hideouts. */
function leerHideoutsXlsx(buffer) {
  return interpretarFilas(leerHoja(buffer, HOJA_DATOS));
}

/**
 * Las dos hojas del Excel. `caminos` es null si el Excel aún no tiene la
 * hoja "Caminos Avalon" (entonces no se toca nada de los caminos).
 */
function leerLibroHideouts(buffer) {
  const filasCaminos = leerHoja(buffer, HOJA_CAMINOS, { opcional: true });
  return {
    mapas: leerHideoutsXlsx(buffer),
    caminos: filasCaminos ? interpretarFilasCaminos(filasCaminos) : null,
  };
}

module.exports = {
  leerHideoutsXlsx,
  leerLibroHideouts,
  interpretarFilas,
  interpretarFilasCaminos,
  gremioDeCelda,
  HOJA_DATOS,
  HOJA_CAMINOS,
  COLUMNAS_GREMIOS,
  ENCABEZADO_CAMINOS,
  ErrorExcel,
};
