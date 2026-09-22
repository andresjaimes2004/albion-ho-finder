'use strict';

const MapaRepository = require('../repositories/MapaRepository');
const HideoutRepository = require('../repositories/HideoutRepository');
const TemporadaRepository = require('../repositories/TemporadaRepository');

/**
 * MapaService
 * ----------------------------------------------------------------------
 * Sirve la geografía de la Zona Negra al frontend:
 *
 *  - `mundo()`   → todos los mapas con su posición real en el mapa mundial
 *                  y las conexiones entre ellos, más cuántos hideouts
 *                  tiene cada uno en la temporada vigente.
 *  - `detalle()` → un mapa concreto: límites, caminos, salidas hacia los
 *                  mapas vecinos, territorios y los hideouts registrados.
 *
 * Los datos geográficos provienen de los dumps oficiales del cliente del
 * juego. Las posiciones de los hideouts dentro del mapa son las marcadas
 * por un administrador; si nadie las marcó, viajan como null y la
 * interfaz los muestra como "sin ubicar" en lugar de inventarlas.
 * ----------------------------------------------------------------------
 */
class MapaService {
  constructor({
    mapaRepository = new MapaRepository(),
    hideoutRepository = new HideoutRepository(),
    temporadaRepository = new TemporadaRepository(),
  } = {}) {
    this.mapas = mapaRepository;
    this.hideouts = hideoutRepository;
    this.temporadas = temporadaRepository;
  }

  mundo() {
    const temporada = this.temporadas.obtenerActiva();
    const resumen = this.mapas.listarResumenGeo();

    const conteos = new Map();
    if (temporada) {
      for (const fila of this.hideouts.listarMapasConHideouts(temporada.id)) {
        conteos.set(fila.mapa, fila.total);
      }
    }

    return {
      ok: true,
      temporada: temporada ? temporada.codigo : null,
      fuente: 'Dumps oficiales del cliente de Albion Online (ao-bin-dumps).',
      mapas: resumen.map((m) => ({
        nombre: m.nombre,
        x: m.x,
        y: m.y,
        tipo: m.tipo,
        tier: m.tier,
        bioma: m.bioma,
        cuadrante: m.cuadrante,
        hideouts: conteos.get(m.nombre) || 0,
      })),
      conexiones: this.mapas.listarConexiones(),
    };
  }

  /** Bytes de la imagen propia de un mapa, o null si no tiene. */
  imagen(nombreMapa) {
    const mapa = this.mapas.obtenerPorNombre(nombreMapa);
    if (!mapa) return null;
    return this.mapas.obtenerImagenDatos(mapa.id) || null;
  }

  detalle(nombreMapa) {
    const geo = this.mapas.obtenerGeoPorNombre(nombreMapa);
    if (!geo) {
      return { ok: false, mensaje: 'No se encontró ese mapa de la Zona Negra.' };
    }

    const temporada = this.temporadas.obtenerActiva();
    const hideouts = temporada ? this.hideouts.listarPorMapa(nombreMapa, temporada.id) : [];

    const meta = this.mapas.obtenerImagenMeta(geo.id);
    const imagen = meta
      ? {
          // La fecha de actualización viaja en la URL para que el navegador
          // no muestre una versión vieja en caché tras reemplazarla.
          url: `/api/mapas/${encodeURIComponent(geo.nombre)}/imagen?v=${encodeURIComponent(meta.actualizadoEn)}`,
          escala: meta.escala,
          dx: meta.dx,
          dy: meta.dy,
          rotacion: meta.rotacion,
          actualizadoEn: meta.actualizadoEn,
        }
      : null;

    return {
      ok: true,
      temporada: temporada ? temporada.codigo : null,
      mapa: geo,
      imagen,
      hideouts: hideouts.map((h) => h.toJSON()),
      totalHideouts: hideouts.length,
      ubicados: hideouts.filter((h) => h.ubicado).length,
    };
  }
}

module.exports = MapaService;
