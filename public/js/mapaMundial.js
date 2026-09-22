'use strict';

import { crear, limpiar, habilitarNavegacion } from './svg.js';
import api from './api.js';

/**
 * mapaMundial.js
 * ----------------------------------------------------------------------
 * Mapa interactivo de toda la Zona Negra: 276 clusters dibujados en su
 * posición real (campo `worldmapposition` de los dumps del cliente) y
 * unidos por sus conexiones reales (las salidas de cada mapa).
 *
 * Al buscar un gremio, los mapas donde tiene hideout se resaltan y el
 * mapa se centra en ellos. Al hacer clic en cualquier mapa se abre la
 * ventana flotante con su detalle.
 * ----------------------------------------------------------------------
 */
export class MapaMundial {
  constructor({ alSeleccionar } = {}) {
    this.svg = document.getElementById('mapa-mundial__svg');
    this.estado = document.getElementById('mapa-mundial__estado');
    this.leyenda = document.getElementById('mapa-mundial__leyenda');
    this.alSeleccionar = alSeleccionar || (() => {});

    this.datos = null;
    this.nodos = new Map();
    this.navegacion = null;
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
    const xs = mapas.map((m) => m.x);
    const ys = mapas.map((m) => m.y);
    const margen = 40;
    const minX = Math.min(...xs) - margen;
    const maxX = Math.max(...xs) + margen;
    const minY = Math.min(...ys) - margen;
    const maxY = Math.max(...ys) + margen;

    const aY = (y) => maxY + minY - y;

    this.svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);

    const capa = crear('g', { 'data-capa-zoom': '' });
    this.svg.appendChild(capa);

    const posiciones = new Map(mapas.map((m) => [m.nombre, [m.x, aY(m.y)]]));
    this.posiciones = posiciones;

    // Radio proporcional al tamaño del mapa: así los nodos se ven igual
    // de finos aunque cambie el recorte del mundo.
    const unidad = (maxX - minX) / 320;

    // Conexiones reales entre mapas (salidas del cluster).
    const aristas = crear('g', { class: 'mundo__aristas' });
    for (const conexion of this.datos.conexiones) {
      const a = posiciones.get(conexion.a);
      const b = posiciones.get(conexion.b);
      if (!a || !b) continue;
      aristas.appendChild(
        crear('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-width': unidad * 0.35 })
      );
    }
    capa.appendChild(aristas);

    // Nodos: un círculo por mapa. El tamaño depende de cuántos hideouts
    // hay registrados en la temporada activa.
    const capaNodos = crear('g', { class: 'mundo__nodos' });
    capaNodos.setAttribute('stroke-width', String(unidad * 0.3));
    for (const mapa of mapas) {
      const [x, y] = posiciones.get(mapa.nombre);
      const grupo = crear('g', {
        class: `mundo__nodo mundo__nodo--t${mapa.tier || 0}`,
        'data-interactivo': '',
        'data-mapa': mapa.nombre,
        tabindex: '0',
        role: 'button',
        transform: `translate(${x} ${y})`,
      });

      grupo.appendChild(
        crear('circle', { r: unidad * (mapa.hideouts ? 1.6 + Math.min(mapa.hideouts, 6) * 0.22 : 1.1) })
      );
      grupo.appendChild(crear('title', {}, `${mapa.nombre} — T${mapa.tier} · ${mapa.hideouts} hideout(s)`));
      grupo.appendChild(
        crear(
          'text',
          { x: 0, y: -unidad * 3, 'text-anchor': 'middle', class: 'mundo__etiqueta' },
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

    this.navegacion = habilitarNavegacion(this.svg, { minEscala: 0.8, maxEscala: 18 });
    this.navegacion.refrescarCapa();

    this.leyenda.textContent = `${mapas.length} mapas de Zona Negra · ${this.datos.conexiones.length} conexiones · datos del cliente del juego`;
  }

  /** Resalta los mapas donde el gremio buscado tiene hideout. */
  destacar(nombresMapas) {
    this.destacados = new Set(nombresMapas);
    for (const [nombre, nodo] of this.nodos) {
      nodo.classList.toggle('mundo__nodo--destacado', this.destacados.has(nombre));
    }
    this._centrarEnDestacados();
  }

  /**
   * Centra la vista en los mapas resaltados. El zoom se calcula para que
   * todos quepan con holgura: si el gremio tiene hideouts repartidos por
   * media Zona Negra, no se hace un acercamiento inútil.
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
    const anchoOcupado = Math.max(Math.max(...xs) - Math.min(...xs), 60);
    const altoOcupado = Math.max(Math.max(...ys) - Math.min(...ys), 60);

    const caja = this.svg.viewBox.baseVal;
    const escala = Math.min(
      3.2,
      Math.max(1, Math.min(caja.width / (anchoOcupado * 1.8), caja.height / (altoOcupado * 1.8)))
    );

    this.navegacion.centrarEn(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
      escala
    );
  }
}

export default MapaMundial;
