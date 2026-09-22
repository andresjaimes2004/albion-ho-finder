'use strict';

const path = require('path');
const crypto = require('crypto');

const TemporadaRepository = require('./repositories/TemporadaRepository');
const MapaRepository = require('./repositories/MapaRepository');
const UsuarioRepository = require('./repositories/UsuarioRepository');
const AuthService = require('./services/AuthService');
const importarSeed = require('../scripts/importarSeed');
const importarGeo = require('../scripts/importarGeo');

/**
 * bootstrap.js
 * ----------------------------------------------------------------------
 * Arranque autosuficiente. En cada inicio:
 *
 *  1. Si la base está vacía (hostings con disco efímero), siembra los
 *     hideouts desde data/hideouts_seed.json.
 *  2. Carga la geografía oficial de los mapas si aún no está.
 *  3. Garantiza que exista una cuenta de administrador.
 *
 * La cuenta admin se toma de las variables ADMIN_USUARIO y ADMIN_CLAVE.
 * Si no están definidas, se crea "admin" con una contraseña aleatoria que
 * se imprime UNA vez en el log del servidor: así nunca hay credenciales
 * por defecto conocidas en el código ni en el repositorio.
 * ----------------------------------------------------------------------
 */
function asegurarDatosCargados() {
  const temporadaRepo = new TemporadaRepository();
  const activa = temporadaRepo.obtenerActiva();

  if (activa) {
    console.log(`Datos ya cargados (temporada ${activa.codigo}).`);
  } else {
    console.log('Base de datos vacía: sembrando datos iniciales...');
    const seedPath = path.join(__dirname, '..', 'data', 'hideouts_seed.json');
    importarSeed(seedPath);
  }

  asegurarGeografia();
  asegurarAdministrador();
}

function asegurarGeografia() {
  const mapaRepo = new MapaRepository();
  if (mapaRepo.contarGeo() > 0) {
    console.log(`Geografía de mapas disponible (${mapaRepo.contarGeo()} mapas).`);
    return;
  }

  console.log('Cargando geografía oficial de la Zona Negra...');
  const resultado = importarGeo();
  console.log(`Geografía cargada: ${resultado.importados} mapas.`);
}

function asegurarAdministrador() {
  const usuarios = new UsuarioRepository();
  if (usuarios.contarPorRol('ADMIN') > 0) return;

  const auth = new AuthService();
  const usuario = process.env.ADMIN_USUARIO || 'admin';
  const clave = process.env.ADMIN_CLAVE || `${crypto.randomBytes(9).toString('base64url')}7a`;

  try {
    auth.registrar({ usuario, clave, rol: 'ADMIN' });
  } catch (error) {
    console.error('[admin] No se pudo crear la cuenta de administrador:', error.message);
    return;
  }

  if (process.env.ADMIN_CLAVE) {
    console.log(`[admin] Cuenta de administrador "${usuario}" creada con la clave de ADMIN_CLAVE.`);
  } else {
    console.log('------------------------------------------------------------');
    console.log(`[admin] Cuenta de administrador creada: ${usuario}`);
    console.log(`[admin] Contraseña temporal: ${clave}`);
    console.log('[admin] Cámbiala al entrar y define ADMIN_USUARIO/ADMIN_CLAVE.');
    console.log('------------------------------------------------------------');
  }
}

module.exports = asegurarDatosCargados;
module.exports.asegurarAdministrador = asegurarAdministrador;
module.exports.asegurarGeografia = asegurarGeografia;
