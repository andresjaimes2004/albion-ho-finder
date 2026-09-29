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
 * Lo usan el importador manual (scripts/importarExcel.js) y la
 * sincronización con Google Drive.
 * ----------------------------------------------------------------------
 */

const HOJA_DATOS = 'Mapas BZ';
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

/** Lee el .xlsx (Buffer) y devuelve sus mapas con hideouts. */
function leerHideoutsXlsx(buffer) {
  return interpretarFilas(leerHoja(buffer, HOJA_DATOS));
}

module.exports = { leerHideoutsXlsx, interpretarFilas, HOJA_DATOS, ErrorExcel };
