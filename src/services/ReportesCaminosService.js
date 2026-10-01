'use strict';

const ConexionReportadaRepository = require('../repositories/ConexionReportadaRepository');
const RutaReportadaRepository = require('../repositories/RutaReportadaRepository');
const EspacioRepository = require('../repositories/EspacioRepository');
const db = require('../config/database');
const { ErrorValidacion } = require('../security/validacion');
const { cargarZonas, claveZona } = require('./zonas');

/**
 * ReportesCaminosService
 * ----------------------------------------------------------------------
 * Conexiones de caminos de Avalon registradas por el gremio a partir de
 * capturas del juego (el navegador lee la captura y el usuario confirma
 * lo leído antes de enviarlo).
 *
 * Reglas:
 *  - Solo usuarios con sesión. Cada conexión queda a su nombre.
 *  - Origen y destino deben ser zonas oficiales (se corrige mayúsculas y
 *    se guarda el nombre canónico), distintas, y al menos una debe ser
 *    un camino de Avalon.
 *  - El tiempo restante va de 1 minuto a 24 horas; el cierre se calcula
 *    con la hora del servidor.
 *  - Si ya hay una conexión vigente entre las mismas zonas, se actualiza
 *    en lugar de duplicarse (el último reporte manda).
 *  - Solo el autor o un administrador pueden borrarla.
 *
 * Rutas: varias conexiones pueden agruparse en orden (mapa de Zona
 * Negra → camino 1 → … → mapa final). Cada tramo debe compartir una zona
 * con el siguiente (los portales son de ida y vuelta, así que cada tramo
 * se orienta según la ruta) y ninguna zona se repite. Un tramo puede ser
 * una conexión del mismo envío (su posición en la lista) o una que ya
 * estaba guardada y sigue abierta ({ id }): así una captura nueva puede
 * continuar una ruta registrada antes, sin volver a subir sus capturas.
 * Registrar de nuevo la misma secuencia actualiza la ruta existente.
 *
 * Espacios privados: un envío puede ir a un espacio del que el usuario es
 * miembro. Sus conexiones y rutas quedan en ese espacio, solo se agrupan
 * con conexiones guardadas del mismo espacio (una ruta pública solo con
 * públicas) y la deduplicación nunca toca lo de otro espacio. Lo de un
 * espacio privado no existe para quien no es miembro (404), aunque sea
 * administrador.
 * ----------------------------------------------------------------------
 */

// Se pueden pegar muchas capturas de golpe y, con bifurcaciones, salen
// varias rutas que comparten tramos (el mismo tope que el navegador).
const MAX_POR_ENVIO = 100;
const MAX_RUTAS_POR_ENVIO = 40;
const MAX_MINUTOS = 24 * 60;
const MAX_TRAMOS_EDICION = 30;

function errorPublico(mensaje, estado) {
  const error = new Error(mensaje);
  error.publico = true;
  error.estado = estado;
  return error;
}

class ReportesCaminosService {
  constructor({
    zonas = cargarZonas(),
    repositorio = new ConexionReportadaRepository(),
    rutas = new RutaReportadaRepository(),
    espacios = new EspacioRepository(),
    transaccion = (fn) => db.transaccion(fn),
    ahora = () => Date.now(),
  } = {}) {
    this.espacios = espacios;
    this.zonas = zonas;
    this.zonaPorClave = new Map(zonas.map((z) => [claveZona(z.nombre), z]));
    this.repositorio = repositorio;
    this.rutas = rutas;
    this.transaccion = transaccion;
    this.ahora = ahora;
  }

  /** Lista para el autocompletado y la lectura de capturas del navegador. */
  zonasPublicas() {
    return this.zonas.map((z) => ({ nombre: z.nombre, grupo: z.grupo }));
  }

