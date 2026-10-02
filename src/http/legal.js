'use strict';

const TEXTOS = require('../i18n/legal');

/**
 * legal.js
 * ----------------------------------------------------------------------
 * Páginas de soporte (Contáctanos, Política de privacidad, Términos de
 * uso): sus direcciones en cada idioma, la configuración de contacto y el
 * HTML de su contenido, generado desde src/i18n/legal.js.
 *
 *  - El correo de contacto y el enlace de Discord se configuran con
 *    CONTACTO_CORREO y DISCORD_URL. Se validan: un valor inválido o
 *    ausente se trata como "muy pronto" (y el icono de Discord del pie no
 *    aparece) en vez de publicar algo raro.
 *  - Todo el texto se escapa; solo se añaden etiquetas propias (negrita y
 *    enlaces a páginas del sitio, al correo o a Discord).
 * ----------------------------------------------------------------------
 */

const PAGINAS = {
  contacto: { es: '/contacto', en: '/en/contact' },
  privacidad: { es: '/privacidad', en: '/en/privacy' },
  terminos: { es: '/terminos', en: '/en/terms' },
};

// Invitación a un servidor (discord.gg/…, discord.com/invite/…) o un perfil (discord.com/users/<id>).
const PATRON_DISCORD = /^https:\/\/(discord\.gg\/[A-Za-z0-9-]{2,32}|(www\.)?discord\.com\/(invite\/[A-Za-z0-9-]{2,32}|users\/\d{5,25}))\/?$/;
// Un correo corriente: sin espacios, comillas ni nada que pueda romper el HTML.
const PATRON_CORREO = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

function contacto() {
  const discord = (process.env.DISCORD_URL || '').trim();
  const correo = (process.env.CONTACTO_CORREO || '').trim();
  return {
    discord: PATRON_DISCORD.test(discord) ? discord : null,
    correo: PATRON_CORREO.test(correo) ? correo : null,
  };
}

function escaparHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ICONOS = {
  correo: '<path d="M4 6h16v12H4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  discord:
    '<path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1 0 .13c-.6.35-1.22.64-1.88.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"/>',
  error: '<path d="M12 3 2 20h20L12 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  mapa: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.5" stroke="currentColor" stroke-width="2"/>',
  cuenta: '<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
};

function icono(nombre, tamano = 22) {
  return `<svg class="icono-legal" width="${tamano}" height="${tamano}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${ICONOS[nombre] || ''}</svg>`;
}

/** Enlace externo seguro (nueva pestaña, sin dar acceso a esta página). */
function enlaceExterno(href, texto, clase = '') {
  return `<a${clase ? ` class="${clase}"` : ''} href="${escaparHtml(href)}" target="_blank" rel="noopener noreferrer">${texto}</a>`;
}

/**
 * Texto con formato mínimo: se escapa todo, y luego **negrita** y las
 * marcas {correo}, {discord}, {contacto}, {privacidad}, {terminos}.
 */
function enLinea(texto, idioma, config) {
  const comun = TEXTOS[idioma].comun;
  const pendiente = `<span class="legal__pendiente">${escaparHtml(comun.pendiente)}</span>`;
  return escaparHtml(texto)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\{correo\}/g, () =>
      config.correo ? `<a href="mailto:${escaparHtml(config.correo)}">${escaparHtml(config.correo)}</a>` : pendiente
    )
    .replace(/\{discord\}/g, () => (config.discord ? enlaceExterno(config.discord, 'Discord') : pendiente))
    .replace(/\{(contacto|privacidad|terminos)\}/g, (_, pagina) => {
      const titulo = TEXTOS[idioma][pagina].titulo;
      return `<a href="${PAGINAS[pagina][idioma]}">${escaparHtml(idioma === 'es' && pagina !== 'contacto' ? titulo.toLowerCase() : titulo)}</a>`;
    });
}

