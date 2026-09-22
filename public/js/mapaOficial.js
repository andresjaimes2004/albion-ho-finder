'use strict';

import { crear } from './svg.js';

/**
 * mapaOficial.js
 * ----------------------------------------------------------------------
 * Fondo con el mapa real del juego.
 *
 * Las imágenes son las teselas que publica la wiki oficial de Albion
 * Online (wiki.albiononline.com, de Sandbox Interactive): el mismo mapa
 * del mundo que se ve en el juego, cortado en cuadros de 256 px con
 * niveles de zoom 0 a 7. Las carga el navegador de cada visitante
 * directamente desde la wiki; el proyecto no guarda copias.
 *
 * CALIBRACIÓN (verificada, no supuesta):
 *
 *  1. Mundo → teselas. La propia wiki convierte las coordenadas de cada
 *     mapa con una rotación de 45° y la escala 256/800. Aplicada a la
 *     `worldmapposition` de los dumps del juego (a, b) queda:
 *        px0 = 0,32·a + 128      py0 = 128 − 0,32·b
 *     (px0/py0 = píxel de la tesela a zoom 0). Contrastada contra las
 *     coordenadas publicadas por la wiki para 14 mapas repartidos por
 *     todas las Tierras Exteriores, el desvío residual es de −0,043 y
 *     −0,088 px0 (desviación estándar < 0,12), que se corrige abajo.
 *
 *  2. Mapa individual → mundo. Orientación y escala se obtuvieron de los
 *     740 pares de salidas entre mapas vecinos: la dirección de cada
 *     salida dentro del mapa coincide con la dirección hacia el mapa
 *     vecino con un giro de −45° (coseno medio 0,895; ninguna otra
 *     orientación supera 0,64). La escala mediana es 0,0266 unidades del
 *     mapa mundial por metro del juego.
 *
 * El mapa mundial del juego es ilustrativo: la posición de caminos y
 * salidas sobre el recorte es aproximada (decenas de metros), no exacta.
 * ----------------------------------------------------------------------
 */

export const TESELAS = {
  url: 'https://wiki.albiononline.com/resources/assets/maptiles/{z}/map_{x}_{y}.png',
  zoomMaximo: 7,
  // Límites de las teselas publicadas, en píxeles de zoom 0.
  limites: { minX: 0, maxX: 256, minY: 0, maxY: 276 },
  atribucion: 'Mapa del juego: © Sandbox Interactive GmbH, vía la wiki oficial de Albion Online.',
};

const OFFSET_X = -0.043;
const OFFSET_Y = -0.088;

/** worldmapposition (dumps del juego) → píxel de tesela a zoom 0. */
export function mundoAPixel0(a, b) {
  return [0.32 * a + 128 + OFFSET_X, 128 - 0.32 * b + OFFSET_Y];
}

/** Unidades del mapa mundial por metro dentro de un mapa individual. */
export const ESCALA_MAPA = 0.0266;

const C = Math.SQRT1_2;

/**
 * Vista de un mapa individual (en diamante, como en el juego).
 * Coordenadas locales del juego (x, y con y hacia el norte) → vista SVG,
 * girada −45° y con el eje vertical hacia abajo. Conserva la escala: una
 * unidad de la vista es un metro del juego.
 */
export function localAVista(x, y) {
  return [C * (x + y), C * (x - y)];
}

export function vistaALocal(vx, vy) {
  return [C * (vx + vy), C * (vx - vy)];
}

/**
 * Capa de teselas dentro de un SVG con zoom/arrastre.
 *
 * `aTesela` describe cómo pasar de las coordenadas de la vista al píxel de
 * zoom 0 de las teselas:  px0 = origen[0] + factor·vx,  py0 = origen[1] + factor·vy.
 *
 * Mantiene una capa base de baja resolución (siempre completa) y encima
 * una capa de detalle que solo pide las teselas visibles al nivel de zoom
 * que corresponde a la ampliación actual de la pantalla.
 */
export class CapaTeselas {
  constructor(svg, grupo, { origen, factor, zoomBase, areaBase, maxTeselas = 90 }) {
    this.svg = svg;
    this.grupo = grupo;
    this.origen = origen;
    this.factor = factor;
    this.zoomBase = zoomBase;
    this.maxTeselas = maxTeselas;

    this.capaBase = crear('g', { class: 'teselas teselas--base' });
    this.capaDetalle = crear('g', { class: 'teselas teselas--detalle' });
    grupo.append(this.capaBase, this.capaDetalle);

    this.detalle = new Map();
    this.zoomDetalle = null;
    this.pendiente = false;

    this._pintarRango(this.capaBase, new Map(), zoomBase, areaBase);
  }

