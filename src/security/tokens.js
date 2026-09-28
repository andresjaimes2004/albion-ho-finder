'use strict';

const crypto = require('crypto');

/**
 * tokens.js
 * ----------------------------------------------------------------------
 * Generación y comparación de tokens opacos (sesión y CSRF).
 *
 * En la base de datos solo se guarda el SHA-256 del token: aunque alguien
 * obtuviera una copia del archivo SQLite, no podría reconstruir la cookie
 * de ninguna sesión activa. La verificación siempre usa comparación en
 * tiempo constante.
 * ----------------------------------------------------------------------
 */

const BYTES_TOKEN = 32;

function generarToken() {
  return crypto.randomBytes(BYTES_TOKEN).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Token CSRF de una sesión, derivado del token de sesión (HMAC). Así el
 * servidor puede volver a entregarlo si la cookie legible del navegador
 * caduca o se pierde, sin guardarlo en claro. Solo lo puede calcular quien
 * tenga el token de sesión, que viaja en una cookie httpOnly.
 */
function derivarCsrf(tokenSesion) {
  return crypto.createHmac('sha256', String(tokenSesion)).update('csrf').digest('base64url');
}

/** Comparación en tiempo constante de dos cadenas hexadecimales/ASCII. */
function sonIguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Huella no reversible del origen de la petición (IP + navegador).
 * Se usa para limitar intentos de login sin almacenar datos personales
 * en claro en la base de datos.
 */
function huellaOrigen(req) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
  const agente = String(req.get('user-agent') || '').slice(0, 120);
  return crypto.createHash('sha256').update(`${ip}|${agente}`).digest('hex').slice(0, 32);
}

module.exports = { generarToken, hashToken, derivarCsrf, sonIguales, huellaOrigen };
