'use strict';

/**
 * Páginas de soporte (Contáctanos, Política de privacidad, Términos de uso)
 * y pie común: rutas en los dos idiomas, contenido escapado y la
 * configuración de contacto (correo y Discord) validada.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const legal = require('../src/http/legal');
const crearPaginas = require('../src/http/paginas');

/** Pide una ruta al middleware de páginas, sin servidor. */
function pedir(middleware, ruta) {
  return new Promise((resolver) => {
    const res = {
      codigo: 200,
      cabeceras: {},
      status(c) {
        this.codigo = c;
        return this;
      },
      set(n, v) {
        this.cabeceras[n] = v;
        return this;
      },
      send(cuerpo) {
        resolver({ estado: this.codigo, cuerpo, cabeceras: this.cabeceras });
        return this;
      },
      redirect(c, destino) {
        resolver({ estado: c, destino });
      },
    };
    middleware({ method: 'GET', ruta }, res, () => resolver({ estado: 'siguiente' }));
  });
}

function conEntorno(valores, fn) {
  const antes = {};
  for (const [k, v] of Object.entries(valores)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('las tres páginas de soporte responden en español e inglés y enlazan su versión en el otro idioma', async () => {
  const paginas = conEntorno({ DISCORD_URL: undefined, CONTACTO_CORREO: undefined }, () => crearPaginas());
  const casos = [
    ['/contacto', 'es', 'Contáctanos'],
    ['/privacidad', 'es', 'Política de privacidad'],
    ['/terminos', 'es', 'Términos de uso'],
    ['/en/contact', 'en', 'Contact us'],
    ['/en/privacy', 'en', 'Privacy policy'],
    ['/en/terms', 'en', 'Terms of use'],
  ];
  for (const [ruta, idioma, titulo] of casos) {
    const r = await pedir(paginas, ruta);
    assert.equal(r.estado, 200, ruta);
    assert.match(r.cuerpo, new RegExp(`<html lang="${idioma}">`));
    assert.match(r.cuerpo, new RegExp(`<h1 class="legal__titulo">${titulo}</h1>`));
    // Cada página lleva su nombre en <body> para su fondo y su color.
    const pagina = { contacto: 'contacto', contact: 'contacto', privacidad: 'privacidad', privacy: 'privacidad', terminos: 'terminos', terms: 'terminos' }[ruta.split('/').pop()];
    assert.match(r.cuerpo, new RegExp(`data-soporte="${pagina}"`));
    assert.match(r.cuerpo, /rel="canonical"/);
    assert.match(r.cuerpo, /hreflang="es"/);
    assert.match(r.cuerpo, /hreflang="en"/);
    assert.doesNotMatch(r.cuerpo, /\{\{/, 'sin marcas de plantilla sin sustituir');
    // El pie común, con la columna de soporte.
    assert.match(r.cuerpo, /class="pie"/);
    assert.match(r.cuerpo, idioma === 'es' ? /href="\/privacidad"/ : /href="\/en\/privacy"/);
  }
  // Variantes que no existen: 404 real.
  assert.equal((await pedir(paginas, '/contacto/otra')).estado, 404);
  assert.equal((await pedir(paginas, '/en/contacto')).estado, 404);
});

test('la portada también lleva el pie con Soporte y el sitemap incluye las páginas de soporte', async () => {
  const paginas = crearPaginas();
  const inicio = await pedir(paginas, '/');
  assert.match(inicio.cuerpo, /href="\/contacto">Contáctanos</);
  assert.match(inicio.cuerpo, /href="\/terminos">Términos de uso</);
  const inicioEn = await pedir(paginas, '/en/');
  assert.match(inicioEn.cuerpo, /href="\/en\/contact">Contact us</);
  // Los enlaces del pie a secciones de la portada llevan la ruta (sirven desde cualquier página).
  assert.match(inicio.cuerpo, /href="\/#apoyar" data-desplazar/);

  const sitemap = crearPaginas.sitemapXml();
  for (const ruta of ['/contacto', '/privacidad', '/terminos', '/en/contact', '/en/privacy', '/en/terms']) {
    assert.match(sitemap, new RegExp(`<loc>[^<]*${ruta.replace(/\//g, '\\/')}</loc>`), ruta);
  }
});

test('el correo y la invitación al grupo de Discord se validan: lo inválido queda como "muy pronto" y no se publica', () => {
  const casos = [
    [{ DISCORD_URL: 'https://discord.gg/AbC123', CONTACTO_CORREO: 'soporte@albionnavigator.com' }, true, true],
    [{ DISCORD_URL: 'https://discord.com/invite/abc-123', CONTACTO_CORREO: 'a.b+c@sub.dominio.co' }, true, true],
    // Un perfil personal ya no vale: el enlace es al grupo de la comunidad.
    [{ DISCORD_URL: 'https://discord.com/users/123456789012345678', CONTACTO_CORREO: '' }, false, false],
    [{ DISCORD_URL: 'http://discord.gg/abc', CONTACTO_CORREO: 'sin-arroba' }, true, false],
    [{ DISCORD_URL: 'https://discord.gg.evil.com/abc', CONTACTO_CORREO: 'x@y.z"><script>' }, false, false],
    [{ DISCORD_URL: 'javascript:alert(1)', CONTACTO_CORREO: 'a@b.com?cc=otro@c.com' }, false, false],
  ];
  for (const [entorno, discordValido, correoValido] of casos) {
    const config = conEntorno(entorno, () => legal.contacto());
    assert.equal(Boolean(config.discord), discordValido, entorno.DISCORD_URL);
    assert.equal(Boolean(config.correo), correoValido, entorno.CONTACTO_CORREO);
  }
});

test('con contacto configurado: enlaces correctos y seguros; sin él, "muy pronto" y sin icono de Discord', () => {
  const config = { discord: 'https://discord.gg/AbC123', correo: 'soporte@albionnavigator.com' };
  const contacto = legal.htmlContenido('contacto', 'es', config);
  assert.match(contacto, /href="mailto:soporte@albionnavigator\.com"/);
  assert.match(contacto, /href="https:\/\/discord\.gg\/AbC123" target="_blank" rel="noopener noreferrer"/);
  assert.match(legal.htmlDiscordPie('es', config), /aria-label="Únete a nuestro grupo de Discord"/);
  assert.match(legal.htmlDiscordPie('en', config), /aria-label="Join our Discord community"/);
  assert.match(legal.htmlDiscordPie('es', config), /rel="noopener noreferrer"/);
  assert.match(contacto, /Grupo de Discord/);
  assert.match(contacto, />Unirme al grupo</);

  const vacio = { discord: null, correo: null };
  const sinConfig = legal.htmlContenido('contacto', 'es', vacio);
  assert.doesNotMatch(sinConfig, /mailto:/);
  assert.doesNotMatch(sinConfig, /discord\.gg/);
  assert.match(sinConfig, /muy pronto/);
  assert.equal(legal.htmlDiscordPie('es', vacio), '');
  // En la política, el correo de los derechos también queda pendiente.
  assert.match(legal.htmlContenido('privacidad', 'en', vacio), /coming soon/);
});

test('todo el texto de las páginas de soporte se escapa y cada sección tiene su ancla en el índice', () => {
  const config = { discord: null, correo: null };
  for (const idioma of ['es', 'en']) {
    for (const pagina of Object.keys(legal.PAGINAS)) {
      const html = legal.htmlContenido(pagina, idioma, config);
      const secciones = legal.TEXTOS[idioma][pagina].secciones;
      for (const s of secciones) {
        assert.match(html, new RegExp(`<section id="${s.id}"`), `${idioma}/${pagina}#${s.id}`);
        if (pagina !== 'contacto') assert.match(html, new RegExp(`href="#${s.id}"`));
      }
      // El índice va sin numeración (lista simple, no <ol>).
      assert.doesNotMatch(html, /<ol[\s>]/, `${idioma}/${pagina}`);
      // Ningún asterisco de negrita ni marca {…} sin convertir.
      assert.doesNotMatch(html, /\*\*|\{(correo|discord|contacto|privacidad|terminos)\}/, `${idioma}/${pagina}`);
      // Los dos idiomas tienen las mismas secciones.
      const otro = legal.TEXTOS[idioma === 'es' ? 'en' : 'es'][pagina].secciones.map((s) => s.id);
      assert.deepEqual(secciones.map((s) => s.id), otro);
    }
  }
});