  /** Rectángulo (en px0) → rango de teselas a un zoom dado. */
  _rango(zoom, { minX, minY, maxX, maxY }) {
    const escala = 2 ** zoom / 256;
    const limites = TESELAS.limites;
    const totalX = Math.ceil((limites.maxX * 2 ** zoom) / 256);
    const totalY = Math.ceil((limites.maxY * 2 ** zoom) / 256);
    return {
      x0: Math.max(0, Math.floor(minX * escala)),
      x1: Math.min(totalX - 1, Math.floor(maxX * escala)),
      y0: Math.max(0, Math.floor(minY * escala)),
      y1: Math.min(totalY - 1, Math.floor(maxY * escala)),
    };
  }

  _pintarRango(capa, registro, zoom, area) {
    const { x0, x1, y0, y1 } = this._rango(zoom, area);
    const vivas = new Set();
    const lado = 256 / 2 ** zoom / this.factor; // tamaño de la tesela en la vista
    // Solape mínimo para que no se vean líneas entre teselas.
    const solape = lado * 0.004;

    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        const clave = `${zoom}/${tx}/${ty}`;
        vivas.add(clave);
        if (registro.has(clave)) continue;

        const vx = ((tx * 256) / 2 ** zoom - this.origen[0]) / this.factor;
        const vy = ((ty * 256) / 2 ** zoom - this.origen[1]) / this.factor;

        const imagen = crear('image', {
          href: TESELAS.url.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty),
          x: vx,
          y: vy,
          width: lado + solape,
          height: lado + solape,
          preserveAspectRatio: 'none',
          decoding: 'async',
        });
        imagen.addEventListener('error', () => imagen.remove(), { once: true });
        capa.appendChild(imagen);
        registro.set(clave, imagen);
      }
    }
    return vivas;
  }

  /** Área visible de la vista, convertida a píxeles de zoom 0. */
  _areaVisible() {
    const matriz = this.grupo.getScreenCTM();
    const caja = this.svg.getBoundingClientRect();
    if (!matriz || !caja.width) return null;

    const inversa = matriz.inverse();
    const esquinas = [
      [caja.left, caja.top],
      [caja.right, caja.top],
      [caja.left, caja.bottom],
      [caja.right, caja.bottom],
    ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(inversa));

    const xs = esquinas.map((p) => this.origen[0] + this.factor * p.x);
    const ys = esquinas.map((p) => this.origen[1] + this.factor * p.y);

    // Píxeles de pantalla por unidad de la vista.
    const pixelesPorUnidad = Math.sqrt(Math.abs(matriz.a * matriz.d - matriz.b * matriz.c));

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      pixelesPorPx0: pixelesPorUnidad / this.factor,
    };
  }

  /** Recalcula la capa de detalle; se agrupa en un fotograma por cambio. */
  actualizar() {
    if (this.pendiente) return;
    this.pendiente = true;
    requestAnimationFrame(() => {
      this.pendiente = false;
      this._actualizarAhora();
    });
  }

  _actualizarAhora() {
    const area = this._areaVisible();
    if (!area) return;

    const densidad = window.devicePixelRatio || 1;
    let zoom = Math.ceil(Math.log2(area.pixelesPorPx0 * densidad) - 0.25);
    zoom = Math.max(this.zoomBase + 1, Math.min(TESELAS.zoomMaximo, zoom));

    // No pedir cientos de teselas si la vista es muy grande.
    while (zoom > this.zoomBase + 1) {
      const r = this._rango(zoom, area);
      if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) <= this.maxTeselas) break;
      zoom -= 1;
    }

    if (zoom !== this.zoomDetalle) {
      this.capaDetalle.replaceChildren();
      this.detalle.clear();
      this.zoomDetalle = zoom;
    }

    const vivas = this._pintarRango(this.capaDetalle, this.detalle, zoom, area);
    for (const [clave, imagen] of this.detalle) {
      if (!vivas.has(clave)) {
        imagen.remove();
        this.detalle.delete(clave);
      }
    }
  }
}
