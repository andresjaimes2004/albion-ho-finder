'use strict';

/**
 * imagenes.js
 * ----------------------------------------------------------------------
 * Detección del tipo real de una imagen por su firma binaria (magic
 * bytes). Nunca se confía en la extensión del archivo ni en la cabecera
 * Content-Type que envía el navegador: un atacante podría subir un
 * archivo ejecutable o un SVG con scripts diciendo que es un PNG.
 *
 * Solo se aceptan PNG, JPEG y WebP. El SVG queda fuera a propósito:
 * admite JavaScript embebido y es un vector clásico de XSS.
 * ----------------------------------------------------------------------
 */

function detectarTipo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

module.exports = { detectarTipo };
