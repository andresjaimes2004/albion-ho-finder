'use strict';

/**
 * Pruebas de la versión en inglés: cada texto que se traduce (en la
 * plantilla de la página y en el JavaScript del navegador) debe tener su
 * traducción, y las páginas generadas no pueden dejar marcas sin
 * sustituir.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { generarPaginas, sitemapXml, robotsTxt } = require('../src/http/paginas');

const CARPETA_JS = path.join(__dirname, '..', 'public', 'js');

function archivosJs(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) return archivosJs(ruta);
    return e.name.endsWith('.js') ? [ruta] : [];
  });
}

/** Claves literales de t('...') y tn(n, '...', '...') en el código. */
function clavesUsadas(codigo) {
  const literal = "'((?:[^'\\\\]|\\\\.)*)'";
  const claves = [];
  for (const m of codigo.matchAll(new RegExp(`\\bt\\(\\s*${literal}`, 'g'))) claves.push(m[1]);
  for (const m of codigo.matchAll(new RegExp(`\\btn\\([^,]+,\\s*${literal},\\s*${literal}`, 'g'))) {
    claves.push(m[1], m[2]);
  }
  return claves.map((c) => c.replace(/\\'/g, "'"));
}

test('cada texto traducible del JavaScript tiene traducción al inglés', async () => {
  const { EN } = await import(pathToFileURL(path.join(CARPETA_JS, 'i18n.js')).href);
  const faltan = [];
  let total = 0;
  // i18n.js se excluye: su comentario trae ejemplos de uso, no textos reales.
  for (const archivo of archivosJs(CARPETA_JS).filter((a) => path.basename(a) !== 'i18n.js')) {
    for (const clave of clavesUsadas(fs.readFileSync(archivo, 'utf8'))) {
      total += 1;
      if (!(clave in EN)) faltan.push(`${path.basename(archivo)}: ${clave}`);
    }
  }
  assert.ok(total > 150, `se esperaban muchos textos traducibles y hay ${total}`);
  assert.deepEqual(faltan, []);
});

test('t() sustituye valores y cae al texto original si no hay traducción', async () => {
  const { t, tn } = await import(pathToFileURL(path.join(CARPETA_JS, 'i18n.js')).href);
  // En Node no hay <html lang="en">: el idioma es español.
  assert.equal(t('Temporada {codigo}', { codigo: 'S34' }), 'Temporada S34');
  assert.equal(tn(1, '{n} mapa', '{n} mapas'), '1 mapa');
  assert.equal(tn(3, '{n} mapa', '{n} mapas'), '3 mapas');
  assert.equal(t('Texto sin traducción'), 'Texto sin traducción');
});

test('las páginas en español e inglés se generan sin marcas pendientes', () => {
  const paginas = generarPaginas();
  for (const [idioma, { principal, error }] of Object.entries(paginas)) {
    // Los datos estructurados (JSON) terminan en "}}": se quitan antes de buscar marcas.
    const sinJson = principal.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
    assert.equal(/\{\{|\}\}/.test(sinJson), false, `quedan marcas en la página ${idioma}`);
    assert.equal(/\{\{|\}\}/.test(error), false, `quedan marcas en el 404 ${idioma}`);
    assert.match(principal, new RegExp(`<html lang="${idioma}">`));
  }

  const { es, en } = paginas;
  assert.match(es.principal, /<h1 class="titulo-vista__titulo">Hideouts de la Zona Negra<\/h1>/);
  assert.match(en.principal, /<h1 class="titulo-vista__titulo">Black Zone Guild Hideouts<\/h1>/);
  assert.match(en.principal, /<link rel="canonical" href="https:\/\/albionho\.duckdns\.org\/en\/" \/>/);
  assert.match(es.principal, /hreflang="en" href="https:\/\/albionho\.duckdns\.org\/en\/"/);
  assert.equal(/Buscar gremio|Caminos de Avalon<\/h2>/.test(en.principal), false, 'no quedan textos en español');

  const datos = JSON.parse(en.principal.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(datos[1]['@type'], 'WebApplication');
  assert.equal(datos[1].inLanguage, 'en');
  assert.equal(datos[1].isAccessibleForFree, true);
});

test('robots.txt y sitemap.xml apuntan al dominio público con ambos idiomas', () => {
  assert.match(robotsTxt(), /Disallow: \/api\//);
  assert.match(robotsTxt(), /Sitemap: https:\/\/albionho\.duckdns\.org\/sitemap\.xml/);
  const mapa = sitemapXml();
  assert.match(mapa, /<loc>https:\/\/albionho\.duckdns\.org\/<\/loc>/);
  assert.match(mapa, /<loc>https:\/\/albionho\.duckdns\.org\/en\/<\/loc>/);
  assert.equal((mapa.match(/hreflang="x-default"/g) || []).length, 2);
});
