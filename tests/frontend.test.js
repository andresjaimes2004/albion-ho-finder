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

test('al cambiar de idioma el estado se guarda, se recupera una sola vez y caduca', async () => {
  // sessionStorage y enlaces de idioma mínimos (Node no tiene navegador).
  const almacen = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: (k) => almacen.delete(k),
  };
  const enlaces = [
    { atributos: { 'aria-current': 'true' }, oyentes: [] },
    { atributos: {}, oyentes: [] },
  ].map((e) => ({
    ...e,
    getAttribute: (n) => e.atributos[n] || null,
    addEventListener: (_tipo, fn) => e.oyentes.push(fn),
    clic: () => e.oyentes.forEach((fn) => fn()),
  }));
  globalThis.document = { querySelectorAll: () => enlaces };
  try {
    const { guardarAlCambiarIdioma, recuperarEstadoIdioma } = await import(pathToFileURL(path.join(CARPETA_JS, 'estadoIdioma.js')).href);
    guardarAlCambiarIdioma(() => ({ caminos: { mapaAbierto: 'Ouyos-Aoeuam' }, scroll: 700 }));

    enlaces[0].clic(); // el idioma actual: no guarda nada
    assert.equal(recuperarEstadoIdioma(), null);

    enlaces[1].clic();
    assert.deepEqual(recuperarEstadoIdioma(), { caminos: { mapaAbierto: 'Ouyos-Aoeuam' }, scroll: 700 });
    assert.equal(recuperarEstadoIdioma(), null, 'solo se recupera una vez');

    // Caducado (más de un minuto) o dañado: se ignora.
    sessionStorage.setItem('estado-al-cambiar-idioma', JSON.stringify({ en: Date.now() - 120_000, estado: { scroll: 1 } }));
    assert.equal(recuperarEstadoIdioma(), null);
    sessionStorage.setItem('estado-al-cambiar-idioma', '{no es json');
    assert.equal(recuperarEstadoIdioma(), null);
  } finally {
    delete globalThis.sessionStorage;
    delete globalThis.document;
  }
});

test('nada del contenido puede quedar por encima de la cabecera fija (escala de capas)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const capa = (nombre) => Number((css.match(new RegExp(`--${nombre}:\\s*(\\d+)`)) || [])[1]);
  const cabecera = capa('capa-cabecera');
  assert.ok(cabecera > 0, 'la escala define --capa-cabecera');
  assert.match(css, /\.cabecera\s*\{[^}]*z-index:\s*var\(--capa-cabecera\)/, 'la cabecera usa su capa');
  // Lo que se eleva mientras se usa (paneles, alerta de un campo) queda debajo.
  assert.ok(capa('capa-elevada') < cabecera);
  assert.ok(capa('capa-alerta-campo') < cabecera);
  assert.ok(capa('capa-avisos') > cabecera, 'las notificaciones (abajo) sí van encima');
  // Ningún z-index numérico del contenido llega a la cabecera; los paneles
  // en uso solo suben con la variable.
  const numericos = [...css.matchAll(/([^{}]+)\{[^{}]*?z-index:\s*(-?\d+)/g)].map((m) => ({ selector: m[1].trim(), valor: Number(m[2]) }));
  const altos = numericos.filter((z) => z.valor >= cabecera);
  assert.deepEqual(altos, []);
  assert.doesNotMatch(css, /:focus-within\s*\{[^}]*z-index:\s*\d/, 'los paneles en uso suben con --capa-elevada');
});

test('cada texto de t() y tn() en el JavaScript tiene su traducción al inglés', () => {
  const diccionario = fs.readFileSync(path.join(CARPETA_JS, 'i18n.js'), 'utf8');
  const tiene = (clave) =>
    diccionario.includes(`'${clave}':`) || diccionario.includes(`${JSON.stringify(clave.replace(/\\'/g, "'"))}:`);
  const faltan = [];
  for (const { nombre, codigo } of archivosJs()) {
    if (nombre.endsWith('i18n.js')) continue;
    const claves = [
      ...[...codigo.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]),
      ...[...codigo.matchAll(/\btn\([^,]+,\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g)].flatMap((m) => [m[1], m[2]]),
    ];
    for (const clave of claves) if (!tiene(clave)) faltan.push(`${nombre}: ${clave}`);
  }
  assert.deepEqual(faltan, []);
});

test('editar desde la raíz: el aviso y los botones de cada modo de edición', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'vistas', 'index.html'), 'utf8');
  for (const id of ['registro-edicion-raiz', 'registro-edicion-conjunto', 'registro-edicion-invertir']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  // El aviso del conjunto solo en su modo; en él no hay ↑ ↓, invertir ni "desde la raíz".
  assert.match(css, /\.registro__edicion-conjunto \{ display: none; \}/);
  assert.match(css, /\.registro--conjunto \.registro__edicion-conjunto \{ display: block; \}/);
  assert.match(css, /\.registro--conjunto :is\(\.registro__edicion-ruta, #registro-edicion-raiz, #registro-edicion-invertir\) \{ display: none; \}/);
  assert.match(css, /\.registro--edicion \.registro__mover \{ display: inline-flex; \}/);
  assert.doesNotMatch(css, /\.registro--conjunto \.registro__mover/);
});
