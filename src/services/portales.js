'use strict';

/**
 * portales.js
 * ----------------------------------------------------------------------
 * Cercanía de cada zona a los portales de ciudad de la Zona Negra
 * (Bridgewatch Portal, Lymhurst Portal...), que es por donde entra casi
 * todo el mundo. Sirve para ordenar y agrupar las rutas de Avalon: lo
 * primero que quiere ver quien sale de Lymhurst son las rutas que empiezan
 * a pocos mapas de su portal.
 *
 * El grafo sale de las salidas oficiales de cada mapa de Zona Negra
 * (dumps del cliente): un mapa pegado a un portal está a 1 salto, su
 * vecino a 2, etc. (búsqueda en anchura desde cada portal).
 *
 *  - El propio portal está a 0 saltos, y su ciudad real también (Lymhurst
 *    y Lymhurst Portal son los dos lados del mismo portal).
 *  - Otras zonas pegadas a la Zona Negra (descansos, zonas rojas...) se
 *    miden por su mapa de Zona Negra vecino más cercano, +1.
 *  - Los caminos de Avalon no tienen posición fija: no se miden.
 *
 * Funciones puras: se prueban en Node.
 * ----------------------------------------------------------------------
 */

const SUFIJO_PORTAL = ' Portal';

/**
 * @param {Array<{nombre: string, destinos: string[]}>} mapas  Mapas de
 *   Zona Negra con los nombres de las zonas a las que salen.
 * @param {string[]} portales  Nombres de los portales de ciudad.
 * @returns {(zona: string) => {portal: string, saltos: number} | null}
 */
function crearCercania(mapas, portales) {
  const vecinos = new Map();
  const esZonaNegra = new Set(mapas.map((m) => m.nombre));
  const unir = (a, b) => {
    if (!vecinos.has(a)) vecinos.set(a, new Set());
    if (!vecinos.has(b)) vecinos.set(b, new Set());
    vecinos.get(a).add(b);
    vecinos.get(b).add(a);
  };
  for (const mapa of mapas) {
    for (const destino of mapa.destinos) if (destino && destino !== mapa.nombre) unir(mapa.nombre, destino);
  }

  // Distancia desde cada portal a cada mapa de Zona Negra. Solo se avanza
  // por la Zona Negra: atravesar un descanso o una zona roja no acorta.
  const distancias = new Map();
  for (const portal of portales) {
    const distancia = new Map([[portal, 0]]);
    const cola = [portal];
    while (cola.length) {
      const zona = cola.shift();
      for (const otra of vecinos.get(zona) || []) {
        if (distancia.has(otra) || !esZonaNegra.has(otra)) continue;
        distancia.set(otra, distancia.get(zona) + 1);
        cola.push(otra);
      }
    }
    distancias.set(portal, distancia);
  }

  const cache = new Map();
  const mejorDe = (zona) => {
    let mejor = null;
    for (const [portal, distancia] of distancias) {
      const saltos = distancia.get(zona);
      if (saltos !== undefined && (!mejor || saltos < mejor.saltos)) mejor = { portal, saltos };
    }
    return mejor;
  };

  return function cercania(zona) {
    if (!zona) return null;
    if (cache.has(zona)) return cache.get(zona);

    let resultado = null;
    const portalDeCiudad = `${zona}${SUFIJO_PORTAL}`;
    if (distancias.has(zona)) resultado = { portal: zona, saltos: 0 };
    else if (distancias.has(portalDeCiudad)) resultado = { portal: portalDeCiudad, saltos: 0 };
    else if (esZonaNegra.has(zona)) resultado = mejorDe(zona);
    else {
      // Zona pegada a la Zona Negra: su mapa vecino más cercano, un salto más.
      for (const vecino of vecinos.get(zona) || []) {
        if (!esZonaNegra.has(vecino)) continue;
        const via = mejorDe(vecino);
        if (via && (!resultado || via.saltos + 1 < resultado.saltos)) resultado = { portal: via.portal, saltos: via.saltos + 1 };
      }
    }
    cache.set(zona, resultado);
    return resultado;
  };
}

module.exports = { crearCercania };
