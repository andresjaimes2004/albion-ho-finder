'use strict';

/**
 * Gremios con hideout en caminos de Avalon de hideouts: registro,
 * validación, permisos, búsqueda y cómo se ven en las rutas.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-hideouts-camino-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;

const HideoutsCaminoService = require('../src/services/HideoutsCaminoService');
const AuthService = require('../src/services/AuthService');

const CATALOGO = {
  caminos: [
    { id: 'TNL-200', nombre: 'Qiient-Al-Odetum', tipo: 'TUNNEL_HIDEOUT', tier: 6, recursos: [], dungeons: { solo: 0, grupo: 0, elite: 0 } },
    { id: 'TNL-201', nombre: 'Qiient-Al-Nusis', tipo: 'TUNNEL_HIDEOUT_DEEP', tier: 8, recursos: [], dungeons: { solo: 0, grupo: 0, elite: 0 } },
    { id: 'TNL-001', nombre: 'Ouyos-Aoeuam', tipo: 'TUNNEL_ROYAL', tier: 4, recursos: [], dungeons: { solo: 1, grupo: 1, elite: 0 } },
  ],
};

let autor;
let otro;
let admin;
test.before(() => {
  const auth = new AuthService();
  autor = auth.registrar({ usuario: 'rastreadora', clave: 'ClaveSegura99' });
  otro = auth.registrar({ usuario: 'miron', clave: 'ClaveSegura99' });
  admin = auth.registrar({ usuario: 'jefe', clave: 'ClaveSegura99', rol: 'ADMIN' });
});

test.after(() => {
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(`${DB_TEMPORAL}${sufijo}`, { force: true });
});

function servicio() {
  return new HideoutsCaminoService({ catalogo: CATALOGO });
}

test('solo los caminos de tipo hideout admiten gremios', () => {
  const s = servicio();
  assert.equal(s.esCaminoHideout('qiient-al-odetum'), true, 'tolera mayúsculas');
  assert.equal(s.esCaminoHideout('Qiient-Al-Nusis'), true, 'también los profundos');
  assert.equal(s.esCaminoHideout('Ouyos-Aoeuam'), false);
  assert.throws(() => s.agregar(autor, 'Ouyos-Aoeuam', 'Los Topos'), /no es un camino de Avalon de hideouts/);
  assert.throws(() => s.listar('Ouyos-Aoeuam'), (e) => e.estado === 404);
});

test('anota gremios con el nombre oficial del camino y sin duplicarlos', () => {
  const s = servicio();
  const primero = s.agregar(autor, 'qiient-al-odetum', '  Los   Topos ');
  assert.equal(primero.nuevo, true);
  assert.equal(primero.camino, 'Qiient-Al-Odetum');
  assert.equal(primero.gremio, 'Los Topos');
  assert.equal(primero.usuario, 'rastreadora');

  const repetido = s.agregar(otro, 'Qiient-Al-Odetum', 'los topos');
  assert.equal(repetido.nuevo, false, 'el mismo gremio solo renueva la confirmación');
  assert.equal(repetido.id, primero.id);
  assert.equal(s.listar('Qiient-Al-Odetum').length, 1);
});

test('valida el nombre del gremio', () => {
  const s = servicio();
  assert.throws(() => s.agregar(autor, 'Qiient-Al-Odetum', 'x'), /al menos 2/);
  assert.throws(() => s.agregar(autor, 'Qiient-Al-Odetum', 'a'.repeat(41)), /no puede superar 40/);
  assert.throws(() => s.agregar(autor, 'Qiient-Al-Odetum', '<script>'), /solo puede tener letras/);
  assert.throws(() => s.agregar(autor, 'Qiient-Al-Odetum', 42), /debe ser texto/);
  assert.equal(s.agregar(autor, 'Qiient-Al-Odetum', "Señores d'Ávalon & Co.").gremio, "Señores d'Ávalon & Co.");
});

test('solo quien lo anotó o un administrador pueden borrarlo', () => {
  const s = servicio();
  const registro = s.agregar(autor, 'Qiient-Al-Nusis', 'Gremio Borrable');
  assert.throws(() => s.eliminar(otro, registro.id), (e) => e.estado === 403);
  s.eliminar(admin, registro.id);
  assert.equal(s.listar('Qiient-Al-Nusis').length, 0);
  assert.throws(() => s.eliminar(admin, registro.id), (e) => e.estado === 404);
});

test('limita cuántos gremios se anotan por camino', () => {
  const s = servicio();
  for (let i = 0; i < HideoutsCaminoService.MAX_POR_CAMINO; i++) s.agregar(autor, 'Qiient-Al-Nusis', `Relleno ${i}`);
  assert.throws(() => s.agregar(autor, 'Qiient-Al-Nusis', 'Uno Más'), /ya tiene 10 gremios/);
  // Uno que ya estaba sí se puede confirmar.
  assert.equal(s.agregar(otro, 'Qiient-Al-Nusis', 'relleno 3').nuevo, false);
});

test('el buscador encuentra caminos por gremio anotado y por nombre de camino', () => {
  const s = servicio();
  const porGremio = s.buscar('topos');
  assert.deepEqual(porGremio.map((c) => c.camino), ['Qiient-Al-Odetum']);
  assert.deepEqual(porGremio[0].gremios.map((g) => g.gremio).sort(), ['Los Topos', "Señores d'Ávalon & Co."]);
  assert.equal(porGremio[0].tier, 6);

  const porCamino = s.buscar('al-nusis');
  assert.deepEqual(porCamino.map((c) => c.camino), ['Qiient-Al-Nusis']);
  assert.equal(porCamino[0].profundo, true);
  assert.deepEqual(s.buscar('x'), []);
});

test('las rutas que terminan en un camino de hideouts muestran sus gremios', async () => {
  const TrackingService = require('../src/services/TrackingService');
  const ReportesCaminosService = require('../src/services/ReportesCaminosService');
  const AHORA = Date.parse('2026-09-29T12:00:00Z');
  const ZONAS = [
    { nombre: 'Deepwood Copse', grupo: 'zonaNegra' },
    { nombre: 'Ouyos-Aoeuam', grupo: 'avalon' },
    { nombre: 'Qiient-Al-Odetum', grupo: 'avalon' },
  ];
  new ReportesCaminosService({ zonas: ZONAS, ahora: () => AHORA }).registrar(
    autor.id,
    [
      { origen: 'Deepwood Copse', destino: 'Ouyos-Aoeuam', minutos: 60 },
      { origen: 'Ouyos-Aoeuam', destino: 'Qiient-Al-Odetum', minutos: 90 },
    ],
    [[0, 1]]
  );
  const seguimiento = new TrackingService({
    catalogo: CATALOGO,
    mapaRepository: { listarResumenGeo: () => [{ nombre: 'Deepwood Copse', tier: 6 }], listarSalidas: () => [] },
    zonas: ZONAS,
    ahora: () => AHORA,
    hideoutsCamino: servicio(),
  });
  const { rutas } = await seguimiento.resumen();
  assert.equal(rutas.length, 1);
  const final = rutas[0].zonas[2];
  assert.equal(final.nombre, 'Qiient-Al-Odetum');
  assert.deepEqual([...final.gremios].sort(), ['Los Topos', "Señores d'Ávalon & Co."]);

  const ficha = await seguimiento.detalle('Qiient-Al-Odetum');
  assert.equal(ficha.mapa.esHideout, true);
  assert.equal(ficha.hideouts.length, 2);
  const normal = await seguimiento.detalle('Ouyos-Aoeuam');
  assert.equal(normal.mapa.esHideout, false);
  assert.equal(normal.hideouts, undefined);
});

test('no admite nombres de gremio ofensivos escritos en la web', () => {
  const s = servicio();
  assert.throws(() => s.agregar(autor, 'Qiient-Al-Odetum', 'Hijos de Puta'), /no está permitido/);
  // Desde el Excel (lo mantiene el equipo) no se aplica ese filtro.
  assert.equal(s.validarGremio('Hijos de Puta', { revisarOfensivo: false }), 'Hijos de Puta');
});

test('lo que ya está en el Excel no se borra desde la web', () => {
  const s = servicio();
  const registro = s.agregar(autor, 'Qiient-Al-Odetum', 'Ya En Excel');
  assert.equal(registro.origen, 'web');
  assert.equal(registro.enExcel, 0, 'nace pendiente de pasar al Excel');
  s.repositorio.marcarEnExcel(registro.id);
  assert.throws(() => s.eliminar(admin, registro.id), (e) => e.estado === 409 && /bórralo del Excel/.test(e.message));
  assert.ok(s.listar('Qiient-Al-Odetum').some((h) => h.id === registro.id));
});
