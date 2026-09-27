'use strict';

// Misma base de datos que el servidor (DB_PATH del .env, si lo hay).
require('../src/config/entorno')();

const fs = require('fs');
const path = require('path');
const MapaRepository = require('../src/repositories/MapaRepository');
const AuditoriaRepository = require('../src/repositories/AuditoriaRepository');
const { detectarTipo } = require('../src/security/imagenes');
const config = require('../src/config/seguridad');
const db = require('../src/config/database');

/**
 * importarImagenesMapas.js
 * ----------------------------------------------------------------------
 * Carga de una vez las imágenes de fondo de los mapas de la Zona Negra
 * desde una carpeta. Cada imagen queda como la "imagen propia" del mapa,
 * igual que si un administrador la subiera desde la ventana del mapa, y
 * después se puede afinar con el ajuste de escala / desplazamiento /
 * rotación.
 *
 * El mapa de cada archivo se reconoce por su nombre:
 *   1. Número inicial = id del cluster en los dumps oficiales, que es
 *      como el cliente nombra el archivo del mapa:
 *        1353_WRL_FR_AUTO_T8_MOR_OUT_Q1.png  ->  Timbertop Escarp
 *        4358.webp                           ->  Avalanche Incline
 *   2. Si no empieza por un número, el nombre del mapa (sin importar
 *      mayúsculas, espacios, guiones ni apóstrofos):
 *        Avalanche Incline.png, avalanche-incline.jpg
 *
 * Se guardan como textura del minimapa del juego (proyección 'juego'):
 * un cuadrado en coordenadas del mapa que la ventana gira a diamante con
 * la misma transformación que las salidas, así que encajan sin ajuste.
 *
 * El tipo se valida por la firma binaria (PNG, JPG o WebP) y se respeta
 * el límite de tamaño de las subidas (4 MB). Por defecto no se tocan los
 * mapas que ya tienen imagen, para no perder imágenes ni ajustes hechos
 * a mano; --reemplazar las sustituye.
 *
 * Uso:
 *   npm run db:imagenes -- <carpeta> [--reemplazar] [--simular]
 *
 *   --simular     solo muestra qué haría, sin escribir en la base de datos
 *   --reemplazar  sustituye también las imágenes que ya existen
 * ----------------------------------------------------------------------
 */

const EXTENSIONES = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Mapa al que corresponde un archivo según su nombre, o null. */
function mapaDelArchivo(archivo, { porCluster, porNombre }) {
  const base = path.parse(archivo).name;
  const cluster = /^(\d+)(?:_|$)/.exec(base);
  if (cluster) return porCluster.get(cluster[1]) || null;
  return porNombre.get(normalizar(base)) || null;
}

