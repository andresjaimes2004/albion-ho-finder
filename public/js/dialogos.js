'use strict';

import { t } from './i18n.js';

/**
 * dialogos.js
 * ----------------------------------------------------------------------
 * Ventana flotante de confirmación con el estilo del sitio, en lugar de la
 * del navegador (window.confirm). Toma el color del apartado en el que se
 * está (--acento-rgb) y se abre y cierra con la misma transición que las
 * demás ventanas.
 *
 *   if (await confirmar({ titulo, mensaje, aceptar: 'Borrar', peligro: true })) …
 *
 *  - Esc, el botón "Cancelar" o un clic fuera de la ventana: cancela.
 *  - En las acciones peligrosas el foco empieza en "Cancelar", para que un
 *    Enter despistado no borre nada.
 *  - Los textos se insertan como texto (pueden llevar nombres de usuarios).
 * ----------------------------------------------------------------------
 */

let ventana = null;

function crearVentana() {
  const dialogo = document.createElement('dialog');
  dialogo.className = 'ventana ventana--estrecha dialogo';
  dialogo.setAttribute('aria-labelledby', 'dialogo-titulo');
  dialogo.setAttribute('aria-describedby', 'dialogo-mensaje');
  dialogo.innerHTML = `
    <form method="dialog" class="ventana__contenido dialogo__contenido">
      <h2 id="dialogo-titulo" class="dialogo__titulo"></h2>
      <p id="dialogo-mensaje" class="dialogo__mensaje"></p>
      <div class="dialogo__acciones">
        <button type="submit" value="cancelar" class="boton boton--sutil dialogo__cancelar"></button>
        <button type="submit" value="aceptar" class="boton dialogo__aceptar"></button>
      </div>
    </form>`;
  // Un clic en el fondo (fuera del contenido) cancela.
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) dialogo.close('cancelar');
  });
  document.body.append(dialogo);
  return dialogo;
}

/**
 * @param {object} opciones
 *   - titulo, mensaje: textos de la ventana
 *   - aceptar, cancelar: textos de los botones
 *   - peligro: botón de aceptar en rojo (borrar, salir...)
 * @returns {Promise<boolean>} true si se aceptó
 */
export function confirmar({ titulo = t('¿Seguro?'), mensaje = '', aceptar = t('Aceptar'), cancelar = t('Cancelar'), peligro = false } = {}) {
  if (!ventana) ventana = crearVentana();
  // Si ya había una abierta, la anterior se da por cancelada.
  if (ventana.open) ventana.close('cancelar');

  ventana.querySelector('.dialogo__titulo').textContent = titulo;
  const parrafo = ventana.querySelector('.dialogo__mensaje');
  parrafo.textContent = mensaje;
  parrafo.hidden = !mensaje;
  ventana.querySelector('.dialogo__cancelar').textContent = cancelar;
  const boton = ventana.querySelector('.dialogo__aceptar');
  boton.textContent = aceptar;
  boton.classList.toggle('boton--peligro', peligro);
  ventana.classList.toggle('dialogo--peligro', peligro);

  return new Promise((resolver) => {
    ventana.returnValue = '';
    ventana.addEventListener('close', () => resolver(ventana.returnValue === 'aceptar'), { once: true });
    ventana.showModal();
    (peligro ? ventana.querySelector('.dialogo__cancelar') : boton).focus();
  });
}

export default confirmar;
