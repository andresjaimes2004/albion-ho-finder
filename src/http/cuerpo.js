'use strict';

/**
 * cuerpo.js
 * ----------------------------------------------------------------------
 * Lectura del cuerpo de la petición con límite de tamaño estricto: si el
 * cliente envía más bytes de los permitidos se corta la conexión y se
 * responde 413, evitando que un envío gigante agote la memoria.
 * ----------------------------------------------------------------------
 */

/** Tope absoluto: pasado este punto se corta la conexión sin contemplaciones. */
const FACTOR_CORTE_DURO = 20;

function leerCuerpo(req, limiteBytes) {
  return new Promise((resolver, rechazar) => {
    const trozos = [];
    let total = 0;
    let excedido = false;
    let terminado = false;

    const fallar = () => {
      terminado = true;
      const error = new Error('El contenido enviado es demasiado grande.');
      error.estado = 413;
      error.publico = true;
      rechazar(error);
    };

    req.on('data', (trozo) => {
      if (terminado) return;
      total += trozo.length;

      if (total > limiteBytes) {
        // Se deja de acumular (no se gasta memoria) pero se sigue leyendo
        // hasta el final para poder responder 413 de forma limpia; si el
        // cliente insiste con un envío enorme, se corta la conexión.
        excedido = true;
        trozos.length = 0;
        if (total > limiteBytes * FACTOR_CORTE_DURO) {
          req.destroy();
          fallar();
        }
        return;
      }
      trozos.push(trozo);
    });

    req.on('end', () => {
      if (terminado) return;
      terminado = true;
      if (excedido) {
        const error = new Error('El contenido enviado es demasiado grande.');
        error.estado = 413;
        error.publico = true;
        rechazar(error);
        return;
      }
      resolver(Buffer.concat(trozos));
    });

    req.on('error', (error) => {
      if (terminado) return;
      terminado = true;
      rechazar(error);
    });
  });
}

/** Middleware: interpreta el cuerpo JSON (solo si el Content-Type lo es). */
function json({ limite = 32 * 1024 } = {}) {
  return function middlewareJson(req, res, siguiente) {
    const tipo = String(req.headers['content-type'] || '');
    if (!tipo.includes('application/json')) return siguiente();

    leerCuerpo(req, limite)
      .then((buffer) => {
        if (!buffer.length) {
          req.body = {};
          return siguiente();
        }
        try {
          const datos = JSON.parse(buffer.toString('utf8'));
          // Se rechazan cuerpos que no sean objetos planos para que no
          // lleguen arreglos o primitivas donde se esperan campos.
          if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
            const error = new Error('El cuerpo de la petición debe ser un objeto JSON.');
            error.estado = 400;
            error.publico = true;
            return siguiente(error);
          }
          // Protección contra contaminación de prototipo.
          delete datos.__proto__;
          delete datos.constructor;
          req.body = datos;
          return siguiente();
        } catch (error) {
          const fallo = new Error('JSON inválido.');
          fallo.estado = 400;
          fallo.publico = true;
          return siguiente(fallo);
        }
      })
      .catch(siguiente);
  };
}

/** Middleware: cuerpo binario (subida de imágenes), con tipos permitidos. */
function binario({ tipos = [], limite = 1024 * 1024 } = {}) {
  return function middlewareBinario(req, res, siguiente) {
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!tipos.includes(tipo)) {
      return res
        .status(415)
        .json({ ok: false, mensaje: `Tipo de archivo no admitido. Usa: ${tipos.join(', ')}.` });
    }

    leerCuerpo(req, limite)
      .then((buffer) => {
        req.body = buffer;
        siguiente();
      })
      .catch(siguiente);
  };
}

module.exports = { json, binario, leerCuerpo };
