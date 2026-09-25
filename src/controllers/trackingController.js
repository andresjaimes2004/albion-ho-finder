'use strict';

const TrackingService = require('../services/TrackingService');
const ReportesCaminosService = require('../services/ReportesCaminosService');
const { texto, entero, ErrorValidacion } = require('../security/validacion');

const MAX_MAPAS_CONSULTA = 50;
const { manejar } = require('./utilidades');

/**
 * trackingController
 * ----------------------------------------------------------------------
 * GET    /api/tracking               → catálogo de caminos de Avalon + todas
 *                                      las conexiones vigentes
 * GET    /api/tracking/zonas         → zonas oficiales (para leer capturas)
 * GET    /api/tracking/rutas?mapas=A,B → rutas del gremio y conexiones de
 *                                      esos mapas (vista de hideouts)
 * GET    /api/tracking/:nombre       → un camino o mapa: datos oficiales y
 *                                      sus conexiones vigentes
 * POST   /api/tracking/reportes      → registrar conexiones (con sesión)
 * DELETE /api/tracking/reportes/:id  → borrar una (autor o admin)
 * DELETE /api/tracking/rutas/:id     → borrar una ruta (autor o admin)
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

/** Lista "A,B,C" de nombres de mapa, validada y sin repetidos. */
function listaDeMapas(valor) {
  const crudo = texto(valor, 'mapas', { min: 2, max: MAX_MAPAS_CONSULTA * 81 });
  const nombres = [...new Set(crudo.split(',').map((n) => n.trim()).filter(Boolean))];
  if (nombres.length > MAX_MAPAS_CONSULTA) {
    throw new ErrorValidacion(`Como máximo ${MAX_MAPAS_CONSULTA} mapas por consulta.`);
  }
  return nombres.map((n) => texto(n, 'mapa', { min: 2, max: 80 }));
}

const rutasDeMapas = manejar(async (req, res) => {
  const nombres = listaDeMapas(req.query.mapas);
  res.set('Cache-Control', 'no-store');
  res.json(await servicio.paraMapas(nombres));
});

const registrar = manejar((req, res) => {
  const cuerpo = req.body || {};
  const resultado = reportes.registrar(req.usuario.id, cuerpo.conexiones, cuerpo.rutas || []);
  res.status(201).json({ ok: true, ...resultado });
});

const eliminar = manejar((req, res) => {
  reportes.eliminar(req.usuario, entero(req.params.id, 'id', { min: 1 }));
  res.json({ ok: true });
});

const eliminarRuta = manejar((req, res) => {
  reportes.eliminarRuta(req.usuario, entero(req.params.id, 'id', { min: 1 }));
  res.json({ ok: true });
});

module.exports = { resumen, zonas, rutasDeMapas, detalle, registrar, eliminar, eliminarRuta };
