'use strict';

const ConexionReportadaRepository = require('../repositories/ConexionReportadaRepository');
const RutaReportadaRepository = require('../repositories/RutaReportadaRepository');
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
 * Rutas: varias conexiones del mismo envío pueden agruparse en orden
 * (mapa de Zona Negra → camino 1 → … → mapa final). Cada tramo debe
 * compartir una zona con el siguiente (los portales son de ida y vuelta,
 * así que cada tramo se orienta según la ruta) y ninguna zona se repite.
 * Registrar de nuevo la misma secuencia actualiza la ruta existente.
 * ----------------------------------------------------------------------
 */

const MAX_POR_ENVIO = 20;
const MAX_RUTAS_POR_ENVIO = 10;
const MAX_MINUTOS = 24 * 60;
const CONSERVAR_CERRADAS_MS = 24 * 3600 * 1000;

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
    transaccion = (fn) => db.transaccion(fn),
    ahora = () => Date.now(),
  } = {}) {
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
   * Ordena los tramos de una ruta: devuelve la secuencia de zonas
   * (tramos + 1) o lanza un error si no se encadenan.
   */
  _secuenciaDeRuta(indices, validas, numeroRuta) {
    const prefijo = `Ruta ${numeroRuta}: `;
    if (!Array.isArray(indices) || indices.length < 2) {
      throw new ErrorValidacion(`${prefijo}necesita al menos dos tramos.`);
    }
    if (new Set(indices).size !== indices.length) {
      throw new ErrorValidacion(`${prefijo}repite un tramo.`);
    }
    for (const i of indices) {
      if (!Number.isInteger(i) || i < 0 || i >= validas.length) {
        throw new ErrorValidacion(`${prefijo}hace referencia a una conexión que no existe.`);
      }
    }

    const primero = validas[indices[0]];
    const segundo = validas[indices[1]];
    // El primer tramo se orienta hacia la zona que comparte con el segundo.
    const zonas = [segundo.origen, segundo.destino].includes(primero.destino)
      ? [primero.origen, primero.destino]
      : [primero.destino, primero.origen];

    for (let k = 1; k < indices.length; k++) {
      const tramo = validas[indices[k]];
      const final = zonas[zonas.length - 1];
      if (tramo.origen === final) zonas.push(tramo.destino);
      else if (tramo.destino === final) zonas.push(tramo.origen);
      else {
        throw new ErrorValidacion(
          `${prefijo}el tramo ${k} (${tramo.origen} – ${tramo.destino}) no continúa desde ${final}.`
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
   * agrupan (`rutas`: listas de índices de `lista`, en orden). Se valida
   * todo antes de guardar y se guarda en una transacción: o entra todo o
   * nada.
   */
  registrar(usuarioId, lista, rutas = []) {
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
    const secuencias = rutas.map((indices, i) => ({ indices, zonas: this._secuenciaDeRuta(indices, validas, i + 1) }));

    const ahora = this.ahora();
    const ahoraIso = new Date(ahora).toISOString();

    return this.transaccion(() => {
      this.repositorio.purgarCerradasAntesDe(new Date(ahora - CONSERVAR_CERRADAS_MS).toISOString());
      this.rutas.purgarIncompletas();

      let creadas = 0;
      let actualizadas = 0;
      const guardadas = validas.map(({ origen, destino, minutos }) => {
        const datos = { origen, destino, cierraEn: new Date(ahora + minutos * 60_000).toISOString(), usuarioId };
        const existente = this.repositorio.buscarVigenteEntre(origen, destino, ahoraIso);
        if (existente) {
          actualizadas += 1;
          return this.repositorio.actualizar(existente.id, datos);
        }
        creadas += 1;
        return this.repositorio.crear(datos);
      });

      const rutasGuardadas = secuencias.map(({ indices, zonas }) => {
        const conexionIds = indices.map((i) => guardadas[i].id);
        const existente = this.rutas.buscarPorZonas(zonas) || this.rutas.buscarPorZonas([...zonas].reverse());
        if (existente) {
          // Misma ruta registrada en sentido contrario: se conserva el nuevo orden.
          const ordenados = this.rutas.buscarPorZonas(zonas) ? conexionIds : [...conexionIds].reverse();
          return this.rutas.reemplazarTramos(existente.id, { conexionIds: ordenados, usuarioId });
        }
        return this.rutas.crear({ zonas, conexionIds, usuarioId });
      });

      return { creadas, actualizadas, conexiones: guardadas, rutas: rutasGuardadas };
    });
  }

  eliminar(usuario, id) {
    const reporte = this.repositorio.obtener(id);
    if (!reporte) throw errorPublico('Esa conexión no existe.', 404);
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
    if (!ruta) throw errorPublico('Esa ruta no existe.', 404);
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
