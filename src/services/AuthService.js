'use strict';

const UsuarioRepository = require('../repositories/UsuarioRepository');
const SesionRepository = require('../repositories/SesionRepository');
const IntentoLoginRepository = require('../repositories/IntentoLoginRepository');
const claves = require('../security/claves');
const tokens = require('../security/tokens');
const { ErrorValidacion, nombreUsuario } = require('../security/validacion');
const config = require('../config/seguridad');

/**
 * AuthService
 * ----------------------------------------------------------------------
 * Registro, inicio y cierre de sesión.
 *
 * Decisiones de seguridad:
 *  - La contraseña se guarda como hash scrypt con sal única.
 *  - El login responde el mismo mensaje y tarda lo mismo tanto si el
 *    usuario no existe como si la contraseña es incorrecta (no se pueden
 *    enumerar cuentas).
 *  - Tras 5 fallos en 15 minutos para la misma combinación usuario+origen
 *    se bloquea temporalmente.
 *  - La sesión vive en el servidor; el navegador solo guarda un token
 *    opaco en una cookie httpOnly + SameSite=strict.
 * ----------------------------------------------------------------------
 */

class ErrorAuth extends Error {
  constructor(mensaje, estado = 401) {
    super(mensaje);
    this.name = 'ErrorAuth';
    this.estado = estado;
    this.publico = true;
  }
}

function enHoras(horas) {
  return new Date(Date.now() + horas * 3600 * 1000);
}

/** Fecha en el formato de SQLite (UTC, 'YYYY-MM-DD HH:MM:SS'). */
function aTextoSql(fecha) {
  return fecha.toISOString().slice(0, 19).replace('T', ' ');
}

class AuthService {
  constructor({
    usuarioRepository = new UsuarioRepository(),
    sesionRepository = new SesionRepository(),
    intentoRepository = new IntentoLoginRepository(),
  } = {}) {
    this.usuarios = usuarioRepository;
    this.sesiones = sesionRepository;
    this.intentos = intentoRepository;
  }

  registrar({ usuario, clave, rol = 'USUARIO' }) {
    const nombre = nombreUsuario(usuario);
    const problema = claves.validarFortaleza(clave);
    if (problema) throw new ErrorValidacion(problema);

    const normalizado = nombre.toLowerCase();
    if (this.usuarios.existe(normalizado)) {
      throw new ErrorValidacion('Ese nombre de usuario ya está tomado.');
    }

    return this.usuarios.crear({
      usuario: nombre,
      usuarioNormalizado: normalizado,
      claveHash: claves.hashear(clave),
      rol,
    });
  }

  /**
   * Verifica credenciales y abre una sesión.
   * @returns {{usuario: object, token: string, csrf: string, expiraEn: Date}}
   */
  iniciarSesion({ usuario, clave, huella }) {
    if (typeof usuario !== 'string' || typeof clave !== 'string') {
      throw new ErrorAuth('Usuario o contraseña incorrectos.');
    }

    const normalizado = usuario.trim().toLowerCase();
    const claveIntentos = `${normalizado}|${huella}`;

    const fallos = this.intentos.contarFallos(claveIntentos, config.login.ventanaMinutos);
    if (fallos >= config.login.maxIntentos) {
      throw new ErrorAuth(
        `Demasiados intentos fallidos. Espera ${config.login.ventanaMinutos} minutos e inténtalo de nuevo.`,
        429
      );
    }

    const fila = this.usuarios.buscarConClave(normalizado);

    if (!fila) {
      // Se consume el mismo tiempo que una verificación real para no
      // revelar si el usuario existe.
      claves.consumirTiempoSenuelo();
      this.intentos.registrar(claveIntentos, false);
      throw new ErrorAuth('Usuario o contraseña incorrectos.');
    }

    const valida = claves.verificar(clave, fila.clave_hash);
    if (!valida || !fila.activo) {
      this.intentos.registrar(claveIntentos, false);
      throw new ErrorAuth('Usuario o contraseña incorrectos.');
    }

    this.intentos.limpiarDe(claveIntentos);
    this.usuarios.registrarAcceso(fila.id);

    const token = tokens.generarToken();
    const csrf = tokens.generarToken();
    const expiraEn = enHoras(config.sesion.horasVigencia);

    this.sesiones.crear({
      tokenHash: tokens.hashToken(token),
      csrfHash: tokens.hashToken(csrf),
      usuarioId: fila.id,
      expiraEn: aTextoSql(expiraEn),
    });

    return {
      usuario: this.usuarios.obtenerPorId(fila.id),
      token,
      csrf,
      expiraEn,
    };
  }

  cerrarSesion(token) {
    if (!token) return;
    this.sesiones.eliminar(tokens.hashToken(token));
  }

  /** Resuelve la sesión de una cookie; null si no existe o expiró. */
  resolverSesion(token) {
    if (!token || typeof token !== 'string') return null;
    const sesion = this.sesiones.obtenerVigente(tokens.hashToken(token));
    if (!sesion) return null;

    return {
      sesionId: sesion.sesion_id,
      csrfHash: sesion.csrf_hash,
      expiraEn: sesion.expira_en,
      usuario: {
        id: sesion.usuario_id,
        usuario: sesion.usuario,
        rol: sesion.rol,
      },
    };
  }

  /** Prolonga la sesión si le queda poco tiempo (sesión deslizante). */
  renovarSiHaceFalta(token, sesion) {
    const restanteMs = new Date(`${sesion.expiraEn}Z`).getTime() - Date.now();
    const umbralMs = config.sesion.renovarSiRestanMenosDeHoras * 3600 * 1000;
    if (restanteMs > umbralMs) return null;

    const nuevaExpiracion = enHoras(config.sesion.horasVigencia);
    this.sesiones.prolongar(tokens.hashToken(token), aTextoSql(nuevaExpiracion));
    return nuevaExpiracion;
  }

  cambiarClave(usuarioId, claveNueva) {
    const problema = claves.validarFortaleza(claveNueva);
    if (problema) throw new ErrorValidacion(problema);
    const actualizado = this.usuarios.cambiarClave(usuarioId, claves.hashear(claveNueva));
    // Al cambiar la contraseña se invalidan todas las sesiones abiertas.
    this.sesiones.eliminarDeUsuario(usuarioId);
    return actualizado;
  }

  /** Tareas de mantenimiento: limpiar sesiones y registros caducados. */
  mantenimiento() {
    this.sesiones.limpiarExpiradas();
    this.intentos.purgarAntiguos();
  }
}

module.exports = AuthService;
module.exports.ErrorAuth = ErrorAuth;
