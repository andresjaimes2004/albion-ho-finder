'use strict';

const path = require('path');
const fs = require('fs');

const MapaRepository = require('../repositories/MapaRepository');
const ConexionReportadaRepository = require('../repositories/ConexionReportadaRepository');
const RutaReportadaRepository = require('../repositories/RutaReportadaRepository');
const { cargarZonas, ETIQUETAS_GRUPO } = require('./zonas');

/**
 * TrackingService
 * ----------------------------------------------------------------------
 * Seguimiento de los caminos de Avalon. Combina dos fuentes propias:
 *
 *  - Catálogo oficial (estático): los caminos avalonianos que existen en
 *    el juego, con su tipo, tier, recursos y dungeons. Sale de los dumps
 *    del cliente (data/caminos_avalon.json, ver
 *    scripts/generarCaminosDesdeDumps.js).
 *
 *  - Conexiones del gremio: qué portal une a qué mapa y cuánto le queda
 *    abierto. El juego las cambia cada pocas horas y no las publica en
 *    ningún dato oficial, así que las registran los propios usuarios
 *    desde capturas del juego (ver ReportesCaminosService). Varias de
 *    ellas pueden formar una ruta en orden (Zona Negra → camino → … →
 *    destino); una ruta se muestra mientras todos sus tramos sigan
 *    abiertos.
 *
 * No se consulta ninguna API externa: todo lo que se muestra sale de los
 * dumps oficiales o de la base de datos propia.
 * ----------------------------------------------------------------------
 */

const MAX_TEXTO = 80;

const CATEGORIAS = {
  TUNNEL_ROYAL: { grupo: 'real', etiqueta: 'Real' },
  TUNNEL_ROYAL_RED: { grupo: 'real', etiqueta: 'Real · roja' },
  TUNNEL_BLACK_LOW: { grupo: 'zonaNegra', etiqueta: 'Zona Negra · baja' },
  TUNNEL_BLACK_MEDIUM: { grupo: 'zonaNegra', etiqueta: 'Zona Negra · media' },
  TUNNEL_BLACK_HIGH: { grupo: 'zonaNegra', etiqueta: 'Zona Negra · alta' },
  TUNNEL_LOW: { grupo: 'avalon', etiqueta: 'Avalon · bajo' },
  TUNNEL_MEDIUM: { grupo: 'avalon', etiqueta: 'Avalon · medio' },
  TUNNEL_HIGH: { grupo: 'avalon', etiqueta: 'Avalon · alto' },
  TUNNEL_DEEP: { grupo: 'profundo', etiqueta: 'Profundo' },
  TUNNEL_DEEP_RAID: { grupo: 'profundo', etiqueta: 'Profundo · raid' },
  TUNNEL_HIDEOUT: { grupo: 'hideout', etiqueta: 'Hideout' },
  TUNNEL_HIDEOUT_DEEP: { grupo: 'hideout', etiqueta: 'Hideout profundo' },
};

/** Clave de comparación: minúsculas y solo letras/números. */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function textoSeguro(valor) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().slice(0, MAX_TEXTO);
  return limpio || null;
}

function cargarCatalogo() {
  const ruta = path.join(__dirname, '..', '..', 'data', 'caminos_avalon.json');
  return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
}

class TrackingService {
  constructor({
    catalogo = cargarCatalogo(),
    mapaRepository = new MapaRepository(),
    reportesRepository = new ConexionReportadaRepository(),
    rutasRepository = new RutaReportadaRepository(),
    zonas = cargarZonas(),
    ahora = () => Date.now(),
  } = {}) {
    this.catalogo = catalogo;
    this.mapas = mapaRepository;
    this.reportes = reportesRepository;
    this.rutasRepo = rutasRepository;
    this.zonaPorNombre = new Map(zonas.map((z) => [normalizar(z.nombre), z]));
    this.ahora = ahora;

    this.caminos = catalogo.caminos.map((c) => ({
      ...c,
      ...(CATEGORIAS[c.tipo] || { grupo: 'otro', etiqueta: c.tipo }),
    }));
    this.caminoPorNombre = new Map(this.caminos.map((c) => [normalizar(c.nombre), c]));
  }

