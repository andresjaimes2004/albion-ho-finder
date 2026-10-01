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
 *  - Desde el extremo de entrada se recorre un árbol de decisión
 *    (búsqueda en profundidad): en cada camino de Avalon se prueba cada
 *    portal que sale de él, sin repetir zonas. Cada vez que se llega a
 *    otro extremo se obtiene una ruta.
 *  - Entrada: en cada red de caminos (componente conexa), el extremo por
 *    el que se empezó a explorar: el primero de Zona Negra en aparecer en
 *    las capturas (las conexiones ya guardadas cuentan como anteriores).
 *    Así una tanda de 17 capturas desde un mapa da una ruta por destino
 *    (8) en vez de todas las combinaciones entre extremos (36), que es
 *    como se recorre en el juego. Con `desdeEntrada: false` se generan
 *    todas las combinaciones, como antes.
 *  - Por eso un mismo portal puede formar parte de varias rutas: si un
 *    camino lleva a dos mapas de Zona Negra distintos, salen dos rutas
 *    independientes que comparten los tramos anteriores.
 *  - La misma ruta encontrada desde sus dos extremos cuenta una sola vez;
 *    se orienta desde el extremo preferido (Zona Negra antes que ciudad; a
 *    igualdad, el que aparece en la captura más antigua).
 *  - Si no se conoce el grupo de ninguna zona, los extremos son las zonas
 *    con un solo portal (compatibilidad con datos sin catálogo).
 *
 * Tramos repetidos (el mismo portal pegado dos veces) cuentan una vez: se
 * queda el primero, así que las capturas nuevas van antes que las
 * conexiones ya guardadas que se pasan para continuar rutas.
 *
 * Caminos de hideouts: `puedeTerminar(zona)` marca caminos de Avalon donde
 * una ruta también puede acabar aunque no sean un extremo (los caminos de
 * hideouts, a los que se va a ver qué gremios tienen hideout). Se sigue
 * explorando a través de ellos por si continúan hacia otro extremo.
 *
 * `aceptar(indices)` decide qué rutas se devuelven (por ejemplo, solo las
 * que usan alguna captura nueva); las rechazadas no gastan el tope.
 * Hay topes de rutas y de tramos por ruta para que muchas capturas con
 * muchas bifurcaciones no disparen la cantidad de combinaciones.
 *
 * Funciones puras: se prueban en Node.
 * ----------------------------------------------------------------------
 */

export const MAX_RUTAS = 40;
export const MAX_TRAMOS_POR_RUTA = 15;
const MAX_PASOS = 50_000;

/**
 * @param {Array<{origen:string, destino:string} | null>} tramos  Un
 *   elemento por fila; null si la fila aún no es válida.
 * @param {(zona:string) => string|undefined} grupoDe  Grupo de la zona
 *   ('avalon', 'zonaNegra', 'ciudad'...).
 * @param {{maxRutas?: number, maxTramos?: number, aceptar?: (indices:number[]) => boolean,
 *   puedeTerminar?: (zona:string) => boolean, desdeEntrada?: boolean,
 *   antiguedad?: (i:number) => number}} [limites]  `antiguedad(i)`: orden
 *   en que se capturó el tramo i (por defecto, su posición).
 * @returns {{ rutas: Array<{indices:number[], zonas:string[]}>, sueltos: number[], truncado: boolean }}
 */
