'use strict';

import { crear, limpiar, habilitarNavegacion } from './svg.js';
import { CapaTeselas, TESELAS, mundoAPixel0 } from './mapaOficial.js';
import api from './api.js';
import { t } from './i18n.js';

/**
 * mapaMundial.js
 * ----------------------------------------------------------------------
 * Mapa interactivo de toda la Zona Negra: 276 clusters dibujados en su
 * posición real (campo `worldmapposition` de los dumps del cliente) sobre
 * el mapa del juego (teselas de la wiki oficial), unidos por sus
 * conexiones reales.
 *
 * El SVG trabaja directamente en píxeles de tesela de zoom 0, así que los
 * nodos y el fondo comparten el mismo sistema de coordenadas y no pueden
 * desalinearse al hacer zoom.
 *
 * Cada mapa es un punto del color de su tier (su anillo dentro de la
 * Zona Negra), con un área de clic amplia. Al acercar lo suficiente, cada
 * punto muestra una etiqueta con el nombre del mapa en ese mismo color
 * (como el mapa de ava.smugden.com), fácil de leer y de pulsar.
 *
 * Al buscar un gremio, los mapas donde tiene hideout se resaltan (con su
 * etiqueta siempre visible) y la vista se centra en ellos. Clic en un
 * mapa → ventana con su detalle.
 * ----------------------------------------------------------------------
 */

// A partir de este zoom se ven las etiquetas de todos los mapas.
const ESCALA_ETIQUETAS = 2.6;
export class MapaMundial {
  constructor({ alSeleccionar } = {}) {
    this.svg = document.getElementById('mapa-mundial__svg');
    this.estado = document.getElementById('mapa-mundial__estado');
    this.leyenda = document.getElementById('mapa-mundial__leyenda');
    this.atribucion = document.getElementById('mapa-mundial__atribucion');
    this.alSeleccionar = alSeleccionar || (() => {});

    this.datos = null;
    this.nodos = new Map();
    this.posiciones = new Map();
    this.navegacion = null;
    this.teselas = null;
    this.destacados = new Set();
  }

  async cargar() {
    if (this.datos) return this.datos;
    this.estado.textContent = t('Cargando mapa de la Zona Negra...');
    this.estado.hidden = false;

    this.datos = await api.mundo();
    this.estado.hidden = true;
    this._render();
    return this.datos;
  }

