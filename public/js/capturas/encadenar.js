/**
 * encadenar.js
 * ----------------------------------------------------------------------
 * Arma las rutas a partir de los tramos que el usuario pega desde
 * capturas, en cualquier orden y sentido (los portales son de ida y
 * vuelta).
 *
 * Los tramos forman un grafo: cada zona es un nodo y cada portal una
 * arista. Una ruta es un camino que:
 *
 *   mapa de Zona Negra (u otro extremo) → camino 1 → … → camino n → otro extremo
 *
 *  - Extremos: zonas que NO son caminos de Avalon (Zona Negra, ciudades,
 *    zonas reales…). Intermedios: los caminos de Avalon.
 *  - Desde cada extremo se recorre un árbol de decisión (búsqueda en
 *    profundidad): en cada camino de Avalon se prueba cada portal que
 *    sale de él, sin repetir zonas. Cada vez que se llega a otro extremo
 *    se obtiene una ruta.
 *  - Por eso un mismo portal puede formar parte de varias rutas: si un
 *    camino lleva a dos mapas de Zona Negra distintos, salen dos rutas
 *    independientes que comparten los tramos anteriores.
 *  - La misma ruta encontrada desde sus dos extremos cuenta una sola vez;
 *    se orienta desde el extremo preferido (Zona Negra antes que ciudad; a
 *    igualdad, el que aparece en la captura más antigua).
 *  - Si no se conoce el grupo de ninguna zona, los extremos son las zonas
 *    con un solo portal (compatibilidad con datos sin catálogo).
 *
 * Tramos repetidos (el mismo portal pegado dos veces) cuentan una vez.
 * Hay topes de rutas y de tramos por ruta para que muchas capturas con
 * muchas bifurcaciones no disparen la cantidad de combinaciones.
 *
 * Funciones puras: se prueban en Node.
 * ----------------------------------------------------------------------
 */

export const MAX_RUTAS = 40;
export const MAX_TRAMOS_POR_RUTA = 15;

/**
 * @param {Array<{origen:string, destino:string} | null>} tramos  Un
 *   elemento por fila; null si la fila aún no es válida.
 * @param {(zona:string) => string|undefined} grupoDe  Grupo de la zona
 *   ('avalon', 'zonaNegra', 'ciudad'...).
 * @param {{maxRutas?: number, maxTramos?: number}} [limites]
 * @returns {{ rutas: Array<{indices:number[], zonas:string[]}>, sueltos: number[], truncado: boolean }}
 */
export function agruparEnRutas(tramos, grupoDe = () => undefined, { maxRutas = MAX_RUTAS, maxTramos = MAX_TRAMOS_POR_RUTA } = {}) {
  // 1. Tramos válidos (sin repetir el mismo portal) y grafo de zonas.
  const vecinos = new Map();
  const primeraAparicion = new Map();
  const usados = [];
  const vistos = new Set();
  tramos.forEach((t, i) => {
    if (!t || !t.origen || !t.destino || t.origen === t.destino) return;
    const clave = [t.origen, t.destino].sort().join('|');
    if (vistos.has(clave)) return;
    vistos.add(clave);
    usados.push(i);
    for (const [zona, otra] of [[t.origen, t.destino], [t.destino, t.origen]]) {
      if (!vecinos.has(zona)) vecinos.set(zona, []);
      vecinos.get(zona).push({ i, otra });
      if (!primeraAparicion.has(zona)) primeraAparicion.set(zona, i);
    }
  });

  // 2. Extremos e intermedios.
  const hayGrupos = [...vecinos.keys()].some((z) => grupoDe(z) !== undefined);
  const esExtremo = (z) => (hayGrupos ? grupoDe(z) !== 'avalon' : vecinos.get(z).length === 1);
  const preferencia = (z) => (grupoDe(z) === 'zonaNegra' ? 0 : 1);
  const extremos = [...vecinos.keys()]
    .filter(esExtremo)
    .sort((a, b) => preferencia(a) - preferencia(b) || primeraAparicion.get(a) - primeraAparicion.get(b));

  // 3. Árbol de decisión desde cada extremo.
  const rutas = [];
  const encontradas = new Set();
  let truncado = false;

  for (const inicio of extremos) {
    const visitadas = new Set([inicio]);
    const explorar = (zona, indices, zonas) => {
      for (const { i, otra } of vecinos.get(zona)) {
        if (rutas.length >= maxRutas) {
          truncado = true;
          return;
        }
        if (visitadas.has(otra)) continue;
        const nuevosIndices = [...indices, i];
        if (esExtremo(otra)) {
          // Un solo portal entre dos extremos no es una ruta de Avalon.
          if (nuevosIndices.length < 2) continue;
          const clave = [...nuevosIndices].sort((a, b) => a - b).join(',');
          if (!encontradas.has(clave)) {
            encontradas.add(clave);
            rutas.push({ indices: nuevosIndices, zonas: [...zonas, otra] });
          }
          continue;
        }
        if (nuevosIndices.length >= maxTramos) continue;
        visitadas.add(otra);
        explorar(otra, nuevosIndices, [...zonas, otra]);
        visitadas.delete(otra);
      }
    };
    explorar(inicio, [], [inicio]);
    if (truncado) break;
  }

  // 4. Orden estable: por la captura más antigua de cada ruta, luego las más cortas.
  rutas.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices) || a.indices.length - b.indices.length);

  const enRutas = new Set(rutas.flatMap((r) => r.indices));
  const sueltos = tramos.map((_, i) => i).filter((i) => !enRutas.has(i));
  return { rutas, sueltos, truncado, usados };
}

/** Invierte una ruta (mismos tramos, sentido contrario). */
export function invertirRuta(ruta) {
  return { indices: [...ruta.indices].reverse(), zonas: [...ruta.zonas].reverse() };
}

/** Clave estable de una ruta, independiente del sentido. */
export function claveRuta(zonas) {
  const ida = zonas.join('>');
  const vuelta = [...zonas].reverse().join('>');
  return ida < vuelta ? ida : vuelta;
}
