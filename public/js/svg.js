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
 * que se le aplica `translate(t) scale(k)`. Las coordenadas del puntero se
 * convierten a unidades del SVG con getScreenCTM(), de modo que el mapa
 * se mueve exactamente lo que se arrastra y el zoom respeta el punto bajo
 * el cursor, sin importar el tamaño del contenedor.
 *
 * Gestos:
 *  - Ratón: arrastrar mueve, la rueda acerca y aleja.
 *  - Táctil: un dedo mueve, dos dedos pellizcan (zoom y desplazamiento a
 *    la vez) y el doble toque acerca.
 *  - acercar(), alejar() y reiniciar() para los botones en pantalla.
 */
export function habilitarNavegacion(svg, { minEscala = 0.5, maxEscala = 16, alCambiar = null } = {}) {
  const estado = {
    escala: 1,
    x: 0,
    y: 0,
    capa: svg.querySelector('[data-capa-zoom]'),
  };

  // Punteros apoyados ahora mismo (ratón, dedos o lápiz), por pointerId.
  const punteros = new Map();
  // Gesto en curso: null, { tipo: 'arrastre', ultimo } o
  // { tipo: 'pellizco', distancia, escala, contenidoX, contenidoY }.
  let gesto = null;
  // Un arrastre no debe terminar en "clic": ni abrir un mapa ni marcar
  // la ubicación de un hideout por accidente.
  let huboArrastre = false;
  let ultimoToque = null;

  const UMBRAL_ARRASTRE = 5; // px de pantalla
  const DOBLE_TOQUE_MS = 300;

  function aUnidades(clienteX, clienteY) {
    const matriz = svg.getScreenCTM();
    if (!matriz) return null;
    return new DOMPoint(clienteX, clienteY).matrixTransform(matriz.inverse());
  }

  function limitar(escala) {
    return Math.min(maxEscala, Math.max(minEscala, escala));
  }

  function aplicar() {
    if (!estado.capa) return;
    estado.capa.setAttribute(
      'transform',
      `translate(${estado.x} ${estado.y}) scale(${estado.escala})`
    );
    if (alCambiar) alCambiar(estado);
  }

  /** Cambia la escala dejando quieto el punto (cx, cy), en unidades del SVG. */
  function zoomAlrededor(escala, cx, cy) {
    const nueva = limitar(escala);
    const contenidoX = (cx - estado.x) / estado.escala;
    const contenidoY = (cy - estado.y) / estado.escala;
    estado.escala = nueva;
    estado.x = cx - nueva * contenidoX;
    estado.y = cy - nueva * contenidoY;
    aplicar();
  }

  function centroDeVista() {
    const caja = svg.viewBox.baseVal;
    return caja && caja.width ? [caja.x + caja.width / 2, caja.y + caja.height / 2] : [0, 0];
  }

  svg.addEventListener(
    'wheel',
    (evento) => {
      evento.preventDefault();
      const cursor = aUnidades(evento.clientX, evento.clientY);
      if (!cursor) return;
      const factor = evento.deltaY < 0 ? 1.18 : 1 / 1.18;
      zoomAlrededor(estado.escala * factor, cursor.x, cursor.y);
    },
    { passive: false }
  );

  svg.addEventListener(
    'click',
    (evento) => {
      if (huboArrastre) {
        evento.stopPropagation();
        evento.preventDefault();
        huboArrastre = false;
      }
    },
    true
  );

  function capturar(pointerId) {
    // Seguir el puntero aunque salga del mapa mientras se arrastra.
    try {
      svg.setPointerCapture(pointerId);
    } catch (error) {
      // Puntero ya liberado: el gesto sigue funcionando sin captura.
    }
  }

  /** Empieza (o reanuda) el arrastre desde una posición de pantalla. */
  function empezarArrastre(clienteX, clienteY) {
    const punto = aUnidades(clienteX, clienteY);
    if (!punto) return;
    gesto = { tipo: 'arrastre', ultimo: punto };
    svg.classList.add('arrastrando');
  }

  /** Empieza el pellizco con los dos punteros apoyados. */
  function empezarPellizco() {
    const [a, b] = [...punteros.values()];
    const medio = aUnidades((a.x + b.x) / 2, (a.y + b.y) / 2);
    const distancia = Math.hypot(a.x - b.x, a.y - b.y);
    if (!medio || distancia < 1) return;
    gesto = {
      tipo: 'pellizco',
      distancia,
      escala: estado.escala,
      // Punto del contenido que queda entre los dos dedos.
      contenidoX: (medio.x - estado.x) / estado.escala,
      contenidoY: (medio.y - estado.y) / estado.escala,
    };
    huboArrastre = true;
    svg.classList.add('arrastrando');
  }

  svg.addEventListener('pointerdown', (evento) => {
    // Solo el botón principal mueve el mapa.
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;
    punteros.set(evento.pointerId, {
      x: evento.clientX,
      y: evento.clientY,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
    });

    if (punteros.size === 1) {
      huboArrastre = false;
      gesto = null;
      // Sobre un mapa, un hideout o una salida no se captura todavía el
      // puntero: si no se mueve, el clic tiene que llegar a ese elemento.
      if (evento.target.closest('[data-interactivo]')) return;
      // El fondo del mapa son imágenes (teselas o la imagen del mapa): sin
      // esto, el navegador empieza a "arrastrar la imagen", muestra el
      // cursor de prohibido y cancela el movimiento.
      evento.preventDefault();
      capturar(evento.pointerId);
      empezarArrastre(evento.clientX, evento.clientY);
    } else if (punteros.size === 2) {
      for (const id of punteros.keys()) capturar(id);
      empezarPellizco();
    }
  });

  // Por si algún navegador intenta igualmente arrastrar una imagen.
  svg.addEventListener('dragstart', (evento) => evento.preventDefault());

  svg.addEventListener('pointermove', (evento) => {
    const puntero = punteros.get(evento.pointerId);
    if (!puntero) return;
    puntero.x = evento.clientX;
    puntero.y = evento.clientY;

    if (gesto && gesto.tipo === 'pellizco') {
      if (punteros.size < 2) return;
      const [a, b] = [...punteros.values()];
      const medio = aUnidades((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (!medio) return;
      const nueva = limitar(gesto.escala * (Math.hypot(a.x - b.x, a.y - b.y) / gesto.distancia));
      // El punto que estaba entre los dedos sigue entre los dedos: así se
      // acerca y se desplaza con el mismo gesto.
      estado.escala = nueva;
      estado.x = medio.x - nueva * gesto.contenidoX;
      estado.y = medio.y - nueva * gesto.contenidoY;
      aplicar();
      return;
    }

    if (Math.hypot(puntero.x - puntero.inicioX, puntero.y - puntero.inicioY) > UMBRAL_ARRASTRE) {
      if (!gesto) {
        // Empezó sobre un elemento interactivo y ya se movió: es arrastre.
        capturar(evento.pointerId);
        empezarArrastre(puntero.inicioX, puntero.inicioY);
      }
      huboArrastre = true;
    }
    if (!gesto) return;

    const punto = aUnidades(puntero.x, puntero.y);
    if (!punto) return;
    estado.x += punto.x - gesto.ultimo.x;
    estado.y += punto.y - gesto.ultimo.y;
    gesto.ultimo = punto;
    aplicar();
  });

  /** Doble toque en el fondo (solo táctil): acerca al doble en ese punto. */
  function comprobarDobleToque(evento, puntero) {
    if (evento.pointerType !== 'touch' || huboArrastre) return;
    if (evento.target.closest('[data-interactivo]') || svg.classList.contains('svg--marcando')) {
      ultimoToque = null;
      return;
    }
    const ahora = performance.now();
    if (
      ultimoToque &&
      ahora - ultimoToque.tiempo < DOBLE_TOQUE_MS &&
      Math.hypot(puntero.x - ultimoToque.x, puntero.y - ultimoToque.y) < 30
    ) {
      ultimoToque = null;
      const punto = aUnidades(puntero.x, puntero.y);
      if (punto) zoomAlrededor(estado.escala * 2, punto.x, punto.y);
      return;
    }
    ultimoToque = { tiempo: ahora, x: puntero.x, y: puntero.y };
  }

  const soltar = (evento) => {
    const puntero = punteros.get(evento.pointerId);
    if (!puntero) return;
    punteros.delete(evento.pointerId);
    if (evento.type === 'pointerup') comprobarDobleToque(evento, puntero);

    if (punteros.size === 1 && gesto) {
      // Se levantó un dedo del pellizco: se sigue moviendo con el otro,
      // sin saltos.
      const [restante] = punteros.values();
      empezarArrastre(restante.x, restante.y);
    } else if (punteros.size === 0) {
      gesto = null;
      svg.classList.remove('arrastrando');
    }
  };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('lostpointercapture', soltar);
  // Un puntero sin capturar (apoyado sobre un mapa, sin mover) que sale
  // del SVG ya no enviará su pointerup aquí: se olvida, o el siguiente
  // toque se tomaría por un pellizco con un dedo fantasma.
  svg.addEventListener('pointerleave', (evento) => {
    if (!svg.hasPointerCapture(evento.pointerId)) soltar(evento);
  });

  return {
    reiniciar() {
      estado.escala = 1;
      estado.x = 0;
      estado.y = 0;
      aplicar();
    },

    /** Acerca un paso hacia el centro de la vista (botón "+"). */
    acercar() {
      zoomAlrededor(estado.escala * 1.6, ...centroDeVista());
    },

    /** Aleja un paso desde el centro de la vista (botón "−"). */
    alejar() {
      zoomAlrededor(estado.escala / 1.6, ...centroDeVista());
    },

    /** Centra la vista en un punto dado en coordenadas del propio SVG. */
    centrarEn(x, y, escala) {
      const [centroX, centroY] = centroDeVista();
      estado.escala = limitar(escala || estado.escala);
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