export function agruparEnRutas(
  tramos,
  grupoDe = () => undefined,
  {
    maxRutas = MAX_RUTAS,
    maxTramos = MAX_TRAMOS_POR_RUTA,
    aceptar = () => true,
    puedeTerminar = () => false,
    desdeEntrada = true,
    antiguedad = (i) => i,
  } = {}
) {
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
      if (!primeraAparicion.has(zona) || antiguedad(i) < primeraAparicion.get(zona)) primeraAparicion.set(zona, antiguedad(i));
    }
  });

  // 2. Extremos e intermedios.
  const hayGrupos = [...vecinos.keys()].some((z) => grupoDe(z) !== undefined);
  const esExtremo = (z) => (hayGrupos ? grupoDe(z) !== 'avalon' : vecinos.get(z).length === 1);
  const preferencia = (z) => (grupoDe(z) === 'zonaNegra' ? 0 : 1);
  const ordenados = [...vecinos.keys()]
    .filter(esExtremo)
    .sort((a, b) => preferencia(a) - preferencia(b) || primeraAparicion.get(a) - primeraAparicion.get(b));

  // Componentes conexas (redes de caminos separadas) para elegir la entrada de cada una.
  const red = new Map();
  let numeroRed = 0;
  for (const zona of vecinos.keys()) {
    if (red.has(zona)) continue;
    const pila = [zona];
    red.set(zona, numeroRed);
    while (pila.length) {
      for (const { otra } of vecinos.get(pila.pop())) {
        if (!red.has(otra)) {
          red.set(otra, numeroRed);
          pila.push(otra);
        }
      }
    }
    numeroRed += 1;
  }
  const conEntrada = new Set();
  const extremos = desdeEntrada
    ? ordenados.filter((z) => {
        if (conEntrada.has(red.get(z))) return false;
        conEntrada.add(red.get(z));
        return true;
      })
    : ordenados;

  // 3. Árbol de decisión desde cada extremo.
  const rutas = [];
  const encontradas = new Set();
  let truncado = false;
  // Tope de pasos: con muchas conexiones guardadas en la misma red, el
  // recorrido no debe congelar el navegador.
  let pasos = 0;

  for (const inicio of extremos) {
    const visitadas = new Set([inicio]);
    const explorar = (zona, indices, zonas) => {
      for (const { i, otra } of vecinos.get(zona)) {
        if (rutas.length >= maxRutas || ++pasos > MAX_PASOS) {
          truncado = true;
          return;
        }
        if (visitadas.has(otra)) continue;
        const nuevosIndices = [...indices, i];
        const registrar = () => {
          // Un solo portal entre dos extremos no es una ruta de Avalon.
          if (nuevosIndices.length < 2) return;
          const clave = [...nuevosIndices].sort((a, b) => a - b).join(',');
          if (!encontradas.has(clave) && aceptar(nuevosIndices)) {
            encontradas.add(clave);
            rutas.push({ indices: nuevosIndices, zonas: [...zonas, otra] });
          }
        };
        if (esExtremo(otra)) {
          registrar();
          continue;
        }
        // Camino de hideouts: la ruta puede terminar aquí y también seguir.
        if (puedeTerminar(otra)) registrar();
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

/**
 * Ordena los tramos de UNA ruta (edición): los encadena en una sola línea
 * que usa todos, sin repetir zonas. Sirve para que una captura pegada al
 * final se coloque sola en su sitio (al principio, al final o tapando un
 * hueco) y quede orientada.
 *
 * @param {Array<{origen:string, destino:string}>} tramos
 * @param {string|null} inicioPreferido  Extremo por el que empezar si la
 *   cadena puede leerse desde él (la entrada de la ruta).
 * @returns {{orden: number[], invertir: boolean[]} | null}  null si los
 *   tramos no forman una sola línea (se bifurcan, hay huecos o repiten).
 */
export function ordenarCadena(tramos, inicioPreferido = null) {
  if (!tramos.length) return { orden: [], invertir: [] };
  const grado = new Map();
  for (const { origen, destino } of tramos) {
    grado.set(origen, (grado.get(origen) || 0) + 1);
    grado.set(destino, (grado.get(destino) || 0) + 1);
  }
  if ([...grado.values()].some((g) => g > 2)) return null;
  const extremos = [...grado.keys()].filter((z) => grado.get(z) === 1);
  if (extremos.length !== 2) return null;

  let actual = extremos.includes(inicioPreferido) ? inicioPreferido : extremos[0];
  const usados = new Set();
  const orden = [];
  const invertir = [];
  while (orden.length < tramos.length) {
    const i = tramos.findIndex((t, k) => !usados.has(k) && (t.origen === actual || t.destino === actual));
    if (i < 0) return null;
    usados.add(i);
    orden.push(i);
    invertir.push(tramos[i].destino === actual);
    actual = tramos[i].destino === actual ? tramos[i].origen : tramos[i].destino;
  }
  return { orden, invertir };
}
