'use strict';

/**
 * estadoRutas.js
 * ----------------------------------------------------------------------
 * Qué pasa con una ruta cuando se cierra uno de sus portales.
 *
 * Una ruta se lee desde su entrada (el extremo más cercano a un portal de
 * ciudad): entrada → camino 1 → … → final. Si cierra el tramo k, lo que
 * viene después ya no se alcanza desde la entrada:
 *
 *  - La ruta pasa a "cerrada" durante VENTANA_CERRADAS_MS (30 min): se
 *    sigue viendo entera, con el tramo que cerró y los siguientes
 *    marcados, para saber a dónde llevaba y poder corregirla.
 *  - Los tramos siguientes quedan "desconectados": dejan de contar como
 *    conexiones abiertas en el resto de la web, salvo que también formen
 *    parte de otra ruta que siga abierta.
 *  - Pasada la ventana, la ruta "expira" y el mantenimiento la borra junto
 *    con esos tramos siguientes.
 *
 * Cuenta el primer tramo en cerrar: si cierran varios, lo que viene
 * después del primero ya estaba desconectado.
 *
 * Función pura: se prueba en Node.
 * ----------------------------------------------------------------------
 */

const VENTANA_CERRADAS_MS = 30 * 60_000;

/**
 * @param {Array<{conexionIds: number[]}>} rutas  Ya orientadas desde su entrada.
 * @param {Map<number, number>} cierres  Cierre (ms) de cada conexión que existe.
 * @param {number} ahora
 * @returns {{
 *   activas: object[],
 *   cerradas: Array<{ruta: object, cerradaEn: number, indiceCierre: number}>,
 *   expiradas: Array<{ruta: object, indiceCierre: number, siguientes: number[]}>,
 *   desconectadas: Set<number>
 * }}
 */
function clasificarRutas(rutas, cierres, ahora, ventana = VENTANA_CERRADAS_MS) {
  const activas = [];
  const cerradas = [];
  const expiradas = [];
  const siguientes = new Set();
  const enActivas = new Set();

  for (const ruta of rutas) {
    const tiempos = ruta.conexionIds.map((id) => cierres.get(id));
    // Le falta un tramo (se borró a mano): ya no es una ruta.
    if (tiempos.some((t) => t === undefined)) continue;

    const primero = Math.min(...tiempos);
    if (primero > ahora) {
      activas.push(ruta);
      for (const id of ruta.conexionIds) enActivas.add(id);
      continue;
    }

    const indiceCierre = tiempos.indexOf(primero);
    const despues = ruta.conexionIds.slice(indiceCierre + 1);
    for (const id of despues) siguientes.add(id);
    if (primero > ahora - ventana) cerradas.push({ ruta, cerradaEn: primero, indiceCierre });
    else expiradas.push({ ruta, indiceCierre, siguientes: despues });
  }

  const desconectadas = new Set([...siguientes].filter((id) => !enActivas.has(id)));
  return { activas, cerradas, expiradas, desconectadas };
}

module.exports = { clasificarRutas, VENTANA_CERRADAS_MS };
