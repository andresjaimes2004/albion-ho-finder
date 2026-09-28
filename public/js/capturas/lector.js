/**
 * lector.js
 * ----------------------------------------------------------------------
 * Lectura completa de una captura, sin DOM (se prueba en Node con las
 * capturas reales de muestra):
 *
 *  1. Localiza el carril de la barra de capacidad del recuadro del
 *     portal (deteccion.js) y, a partir de él, el nombre del destino y la
 *     línea del tiempo de cierre. También el título del mapa actual.
 *  2. El tiempo lo lee el reconocedor propio de la tipografía del juego
 *     (tiempo.js), rápido y exacto. Solo si no lo entiende (otra
 *     resolución, otra escala de interfaz) se recurre al OCR genérico, y
 *     entonces el campo se marca para revisar.
 *  3. Los nombres (destino y origen) se leen con el OCR genérico y se
 *     comparan con la lista oficial de zonas (lectura.js).
 *
 * \`reconocer(imagen, { psm, permitidos })\` es el OCR que se inyecta:
 * Tesseract en el navegador (ocr.js) o en Node (banco de pruebas).
 * ----------------------------------------------------------------------
 */

import { detectarCarril, regionesCarril, regionTitulo, prepararParaOcr } from './deteccion.js';
import { mejorZonaEnLineas, leerMinutos, MAX_MINUTOS } from './lectura.js';
import { leerTiempo } from './tiempo.js';
import { PLANTILLAS } from './plantillas.js';

/**
 * Margen mínimo entre la mejor lectura de cada carácter del tiempo y la
 * segunda: por debajo, el valor se propone pero se marca para revisar.
 * Medido con las capturas de muestra: las lecturas erróneas quedaron por
 * debajo de 0,02 y las correctas, por encima de 0,03.
 */
export const MARGEN_SEGURO = 0.025;

const PSM_AUTOMATICO = '3';
const PSM_UNA_LINEA = '7';

export async function leerImagen(imagen, indice, { reconocer }) {
  const carril = detectarCarril(imagen);
  const titulo = regionTitulo(imagen);
  if (!carril && !titulo) {
    return {
      origen: null,
      destino: null,
      minutos: null,
      confianza: { origen: 0, destino: 0, minutos: 0 },
      leido: {},
      recuadro: null,
      aviso: 'No se encontró el recuadro del portal ni el título del camino en la imagen.',
    };
  }

  const regiones = carril ? regionesCarril(carril, imagen) : {};
  const leer = async (region, { psm, invertir = false, binarizar = false, permitidos = '' }) =>
    region ? reconocer(prepararParaOcr(imagen, region, { escala: 3, invertir, binarizar }), { psm, permitidos }) : '';

  const textoTitulo = await leer(titulo, { psm: PSM_AUTOMATICO });
  const textoDestino = await leer(regiones.destino, { invertir: true, psm: PSM_UNA_LINEA });

  // Tiempo: reconocedor propio; si no encaja, OCR genérico (marcado dudoso).
  let minutos = null;
  let confianzaMinutos = 0;
  let textoTiempo = '';
  const propio = leerTiempo(imagen, regiones.tiempo, PLANTILLAS);
  if (propio && propio.minutos <= MAX_MINUTOS) {
    minutos = propio.minutos;
    confianzaMinutos = propio.margen >= MARGEN_SEGURO ? 1 : 0.5;
    textoTiempo = propio.texto;
  } else if (regiones.tiempo) {
    textoTiempo = await leer(regiones.tiempo, { invertir: true, binarizar: true, psm: PSM_UNA_LINEA, permitidos: '0123456789hms ' });
    const generico = leerMinutos(textoTiempo);
    if (generico !== null && generico > 0 && generico <= MAX_MINUTOS) {
      minutos = generico;
      confianzaMinutos = 0.5;
    }
  }

  const origen = mejorZonaEnLineas(textoTitulo, indice);
  const destino = mejorZonaEnLineas(textoDestino, indice);
  return {
    origen: origen ? origen.zona.nombre : null,
    destino: destino ? destino.zona.nombre : null,
    minutos,
    confianza: {
      origen: origen ? origen.confianza : 0,
      destino: destino ? destino.confianza : 0,
      minutos: confianzaMinutos,
    },
    leido: { titulo: textoTitulo || '', destino: textoDestino || '', tiempo: textoTiempo || '' },
    recuadro: regiones.recuadro || null,
    aviso: carril ? null : 'No se ve el recuadro de un portal: pasa el cursor por encima del portal antes de sacar la captura.',
  };
}
