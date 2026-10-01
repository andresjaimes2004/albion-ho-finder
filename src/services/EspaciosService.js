'use strict';

const EspacioRepository = require('../repositories/EspacioRepository');
const AvisoRepository = require('../repositories/AvisoRepository');
const db = require('../config/database');
const { texto, ErrorValidacion } = require('../security/validacion');
const { esOfensivo } = require('../security/nombresOfensivos');

/**
 * EspaciosService
 * ----------------------------------------------------------------------
 * Espacios privados: un grupo de cuentas (amigos que gankean, farmers,
 * transportistas...) registra sus rutas solo para ellos.
 *
 * Reglas:
 *  - Cualquier cuenta con sesión puede crear hasta MAX_CREADOS espacios y
 *    pertenecer a MAX_ESPACIOS_POR_CUENTA.
 *  - Quien lo crea agrega las cuentas por su nombre, hasta MAX_CUENTAS en
 *    total contándose a sí mismo; también puede quitarlas, renombrar el
 *    espacio, cambiar su visibilidad o borrarlo (con todas sus rutas).
 *  - Cualquier miembro puede salir del espacio (el creador no: lo borra).
 *  - "Permitir que los demás vean las conexiones" (publico): las rutas del
 *    espacio las ve todo el mundo, como las públicas.
 *  - Lo privado solo lo ven sus miembros: ni siquiera un administrador que
 *    no sea miembro (los borrados masivos tampoco lo tocan).
 *  - Ante quien no es miembro, un espacio privado "no existe" (404): no se
 *    revela qué espacios hay.
 *  - Cada cambio de membresía deja un aviso a quien le afecta (lo agregaron,
 *    lo quitaron, salió alguien, se borró el espacio): la página lo muestra
 *    y se actualiza sin recargar.
 *  - Las sugerencias al agregar cuentas salen solo de las cuentas que ese
 *    mismo usuario agregó antes a sus espacios.
 * ----------------------------------------------------------------------
 */

