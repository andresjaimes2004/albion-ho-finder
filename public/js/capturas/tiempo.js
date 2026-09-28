/**
 * tiempo.js
 * ----------------------------------------------------------------------
 * Reconocedor propio del tiempo de cierre de un portal ("18 h 03 m",
 * "12 h", "42 m 09 s") en la línea que el juego pinta bajo la barra de
 * capacidad del recuadro.
 *
 * El juego usa siempre la misma tipografía, así que en vez de un OCR
 * genérico se compara cada carácter con plantillas de sus dígitos y de
 * las unidades h, m y s (capturas/plantillas.js, aprendidas de capturas
 * reales). Es determinista, tarda unos milisegundos y no confunde el "1"
 * estrecho de "10 h" con un espacio, que era el fallo del OCR genérico.
 *
 * Pasos:
 *  1. Mapa de "tinta": el canal más brillante de cada píxel (el texto es
 *     blanco, o rojo cuando queda menos de una hora; el fondo es oscuro).
 *  2. Umbral adaptativo y segmentación en caracteres por columnas.
 *  3. Cada carácter se reduce a una rejilla fija y se compara con las
 *     plantillas (correlación), teniendo en cuenta también su anchura.
 *  4. Se interpreta desde la derecha con una gramática estricta, así que
 *     "se cierra" o "Gratis para usar" a la izquierda no molestan.
 *
 * Funciones puras sobre { width, height, data } (RGBA): se prueban en Node.
 * ----------------------------------------------------------------------
 */

export const REJILLA = { ancho: 11, alto: 11 };
export const CLASES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'h', 'm', 's'];

/** Intensidad de tinta (0-1) de una región: el canal más brillante. */
export function mapaTinta(imagen, region) {
  const { width, data } = imagen;
  const v = new Float32Array(region.ancho * region.alto);
  for (let y = 0; y < region.alto; y++) {
    for (let x = 0; x < region.ancho; x++) {
      const i = ((region.y + y) * width + region.x + x) * 4;
      v[y * region.ancho + x] = Math.max(data[i], data[i + 1], data[i + 2]) / 255;
    }
  }
  return { ancho: region.ancho, alto: region.alto, v };
}

function percentil(valores, p) {
  const orden = Float32Array.from(valores).sort();
  return orden[Math.min(orden.length - 1, Math.floor(p * orden.length))];
}

/**
 * Separa la línea en caracteres. El umbral queda entre el fondo y el
 * texto más brillante, de modo que el gris tenue de "se cierra" suele
 * quedar fuera y los dígitos, dentro.
 */
