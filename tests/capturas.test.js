'use strict';

/**
 * Pruebas de la lectura de capturas del juego (public/js/capturas): la
 * detección de regiones sobre imágenes sintéticas con los colores reales
 * de la interfaz, y la interpretación de textos tal como los devolvió el
 * OCR con capturas reales (Albion West, cliente en español, 1920×1080).
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const raiz = path.join(__dirname, '..', 'public', 'js', 'capturas');
const cargar = (archivo) => import(pathToFileURL(path.join(raiz, archivo)).href);

let det;
let lec;
let indice;
test.before(async () => {
  det = await cargar('deteccion.js');
  lec = await cargar('lectura.js');
  indice = lec.crearIndiceZonas(require('../data/zonas_albion.json').zonas);
});

/** Imagen RGBA de fondo oscuro con rectángulos de color. */
function imagen(ancho, alto, rectangulos) {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let i = 0; i < data.length; i += 4) data.set([22, 18, 25, 255], i);
  for (const [x0, y0, x1, y1, color] of rectangulos) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data.set([...color, 255], (y * ancho + x) * 4);
  }
  return { width: ancho, height: alto, data };
}

const AMARILLO_BARRA = [255, 178, 18];
const PERGAMINO = [250, 195, 136];
const OSCURO = [82, 75, 79];

// ------------------------------------------------------------ detección --

test('encuentra la barra de capacidad aunque el texto "7/7" la parta en trozos', () => {
  const img = imagen(400, 200, [
    [100, 120, 236, 127, AMARILLO_BARRA],
    // Ícono y texto dibujados encima de la barra (huecos de 2 a 5 px).
    [156, 120, 160, 127, OSCURO],
    [166, 120, 168, 127, OSCURO],
  ]);
  const barra = det.detectarBarra(img);
  assert.deepEqual({ x0: barra.x0, x1: barra.x1, y0: barra.y0 }, { x0: 100, x1: 236, y0: 120 });

  const { destino, tiempo } = det.regionesRecuadro(barra, img);
  assert.ok(destino.y + destino.alto <= 120, 'el nombre va encima de la barra');
  assert.ok(tiempo.y > 127, 'el tiempo va debajo de la barra');
  assert.ok(tiempo.x > barra.x0 + 100, 'el tiempo va alineado a la derecha');
});

test('sin barra amarilla no hay recuadro', () => {
  assert.equal(det.detectarBarra(imagen(200, 100, [[10, 10, 190, 20, OSCURO]])), null);
  assert.equal(det.detectarBarra(imagen(200, 100, [[10, 10, 20, 15, AMARILLO_BARRA]])), null, 'demasiado corta');
});

test('las regiones escalan con el tamaño de la barra (otra resolución)', () => {
  const img = imagen(800, 400, [[200, 240, 473, 255, AMARILLO_BARRA]]);
  const barra = det.detectarBarra(img);
  const normal = det.regionesRecuadro({ x0: 100, x1: 236, y0: 120, y1: 127 }, imagen(400, 200, []));
  const doble = det.regionesRecuadro(barra, img);
  assert.ok(Math.abs(doble.tiempo.ancho - normal.tiempo.ancho * 2) <= 2);
});

test('encuentra el panel del título en el pergamino superior', () => {
  // Pantalla completa: pergamino de tres paneles → el título es el primero (~29 %).
  const completa = imagen(1920, 1080, [[545, 155, 1375, 205, PERGAMINO]]);
  const titulo = det.regionTitulo(completa);
  assert.deepEqual([titulo.x, titulo.y, titulo.alto], [545, 155, 51]);
  assert.ok(Math.abs(titulo.ancho - 831 * 0.29) <= 1);

  // Recorte de solo el panel del título: se usa entero.
  const recorte = det.regionTitulo(imagen(300, 80, [[10, 10, 250, 55, PERGAMINO]]));
  assert.equal(recorte.ancho, 241);

  assert.equal(det.regionTitulo(imagen(300, 80, [])), null);
});

test('prepara la región para el OCR: escala, invierte y binariza', () => {
  const img = imagen(40, 20, [[5, 5, 14, 9, [240, 240, 240]]]);
  const salida = det.prepararParaOcr(img, { x: 0, y: 0, ancho: 20, alto: 10 }, { escala: 3, invertir: true, binarizar: true });
  assert.equal(salida.width, 60);
  assert.equal(salida.height, 30);
  const valores = new Set();
  for (let i = 0; i < salida.data.length; i += 4) valores.add(salida.data[i]);
  assert.deepEqual([...valores].sort((a, b) => a - b), [0, 255]);
  // El texto claro queda oscuro tras invertir.
  assert.equal(salida.data[(21 * 60 + 30) * 4], 0);
});

test('el umbral de Otsu separa dos grupos de gris', () => {
  const corte = det.umbralOtsu(Float32Array.from([...Array(50).fill(30), ...Array(50).fill(200)]));
  assert.ok(corte >= 30 && corte < 200);
});

// -------------------------------------------------------------- lectura --

test('reconoce los nombres tal como los leyó el OCR en capturas reales', () => {
  const casos = {
    'VI 4 Huritos-luimau\nReglon negra': 'Huritos-Iuimaum', // título cortado por la interfaz
    'VI <b> Huritos-luimaui\nRegión negra': 'Huritos-Iuimaum',
    'VI 42 Xetos-Obursum\nReglon negra': 'Xetos-Obursum',
    '> Sandmount Strand': 'Sandmount Strand',
    '> Peros-Alatmum': 'Peros-Aiataum',
    '> Peros-Alatoum': 'Peros-Aiataum',
    'Melwater Sump': 'Meltwater Sump',
  };
  for (const [leido, esperado] of Object.entries(casos)) {
    const r = lec.mejorZonaEnLineas(leido, indice);
    assert.equal(r && r.zona.nombre, esperado, leido);
  }
  assert.equal(lec.mejorZonaEnLineas('| No A III E DIS', indice), null, 'el ruido no se convierte en una zona');
});

test('convierte el tiempo de cierre a minutos', () => {
  const casos = { '17h 49m': 1069, '17 h49 m': 1069, '0 17h 16 m': 1036, '17 16 m': 1036, '45 m': 45, '3h': 180 };
  for (const [texto, minutos] of Object.entries(casos)) assert.equal(lec.leerMinutos(texto), minutos, texto);
  assert.equal(lec.leerMinutos('hm'), null);
});

test('interpreta una captura completa y descarta tiempos imposibles', () => {
  const r = lec.interpretarCaptura(
    { textoTitulo: 'VI 42 Xetos-Obursum\nReglon negra', textoDestino: '> Peros-Alatmum', textoTiempo: '17h 16m' },
    indice
  );
  assert.equal(r.origen, 'Xetos-Obursum');
  assert.equal(r.destino, 'Peros-Aiataum');
  assert.equal(r.minutos, 1036);
  assert.ok(r.confianza.destino > 0.9);

  const imposible = lec.interpretarCaptura({ textoTitulo: '', textoDestino: '', textoTiempo: '99h 0m' }, indice);
  assert.equal(imposible.minutos, null);
  assert.equal(imposible.origen, null);
});
