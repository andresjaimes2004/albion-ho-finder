'use strict';

/**
 * Pruebas del frontend que no necesitan navegador:
 *  - las tandas circulares de "Caminos avalonianos" y de los resultados (paginacion.js);
 *  - que cada elemento que el JavaScript busca por id exista en la página
 *    (o lo cree el propio JavaScript): así una reorganización del HTML no
 *    deja botones o secciones sin conectar;
 *  - los estándares del sitio: nada de diálogos nativos del navegador
 *    (confirm, alert, prompt) ni de listas <datalist>, que no siguen el
 *    estilo del sitio (ver README, "Guía de estilo: transiciones").
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { generarPaginas } = require('../src/http/paginas');

const CARPETA_JS = path.join(__dirname, '..', 'public', 'js');
const archivosJs = () =>
  fs
    .readdirSync(CARPETA_JS, { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ nombre: f, codigo: fs.readFileSync(path.join(CARPETA_JS, f), 'utf8') }));

/** El código sin comentarios (para no contar menciones en la documentación). */
const sinComentarios = (codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('las tandas de 10 son circulares: de la última a la primera y al revés', async () => {
  const { tanda } = await import(pathToFileURL(path.join(CARPETA_JS, 'paginacion.js')).href);
  assert.deepEqual(tanda(400, 0, 10), { pagina: 0, paginas: 40, desde: 0, hasta: 10 });
  assert.deepEqual(tanda(400, 39, 10), { pagina: 39, paginas: 40, desde: 390, hasta: 400 });
  assert.equal(tanda(400, 40, 10).pagina, 0, 'siguiente desde la última → primera');
  assert.equal(tanda(400, -1, 10).pagina, 39, 'anterior desde la primera → última');
  assert.equal(tanda(400, -41, 10).pagina, 39);
  // Última tanda incompleta.
  assert.deepEqual(tanda(23, 2, 10), { pagina: 2, paginas: 3, desde: 20, hasta: 23 });
  assert.equal(tanda(23, 3, 10).pagina, 0);
  // Sin elementos o con datos raros: una sola tanda vacía, sin errores.
  assert.deepEqual(tanda(0, 5, 10), { pagina: 0, paginas: 1, desde: 0, hasta: 0 });
  assert.deepEqual(tanda(7, Number.NaN, 10), { pagina: 0, paginas: 1, desde: 0, hasta: 7 });
  assert.deepEqual(tanda(5, 0, 0), { pagina: 0, paginas: 5, desde: 0, hasta: 1 });
});

test('cada id que busca el JavaScript existe en la página o lo crea el propio JavaScript', () => {
  const { es, en } = generarPaginas();
  const idsHtml = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const enEs = idsHtml(es.principal);
  const enEn = idsHtml(en.principal);
  const codigoTotal = archivosJs().map((a) => a.codigo).join('\n');

  const faltan = [];
  for (const { nombre, codigo } of archivosJs()) {
    for (const [, id] of sinComentarios(codigo).matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
      const creadoEnJs = new RegExp(`\\.id = '${id}'|id="${id}"|\\bid: '${id}'`).test(codigoTotal);
      if ((!enEs.has(id) || !enEn.has(id)) && !creadoEnJs) faltan.push(`${nombre}: #${id}`);
    }
  }
  assert.deepEqual(faltan, []);
});

test('ningún id se repite en la página', () => {
  const { es } = generarPaginas();
  const ids = [...es.principal.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(repetidos, []);
});

test('sin diálogos ni listas nativas del navegador (rompen el estilo del sitio)', () => {
  const usos = [];
  for (const { nombre, codigo } of archivosJs()) {
    const limpio = sinComentarios(codigo);
    for (const patron of [/\bwindow\.confirm\(/, /(^|[^.\w])confirm\(/m, /(^|[^.\w])alert\(/m, /\bwindow\.alert\(/, /\bprompt\(/]) {
      if (patron.test(limpio)) usos.push(`${nombre}: ${patron}`);
    }
    if (/setAttribute\('list'/.test(limpio)) usos.push(`${nombre}: <datalist>`);
  }
  const { es } = generarPaginas();
  if (/<datalist/.test(es.principal)) usos.push('index.html: <datalist>');
  assert.deepEqual(usos, []);
});

test('las secciones de Caminos de Avalon están en el orden pedido', () => {
  const { es } = generarPaginas();
  const inicio = es.principal.indexOf('id="vista-caminos"');
  const orden = [
    'input-camino',
    'caminos-detalle',
    'caminos-resultados',
    'registro-alternar',
    'espacios-alternar',
    'caminos-rutas-tarjeta',
    'caminos-todos',
  ].map((id) => es.principal.indexOf(`id="${id}"`, inicio));
  assert.ok(orden.every((pos) => pos > inicio), 'todas existen');
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'buscador → ficha → resultados → registro → espacios → rutas → caminos');
  // Hideouts: el mapa de la Zona Negra justo después del buscador.
  const hideouts = es.principal.slice(es.principal.indexOf('id="vista-hideouts"'));
  assert.ok(hideouts.indexOf('id="mapa-mundial"') < hideouts.indexOf('id="estado-vacio"'));
  assert.ok(hideouts.indexOf('id="estado-vacio"') < hideouts.indexOf('id="historial"'));
});

test('tandas de 9: 400 caminos son 45 tandas y la última tiene 4', async () => {
  const { tanda } = await import(pathToFileURL(path.join(CARPETA_JS, 'paginacion.js')).href);
  assert.deepEqual(tanda(400, 0, 9), { pagina: 0, paginas: 45, desde: 0, hasta: 9 });
  assert.deepEqual(tanda(400, -1, 9), { pagina: 44, paginas: 45, desde: 396, hasta: 400 });
  assert.equal(tanda(400, 45, 9).pagina, 0);
  // Hasta 9 resultados caben en una sola tanda (sin flechas).
  assert.equal(tanda(9, 0, 9).paginas, 1);
  assert.equal(tanda(10, 0, 9).paginas, 2);
});
