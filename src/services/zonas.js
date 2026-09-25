'use strict';

const path = require('path');
const fs = require('fs');

/**
 * zonas.js
 * ----------------------------------------------------------------------
 * Lista oficial de zonas del mundo abierto a las que puede llevar un
 * portal de Avalon (data/zonas_albion.json, generada por
 * scripts/generarZonasDesdeDumps.js desde los dumps del cliente).
 * ----------------------------------------------------------------------
 */

const ETIQUETAS_GRUPO = {
  avalon: 'Camino de Avalon',
  zonaNegra: 'Zona Negra',
  roja: 'Zona roja',
  amarilla: 'Zona amarilla',
  azul: 'Zona azul',
  ciudad: 'Ciudad',
  portalCiudad: 'Portal de ciudad',
  descanso: 'Descanso',
};

function cargarZonas() {
  const ruta = path.join(__dirname, '..', '..', 'data', 'zonas_albion.json');
  return JSON.parse(fs.readFileSync(ruta, 'utf-8')).zonas;
}

/** Clave de comparación: minúsculas y solo letras/números. */
function claveZona(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

module.exports = { cargarZonas, claveZona, ETIQUETAS_GRUPO };
