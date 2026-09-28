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
let tie;
let plantillas;
let indice;
test.before(async () => {
  det = await cargar('deteccion.js');
  lec = await cargar('lectura.js');
  tie = await cargar('tiempo.js');
  plantillas = (await cargar('plantillas.js')).PLANTILLAS;
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
const TOSTADO_BARRA = [145, 111, 48];
const PERGAMINO = [250, 195, 136];
const OSCURO = [82, 75, 79];

/**
 * Barra de capacidad como la del juego: carril de 137×8 px con marco gris,
 * lleno de amarillo según la ocupación (plazas de 7) y tostado el resto.
 */
function barra(x, y, plazas, { escala = 1, amarillo = AMARILLO_BARRA, tostado = TOSTADO_BARRA } = {}) {
  const ancho = 137 * escala;
  const alto = 8 * escala;
  const lleno = Math.round((ancho * plazas) / 7);
  const partes = [[x - 2, y - 2, x + ancho + 1, y + alto + 1, OSCURO]];
  if (lleno > 0) partes.push([x, y, x + lleno - 1, y + alto - 1, amarillo]);
  if (lleno < ancho) partes.push([x + lleno, y, x + ancho - 1, y + alto - 1, tostado]);
  return partes;
}

// ------------------------------------------------------------ detección --

test('mide el carril completo de la barra sea cual sea la ocupación del portal', () => {
  // Antes se medía solo lo amarillo: con 5/7 la escala salía un 30 % menor
  // y los recortes del nombre y del tiempo caían fuera de su sitio.
  for (const plazas of [7, 6, 5, 1, 0]) {
    const img = imagen(600, 300, barra(200, 150, plazas));
    const carril = det.detectarCarril(img);
    assert.ok(carril, `${plazas}/7 se encuentra`);
    assert.deepEqual([carril.x0, carril.y0, carril.ancho, carril.alto], [200, 150, 137, 8], `${plazas}/7`);
  }
});

test('el texto "5/7" y el ícono encima de la barra no la parten', () => {
  const img = imagen(600, 300, [
    ...barra(200, 150, 5),
    [256, 150, 260, 157, [5, 4, 3]],
    [268, 152, 270, 156, [255, 255, 255]],
  ]);
  assert.equal(det.detectarCarril(img).ancho, 137);
});

test('las regiones del recuadro salen del carril: nombre encima, tiempo debajo a la derecha', () => {
  const img = imagen(600, 300, barra(200, 150, 4));
  const carril = det.detectarCarril(img);
  const { destino, tiempo } = det.regionesCarril(carril, img);
  assert.ok(destino.y + destino.alto <= 150, 'el nombre va encima de la barra');
  assert.ok(tiempo.y > 150 + 8, 'el tiempo va debajo de la barra');
  assert.ok(tiempo.x + tiempo.ancho > 200 + 137 * 1.45, 'llega hasta el final de la hora');

  // Otra resolución: todo escala con el carril.
  const doble = imagen(1200, 600, barra(400, 300, 4, { escala: 2 }));
  const regionesDoble = det.regionesCarril(det.detectarCarril(doble), doble);
  assert.ok(Math.abs(regionesDoble.tiempo.ancho - tiempo.ancho * 2) <= 2);
});

test('sin barra no hay recuadro, y el borde del pergamino no se toma por ella', () => {
  assert.equal(det.detectarCarril(imagen(300, 100, [[10, 10, 290, 20, OSCURO]])), null);
  assert.equal(det.detectarCarril(imagen(300, 100, [[10, 10, 30, 15, AMARILLO_BARRA]])), null, 'demasiado corta');
  // Franja tostada larga y fina (borde del pergamino del título).
  assert.equal(det.detectarCarril(imagen(1000, 100, [[50, 40, 880, 45, TOSTADO_BARRA]])), null);
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

test('reconoce títulos que la interfaz corta por delante, por detrás o por ambos lados', () => {
  const casos = {
    'VII €& nfang Wastelar\nReglon negra (Calidad: 6)': 'Sunfang Wasteland',
    'V 4# urthgrove €scar\nReglon negra (Calidad: 2)': 'Southgrove Escarp',
    'VIII 4& emouth Southbl\nReglon negra (Calidad: 3)': 'Stonemouth Southbluff',
    'VII «& rand Quicksan«': 'Sunstrand Quicksands',
    'V4 Whirebank Sho\nReglon negra (Calidad: 1)': 'Whitebank Shore',
  };
  for (const [leido, esperado] of Object.entries(casos)) {
    const r = lec.mejorZonaEnLineas(leido, indice);
    assert.equal(r && r.zona.nombre, esperado, leido);
    assert.ok(r.confianza < 0.9, 'un nombre recortado se marca para revisar');
  }
});

test('lee el tiempo de cierre con la tipografía del juego (capturas reales)', () => {
  // Franjas reales: 10-20 h (el "1" estrecho que el OCR genérico perdía),
  // "12 h" en punto, "42 m 09 s" en rojo y portales a 0/7 y 1/7.
  const { casos } = require('./fixtures/tiempo-capturas.json');
  for (const caso of casos) {
    const gris = Buffer.from(caso.gris, 'base64');
    const data = new Uint8ClampedArray(caso.ancho * caso.alto * 4);
    for (let i = 0; i < gris.length; i++) data.set([gris[i], gris[i], gris[i], 255], i * 4);
    const franja = { width: caso.ancho, height: caso.alto, data };
    const r = tie.leerTiempo(franja, { x: 0, y: 0, ancho: caso.ancho, alto: caso.alto }, plantillas);
    assert.equal(r && r.minutos, caso.minutos, `esperado ${caso.minutos}`);
  }
});

test('la gramática del tiempo rechaza lecturas imposibles en vez de inventarlas', () => {
  const c = (clase, xa, { altura = 1, puntos = 0.9 } = {}) => ({
    clase, xa, xb: xa + 3, puntos, margen: 0.1, altoLinea: 7, rasgos: { alturaRelativa: altura },
  });
  const leer = (lista) => tie.interpretarCaracteres(lista);
  assert.equal(leer([c('1', 0), c('8', 5), c('h', 12), c('0', 19), c('3', 24), c('m', 31)]).minutos, 18 * 60 + 3);
  assert.equal(leer([c('1', 0), c('2', 5), c('h', 12)]).minutos, 720, '"12 h" en punto');
  assert.equal(leer([c('4', 0), c('2', 5), c('m', 12), c('0', 19), c('9', 24), c('s', 31)]).minutos, 42, '"42 m 09 s"');
  // Una minúscula de "se cierra" (baja) no se cuela como cifra de la hora.
  assert.equal(leer([c('6', 0, { altura: 0.7 }), c('3', 5), c('h', 12), c('3', 19), c('3', 24), c('m', 31)]).minutos, 213);
  assert.equal(leer([c('7', 0), c('0', 5), c('h', 12), c('0', 19), c('3', 24), c('m', 31)]), null, 'más de 24 h');
  assert.equal(leer([c('3', 0), c('h', 7), c('3', 14), c('m', 21)]), null, 'con horas, los minutos llevan dos cifras');
  assert.equal(leer([c('1', 0), c('5', 5), c('h', 12, { puntos: 0.2 }), c('3', 19), c('1', 24), c('m', 31)]).minutos, 31, 'sin "h" fiable solo quedan los minutos');
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

// ----------------------------------------------------------- encadenar --

test('encadena tramos en cualquier orden y sentido, empezando por la Zona Negra', async () => {
  const { agruparEnRutas, invertirRuta, claveRuta } = await cargar('encadenar.js');
  const grupos = { 'Deepwood Copse': 'zonaNegra', Martlock: 'ciudad' };
  const grupoDe = (z) => grupos[z] || 'avalon';

  const tramos = [
    { origen: 'Ava2', destino: 'Ava1' },
    { origen: 'Ava1', destino: 'Deepwood Copse' },
    null, // fila aún sin datos
    { origen: 'Martlock', destino: 'Ava2' },
    { origen: 'Suelto1', destino: 'Suelto2' },
  ];
  const { rutas, sueltos } = agruparEnRutas(tramos, grupoDe);
  assert.equal(rutas.length, 1);
  assert.deepEqual(rutas[0].zonas, ['Deepwood Copse', 'Ava1', 'Ava2', 'Martlock']);
  assert.deepEqual(rutas[0].indices, [1, 0, 3]);
  assert.deepEqual(sueltos, [2, 4]);

  // Ruta corta: Zona Negra → camino → mapa final.
  const corta = agruparEnRutas([{ origen: 'Ava1', destino: 'Martlock' }, { origen: 'Deepwood Copse', destino: 'Ava1' }], grupoDe);
  assert.deepEqual(corta.rutas[0].zonas, ['Deepwood Copse', 'Ava1', 'Martlock']);

  assert.deepEqual(invertirRuta(rutas[0]).zonas, ['Martlock', 'Ava2', 'Ava1', 'Deepwood Copse']);
  assert.equal(claveRuta(rutas[0].zonas), claveRuta(invertirRuta(rutas[0]).zonas));
});

test('un portal que lleva a varios mapas genera rutas independientes que comparten tramos', async () => {
  const { agruparEnRutas } = await cargar('encadenar.js');
  const grupos = { Negra1: 'zonaNegra', Negra2: 'zonaNegra', Negra3: 'zonaNegra' };
  const grupoDe = (z) => grupos[z] || 'avalon';
  // Capturas en desorden: Negra1 → Ava1, y Ava1 lleva a Negra2 y a Ava2 → Negra3.
  const tramos = [
    { origen: 'Ava2', destino: 'Negra3' },
    { origen: 'Ava1', destino: 'Negra2' },
    { origen: 'Negra1', destino: 'Ava1' },
    { origen: 'Ava1', destino: 'Ava2' },
  ];
  const { rutas, sueltos } = agruparEnRutas(tramos, grupoDe);
  // Entre dos Zonas Negras el sentido es ambiguo (se puede invertir): se compara sin él.
  const sinSentido = (zonas) => [zonas.join(' > '), [...zonas].reverse().join(' > ')].sort()[0];
  const recorridos = rutas.map((r) => sinSentido(r.zonas)).sort();
  assert.deepEqual(recorridos, [
    'Negra1 > Ava1 > Ava2 > Negra3',
    'Negra1 > Ava1 > Negra2',
    'Negra2 > Ava1 > Ava2 > Negra3',
  ]);
  assert.deepEqual(sueltos, [], 'todos los tramos están en alguna ruta');
  // El tramo compartido Negra1–Ava1 aparece en dos rutas.
  assert.equal(rutas.filter((r) => r.indices.includes(2)).length, 2);
  // Cada ruta enlaza bien: los índices siguen el orden de las zonas.
  for (const r of rutas) {
    r.indices.forEach((i, k) => {
      const t = tramos[i];
      assert.deepEqual([t.origen, t.destino].sort(), [r.zonas[k], r.zonas[k + 1]].sort());
    });
  }
});

test('recorre ciclos entre caminos sin repetir zonas y cuenta una vez el mismo portal repetido', async () => {
  const { agruparEnRutas } = await cargar('encadenar.js');
  const grupos = { A: 'zonaNegra', B: 'zonaNegra' };
  const grupoDe = (z) => grupos[z] || 'avalon';
  const tramos = [
    { origen: 'A', destino: 'Ava1' },
    { origen: 'Ava1', destino: 'Ava2' },
    { origen: 'Ava2', destino: 'Ava3' },
    { origen: 'Ava3', destino: 'Ava1' },
    { origen: 'Ava3', destino: 'B' },
    { origen: 'Ava1', destino: 'A' }, // el mismo portal pegado otra vez
  ];
  const { rutas, sueltos } = agruparEnRutas(tramos, grupoDe);
  assert.deepEqual(rutas.map((r) => r.zonas.join(' > ')).sort(), ['A > Ava1 > Ava2 > Ava3 > B', 'A > Ava1 > Ava3 > B'], 'empieza en A: aparece en la captura más antigua');
  assert.deepEqual(sueltos, [5], 'la captura repetida queda fuera de las rutas');
  for (const r of rutas) assert.equal(new Set(r.zonas).size, r.zonas.length, 'sin zonas repetidas');
});

test('una Zona Negra conectada directamente a otra, o un solo tramo, no es una ruta', async () => {
  const { agruparEnRutas } = await cargar('encadenar.js');
  const grupoDe = (z) => (z.startsWith('Negra') ? 'zonaNegra' : 'avalon');
  assert.deepEqual(agruparEnRutas([{ origen: 'Negra1', destino: 'Ava1' }], grupoDe).rutas, []);
  assert.deepEqual(agruparEnRutas([{ origen: 'Negra1', destino: 'Negra2' }], grupoDe).rutas, []);
  // Un camino sin salida conocida tampoco cierra una ruta.
  assert.deepEqual(agruparEnRutas([{ origen: 'Negra1', destino: 'Ava1' }, { origen: 'Ava1', destino: 'Ava2' }], grupoDe).rutas, []);
});

test('pone un tope a las combinaciones cuando hay muchas bifurcaciones', async () => {
  const { agruparEnRutas } = await cargar('encadenar.js');
  const grupoDe = (z) => (z.startsWith('Negra') ? 'zonaNegra' : 'avalon');
  // Un camino central conectado a 12 mapas de Zona Negra: 66 rutas posibles.
  const tramos = Array.from({ length: 12 }, (_, k) => ({ origen: 'Centro', destino: `Negra${k}` }));
  const { rutas, truncado } = agruparEnRutas(tramos, grupoDe, { maxRutas: 20 });
  assert.equal(rutas.length, 20);
  assert.equal(truncado, true);
  assert.equal(agruparEnRutas(tramos, grupoDe).rutas.length, 40, 'tope por defecto');
});

test('sin catálogo de zonas usa como extremos las zonas con un solo portal', async () => {
  const { agruparEnRutas } = await cargar('encadenar.js');
  const bifurcacion = [{ origen: 'A', destino: 'B' }, { origen: 'B', destino: 'C' }, { origen: 'B', destino: 'D' }];
  assert.deepEqual(agruparEnRutas(bifurcacion).rutas.map((r) => r.zonas.join('')).sort(), ['ABC', 'ABD', 'CBD']);
  const ciclo = [{ origen: 'A', destino: 'B' }, { origen: 'B', destino: 'C' }, { origen: 'C', destino: 'A' }];
  assert.deepEqual(agruparEnRutas(ciclo).rutas, [], 'un ciclo cerrado no tiene extremos');
});

test('detecta barra y título con colores alterados (brillo, saturación, luz nocturna)', () => {
  // Juego más apagado: barra y pergamino con menos saturación y brillo.
  const apagada = imagen(1920, 1080, [
    [545, 155, 1375, 205, [212, 178, 128]],
    ...barra(900, 700, 5, { amarillo: [214, 160, 64], tostado: [128, 100, 52] }),
  ]);
  const carril = det.detectarCarril(apagada);
  assert.deepEqual([carril.x0, carril.y0, carril.ancho], [900, 700, 137], 'la barra, no el pergamino');
  assert.equal(det.regionTitulo(apagada).y, 155);

  // Luz nocturna: casi sin azul; el pergamino deja de cumplir el criterio exacto.
  const nocturna = imagen(1920, 1080, [[545, 155, 1375, 205, [250, 190, 70]]]);
  assert.equal(det.regionTitulo(nocturna).y, 155);

  // Un elemento dorado grueso (no una barra) no se toma por la barra.
  assert.equal(det.detectarCarril(imagen(400, 300, [[50, 50, 250, 200, [200, 150, 40]]])), null);
});