  _zona(valor, campo) {
    if (typeof valor !== 'string' || !valor.trim()) {
      throw new ErrorValidacion(`Falta el ${campo}.`);
    }
    const zona = this.zonaPorClave.get(claveZona(valor));
    if (!zona) throw new ErrorValidacion(`"${valor.slice(0, 60)}" no es una zona de Albion conocida.`);
    return zona;
  }

  _validar(conexion, indice) {
    const prefijo = `Conexión ${indice + 1}: `;
    try {
      if (!conexion || typeof conexion !== 'object') throw new ErrorValidacion('formato inválido.');
      const origen = this._zona(conexion.origen, 'origen');
      const destino = this._zona(conexion.destino, 'destino');
      if (origen.nombre === destino.nombre) {
        throw new ErrorValidacion('el origen y el destino no pueden ser la misma zona.');
      }
      if (origen.grupo !== 'avalon' && destino.grupo !== 'avalon') {
        throw new ErrorValidacion('al menos una de las dos zonas debe ser un camino de Avalon.');
      }
      const minutos = conexion.minutos;
      if (!Number.isInteger(minutos) || minutos < 1 || minutos > MAX_MINUTOS) {
        throw new ErrorValidacion('el tiempo de cierre debe estar entre 1 minuto y 24 horas.');
      }
      return { origen: origen.nombre, destino: destino.nombre, minutos };
    } catch (error) {
      if (error instanceof ErrorValidacion) error.message = prefijo + error.message;
      throw error;
    }
  }

  /**
   * Resuelve los tramos de una ruta: cada uno es la posición de una
   * conexión del envío o { id } de una conexión guardada que sigue abierta.
   */
  /** ¿Puede el usuario ver lo de ese espacio? (null = público) */
  _visible(usuarioId, espacioId) {
    if (espacioId === null || espacioId === undefined) return true;
    const espacio = this.espacios.obtener(espacioId);
    return Boolean(espacio && (espacio.publico || this.espacios.esMiembro(espacio.id, usuarioId)));
  }

  _tramosDeRuta(items, validas, numeroRuta, ahoraIso, { usuarioId, espacioId }) {
    const prefijo = `Ruta ${numeroRuta}: `;
    if (!Array.isArray(items) || items.length < 2) {
      throw new ErrorValidacion(`${prefijo}necesita al menos dos tramos.`);
    }
    const claves = items.map((item) => (item && typeof item === 'object' ? `g${item.id}` : `n${item}`));
    if (new Set(claves).size !== claves.length) {
      throw new ErrorValidacion(`${prefijo}repite un tramo.`);
    }
    return items.map((item) => {
      if (Number.isInteger(item) && item >= 0 && item < validas.length) {
        return { ...validas[item], indice: item };
      }
      if (item && typeof item === 'object' && Number.isInteger(item.id) && item.id > 0) {
        const guardada = this.repositorio.obtener(item.id);
        if (!guardada || guardada.cierraEn <= ahoraIso || !this._visible(usuarioId, guardada.espacioId)) {
          throw new ErrorValidacion(`${prefijo}usa una conexión guardada que ya cerró o se borró. Actualiza la página.`);
        }
        if ((guardada.espacioId ?? null) !== espacioId) {
          throw new ErrorValidacion(
            `${prefijo}no se pueden mezclar conexiones públicas y de un espacio privado, ni de espacios distintos.`
          );
        }
        return { origen: guardada.origen, destino: guardada.destino, id: guardada.id };
      }
      throw new ErrorValidacion(`${prefijo}hace referencia a una conexión que no existe.`);
    });
  }