  // ---------------------------------------------------------- vigentes --

  /** Conexiones y rutas del gremio que siguen abiertas. */
  _conexionesVigentes() {
    const ahora = this.ahora();
    const indiceZonaNegra = this._indiceZonaNegra();

    const reportadas = this.reportes.listarVigentes(new Date(ahora).toISOString());
    const conexiones = reportadas
      .map((r) => this._conexionReportada(r, indiceZonaNegra))
      .sort((a, b) => a.cierraEn - b.cierraEn);
    const rutas = this._rutasVigentes(reportadas, indiceZonaNegra);

    return {
      conexiones,
      rutas,
      estado: {
        consultadoEn: new Date(ahora).toISOString(),
        activas: conexiones.length,
        rutas: rutas.length,
      },
    };
  }

  /**
   * Rutas del gremio con todos sus tramos abiertos. Cada tramo lleva su
   * propio cierre; la ruta cierra cuando cierra el primero.
   */
  _rutasVigentes(reportadas, indiceZonaNegra) {
    const porId = new Map(reportadas.map((r) => [r.id, r]));
    const rutas = [];
    for (const ruta of this.rutasRepo.listarCompletas()) {
      const tramos = ruta.conexionIds.map((id) => porId.get(id));
      if (tramos.some((t) => !t)) continue;
      const cierres = tramos.map((t) => Date.parse(t.cierraEn));
      rutas.push({
        id: ruta.id,
        zonas: ruta.zonas.map((nombre) => this._extremo(nombre, indiceZonaNegra)),
        tramos: tramos.map((t, k) => ({ reporteId: t.id, cierraEn: cierres[k] })),
        cierraEn: Math.min(...cierres),
        reportadoPor: ruta.usuario || null,
        reportadoPorId: ruta.usuarioId,
      });
    }
    return rutas.sort((a, b) => b.cierraEn - a.cierraEn);
  }

  /** Conexiones vigentes que tocan una zona, vistas desde ella. */
  _conexionesDe(clave, conexiones) {
    return conexiones
      .filter((c) => c.origen.clave === clave || c.destino.clave === clave)
      .map((c) => {
        const esOrigen = c.origen.clave === clave;
        return {
          id: c.id,
          fuente: c.fuente,
          reporteId: c.reporteId,
          reportadoPor: c.reportadoPor,
          reportadoPorId: c.reportadoPorId,
          hacia: esOrigen ? c.destino : c.origen,
          sentido: esOrigen ? 'salida' : 'entrada',
          cierraEn: c.cierraEn,
        };
      });
  }

  _conexionReportada(reporte, indiceZonaNegra) {
    return {
      id: `gremio-${reporte.id}`,
      fuente: 'gremio',
      reporteId: reporte.id,
      reportadoPor: reporte.usuario || null,
      reportadoPorId: reporte.usuarioId,
      origen: this._extremo(reporte.origen, indiceZonaNegra),
      destino: this._extremo(reporte.destino, indiceZonaNegra),
      cierraEn: Date.parse(reporte.cierraEn),
    };
  }

  /** Identifica una zona contra el catálogo, la Zona Negra y las zonas oficiales. */
  _extremo(nombreCrudo, indiceZonaNegra) {
    const nombre = textoSeguro(nombreCrudo);
    if (!nombre) return null;
    const clave = normalizar(nombre);

    const camino = this.caminoPorNombre.get(clave);
    if (camino) {
      return { clave, nombre: camino.nombre, clase: 'avalon', tier: camino.tier, etiqueta: camino.etiqueta };
    }

    const zonaNegra = indiceZonaNegra.porNombre.get(clave);
    if (zonaNegra) {
      return { clave, nombre: zonaNegra.nombre, clase: 'zonaNegra', tier: zonaNegra.tier, etiqueta: 'Zona Negra' };
    }

    // Otras zonas oficiales (continente real, ciudades...): nombre canónico y tipo.
    const zona = this.zonaPorNombre.get(clave);
    return {
      clave,
      nombre: zona ? zona.nombre : nombre,
      clase: 'otro',
      tier: null,
      etiqueta: zona ? ETIQUETAS_GRUPO[zona.grupo] || null : null,
    };
  }

