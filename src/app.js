'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

const Router = require('./http/Router');
const { decorarPeticion, decorarRespuesta } = require('./http/contexto');
const { json } = require('./http/cuerpo');
const servirEstaticos = require('./http/estaticos');
const cabecerasSeguridad = require('./middlewares/cabecerasSeguridad');
const leerCookies = require('./middlewares/cookies');
const { cargarSesion, verificarCsrf } = require('./middlewares/autenticacion');
const apiRouter = require('./routes/api');
const config = require('./config/seguridad');
const { responderError } = require('./controllers/utilidades');

/**
 * app.js
 * ----------------------------------------------------------------------
 * Composición de la aplicación sobre el módulo `http` nativo de Node
 * (cero dependencias en tiempo de ejecución) y capa de seguridad
 * transversal:
 *
 *  - Cabeceras de seguridad y CSP estricta en todas las respuestas.
 *  - Sin CORS: la API solo la consume esta misma web, así que no se
 *    habilita ningún origen cruzado.
 *  - Cuerpo JSON limitado (32 kB).
 *  - Sesión resuelta desde cookie httpOnly y verificación CSRF en toda
 *    petición que modifique datos.
 *  - SPA: cualquier ruta desconocida devuelve index.html, salvo /api.
 * ----------------------------------------------------------------------
 */
function crearApp() {
  const app = new Router();
  const carpetaPublica = path.join(__dirname, '..', 'public');

  app.use(cabecerasSeguridad({ enProduccion: config.enProduccion }));
  app.use(json({ limite: 32 * 1024 }));
  app.use(leerCookies);
  app.use(cargarSesion);
  app.use(verificarCsrf);

  app.use('/api', apiRouter);

  app.use(servirEstaticos(carpetaPublica));

  // Resto de rutas: se entrega la aplicación de una sola página.
  const indice = path.join(carpetaPublica, 'index.html');
  app.use((req, res, siguiente) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return siguiente();
    if (req.ruta.startsWith('/api')) return siguiente();

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    return res.send(fs.readFileSync(indice));
  });

  /** Punto de entrada de cada petición HTTP. */
  function manejarPeticion(req, res) {
    decorarPeticion(req);
    decorarRespuesta(req, res);

    app.manejar(req, res, (error) => {
      if (error) return responderError(error, res);
      if (res.writableEnded) return undefined;
      return res.status(404).json({ ok: false, mensaje: 'Recurso no encontrado.' });
    });
  }

  manejarPeticion.crearServidor = () => http.createServer(manejarPeticion);
  manejarPeticion.router = app;

  return manejarPeticion;
}

module.exports = crearApp;
