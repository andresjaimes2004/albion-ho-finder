'use strict';

/**
 * Pruebas de la capa de seguridad: contraseñas, validación de entradas,
 * detección de imágenes e intentos de inyección SQL.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-seguridad-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;

const claves = require('../src/security/claves');
const tokens = require('../src/security/tokens');
const validacion = require('../src/security/validacion');
const { detectarTipo } = require('../src/security/imagenes');

const MapaRepository = require('../src/repositories/MapaRepository');
const GremioRepository = require('../src/repositories/GremioRepository');
const HideoutRepository = require('../src/repositories/HideoutRepository');
const TemporadaRepository = require('../src/repositories/TemporadaRepository');
const UsuarioRepository = require('../src/repositories/UsuarioRepository');
const BuscadorService = require('../src/services/BuscadorService');
const AuthService = require('../src/services/AuthService');

test.before(() => {
  const temporadaRepo = new TemporadaRepository();
  const mapaRepo = new MapaRepository();
  const gremioRepo = new GremioRepository();
  const hideoutRepo = new HideoutRepository();

  const temporada = temporadaRepo.crear('S-SEG', { activar: true });
  const mapa = mapaRepo.obtenerOCrear('Deepwood Copse');
  const gremio = gremioRepo.obtenerOCrear("Robert'); DROP TABLE hideouts;--");
  const normal = gremioRepo.obtenerOCrear('Gremio Normal');

  hideoutRepo.insertarLote(temporada.id, mapa.id, [
    { gremioId: gremio.id, slot: 1, tipo: 'HQ' },
    { gremioId: normal.id, slot: 2, tipo: 'ESTANDAR' },
  ]);
});

test.after(() => {
  // En Windows no se puede borrar un archivo abierto: cerrar la conexión primero.
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_TEMPORAL}${sufijo}`, { force: true });
  }
});

// ------------------------------------------------------------ contraseñas ---

test('el hash de contraseña es distinto en cada registro (sal única)', () => {
  const a = claves.hashear('ClaveSegura99');
  const b = claves.hashear('ClaveSegura99');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
});

test('verifica la contraseña correcta y rechaza la incorrecta', () => {
  const hash = claves.hashear('ClaveSegura99');
  assert.equal(claves.verificar('ClaveSegura99', hash), true);
  assert.equal(claves.verificar('ClaveSegura98', hash), false);
  assert.equal(claves.verificar('', hash), false);
});

test('el hash almacenado no contiene la contraseña en claro', () => {
  const hash = claves.hashear('SuperSecreta2026');
  assert.equal(hash.includes('SuperSecreta2026'), false);
});

test('exige contraseñas con longitud y complejidad mínimas', () => {
  assert.ok(claves.validarFortaleza('corta1'));
  assert.ok(claves.validarFortaleza('sinnumerosaqui'));
  assert.ok(claves.validarFortaleza('123456789012'));
  assert.equal(claves.validarFortaleza('ClaveSegura99'), null);
});

// ------------------------------------------------------------------ tokens ---

test('los tokens de sesión se guardan solo como hash', () => {
  const token = tokens.generarToken();
  const hash = tokens.hashToken(token);
  assert.notEqual(token, hash);
  assert.equal(hash.length, 64);
  assert.equal(tokens.sonIguales(hash, tokens.hashToken(token)), true);
  assert.equal(tokens.sonIguales(hash, tokens.hashToken('otro')), false);
});

// -------------------------------------------------------------- validación ---

test('la validación rechaza tipos y rangos inválidos', () => {
  assert.throws(() => validacion.texto('', 'nombre'), /obligatorio/);
  assert.throws(() => validacion.texto('x'.repeat(200), 'nombre', { max: 60 }), /superar/);
  assert.throws(() => validacion.entero('12a', 'slot'), /entero/);
  assert.throws(() => validacion.entero(99, 'slot', { min: 1, max: 10 }), /entre/);
  assert.throws(() => validacion.opcion('BORRAR', 'tipo', ['HQ', 'P']), /solo admite/);
  assert.throws(() => validacion.nombreUsuario('usuario con espacios'), /solo admite/);
  assert.equal(validacion.nombreUsuario('andres_2004'), 'andres_2004');
});

test('la limpieza elimina caracteres de control', () => {
  assert.equal(validacion.texto('  hola\u0000\u0007 mundo  ', 'x'), 'hola mundo');
});

// ---------------------------------------------------------------- imágenes ---

test('detecta el tipo real de la imagen por su firma binaria', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(10)]);
  const falso = Buffer.from('<?php system($_GET["c"]); ?>          ');

  assert.equal(detectarTipo(png), 'image/png');
  assert.equal(detectarTipo(jpeg), 'image/jpeg');
  assert.equal(detectarTipo(falso), null);
  assert.equal(detectarTipo(Buffer.from('<svg onload=alert(1)>')), null);
});

// ----------------------------------------------------------- inyección SQL ---

const PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE hideouts;--",
  "' UNION SELECT clave_hash FROM usuarios--",
  '" OR 1=1 --',
  "admin'--",
];

test('las búsquedas con payloads de inyección se tratan como texto literal', () => {
  const servicio = new BuscadorService();

  for (const payload of PAYLOADS) {
    const resultado = servicio.buscarPorGremio(payload);
    assert.equal(resultado.ok, true, `payload rechazado inesperadamente: ${payload}`);
    assert.equal(resultado.totalMapas, 0, `el payload devolvió filas: ${payload}`);
  }

  // Las tablas siguen existiendo y con sus datos intactos.
  const hideoutRepo = new HideoutRepository();
  const temporada = new TemporadaRepository().obtenerActiva();
  assert.equal(hideoutRepo.contarTotal(temporada.id), 2);
});

test('los comodines de LIKE no actúan como comodines', () => {
  const servicio = new BuscadorService();
  // "%" debería buscarse literalmente, no devolver todos los gremios.
  assert.equal(servicio.buscarPorGremio('%%').totalMapas, 0);
  assert.equal(servicio.buscarPorGremio('__').totalMapas, 0);
});

test('un nombre de gremio con comillas se guarda y se recupera tal cual', () => {
  const servicio = new BuscadorService();
  const resultado = servicio.buscarPorGremio("Robert'); DROP TABLE");

  assert.equal(resultado.ok, true);
  assert.equal(resultado.totalHideouts, 1);
  assert.equal(resultado.resultados[0].hideouts[0].gremio, "Robert'); DROP TABLE hideouts;--");
});

test('el login no se salta con una inyección en el usuario', () => {
  const auth = new AuthService();
  auth.registrar({ usuario: 'usuario.real', clave: 'ClaveSegura99' });

  for (const payload of PAYLOADS) {
    assert.throws(
      () => auth.iniciarSesion({ usuario: payload, clave: payload, huella: 'prueba' }),
      /incorrectos|Demasiados/
    );
  }
});

test('el repositorio de usuarios nunca devuelve el hash de la contraseña', () => {
  const usuarios = new UsuarioRepository();
  const lista = usuarios.listar();
  for (const usuario of lista) {
    assert.equal('clave_hash' in usuario, false);
    assert.equal('claveHash' in usuario, false);
  }
});
