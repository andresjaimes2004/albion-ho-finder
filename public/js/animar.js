'use strict';

/**
 * animar.js
 * ----------------------------------------------------------------------
 * Despliega y pliega secciones con suavidad (el mapa de la Zona Negra, el
 * panel de registro desde capturas...). Se animan la altura, el relleno,
 * los márgenes y la opacidad con la Web Animations API, así el contenido
 * de alrededor se desplaza suave en vez de saltar. Al terminar, la
 * sección queda con `hidden` como siempre (accesible y sin estilos
 * sueltos).
 *
 * Sin animación si el usuario pide reducir el movimiento o el navegador
 * no la soporta.
 * ----------------------------------------------------------------------
 */

const DURACION = 340;
const CURVA = 'cubic-bezier(0.4, 0, 0.2, 1)';
const PROPIEDADES = ['height', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom'];

const enCurso = new WeakMap();
// Hacia dónde va la animación en curso ('mostrar' u 'ocultar'): pedir lo
// mismo otra vez (p. ej. a cada tecla) no la reinicia.
const direccion = new WeakMap();

const sinMovimiento = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function medidas(el) {
  const estilo = getComputedStyle(el);
  const valores = { height: `${el.getBoundingClientRect().height}px` };
  for (const p of PROPIEDADES.slice(1)) valores[p] = estilo[p];
  return valores;
}

const plegado = () => Object.fromEntries(PROPIEDADES.map((p) => [p, '0px']));

function animar(el, desde, hasta, alTerminar) {
  const previa = enCurso.get(el);
  if (previa) previa.cancel();
  el.style.overflow = 'hidden';
  const animacion = el.animate(
    [
      { ...desde, opacity: desde.opacity },
      { ...hasta, opacity: hasta.opacity },
    ],
    { duration: DURACION, easing: CURVA }
  );
  enCurso.set(el, animacion);
  const limpiar = () => {
    if (enCurso.get(el) !== animacion) return;
    enCurso.delete(el);
    el.style.overflow = '';
  };
  // La promesa `finished` se cumple aunque la pestaña esté en segundo plano
  // (el evento onfinish espera a que se dibuje un fotograma).
  animacion.finished.then(
    () => {
      limpiar();
      if (alTerminar) alTerminar();
    },
    limpiar // cancelada: otra animación tomó el relevo
  );
}

/** Muestra `el` (quita hidden) desplegándolo desde altura cero. */
export function mostrarSuave(el) {
  const previa = enCurso.get(el);
  if (!el.hidden && !previa) return;
  if (previa && direccion.get(el) === 'mostrar') return;
  // Si se estaba plegando, se despliega desde donde iba (sin saltos).
  let desde = { ...plegado(), opacity: 0 };
  if (previa) {
    desde = { ...medidas(el), opacity: getComputedStyle(el).opacity };
    previa.cancel();
  }
  el.hidden = false;
  if (sinMovimiento() || typeof el.animate !== 'function') return;
  direccion.set(el, 'mostrar');
  animar(el, desde, { ...medidas(el), opacity: 1 });
}

/** Oculta `el` plegándolo hasta altura cero; al terminar queda con hidden. */
export function ocultarSuave(el) {
  if (el.hidden) return;
  if (enCurso.get(el) && direccion.get(el) === 'ocultar') return;
  if (sinMovimiento() || typeof el.animate !== 'function') {
    el.hidden = true;
    return;
  }
  const inicio = medidas(el);
  direccion.set(el, 'ocultar');
  animar(el, { ...inicio, opacity: getComputedStyle(el).opacity }, { ...plegado(), opacity: 0 }, () => {
    el.hidden = true;
  });
}

/**
 * Sección desplegable: `boton` (con aria-expanded) abre y cierra `cuerpo`
 * con la animación suave de arriba. Si se da `clave`, el estado se recuerda
 * en este navegador. Devuelve { abrir(), cerrar(), abierto() }.
 */
export function conectarDesplegable(boton, cuerpo, { clave = null, abierto = false, alCambiar = null } = {}) {
  let inicial = abierto;
  if (clave) {
    try {
      const guardado = localStorage.getItem(clave);
      if (guardado !== null) inicial = guardado === '1';
    } catch (error) {
      // Sin almacenamiento: el estado por defecto.
    }
  }
  const aplicar = (abrir, suave) => {
    boton.setAttribute('aria-expanded', String(abrir));
    if (!suave) cuerpo.hidden = !abrir;
    else if (abrir) mostrarSuave(cuerpo);
    else ocultarSuave(cuerpo);
    if (alCambiar) alCambiar(abrir);
  };
  aplicar(inicial, false);
  const cambiar = (abrir) => {
    aplicar(abrir, true);
    if (!clave) return;
    try {
      localStorage.setItem(clave, abrir ? '1' : '0');
    } catch (error) {
      // Sin almacenamiento: vale hasta recargar.
    }
  };
  boton.addEventListener('click', () => cambiar(boton.getAttribute('aria-expanded') !== 'true'));
  return {
    abrir: () => cambiar(true),
    cerrar: () => cambiar(false),
    abierto: () => boton.getAttribute('aria-expanded') === 'true',
  };
}