export function segmentar(mapa) {
  const { ancho, alto, v } = mapa;
  const fondo = percentil(v, 0.5);
  const tope = percentil(v, 0.995);
  if (tope - fondo < 0.15) return { glifos: [], arriba: 0, abajo: 0 };
  const umbral = fondo + 0.55 * (tope - fondo);
  const tinta = (x, y) => v[y * ancho + x] > umbral;

  // Columnas con tinta → tramos (caracteres).
  const tramos = [];
  let inicio = -1;
  for (let x = 0; x <= ancho; x++) {
    let hay = false;
    if (x < ancho) for (let y = 0; y < alto && !hay; y++) hay = tinta(x, y);
    if (hay && inicio < 0) inicio = x;
    if (!hay && inicio >= 0) {
      tramos.push({ xa: inicio, xb: x - 1 });
      inicio = -1;
    }
  }
  // Extensión vertical de cada tramo.
  for (const t of tramos) {
    t.ya = alto;
    t.yb = -1;
    for (let y = 0; y < alto; y++) {
      for (let x = t.xa; x <= t.xb; x++) {
        if (tinta(x, y)) {
          if (y < t.ya) t.ya = y;
          if (y > t.yb) t.yb = y;
        }
      }
    }
  }
  const piezas = tramos.filter((t) => t.yb - t.ya >= 2);
  if (!piezas.length) return { glifos: [], arriba: 0, abajo: 0 };

  // Línea base: dígitos, h, m y s se apoyan en la misma fila. Se toma la
  // más repetida (el mapa que asoma alrededor no la comparte).
  const moda = (valores) => {
    const cuenta = new Map();
    for (const v of valores) cuenta.set(v, (cuenta.get(v) || 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  };
  const abajo = moda(piezas.map((t) => t.yb));
  const apoyadas = piezas.filter((t) => Math.abs(t.yb - abajo) <= 1);
  // Arriba: la altura de los dígitos y la "h". Es la mayor que se repite
  // (las minúsculas de "se cierra" son más bajas y el reloj de arena, más
  // alto, aparece una sola vez).
  const alturas = new Map();
  for (const t of apoyadas.filter((p) => p.yb === abajo)) {
    const h = abajo - t.ya + 1;
    alturas.set(h, (alturas.get(h) || 0) + 1);
  }
  const repetidas = [...alturas.entries()].filter(([h, n]) => n >= 2 && h >= 4).map(([h]) => h);
  if (!repetidas.length) return { glifos: [], arriba: 0, abajo: 0 };
  const arriba = abajo - Math.max(...repetidas) + 1;
  const altoLinea = abajo - arriba + 1;

  // Solo piezas de la línea: apoyadas en la base, no más altas que un
  // dígito y de al menos media altura (fuera puntos y restos del mapa).
  const deLinea = apoyadas.filter((t) => t.ya >= arriba - 1 && abajo - t.ya + 1 >= altoLinea * 0.5);

  // Une las piezas de un mismo carácter (la "m" tiene huecos internos).
  const union = Math.max(2, Math.round(altoLinea * 0.3));
  const glifos = [];
  for (const t of deLinea) {
    const previo = glifos[glifos.length - 1];
    const baja = (p) => abajo - p.ya + 1 < altoLinea * 0.9;
    const hueco = previo ? t.xa - previo.xb - 1 : Infinity;
    // Hueco mínimo: partes de un mismo carácter (el palo y el arco de la
    // "h"). Hueco algo mayor entre piezas bajas: los trazos de la "m".
    const mismo = previo && (hueco <= Math.max(1, Math.round(altoLinea * 0.15)) || (baja(previo) && baja(t) && hueco <= union));
    if (previo && mismo && t.xb - previo.xa + 1 <= altoLinea * 1.5) {
      previo.xb = t.xb;
      previo.ya = Math.min(previo.ya, t.ya);
      previo.yb = Math.max(previo.yb, t.yb);
    } else {
      glifos.push({ ...t });
    }
  }
  return { glifos, arriba, abajo, umbral };
}

/** Rejilla fija de un carácter (media por celda) y su anchura relativa. */
export function vectorGlifo(mapa, glifo, arriba, abajo, desplazamiento = 0, desplazamientoY = 0) {
  const { ancho, v } = mapa;
  const { ancho: gw, alto: gh } = REJILLA;
  const alto = abajo - arriba + 1;
  const anchoGlifo = glifo.xb - glifo.xa + 1;
  // Ventana de ancho fijo (proporcional a la altura) centrada en el
  // carácter: sin estirarlo, un "1" de 1-2 px sigue siendo estrecho.
  const anchoVentana = alto * 1.25;
  const inicio = (glifo.xa + glifo.xb + 1) / 2 - anchoVentana / 2 + desplazamiento;
  const salida = new Float32Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    const y0 = arriba + desplazamientoY + (cy * alto) / gh;
    const y1 = arriba + desplazamientoY + ((cy + 1) * alto) / gh;
    for (let cx = 0; cx < gw; cx++) {
      const x0 = inicio + (cx * anchoVentana) / gw;
      const x1 = inicio + ((cx + 1) * anchoVentana) / gw;
      // Media ponderada por área de los píxeles que cubre la celda.
      let suma = 0;
      let peso = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          // Fuera de las columnas del carácter cuenta como fondo (0).
          if (x >= glifo.xa && x <= glifo.xb && y >= 0 && y < mapa.alto) suma += v[y * ancho + x] * wx * wy;
          peso += wx * wy;
        }
      }
      // Al cuadrado: resalta el trazo frente al suavizado de los bordes.
      const media = peso ? suma / peso : 0;
      salida[cy * gw + cx] = media * media;
    }
  }
  // Centrado y normalizado: la comparación no depende del brillo.
  let media = 0;
  for (const x of salida) media += x;
  media /= salida.length;
  let norma = 0;
  for (let i = 0; i < salida.length; i++) {
    salida[i] -= media;
    norma += salida[i] * salida[i];
  }
  norma = Math.sqrt(norma) || 1;
  for (let i = 0; i < salida.length; i++) salida[i] /= norma;
  return { vector: salida, anchura: anchoGlifo / alto, alturaRelativa: (glifo.yb - glifo.ya + 1) / alto };
}

/**
 * Parecido (−1…1) entre un carácter y un ejemplo conocido: correlación de
 * sus rejillas. La ventana de ancho fijo ya refleja la anchura del
 * carácter, así que no hace falta compararla aparte.
 */
function parecido(rasgos, ejemplo) {
  let correlacion = 0;
  for (let i = 0; i < rasgos.vector.length; i++) correlacion += rasgos.vector[i] * ejemplo.v[i];
  return correlacion / 1000;
}

