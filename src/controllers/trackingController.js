'use strict';

const TrackingService = require('../services/TrackingService');
const { texto } = require('../security/validacion');
const { manejar } = require('./utilidades');

/**
 * trackingController
 * ----------------------------------------------------------------------
 * GET /api/tracking            → catálogo de caminos de Avalon + todas las
 *                                conexiones vigentes
 * GET /api/tracking/:nombre    → un camino o mapa: datos oficiales y sus
 *                                conexiones vigentes
 * ----------------------------------------------------------------------
 */
const servicio = new TrackingService();

const resumen = manejar(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await servicio.resumen());
});

const detalle = manejar(async (req, res) => {
  const nombre = texto(req.params.nombre, 'mapa', { min: 2, max: 80 });
  const resultado = await servicio.detalle(nombre);

  res.set('Cache-Control', 'no-store');
  if (!resultado.ok) {
    return res.status(404).json(resultado);
  }
  return res.json(resultado);
});

module.exports = { resumen, detalle };
