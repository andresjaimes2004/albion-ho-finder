'use strict';

/**
 * Pruebas de calidad para la lógica de búsqueda.
 * Usan una base de datos SQLite temporal y aislada (no la de producción),
 * cargada con un dataset mínimo de control.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-test-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;

const MapaRepository = require('../src/repositories/MapaRepository');
const GremioRepository = require('../src/repositories/GremioRepository');
const HideoutRepository = require('../src/repositories/HideoutRepository');
const TemporadaRepository = require('../src/repositories/TemporadaRepository');
const BuscadorService = require('../src/services/BuscadorService');

function prepararDatos() {
  const temporadaRepo = new TemporadaRepository();
  const mapaRepo = new MapaRepository();
  const gremioRepo = new GremioRepository();
  const hideoutRepo = new HideoutRepository();

  const temporada = temporadaRepo.crear('S-TEST', { activar: true });

  const mapa1 = mapaRepo.obtenerOCrear('Deepwood Copse');
  const mapa2 = mapaRepo.obtenerOCrear('Battlebrae Lake');

  const gremioA = gremioRepo.obtenerOCrear('Gankers Letales');
  const gremioB = gremioRepo.obtenerOCrear('ARCH Company');

  hideoutRepo.insertarLote(temporada.id, mapa1.id, [
    { gremioId: gremioA.id, slot: 1, tipo: 'HQ' },
    { gremioId: gremioB.id, slot: 2, tipo: 'ESTANDAR' },
  ]);
  hideoutRepo.insertarLote(temporada.id, mapa2.id, [
    { gremioId: gremioA.id, slot: 3, tipo: 'P' },
  ]);
}

test.before(() => {
  prepararDatos();
});

test.after(() => {
  // En Windows no se puede borrar un archivo abierto: cerrar la conexión primero.
  require('../src/config/database').close();
  fs.rmSync(DB_TEMPORAL, { force: true });
  fs.rmSync(`${DB_TEMPORAL}-wal`, { force: true });
  fs.rmSync(`${DB_TEMPORAL}-shm`, { force: true });
});

test('encuentra un gremio por nombre exacto', () => {
  const servicio = new BuscadorService();
  const resultado = servicio.buscarPorGremio('Gankers Letales');

  assert.equal(resultado.ok, true);
  assert.equal(resultado.totalMapas, 2);
  assert.equal(resultado.totalHideouts, 2);
});

test('la búsqueda es insensible a mayúsculas y por substring', () => {
  const servicio = new BuscadorService();
  const resultado = servicio.buscarPorGremio('gankers');

  assert.equal(resultado.ok, true);
  assert.equal(resultado.totalMapas, 2);
});

test('agrupa correctamente los hideouts por mapa', () => {
  const servicio = new BuscadorService();
  const resultado = servicio.buscarPorGremio('ARCH');

  assert.equal(resultado.totalMapas, 1);
  assert.equal(resultado.resultados[0].mapa, 'Deepwood Copse');
  assert.equal(resultado.resultados[0].hideouts[0].tipo, 'ESTANDAR');
});

test('rechaza búsquedas demasiado cortas', () => {
  const servicio = new BuscadorService();
  const resultado = servicio.buscarPorGremio('a');

  assert.equal(resultado.ok, false);
});

test('responde vacío cuando el gremio no existe', () => {
  const servicio = new BuscadorService();
  const resultado = servicio.buscarPorGremio('gremio-inexistente-xyz');

  assert.equal(resultado.ok, true);
  assert.equal(resultado.totalMapas, 0);
});

test('solo hay dos tipos: los hideouts "P" antiguos se entregan como HO', () => {
  const servicio = new BuscadorService();
  const resultado = servicio.buscarPorGremio('Gankers Letales');
  const tipos = resultado.resultados.flatMap((r) => r.hideouts.map((h) => h.tipo)).sort();
  assert.deepEqual(tipos, ['ESTANDAR', 'HQ']);
  const antiguo = resultado.resultados.flatMap((r) => r.hideouts).find((h) => h.slot === 3);
  assert.equal(antiguo.etiquetaTipo, 'Hideout (HO)');
});

test('encuentra gremios escritos con espacios o separadores entre las letras', () => {
  const temporada = new TemporadaRepository().obtenerActiva();
  const mapa = new MapaRepository().obtenerOCrear('Battlebrae Lake');
  const gremio = new GremioRepository().obtenerOCrear('R E Q U I E M');
  new HideoutRepository().insertarLote(temporada.id, mapa.id, [{ gremioId: gremio.id, slot: 5, tipo: 'ESTANDAR' }]);
  const servicio = new BuscadorService();

  for (const texto of ['requiem', 'REQUIEM', 'r e q u i e m', 'r.e.q.u', 'quiem']) {
    const r = servicio.buscarPorGremio(texto);
    assert.deepEqual(
      r.resultados.flatMap((m) => m.hideouts.map((h) => h.gremio)),
      ['R E Q U I E M'],
      `"${texto}" encuentra a R E Q U I E M`
    );
  }
  // Y al revés: "ganker sletales" (espacio mal puesto) sigue encontrando a Gankers Letales.
  assert.ok(servicio.buscarPorGremio('ganker sletales').resultados.length > 0);
});

test('sugerencias: gremios de la temporada y mapas, sin repetir y ordenados', () => {
  const r = new BuscadorService().sugerencias();
  assert.equal(r.ok, true);
  assert.deepEqual(r.gremios, ['ARCH Company', 'Gankers Letales', 'R E Q U I E M']);
  assert.ok(r.mapas.includes('Deepwood Copse'));
});
