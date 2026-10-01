'use strict';

const AvisoRepository = require('../repositories/AvisoRepository');
const { ErrorValidacion } = require('../security/validacion');
const { manejar } = require('./utilidades');

/**
 * avisosController
 * ----------------------------------------------------------------------
 * GET  /api/avisos         → avisos sin leer del usuario (con sesión)
 * POST /api/avisos/leidos  → marcarlos como leídos { ids: [1, 2] }
 *
 * Cada usuario solo ve y marca los suyos.
 * ----------------------------------------------------------------------
 */
const repositorio = new AvisoRepository();
const MAX_IDS = 50;

const listar = manejar((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, avisos: repositorio.listarNoLeidos(req.usuario.id) });
});

const marcarLeidos = manejar((req, res) => {
  const ids = (req.body || {}).ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new ErrorValidacion('Lista de avisos no válida.');
  }
  res.json({ ok: true, marcados: repositorio.marcarLeidos(req.usuario.id, ids) });
});

module.exports = { listar, marcarLeidos };
