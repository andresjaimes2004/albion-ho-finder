/**
 * lectura.js
 * ----------------------------------------------------------------------
 * Interpreta el texto que el OCR lee de una captura del juego:
 *
 *  - reconoce nombres de zona aunque vengan con errores de una o dos
 *    letras ("Peros-Alatmum" → Peros-Aiataum) o cortados por la interfaz
 *    ("Huritos-luimau" → Huritos-Iuimaum), comparándolos con la lista
 *    oficial de zonas;
 *  - convierte el tiempo de cierre ("17h 16m", "45 m") a minutos.
 *
 * No depende del idioma del cliente: solo usa los nombres de zona (que
 * el juego no traduce) y los números con sus unidades h/m.
 *
 * Funciones puras, sin DOM: se prueban en Node.
 * ----------------------------------------------------------------------
 */

/** Clave de comparación: minúsculas, sin tildes y con las confusiones típicas del OCR unificadas. */
export function claveOcr(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[l1|!]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[^a-z]/g, '');
}

/** Distancia de edición (Levenshtein) con corte anticipado. */
export function distancia(a, b, maximo = Infinity) {
  if (Math.abs(a.length - b.length) > maximo) return maximo + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let minimoFila = i;
    for (let j = 1; j <= b.length; j++) {
      const valor = Math.min(
        previa[j] + 1,
        actual[j - 1] + 1,
        previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      actual.push(valor);
      if (valor < minimoFila) minimoFila = valor;
    }
    if (minimoFila > maximo) return maximo + 1;
    previa = actual;
  }
  return previa[b.length];
}

/** Índice de zonas para buscar rápido por clave. */
export function crearIndiceZonas(zonas) {
  return zonas.map((zona) => ({ zona, clave: claveOcr(zona.nombre) }));
}

/**
 * Zona más parecida a un texto leído, o null si ninguna se parece lo
 * suficiente. `confianza` va de 0 a 1.
 */
export function buscarZona(texto, indice) {
  const leida = claveOcr(texto);
  if (leida.length < 4) return null;

  const tolerancia = Math.max(1, Math.floor(leida.length * 0.25));
  let mejor = null;
  for (const { zona, clave } of indice) {
    let d = distancia(leida, clave, tolerancia);
    // Nombre cortado por la interfaz: se compara con el comienzo.
    if (d > tolerancia && leida.length >= 8 && leida.length < clave.length) {
      d = distancia(leida, clave.slice(0, leida.length), tolerancia) + 1;
    }
    if (d <= tolerancia && (!mejor || d < mejor.d)) mejor = { zona, d, clave };
  }
  if (!mejor) return null;
  return { zona: mejor.zona, confianza: 1 - mejor.d / Math.max(leida.length, mejor.clave.length) };
}

/** Busca la mejor zona entre varias líneas (y cada línea sin símbolos iniciales). */
export function mejorZonaEnLineas(texto, indice) {
  let mejor = null;
  for (const linea of String(texto || '').split(/\n+/)) {
    // Descarta símbolos del ícono y números romanos del tier ("VI ◆ Xetos-Obursum").
    const limpia = linea.replace(/^[^A-Za-z]*(?:\b[IVX]{1,4}\b)?[^A-Za-z]*/, '').trim();
    for (const candidato of [limpia, linea]) {
      const r = buscarZona(candidato, indice);
      if (r && (!mejor || r.confianza > mejor.confianza)) mejor = r;
    }
  }
  return mejor;
}

/**
 * Minutos hasta el cierre a partir del texto de la línea del tiempo.
 * Acepta "17h 16m", "17 h49 m", "45 m", "3h" y, si el OCR perdió la
 * "h", "17 16 m".
 */
export function leerMinutos(texto) {
  const t = String(texto || '')
    .toLowerCase()
    .replace(/[oO]/g, '0')
    .replace(/[il|]/g, '1');
  let m = t.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*m/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/(\d{1,2})\s+(\d{1,2})\s*m/);
  if (m && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/(\d{1,2})\s*h/);
  if (m) return Number(m[1]) * 60;
  m = t.match(/(\d{1,2})\s*m/);
  if (m) return Number(m[1]);
  return null;
}

/** Máximo que puede durar abierto un portal de Avalon, con margen. */
export const MAX_MINUTOS = 24 * 60;

/**
 * Junta lo leído de una captura en una conexión propuesta, para que el
 * usuario la revise antes de guardarla.
 */
export function interpretarCaptura({ textoTitulo, textoDestino, textoTiempo }, indice) {
  const origen = mejorZonaEnLineas(textoTitulo, indice);
  const destino = mejorZonaEnLineas(textoDestino, indice);
  const minutos = leerMinutos(textoTiempo);

  return {
    origen: origen ? origen.zona.nombre : null,
    destino: destino ? destino.zona.nombre : null,
    minutos: minutos !== null && minutos > 0 && minutos <= MAX_MINUTOS ? minutos : null,
    confianza: {
      origen: origen ? origen.confianza : 0,
      destino: destino ? destino.confianza : 0,
    },
    leido: { titulo: textoTitulo || '', destino: textoDestino || '', tiempo: textoTiempo || '' },
  };
}