/**
 * Clase de un carácter por vecino más cercano: se compara con cada
 * ejemplo real guardado (no con un promedio, que emborrona las variantes
 * de suavizado según la posición exacta del texto en los píxeles).
 * `rasgos` puede ser una lista (el mismo carácter con desplazamientos de
 * menos de un píxel): cuenta el que mejor encaje.
 * Devuelve la clase, su parecido y el margen sobre la mejor clase distinta.
 */
export function clasificar(rasgos, plantillas) {
  const variantes = Array.isArray(rasgos) ? rasgos : [rasgos];
  const mejorPorClase = new Map();
  for (const ejemplo of plantillas.ejemplos || []) {
    let puntos = -Infinity;
    for (const r of variantes) puntos = Math.max(puntos, parecido(r, ejemplo));
    if (!mejorPorClase.has(ejemplo.c) || puntos > mejorPorClase.get(ejemplo.c)) mejorPorClase.set(ejemplo.c, puntos);
  }
  const orden = [...mejorPorClase.entries()].sort((a, b) => b[1] - a[1]);
  if (!orden.length) return { clase: null, puntos: -Infinity, margen: 0 };
  return { clase: orden[0][0], puntos: orden[0][1], margen: orden.length > 1 ? orden[0][1] - orden[1][1] : 1 };
}

/** Caracteres de la línea con su clase, de izquierda a derecha. */
export function leerCaracteres(imagen, region, plantillas) {
  const mapa = mapaTinta(imagen, region);
  const { glifos, arriba, abajo } = segmentar(mapa);
  if (!glifos.length || abajo - arriba < 3) return [];
  return glifos.map((glifo) => {
    const rasgos = vectorGlifo(mapa, glifo, arriba, abajo);
    // Desplazamientos de menos de un píxel (suavizado, línea base).
    const variantes = [];
    for (const dy of [-0.5, 0, 0.5]) {
      for (const dx of [-0.4, 0, 0.4]) variantes.push(dx || dy ? vectorGlifo(mapa, glifo, arriba, abajo, dx, dy) : rasgos);
    }
    return { ...glifo, rasgos, altoLinea: abajo - arriba + 1, ...clasificar(variantes, plantillas) };
  });
}

/** Mínimo parecido para aceptar un carácter como dígito o unidad. */
export const PUNTOS_MINIMOS = 0.55;

/** Máximo de horas que puede mostrar un portal (con margen). */
export const MAX_HORAS = 24;

/**
 * Interpreta los caracteres desde la derecha: "H h MM m", "H h",
 * "MM m SS s", "MM m" o "SS s". Devuelve minutos, una confianza (0-1) y
 * el texto reconocido, o null si no encaja con ningún formato.
 *
 * Reglas que evitan los errores típicos:
 *  - un dígito tiene la altura de la línea (las minúsculas de "se cierra"
 *    son más bajas y no pueden colarse como una cifra más de la hora);
 *  - las cifras de un número van pegadas;
 *  - con horas, los minutos van siempre con dos cifras ("18 h 03 m");
 *  - si a la derecha asoma algo del mapa, se descartan hasta 3 caracteres.
 */
export function interpretarCaracteres(caracteres) {
  for (let salto = 0; salto <= 3 && salto < caracteres.length; salto++) {
    // Solo se saltan restos (lo que no parece ni cifra ni unidad), nunca
    // un carácter bien reconocido.
    const saltado = caracteres[caracteres.length - salto];
    if (salto > 0 && saltado.puntos >= PUNTOS_MINIMOS && saltado.margen >= 0.1) break;
    const r = interpretarDesde(caracteres, caracteres.length - 1 - salto);
    if (r) return r;
  }
  return null;
}

