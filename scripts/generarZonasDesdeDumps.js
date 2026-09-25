'use strict';

/**
 * generarZonasDesdeDumps.js
 * ----------------------------------------------------------------------
 * Genera data/zonas_albion.json a partir de los dumps oficiales del
 * cliente (cluster/world.json de ao-data/ao-bin-dumps): la lista de zonas
 * del mundo abierto a las que puede llevar un portal de Avalon.
 *
 * Sirve para reconocer los nombres leídos por OCR en las capturas del
 * juego y validar las conexiones reportadas. Se incluyen caminos de
 * Avalon, Zona Negra, zonas roja/amarilla/azul del continente real,
 * ciudades, Brecilien, portales de ciudad y descansos. Se excluyen
 * mazmorras, islas, arenas, expediciones e instancias.
 *
 * Uso:
 *   node scripts/generarZonasDesdeDumps.js <ruta/a/world.json> [salida.json]
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const GRUPOS = [
  [/^TUNNEL_/, 'avalon'],
  [/^OPENPVP_BLACK_/, 'zonaNegra'],
  [/^OPENPVP_RED$/, 'roja'],
  [/^OPENPVP_YELLOW$/, 'amarilla'],
  [/^SAFEAREA$/, 'azul'],
  [/^PLAYERCITY_SAFEAREA_0\d$/, 'ciudad'],
  [/^PLAYERCITY_BLACK(_ROYAL)?$/, 'ciudad'],
  [/^PLAYERCITY_BLACK_PORTALCITY_NOFURNITURE$/, 'portalCiudad'],
  [/^PLAYERCITY_BLACK_REST$/, 'descanso'],
];

function grupoDe(tipo) {
  const encontrado = GRUPOS.find(([patron]) => patron.test(tipo));
  return encontrado ? encontrado[1] : null;
}

function generar(rutaWorld) {
  const raiz = JSON.parse(fs.readFileSync(rutaWorld, 'utf-8')).world;
  const clusters = [].concat((raiz.clusters && raiz.clusters.cluster) || []);

  const vistas = new Set();
  const zonas = [];
  for (const c of clusters) {
    const grupo = grupoDe(c['@type'] || '');
    const nombre = (c['@displayname'] || '').trim();
    if (!grupo || !nombre || c['@enabled'] === 'false') continue;
    if (vistas.has(nombre.toLowerCase())) continue;
    vistas.add(nombre.toLowerCase());
    zonas.push({ id: c['@id'], nombre, grupo });
  }
  zonas.sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    fuente: 'ao-data/ao-bin-dumps — cluster/world.json (dumps oficiales del cliente)',
    generadoEn: new Date().toISOString().slice(0, 10),
    totalZonas: zonas.length,
    zonas,
  };
}

if (require.main === module) {
  const entrada = process.argv[2];
  const salida = process.argv[3] || path.join(__dirname, '..', 'data', 'zonas_albion.json');

  if (!entrada) {
    console.error('Uso: node scripts/generarZonasDesdeDumps.js <ruta/a/cluster/world.json> [salida.json]');
    process.exit(1);
  }

  const resultado = generar(entrada);
  fs.writeFileSync(salida, JSON.stringify(resultado));
  console.log(`Generadas ${resultado.totalZonas} zonas en ${salida}`);
}

module.exports = generar;
