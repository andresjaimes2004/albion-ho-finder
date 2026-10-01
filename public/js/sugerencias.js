'use strict';

import { t } from './i18n.js';

/**
 * sugerencias.js
 * ----------------------------------------------------------------------
 * Desplegable de sugerencias propio para los buscadores (las listas
 * <datalist> del navegador no se pueden estilizar) y botón ✕ para borrar
 * lo escrito.
 *
 *  - Coincide sin tildes ni mayúsculas, y también sin espacios ni signos
 *    ("requiem" encuentra "R E Q U I E M"). Primero lo que empieza igual.
 *  - Teclado: ↑ ↓ para moverse, Enter para elegir, Esc para cerrar.
 *  - Accesible: el campo es un combobox con su listbox (ARIA).
 *  - Al elegir, escribe el valor y lanza los eventos "input" y "change",
 *    como si lo hubiera escrito el usuario.
 *  - Los textos se insertan como texto (nunca como HTML): muchos nombres
 *    los escriben otros usuarios.
 * ----------------------------------------------------------------------
 */

let contador = 0;

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const compacto = (texto) => normalizar(texto).replace(/[^a-z0-9]/g, '');

/** Nivel de coincidencia (menor es mejor) o null. */
function nivel(valor, buscado, buscadoCompacto) {
  const v = normalizar(valor);
  if (v.startsWith(buscado)) return 0;
  if (v.split(/[\s\-_.]+/).some((p) => p.startsWith(buscado))) return 1;
  if (v.includes(buscado)) return 2;
  if (buscadoCompacto.length >= 2 && compacto(valor).includes(buscadoCompacto)) return 3;
  return null;
}

/** Escribe el texto resaltando (con <mark>) la parte que coincide. */
function pintarTexto(el, valor, buscado) {
  const i = buscado ? normalizar(valor).indexOf(buscado) : -1;
  // normalize('NFD') puede cambiar la longitud: solo se resalta si coincide.
  if (i < 0 || normalizar(valor).length !== valor.length) {
    el.textContent = valor;
    return;
  }
  const marca = document.createElement('mark');
  marca.textContent = valor.slice(i, i + buscado.length);
  el.append(valor.slice(0, i), marca, valor.slice(i + buscado.length));
}

/**
 * @param {HTMLInputElement} input
 * @param {object} opciones
 *   - opciones(): lista de { valor, tipo? } o de textos
 *   - maximo: cuántas mostrar
 *   - alEnfocar: mostrar todas al enfocar el campo vacío
 *   - alElegir(valor)
 */
export function conectarSugerencias(input, { opciones = () => [], maximo = 40, alEnfocar = false, alElegir = null } = {}) {
  const ancla = input.closest('.panel-busqueda__caja') || input.parentElement;
  ancla.classList.add('sugerencias-ancla');
  const lista = document.createElement('ul');
  lista.className = 'sugerencias';
  lista.id = `sugerencias-${++contador}`;
  lista.setAttribute('role', 'listbox');
  lista.hidden = true;
  ancla.append(lista);

  input.removeAttribute('list');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', lista.id);

  let visibles = [];
  let activa = -1;
  // Cerrada con Esc: no se reabre sola hasta que se vuelva a escribir.
  let descartada = false;

  const calcular = () => {
    const texto = normalizar(input.value.trim());
    const todas = opciones().map((o) => (typeof o === 'string' ? { valor: o } : o));
    if (!texto) return alEnfocar ? todas.slice(0, maximo) : [];
    const textoCompacto = compacto(texto);
    return todas
      .map((o) => ({ ...o, nivel: nivel(o.valor, texto, textoCompacto) }))
      .filter((o) => o.nivel !== null)
      .sort((a, b) => a.nivel - b.nivel || a.valor.localeCompare(b.valor))
      .slice(0, maximo);
  };

  const cerrar = () => {
    lista.hidden = true;
    activa = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const marcar = (indice) => {
    activa = indice;
    [...lista.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === indice)));
    if (indice >= 0) {
      const li = lista.children[indice];
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const elegir = (valor) => {
    input.value = valor;
    cerrar();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (alElegir) alElegir(valor);
  };

  const abrir = () => {
    visibles = calcular();
    // Si lo escrito ya es exactamente la única sugerencia, no hace falta mostrarla.
    const exacta = visibles.length === 1 && normalizar(visibles[0].valor) === normalizar(input.value.trim());
    if (!visibles.length || exacta || document.activeElement !== input) {
      cerrar();
      return;
    }
    const buscado = normalizar(input.value.trim());
    lista.replaceChildren(
      ...visibles.map((o, k) => {
        const li = document.createElement('li');
        li.className = 'sugerencias__opcion';
        li.id = `${lista.id}-${k}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        const texto = document.createElement('span');
        texto.className = 'sugerencias__texto';
        pintarTexto(texto, o.valor, buscado);
        li.append(texto);
        if (o.tipo) {
          const tipo = document.createElement('span');
          tipo.className = 'sugerencias__tipo';
          tipo.textContent = o.tipo;
          li.append(tipo);
        }
        // mousedown: elegir antes de que el campo pierda el foco.
        li.addEventListener('mousedown', (evento) => {
          evento.preventDefault();
          elegir(o.valor);
        });
        return li;
      })
    );
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    activa = -1;
  };

  input.addEventListener('input', () => {
    descartada = false;
    abrir();
  });
  input.addEventListener('focus', abrir);
  input.addEventListener('blur', () => setTimeout(cerrar, 100));
  // En la fase de captura: así Enter elige la sugerencia antes que los
  // atajos propios de cada buscador.
  input.addEventListener(
    'keydown',
    (evento) => {
      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        if (lista.hidden) abrir();
        if (lista.hidden) return;
        evento.preventDefault();
        // Recorre -1 (nada marcado, se ve lo escrito), 0, 1... y vuelve.
        let siguiente = activa + (evento.key === 'ArrowDown' ? 1 : -1);
        if (siguiente >= visibles.length) siguiente = -1;
        if (siguiente < -1) siguiente = visibles.length - 1;
        marcar(siguiente);
      } else if (evento.key === 'Enter' && !lista.hidden && activa >= 0) {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        elegir(visibles[activa].valor);
      } else if (evento.key === 'Escape' && !lista.hidden) {
        evento.preventDefault();
        descartada = true;
        cerrar();
      }
    },
    true
  );

  return {
    /** Vuelve a calcular la lista si está abierta (llegaron opciones nuevas). */
    actualizar() {
      if (!lista.hidden || (document.activeElement === input && !descartada)) abrir();
    },
    cerrar,
  };
}

/**
 * Botón ✕ dentro de la caja del campo para borrar lo escrito. Se oculta
 * con CSS mientras el campo está vacío (:placeholder-shown), así funciona
 * también cuando el valor cambia desde el código.
 */
export function agregarBotonBorrar(input, { alBorrar = null } = {}) {
  if (!input.placeholder) input.placeholder = ' ';
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'borrar-entrada';
  boton.textContent = '✕';
  boton.title = t('Borrar');
  boton.setAttribute('aria-label', t('Borrar lo escrito'));
  boton.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    if (alBorrar) alBorrar();
  });
  input.insertAdjacentElement('afterend', boton);
  input.closest('.panel-busqueda__caja')?.classList.add('con-borrar');
  return boton;
}
