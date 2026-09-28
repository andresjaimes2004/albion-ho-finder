/**
 * deteccion.js
 * ----------------------------------------------------------------------
 * Localiza en una captura del juego las regiones que hay que leer:
 *
 *  - El recuadro que aparece al pasar el cursor por un portal de Avalon
 *    ("Camino de Avalon a · <destino> · se cierra 17 h 16 m"). Se ubica
 *    por el carril de su barra de capacidad: amarillo (255,178,18) en la
 *    parte llena y tostado en la vacía, siempre del mismo ancho (137 px a
 *    1080p) sea cual sea la ocupación del portal (0/7 … 7/7).
 *  - El título del camino actual ("VI · Xetos-Obursum"), en el pergamino
 *    claro de la parte superior.
 *
 * Todas las posiciones se calculan en proporción al carril o al
 * pergamino, así que funciona con cualquier resolución o escala de
 * interfaz, y también con recortes parciales de la pantalla.
 *
 * Los colores dependen de la configuración de cada jugador (brillo y
 * gamma del juego, saturación o "vibración digital" de la tarjeta de
 * video, HDR, luz nocturna de Windows...). Por eso cada región se busca
 * por niveles: primero con los colores exactos por defecto y, si no
 * aparece, por tono/saturación/brillo (HSV) con umbrales relativos a los
 * colores más intensos de la propia captura.
 *
 * Funciones puras sobre { width, height, data } (RGBA, como ImageData),
 * sin DOM: se prueban en Node.
 * ----------------------------------------------------------------------
 */

/** Colores exactos con la configuración por defecto del juego. */
function esAmarilloBarra(r, g, b) {
  return r > 230 && g > 150 && g < 205 && b < 70;
}

function esPergamino(r, g, b) {
  return r > 215 && g > 160 && g < 225 && b > 95 && b < 175 && r - b > 70;
}

/** Tono (0-360), saturación y brillo (0-1). */
export function aHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}

/** Percentil p (0-1) de una lista de números. */
function percentil(valores, p) {
  if (!valores.length) return 0;
  const orden = Float32Array.from(valores).sort();
  return orden[Math.min(orden.length - 1, Math.floor(p * orden.length))];
}

/** Muestra de píxeles (hasta ~60 000) para calcular estadísticas rápido. */
function muestrear(imagen, filtro) {
  const { width, height, data } = imagen;
  const paso = Math.max(1, Math.floor(Math.sqrt((width * height) / 60000)));
  const salida = [];
  for (let y = 0; y < height; y += paso) {
    for (let x = 0; x < width; x += paso) {
      const i = (y * width + x) * 4;
      const c = aHsv(data[i], data[i + 1], data[i + 2]);
      if (filtro(c)) salida.push(c);
    }
  }
  return salida;
}

/**
 * Criterio tolerante para la parte llena del carril: tono amarillo-
 * anaranjado y saturación y brillo cercanos a los más intensos de la
 * captura (la barra es lo más saturado de ese tono; el pergamino, mucho
 * menos).
 */
function amarilloAdaptativo(imagen) {
  const candidatos = muestrear(imagen, (c) => c.h >= 24 && c.h <= 58 && c.s >= 0.4 && c.v >= 0.45);
  if (candidatos.length < 20) return null;
  const sRef = percentil(candidatos.map((c) => c.s), 0.98);
  const vRef = percentil(candidatos.map((c) => c.v), 0.98);
  const sMin = Math.max(0.45, sRef * 0.8);
  const vMin = Math.max(0.5, vRef * 0.78);
  return (r, g, b) => {
    const c = aHsv(r, g, b);
    return c.h >= 24 && c.h <= 58 && c.s >= sMin && c.v >= vMin;
  };
}

/** Criterio tolerante para el pergamino: claro, cálido y poco saturado. */
function pergaminoAdaptativo(imagen, limiteAlto) {
  const recorte = { ...imagen, height: limiteAlto };
  const claros = muestrear(recorte, (c) => c.h >= 18 && c.h <= 55 && c.s >= 0.12 && c.s <= 0.75 && c.v >= 0.55);
  if (claros.length < 20) return null;
  const vRef = percentil(claros.map((c) => c.v), 0.95);
  const vMin = Math.max(0.55, vRef * 0.82);
  return (r, g, b) => {
    const c = aHsv(r, g, b);
    return c.h >= 18 && c.h <= 55 && c.s >= 0.12 && c.s <= 0.75 && c.v >= vMin;
  };
}