function importarImagenesMapas(carpeta, { reemplazar = false, simular = false } = {}) {
  if (!carpeta || !fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) {
    throw new Error(`No se encontró la carpeta ${carpeta || '(sin indicar)'}.`);
  }

  const mapaRepo = new MapaRepository();
  const auditoria = new AuditoriaRepository();

  const mapas = mapaRepo.listarClusters();
  if (!mapas.length) {
    throw new Error('No hay geografía de mapas cargada. Ejecuta antes: npm run db:geo');
  }
  const indices = {
    porCluster: new Map(mapas.map((m) => [String(m.clusterId), m])),
    porNombre: new Map(mapas.map((m) => [normalizar(m.nombre), m])),
  };

  const informe = { importadas: [], existentes: [], sinMapa: [], invalidas: [], repetidas: [] };
  const asignados = new Map();

  const archivos = fs
    .readdirSync(carpeta)
    .filter((nombre) => EXTENSIONES.has(path.extname(nombre).toLowerCase()))
    .sort();

  for (const archivo of archivos) {
    const mapa = mapaDelArchivo(archivo, indices);
    if (!mapa) {
      informe.sinMapa.push(archivo);
      continue;
    }
    if (asignados.has(mapa.id)) {
      informe.repetidas.push({ archivo, mapa: mapa.nombre, anterior: asignados.get(mapa.id) });
      continue;
    }

    const datos = fs.readFileSync(path.join(carpeta, archivo));
    const mime = detectarTipo(datos);
    if (!mime || !config.logo.tiposPermitidos.includes(mime)) {
      informe.invalidas.push({ archivo, motivo: 'no es PNG, JPG ni WebP' });
      continue;
    }
    if (datos.length > config.limites.imagenMapaBytes) {
      const mb = (datos.length / 1024 / 1024).toFixed(1);
      informe.invalidas.push({ archivo, motivo: `pesa ${mb} MB (máximo 4 MB)` });
      continue;
    }

    asignados.set(mapa.id, archivo);
    if (!reemplazar && mapaRepo.obtenerImagenMeta(mapa.id)) {
      informe.existentes.push({ archivo, mapa: mapa.nombre });
      continue;
    }
    informe.importadas.push({ archivo, mapa: mapa.nombre, id: mapa.id, mime, datos });
  }

  if (!simular && informe.importadas.length) {
    db.transaccion(() => {
      for (const { archivo, id, mime, datos } of informe.importadas) {
        mapaRepo.guardarImagen(id, { mime, datos, usuarioId: null });
        auditoria.registrar({
          accion: 'IMAGEN',
          entidad: 'mapa',
          entidadId: id,
          detalle: { mime, bytes: datos.length, archivo, origen: 'importacion' },
        });
      }
    });
  }

  for (const entrada of informe.importadas) delete entrada.datos;
  const sinImagen = mapas
    .filter((m) => !asignados.has(m.id) && !mapaRepo.obtenerImagenMeta(m.id))
    .map((m) => `${m.clusterId} ${m.nombre}`)
    .sort();
  return { ...informe, sinImagen, totalArchivos: archivos.length, totalMapas: mapas.length, simular };
}

function imprimirInforme(informe) {
  const verbo = informe.simular ? 'Se importarían' : 'Importadas';
  console.log(`${verbo} ${informe.importadas.length} imágenes (${informe.totalArchivos} archivos leídos, ${informe.totalMapas} mapas).`);

  if (informe.existentes.length) {
    console.log(`\nYa tenían imagen (usa --reemplazar para sustituirlas): ${informe.existentes.length}`);
    for (const { archivo, mapa } of informe.existentes) console.log(`  ${archivo} -> ${mapa}`);
  }
  if (informe.repetidas.length) {
    console.log(`\nMás de un archivo para el mismo mapa (se usó el primero): ${informe.repetidas.length}`);
    for (const { archivo, mapa, anterior } of informe.repetidas) console.log(`  ${archivo} -> ${mapa} (ya asignado: ${anterior})`);
  }
  if (informe.invalidas.length) {
    console.log(`\nArchivos descartados: ${informe.invalidas.length}`);
    for (const { archivo, motivo } of informe.invalidas) console.log(`  ${archivo}: ${motivo}`);
  }
  if (informe.sinMapa.length) {
    console.log(`\nSin mapa de Zona Negra reconocible: ${informe.sinMapa.length}`);
    for (const archivo of informe.sinMapa) console.log(`  ${archivo}`);
  }

  if (informe.sinImagen.length) {
    console.log(`\nMapas que siguen sin imagen: ${informe.sinImagen.length}`);
    for (const mapa of informe.sinImagen) console.log(`  ${mapa}`);
  }
}

if (require.main === module) {
  const argumentos = process.argv.slice(2);
  const carpeta = argumentos.find((a) => !a.startsWith('--'));
  try {
    const informe = importarImagenesMapas(carpeta, {
      reemplazar: argumentos.includes('--reemplazar'),
      simular: argumentos.includes('--simular'),
    });
    imprimirInforme(informe);
  } catch (error) {
    console.error(error.message);
    console.error('Uso: npm run db:imagenes -- <carpeta> [--reemplazar] [--simular]');
    process.exit(1);
  }
}

module.exports = importarImagenesMapas;
module.exports.mapaDelArchivo = mapaDelArchivo;
