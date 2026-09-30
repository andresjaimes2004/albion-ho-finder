// Evalúa solo el reconocedor de tiempo (tiempo.js) sobre las 106 capturas.
//  - "actual": con las plantillas del proyecto (capturas/plantillas.js).
//  - "loo": plantillas aprendidas con todas las demás capturas (dejando
//    fuera la que se lee): mide cómo generaliza, sin hacer trampa.
// Uso: node evaltiempo.mjs <proyecto> [--detalle] [--generar]
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const proyecto = path.resolve(process.argv[2]);
const detalle = process.argv.includes('--detalle');
const m = (n) => import(pathToFileURL(path.join(proyecto, 'public/js/capturas', n)).href + `?v=${Date.now()}`);
const { detectarCarril, regionesCarril } = await m('deteccion.js');
const T = await m('tiempo.js');
const { PLANTILLAS } = await m('plantillas.js');
const { MARGEN_SEGURO } = await import(pathToFileURL(path.join(proyecto, 'public/js/capturas/lector.js')).href);

const verdad = JSON.parse(fs.readFileSync(new URL('./verdad.json', import.meta.url)));
// Segundos de las capturas de menos de una hora (vistos en la imagen).
const SEGUNDOS = { '2026-09-27 215413': '09', '2026-09-28 204311': '08', '2026-09-29 134804': '17' };
const texto = (id, minutos) => {
  if (minutos < 60) return `${minutos}m${SEGUNDOS[id]}s`;
  const h = Math.floor(minutos / 60);
  const mm = minutos % 60;
  return mm ? `${h}h${String(mm).padStart(2, '0')}m` : `${h}h`;
};

// Recorte de la línea del tiempo de cada captura (en caché, en disco).
const cache = new URL('./lineas-tiempo.json', import.meta.url);
let lineas;
if (fs.existsSync(cache) && !process.argv.includes('--recortar')) lineas = JSON.parse(fs.readFileSync(cache));
else {
  lineas = {};
  for (const id of Object.keys(verdad)) {
    const png = PNG.sync.read(fs.readFileSync(path.join(proyecto, 'muestras-ocr', `Captura de pantalla ${id}.png`)));
    const imagen = { width: png.width, height: png.height, data: png.data };
    const r = regionesCarril(detectarCarril(imagen), imagen).tiempo;
    // Guarda un margen alrededor por si se cambia la región.
    const M = 12;
    const x0 = Math.max(0, r.x - M), y0 = Math.max(0, r.y - M);
    const ancho = r.ancho + 2 * M, alto = r.alto + 2 * M;
    const datos = [];
    for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
      const o = ((y0 + y) * png.width + x0 + x) * 4;
      datos.push(png.data[o], png.data[o + 1], png.data[o + 2], 255);
    }
    lineas[id] = { ancho, alto, datos, region: { x: r.x - x0, y: r.y - y0, ancho: r.ancho, alto: r.alto } };
  }
  fs.writeFileSync(cache, JSON.stringify(lineas));
}
const imagenDe = (id) => ({ width: lineas[id].ancho, height: lineas[id].alto, data: Uint8ClampedArray.from(lineas[id].datos) });

const ids = Object.keys(verdad).sort();
const caracteres = {};
for (const id of ids) caracteres[id] = T.leerCaracteres(imagenDe(id), lineas[id].region, PLANTILLAS);

function evaluar(plantillasPara, nombre) {
  let bien = 0, confiados = 0, dudosos = 0, vacios = 0;
  const fallos = [];
  for (const id of ids) {
    const pl = plantillasPara(id);
    const cs = T.leerCaracteres(imagenDe(id), lineas[id].region, pl);
    const r = T.interpretarCaracteres(cs);
    const real = verdad[id].minutos;
    const seguro = r && r.margen >= MARGEN_SEGURO;
    if (r && r.minutos === real) bien += 1;
    else {
      if (!r) vacios += 1;
      else if (seguro) confiados += 1;
      fallos.push(`${id}: ${r ? r.texto : '—'} / ${texto(id, real)}${r && seguro ? '  ← CONFIADO' : ''}`);
    }
    if (r && !seguro) dudosos += 1;
  }
  console.log(`${nombre}: ${bien}/${ids.length} · confiados ${confiados} · sin lectura ${vacios} · marcados dudosos ${dudosos}`);
  if (detalle) for (const f of fallos) console.log('   ' + f);
}

evaluar(() => PLANTILLAS, 'plantillas actuales');
const todas = ids.map((id) => ({ id, caracteres: caracteres[id], texto: texto(id, verdad[id].minutos) }));
// Poda: quita ejemplos casi iguales a otro ya guardado de la misma clase.
const podaArg = process.argv.find((a) => a.startsWith('--podar='));
const PODA = podaArg ? Number(podaArg.split('=')[1]) : null;
function podar(pl) {
  if (!PODA) return pl;
  const guardados = [];
  for (const e of pl.ejemplos) {
    const igual = guardados.some((g) => g.c === e.c && g.v.reduce((s, x, k) => s + x * e.v[k], 0) / 1e6 >= PODA);
    if (!igual) guardados.push(e);
  }
  return { ejemplos: guardados };
}
evaluar((id) => podar(T.entrenar(todas.filter((l) => l.id !== id))), `leave-one-out${PODA ? ' poda ' + PODA : ''}`);

if (process.argv.includes('--generar')) {
  const pl = podar(T.entrenar(todas));
  const destino = path.join(proyecto, 'public/js/capturas/plantillas.js');
  const cabecera = fs.readFileSync(destino, 'utf8').split('export const PLANTILLAS')[0];
  fs.writeFileSync(destino, `${cabecera}export const PLANTILLAS = ${JSON.stringify(pl)};\n`);
  console.log(`plantillas.js regenerado: ${pl.ejemplos.length} ejemplos de ${todas.length} líneas`);
}
