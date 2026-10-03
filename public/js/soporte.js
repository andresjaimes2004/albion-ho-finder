'use strict';

/**
 * soporte.js
 * ----------------------------------------------------------------------
 * Lo poco que necesitan las páginas de soporte (Contáctanos, Privacidad,
 * Términos): el botón "Copiar" del correo de contacto. Copia la dirección
 * al portapapeles y lo confirma en el propio botón unos segundos; sin
 * permiso de portapapeles, deja la dirección seleccionada para copiarla a
 * mano. Sin ventanas nativas del navegador.
 * ----------------------------------------------------------------------
 */

const DURACION_CONFIRMACION_MS = 2000;

for (const boton of document.querySelectorAll('[data-copiar]')) {
  const original = boton.textContent;
  let temporizador = null;
  boton.addEventListener('click', async () => {
    const origen = document.getElementById(boton.dataset.copiar);
    if (!origen) return;
    try {
      await navigator.clipboard.writeText(origen.textContent.trim());
      boton.textContent = boton.dataset.copiado || original;
      boton.classList.add('boton--copiado');
      clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        boton.textContent = original;
        boton.classList.remove('boton--copiado');
      }, DURACION_CONFIRMACION_MS);
    } catch (error) {
      const rango = document.createRange();
      rango.selectNodeContents(origen);
      const seleccion = window.getSelection();
      seleccion.removeAllRanges();
      seleccion.addRange(rango);
    }
  });
}
