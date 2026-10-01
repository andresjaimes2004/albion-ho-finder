'use strict';

const EspaciosService = require('../services/EspaciosService');
const { entero } = require('../security/validacion');
const { manejar } = require('./utilidades');

/**
 * espaciosController
 * ----------------------------------------------------------------------
 * Espacios privados (todas con sesión y token CSRF en las escrituras):
 *
 * GET    /api/espacios                       → mis espacios, con miembros
 * POST   /api/espacios                       → crear { nombre, publico }
 * PUT    /api/espacios/:id                   → renombrar o cambiar si los
 *                                               demás ven sus conexiones
 *                                               { nombre?, publico? } (creador)
 * DELETE /api/espacios/:id                   → borrar con sus rutas (creador)
 * POST   /api/espacios/:id/miembros          → agregar cuenta { usuario } (creador)
 * DELETE /api/espacios/:id/miembros/:usuario → quitar una cuenta (creador)
 *                                               o salir (uno mismo)
 * ----------------------------------------------------------------------
 */
const servicio = new EspaciosService();

const id = (req) => entero(req.params.id, 'id', { min: 1 });

const listar = manejar((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, espacios: servicio.listar(req.usuario) });
});

const crear = manejar((req, res) => {
  const cuerpo = req.body || {};
  const espacio = servicio.crear(req.usuario, { nombre: cuerpo.nombre, publico: cuerpo.publico ?? false });
  res.status(201).json({ ok: true, espacio });
});

const actualizar = manejar((req, res) => {
  const cuerpo = req.body || {};
  const espacio = servicio.actualizar(req.usuario, id(req), { nombre: cuerpo.nombre, publico: cuerpo.publico });
  res.json({ ok: true, espacio });
});

const eliminar = manejar((req, res) => {
  servicio.eliminar(req.usuario, id(req));
  res.json({ ok: true });
});

const agregarMiembro = manejar((req, res) => {
  const espacio = servicio.agregarMiembro(req.usuario, id(req), (req.body || {}).usuario);
  res.status(201).json({ ok: true, espacio });
});

const quitarMiembro = manejar((req, res) => {
  const espacio = servicio.quitarMiembro(req.usuario, id(req), entero(req.params.usuario, 'usuario', { min: 1 }));
  res.json({ ok: true, espacio });
});

module.exports = { listar, crear, actualizar, eliminar, agregarMiembro, quitarMiembro };