// ------------------------------------------------------------------ carril --

/**
 * La barra de capacidad es un carril de ancho fijo (137 px a 1080p) que se
 * llena de amarillo según las plazas ("5/7"); lo que falta es tostado.
 * Medir solo lo amarillo daba una escala falsa en portales que no están
 * llenos (y en 0/7 o 1/7 ni siquiera se encontraba), así que se mide el
 * carril completo: amarillo + tostado.
 */
function esTostadoCarril(r, g, b) {
  return r > 120 && r < 175 && g > 88 && g < 135 && b > 25 && b < 75 && r - b > 70;
}

function esCarrilExacto(r, g, b) {
  return esAmarilloBarra(r, g, b) || esTostadoCarril(r, g, b);
}

/** Carril con otros brillos o saturaciones: mismo tono, dos niveles de brillo. */
function carrilAdaptativo(imagen) {
  const amarillo = amarilloAdaptativo(imagen);
  if (!amarillo) {
    // Barra vacía (0/7): solo hay tostado; tono y saturación, brillo medio.
    return (r, g, b) => {
      const c = aHsv(r, g, b);
      return c.h >= 28 && c.h <= 52 && c.s >= 0.45 && c.v >= 0.35 && c.v <= 0.8;
    };
  }
  return (r, g, b) => {
    if (amarillo(r, g, b)) return true;
    const c = aHsv(r, g, b);
    return c.h >= 28 && c.h <= 52 && c.s >= 0.45 && c.v >= 0.3 && c.v <= 0.75;
  };
}

/**
 * Busca el carril de la barra de capacidad.
 * @returns {{x0:number, x1:number, y0:number, y1:number, ancho:number, alto:number, llenado:number} | null}
 */
export function detectarCarril(imagen) {
  const exacto = buscarCarril(imagen, esCarrilExacto);
  if (exacto) return exacto;
  const tolerante = carrilAdaptativo(imagen);
  return tolerante ? buscarCarril(imagen, tolerante) : null;
}

