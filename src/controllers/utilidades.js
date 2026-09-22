'use strict';

/**
 * utilidades.js
 * ----------------------------------------------------------------------
 * Envoltura común de los controladores. Captura cualquier excepción y
 * responde con un mensaje seguro:
 *
 *  - Errores de validación/negocio (marcados con `publico = true`)
 *    devuelven su mensaje y su código.
 *  - Cualquier otro error se registra en el servidor y el cliente solo
 *    recibe "Error interno del servidor": nunca se filtran rutas de
 *    archivos, consultas SQL ni trazas al frontend.
 * ----------------------------------------------------------------------
 */
function manejar(fn) {
  return function controlador(req, res) {
    try {
      const resultado = fn(req, res);
      if (resultado && typeof resultado.then === 'function') {
        resultado.catch((error) => responderError(error, res));
      }
    } catch (error) {
      responderError(error, res);
    }
  };
}

function responderError(error, res) {
  if (res.headersSent) return;

  if (error && error.publico) {
    res.status(error.estado || 400).json({ ok: false, mensaje: error.message });
    return;
  }

  console.error('[ERROR]', error);
  res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
}

module.exports = { manejar, responderError };
