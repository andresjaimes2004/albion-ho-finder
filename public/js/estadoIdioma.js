'use strict';

/**
 * estadoIdioma.js
 * ----------------------------------------------------------------------
 * Cambiar de idioma lleva a otra página (/ ↔ /en/), así que el navegador
 * la carga de nuevo. Para no perder lo que se estaba mirando, justo antes
 * de ir al otro idioma se guarda el estado de la página (búsquedas,
 * filtros, secciones abiertas, el camino consultado, la posición...) en
 * sessionStorage, y la página del otro idioma lo restaura al cargar.
 *
 * sessionStorage es de esta pestaña y de este sitio: no sale del navegador
 * ni se comparte con otras pestañas. El estado caduca en un minuto (solo
 * sirve para el salto de idioma) y se borra al leerlo.
 * ----------------------------------------------------------------------
 */

const CLAVE = 'estado-al-cambiar-idioma';
const VIGENCIA_MS = 60_000;

/** Guarda `obtenerEstado()` al pulsar el enlace del otro idioma. */
export function guardarAlCambiarIdioma(obtenerEstado) {
  for (const enlace of document.querySelectorAll('.idioma__opcion')) {
    enlace.addEventListener('click', () => {
      if (enlace.getAttribute('aria-current')) return; // ya es el idioma actual
      try {
        sessionStorage.setItem(CLAVE, JSON.stringify({ en: Date.now(), estado: obtenerEstado() }));
      } catch (error) {
        // Sin almacenamiento: se cambia de idioma sin conservar el estado.
      }
    });
  }
}

/** El estado guardado al venir de otro idioma (una sola vez), o null. */
export function recuperarEstadoIdioma() {
  try {
    const guardado = sessionStorage.getItem(CLAVE);
    sessionStorage.removeItem(CLAVE);
    if (!guardado) return null;
    const { en, estado } = JSON.parse(guardado);
    return Date.now() - en < VIGENCIA_MS && estado && typeof estado === 'object' ? estado : null;
  } catch (error) {
    return null;
  }
}
