'use strict';

/**
 * generarGeoDesdeDumps.js
 * ----------------------------------------------------------------------
 * Genera data/mapas_geo.json a partir de los dumps oficiales del cliente
 * de Albion Online (archivo `cluster/world.json` del repositorio público
 * ao-data/ao-bin-dumps).
 *
 * De cada cluster de Zona Negra (type = OPENPVP_BLACK_*) se extraen
 * únicamente datos reales del juego:
 *   - posición del mapa en el mapa mundial (worldmapposition)
 *   - límites del minimapa (para dibujarlo a escala)
 *   - salidas hacia mapas vecinos, con su posición dentro del mapa
 *   - red de caminos internos (nodos + enlaces)
 *   - territorios (torres de vigilancia / castillos) con su monolito
 *   - tier, bioma y facción codificados en el nombre del archivo
 *
 * NO se inventa ninguna coordenada: la posición de un hideout construido
 * por un gremio no existe en los dumps (son construcciones de jugadores),
 * por eso se marca manualmente desde el panel de administración.
 *
 * Uso:
 *   node scripts/generarGeoDesdeDumps.js <ruta/a/world.json> [salida.json]
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const BIOMAS = {
  FR: 'Bosque',
  HL: 'Tierras altas',
  MN: 'Montaña',
  ST: 'Estepa',
  SW: 'Pantano',
};

const FACCIONES = {
  KPR: 'Keeper',
  MOR: 'Morgana',
  UND: 'No muertos',
  HER: 'Hereje',
  DEM: 'Demonio',
};

function aPar(texto) {
  if (!texto) return null;
  const partes = String(texto).trim().split(/\s+/).map(Number);
  if (partes.length < 2 || partes.some(Number.isNaN)) return null;
  return [partes[0], partes[1]];
}

function comoArreglo(valor) {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

/** Extrae tier, bioma, facción y cuadrante del nombre de archivo del cluster. */
function metadatosDeArchivo(archivo) {
  const base = String(archivo || '').replace('.cluster.xml', '');
  const partes = base.split('_');
  const tier = partes.find((p) => /^T\d$/.test(p));
  const bioma = partes.find((p) => Object.prototype.hasOwnProperty.call(BIOMAS, p));
  const faccion = partes.find((p) => Object.prototype.hasOwnProperty.call(FACCIONES, p));
  const cuadrante = partes.find((p) => /^Q\d$/.test(p));
  return {
    tier: tier ? Number(tier.slice(1)) : null,
    bioma: bioma || null,
    biomaNombre: bioma ? BIOMAS[bioma] : null,
    faccion: faccion || null,
    faccionNombre: faccion ? FACCIONES[faccion] : null,
    cuadrante: cuadrante || null,
  };
}

function parsearCaminos(roads) {
  if (!roads || !roads['@nodes']) return null;
  const nodos = String(roads['@nodes'])
    .split(';')
    .map((n) => aPar(n.replace(/,/g, ' ')))
    .filter(Boolean);
  const enlaces = String(roads['@links'] || '')
    .split(';')
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((par) => par.length === 2 && par.every((v) => Number.isInteger(v)));
  if (!nodos.length) return null;
  return { nodos, enlaces };
}

function generar(rutaWorldJson) {
  const world = JSON.parse(fs.readFileSync(rutaWorldJson, 'utf8'));
  const raiz = world.world || world;
  const clusters = comoArreglo(raiz.clusters && raiz.clusters.cluster);

  // Índice id -> displayname, para resolver el destino de cada salida.
  const nombrePorId = new Map();
  for (const c of clusters) {
    nombrePorId.set(String(c['@id']), c['@displayname'] || null);
  }

  const negros = clusters.filter((c) => String(c['@type'] || '').startsWith('OPENPVP_BLACK'));

  const mapas = negros.map((c) => {
    const meta = metadatosDeArchivo(c['@file']);

    const salidas = comoArreglo(c.exits && c.exits.exit)
      .filter((e) => e['@targettype'] === 'Cluster')
      .map((e) => {
        const idDestino = String(e['@targetid'] || '').split('@')[1] || null;
        return {
          pos: aPar(e['@pos']),
          destinoId: idDestino,
          destino: idDestino ? nombrePorId.get(idDestino) || null : null,
          tipo: e['@roadtype'] || null,
        };
      })
      .filter((e) => e.pos);

    const territorios = comoArreglo(c.territories && c.territories.territory).map((t) => ({
      nombre: t['@name'] || null,
      tipo: t['@territorytype'] || null,
      recurso: t['@resourcetype'] || null,
      centro: aPar(t['@center']),
      tam: aPar(t['@size']),
      monolito: aPar(t['@monolith']),
    }));

    const recursos = comoArreglo(c.distribution && c.distribution.resource)
      .map((r) => ({ nombre: r['@name'], tier: Number(r['@tier']), cantidad: Number(r['@count']) }))
      .filter((r) => r.nombre);

    return {
      id: String(c['@id']),
      nombre: c['@displayname'],
      tipo: c['@type'],
      ...meta,
      mundo: aPar(c['@worldmapposition']),
      limites: {
        min: aPar(c['@minimapBoundsMin']),
        max: aPar(c['@minimapBoundsMax']),
      },
      salidas,
      caminos: parsearCaminos(c.roads),
      territorios,
      recursos,
    };
  });

  mapas.sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    fuente: 'ao-data/ao-bin-dumps — cluster/world.json (dumps oficiales del cliente)',
    generadoEn: new Date().toISOString().slice(0, 10),
    mundo: {
      boundsMin: aPar(raiz['@boundsmin']),
      boundsMax: aPar(raiz['@boundsmax']),
    },
    totalMapas: mapas.length,
    mapas,
  };
}

if (require.main === module) {
  const entrada = process.argv[2];
  const salida = process.argv[3] || path.join(__dirname, '..', 'data', 'mapas_geo.json');

  if (!entrada) {
    console.error('Uso: node scripts/generarGeoDesdeDumps.js <ruta/a/cluster/world.json> [salida.json]');
    process.exit(1);
  }

  const resultado = generar(entrada);
  fs.writeFileSync(salida, JSON.stringify(resultado));
  console.log(`Generados ${resultado.totalMapas} mapas de Zona Negra en ${salida}`);
}

module.exports = generar;
