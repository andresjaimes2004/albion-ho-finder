'use strict';

const AuthService = require('../services/AuthService');
const BusquedaRepository = require('../repositories/BusquedaRepository');
const tokens = require('../security/tokens');
const config = require('../config/seguridad');
const { manejar } = require('./utilidades');

/**
 * authController
 * ----------------------------------------------------------------------
 * Registro, inicio y cierre de sesión, y perfil del usuario actual.
 *
 * La cookie de sesión es httpOnly (JavaScript no puede leerla, así que un
 * XSS no la roba) y SameSite=strict (no viaja desde otros sitios). El
 * token CSRF viaja en una cookie legible aparte y debe reenviarse en la
 * cabecera X-CSRF-Token de cada operación de escritura.
 * ----------------------------------------------------------------------
 */

const servicio = new AuthService();
const busquedas = new BusquedaRepository();

function entregarSesion(res, { token, csrf, expiraEn }) {
  res.cookie(config.cookies.sesion, token, { ...config.cookies.opciones, expires: expiraEn });
  res.cookie(config.cookies.csrf, csrf, {
    ...config.cookies.opciones,
    httpOnly: false, // el frontend debe poder leerlo para reenviarlo
    expires: expiraEn,
  });
}

const registrar = manejar((req, res) => {
  const { usuario, clave } = req.body || {};
  const creado = servicio.registrar({ usuario, clave });

  const sesion = servicio.iniciarSesion({
    usuario: creado.usuario,
    clave,
    huella: tokens.huellaOrigen(req),
  });
  entregarSesion(res, sesion);

  res.status(201).json({ ok: true, usuario: sesion.usuario });
});

const iniciarSesion = manejar((req, res) => {
  const { usuario, clave } = req.body || {};
  const sesion = servicio.iniciarSesion({
    usuario,
    clave,
    huella: tokens.huellaOrigen(req),
  });

  entregarSesion(res, sesion);
  res.json({ ok: true, usuario: sesion.usuario });
});

const cerrarSesion = manejar((req, res) => {
  const token = req.cookies ? req.cookies[config.cookies.sesion] : null;
  servicio.cerrarSesion(token);

  res.clearCookie(config.cookies.sesion, config.cookies.opciones);
  res.clearCookie(config.cookies.csrf, { ...config.cookies.opciones, httpOnly: false });
  res.json({ ok: true });
});

const sesionActual = manejar((req, res) => {
  if (!req.sesion) {
    return res.json({ ok: true, autenticado: false, usuario: null });
  }
  return res.json({
    ok: true,
    autenticado: true,
    usuario: req.sesion.usuario,
    historial: busquedas.listar(req.sesion.usuario.id),
  });
});

const cambiarClave = manejar((req, res) => {
  const { claveNueva } = req.body || {};
  servicio.cambiarClave(req.sesion.usuario.id, claveNueva);

  res.clearCookie(config.cookies.sesion, config.cookies.opciones);
  res.clearCookie(config.cookies.csrf, { ...config.cookies.opciones, httpOnly: false });
  res.json({ ok: true, mensaje: 'Contraseña actualizada. Vuelve a iniciar sesión.' });
});

module.exports = { registrar, iniciarSesion, cerrarSesion, sesionActual, cambiarClave };
