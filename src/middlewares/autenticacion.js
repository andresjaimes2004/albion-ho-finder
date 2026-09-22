'use strict';

const AuthService = require('../services/AuthService');
const tokens = require('../security/tokens');
const config = require('../config/seguridad');

/**
 * autenticacion.js
 * ----------------------------------------------------------------------
 * - `cargarSesion`: resuelve la sesión de la cookie en cada petición y la
 *   deja en req.sesion (o null). No bloquea nada.
 * - `verificarCsrf`: exige el token CSRF en toda petición que modifique
 *   datos (patrón double submit: cookie legible + cabecera).
 * - `exigirAutenticacion` / `exigirAdmin`: guardias de acceso.
 * ----------------------------------------------------------------------
 */

const servicio = new AuthService();

function cargarSesion(req, res, next) {
  try {
    const token = req.cookies ? req.cookies[config.cookies.sesion] : null;
    const sesion = servicio.resolverSesion(token);
    req.sesion = sesion;
    req.usuario = sesion ? sesion.usuario : null;

    if (sesion) {
      const nuevaExpiracion = servicio.renovarSiHaceFalta(token, sesion);
      if (nuevaExpiracion) {
        res.cookie(config.cookies.sesion, token, {
          ...config.cookies.opciones,
          expires: nuevaExpiracion,
        });
      }
    }
  } catch (error) {
    req.sesion = null;
    req.usuario = null;
  }
  next();
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function verificarCsrf(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();
  if (!req.sesion) return next(); // sin sesión no hay nada que proteger

  const enviado = req.get('x-csrf-token') || '';
  if (!enviado || !tokens.sonIguales(tokens.hashToken(enviado), req.sesion.csrfHash)) {
    return res.status(403).json({ ok: false, mensaje: 'Token de seguridad inválido. Recarga la página.' });
  }
  return next();
}

function exigirAutenticacion(req, res, next) {
  if (!req.sesion) {
    return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión.' });
  }
  return next();
}

function exigirAdmin(req, res, next) {
  if (!req.sesion) {
    return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión.' });
  }
  if (req.sesion.usuario.rol !== 'ADMIN') {
    // Mismo mensaje genérico: no se confirma la existencia del recurso.
    return res.status(403).json({ ok: false, mensaje: 'No tienes permisos para esta acción.' });
  }
  return next();
}

module.exports = { cargarSesion, verificarCsrf, exigirAutenticacion, exigirAdmin, servicio };
