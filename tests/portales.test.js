'use strict';

/**
 * Cercanía de las zonas a los portales de ciudad (src/services/portales.js)
 * y cómo la usan las rutas del gremio.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-portales-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;

const { crearCercania } = require('../src/services/portales');

// Lymhurst Portal – A – B – C, y Martlock Portal – D – C. E cuelga de B y
// del descanso "Arthur's Rest".
const MAPAS = [
  { nombre: 'A', destinos: ['Lymhurst Portal', 'B'] },
  { nombre: 'B', destinos: ['A', 'C', 'E'] },
  { nombre: 'C', destinos: ['B', 'D'] },
  { nombre: 'D', destinos: ['C', 'Martlock Portal'] },
  { nombre: 'E', destinos: ['B', "Arthur's Rest"] },
  { nombre: 'Suelta', destinos: [] },
];
const PORTALES = ['Lymhurst Portal', 'Martlock Portal'];

test('mide los saltos al portal de ciudad más cercano', () => {
  const cercania = crearCercania(MAPAS, PORTALES);
  assert.deepEqual(cercania('A'), { portal: 'Lymhurst Portal', saltos: 1 });
  assert.deepEqual(cercania('B'), { portal: 'Lymhurst Portal', saltos: 2 });
  assert.deepEqual(cercania('D'), { portal: 'Martlock Portal', saltos: 1 });
  assert.equal(cercania('C').saltos, 2, 'a 2 de los dos portales: vale cualquiera');
  assert.deepEqual(cercania('Lymhurst Portal'), { portal: 'Lymhurst Portal', saltos: 0 });
  assert.deepEqual(cercania('Martlock'), { portal: 'Martlock Portal', saltos: 0 }, 'la ciudad es el otro lado de su portal');
  assert.deepEqual(cercania("Arthur's Rest"), { portal: 'Lymhurst Portal', saltos: 4 }, 'descanso: su vecino de Zona Negra + 1');
  assert.equal(cercania('Suelta'), null);
  assert.equal(cercania('Algún-Camino'), null, 'los caminos de Avalon no se miden');
});

test('las rutas se orientan desde el extremo más cercano a un portal y se ordenan por cercanía', async () => {
  const TrackingService = require('../src/services/TrackingService');
  const ReportesCaminosService = require('../src/services/ReportesCaminosService');
  const AuthService = require('../src/services/AuthService');

  const AHORA = Date.parse('2026-09-29T12:00:00Z');
  const ZONAS = [
    { nombre: 'A', grupo: 'zonaNegra' },
    { nombre: 'C', grupo: 'zonaNegra' },
    { nombre: 'Suelta', grupo: 'zonaNegra' },
    { nombre: 'Ava-Uno', grupo: 'avalon' },
    { nombre: 'Ava-Dos', grupo: 'avalon' },
    { nombre: 'Lymhurst Portal', grupo: 'portalCiudad' },
    { nombre: 'Martlock Portal', grupo: 'portalCiudad' },
  ];
  const autor = new AuthService().registrar({ usuario: 'rastreador', clave: 'ClaveSegura99' });
  const reportes = new ReportesCaminosService({ zonas: ZONAS, ahora: () => AHORA });
  // Ruta 1: Suelta → Ava-Uno → A (A está a 1 salto de Lymhurst Portal).
  reportes.registrar(autor.id, [
    { origen: 'Suelta', destino: 'Ava-Uno', minutos: 60 },
    { origen: 'Ava-Uno', destino: 'A', minutos: 90 },
  ], [[0, 1]]);
  // Ruta 2: C → Ava-Dos → Suelta (C a 2 saltos).
  reportes.registrar(autor.id, [
    { origen: 'C', destino: 'Ava-Dos', minutos: 120 },
    { origen: 'Ava-Dos', destino: 'Suelta', minutos: 30 },
  ], [[0, 1]]);

  const servicio = new TrackingService({
    catalogo: { caminos: [] },
    mapaRepository: {
      listarResumenGeo: () => [{ nombre: 'A', tier: 6 }, { nombre: 'C', tier: 7 }, { nombre: 'Suelta', tier: 8 }],
      listarSalidas: () => MAPAS,
    },
    zonas: ZONAS,
    ahora: () => AHORA,
  });
  const resumen = await servicio.resumen();
  assert.deepEqual(resumen.portales, PORTALES);
  assert.deepEqual(
    resumen.rutas.map((r) => r.zonas.map((z) => z.nombre).join(' > ')),
    ['A > Ava-Uno > Suelta', 'C > Ava-Dos > Suelta'],
    'la más cercana primero, y cada una empieza por su extremo más cercano'
  );
  assert.deepEqual(resumen.rutas[0].cercania, { portal: 'Lymhurst Portal', saltos: 1, desde: 'A' });
  assert.deepEqual(
    resumen.rutas[0].tramos.map((t) => (t.cierraEn - AHORA) / 60_000),
    [90, 60],
    'los tiempos de cada tramo se invierten con la ruta'
  );
  assert.equal(resumen.rutas[1].cercania.saltos, 2);
});

test.after(() => {
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(`${DB_TEMPORAL}${sufijo}`, { force: true });
});
