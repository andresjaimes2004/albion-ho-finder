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

/**
 * GET /api/mapas/:nombre/imagen
 * Imagen de fondo subida por un administrador. Se sirve desde la base de
 * datos con el tipo fijado por el servidor y cabeceras que impiden que el
 * navegador la interprete como otra cosa.
 */
const imagen = manejar((req, res) => {
  const nombre = texto(req.params.nombre, 'mapa', { min: 2, max: 80 });
  const fila = servicio.imagen(nombre);

  if (!fila || !fila.datos) {
    return res.status(404).json({ ok: false, mensaje: 'Ese mapa no tiene imagen propia.' });
  }

  res.set('Content-Type', fila.mime);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.set('Cache-Control', 'public, max-age=86400');
  return res.send(Buffer.from(fila.datos));
});

module.exports = { mundo, detalle, imagen };
