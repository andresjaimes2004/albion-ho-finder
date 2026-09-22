'use strict';

import { crear, limpiar, habilitarNavegacion } from './svg.js';
import { CapaTeselas, TESELAS, mundoAPixel0 } from './mapaOficial.js';
import api from './api.js';

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
 * Al buscar un gremio, los mapas donde tiene hideout se resaltan y la
 * vista se centra en ellos. Clic en un mapa → ventana con su detalle.
 * ----------------------------------------------------------------------
 */
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
    this.estado.textContent = 'Cargando mapa de la Zona Negra...';
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

    const capaNodos = crear('g', { class: 'mundo__nodos', 'stroke-width': unidad * 0.35 });
    for (const mapa of mapas) {
      const [x, y] = this.posiciones.get(mapa.nombre);
      const grupo = crear('g', {
        class: `mundo__nodo mundo__nodo--t${mapa.tier || 0}${mapa.hideouts ? ' mundo__nodo--ocupado' : ''}`,
        'data-interactivo': '',
        'data-mapa': mapa.nombre,
        tabindex: '0',
        role: 'button',
        transform: `translate(${x} ${y})`,
      });
      grupo.dataset.x = String(x);
      grupo.dataset.y = String(y);

      const lado = unidad * (mapa.hideouts ? 2.4 + Math.min(mapa.hideouts, 6) * 0.25 : 1.8);
      grupo.appendChild(
        crear('rect', { x: -lado / 2, y: -lado / 2, width: lado, height: lado, rx: lado * 0.18 })
      );
      grupo.appendChild(crear('title', {}, `${mapa.nombre} — T${mapa.tier} · ${mapa.hideouts} hideout(s)`));
      grupo.appendChild(
        crear(
          'text',
          {
            x: 0,
            y: -lado * 0.9,
            'text-anchor': 'middle',
            class: 'mundo__etiqueta',
            'font-size': unidad * 3,
            'stroke-width': unidad * 0.8,
          },
          mapa.nombre
        )
      );

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

    this.leyenda.textContent = `${mapas.length} mapas de Zona Negra · ${this.datos.conexiones.length} conexiones`;
    if (this.atribucion) this.atribucion.textContent = TESELAS.atribucion;

    if (this.destacados.size) this.destacar([...this.destacados]);
  }

  /**
   * Al acercar, los marcadores no deben crecer con el mapa (taparían el
   * terreno): se contraescalan y solo aumentan un poco para ganar lectura.
   */
  _ajustarNodos(escala) {
    if (this._escalaNodos === escala) return;
    this._escalaNodos = escala;
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
