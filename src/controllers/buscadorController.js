'use strict';

const BuscadorService = require('../services/BuscadorService');
const HideoutsCaminoService = require('../services/HideoutsCaminoService');
const BusquedaRepository = require('../repositories/BusquedaRepository');
const { manejar } = require('./utilidades');

const servicio = new BuscadorService({ hideoutsCamino: new HideoutsCaminoService() });
const busquedas = new BusquedaRepository();

/**
 * GET /api/buscar?q=texto  (también ?gremio=texto, el nombre anterior)
 * Busca el texto en los gremios y en los nombres de los mapas.
 * Controlador delgado: valida la petición HTTP y delega en el servicio.
 * Si hay sesión iniciada, la búsqueda queda en el historial del usuario.
 */
const buscarGremio = manejar((req, res) => {
  const texto = req.query.q !== undefined ? req.query.q : req.query.gremio;

  if (typeof texto !== 'string') {
    return res.status(400).json({ ok: false, mensaje: 'Parámetro "q" requerido.' });
  }

  const usuarioId = req.sesion ? req.sesion.usuario.id : null;
  const resultado = servicio.buscarPorGremio(texto, { usuarioId });

  return res.status(200).json(resultado);
});

/** GET /api/historial — últimas búsquedas del usuario autenticado. */
const historial = manejar((req, res) => {
  res.json({ ok: true, historial: busquedas.listar(req.sesion.usuario.id) });
});

/** DELETE /api/historial — borra el historial del propio usuario. */
const limpiarHistorial = manejar((req, res) => {
  busquedas.limpiar(req.sesion.usuario.id);
  res.json({ ok: true, historial: [] });
});

module.exports = { buscarGremio, historial, limpiarHistorial };
