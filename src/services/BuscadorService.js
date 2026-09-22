'use strict';

const HideoutRepository = require('../repositories/HideoutRepository');
const TemporadaRepository = require('../repositories/TemporadaRepository');
const MapaRepository = require('../repositories/MapaRepository');
const BusquedaRepository = require('../repositories/BusquedaRepository');

const LONGITUD_MINIMA_BUSQUEDA = 2;
const LONGITUD_MAXIMA_BUSQUEDA = 60;

/**
 * BuscadorService
 * ----------------------------------------------------------------------
 * Capa de servicio: contiene la regla de negocio principal (buscar los
 * mapas/HOs de un gremio) y agrupa el resultado plano de la base de datos
 * en la estructura que consume el frontend.
 *
 * Cada mapa del resultado se enriquece con su posición real en el mapa
 * mundial, para poder resaltarlo en el mapa interactivo sin una segunda
 * petición.
 *
 * Si la búsqueda la hace un usuario autenticado, queda guardada en su
 * historial personal.
 * ----------------------------------------------------------------------
 */
class BuscadorService {
  constructor({
    hideoutRepository = new HideoutRepository(),
    temporadaRepository = new TemporadaRepository(),
    mapaRepository = new MapaRepository(),
    busquedaRepository = new BusquedaRepository(),
  } = {}) {
    this.hideoutRepository = hideoutRepository;
    this.temporadaRepository = temporadaRepository;
    this.mapaRepository = mapaRepository;
    this.busquedaRepository = busquedaRepository;
  }

  /**
   * @param {string} textoBusqueda nombre (o parte) del gremio
   * @param {{usuarioId?: number|null}} opciones
   */
  buscarPorGremio(textoBusqueda, { usuarioId = null } = {}) {
    const texto = (textoBusqueda || '').trim();

    if (texto.length < LONGITUD_MINIMA_BUSQUEDA) {
      return {
        ok: false,
        mensaje: `Escribe al menos ${LONGITUD_MINIMA_BUSQUEDA} caracteres para buscar.`,
      };
    }

    if (texto.length > LONGITUD_MAXIMA_BUSQUEDA) {
      return {
        ok: false,
        mensaje: `La búsqueda no puede superar ${LONGITUD_MAXIMA_BUSQUEDA} caracteres.`,
      };
    }

    const temporada = this.temporadaRepository.obtenerActiva();
    if (!temporada) {
      return { ok: false, mensaje: 'No hay datos cargados todavía. Ejecuta la importación del Excel.' };
    }

    const hideouts = this.hideoutRepository.buscarPorGremio(texto, temporada.id);

    const mapasPorNombre = new Map();
    for (const hideout of hideouts) {
      if (!mapasPorNombre.has(hideout.mapa)) {
        mapasPorNombre.set(hideout.mapa, []);
      }
      mapasPorNombre.get(hideout.mapa).push(hideout.toJSON());
    }

    // Posición real de cada mapa en el mapa mundial (dumps del juego).
    const geoPorNombre = new Map(
      this.mapaRepository.listarResumenGeo().map((m) => [m.nombre, m])
    );

    const resultados = Array.from(mapasPorNombre.entries()).map(([mapa, hideoutsDelMapa]) => {
      const geo = geoPorNombre.get(mapa) || null;
      return {
        mapa,
        hideouts: hideoutsDelMapa,
        geo: geo
          ? {
              x: geo.x,
              y: geo.y,
              tipo: geo.tipo,
              tier: geo.tier,
              bioma: geo.bioma,
              cuadrante: geo.cuadrante,
            }
          : null,
      };
    });

    if (usuarioId) {
      this.busquedaRepository.registrar({
        usuarioId,
        termino: texto,
        totalMapas: resultados.length,
        totalHideouts: hideouts.length,
      });
    }

    return {
      ok: true,
      temporada: temporada.codigo,
      totalMapas: resultados.length,
      totalHideouts: hideouts.length,
      resultados,
    };
  }
}

module.exports = BuscadorService;
module.exports.LONGITUD_MINIMA_BUSQUEDA = LONGITUD_MINIMA_BUSQUEDA;
