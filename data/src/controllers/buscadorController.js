'use strict';

const BuscadorService = require('../services/BuscadorService');

const servicio = new BuscadorService();

/**
 * GET /api/buscar?gremio=texto
 * Controlador delgado: valida la petición HTTP y delega en el servicio.
 */
function buscarGremio(req, res) {
  const { gremio } = req.query;

  if (typeof gremio !== 'string') {
    return res.status(400).json({ ok: false, mensaje: 'Parámetro "gremio" requerido.' });
  }

  const resultado = servicio.buscarPorGremio(gremio);

  if (!resultado.ok) {
    return res.status(200).json(resultado);
  }

  return res.status(200).json(resultado);
}

module.exports = { buscarGremio };
