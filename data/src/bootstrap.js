'use strict';

const TemporadaRepository = require('./repositories/TemporadaRepository');
const importarSeed = require('../scripts/importarSeed');
const path = require('path');

/**
 * Verifica si ya existe una temporada activa con datos. Si la base de
 * datos está vacía (por ejemplo, tras un reinicio en un hosting con
 * disco efímero), la siembra automáticamente desde
 * data/hideouts_seed.json, sin intervención manual.
 */
function asegurarDatosCargados() {
  const temporadaRepo = new TemporadaRepository();
  const activa = temporadaRepo.obtenerActiva();

  if (activa) {
    console.log(`Datos ya cargados (temporada ${activa.codigo}).`);
    return;
  }

  console.log('Base de datos vacía: sembrando datos iniciales...');
  const seedPath = path.join(__dirname, '..', 'data', 'hideouts_seed.json');
  importarSeed(seedPath);
}

module.exports = asegurarDatosCargados;
