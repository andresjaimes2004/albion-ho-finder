/**
 * encadenar.js
 * ----------------------------------------------------------------------
 * Agrupa en rutas los tramos que el usuario va registrando desde
 * capturas. Cada tramo es un portal entre dos zonas y los portales son
 * de ida y vuelta, así que el orden de las capturas y el sentido de cada
 * tramo dan igual: los tramos que comparten zonas y forman un camino sin
 * bifurcaciones ni ciclos se ordenan como
 *
 *   mapa de Zona Negra → camino 1 → camino 2 → … → mapa final
 *
 * empezando por el extremo que NO es un camino de Avalon (el mapa de
 * Zona Negra o la ciudad desde la que se entra). Si hay bifurcaciones o
 * ciclos no se adivina: esos tramos quedan sueltos.
 *
 * Funciones puras: se prueban en Node.
 * ----------------------------------------------------------------------
 */

/**
 * @param {Array<{origen:string, destino:string} | null>} tramos  Un
 *   elemento por fila; null si la fila aún no es válida.
 * @param {(zona:string) => string|undefined} grupoDe  Grupo de la zona
 *   ('avalon', 'zonaNegra', 'ciudad'...), para elegir el inicio.
 * @returns {{ rutas: Array<{indices:number[], zonas:string[]}>, sueltos: number[] }}
 */
export function agruparEnRutas(tramos, grupoDe = () => undefined) {
  const validos = [];
  tramos.forEach((t, i) => {
    if (t && t.origen && t.destino && t.origen !== t.destino) validos.push(i);
  });

  // Componentes conexas por zonas (unión-búsqueda).
  const padre = new Map();
  const raiz = (z) => {
    if (!padre.has(z)) padre.set(z, z);
    let r = z;
    while (padre.get(r) !== r) r = padre.get(r);
    padre.set(z, r);
    return r;
  };
  for (const i of validos) padre.set(raiz(tramos[i].origen), raiz(tramos[i].destino));

  const componentes = new Map();
  for (const i of validos) {
    const r = raiz(tramos[i].origen);
    if (!componentes.has(r)) componentes.set(r, []);
    componentes.get(r).push(i);
  }

  const rutas = [];
  const sueltos = tramos.map((_, i) => i).filter((i) => !validos.includes(i));

  for (const indices of componentes.values()) {
    const ruta = indices.length >= 2 ? caminoSimple(indices, tramos, grupoDe) : null;
    if (ruta) rutas.push(ruta);
    else sueltos.push(...indices);
  }

  sueltos.sort((a, b) => a - b);
  rutas.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));
  return { rutas, sueltos };
}

/** Ordena los tramos de una componente si forman un camino simple; si no, null. */
function caminoSimple(indices, tramos, grupoDe) {
  const vecinos = new Map();
  const agregar = (z, i) => {
    if (!vecinos.has(z)) vecinos.set(z, []);
    vecinos.get(z).push(i);
  };
  for (const i of indices) {
    agregar(tramos[i].origen, i);
    agregar(tramos[i].destino, i);
  }

  // Camino simple: tantas zonas como tramos + 1 y ninguna con más de 2 tramos.
  if (vecinos.size !== indices.length + 1) return null;
  const extremos = [...vecinos].filter(([, lista]) => lista.length === 1).map(([z]) => z);
  if ([...vecinos.values()].some((lista) => lista.length > 2) || extremos.length !== 2) return null;

  const inicio = elegirInicio(extremos, indices, tramos, grupoDe);
  const zonas = [inicio];
  const orden = [];
  let actual = inicio;
  let anterior = null;
  while (orden.length < indices.length) {
    const siguiente = vecinos.get(actual).find((i) => i !== anterior);
    orden.push(siguiente);
    actual = tramos[siguiente].origen === actual ? tramos[siguiente].destino : tramos[siguiente].origen;
    zonas.push(actual);
    anterior = siguiente;
  }
  return { indices: orden, zonas };
}

/**
 * Inicio de la ruta: el extremo que no es camino de Avalon (preferido
 * uno de Zona Negra); si ambos o ninguno lo son, el que aparece en la
 * captura más antigua.
 */
function elegirInicio(extremos, indices, tramos, grupoDe) {
  const puntaje = (z) => (grupoDe(z) === 'zonaNegra' ? 2 : grupoDe(z) && grupoDe(z) !== 'avalon' ? 1 : 0);
  const [a, b] = extremos;
  if (puntaje(a) !== puntaje(b)) return puntaje(a) > puntaje(b) ? a : b;
  const primeraAparicion = (z) => Math.min(...indices.filter((i) => tramos[i].origen === z || tramos[i].destino === z));
  return primeraAparicion(a) <= primeraAparicion(b) ? a : b;
}

/** Invierte una ruta (mismos tramos, sentido contrario). */
export function invertirRuta(ruta) {
  return { indices: [...ruta.indices].reverse(), zonas: [...ruta.zonas].reverse() };
}

/** Clave estable de una ruta, independiente del sentido. */
export function claveRuta(zonas) {
  return [...zonas].sort().join('|');
}