const MAX_CUENTAS = 7;
const MAX_CREADOS = 3;
const MAX_ESPACIOS_POR_CUENTA = 10;
const FORMATO_NOMBRE = /^[\p{L}\p{N} ._\-'&]+$/u;

function errorPublico(mensaje, estado) {
  const error = new Error(mensaje);
  error.publico = true;
  error.estado = estado;
  return error;
}

class EspaciosService {
  constructor({
    repositorio = new EspacioRepository(),
    avisos = new AvisoRepository(),
    transaccion = (fn) => db.transaccion(fn),
  } = {}) {
    this.repositorio = repositorio;
    this.avisos = avisos;
    this.transaccion = transaccion;
  }

  /** Cuentas que el usuario agregó alguna vez a sus espacios (para sugerirlas). */
  contactos(usuario) {
    return this.repositorio.contactos(usuario.id);
  }

  _nombre(valor) {
    const nombre = texto(valor, 'nombre del espacio', { min: 3, max: 30 }).replace(/\s+/g, ' ');
    if (!FORMATO_NOMBRE.test(nombre)) {
      throw new ErrorValidacion('El nombre del espacio solo puede tener letras, números, espacios y . _ - \' &');
    }
    if (esOfensivo(nombre)) throw new ErrorValidacion('Ese nombre de espacio no está permitido.');
    return nombre;
  }

  /** El espacio si el usuario es miembro; si no, 404 (no se revela que existe). */
  _comoMiembro(usuario, espacioId) {
    const espacio = Number.isInteger(espacioId) ? this.repositorio.obtener(espacioId) : null;
    if (!espacio || !usuario || !this.repositorio.esMiembro(espacio.id, usuario.id)) {
      throw errorPublico('Ese espacio no existe o no eres miembro.', 404);
    }
    return espacio;
  }

  _comoCreador(usuario, espacioId) {
    const espacio = this._comoMiembro(usuario, espacioId);
    if (espacio.creadorId !== usuario.id) throw errorPublico('Solo quien creó el espacio puede hacer eso.', 403);
    return espacio;
  }

  _conMiembros(espacio, usuario) {
    return {
      id: espacio.id,
      nombre: espacio.nombre,
      publico: espacio.publico,
      creador: espacio.creador,
      esCreador: espacio.creadorId === usuario.id,
      miembros: this.repositorio.miembros(espacio.id).map((m) => ({ id: m.id, usuario: m.usuario, esCreador: m.id === espacio.creadorId })),
      maxCuentas: MAX_CUENTAS,
    };
  }

  /** Los espacios del usuario, con sus miembros. */
  listar(usuario) {
    return this.repositorio.listarDeUsuario(usuario.id).map((e) => this._conMiembros(e, usuario));
  }

  crear(usuario, { nombre, publico = false } = {}) {
    const limpio = this._nombre(nombre);
    if (typeof publico !== 'boolean') throw new ErrorValidacion('El campo "publico" debe ser verdadero o falso.');
    return this.transaccion(() => {
      if (this.repositorio.contarCreadosPor(usuario.id) >= MAX_CREADOS) {
        throw new ErrorValidacion(`Puedes crear como mucho ${MAX_CREADOS} espacios.`);
      }
      if (this.repositorio.contarDeUsuario(usuario.id) >= MAX_ESPACIOS_POR_CUENTA) {
        throw new ErrorValidacion(`Ya perteneces a ${MAX_ESPACIOS_POR_CUENTA} espacios, el máximo.`);
      }
      return this._conMiembros(this.repositorio.crear({ nombre: limpio, creadorId: usuario.id, publico }), usuario);
    });
  }

  actualizar(usuario, espacioId, cambios = {}) {
    const espacio = this._comoCreador(usuario, espacioId);
    const nombre = cambios.nombre === undefined ? espacio.nombre : this._nombre(cambios.nombre);
    let publico = espacio.publico;
    if (cambios.publico !== undefined) {
      if (typeof cambios.publico !== 'boolean') throw new ErrorValidacion('El campo "publico" debe ser verdadero o falso.');
      publico = cambios.publico;
    }
    return this._conMiembros(this.repositorio.actualizar(espacio.id, { nombre, publico }), usuario);
  }

  agregarMiembro(usuario, espacioId, nombreUsuario) {
    const espacio = this._comoCreador(usuario, espacioId);
    const nombre = texto(nombreUsuario, 'usuario', { min: 3, max: 30 });
    const id = this.repositorio.idDeUsuario(nombre.toLowerCase());
    if (!id) throw new ErrorValidacion('No existe ninguna cuenta con ese nombre.');
    return this.transaccion(() => {
      if (this.repositorio.esMiembro(espacio.id, id)) throw new ErrorValidacion('Esa cuenta ya está en el espacio.');
      if (this.repositorio.contarMiembros(espacio.id) >= MAX_CUENTAS) {
        throw new ErrorValidacion(`El espacio ya tiene ${MAX_CUENTAS} cuentas, el máximo.`);
      }
      if (this.repositorio.contarDeUsuario(id) >= MAX_ESPACIOS_POR_CUENTA) {
        throw new ErrorValidacion(`Esa cuenta ya pertenece a ${MAX_ESPACIOS_POR_CUENTA} espacios, el máximo.`);
      }
      this.repositorio.agregarMiembro(espacio.id, id);
      this.repositorio.recordarContacto(usuario.id, id);
      this.avisos.crear(id, 'ESPACIO_AGREGADO', { espacio: espacio.nombre, espacioId: espacio.id, por: usuario.usuario });
      return this._conMiembros(espacio, usuario);
    });
  }

  /** El creador quita a otro miembro, o un miembro sale por su cuenta. */
  quitarMiembro(usuario, espacioId, usuarioId) {
    const espacio = this._comoMiembro(usuario, espacioId);
    const propio = usuarioId === usuario.id;
    if (!propio && espacio.creadorId !== usuario.id) throw errorPublico('Solo quien creó el espacio puede quitar cuentas.', 403);
    if (usuarioId === espacio.creadorId) {
      throw new ErrorValidacion('Quien creó el espacio no puede salir de él: si ya no lo quiere, puede borrarlo.');
    }
    if (!this.repositorio.quitarMiembro(espacio.id, usuarioId)) throw errorPublico('Esa cuenta no está en el espacio.', 404);
    if (propio) {
      this.avisos.crear(espacio.creadorId, 'ESPACIO_SALIO', { espacio: espacio.nombre, espacioId: espacio.id, usuario: usuario.usuario });
      return null;
    }
    this.avisos.crear(usuarioId, 'ESPACIO_QUITADO', { espacio: espacio.nombre, espacioId: espacio.id, por: usuario.usuario });
    return this._conMiembros(espacio, usuario);
  }

  /** Borra el espacio con todas sus conexiones y rutas. */
  eliminar(usuario, espacioId) {
    const espacio = this._comoCreador(usuario, espacioId);
    const otros = this.repositorio.miembros(espacio.id).filter((m) => m.id !== usuario.id);
    this.transaccion(() => {
      this.repositorio.eliminar(espacio.id);
      for (const m of otros) {
        this.avisos.crear(m.id, 'ESPACIO_BORRADO', { espacio: espacio.nombre, espacioId: espacio.id, por: usuario.usuario });
      }
    });
  }

  /**
   * Qué espacios puede ver un usuario (o un visitante sin sesión). Lo usan
   * las consultas de caminos para filtrar conexiones y rutas.
   *   puedeVer(id): null (pública) o un espacio visible
   *   info(id): { id, nombre, publico, miembro } para mostrarlo
   *   esMiembro(id): para registrar en él
   */
  visor(usuario) {
    const visibles = new Map(this.repositorio.visiblesPara(usuario ? usuario.id : null).map((e) => [e.id, e]));
    return {
      puedeVer: (espacioId) => espacioId === null || espacioId === undefined || visibles.has(espacioId),
      info: (espacioId) => (espacioId === null || espacioId === undefined ? null : visibles.get(espacioId) || null),
      esMiembro: (espacioId) => Boolean(visibles.get(espacioId) && visibles.get(espacioId).miembro),
    };
  }

  /** Comprueba que el usuario puede registrar en ese espacio (o en público: null). */
  espacioParaRegistrar(usuario, valor) {
    if (valor === null || valor === undefined) return null;
    if (!Number.isInteger(valor) || valor < 1) throw new ErrorValidacion('El espacio indicado no es válido.');
    return this._comoMiembro(usuario, valor).id;
  }
}

/** Visor para quien no tiene espacios (pruebas y llamadas internas). */
EspaciosService.VISOR_PUBLICO = {
  puedeVer: (espacioId) => espacioId === null || espacioId === undefined,
  info: () => null,
  esMiembro: () => false,
};

module.exports = EspaciosService;
module.exports.MAX_CUENTAS = MAX_CUENTAS;
module.exports.MAX_CREADOS = MAX_CREADOS;