  _render() {
    limpiar(this.svg);
    this.nodos.clear();

    const mapas = this.datos.mapas.filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));
    for (const mapa of mapas) {
      this.posiciones.set(mapa.nombre, mundoAPixel0(mapa.x, mapa.y));
    }

    const puntos = [...this.posiciones.values()];
    const xs = puntos.map((p) => p[0]);
    const ys = puntos.map((p) => p[1]);
    const margen = 14;
    const area = {
      minX: Math.min(...xs) - margen,
      maxX: Math.max(...xs) + margen,
      minY: Math.min(...ys) - margen,
      maxY: Math.max(...ys) + margen,
    };
    const ancho = area.maxX - area.minX;
    const alto = area.maxY - area.minY;

    this.svg.setAttribute('viewBox', `${area.minX} ${area.minY} ${ancho} ${alto}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const capa = crear('g', { 'data-capa-zoom': '' });
    this.svg.appendChild(capa);

    // Fondo: el mapa del juego. Coordenadas de la vista = px0, así que el
    // factor es 1 y el origen 0.
    const fondo = crear('g', { class: 'mundo__fondo' });
    capa.appendChild(fondo);
    this.teselas = new CapaTeselas(this.svg, fondo, {
      origen: [0, 0],
      factor: 1,
      zoomBase: 2,
      areaBase: area,
    });

    // Tamaños proporcionales al área para que se vean igual en cualquier recorte.
    const unidad = ancho / 330;

    const aristas = crear('g', { class: 'mundo__aristas', 'stroke-width': unidad * 0.3 });
    for (const conexion of this.datos.conexiones) {
      const a = this.posiciones.get(conexion.a);
      const b = this.posiciones.get(conexion.b);
      if (!a || !b) continue;
      aristas.appendChild(crear('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
    }
    capa.appendChild(aristas);

    const capaNodos = crear('g', { class: 'mundo__nodos' });
    for (const mapa of mapas) {
      const [x, y] = this.posiciones.get(mapa.nombre);
      const tier = Math.min(8, Math.max(4, mapa.tier || 4));
      const grupo = crear('g', {
        class: `mundo__nodo mundo__nodo--t${tier}${mapa.hideouts ? ' mundo__nodo--ocupado' : ''}`,
        'data-interactivo': '',
        'data-mapa': mapa.nombre,
        tabindex: '0',
        role: 'button',
        'aria-label': t('{nombre} — T{tier} · {n} hideout(s)', { nombre: mapa.nombre, tier: mapa.tier, n: mapa.hideouts }),
        transform: `translate(${x} ${y})`,
      });
      grupo.dataset.x = String(x);
      grupo.dataset.y = String(y);
      grupo.appendChild(crear('title', {}, t('{nombre} — T{tier} · {n} hideout(s)', { nombre: mapa.nombre, tier: mapa.tier, n: mapa.hideouts })));

      // Área de clic amplia e invisible, halo de resaltado y punto.
      grupo.appendChild(crear('circle', { r: unidad * 3.6, class: 'mundo__zona-clic' }));
      grupo.appendChild(crear('circle', { r: unidad * 3, class: 'mundo__halo', 'stroke-width': unidad * 0.6 }));
      grupo.appendChild(crear('circle', { r: unidad * (mapa.hideouts ? 1.6 : 1.3), class: 'mundo__punto', 'stroke-width': unidad * 0.45 }));

      // Etiqueta con el nombre (se muestra al acercar, al pasar el ratón o si está resaltado).
      const letra = unidad * 3.1;
      const anchoTexto = mapa.nombre.length * letra * 0.56;
      const altoChip = letra * 1.7;
      const anchoChip = anchoTexto + letra * 1.3;
      const yChip = -(unidad * 2 + altoChip);
      const chip = crear('g', { class: 'mundo__chip' });
      chip.appendChild(crear('rect', { x: -anchoChip / 2, y: yChip, width: anchoChip, height: altoChip, rx: letra * 0.35, 'stroke-width': unidad * 0.3 }));
      chip.appendChild(
        crear('text', { x: 0, y: yChip + altoChip * 0.7, 'text-anchor': 'middle', 'font-size': letra, class: 'mundo__etiqueta' }, mapa.nombre)
      );
      grupo.appendChild(chip);

      const abrir = () => this.alSeleccionar(mapa.nombre);
      grupo.addEventListener('click', abrir);
      grupo.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          abrir();
        }
      });

      capaNodos.appendChild(grupo);
      this.nodos.set(mapa.nombre, grupo);
    }
    capa.appendChild(capaNodos);

    this.navegacion = habilitarNavegacion(this.svg, {
      minEscala: 0.8,
      maxEscala: 40,
      alCambiar: (estado) => {
        if (this.teselas) this.teselas.actualizar();
        this._ajustarNodos(estado.escala);
      },
    });
    this.navegacion.refrescarCapa();

    // Si el mapa se muestra después (sección oculta al cargar), recalcular.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.teselas && this.teselas.actualizar()).observe(this.svg);
    }

    this.leyenda.textContent = t('{mapas} mapas de Zona Negra · {conexiones} conexiones', { mapas: mapas.length, conexiones: this.datos.conexiones.length });
    if (this.atribucion) this.atribucion.textContent = t(TESELAS.atribucion);

    if (this.destacados.size) this.destacar([...this.destacados]);
  }

  /**
   * Al acercar, los marcadores no deben crecer con el mapa (taparían el
   * terreno): se contraescalan y solo aumentan un poco para ganar lectura.
   */
  _ajustarNodos(escala) {
    if (this._escalaNodos === escala) return;
    this._escalaNodos = escala;
    this.svg.classList.toggle('mundo--cerca', escala >= ESCALA_ETIQUETAS);
    const factor = 1 / escala ** 0.8;
    for (const nodo of this.nodos.values()) {
      nodo.setAttribute('transform', `translate(${nodo.dataset.x} ${nodo.dataset.y}) scale(${factor})`);
    }
  }

  /** Resalta los mapas donde el gremio buscado tiene hideout. */
  destacar(nombresMapas) {
    this.destacados = new Set(nombresMapas);
    for (const [nombre, nodo] of this.nodos) {
      nodo.classList.toggle('mundo__nodo--destacado', this.destacados.has(nombre));
      // Los resaltados se dibujan encima del resto.
      if (this.destacados.has(nombre)) nodo.parentNode.appendChild(nodo);
    }
    this._centrarEnDestacados();
  }

  /**
   * Centra la vista en los mapas resaltados, con un zoom que los deje a
   * todos a la vista con holgura.
   */
  _centrarEnDestacados() {
    if (!this.destacados.size || !this.navegacion) return;

    const puntos = [];
    for (const nombre of this.destacados) {
      const posicion = this.posiciones.get(nombre);
      if (posicion) puntos.push(posicion);
    }
    if (!puntos.length) return;

    const xs = puntos.map((p) => p[0]);
    const ys = puntos.map((p) => p[1]);
    const caja = this.svg.viewBox.baseVal;
    const anchoOcupado = Math.max(Math.max(...xs) - Math.min(...xs), caja.width * 0.12);
    const altoOcupado = Math.max(Math.max(...ys) - Math.min(...ys), caja.height * 0.12);

    const escala = Math.min(
      4,
      Math.max(1, Math.min(caja.width / (anchoOcupado * 1.6), caja.height / (altoOcupado * 1.6)))
    );

    this.navegacion.centrarEn(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
      escala
    );
  }
}

export default MapaMundial;
