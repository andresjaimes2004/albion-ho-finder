'use strict';

/**
 * cabecerasSeguridad.js
 * ----------------------------------------------------------------------
 * Cabeceras de seguridad aplicadas a toda respuesta (equivalente propio
 * de Helmet, sin dependencias):
 *
 *  - Content-Security-Policy: solo se ejecutan scripts servidos por este
 *    mismo origen. Aunque alguien lograra inyectar un <script> o un
 *    atributo onclick en el HTML, el navegador se niega a ejecutarlo.
 *  - X-Content-Type-Options: impide que el navegador "adivine" el tipo de
 *    un archivo y lo ejecute como script.
 *  - X-Frame-Options / frame-ancestors: la web no puede incrustarse en un
 *    iframe ajeno (defensa contra clickjacking).
 *  - Referrer-Policy: no se filtra la URL visitada a terceros.
 *  - HSTS en producción: obliga a HTTPS en visitas posteriores.
 * ----------------------------------------------------------------------
 */

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // 'wasm-unsafe-eval' solo permite compilar WebAssembly (el OCR de
  // capturas); no habilita eval() ni scripts en línea.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Las teselas del mapa del juego se cargan desde la wiki oficial.
  "img-src 'self' data: https://wiki.albiononline.com",
  "connect-src 'self'",
].join('; ');

function cabecerasSeguridad({ enProduccion = false } = {}) {
  return function middlewareCabeceras(req, res, siguiente) {
    res.set('Content-Security-Policy', CSP);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cross-Origin-Resource-Policy', 'same-origin');
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('X-DNS-Prefetch-Control', 'off');
    res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    if (enProduccion) {
      res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }

    siguiente();
  };
}

module.exports = cabecerasSeguridad;
module.exports.CSP = CSP;
