'use strict';

const tokens = require('../security/tokens');

/**
 * limitador.js
 * ----------------------------------------------------------------------
 * Limitador de peticiones por ventana deslizante, en memoria y sin
 * dependencias. Sirve para amortiguar escaneos automáticos y abuso de la
 * API en un despliegue de una sola instancia (que es el caso de esta app).
 * Si algún día corre en varias instancias, este contador debe moverse a
 * un almacén compartido.
 * ----------------------------------------------------------------------
 */

function crearLimitador({ maximo = 120, ventanaMs = 60_000, mensaje } = {}) {
  const registros = new Map();

  // Limpieza periódica para que el mapa no crezca sin control.
  const temporizador = setInterval(() => {
    const ahora = Date.now();
    for (const [clave, datos] of registros) {
      if (ahora - datos.inicio > ventanaMs) registros.delete(clave);
    }
  }, ventanaMs);
  if (typeof temporizador.unref === 'function') temporizador.unref();

  return function limitar(req, res, next) {
    const clave = tokens.huellaOrigen(req);
    const ahora = Date.now();
    const datos = registros.get(clave);

    if (!datos || ahora - datos.inicio > ventanaMs) {
      registros.set(clave, { inicio: ahora, conteo: 1 });
      return next();
    }

    datos.conteo += 1;
    if (datos.conteo > maximo) {
      const esperaSegundos = Math.ceil((ventanaMs - (ahora - datos.inicio)) / 1000);
      res.set('Retry-After', String(esperaSegundos));
      return res.status(429).json({
        ok: false,
        mensaje: mensaje || 'Demasiadas peticiones. Espera unos segundos e inténtalo otra vez.',
      });
    }

    return next();
  };
}

module.exports = crearLimitador;
