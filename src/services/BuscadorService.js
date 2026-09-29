'use strict';

const HideoutRepository = require('../repositories/HideoutRepository');
const TemporadaRepository = require('../repositories/TemporadaRepository');
const MapaRepository = require('../repositories/MapaRepository');
const BusquedaRepository = require('../repositories/BusquedaRepository');

const LONGITUD_MINIMA_BUSQUEDA = 2;
const LONGITUD_MAXIMA_BUSQUEDA = 60;
/** Tope de mapas por nombre en un resultado (con 2 letras coinciden muchos). */
const MAX_MAPAS_POR_NOMBRE = 24;

/** Clave de comparación de nombres de mapa: sin tildes, espacios ni guiones. */
function claveMapa(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Qué tan bien coincide un nombre de mapa con lo buscado (menor es
 * mejor), o null si no coincide: 0 empieza igual, 1 alguna palabra
 * empieza igual, 2 lo contiene.
 */
function coincidenciaMapa(nombre, buscado) {
  const clave = claveMapa(nombre);
  if (!buscado || !clave.includes(buscado)) return null;
  if (clave.startsWith(buscado)) return 0;
  if (String(nombre).split(/[\s-]+/).some((palabra) => claveMapa(palabra).startsWith(buscado))) return 1;
  return 2;
}

function geoResumida(geo) {
  return geo
    ? { x: geo.x, y: geo.y, tipo: geo.tipo, tier: geo.tier, bioma: geo.bioma, cuadrante: geo.cuadrante }
    : null;
}

/**
 * BuscadorService
 * ----------------------------------------------------------------------
 * Capa de servicio: contiene la regla de negocio principal. Un mismo
 * texto se busca a la vez:
 *   - en los gremios: los mapas donde tienen hideout (como el Excel);
 *   - en los nombres de los mapas: el mapa aparece aunque no tenga
 *     hideouts del gremio buscado, con todos los hideouts que tenga.
 * y agrupa el resultado plano de la base de datos en la estructura que
 * consume el frontend.
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
    hideoutsCamino = null,
  } = {}) {
    this.hideoutRepository = hideoutRepository;
    this.temporadaRepository = temporadaRepository;
    this.mapaRepository = mapaRepository;
    this.busquedaRepository = busquedaRepository;
    // Gremios anotados en caminos de Avalon de hideouts (opcional).
    this.hideoutsCamino = hideoutsCamino;
  }

  /**
   * Sugerencias para el buscador (se filtran en el navegador mientras se
   * escribe): gremios con hideout en la temporada o anotados en caminos de
   * hideouts, y mapas de la Zona Negra.
   */
  sugerencias() {
    const temporada = this.temporadaRepository.obtenerActiva();
    const gremios = new Set(temporada ? this.hideoutRepository.listarGremiosTemporada(temporada.id) : []);
    if (this.hideoutsCamino) {
      for (const nombres of this.hideoutsCamino.porCamino().values()) for (const g of nombres) gremios.add(g);
    }
    const ordenar = (lista) => [...lista].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    return {
      ok: true,
      gremios: ordenar(gremios),
      mapas: ordenar(this.mapaRepository.listarNombres().map((m) => m.nombre)),
    };
  }

  /**
   * @param {string} textoBusqueda nombre (o parte) del gremio o del mapa
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

    const resultados = Array.from(mapasPorNombre.entries()).map(([mapa, hideoutsDelMapa]) => ({
      mapa,
      hideouts: hideoutsDelMapa,
      geo: geoResumida(geoPorNombre.get(mapa)),
    }));

    // Mapas cuyo nombre coincide, con todos sus hideouts (o ninguno).
    const buscado = claveMapa(texto);
    const coincidentes = [...geoPorNombre.values()]
      .map((geo) => ({ geo, nivel: coincidenciaMapa(geo.nombre, buscado) }))
      .filter((c) => c.nivel !== null)
      .sort((a, b) => a.nivel - b.nivel || a.geo.nombre.localeCompare(b.geo.nombre));
    const mapas = coincidentes.slice(0, MAX_MAPAS_POR_NOMBRE).map(({ geo }) => ({
      mapa: geo.nombre,
      hideouts: this.hideoutRepository.listarPorMapa(geo.nombre, temporada.id).map((h) => h.toJSON()),
      geo: geoResumida(geo),
    }));

    if (usuarioId) {
      const distintos = new Set([...resultados, ...mapas].map((r) => r.mapa));
      this.busquedaRepository.registrar({
        usuarioId,
        termino: texto,
        totalMapas: distintos.size,
        totalHideouts: hideouts.length,
      });
    }

    return {
      ok: true,
      temporada: temporada.codigo,
      // Resultado por gremio (mismos campos que antes).
      totalMapas: resultados.length,
      totalHideouts: hideouts.length,
      resultados,
      // Resultado por nombre de mapa.
      mapas,
      totalMapasPorNombre: coincidentes.length,
      // Caminos de Avalon de hideouts (por gremio anotado o por nombre).
      caminos: this.hideoutsCamino ? this.hideoutsCamino.buscar(texto) : [],
    };
  }
}

module.exports = BuscadorService;
module.exports.LONGITUD_MINIMA_BUSQUEDA = LONGITUD_MINIMA_BUSQUEDA;
module.exports.MAX_MAPAS_POR_NOMBRE = MAX_MAPAS_POR_NOMBRE;
