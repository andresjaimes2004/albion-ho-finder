'use strict';

/**
 * Pruebas de la importación por lotes de imágenes de mapas
 * (scripts/importarImagenesMapas.js), sobre una base de datos temporal.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-imagenes-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;

const MapaRepository = require('../src/repositories/MapaRepository');
const importarImagenesMapas = require('../scripts/importarImagenesMapas');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);

function geo(id, nombre) {
  return { id, nombre, tipo: 'OPENPVP_BLACK_1', mundo: [0, 0], limites: { min: [-100, -100], max: [100, 100] } };
}

let mapaRepo;
let timbertop;
let avalanche;
let conImagen;
const carpetas = [];

function carpetaCon(archivos) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'albion-imagenes-'));
  carpetas.push(carpeta);
  for (const [nombre, datos] of Object.entries(archivos)) fs.writeFileSync(path.join(carpeta, nombre), datos);
  return carpeta;
}

test.before(() => {
  mapaRepo = new MapaRepository();
  timbertop = mapaRepo.obtenerOCrear('Timbertop Escarp');
  avalanche = mapaRepo.obtenerOCrear('Avalanche Incline');
  conImagen = mapaRepo.obtenerOCrear('Deepwood Copse');
  mapaRepo.guardarGeo(timbertop.id, geo('1353', 'Timbertop Escarp'));
  mapaRepo.guardarGeo(avalanche.id, geo('4358', 'Avalanche Incline'));
  mapaRepo.guardarGeo(conImagen.id, geo('0356', 'Deepwood Copse'));
  mapaRepo.guardarImagen(conImagen.id, { mime: 'image/png', datos: PNG, usuarioId: null });
  mapaRepo.guardarAjusteImagen(conImagen.id, { escala: 1.5, dx: 10, dy: 0, rotacion: 90 });
});

test.after(() => {
  // En Windows no se puede borrar un archivo abierto: cerrar la conexión primero.
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(DB_TEMPORAL + sufijo, { force: true });
  for (const carpeta of carpetas) fs.rmSync(carpeta, { recursive: true, force: true });
});

test('reconoce el mapa por el id del cluster o por su nombre', () => {
  const indices = {
    porCluster: new Map([['1353', { nombre: 'Timbertop Escarp' }]]),
    porNombre: new Map([['avalancheincline', { nombre: 'Avalanche Incline' }]]),
  };
  assert.equal(importarImagenesMapas.mapaDelArchivo('1353_WRL_FR_AUTO_T8_MOR_OUT_Q1.png', indices).nombre, 'Timbertop Escarp');
  assert.equal(importarImagenesMapas.mapaDelArchivo('1353.webp', indices).nombre, 'Timbertop Escarp');
  assert.equal(importarImagenesMapas.mapaDelArchivo('Avalanche-Incline.PNG', indices).nombre, 'Avalanche Incline');
  assert.equal(importarImagenesMapas.mapaDelArchivo('9999_WRL_X.png', indices), null);
});

test('--simular no escribe nada', () => {
  const carpeta = carpetaCon({ '1353_WRL_FR_AUTO_T8_MOR_OUT_Q1.png': PNG });
  const informe = importarImagenesMapas(carpeta, { simular: true });
  assert.equal(informe.importadas.length, 1);
  assert.equal(mapaRepo.obtenerImagenMeta(timbertop.id), null);
});

test('importa las válidas, conserva las existentes y descarta el resto', () => {
  const carpeta = carpetaCon({
    '1353_WRL_FR_AUTO_T8_MOR_OUT_Q1.png': PNG,
    'avalanche incline.webp': WEBP,
    '0356_WRL_SW_AUTO_T6_KPR_OUT_Q2.png': PNG,
    '9999_WRL_NADA.png': PNG,
    '4358_falso.png': Buffer.from('<svg onload="alert(1)"></svg>'),
    'notas.txt': 'se ignora',
  });
  const informe = importarImagenesMapas(carpeta);

  assert.deepEqual(informe.importadas.map((i) => i.mapa).sort(), ['Avalanche Incline', 'Timbertop Escarp']);
  assert.deepEqual(informe.existentes.map((i) => i.mapa), ['Deepwood Copse']);
  assert.deepEqual(informe.sinMapa, ['9999_WRL_NADA.png']);
  assert.deepEqual(informe.invalidas.map((i) => i.archivo), ['4358_falso.png']);
  assert.equal(informe.totalArchivos, 5);
  assert.deepEqual(informe.sinImagen, []);

  assert.equal(mapaRepo.obtenerImagenMeta(timbertop.id).mime, 'image/png');
  // Los archivos del cliente son la textura cuadrada del minimapa.
  assert.equal(mapaRepo.obtenerImagenMeta(timbertop.id).proyeccion, 'juego');
  assert.equal(mapaRepo.obtenerImagenMeta(avalanche.id).mime, 'image/webp');
  // La imagen puesta a mano conserva su ajuste.
  assert.equal(mapaRepo.obtenerImagenMeta(conImagen.id).rotacion, 90);
});

test('--reemplazar sustituye la imagen existente y reinicia su ajuste', () => {
  const carpeta = carpetaCon({ '0356_WRL_SW_AUTO_T6_KPR_OUT_Q2.webp': WEBP });
  const informe = importarImagenesMapas(carpeta, { reemplazar: true });
  assert.equal(informe.importadas.length, 1);
  const meta = mapaRepo.obtenerImagenMeta(conImagen.id);
  assert.equal(meta.mime, 'image/webp');
  assert.equal(meta.rotacion, 0);
});

test('falla con un mensaje claro si la carpeta no existe', () => {
  assert.throws(() => importarImagenesMapas(path.join(os.tmpdir(), 'no-existe-xyz')), /No se encontró la carpeta/);
});
