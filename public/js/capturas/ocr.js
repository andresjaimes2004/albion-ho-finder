/**
 * ocr.js
 * ----------------------------------------------------------------------
 * Lee una captura del juego en el navegador:
 *
 *   imagen → detección de regiones → OCR de cada región → interpretación
 *
 * El OCR es Tesseract.js (Apache 2.0), servido desde /vendor para que la
 * política de seguridad siga permitiendo solo scripts propios. Se carga
 * la primera vez que alguien pega una captura (≈9 MB, luego queda en la
 * caché del navegador) y se reutiliza un único worker.
 *
 * La imagen nunca sale del navegador: al servidor solo se envía el
 * resultado que el usuario confirma.
 * ----------------------------------------------------------------------
 */

import { detectarBarra, regionRecuadro, regionesRecuadro, regionTitulo, prepararParaOcr } from './deteccion.js';
import { interpretarCaptura, leerMinutos } from './lectura.js';

const BASE = '/vendor/tesseract-5.1.1';
const PSM_AUTOMATICO = '3';
const PSM_UNA_LINEA = '7';

let trabajador = null;
let alProgreso = null;

async function obtenerTrabajador() {
  if (!trabajador) {
    trabajador = (async () => {
      const { default: Tesseract } = await import(`${BASE}/tesseract.esm.min.js`);
      return Tesseract.createWorker('eng', 1, {
        workerPath: `${BASE}/worker.min.js`,
        corePath: `${BASE}/tesseract-core-simd-lstm.wasm.js`,
        langPath: BASE,
        gzip: false,
        // Un worker desde blob: lo bloquearía la CSP; se carga desde /vendor.
        workerBlobURL: false,
        logger: (m) => alProgreso && alProgreso(m),
      });
    })().catch((error) => {
      trabajador = null;
      throw error;
    });
  }
  return trabajador;
}

function aCanvas({ width, height, data }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  return canvas;
}

async function leerRegion(worker, imagen, region, { invertir = false, binarizar = false, psm, permitidos = '' }) {
  if (!region) return '';
  const canvas = aCanvas(prepararParaOcr(imagen, region, { escala: 3, invertir, binarizar }));
  await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: permitidos });
  const { data } = await worker.recognize(canvas);
  return data.text.trim();
}

/** Recorte sin procesar de una región, para mostrarlo al usuario. */
function vistaPrevia(fuente, region) {
  const canvas = document.createElement('canvas');
  canvas.width = region.ancho;
  canvas.height = region.alto;
  canvas.getContext('2d').drawImage(fuente, region.x, region.y, region.ancho, region.alto, 0, 0, region.ancho, region.alto);
  return canvas;
}

/**
 * Lee una captura (File o Blob de imagen).
 * @returns {Promise<{ origen, destino, minutos, confianza, leido, vista, aviso }>}
 */
export async function leerCaptura(archivo, indiceZonas, { progreso } = {}) {
  alProgreso = progreso || null;
  const bitmap = await createImageBitmap(archivo);
  const lienzo = document.createElement('canvas');
  lienzo.width = bitmap.width;
  lienzo.height = bitmap.height;
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  contexto.drawImage(bitmap, 0, 0);
  const imagen = contexto.getImageData(0, 0, bitmap.width, bitmap.height);

  const barra = detectarBarra(imagen);
  const titulo = regionTitulo(imagen);
  if (!barra && !titulo) {
    return {
      origen: null, destino: null, minutos: null, confianza: { origen: 0, destino: 0 }, leido: {}, vista: null,
      aviso: 'No se encontró el recuadro del portal ni el título del camino en la imagen.',
    };
  }

  const worker = await obtenerTrabajador();
  const regiones = barra ? regionesRecuadro(barra, imagen) : {};

  const textoTitulo = await leerRegion(worker, imagen, titulo, { psm: PSM_AUTOMATICO });
  const textoDestino = await leerRegion(worker, imagen, regiones.destino, { invertir: true, psm: PSM_UNA_LINEA });
  let textoTiempo = await leerRegion(worker, imagen, regiones.tiempo, {
    invertir: true, binarizar: true, psm: PSM_UNA_LINEA, permitidos: '0123456789hm ',
  });
  // Si en blanco y negro no se entendió el tiempo, se intenta en gris.
  if (regiones.tiempo && leerMinutos(textoTiempo) === null) {
    textoTiempo = await leerRegion(worker, imagen, regiones.tiempo, {
      invertir: true, psm: PSM_UNA_LINEA, permitidos: '0123456789hm ',
    });
  }

  const resultado = interpretarCaptura({ textoTitulo, textoDestino, textoTiempo }, indiceZonas);
  resultado.vista = barra ? vistaPrevia(lienzo, regionRecuadro(barra, imagen)) : null;
  resultado.aviso = barra
    ? null
    : 'No se ve el recuadro de un portal: pasa el cursor por encima del portal antes de sacar la captura.';
  return resultado;
}

/** Descarga el OCR por adelantado (por ejemplo, al abrir el panel de registro). */
export function precargarOcr() {
  return obtenerTrabajador().catch(() => {});
}
