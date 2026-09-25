'use strict';

/**
 * generarCaminosDesdeDumps.js
 * ----------------------------------------------------------------------
 * Genera data/caminos_avalon.json a partir de los dumps oficiales del
 * cliente de Albion Online (archivo `cluster/world.json` del repositorio
 * público ao-data/ao-bin-dumps).
 *
 * De cada camino avaloniano (clusters `TUNNEL_*`, ids `TNL-xxx`) se
 * extraen únicamente datos reales del juego:
 *   - id del cluster y nombre visible (ej. "Ouyos-Aoeuam")
 *   - tipo de camino y tier (codificado en el nombre del archivo)
 *   - recursos cosechables por tipo y tier (bloque `distribution`)
 *   - cantidad de dungeons (solo, grupo, élite) y de nodos de recursos
 *     marcados en el minimapa
 *
 * Las CONEXIONES entre caminos no están en los dumps: el juego las abre
 * y cierra al azar cada pocas horas. Esas llegan en vivo desde la API
 * pública de ava.smugden.com (ver src/services/TrackingService.js).
 *
 * Uso:
 *   node scripts/generarCaminosDesdeDumps.js <ruta/a/world.json> [salida.json]
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

function comoArreglo(valor) {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function tierDeArchivo(archivo) {
  const coincidencia = String(archivo || '').match(/_T(\d)_/);
  return coincidencia ? Number(coincidencia[1]) : null;
}

function recursosDe(cluster) {
  return comoArreglo(cluster.distribution && cluster.distribution.resource)
    .map((r) => ({
      tipo: String(r['@name'] || '').toUpperCase(),
      tier: Number(r['@tier']) || null,
      cantidad: Number(r['@count']) || 0,
    }))
    .filter((r) => r.tipo && r.cantidad > 0);
}

function marcadoresDe(cluster) {
  const dungeons = { solo: 0, grupo: 0, elite: 0 };
  const nodos = {};

  for (const marcador of comoArreglo(cluster.minimapmarkers && cluster.minimapmarkers.marker)) {
    const tipo = marcador['@type'];
    if (tipo === 'dungeon_solo') dungeons.solo += 1;
    else if (tipo === 'dungeon_group') dungeons.grupo += 1;
    else if (tipo === 'dungeon_elite') dungeons.elite += 1;
    else if (tipo) nodos[tipo.toUpperCase()] = (nodos[tipo.toUpperCase()] || 0) + 1;
  }

  return { dungeons, nodos };
}

function generar(rutaWorld) {
  const raiz = JSON.parse(fs.readFileSync(rutaWorld, 'utf-8')).world;
  const clusters = comoArreglo(raiz.clusters && raiz.clusters.cluster);

  const caminos = clusters
    .filter((c) => /^TUNNEL/.test(c['@type'] || '') && c['@enabled'] !== 'false')
    .map((c) => {
      const { dungeons, nodos } = marcadoresDe(c);
      return {
        id: c['@id'],
        nombre: c['@displayname'],
        tipo: c['@type'],
        tier: tierDeArchivo(c['@file']),
        recursos: recursosDe(c),
        dungeons,
        nodos,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    fuente: 'ao-data/ao-bin-dumps — cluster/world.json (dumps oficiales del cliente)',
    generadoEn: new Date().toISOString().slice(0, 10),
    totalCaminos: caminos.length,
    caminos,
  };
}

if (require.main === module) {
  const entrada = process.argv[2];
  const salida = process.argv[3] || path.join(__dirname, '..', 'data', 'caminos_avalon.json');

  if (!entrada) {
    console.error('Uso: node scripts/generarCaminosDesdeDumps.js <ruta/a/cluster/world.json> [salida.json]');
    process.exit(1);
  }

  const resultado = generar(entrada);
  fs.writeFileSync(salida, JSON.stringify(resultado));
  console.log(`Generados ${resultado.totalCaminos} caminos avalonianos en ${salida}`);
}

module.exports = generar;
