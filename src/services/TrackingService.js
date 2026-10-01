'use strict';

const path = require('path');
const fs = require('fs');

const MapaRepository = require('../repositories/MapaRepository');
const ConexionReportadaRepository = require('../repositories/ConexionReportadaRepository');
const RutaReportadaRepository = require('../repositories/RutaReportadaRepository');
const { cargarZonas, ETIQUETAS_GRUPO } = require('./zonas');
const { crearCercania } = require('./portales');
const { clasificarRutas, VENTANA_CERRADAS_MS } = require('./estadoRutas');
const db = require('../config/database');

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
// Una conexión que no forma parte de ninguna ruta se borra pasado este
// tiempo desde que se registró (por si el resto de la ruta llega después).
const MARGEN_SUELTAS_MS = 30 * 60_000;

function errorPublico(mensaje, estado) {
  const error = new Error(mensaje);
  error.publico = true;
  error.estado = estado;
  return error;
}

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
    transaccion = (fn) => db.transaccion(fn),
    hideoutsCamino = null,
  } = {}) {
    this.catalogo = catalogo;
    this.mapas = mapaRepository;
    this.reportes = reportesRepository;
    this.rutasRepo = rutasRepository;
    this.zonaPorNombre = new Map(zonas.map((z) => [normalizar(z.nombre), z]));
    this.portales = zonas.filter((z) => z.grupo === 'portalCiudad').map((z) => z.nombre);
    this.ahora = ahora;
    this.transaccion = transaccion;
    // Gremios anotados en caminos de hideouts (opcional).
    this.hideoutsCamino = hideoutsCamino;

    this.caminos = catalogo.caminos.map((c) => ({
      ...c,
      ...(CATEGORIAS[c.tipo] || { grupo: 'otro', etiqueta: c.tipo }),
    }));
    this.caminoPorNombre = new Map(this.caminos.map((c) => [normalizar(c.nombre), c]));
  }

  // ---------------------------------------------------------- vigentes --

  /**
   * Conexiones y rutas del gremio: las abiertas y las rutas que cerraron
   * hace menos de 30 minutos (ver estadoRutas.js). Los tramos que quedaron
   * después de un portal cerrado no cuentan como conexiones abiertas.
   */
  _conexionesVigentes() {
    const ahora = this.ahora();
    const indiceZonaNegra = this._indiceZonaNegra();

    const reportadas = this.reportes.listarDesde(new Date(ahora - VENTANA_CERRADAS_MS).toISOString());
    const cierres = new Map(reportadas.map((r) => [r.id, Date.parse(r.cierraEn)]));
    const orientadas = this.rutasRepo.listarCompletas().map((ruta) => this._orientar(ruta));
    const { activas, cerradas, desconectadas } = clasificarRutas(orientadas, cierres, ahora);
    this._gremiosPorCamino = this.hideoutsCamino ? this.hideoutsCamino.porCamino() : new Map();

    const conexiones = reportadas
      .filter((r) => cierres.get(r.id) > ahora && !desconectadas.has(r.id))
      .map((r) => this._conexionReportada(r, indiceZonaNegra))
      .sort((a, b) => a.cierraEn - b.cierraEn);

    const saltos = (r) => (r.cercania ? r.cercania.saltos : Infinity);
    const rutas = activas
      .map((ruta) => this._rutaPublica(ruta, cierres, indiceZonaNegra))
      .sort((a, b) => saltos(a) - saltos(b) || b.cierraEn - a.cierraEn);

    const rutasCerradas = cerradas
      .map(({ ruta, cerradaEn, indiceCierre }) => {
        const publica = this._rutaPublica(ruta, cierres, indiceZonaNegra);
        publica.tramos.forEach((tramo, k) => {
          if (k === indiceCierre) tramo.estado = 'cerrado';
          else if (k > indiceCierre) tramo.estado = 'desconectado';
          else tramo.estado = tramo.cierraEn > ahora ? 'abierto' : 'cerrado';
        });
        return { ...publica, cerradaEn, tramoCerrado: indiceCierre, borraEn: cerradaEn + VENTANA_CERRADAS_MS };
      })
      .sort((a, b) => b.cerradaEn - a.cerradaEn);

    return {
      conexiones,
      rutas,
      rutasCerradas,
      estado: {
        consultadoEn: new Date(ahora).toISOString(),
        activas: conexiones.length,
        rutas: rutas.length,
      },
    };
  }

  /**
   * Orienta una ruta desde el extremo más cercano a un portal de ciudad:
   * así se lee como "saliendo de Lymhurst Portal, a 2 mapas...".
   */
  _orientar(ruta) {
    const inicio = this._cercania(ruta.zonas[0]);
    const fin = this._cercania(ruta.zonas[ruta.zonas.length - 1]);
    const invertir = Boolean(fin && (!inicio || fin.saltos < inicio.saltos));
    return {
      ...ruta,
      zonas: invertir ? [...ruta.zonas].reverse() : ruta.zonas,
      conexionIds: invertir ? [...ruta.conexionIds].reverse() : ruta.conexionIds,
      cercania: invertir ? fin : inicio,
    };
  }

  /** Ruta ya orientada, con los datos que ve el navegador. */
  _rutaPublica(ruta, cierres, indiceZonaNegra) {
    const zonas = ruta.zonas.map((nombre) => {
      const zona = this._extremo(nombre, indiceZonaNegra);
      // En un camino de hideouts, los gremios que se anotaron allí.
      const gremios = this._gremiosPorCamino && this._gremiosPorCamino.get(zona.nombre);
      return gremios ? { ...zona, gremios } : zona;
    });
    const tramos = ruta.conexionIds.map((id) => ({ reporteId: id, cierraEn: cierres.get(id) }));
    return {
      id: ruta.id,
      zonas,
      tramos,
      cierraEn: Math.min(...tramos.map((t) => t.cierraEn)),
      cercania: ruta.cercania ? { ...ruta.cercania, desde: zonas[0].nombre } : null,
      reportadoPor: ruta.usuario || null,
      reportadoPorId: ruta.usuarioId,
    };
  }

  /**
   * Mantenimiento (cada minuto): borra las rutas que cerraron hace más de
   * 30 minutos junto con los tramos que quedaron después del portal
   * cerrado (si ninguna otra ruta los usa), y las conexiones ya cerradas.
   */
  mantenimiento() {
    const ahora = this.ahora();
    const cierres = new Map(this.reportes.listarDesde('').map((r) => [r.id, Date.parse(r.cierraEn)]));
    const orientadas = this.rutasRepo.listarCompletas().map((ruta) => this._orientar(ruta));
    const { expiradas } = clasificarRutas(orientadas, cierres, ahora);

    return this.transaccion(() => {
      for (const { ruta, siguientes } of expiradas) {
        this.rutasRepo.eliminar(ruta.id);
        for (const id of siguientes) {
          if (!this.rutasRepo.usaConexion(id)) this.reportes.eliminar(id);
        }
      }
      const cerradas = this.reportes.purgarCerradasAntesDe(new Date(ahora - VENTANA_CERRADAS_MS).toISOString());
      const incompletas = this.rutasRepo.purgarIncompletas();
      // Conexiones sueltas: sin ruta (ni mapa inicial ni final). Se les da
      // un margen por si otro miembro está capturando el resto de la ruta.
      const limiteSueltas = new Date(ahora - MARGEN_SUELTAS_MS).toISOString().replace('T', ' ').slice(0, 19);
      const sueltas = this.reportes.purgarSueltasAntesDe(limiteSueltas);
      return { rutas: expiradas.length + incompletas, conexiones: cerradas + sueltas };
    });
  }

  /**
   * Borrado masivo de rutas (solo administradores), con las conexiones que
   * dejan de usar si ninguna otra ruta las usa:
   *  - 'todas':   todas las rutas y todas las conexiones.
   *  - 'activas': las rutas abiertas (no toca las cerradas hace poco).
   *  - 'zona':    las rutas que pasan por esa zona (mapa o camino).
   *  - 'portal':  las rutas cuyo portal de ciudad más cercano es ese.
   */
  borrarRutas({ alcance, valor = null }) {
    if (alcance === 'todas') {
      return this.transaccion(() => {
        const rutas = this.rutasRepo.eliminarTodas();
        const conexiones = this.reportes.eliminarTodas();
        return { rutas, conexiones };
      });
    }

    const ahora = this.ahora();
    const cierres = new Map(this.reportes.listarDesde('').map((r) => [r.id, Date.parse(r.cierraEn)]));
    const orientadas = this.rutasRepo.listarCompletas().map((ruta) => this._orientar(ruta));
    let elegidas;
    if (alcance === 'activas') {
      elegidas = clasificarRutas(orientadas, cierres, ahora).activas;
    } else if (alcance === 'zona') {
      const clave = normalizar(valor);
      if (!clave) throw errorPublico('Indica la zona.', 400);
      elegidas = orientadas.filter((r) => r.zonas.some((z) => normalizar(z) === clave));
    } else if (alcance === 'portal') {
      if (!this.portales.includes(valor)) throw errorPublico('Ese no es un portal de ciudad.', 400);
      elegidas = orientadas.filter((r) => r.cercania && r.cercania.portal === valor);
    } else {
      throw errorPublico('Alcance de borrado desconocido.', 400);
    }

    return this.transaccion(() => {
      const usadas = new Set(elegidas.flatMap((r) => r.conexionIds));
      for (const ruta of elegidas) this.rutasRepo.eliminar(ruta.id);
      let conexiones = 0;
      for (const id of usadas) {
        if (!this.rutasRepo.usaConexion(id) && this.reportes.eliminar(id)) conexiones += 1;
      }
      return { rutas: elegidas.length, conexiones };
    });
  }

  /** Portal de ciudad más cercano a una zona (se calcula una vez). */
  _cercania(nombre) {
    if (!this._funcionCercania) {
      const mapas = typeof this.mapas.listarSalidas === 'function' ? this.mapas.listarSalidas() : [];
      this._funcionCercania = crearCercania(mapas, this.portales);
    }
    return this._funcionCercania(nombre);
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
      const zona = { clave, nombre: camino.nombre, clase: 'avalon', tier: camino.tier, etiqueta: camino.etiqueta };
      // Camino de hideouts: se pueden anotar los gremios que tienen hideout allí.
      return camino.grupo === 'hideout' ? { ...zona, esHideout: true } : zona;
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
    const { conexiones, rutas, rutasCerradas, estado } = this._conexionesVigentes();

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
        // Caminos de hideouts: los gremios que se conocen (web y Excel).
        ...(c.grupo === 'hideout' ? { gremios: this._gremiosPorCamino.get(c.nombre) || [] } : {}),
      })),
      mapasZonaNegra: this.mapas.listarResumenGeo().map((m) => ({
        nombre: m.nombre,
        tier: m.tier,
        conexiones: conteo.get(normalizar(m.nombre)) || 0,
      })),
      conexiones,
      rutas,
      // Rutas que cerraron hace menos de 30 minutos, para corregirlas.
      rutasCerradas,
      // Para agrupar las rutas por el portal de ciudad más cercano.
      portales: this.portales,
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
      const esHideout = Boolean(this.hideoutsCamino && this.hideoutsCamino.esCaminoHideout(camino.nombre));
      return {
        ok: true,
        estado,
        mapa: { nombre: camino.nombre, clase: 'avalon', camino, esHideout },
        conexiones: propias,
        rutas,
        // Gremios con hideout en este camino (solo en caminos de hideouts).
        hideouts: esHideout ? this.hideoutsCamino.listar(camino.nombre) : undefined,
      };
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
