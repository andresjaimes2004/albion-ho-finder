'use strict';

const path = require('path');
const fs = require('fs');

const MapaRepository = require('../repositories/MapaRepository');
const ConexionReportadaRepository = require('../repositories/ConexionReportadaRepository');
const { cargarZonas, ETIQUETAS_GRUPO } = require('./zonas');

/**
 * TrackingService
 * ----------------------------------------------------------------------
 * Seguimiento de los caminos de Avalon. Combina tres fuentes:
 *
 *  - Catálogo oficial (estático): los caminos avalonianos que existen en
 *    el juego, con su tipo, tier, recursos y dungeons. Sale de los dumps
 *    del cliente (data/caminos_avalon.json, ver
 *    scripts/generarCaminosDesdeDumps.js).
 *
 *  - Conexiones en vivo: qué portal une a qué mapa y cuánto le queda
 *    abierto. El juego las cambia cada pocas horas y no están en ningún
 *    dato oficial; se consultan a la API pública de ava.smugden.com,
 *    alimentada por los escáneres de su comunidad.
 *
 *  - Conexiones del gremio: las que registran los propios usuarios desde
 *    capturas del juego (ver ReportesCaminosService). Si smugden informa
 *    la misma conexión, se muestra solo la del gremio.
 *
 * La API externa se consulta SOLO desde el servidor y con una caché
 * compartida (por defecto 30 s): da igual cuántos usuarios tengan la
 * página abierta, a smugden le llega como mucho una petición por
 * intervalo. Además esa API solo admite peticiones del navegador desde
 * su propio dominio (CORS), así que el frontend no podría llamarla
 * directamente.
 *
 * Si la API falla, se sigue sirviendo la última respuesta buena (o una
 * lista vacía) con el error en `estado.error`: el catálogo oficial
 * siempre queda disponible.
 * ----------------------------------------------------------------------
 */

const URL_EN_VIVO =
  process.env.TRACKING_API_URL || 'https://ava-api.smugden.com/api/ava-roads/public';

const MAX_CONEXIONES = 2000;
// Dos reportes de la misma conexión cuyos cierres difieren menos que esto
// se consideran la misma conexión.
const TOLERANCIA_DUPLICADO_MS = 20 * 60_000;
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

/** "TNL-001", "tnl001", "TNL-0001" → "tnl1"; "0337" → "337". */
function normalizarId(id) {
  const limpio = normalizar(id);
  const coincidencia = limpio.match(/^(tnl)?0*(\d+)$/);
  return coincidencia ? `${coincidencia[1] || ''}${coincidencia[2]}` : limpio;
}

function textoSeguro(valor) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const limpio = String(valor).trim().slice(0, MAX_TEXTO);
  // La fuente usa "?" cuando no conoce el nombre del mapa.
  return limpio && limpio !== '?' ? limpio : null;
}