  /**
   * Ordena los tramos de una ruta: devuelve la secuencia de zonas
   * (tramos + 1) o lanza un error si no se encadenan.
   */
  _secuenciaDeRuta(tramos, prefijo) {
    const primero = tramos[0];
    const segundo = tramos[1];
    // El primer tramo se orienta hacia la zona que comparte con el segundo.
    const zonas = [segundo.origen, segundo.destino].includes(primero.destino)
      ? [primero.origen, primero.destino]
      : [primero.destino, primero.origen];

    for (let k = 1; k < tramos.length; k++) {
      const tramo = tramos[k];
      const final = zonas[zonas.length - 1];
      if (tramo.origen === final) zonas.push(tramo.destino);
      else if (tramo.destino === final) zonas.push(tramo.origen);
      else {
        throw new ErrorValidacion(
          `${prefijo}la conexión ${k + 1} (${tramo.origen} – ${tramo.destino}) no continúa desde ${final}.`
        );
      }
    }
    if (new Set(zonas).size !== zonas.length) {
      throw new ErrorValidacion(`${prefijo}pasa dos veces por la misma zona.`);
    }
    return zonas;
  }

  /**
   * Registra una o varias conexiones y, opcionalmente, rutas que las
   * agrupan (`rutas`: listas en orden de posiciones de `lista` o de
   * { id } de conexiones ya guardadas). Se valida todo antes de guardar y
   * se guarda en una transacción: o entra todo o nada.
   */
  registrar(usuarioId, lista, rutas = [], { espacioId = null } = {}) {
    // Defensa en profundidad: el controlador ya lo comprobó.
    if (espacioId !== null && !this.espacios.esMiembro(espacioId, usuarioId)) {
      throw errorPublico('Ese espacio no existe o no eres miembro.', 404);
    }
    if (!Array.isArray(lista) || !lista.length) {
      throw new ErrorValidacion('No se envió ninguna conexión.');
    }
    if (lista.length > MAX_POR_ENVIO) {
      throw new ErrorValidacion(`Como máximo ${MAX_POR_ENVIO} conexiones por envío.`);
    }

    const validas = lista.map((c, i) => this._validar(c, i));
    if (!Array.isArray(rutas)) throw new ErrorValidacion('El campo "rutas" debe ser una lista.');
    if (rutas.length > MAX_RUTAS_POR_ENVIO) {
      throw new ErrorValidacion(`Como máximo ${MAX_RUTAS_POR_ENVIO} rutas por envío.`);
    }
    const ahora = this.ahora();
    const ahoraIso = new Date(ahora).toISOString();

    const secuencias = rutas.map((items, i) => {
      const tramos = this._tramosDeRuta(items, validas, i + 1, ahoraIso, { usuarioId, espacioId });
      return { tramos, zonas: this._secuenciaDeRuta(tramos, `Ruta ${i + 1}: `) };
    });

    // Las conexiones cerradas las purga el mantenimiento (TrackingService),
    // que antes borra los tramos que quedaron después de un portal cerrado.
    return this.transaccion(() => {
      let creadas = 0;
      let actualizadas = 0;
      const guardadas = validas.map(({ origen, destino, minutos }) => {
        const datos = { origen, destino, cierraEn: new Date(ahora + minutos * 60_000).toISOString(), usuarioId, espacioId };
        const existente = this.repositorio.buscarVigenteEntre(origen, destino, ahoraIso, espacioId);
        if (existente) {
          actualizadas += 1;
          return this.repositorio.actualizar(existente.id, datos);
        }
        creadas += 1;
        return this.repositorio.crear(datos);
      });

      const rutasGuardadas = secuencias.map(({ tramos, zonas }) => {
        const conexionIds = tramos.map((t) => (t.id !== undefined ? t.id : guardadas[t.indice].id));
        const existente = this.rutas.buscarPorZonas(zonas, espacioId) || this.rutas.buscarPorZonas([...zonas].reverse(), espacioId);
        if (existente) {
          // Misma ruta registrada en sentido contrario: se conserva el nuevo orden.
          const ordenados = this.rutas.buscarPorZonas(zonas, espacioId) ? conexionIds : [...conexionIds].reverse();
          return this.rutas.reemplazarTramos(existente.id, { conexionIds: ordenados, usuarioId });
        }
        return this.rutas.crear({ zonas, conexionIds, usuarioId, espacioId });
      });

      return { creadas, actualizadas, conexiones: guardadas, rutas: rutasGuardadas };
    });
  }

