'use strict';

/**
 * svg.js
 * ----------------------------------------------------------------------
 * Utilidades para construir SVG mediante el DOM.
 *
 * Todo el contenido dinámico (nombres de gremio y de mapa) se inserta con
 * `textContent` o como atributos creados por estas funciones, nunca
 * concatenando HTML. Así un gremio llamado `<img onerror=...>` se dibuja
 * como texto literal y no puede ejecutar nada.
 * ----------------------------------------------------------------------
 */

const NS = 'http://www.w3.org/2000/svg';

export function crear(etiqueta, atributos = {}, texto) {
  const nodo = document.createElementNS(NS, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined) continue;
    nodo.setAttribute(clave, String(valor));
  }
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

export function limpiar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

/**
 * Zoom y desplazamiento sobre un <svg> con viewBox.
 *
 * El contenido vive dentro de un grupo marcado con `data-capa-zoom`, al
 * que se le aplica `translate(t) scale(k)`. Las coordenadas del ratón se
 * convierten a unidades del SVG con getScreenCTM(), de modo que el mapa
 * se mueve exactamente lo que se arrastra y el zoom respeta el punto bajo
 * el cursor, sin importar el tamaño del contenedor.
 */
export function habilitarNavegacion(svg, { minEscala = 0.5, maxEscala = 16 } = {}) {
  const estado = {
    escala: 1,
    x: 0,
    y: 0,
    arrastrando: false,
    ultimo: null,
    capa: svg.querySelector('[data-capa-zoom]'),
  };

  function aUnidades(clienteX, clienteY) {
    const matriz = svg.getScreenCTM();
    if (!matriz) return null;
    return new DOMPoint(clienteX, clienteY).matrixTransform(matriz.inverse());
  }

  function aplicar() {
    if (!estado.capa) return;
    estado.capa.setAttribute(
      'transform',
      `translate(${estado.x} ${estado.y}) scale(${estado.escala})`
    );
  }

  svg.addEventListener(
    'wheel',
    (evento) => {
      evento.preventDefault();
      const cursor = aUnidades(evento.clientX, evento.clientY);
      if (!cursor) return;

      const factor = evento.deltaY < 0 ? 1.18 : 1 / 1.18;
      const nueva = Math.min(maxEscala, Math.max(minEscala, estado.escala * factor));

      // El punto del contenido bajo el cursor debe quedarse donde estaba.
      const contenidoX = (cursor.x - estado.x) / estado.escala;
      const contenidoY = (cursor.y - estado.y) / estado.escala;

      estado.escala = nueva;
      estado.x = cursor.x - nueva * contenidoX;
      estado.y = cursor.y - nueva * contenidoY;
      aplicar();
    },
    { passive: false }
  );

  svg.addEventListener('pointerdown', (evento) => {
    if (evento.target.closest('[data-interactivo]')) return;
    const punto = aUnidades(evento.clientX, evento.clientY);
    if (!punto) return;
    estado.arrastrando = true;
    estado.ultimo = punto;
    svg.classList.add('arrastrando');
  });

  svg.addEventListener('pointermove', (evento) => {
    if (!estado.arrastrando) return;
    const punto = aUnidades(evento.clientX, evento.clientY);
    if (!punto) return;
    estado.x += punto.x - estado.ultimo.x;
    estado.y += punto.y - estado.ultimo.y;
    estado.ultimo = punto;
    aplicar();
  });

  const soltar = () => {
    estado.arrastrando = false;
    svg.classList.remove('arrastrando');
  };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('pointerleave', soltar);

  return {
    reiniciar() {
      estado.escala = 1;
      estado.x = 0;
      estado.y = 0;
      aplicar();
    },

    /** Centra la vista en un punto dado en coordenadas del propio SVG. */
    centrarEn(x, y, escala) {
      const caja = svg.viewBox.baseVal;
      const centroX = caja.width ? caja.x + caja.width / 2 : 0;
      const centroY = caja.height ? caja.y + caja.height / 2 : 0;

      estado.escala = Math.min(maxEscala, Math.max(minEscala, escala || estado.escala));
      estado.x = centroX - estado.escala * x;
      estado.y = centroY - estado.escala * y;
      aplicar();
    },

    get escala() {
      return estado.escala;
    },

    refrescarCapa() {
      estado.capa = svg.querySelector('[data-capa-zoom]');
      aplicar();
    },
  };
}
