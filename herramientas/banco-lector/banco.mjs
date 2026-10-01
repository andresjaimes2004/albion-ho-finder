// Banco de pruebas del lector de capturas: lee cada PNG de muestras-ocr con
// el mismo código que el navegador (public/js/capturas) y Tesseract en Node.
// Uso: node banco.mjs <carpeta-proyecto> [--recortes] [filtro]
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const Tesseract = require('tesseract.js');

const proyecto = path.resolve(process.argv[2]);
const conRecortes = process.argv.includes('--recortes');
const filtro = process.argv.slice(3).find((a) => !a.startsWith('--')) || '';
const modulo = (nombre) => import(pathToFileURL(path.join(proyecto, 'public/js/capturas', nombre)).href);

const { leerImagen } = await modulo('lector.js');
const { crearIndiceZonas } = await modulo('lectura.js');
const { detectarCarril, regionesCarril, regionTitulo } = await modulo('deteccion.js');

const zonas = JSON.parse(fs.readFileSync(path.join(proyecto, 'data/zonas_albion.json'), 'utf8')).zonas;
const indice = crearIndiceZonas(zonas);

const worker = await Tesseract.createWorker('eng', 1, {
  langPath: path.join(proyecto, 'public/vendor/tesseract-5.1.1'),
  gzip: false,
  cachePath: path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '.cache'),
});

function aPng({ width, height, data }) {
  const png = new PNG({ width, height });
  if (data.length === width * height * 4) png.data = Buffer.from(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data);
  else {
    // Escala de grises (1 canal) → RGBA.
    for (let i = 0; i < width * height; i++) {
      const v = data[i];
      png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = v;
      png.data[i * 4 + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const reconocer = async (preparada, { psm, permitidos = '' }) => {
  await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: permitidos });
  const { data } = await worker.recognize(aPng(preparada));
  return data.text.trim();
};

function recortar(imagen, r) {
  const png = new PNG({ width: r.ancho, height: r.alto });
  for (let y = 0; y < r.alto; y++) {
    for (let x = 0; x < r.ancho; x++) {
      const o = ((r.y + y) * imagen.width + (r.x + x)) * 4;
      const d = (y * r.ancho + x) * 4;
      for (let k = 0; k < 4; k++) png.data[d + k] = imagen.data[o + k];
    }
  }
  return PNG.sync.write(png);
}

const carpeta = path.join(proyecto, 'muestras-ocr');
const salidaRecortes = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'recortes');
if (conRecortes) fs.mkdirSync(salidaRecortes, { recursive: true });

const resultados = {};
for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith('.png') && f.includes(filtro)).sort()) {
  const png = PNG.sync.read(fs.readFileSync(path.join(carpeta, archivo)));
  const imagen = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
  const r = await leerImagen(imagen, indice, { reconocer });
  const id = archivo.replace('Captura de pantalla ', '').replace('.png', '');
  resultados[id] = { origen: r.origen, destino: r.destino, minutos: r.minutos, confianza: r.confianza, leido: r.leido, aviso: r.aviso, tam: `${png.width}x${png.height}` };
  if (conRecortes) {
    // Recorte del recuadro del portal y del título, para revisar a ojo.
    const carril = detectarCarril(imagen);
    const titulo = regionTitulo(imagen);
    if (carril) {
      const reg = regionesCarril(carril, imagen);
      const rec = reg.recuadro;
      if (rec) fs.writeFileSync(path.join(salidaRecortes, `${id}-portal.png`), recortar(imagen, rec));
    }
    if (titulo) fs.writeFileSync(path.join(salidaRecortes, `${id}-titulo.png`), recortar(imagen, titulo));
  }
  process.stderr.write('.');
}
await worker.terminate();
process.stdout.write(JSON.stringify(resultados, null, 1));