  _indiceZonaNegra() {
    const porNombre = new Map();
    for (const mapa of this.mapas.listarResumenGeo()) porNombre.set(normalizar(mapa.nombre), mapa);
    return { porNombre };
  }

  // ----------------------------------------------------------- públicos --

  /** Catálogo completo + todas las conexiones vigentes. */
  async resumen() {
    const { conexiones, rutas, estado } = this._conexionesVigentes();

    const conteo = new Map();
    for (const c of conexiones) {
      conteo.set(c.origen.clave, (conteo.get(c.origen.clave) || 0) + 1);
      conteo.set(c.destino.clave, (conteo.get(c.destino.clave) || 0) + 1);
    }

    return {
      ok: true,
      estado,
      fuentes: {
        catalogo: 'Dumps oficiales del cliente de Albion Online (ao-bin-dumps).',
        conexiones: 'Registradas por los usuarios desde capturas del juego.',
      },
      caminos: this.caminos.map((c) => ({
        nombre: c.nombre,
        tipo: c.tipo,
        grupo: c.grupo,
        etiqueta: c.etiqueta,
        tier: c.tier,
        dungeons: c.dungeons,
        recursos: [...new Set(c.recursos.map((r) => r.tipo))],
        conexiones: conteo.get(normalizar(c.nombre)) || 0,
      })),
      mapasZonaNegra: this.mapas.listarResumenGeo().map((m) => ({
        nombre: m.nombre,
        tier: m.tier,
        conexiones: conteo.get(normalizar(m.nombre)) || 0,
      })),
      conexiones,
      rutas,
    };
  }

  /**
   * Un mapa concreto (camino de Avalon o mapa de Zona Negra): sus datos
   * oficiales y las conexiones vigentes que salen o llegan a él.
   */
  async detalle(nombreMapa) {
    const clave = normalizar(nombreMapa);
    const { conexiones, rutas: todas, estado } = this._conexionesVigentes();

    const propias = this._conexionesDe(clave, conexiones);
    const rutas = todas.filter((r) => r.zonas.some((z) => z.clave === clave));

    const camino = this.caminoPorNombre.get(clave);
    if (camino) {
      return { ok: true, estado, mapa: { nombre: camino.nombre, clase: 'avalon', camino }, conexiones: propias, rutas };
    }

    const zonaNegra = this._indiceZonaNegra().porNombre.get(clave);
    if (zonaNegra) {
      return {
        ok: true,
        estado,
        mapa: { nombre: zonaNegra.nombre, clase: 'zonaNegra', tier: zonaNegra.tier, cuadrante: zonaNegra.cuadrante },
        conexiones: propias,
        rutas,
      };
    }

    // Mapas fuera del catálogo (ciudades, zonas reales...) que solo se
    // conocen porque aparecen en alguna conexión registrada.
    const extremo = conexiones
      .map((c) => (c.origen.clave === clave ? c.origen : c.destino.clave === clave ? c.destino : null))
      .find(Boolean);
    if (extremo) {
      return {
        ok: true,
        estado,
        mapa: { nombre: extremo.nombre || nombreMapa, clase: 'otro' },
        conexiones: propias,
        rutas,
      };
    }

    return { ok: false, mensaje: 'No se encontró ningún camino de Avalon ni mapa con ese nombre.' };
  }

  /**
   * Para la vista de hideouts: de cada mapa pedido, las rutas del gremio
   * que pasan por él y sus conexiones directas vigentes. Solo aparecen
   * los mapas que tienen algo.
   */
  async paraMapas(nombres) {
    const { conexiones, rutas, estado } = this._conexionesVigentes();
    const mapas = {};
    for (const nombre of nombres) {
      const clave = normalizar(nombre);
      const rutasDelMapa = rutas.filter((r) => r.zonas.some((z) => z.clave === clave));
      const conexionesDelMapa = this._conexionesDe(clave, conexiones);
      if (rutasDelMapa.length || conexionesDelMapa.length) {
        mapas[nombre] = { rutas: rutasDelMapa, conexiones: conexionesDelMapa };
      }
    }
    return { ok: true, estado, mapas };
  }
}

TrackingService.normalizar = normalizar;

module.exports = TrackingService;
