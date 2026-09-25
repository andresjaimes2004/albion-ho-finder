'use strict';

const TrackingService = require('../services/TrackingService');
const ReportesCaminosService = require('../services/ReportesCaminosService');
const { texto, entero } = require('../security/validacion');
const { manejar } = require('./utilidades');

/**
 * trackingController
 * ----------------------------------------------------------------------
 * GET    /api/tracking               → catálogo de caminos de Avalon + todas
 *                                      las conexiones vigentes
 * GET    /api/tracking/zonas         → zonas oficiales (para leer capturas)
 * GET    /api/tracking/:nombre       → un camino o mapa: datos oficiales y
 *                                      sus conexiones vigentes
 * POST   /api/tracking/reportes      → registrar conexiones (con sesión)
 * DELETE /api/tracking/reportes/:id  → borrar una (autor o admin)
 * ----------------------------------------------------------------------
 */
const servicio = new TrackingService();
const reportes = new ReportesCaminosService();

const resumen = manejar(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await servicio.resumen());
});

const zonas = manejar((req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ ok: true, zonas: reportes.zonasPublicas() });
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

const registrar = manejar((req, res) => {
  const resultado = reportes.registrar(req.usuario.id, (req.body || {}).conexiones);
  res.status(201).json({ ok: true, ...resultado });
});

const eliminar = manejar((req, res) => {
  reportes.eliminar(req.usuario, entero(req.params.id, 'id', { min: 1 }));
  res.json({ ok: true });
});

module.exports = { resumen, zonas, detalle, registrar, eliminar };
