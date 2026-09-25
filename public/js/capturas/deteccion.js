/**
 * deteccion.js
 * ----------------------------------------------------------------------
 * Localiza en una captura del juego las dos regiones que hay que leer:
 *
 *  - El recuadro que aparece al pasar el cursor por un portal de Avalon
 *    ("Camino de Avalon a · <destino> · se cierra 17 h 16 m"). Se ubica
 *    por su barra de capacidad, de un amarillo muy concreto (255,178,18)
 *    que no aparece en ningún otro lugar de la interfaz.
 *  - El título del camino actual ("VI · Xetos-Obursum"), en el pergamino
 *    claro de la parte superior.
 *
 * Todas las posiciones se calculan en proporción al tamaño de la barra o
 * del pergamino, así que funciona con cualquier resolución o escala de
 * interfaz, y también con recortes parciales de la pantalla.
 *
 * Funciones puras sobre { width, height, data } (RGBA, como ImageData),
 * sin DOM: se prueban en Node.
 * ----------------------------------------------------------------------
 */

const MIN_LARGO_BARRA = 24;

function esAmarilloBarra(r, g, b) {
  return r > 230 && g > 150 && g < 205 && b < 70;
}

function esPergamino(r, g, b) {
  return r > 215 && g > 160 && g < 225 && b > 95 && b < 175 && r - b > 70;
}

/**
 * Busca la barra de capacidad del recuadro del portal: el tramo
 * horizontal más largo de amarillo. El texto "7/7" y el ícono de persona
 * van dibujados encima y la parten en trozos, así que los trozos
 * separados por huecos pequeños se unen.
 * @returns {{x0:number, x1:number, y0:number, y1:number} | null}
 */
export function detectarBarra(imagen) {
  const { width, height, data } = imagen;
  let mejor = null;

  for (let y = 0; y < height; y++) {
    const tramos = [];
    let inicio = -1;
    for (let x = 0; x <= width; x++) {
      const i = (y * width + x) * 4;
      const amarillo = x < width && esAmarilloBarra(data[i], data[i + 1], data[i + 2]);
      if (amarillo && inicio < 0) inicio = x;
      if (!amarillo && inicio >= 0) {
        const previo = tramos[tramos.length - 1];
        // Hueco tolerado: 8 px o el 10 % de lo acumulado (resoluciones altas).
        if (previo && inicio - previo[1] - 1 <= Math.max(8, 0.1 * (previo[1] - previo[0] + 1))) {
          previo[1] = x - 1;
        } else {
          tramos.push([inicio, x - 1]);
        }
        inicio = -1;
      }
    }
    for (const [x0, x1] of tramos) {
      const largo = x1 - x0 + 1;
      if (largo >= MIN_LARGO_BARRA && (!mejor || largo > mejor.x1 - mejor.x0 + 1)) {
        mejor = { x0, x1, y0: y, y1: y };
      }
    }
  }
  if (!mejor) return null;

  // Extiende hacia abajo mientras la fila siga siendo amarilla en el
  // centro de la barra (la barra tiene varias filas de alto).
  const centro = Math.round((mejor.x0 + mejor.x1) / 2);
  const esFila = (y) => {
    if (y < 0 || y >= height) return false;
    const i = (y * width + centro) * 4;
    return esAmarilloBarra(data[i], data[i + 1], data[i + 2]);
  };
  while (esFila(mejor.y0 - 1)) mejor.y0 -= 1;
  while (esFila(mejor.y1 + 1)) mejor.y1 += 1;

  return mejor;
}

/**
 * Región del recuadro del portal a partir de su barra. Proporciones
 * medidas en capturas a 1920×1080: barra de ~137 px; el texto va desde
 * ~0,3 anchos de barra por encima hasta ~0,2 por debajo (la línea del
 * tiempo de cierre).
 */
export function regionRecuadro(barra, imagen) {
  const ancho = barra.x1 - barra.x0 + 1;
  return recortarALimites(
    {
      x: Math.round(barra.x0 - 0.12 * ancho),
      y: Math.round(barra.y0 - 0.34 * ancho),
      ancho: Math.round(ancho * 1.62),
      alto: Math.round(ancho * 0.62),
    },
    imagen
  );
}

/**
 * Las dos líneas útiles del recuadro, para leerlas por separado: el
 * nombre del destino (justo encima de la barra) y el tiempo de cierre
 * (debajo, alineado a la derecha). Leer la línea del tiempo sola, con
 * solo dígitos permitidos, evita confundir "17" con "TZ" o "12".
 */
export function regionesRecuadro(barra, imagen) {
  const ancho = barra.x1 - barra.x0 + 1;
  const region = (x, y, an, al) =>
    recortarALimites(
      { x: Math.round(barra.x0 + x * ancho), y: Math.round(barra.y0 + y * ancho), ancho: Math.round(an * ancho), alto: Math.round(al * ancho) },
      imagen
    );
  // Medido a 1920×1080 (barra de 137 px): el nombre ocupa de 0,36 a
  // 0,98 anchos de barra en x y de −0,14 a −0,05 en y; los dígitos del
  // tiempo, de 1,09 a 1,44 en x y de 0,11 a 0,19 en y.
  return {
    destino: region(0.3, -0.16, 1.1, 0.14),
    tiempo: region(0.95, 0.085, 0.6, 0.13),
  };
}

/**
 * Busca el pergamino del título en la mitad superior de la imagen: la
 * primera banda de filas con mucho color pergamino. Devuelve la región
 * de su panel izquierdo, donde van el tier y el nombre del camino.
 */
export function regionTitulo(imagen) {
  const { width, height, data } = imagen;
  // En capturas de pantalla completa el título está en la mitad superior;
  // un recorte pequeño (solo el título) se revisa entero.
  const limite = height >= 400 ? Math.floor(height * 0.5) : height;
  const filas = [];

  for (let y = 0; y < limite; y++) {
    let cuenta = 0;
    let izquierda = -1;
    let derecha = -1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (esPergamino(data[i], data[i + 1], data[i + 2])) {
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
    else if (banda.length >= 8) break;
    else banda.length = 0;
  }
  if (banda.length < 8) return null;

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
