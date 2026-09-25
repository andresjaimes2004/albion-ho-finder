'use strict';

const ConexionReportadaRepository = require('../repositories/ConexionReportadaRepository');
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
 * ----------------------------------------------------------------------
 */

const MAX_POR_ENVIO = 20;
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
    ahora = () => Date.now(),
  } = {}) {
    this.zonas = zonas;
    this.zonaPorClave = new Map(zonas.map((z) => [claveZona(z.nombre), z]));
    this.repositorio = repositorio;
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
   * Registra una o varias conexiones. Se validan todas antes de guardar
   * ninguna: o entran todas o ninguna.
   */
  registrar(usuarioId, lista) {
    if (!Array.isArray(lista) || !lista.length) {
      throw new ErrorValidacion('No se envió ninguna conexión.');
    }
    if (lista.length > MAX_POR_ENVIO) {
      throw new ErrorValidacion(`Como máximo ${MAX_POR_ENVIO} conexiones por envío.`);
    }

    const validas = lista.map((c, i) => this._validar(c, i));
    const ahora = this.ahora();
    const ahoraIso = new Date(ahora).toISOString();
    this.repositorio.purgarCerradasAntesDe(new Date(ahora - CONSERVAR_CERRADAS_MS).toISOString());

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

    return { creadas, actualizadas, conexiones: guardadas };
  }

  eliminar(usuario, id) {
    const reporte = this.repositorio.obtener(id);
    if (!reporte) throw errorPublico('Esa conexión no existe.', 404);
    if (reporte.usuarioId !== usuario.id && usuario.rol !== 'ADMIN') {
      throw errorPublico('Solo quien registró la conexión o un administrador puede borrarla.', 403);
    }
    this.repositorio.eliminar(id);
  }
}

module.exports = ReportesCaminosService;
