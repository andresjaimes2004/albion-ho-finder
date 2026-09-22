'use strict';

const HideoutRepository = require('../repositories/HideoutRepository');
const TemporadaRepository = require('../repositories/TemporadaRepository');

const LONGITUD_MINIMA_BUSQUEDA = 2;

/**
 * BuscadorService
 * ----------------------------------------------------------------------
 * Capa de servicio: contiene la única regla de negocio de la app
 * (buscar los mapas/HOs de un gremio) y agrupa el resultado plano de la
 * base de datos en la estructura que consume el frontend. Separar esta
 * lógica del controlador (capas) facilita probarla de forma aislada.
 * ----------------------------------------------------------------------
 */
class BuscadorService {
  constructor({
    hideoutRepository = new HideoutRepository(),
    temporadaRepository = new TemporadaRepository(),
  } = {}) {
    this.hideoutRepository = hideoutRepository;
    this.temporadaRepository = temporadaRepository;
  }

  /**
   * @param {string} textoBusqueda nombre (o parte) del gremio
   * @returns {{ok: boolean, mensaje?: string, temporada?: string, totalMapas?: number, totalHideouts?: number, resultados?: object[]}}
   */
  buscarPorGremio(textoBusqueda) {
    const texto = (textoBusqueda || '').trim();

    if (texto.length < LONGITUD_MINIMA_BUSQUEDA) {
      return {
        ok: false,
        mensaje: `Escribe al menos ${LONGITUD_MINIMA_BUSQUEDA} caracteres para buscar.`,
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

    const resultados = Array.from(mapasPorNombre.entries()).map(([mapa, hideoutsDelMapa]) => ({
      mapa,
      hideouts: hideoutsDelMapa,
    }));

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