function interpretarDesde(lista, desde) {
  const aceptable = (c) => c && c.puntos >= PUNTOS_MINIMOS;
  const esDigito = (c) => aceptable(c) && /[0-9]/.test(c.clase) && c.rasgos.alturaRelativa >= 0.8;
  const esUnidad = (c, u) => aceptable(c) && c.clase === u;
  const pegados = (izq, der) => der.xa - izq.xb - 1 <= Math.max(3, der.altoLinea * 0.95);
  let i = desde;
  const usados = [];

  const numero = ({ max = 59, cifras = null } = {}) => {
    if (!esDigito(lista[i])) return null;
    const digitos = [lista[i]];
    if (esDigito(lista[i - 1]) && pegados(lista[i - 1], lista[i])) {
      // Dos cifras pegadas que se pasan del máximo: lectura no fiable.
      if (Number(lista[i - 1].clase + lista[i].clase) > max) return null;
      digitos.unshift(lista[i - 1]);
    }
    if (cifras && digitos.length !== cifras) return null;
    const valor = Number(digitos.map((d) => d.clase).join(''));
    if (valor > max) return null;
    i -= digitos.length;
    usados.push(...digitos);
    return valor;
  };
  const unidad = (u) => {
    if (!esUnidad(lista[i], u)) return false;
    usados.push(lista[i--]);
    return true;
  };
  // La "s" final (menos de una hora, texto en rojo) casi nunca aparece en
  // las capturas de ejemplo: si no se reconoce, se acepta un carácter bajo
  // en su lugar cuando lo que sigue es "MM m SS".
  const unidadSegundos = () => {
    if (unidad('s')) return true;
    const c = lista[i];
    const siguiente = lista[i - 1];
    const trasNumero = lista[i - 3];
    if (c && c.clase !== 'm' && c.clase !== 'h' && esDigito(siguiente) && (esUnidad(trasNumero, 'm') || esUnidad(lista[i - 2], 'm'))) {
      usados.push(lista[i--]);
      return true;
    }
    return false;
  };

  let minutos = null;
  if (unidadSegundos()) {
    if (numero({ max: 59 }) === null) return null;
    if (unidad('m')) {
      const m = numero({ max: 59 });
      if (m === null) return null;
      minutos = Math.max(1, m);
    } else {
      minutos = 1;
    }
  } else if (unidad('m')) {
    // Con horas los minutos llevan dos cifras; sin horas, una o dos.
    const inicio = i;
    const conHoras = numero({ max: 59, cifras: 2 });
    if (conHoras !== null && unidad('h')) {
      const h = numero({ max: MAX_HORAS });
      if (!h) return null; // el juego nunca muestra "0 h"
      minutos = h * 60 + conHoras;
    } else {
      i = inicio;
      usados.length = 1;
      const m = numero({ max: 59 });
      if (m === null) return null;
      // "3 h 3 m" no es un formato del juego: con horas van dos cifras.
      if (esUnidad(lista[i], 'h')) return null;
      minutos = m;
    }
  } else if (unidad('h')) {
    const h = numero({ max: MAX_HORAS });
    if (!h) return null;
    minutos = h * 60;
  } else {
    return null;
  }
  if (minutos < 1) return null;

  const confianza = Math.min(...usados.map((c) => Math.min(1, c.puntos)));
  const margen = Math.min(...usados.map((c) => c.margen));
  const texto = usados
    .slice()
    .sort((x, y) => x.xa - y.xa)
    .map((c) => c.clase)
    .join('');
  return { minutos, confianza, margen, texto };
}

/** Lee el tiempo de cierre de una región. */
export function leerTiempo(imagen, region, plantillas) {
  if (!region) return null;
  return interpretarCaracteres(leerCaracteres(imagen, region, plantillas));
}

/**
 * Una línea etiquetada solo sirve para aprender si, alineada desde la
 * derecha, cada carácter tiene la forma esperada: dígitos y "h" de altura
 * completa y estrechos; "m" baja y ancha. Si no (un carácter partido o
 * unido, restos del mapa), se descarta entera.
 */
function alineacionCoherente(caracteres, letras) {
  if (caracteres.length < letras.length) return false;
  return letras.every((letra, k) => {
    const { rasgos } = caracteres[caracteres.length - letras.length + k];
    const { anchura: w, alturaRelativa: h } = rasgos;
    if (/[0-9]/.test(letra)) return h >= 0.8 && w <= 1;
    if (letra === 'm') return h < 0.95 && w >= 0.9;
    if (letra === 'h') return h >= 0.9 && w < 0.95;
    return true;
  });
}

/**
 * Ejemplos de referencia a partir de líneas etiquetadas (cada una: sus
 * caracteres y el texto que se ve, sin espacios, alineado desde la
 * derecha). Se usa para generar capturas/plantillas.js.
 */
export function entrenar(lineas) {
  const ejemplos = [];
  for (const { caracteres, texto } of lineas) {
    const letras = texto.split('');
    if (!alineacionCoherente(caracteres, letras)) continue;
    const n = Math.min(letras.length, caracteres.length);
    for (let k = 1; k <= n; k++) {
      const { rasgos } = caracteres[caracteres.length - k];
      ejemplos.push({
        c: letras[letras.length - k],
        // Enteros (milésimas) para que plantillas.js pese menos.
        v: Array.from(rasgos.vector, (x) => Math.round(x * 1000)),
      });
    }
  }
  return { ejemplos };
}
