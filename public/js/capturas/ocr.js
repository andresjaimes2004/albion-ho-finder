/**
 * ocr.js
 * ----------------------------------------------------------------------
 * Lee una captura del juego en el navegador. La lógica está en
 * lector.js (sin DOM, probada con capturas reales); aquí solo se prepara
 * la imagen y se conecta el OCR genérico para los nombres.
 *
 * El OCR es Tesseract.js (Apache 2.0), servido desde /vendor para que la
 * política de seguridad siga permitiendo solo scripts propios. Se carga
 * la primera vez que alguien pega una captura (≈9 MB, luego queda en la
 * caché del navegador) y se reutiliza un único worker. El tiempo de
 * cierre no lo necesita: lo lee un reconocedor propio (tiempo.js).
 *
 * La imagen nunca sale del navegador: al servidor solo se envía el
 * resultado que el usuario confirma.
 * ----------------------------------------------------------------------
 */

import { leerImagen } from './lector.js';

const BASE = '/vendor/tesseract-5.1.1';

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
  // Sin close() cada captura dejaba su imagen completa en memoria: tras
  // muchas capturas la pestaña se volvía lenta hasta atascarse.
  bitmap.close();
  const imagen = contexto.getImageData(0, 0, lienzo.width, lienzo.height);

  const reconocer = async (preparada, { psm, permitidos = '' }) => {
    const worker = await obtenerTrabajador();
    await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: permitidos });
    const { data } = await worker.recognize(aCanvas(preparada));
    return data.text.trim();
  };

  const resultado = await leerImagen(imagen, indiceZonas, { reconocer });
  resultado.vista = resultado.recuadro ? vistaPrevia(lienzo, resultado.recuadro) : null;
  return resultado;
}

/**
 * Descarta el worker (por ejemplo, si una lectura se quedó colgada): la
 * siguiente captura crea uno nuevo en vez de esperar detrás de la atascada.
 */
export function reiniciarOcr() {
  const actual = trabajador;
  trabajador = null;
  if (actual) actual.then((worker) => worker.terminate()).catch(() => {});
}

/** Descarga el OCR por adelantado (por ejemplo, al abrir el panel de registro). */
export function precargarOcr() {
  return obtenerTrabajador().catch(() => {});
}