  /**
   * Edita una ruta: la nueva lista de conexiones, en el orden de la ruta
   * (se pueden agregar, quitar, reordenar o cambiar tiempos). Cada tramo
   * debe continuar desde el anterior. Las conexiones que ya existían entre
   * las mismas zonas se actualizan; las que la ruta deja de usar se borran
   * si ninguna otra ruta las usa. La ruta conserva su autor.
   */
  editarRuta(usuario, id, lista) {
    const ruta = this.rutas.obtener(id);
    if (!ruta || !this._visible(usuario.id, ruta.espacioId)) throw errorPublico('Esa ruta no existe.', 404);
    const espacioId = ruta.espacioId ?? null;
    if (ruta.usuarioId !== usuario.id && usuario.rol !== 'ADMIN') {
      throw errorPublico('Solo quien registró la ruta o un administrador puede editarla.', 403);
    }
    if (!Array.isArray(lista) || lista.length < 2) {
      throw new ErrorValidacion('La ruta necesita al menos dos conexiones.');
    }
    if (lista.length > MAX_TRAMOS_EDICION) {
      throw new ErrorValidacion(`Como máximo ${MAX_TRAMOS_EDICION} conexiones por ruta.`);
    }

    const validas = lista.map((c, i) => this._validar(c, i));
    const zonas = this._secuenciaDeRuta(validas, '');
    const igual = this.rutas.buscarPorZonas(zonas, espacioId) || this.rutas.buscarPorZonas([...zonas].reverse(), espacioId);
    if (igual && igual.id !== id) {
      throw errorPublico('Ya hay otra ruta con ese mismo recorrido.', 409);
    }

    const ahora = this.ahora();
    const ahoraIso = new Date(ahora).toISOString();
    return this.transaccion(() => {
      const conexionIds = validas.map(({ origen, destino, minutos }) => {
        const datos = { origen, destino, cierraEn: new Date(ahora + minutos * 60_000).toISOString(), usuarioId: usuario.id, espacioId };
        const existente = this.repositorio.buscarVigenteEntre(origen, destino, ahoraIso, espacioId);
        return existente ? this.repositorio.actualizar(existente.id, datos).id : this.repositorio.crear(datos).id;
      });
      this.rutas.actualizarRecorrido(id, { zonas, conexionIds });
      for (const anterior of ruta.conexionIds) {
        if (!conexionIds.includes(anterior) && !this.rutas.usaConexion(anterior)) this.repositorio.eliminar(anterior);
      }
      return this.rutas.obtener(id);
    });
  }

  eliminar(usuario, id) {
    const reporte = this.repositorio.obtener(id);
    if (!reporte || !this._visible(usuario.id, reporte.espacioId)) throw errorPublico('Esa conexión no existe.', 404);
    if (reporte.usuarioId !== usuario.id && usuario.rol !== 'ADMIN') {
      throw errorPublico('Solo quien registró la conexión o un administrador puede borrarla.', 403);
    }
    this.repositorio.eliminar(id);
    // Las rutas que usaban esa conexión quedan incompletas.
    this.rutas.purgarIncompletas();
  }

  /** Borra una ruta y las conexiones que solo se usaban en ella. */
  eliminarRuta(usuario, id) {
    const ruta = this.rutas.obtener(id);
    if (!ruta || !this._visible(usuario.id, ruta.espacioId)) throw errorPublico('Esa ruta no existe.', 404);
    if (ruta.usuarioId !== usuario.id && usuario.rol !== 'ADMIN') {
      throw errorPublico('Solo quien registró la ruta o un administrador puede borrarla.', 403);
    }
    this.transaccion(() => {
      const exclusivas = this.rutas.conexionesExclusivas(id);
      this.rutas.eliminar(id);
      for (const conexionId of exclusivas) this.repositorio.eliminar(conexionId);
    });
  }
}

module.exports = ReportesCaminosService;
