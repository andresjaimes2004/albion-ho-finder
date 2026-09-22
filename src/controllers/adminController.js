'use strict';

const AdminService = require('../services/AdminService');
const GremioRepository = require('../repositories/GremioRepository');
const { manejar } = require('./utilidades');
const { entero, texto } = require('../security/validacion');

/**
 * adminController
 * ----------------------------------------------------------------------
 * Endpoints del panel de administración. Todos cuelgan de /api/admin y
 * están protegidos por `exigirAdmin` + verificación CSRF en las rutas.
 * ----------------------------------------------------------------------
 */
const servicio = new AdminService();
const gremios = new GremioRepository();

function idUsuario(req) {
  return req.sesion ? req.sesion.usuario.id : null;
}

const resumen = manejar((req, res) => {
  res.json({ ok: true, resumen: servicio.resumen() });
});

// -------------------------------------------------------------- gremios ---

const buscarGremios = manejar((req, res) => {
  const consulta = texto(req.query.q, 'q', { min: 0, max: 60, obligatorio: false }) || '';
  const limite = entero(req.query.limite, 'limite', { min: 1, max: 100, obligatorio: false }) || 25;
  res.json({ ok: true, gremios: servicio.buscarGremios(consulta, { limite }) });
});

const renombrarGremio = manejar((req, res) => {
  const gremio = servicio.renombrarGremio(idUsuario(req), req.params.id, (req.body || {}).nombre);
  res.json({ ok: true, gremio });
});

const notasGremio = manejar((req, res) => {
  const gremio = servicio.actualizarNotasGremio(idUsuario(req), req.params.id, (req.body || {}).notas);
  res.json({ ok: true, gremio });
});

const subirLogo = manejar((req, res) => {
  const gremio = servicio.guardarLogoGremio(idUsuario(req), req.params.id, req.body);
  res.json({ ok: true, gremio });
});

const borrarLogo = manejar((req, res) => {
  const gremio = servicio.borrarLogoGremio(idUsuario(req), req.params.id);
  res.json({ ok: true, gremio });
});

// ---------------------------------------------------------------- mapas ---

const renombrarMapa = manejar((req, res) => {
  const mapa = servicio.renombrarMapa(idUsuario(req), req.params.id, (req.body || {}).nombre);
  res.json({ ok: true, mapa });
});

const subirImagenMapa = manejar((req, res) => {
  const imagen = servicio.guardarImagenMapa(idUsuario(req), req.params.id, req.body);
  res.json({ ok: true, imagen });
});

const ajustarImagenMapa = manejar((req, res) => {
  const imagen = servicio.ajustarImagenMapa(idUsuario(req), req.params.id, req.body || {});
  res.json({ ok: true, imagen });
});

const borrarImagenMapa = manejar((req, res) => {
  res.json({ ok: true, ...servicio.borrarImagenMapa(idUsuario(req), req.params.id) });
});

// ------------------------------------------------------------- hideouts ---

const crearHideout = manejar((req, res) => {
  const hideout = servicio.crearHideout(idUsuario(req), req.body || {});
  res.status(201).json({ ok: true, hideout });
});

const actualizarHideout = manejar((req, res) => {
  const hideout = servicio.actualizarHideout(idUsuario(req), req.params.id, req.body || {});
  res.json({ ok: true, hideout });
});

const posicionarHideout = manejar((req, res) => {
  const cuerpo = req.body || {};
  const hideout = servicio.posicionarHideout(idUsuario(req), req.params.id, {
    x: cuerpo.x === null ? null : cuerpo.x,
    y: cuerpo.y === null ? null : cuerpo.y,
  });
  res.json({ ok: true, hideout });
});

const eliminarHideout = manejar((req, res) => {
  res.json({ ok: true, ...servicio.eliminarHideout(idUsuario(req), req.params.id) });
});

// -------------------------------------------------------------- usuarios --

const listarUsuarios = manejar((req, res) => {
  res.json({ ok: true, usuarios: servicio.listarUsuarios() });
});

const cambiarEstadoUsuario = manejar((req, res) => {
  const activo = Boolean((req.body || {}).activo);
  const usuario = servicio.cambiarEstadoUsuario(idUsuario(req), req.params.id, activo);
  res.json({ ok: true, usuario });
});

const cambiarRolUsuario = manejar((req, res) => {
  const usuario = servicio.cambiarRolUsuario(idUsuario(req), req.params.id, (req.body || {}).rol);
  res.json({ ok: true, usuario });
});

const auditoria = manejar((req, res) => {
  res.json({ ok: true, auditoria: servicio.listarAuditoria(req.query.limite) });
});

// ------------------------------------------------------- logo (público) ---

/**
 * GET /api/gremios/:id/logo
 * Sirve el logo desde la base de datos con un Content-Type fijado por el
 * servidor (nunca el que dijo el cliente al subirlo) y cabeceras que
 * impiden que el navegador lo interprete como otra cosa.
 */
const servirLogo = manejar((req, res) => {
  const id = entero(req.params.id, 'id', { min: 1 });
  const fila = gremios.obtenerLogo(id);

  if (!fila || !fila.datos || !fila.mime) {
    return res.status(404).json({ ok: false, mensaje: 'Ese gremio no tiene logo.' });
  }

  res.set('Content-Type', fila.mime);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.set('Cache-Control', 'public, max-age=300');
  return res.send(Buffer.from(fila.datos));
});

module.exports = {
  resumen,
  buscarGremios,
  renombrarGremio,
  notasGremio,
  subirLogo,
  borrarLogo,
  renombrarMapa,
  subirImagenMapa,
  ajustarImagenMapa,
  borrarImagenMapa,
  crearHideout,
  actualizarHideout,
  posicionarHideout,
  eliminarHideout,
  listarUsuarios,
  cambiarEstadoUsuario,
  cambiarRolUsuario,
  auditoria,
  servirLogo,
};