function numeroFinito(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function fechaMs(valor) {
  if (!valor) return null;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? ms : null;
}

function cargarCatalogo() {
  const ruta = path.join(__dirname, '..', '..', 'data', 'caminos_avalon.json');
  return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
}

/** Consulta real a la API de smugden (inyectable en las pruebas). */
async function obtenerDeSmugden() {
  const respuesta = await fetch(URL_EN_VIVO, {
    headers: { Accept: 'application/json', 'User-Agent': 'albion-ho-finder (tracking de caminos)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!respuesta.ok) throw new Error(`La fuente en vivo respondió ${respuesta.status}.`);
  return respuesta.json();
}

/** Misma pareja de zonas (en cualquier sentido) y cierre parecido. */
function mismaConexion(a, b) {
  const mismasZonas =
    (a.origen.clave === b.origen.clave && a.destino.clave === b.destino.clave) ||
    (a.origen.clave === b.destino.clave && a.destino.clave === b.origen.clave);
  if (!mismasZonas) return false;
  if (a.cierraEn === null || b.cierraEn === null) return true;
  return Math.abs(a.cierraEn - b.cierraEn) <= TOLERANCIA_DUPLICADO_MS;
}

class TrackingService {
  constructor({
    catalogo = cargarCatalogo(),
    obtenerEnVivo = obtenerDeSmugden,
    mapaRepository = new MapaRepository(),
    reportesRepository = new ConexionReportadaRepository(),
    zonas = cargarZonas(),
    ttlMs = 30_000,
    ahora = () => Date.now(),
  } = {}) {
    this.catalogo = catalogo;
    this.obtenerEnVivo = obtenerEnVivo;
    this.mapas = mapaRepository;
    this.reportes = reportesRepository;
    this.zonaPorNombre = new Map(zonas.map((z) => [normalizar(z.nombre), z]));
    this.ttlMs = ttlMs;
    this.ahora = ahora;

    this.caminos = catalogo.caminos.map((c) => ({
      ...c,
      ...(CATEGORIAS[c.tipo] || { grupo: 'otro', etiqueta: c.tipo }),
    }));
    this.caminoPorNombre = new Map(this.caminos.map((c) => [normalizar(c.nombre), c]));
    this.caminoPorId = new Map(this.caminos.map((c) => [normalizarId(c.id), c]));

    this.cache = null;
    this.consultaEnCurso = null;
  }

  // ------------------------------------------------------------- en vivo --

  /** Datos en vivo, consultando la fuente solo si la caché venció. */
  async _enVivo() {
    const ahora = this.ahora();
    if (this.cache && ahora - this.cache.consultadoEn < this.ttlMs) return this.cache;
    if (this.consultaEnCurso) return this.consultaEnCurso;

    this.consultaEnCurso = (async () => {
      try {
        const cuerpo = await this.obtenerEnVivo();
        if (!cuerpo || !Array.isArray(cuerpo.roads)) {
          throw new Error('La fuente en vivo devolvió un formato inesperado.');
        }
        this.cache = {
          consultadoEn: ahora,
          actualizadoEn: fechaMs(cuerpo.updated_at),
          crudas: cuerpo.roads.slice(0, MAX_CONEXIONES),
          error: null,
        };
      } catch (error) {
        // Se conserva la última respuesta buena; solo se anota el fallo.
        this.cache = {
          consultadoEn: ahora,
          actualizadoEn: this.cache ? this.cache.actualizadoEn : null,
          crudas: this.cache ? this.cache.crudas : [],
          error: 'No se pudo consultar la fuente de conexiones en vivo.',
        };
        console.warn('[tracking]', error.message);
      } finally {
        this.consultaEnCurso = null;
      }
      return this.cache;
    })();

    return this.consultaEnCurso;
  }

  /** Conexiones vigentes (descarta las ya cerradas) y el estado de la fuente. */
  async _conexionesVigentes() {
    const datos = await this._enVivo();
    const ahora = this.ahora();
    const indiceZonaNegra = this._indiceZonaNegra();

    const delGremio = this.reportes
      .listarVigentes(new Date(ahora).toISOString())
      .map((r) => this._conexionReportada(r, indiceZonaNegra));

    const conexiones = [...delGremio];
    for (const cruda of datos.crudas) {
      const conexion = this._normalizarConexion(cruda, datos.consultadoEn, indiceZonaNegra);
      if (!conexion) continue;
      if (conexion.cierraEn !== null && conexion.cierraEn <= ahora) continue;
      if (delGremio.some((g) => mismaConexion(g, conexion))) continue;
      conexiones.push(conexion);
    }
    conexiones.sort((a, b) => (a.cierraEn ?? Infinity) - (b.cierraEn ?? Infinity));

    return {
      conexiones,
      estado: {
        fuente: 'ava.smugden.com',
        consultadoEn: new Date(datos.consultadoEn).toISOString(),
        actualizadoEn: datos.actualizadoEn ? new Date(datos.actualizadoEn).toISOString() : null,
        activas: conexiones.length,
        delGremio: delGremio.length,
        error: datos.error,
      },
    };
  }

  _normalizarConexion(cruda, consultadoEn, indiceZonaNegra) {
    if (!cruda || typeof cruda !== 'object') return null;

    const origen = this._extremo(
      cruda.source_cluster_id,
      cruda.source_map_name,
      cruda.source_map_type,
      indiceZonaNegra
    );
    const destino = this._extremo(cruda.target_cluster_id, cruda.target_name, null, indiceZonaNegra);
    if (!origen || !destino) return null;

    return {
      id: textoSeguro(cruda.id) || `${origen.clave}>${destino.clave}`,
      fuente: 'smugden',
      origen,
      destino,
      cierraEn: this._cierre(cruda, consultadoEn),
    };
  }

  _conexionReportada(reporte, indiceZonaNegra) {
    return {
      id: `gremio-${reporte.id}`,
      fuente: 'gremio',
      reporteId: reporte.id,
      reportadoPor: reporte.usuario || null,
      reportadoPorId: reporte.usuarioId,
      origen: this._extremo(null, reporte.origen, null, indiceZonaNegra),
      destino: this._extremo(null, reporte.destino, null, indiceZonaNegra),
      cierraEn: Date.parse(reporte.cierraEn),
    };
  }

  /** Momento de cierre (ms epoch) según los campos que traiga la fuente. */
  _cierre(cruda, consultadoEn) {
    const expira = numeroFinito(cruda.expires_at_ms);
    if (expira && expira > 0) return expira;

    const segundos = numeroFinito(cruda.closes_in_seconds);
    if (segundos !== null && segundos >= 0) {
      const base = fechaMs(cruda.first_seen_at) ?? fechaMs(cruda.last_seen_at) ?? consultadoEn;
      return base + segundos * 1000;
    }
    // `close_time_local` viene en la hora local del escáner, sin zona
    // horaria: no se puede convertir con seguridad, así que se omite.
    return null;
  }

  /** Identifica un extremo de la conexión contra el catálogo y la Zona Negra. */
  _extremo(idCrudo, nombreCrudo, tipoCrudo, indiceZonaNegra) {
    const id = textoSeguro(idCrudo);
    const nombre = textoSeguro(nombreCrudo);
    if (!id && !nombre) return null;

    const camino =
      (nombre && this.caminoPorNombre.get(normalizar(nombre))) ||
      (id && this.caminoPorId.get(normalizarId(id)));
    if (camino) {
      return { clave: normalizar(camino.nombre), nombre: camino.nombre, clase: 'avalon', tier: camino.tier, etiqueta: camino.etiqueta };
    }

    const zonaNegra =
      (nombre && indiceZonaNegra.porNombre.get(normalizar(nombre))) ||
      (id && indiceZonaNegra.porId.get(normalizarId(id)));
    if (zonaNegra) {
      return { clave: normalizar(zonaNegra.nombre), nombre: zonaNegra.nombre, clase: 'zonaNegra', tier: zonaNegra.tier, etiqueta: 'Zona Negra' };
    }

    // Otras zonas oficiales (continente real, ciudades...): nombre canónico y tipo.
    const zona = nombre && this.zonaPorNombre.get(normalizar(nombre));
    if (zona) {
      return { clave: normalizar(zona.nombre), nombre: zona.nombre, clase: 'otro', tier: null, etiqueta: ETIQUETAS_GRUPO[zona.grupo] || null };
    }

    const tipo = textoSeguro(tipoCrudo);
    return {
      clave: normalizar(nombre || id),
      nombre: nombre || null,
      clase: 'otro',
      tier: null,
      etiqueta: tipo && /^tunnel/i.test(tipo) ? 'Camino de Avalon' : null,
      idCluster: id,
    };
  }

  _indiceZonaNegra() {
    const porNombre = new Map();
    const porId = new Map();
    for (const mapa of this.mapas.listarResumenGeo()) {
      porNombre.set(normalizar(mapa.nombre), mapa);
      if (mapa.clusterId) porId.set(normalizarId(mapa.clusterId), mapa);
    }
    return { porNombre, porId };
  }

  // ----------------------------------------------------------- públicos --

  /** Catálogo completo + todas las conexiones vigentes. */
  async resumen() {
    const { conexiones, estado } = await this._conexionesVigentes();

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
        enVivo: 'ava.smugden.com — escáneres de la comunidad.',
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
    };
  }

  /**
   * Un mapa concreto (camino de Avalon o mapa de Zona Negra): sus datos
   * oficiales y las conexiones vigentes que salen o llegan a él.
   */
  async detalle(nombreMapa) {
    const clave = normalizar(nombreMapa);
    const { conexiones, estado } = await this._conexionesVigentes();

    const propias = conexiones
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

    const camino = this.caminoPorNombre.get(clave);
    if (camino) {
      return { ok: true, estado, mapa: { nombre: camino.nombre, clase: 'avalon', camino }, conexiones: propias };
    }

    const zonaNegra = this._indiceZonaNegra().porNombre.get(clave);
    if (zonaNegra) {
      return {
        ok: true,
        estado,
        mapa: { nombre: zonaNegra.nombre, clase: 'zonaNegra', tier: zonaNegra.tier, cuadrante: zonaNegra.cuadrante },
        conexiones: propias,
      };
    }

    // Mapas fuera del catálogo (ciudades, zonas reales...) que solo se
    // conocen porque aparecen en alguna conexión en vivo.
    const extremo = conexiones
      .map((c) => (c.origen.clave === clave ? c.origen : c.destino.clave === clave ? c.destino : null))
      .find(Boolean);
    if (extremo) {
      return {
        ok: true,
        estado,
        mapa: { nombre: extremo.nombre || extremo.idCluster || nombreMapa, clase: 'otro' },
        conexiones: propias,
      };
    }

    return { ok: false, mensaje: 'No se encontró ningún camino de Avalon ni mapa con ese nombre.' };
  }
}

TrackingService.normalizar = normalizar;
TrackingService.normalizarId = normalizarId;

module.exports = TrackingService;
