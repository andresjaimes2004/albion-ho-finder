'use strict';

const MapaService = require('../services/MapaService');
const { texto } = require('../security/validacion');
const { manejar } = require('./utilidades');

/**
 * mapaController
 * ----------------------------------------------------------------------
 * GET /api/mapas            → mapa mundial de la Zona Negra (nodos + conexiones)
 * GET /api/mapas/:nombre    → detalle geográfico de un mapa + sus hideouts
 * ----------------------------------------------------------------------
 */
const servicio = new MapaService();

const mundo = manejar((req, res) => {
  res.json(servicio.mundo());
});

const detalle = manejar((req, res) => {
  const nombre = texto(req.params.nombre, 'mapa', { min: 2, max: 80 });
  const resultado = servicio.detalle(nombre);

  if (!resultado.ok) {
    return res.status(404).json(resultado);
  }
  return res.json(resultado);
});

module.exports = { mundo, detalle };