function buscarCarril(imagen, esCarril) {
  const { width, height, data } = imagen;
  const enCarril = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = (y * width + x) * 4;
    return esCarril(data[i], data[i + 1], data[i + 2]);
  };

  // 1. Tramos horizontales largos (el texto "5/7" y el ícono los cortan un poco).
  const candidatos = [];
  for (let y = 0; y < height; y++) {
    let inicio = -1;
    let ultimo = -10;
    for (let x = 0; x <= width; x++) {
      const si = x < width && enCarril(x, y);
      if (si) {
        if (inicio < 0 || x - ultimo > 6) {
          if (inicio >= 0 && ultimo - inicio + 1 >= 40) candidatos.push({ x0: inicio, x1: ultimo, y });
          inicio = x;
        }
        ultimo = x;
      }
    }
    if (inicio >= 0 && ultimo - inicio + 1 >= 40) candidatos.push({ x0: inicio, x1: ultimo, y });
  }
  candidatos.sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0));

  // 2. El primero que tenga forma de barra: banda delgada y aislada.
  const vistos = new Set();
  for (const c of candidatos.slice(0, 60)) {
    const clave = `${c.x0}:${Math.floor(c.y / 4)}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const carril = validarCarril(c, enCarril);
    if (carril) return carril;
  }
  return null;
}

function validarCarril(candidato, enCarril) {
  const largo = candidato.x1 - candidato.x0 + 1;
  // Alto: columnas junto al extremo izquierdo (siempre parte del carril).
  const columna = (y) => [2, 3, 4].some((d) => enCarril(candidato.x0 + d, y));
  let y0 = candidato.y;
  let y1 = candidato.y;
  while (columna(y0 - 1) && candidato.y - y0 < largo) y0 -= 1;
  while (columna(y1 + 1) && y1 - candidato.y < largo) y1 += 1;
  const alto = y1 - y0 + 1;
  if (alto < Math.max(3, largo * 0.035) || alto > largo * 0.11) return null;

  // Columnas del carril: la mitad o más de sus filas son del carril.
  const esColumna = (x) => {
    let cuenta = 0;
    for (let y = y0; y <= y1; y++) if (enCarril(x, y)) cuenta += 1;
    return cuenta >= alto * 0.5;
  };
  const hueco = Math.max(2, Math.round(alto * 0.6));
  let x0 = candidato.x0;
  let x1 = candidato.x0;
  for (let x = candidato.x0, sin = 0; sin <= hueco; x++) {
    if (esColumna(x)) {
      x1 = x;
      sin = 0;
    } else {
      sin += 1;
    }
  }
  for (let x = candidato.x0 - 1, sin = 0; sin <= hueco && x >= 0; x--) {
    if (esColumna(x)) {
      x0 = x;
      sin = 0;
    } else {
      sin += 1;
    }
  }
  const ancho = x1 - x0 + 1;
  // Proporción de la barra: 8-9 px de alto por 137 de ancho (≈ 0,06). El
  // borde del pergamino del título es del mismo tostado, pero mucho más
  // largo y fino.
  if (ancho < 40 || alto < ancho * 0.04 || alto > ancho * 0.09) return null;

  // Aislada: justo encima y debajo no sigue el carril (es una barra, no
  // una zona grande del mapa de ese color).
  const fuera = (y) => {
    let cuenta = 0;
    for (let x = x0; x <= x1; x += 2) if (enCarril(x, y)) cuenta += 1;
    return cuenta / Math.ceil(ancho / 2);
  };
  if (fuera(y0 - 2) > 0.3 || fuera(y1 + 2) > 0.3) return null;

  return { x0, x1, y0, y1, ancho, alto };
}

/**
 * Regiones del recuadro a partir del carril (medidas a 1080p, carril de
 * 137 px): el nombre del destino va justo encima (de −0,15 a −0,05
 * anchos) y la línea del tiempo debajo (de 0,095 a 0,2), alineada a la
 * derecha; el recuadro se ensancha con nombres largos, así que la región
 * del tiempo llega hasta 1,62 anchos.
 */
export function regionesCarril(carril, imagen) {
  const W = carril.ancho;
  const region = (x, y, an, al) =>
    recortarALimites(
      { x: Math.round(carril.x0 + x * W), y: Math.round(carril.y0 + y * W), ancho: Math.round(an * W), alto: Math.round(al * W) },
      imagen
    );
  return {
    recuadro: region(-0.45, -0.42, 2.05, 0.68),
    destino: region(0.28, -0.155, 1.25, 0.11),
    tiempo: region(0.3, 0.095, 1.32, 0.105),
  };
}

/**
 * Busca el pergamino del título en la mitad superior de la imagen: la
 * primera banda de filas con mucho color pergamino. Devuelve la región
 * de su panel izquierdo, donde van el tier y el nombre del camino.
 */
export function regionTitulo(imagen) {
  // En capturas de pantalla completa el título está en la mitad superior;
  // un recorte pequeño (solo el título) se revisa entero.
  const limite = imagen.height >= 400 ? Math.floor(imagen.height * 0.5) : imagen.height;
  const estricta = buscarPergamino(imagen, esPergamino, limite);
  if (estricta) return estricta;
  const tolerante = pergaminoAdaptativo(imagen, limite);
  // Tolerante: la banda debe ser gruesa (≥ 2 % del alto) para no tomar la
  // barra de capacidad por el pergamino.
  return tolerante ? buscarPergamino(imagen, tolerante, limite, Math.max(8, Math.round(imagen.height * 0.02))) : null;
}

function buscarPergamino(imagen, esPergaminoColor, limite, minFilas = 8) {
  const { width, data } = imagen;
  const filas = [];

  for (let y = 0; y < limite; y++) {
    let cuenta = 0;
    let izquierda = -1;
    let derecha = -1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (esPergaminoColor(data[i], data[i + 1], data[i + 2])) {
        cuenta += 1;
        if (izquierda < 0) izquierda = x;
        derecha = x;
      }
    }
    filas.push({ y, cuenta, izquierda, derecha });
  }

  // Filas donde el pergamino ocupa al menos 100 px o un 5 % del ancho.
  const umbral = Math.max(100, width * 0.05);
  const banda = [];
  for (const fila of filas) {
    if (fila.cuenta >= umbral) banda.push(fila);
    else if (banda.length >= minFilas) break;
    else banda.length = 0;
  }
  if (banda.length < minFilas) return null;

  const izquierda = Math.min(...banda.map((f) => f.izquierda));
  const derecha = Math.max(...banda.map((f) => f.derecha));
  const top = banda[0].y;
  const alto = banda[banda.length - 1].y - top + 1;
  // El pergamino completo tiene tres paneles; el título ocupa el primero
  // (~29 % del ancho total). Si la captura es un recorte de solo ese
  // panel, se usa entero.
  const anchoTotal = derecha - izquierda + 1;
  const anchoTitulo = anchoTotal > alto * 8 ? Math.round(anchoTotal * 0.29) : anchoTotal;

  return recortarALimites({ x: izquierda, y: top, ancho: anchoTitulo, alto }, imagen);
}

function recortarALimites(region, { width, height }) {
  const x = Math.max(0, region.x);
  const y = Math.max(0, region.y);
  const ancho = Math.min(width - x, region.ancho - (x - region.x));
  const alto = Math.min(height - y, region.alto - (y - region.y));
  return ancho > 0 && alto > 0 ? { x, y, ancho, alto } : null;
}

/**
 * Prepara una región para el OCR: la recorta, la escala (bilineal), la
 * pasa a gris, opcionalmente la invierte (texto claro sobre fondo oscuro
 * → texto oscuro sobre claro) y estira el contraste. Con `binarizar`,
 * además la deja en blanco y negro puro con el umbral de Otsu, que
 * elimina los reflejos del fondo del mapa.
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function prepararParaOcr(imagen, region, { escala = 3, invertir = false, binarizar = false } = {}) {
  const { width, data } = imagen;
  const anchoSalida = Math.round(region.ancho * escala);
  const altoSalida = Math.round(region.alto * escala);
  const gris = new Float32Array(anchoSalida * altoSalida);

  const luz = (x, y) => {
    const xi = Math.min(region.x + region.ancho - 1, Math.max(region.x, x));
    const yi = Math.min(region.y + region.alto - 1, Math.max(region.y, y));
    const i = (yi * width + xi) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  let minimo = 255;
  let maximo = 0;
  for (let y = 0; y < altoSalida; y++) {
    const fy = region.y + (y + 0.5) / escala - 0.5;
    const y0 = Math.floor(fy);
    const dy = fy - y0;
    for (let x = 0; x < anchoSalida; x++) {
      const fx = region.x + (x + 0.5) / escala - 0.5;
      const x0 = Math.floor(fx);
      const dx = fx - x0;
      let v =
        luz(x0, y0) * (1 - dx) * (1 - dy) +
        luz(x0 + 1, y0) * dx * (1 - dy) +
        luz(x0, y0 + 1) * (1 - dx) * dy +
        luz(x0 + 1, y0 + 1) * dx * dy;
      if (invertir) v = 255 - v;
      gris[y * anchoSalida + x] = v;
      if (v < minimo) minimo = v;
      if (v > maximo) maximo = v;
    }
  }

  const rango = Math.max(1, maximo - minimo);
  for (let i = 0; i < gris.length; i++) gris[i] = ((gris[i] - minimo) / rango) * 255;
  const corte = binarizar ? umbralOtsu(gris) : null;

  const salida = new Uint8ClampedArray(anchoSalida * altoSalida * 4);
  for (let i = 0; i < gris.length; i++) {
    const v = corte === null ? gris[i] : gris[i] > corte ? 255 : 0;
    salida[i * 4] = v;
    salida[i * 4 + 1] = v;
    salida[i * 4 + 2] = v;
    salida[i * 4 + 3] = 255;
  }
  return { width: anchoSalida, height: altoSalida, data: salida };
}

/** Umbral de Otsu: el nivel de gris que mejor separa texto y fondo. */
export function umbralOtsu(gris) {
  const histograma = new Array(256).fill(0);
  for (const v of gris) histograma[Math.max(0, Math.min(255, Math.round(v)))] += 1;

  const total = gris.length;
  let sumaTotal = 0;
  for (let i = 0; i < 256; i++) sumaTotal += i * histograma[i];

  let sumaFondo = 0;
  let pesoFondo = 0;
  let mejorVarianza = -1;
  let mejor = 127;
  for (let t = 0; t < 256; t++) {
    pesoFondo += histograma[t];
    if (!pesoFondo) continue;
    const pesoFrente = total - pesoFondo;
    if (!pesoFrente) break;
    sumaFondo += t * histograma[t];
    const mediaFondo = sumaFondo / pesoFondo;
    const mediaFrente = (sumaTotal - sumaFondo) / pesoFrente;
    const varianza = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2;
    if (varianza > mejorVarianza) {
      mejorVarianza = varianza;
      mejor = t;
    }
  }
  return mejor;
}
