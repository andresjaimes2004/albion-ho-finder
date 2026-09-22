'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const apiRouter = require('./routes/api');

function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    })
  );
  app.use(cors());
  app.use(compression());
  app.use(express.json());

  app.use('/api', apiRouter);

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Manejador de errores centralizado
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
  });

  return app;
}

module.exports = crearApp;
