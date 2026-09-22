'use strict';

/**
 * cookies.js
 * ----------------------------------------------------------------------
 * Lector de cookies mínimo (sin dependencias externas). Express ya sabe
 * *escribir* cookies con res.cookie(); esto solo añade la lectura.
 * Se limita el tamaño de la cabecera para evitar abusos.
 * ----------------------------------------------------------------------
 */

const MAX_LONGITUD_CABECERA = 4096;

function leerCookies(req, res, next) {
  const cabecera = req.headers.cookie;
  req.cookies = Object.create(null);

  if (!cabecera || cabecera.length > MAX_LONGITUD_CABECERA) return next();

  for (const parte of cabecera.split(';')) {
    const indice = parte.indexOf('=');
    if (indice < 1) continue;
    const nombre = parte.slice(0, indice).trim();
    const valor = parte.slice(indice + 1).trim();
    if (!nombre) continue;
    try {
      req.cookies[nombre] = decodeURIComponent(valor);
    } catch (error) {
      req.cookies[nombre] = valor;
    }
  }

  next();
}

module.exports = leerCookies;