/** Botón de una tarjeta de contacto: correo o Discord (o "muy pronto"). */
function accionTarjeta(accion, idioma, config) {
  const comun = TEXTOS[idioma].comun;
  if (accion === 'correo' && config.correo) {
    return `<a class="boton boton--primario legal__accion" href="mailto:${escaparHtml(config.correo)}">${escaparHtml(config.correo)}</a>`;
  }
  if (accion === 'discord' && config.discord) {
    const texto = idioma === 'es' ? 'Unirme al Discord' : 'Join the Discord';
    return enlaceExterno(config.discord, escaparHtml(texto), 'boton boton--primario legal__accion');
  }
  return `<span class="legal__accion legal__accion--pendiente">${escaparHtml(comun.pendiente)}</span>`;
}

function htmlBloque(bloque, idioma, config) {
  if (bloque.p) return `<p>${enLinea(bloque.p, idioma, config)}</p>`;
  if (bloque.sub) return `<h3>${enLinea(bloque.sub, idioma, config)}</h3>`;
  if (bloque.lista) return `<ul>${bloque.lista.map((item) => `<li>${enLinea(item, idioma, config)}</li>`).join('')}</ul>`;
  if (bloque.tarjetas) {
    const tarjetas = bloque.tarjetas.map(
      (t) => `<article class="legal__tarjeta">
            <span class="legal__icono">${icono(t.icono)}</span>
            <h3>${escaparHtml(t.titulo)}</h3>
            <p>${enLinea(t.texto, idioma, config)}</p>${t.accion ? `\n            ${accionTarjeta(t.accion, idioma, config)}` : ''}
          </article>`
    );
    return `<div class="legal__tarjetas">${tarjetas.join('')}</div>`;
  }
  throw new Error('Bloque de texto legal desconocido.');
}

/** Contenido de una página de soporte (todo lo que va dentro de <main>). */
function htmlContenido(pagina, idioma, config = contacto()) {
  const textos = TEXTOS[idioma][pagina];
  const comun = TEXTOS[idioma].comun;
  // Índice para las páginas largas (privacidad y términos).
  const indice =
    pagina === 'contacto'
      ? ''
      : `<nav class="legal__indice" aria-label="${escaparHtml(comun.indice)}">
        <p class="legal__indice-titulo">${escaparHtml(comun.indice)}</p>
        <ul>${textos.secciones.map((s) => `<li><a href="#${s.id}">${escaparHtml(s.titulo)}</a></li>`).join('')}</ul>
      </nav>`;
  const secciones = textos.secciones
    .map(
      (s) => `<section id="${s.id}" class="legal__seccion" aria-labelledby="${s.id}-titulo">
        <h2 id="${s.id}-titulo">${escaparHtml(s.titulo)}</h2>
        ${s.bloques.map((b) => htmlBloque(b, idioma, config)).join('\n        ')}
      </section>`
    )
    .join('\n      ');
  return `<article class="legal legal--${pagina}">
      <header class="legal__cabecera">
        <p class="legal__etiqueta">${escaparHtml(comun.soporte)}</p>
        <h1 class="legal__titulo">${escaparHtml(textos.titulo)}</h1>
        <p class="legal__intro">${enLinea(textos.intro, idioma, config)}</p>
        ${pagina === 'contacto' ? '' : `<p class="legal__fecha">${escaparHtml(comun.actualizado)}</p>`}
      </header>
      ${indice}
      ${secciones}
    </article>`;
}

/** Icono de Discord para el pie (vacío si no hay enlace configurado). */
function htmlDiscordPie(config = contacto()) {
  if (!config.discord) return '';
  return `<div class="pie__redes">
          <a class="pie__red" href="${escaparHtml(config.discord)}" target="_blank" rel="noopener noreferrer" aria-label="Discord" title="Discord">${icono('discord', 20)}</a>
        </div>`;
}

/** ¿Es esta ruta una página de soporte? → { pagina, idioma } o null. */
function paginaDeRuta(ruta) {
  for (const [pagina, rutas] of Object.entries(PAGINAS)) {
    for (const [idioma, valor] of Object.entries(rutas)) if (valor === ruta) return { pagina, idioma };
  }
  return null;
}

module.exports = { PAGINAS, TEXTOS, contacto, htmlContenido, htmlDiscordPie, paginaDeRuta, escaparHtml };
