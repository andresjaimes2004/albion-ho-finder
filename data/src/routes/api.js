'use strict';

const { Router } = require('express');
const { buscarGremio } = require('../controllers/buscadorController');
const db = require('../config/database');

const router = Router();

router.get('/buscar', buscarGremio);

router.get('/salud', (req, res) => {
  try {
    db.getConnection().prepare('SELECT 1').get();
    res.json({ ok: true, estado: 'operativo' });
  } catch (error) {
    res.status(500).json({ ok: false, estado: 'error', detalle: error.message });
  }
});

module.exports = router;
