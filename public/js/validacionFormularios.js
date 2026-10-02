'use strict';

import { t } from './i18n.js';

/**
 * validacionFormularios.js
 * ----------------------------------------------------------------------
 * Alertas de los campos con el estilo del sitio, en lugar de los globos
 * del navegador ("Completa este campo", "Alarga el texto"...).
 *
 * Escucha el evento "invalid" de cualquier campo de la página (también de
 * los formularios que se crean después) y evita la alerta del navegador:
 * muestra la suya bajo el campo, en el idioma del sitio, lo marca con
 * aria-invalid y la quita al escribir, al salir del campo o pasados unos
 * segundos. Al desplazar la página, la alerta se mueve con el campo. Solo se muestra la del primer campo con problemas.
 *
 * La validación de verdad sigue en el servidor: esto solo ayuda a corregir
 * antes de enviar.
 * ----------------------------------------------------------------------
 */

const DURACION_MS = 5000;
let actual = null;
let ultimoEvento = 0;

/** Texto de la alerta según qué falla en el campo. */
function mensaje(campo) {
  const v = campo.validity;
  if (v.valueMissing) {
    return campo.type === 'checkbox' ? t('Marca esta casilla para continuar.') : t('Completa este campo.');
  }
  if (v.tooShort) {
    return t('Escribe al menos {n} caracteres (ahora hay {actual}).', { n: campo.minLength, actual: campo.value.length });
  }
  if (v.tooLong) return t('Escribe como mucho {n} caracteres.', { n: campo.maxLength });
  if (v.rangeUnderflow) return t('El valor mínimo es {n}.', { n: campo.min });
  if (v.rangeOverflow) return t('El valor máximo es {n}.', { n: campo.max });
  if (v.badInput || v.stepMismatch) return t('Escribe un número válido.');
  if (v.typeMismatch || v.patternMismatch) return campo.title || t('El formato no es válido.');
  if (v.customError) return campo.validationMessage;
  return t('Revisa este campo.');
}

function quitar() {
  if (!actual) return;
  const { burbuja, campo, temporizador, alSalir } = actual;
  clearTimeout(temporizador);
  burbuja.remove();
  campo.removeAttribute('aria-invalid');
  if (campo.getAttribute('aria-describedby') === burbuja.id) campo.removeAttribute('aria-describedby');
  campo.removeEventListener('input', quitar);
  campo.removeEventListener('blur', alSalir);
  actual = null;
}

/**
 * Bajo la caja del campo (o el propio campo), sin salirse de la pantalla.
 * Va en posición absoluta respecto al documento (o a la ventana modal que
 * lo contiene), así se desplaza junto con el campo sin recalcular nada.
 */
function colocar(burbuja, campo) {
  const referencia = (campo.closest('.panel-busqueda__caja') || campo).getBoundingClientRect();
  const contenedor = burbuja.parentElement;
  const enDocumento = contenedor === document.body;
  const origen = enDocumento ? { left: -window.scrollX, top: -window.scrollY } : contenedor.getBoundingClientRect();
  const ancho = burbuja.offsetWidth;
  const izquierda = Math.max(16, Math.min(referencia.left, window.innerWidth - ancho - 16));
  burbuja.style.left = `${izquierda - origen.left}px`;
  burbuja.style.top = `${referencia.bottom + 10 - origen.top}px`;
}

function mostrar(campo, texto) {
  quitar();
  const burbuja = document.createElement('div');
  burbuja.className = 'aviso-campo';
  burbuja.id = 'aviso-campo';
  burbuja.setAttribute('role', 'alert');
  burbuja.textContent = texto;
  // Dentro de una ventana modal (dialog), la alerta tiene que estar en ella
  // para verse por encima del fondo oscurecido.
  (campo.closest('dialog') || document.body).append(burbuja);

  colocar(burbuja, campo);

  campo.setAttribute('aria-invalid', 'true');
  campo.setAttribute('aria-describedby', burbuja.id);
  // Al salir del campo se quita, salvo que el foco vaya a la propia alerta.
  const alSalir = () => setTimeout(quitar, 150);
  campo.addEventListener('input', quitar);
  campo.addEventListener('blur', alSalir);
  actual = { burbuja, campo, alSalir, temporizador: setTimeout(quitar, DURACION_MS) };
}

/** Activa las alertas propias en toda la página (una sola vez). */
export function activarValidacion() {
  document.addEventListener(
    'invalid',
    (evento) => {
      const campo = evento.target;
      if (!(campo instanceof HTMLElement)) return;
      evento.preventDefault(); // sin el globo del navegador
      // Al enviar, el navegador avisa de cada campo inválido: solo el primero.
      const ahora = performance.now();
      if (ahora - ultimoEvento < 100) return;
      ultimoEvento = ahora;
      campo.focus({ preventScroll: true });
      mostrar(campo, mensaje(campo));
      campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    true
  );
  // Si cambia el tamaño de la ventana, se recoloca.
  window.addEventListener('resize', () => {
    if (actual) colocar(actual.burbuja, actual.campo);
  });
}

export default activarValidacion;
