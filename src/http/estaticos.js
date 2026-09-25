'use strict';

const fs = require('fs');
const path = require('path');

/**
 * estaticos.js
 * ----------------------------------------------------------------------
 * Servidor de archivos estáticos con dos defensas explícitas:
 *
 *  1. Anti path traversal: la ruta pedida se resuelve a una ruta absoluta
 *     y se comprueba que siga estando dentro de la carpeta pública. Una
 *     petición como /../../etc/passwd nunca sale del directorio.
 *  2. Lista blanca de extensiones: cualquier otro tipo de archivo no se
 *     sirve, aunque exista.
 * ----------------------------------------------------------------------
 */

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  // Modelo de idioma del OCR (public/vendor/tesseract-*).
  '.traineddata': 'application/octet-stream',
};

function servirEstaticos(carpeta) {
  const raiz = path.resolve(carpeta);

  return function middlewareEstaticos(req, res, siguiente) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return siguiente();

    let rutaRelativa;
    try {
      rutaRelativa = decodeURIComponent(req.ruta);
    } catch (error) {
      return siguiente();
    }

    if (rutaRelativa.includes('\0')) return siguiente();

    const destino = path.resolve(raiz, `.${path.posix.normalize(rutaRelativa)}`);
    if (destino !== raiz && !destino.startsWith(raiz + path.sep)) {
      return siguiente(); // intento de salir de /public
    }

    const extension = path.extname(destino).toLowerCase();
    if (!TIPOS[extension]) return siguiente();

    let datos;
    try {
      const info = fs.statSync(destino);
      if (!info.isFile()) return siguiente();
      datos = fs.readFileSync(destino);
    } catch (error) {
      return siguiente();
    }

    res.set('Content-Type', TIPOS[extension]);
    res.set('X-Content-Type-Options', 'nosniff');
    // El HTML, el CSS y el JS se revalidan siempre para que un despliegue
    // nuevo no quede atrapado en la caché del navegador; el resto
    // (imágenes, iconos, fuentes) sí se cachea una hora.
    // Las librerías de terceros de /vendor llevan la versión en la ruta
    // (p. ej. tesseract-5.1.1): nunca cambian, así que se cachean 30 días.
    const revalidar = ['.html', '.css', '.js'].includes(extension);
    if (/^\/vendor\/[^/]+-\d+(\.\d+)+\//.test(req.ruta)) {
      res.set('Cache-Control', 'public, max-age=2592000, immutable');
    } else {
      res.set('Cache-Control', revalidar ? 'no-cache' : 'public, max-age=3600');
    }
    return res.send(datos);
  };
}

module.exports = servirEstaticos;
module.exports.TIPOS = TIPOS;
