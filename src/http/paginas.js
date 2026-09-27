'use strict';

const fs = require('fs');
const path = require('path');
const { SEO, EN } = require('../i18n/pagina');

/**
 * paginas.js
 * ----------------------------------------------------------------------
 * Páginas HTML y archivos para buscadores, en español (/) e inglés (/en/).
 *
 *  - La página principal sale de la plantilla src/vistas/index.html: los
 *    textos marcados con {{...}} se traducen (en español se dejan tal
 *    cual) y los {{@variable}} se sustituyen por los datos de SEO del
 *    idioma (título, descripción, URL canónica, hreflang, Open Graph y
 *    datos estructurados de schema.org). Se genera una vez al arrancar.
 *  - Cada idioma tiene su propia URL para que Google indexe los dos.
 *    No se redirige según el idioma del navegador: los buscadores
 *    necesitan poder ver ambas versiones.
 *  - /robots.txt y /sitemap.xml usan la URL pública del sitio
 *    (SITIO_URL), con los enlaces hreflang entre idiomas.
 *  - Cualquier otra ruta responde un 404 real (no la página principal),
 *    para no crear contenido duplicado.
 * ----------------------------------------------------------------------
 */

const IDIOMAS = ['es', 'en'];
const INICIO = { es: '/', en: '/en/' };
const CARPETA_VISTAS = path.join(__dirname, '..', 'vistas');

function urlSitio() {
  return (process.env.SITIO_URL || 'https://albionho.duckdns.org').replace(/\/+$/, '');
}

function escaparAtributo(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** JSON dentro de <script>: sin "<" para que no pueda cerrar la etiqueta. */
function jsonSeguro(valor) {
  return JSON.stringify(valor).replace(/</g, '\\u003c');
}

function datosEstructurados(idioma, url) {
  const seo = SEO[idioma];
  const sitio = urlSitio();
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Albion Navigator',
      url: `${sitio}${INICIO[idioma]}`,
      inLanguage: idioma,
      description: seo.descripcion,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: seo.nombreApp,
      url,
      description: seo.descripcion,
      inLanguage: idioma,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      keywords: seo.palabrasClave.join(', '),
      image: `${sitio}/assets/og-albion-navigator.jpg`,
      author: { '@type': 'Person', name: 'TurnDark' },
      about: { '@type': 'VideoGame', name: 'Albion Online' },
    },
  ];
}

/** Etiquetas de verificación de Google Search Console y Bing Webmaster Tools. */
function verificaciones() {
  const etiquetas = [];
  if (process.env.GOOGLE_SITE_VERIFICATION) {
    etiquetas.push(`<meta name="google-site-verification" content="${escaparAtributo(process.env.GOOGLE_SITE_VERIFICATION)}" />`);
  }
  if (process.env.BING_SITE_VERIFICATION) {
    etiquetas.push(`<meta name="msvalidate.01" content="${escaparAtributo(process.env.BING_SITE_VERIFICATION)}" />`);
  }
  return etiquetas.join('\n  ');
}

function variables(idioma) {
  const sitio = urlSitio();
  const seo = SEO[idioma];
  const url = `${sitio}${INICIO[idioma]}`;
  const actual = 'aria-current="true"';
  return {
    idioma,
    titulo: escaparAtributo(seo.titulo),
    descripcion: escaparAtributo(seo.descripcion),
    urlCanonica: url,
    urlEs: `${sitio}${INICIO.es}`,
    urlEn: `${sitio}${INICIO.en}`,
    locale: seo.locale,
    localeAlterno: SEO[idioma === 'es' ? 'en' : 'es'].locale,
    urlImagen: `${sitio}/assets/og-albion-navigator.jpg`,
    datosEstructurados: jsonSeguro(datosEstructurados(idioma, url)),
    inicio: INICIO[idioma],
    inicioEs: INICIO.es,
    inicioEn: INICIO.en,
    actualEs: idioma === 'es' ? actual : '',
    actualEn: idioma === 'en' ? actual : '',
    verificaciones: verificaciones(),
  };
}

/**
 * Sustituye {{texto}} y {{@variable}}. Falla si falta una traducción o
 * una variable: mejor un error al arrancar que texto sin traducir.
 */
function renderizar(plantilla, idioma) {
  const valores = variables(idioma);
  return plantilla.replace(/\{\{(@?)([\s\S]+?)\}\}/g, (_, esVariable, clave) => {
    if (esVariable) {
      if (!(clave in valores)) throw new Error(`Variable de plantilla desconocida: ${clave}`);
      return valores[clave];
    }
    if (idioma === 'es') return clave;
    if (!(clave in EN)) throw new Error(`Falta la traducción al inglés de: "${clave}"`);
    return EN[clave];
  });
}

function leerVista(nombre) {
  return fs.readFileSync(path.join(CARPETA_VISTAS, nombre), 'utf8');
}

function generarPaginas() {
  const principal = leerVista('index.html');
  const error = leerVista('404.html');
  const paginas = {};
  for (const idioma of IDIOMAS) {
    paginas[idioma] = { principal: renderizar(principal, idioma), error: renderizar(error, idioma) };
  }
  return paginas;
}

function robotsTxt() {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', '', `Sitemap: ${urlSitio()}/sitemap.xml`, ''].join('\n');
}

function sitemapXml() {
  const sitio = urlSitio();
  const alternativas = IDIOMAS.map(
    (i) => `    <xhtml:link rel="alternate" hreflang="${i}" href="${sitio}${INICIO[i]}"/>`
  )
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${sitio}${INICIO.en}"/>`)
    .join('\n');
  const urls = IDIOMAS.map(
    (i) => `  <url>\n    <loc>${sitio}${INICIO[i]}</loc>\n${alternativas}\n    <changefreq>daily</changefreq>\n    <priority>${i === 'es' ? '1.0' : '0.9'}</priority>\n  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

function manifiesto() {
  return JSON.stringify({
    name: 'Albion Navigator',
    short_name: 'Albion Nav',
    description: SEO.en.descripcion,
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0a10',
    theme_color: '#0c0a10',
    icons: [
      { src: '/assets/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/icono-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
}

function crearPaginas() {
  const paginas = generarPaginas();

  return function middlewarePaginas(req, res, siguiente) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return siguiente();
    const ruta = req.ruta;
    if (ruta.startsWith('/api')) return siguiente();

    if (ruta === '/robots.txt') {
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(robotsTxt());
    }
    if (ruta === '/sitemap.xml') {
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(sitemapXml());
    }
    if (ruta === '/manifest.webmanifest') {
      res.set('Content-Type', 'application/manifest+json; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(manifiesto());
    }

    // Variantes de la misma página: una sola URL por idioma.
    if (ruta === '/index.html') return res.redirect(301, '/');
    if (ruta === '/en' || ruta === '/en/index.html') return res.redirect(301, '/en/');

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    if (ruta === '/') return res.send(paginas.es.principal);
    if (ruta === '/en/') return res.send(paginas.en.principal);

    const idioma = ruta.startsWith('/en/') ? 'en' : 'es';
    return res.status(404).send(paginas[idioma].error);
  };
}

module.exports = crearPaginas;
module.exports.renderizar = renderizar;
module.exports.generarPaginas = generarPaginas;
module.exports.sitemapXml = sitemapXml;
module.exports.robotsTxt = robotsTxt;
