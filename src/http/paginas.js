'use strict';

const fs = require('fs');
const path = require('path');
const { SEO, EN } = require('../i18n/pagina');
const { PREGUNTAS } = require('../i18n/preguntas');
const legal = require('./legal');

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
 *  - Páginas de soporte (Contáctanos, Política de privacidad, Términos de
 *    uso) en /contacto, /privacidad y /terminos (y /en/contact, /en/privacy,
 *    /en/terms): plantilla src/vistas/legal.html con el contenido de
 *    src/http/legal.js. El pie (src/vistas/_pie.html) es común a todas.
 *  - Donaciones: el enlace de Ko-fi y la llave Bre-B se configuran con
 *    DONAR_KOFI_URL y DONAR_BREB_LLAVE (y el QR, si existe
 *    public/assets/qr-breb.png). Se validan: un valor inválido o ausente
 *    deja esa opción como "muy pronto" en vez de publicar algo raro.
 * ----------------------------------------------------------------------
 */

const IDIOMAS = ['es', 'en'];
const INICIO = { es: '/', en: '/en/' };
const CARPETA_VISTAS = path.join(__dirname, '..', 'vistas');
const QR_BREB = path.join(__dirname, '..', '..', 'public', 'assets', 'qr-breb.png');

const PATRON_KOFI = /^https:\/\/ko-fi\.com\/[A-Za-z0-9_]{2,40}\/?$/;
// Llave alfanumérica (@nombre), celular o correo: nada que pueda romper el HTML.
const PATRON_LLAVE = /^[@A-Za-z0-9._+-]{3,60}$/;

function donaciones() {
  const kofi = (process.env.DONAR_KOFI_URL || '').trim();
  const llave = (process.env.DONAR_BREB_LLAVE || '').trim();
  const kofiValido = PATRON_KOFI.test(kofi);
  const llaveValida = PATRON_LLAVE.test(llave);
  return {
    kofiHref: kofiValido ? kofi : '#apoyar',
    kofiClase: kofiValido ? '' : ' donar--pendiente',
    brebLlave: llaveValida ? llave : '—',
    brebClase: llaveValida ? '' : ' donar--pendiente',
    brebQr: llaveValida && fs.existsSync(QR_BREB)
      ? '<img class="donar__qr" src="/assets/qr-breb.png" alt="QR Bre-B" width="180" height="180" loading="lazy" />'
      : '',
  };
}

function urlSitio() {
  return (process.env.SITIO_URL || 'https://albionho.duckdns.org').replace(/\/+$/, '');
}

function escaparAtributo(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escaparHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FLECHA = '<svg class="pregunta__flecha" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Acordeón de preguntas frecuentes con <details>: funciona sin JavaScript,
 * con teclado y lector de pantalla. name="preguntas" deja una sola abierta
 * a la vez (como en HostGator); la primera empieza abierta.
 */
function htmlPreguntas(idioma) {
  return PREGUNTAS[idioma]
    .map(
      ({ pregunta, respuesta }, i) => `<details class="pregunta" name="preguntas"${i === 0 ? ' open' : ''}>
          <summary class="pregunta__titulo"><span>${escaparHtml(pregunta)}</span>${FLECHA}</summary>
          <div class="pregunta__respuesta"><p>${escaparHtml(respuesta)}</p></div>
        </details>`
    )
    .join('\n        ');
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
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: idioma,
      mainEntity: PREGUNTAS[idioma].map(({ pregunta, respuesta }) => ({
        '@type': 'Question',
        name: pregunta,
        acceptedAnswer: { '@type': 'Answer', text: respuesta },
      })),
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
    preguntas: htmlPreguntas(idioma),
    ...donaciones(),
    // Pie: enlaces a las páginas de soporte del idioma y Discord.
    urlContacto: legal.PAGINAS.contacto[idioma],
    urlPrivacidad: legal.PAGINAS.privacidad[idioma],
    urlTerminos: legal.PAGINAS.terminos[idioma],
    discordPie: legal.htmlDiscordPie(),
  };
}

/** Datos de una página de soporte (título, URLs por idioma y contenido). */
function variablesLegales(pagina, idioma) {
  const sitio = urlSitio();
  const rutas = legal.PAGINAS[pagina];
  const textos = legal.TEXTOS[idioma][pagina];
  return {
    titulo: escaparAtributo(`${textos.titulo} | Albion Navigator`),
    descripcion: escaparAtributo(textos.descripcion),
    urlCanonica: `${sitio}${rutas[idioma]}`,
    urlEs: `${sitio}${rutas.es}`,
    urlEn: `${sitio}${rutas.en}`,
    rutaEs: rutas.es,
    rutaEn: rutas.en,
    // Cada página de soporte tiene su fondo y su color (public/css/legal.css).
    paginaSoporte: pagina,
    contenidoLegal: legal.htmlContenido(pagina, idioma),
  };
}

/**
 * Sustituye {{texto}} y {{@variable}}. Falla si falta una traducción o
 * una variable: mejor un error al arrancar que texto sin traducir.
 */
function renderizar(plantilla, idioma, extras = {}) {
  const valores = { ...variables(idioma), ...extras };
  // El pie común se genera con los mismos datos de la página.
  if (plantilla.includes('{{@pie}}')) valores.pie = renderizar(leerVista('_pie.html'), idioma, extras);
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
  const plantillaLegal = leerVista('legal.html');
  const paginas = {};
  for (const idioma of IDIOMAS) {
    paginas[idioma] = { principal: renderizar(principal, idioma), error: renderizar(error, idioma), legal: {} };
    for (const pagina of Object.keys(legal.PAGINAS)) {
      paginas[idioma].legal[pagina] = renderizar(plantillaLegal, idioma, variablesLegales(pagina, idioma));
    }
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
  );
  // Páginas de soporte, cada una con su versión en el otro idioma.
  for (const rutas of Object.values(legal.PAGINAS)) {
    const alternas = IDIOMAS.map((i) => `    <xhtml:link rel="alternate" hreflang="${i}" href="${sitio}${rutas[i]}"/>`).join('\n');
    for (const i of IDIOMAS) {
      urls.push(`  <url>\n    <loc>${sitio}${rutas[i]}</loc>\n${alternas}\n    <changefreq>monthly</changefreq>\n    <priority>0.3</priority>\n  </url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
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
    const soporte = legal.paginaDeRuta(ruta);
    if (soporte) return res.send(paginas[soporte.idioma].legal[soporte.pagina]);

    const idioma = ruta.startsWith('/en/') ? 'en' : 'es';
    return res.status(404).send(paginas[idioma].error);
  };
}

module.exports = crearPaginas;
module.exports.renderizar = renderizar;
module.exports.generarPaginas = generarPaginas;
module.exports.sitemapXml = sitemapXml;
module.exports.robotsTxt = robotsTxt;
