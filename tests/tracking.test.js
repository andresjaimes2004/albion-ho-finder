'use strict';

/**
 * Pruebas del seguimiento de caminos de Avalon. La API en vivo se
 * reemplaza por una función falsa: las pruebas nunca salen a internet.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-tracking-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;

const TrackingService = require('../src/services/TrackingService');

const AHORA = Date.parse('2026-09-25T12:00:00Z');

const CATALOGO = {
  caminos: [
    {
      id: 'TNL-001',
      nombre: 'Ouyos-Aoeuam',
      tipo: 'TUNNEL_ROYAL',
      tier: 4,
      recursos: [{ tipo: 'ORE', tier: 4, cantidad: 3 }],
      dungeons: { solo: 1, grupo: 1, elite: 0 },
      nodos: { ORE: 1 },
    },
    {
      id: 'TNL-045',
      nombre: 'Cases-Ugumlos',
      tipo: 'TUNNEL_BLACK_LOW',
      tier: 6,
      recursos: [{ tipo: 'ROCK', tier: 6, cantidad: 15 }],
      dungeons: { solo: 1, grupo: 1, elite: 0 },
      nodos: {},
    },
  ],
};

const mapasFalsos = {
  listarResumenGeo: () => [{ nombre: 'Deepwood Copse', clusterId: '0337', tier: 6, cuadrante: 'Q1' }],
};

function crearServicio(roads, opciones = {}) {
  let llamadas = 0;
  const servicio = new TrackingService({
    catalogo: CATALOGO,
    mapaRepository: mapasFalsos,
    ahora: () => AHORA,
    obtenerEnVivo: async () => {
      llamadas += 1;
      if (roads instanceof Error) throw roads;
      return { ok: true, updated_at: '2026-09-25T11:59:00Z', roads };
    },
    ...opciones,
  });
  return { servicio, llamadas: () => llamadas };
}

test.after(() => {
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_TEMPORAL}${sufijo}`, { force: true });
  }
});

test('identifica los extremos por nombre o por id de cluster', async () => {
  const { servicio } = crearServicio([
    // Origen solo con id de Zona Negra (la fuente pone "?" como nombre).
    { id: 'a', source_cluster_id: '0337', source_map_name: '?', target_cluster_id: 'TNL-001', target_name: null, expires_at_ms: AHORA + 3_600_000 },
    { id: 'b', source_map_name: 'cases-ugumlos', target_name: 'Ouyos-Aoeuam', expires_at_ms: AHORA + 60_000 },
  ]);

  const { conexiones } = await servicio.resumen();
  const a = conexiones.find((c) => c.id === 'a');
  assert.equal(a.origen.nombre, 'Deepwood Copse');
  assert.equal(a.origen.clase, 'zonaNegra');
  assert.equal(a.destino.nombre, 'Ouyos-Aoeuam');
  assert.equal(a.destino.clase, 'avalon');

  const b = conexiones.find((c) => c.id === 'b');
  assert.equal(b.origen.nombre, 'Cases-Ugumlos', 'se corrige el nombre con el del catálogo');
});

test('descarta conexiones cerradas y ordena por cierre más próximo', async () => {
  const { servicio } = crearServicio([
    { id: 'tarde', source_map_name: 'Cases-Ugumlos', target_name: 'Ouyos-Aoeuam', expires_at_ms: AHORA + 7_200_000 },
    { id: 'cerrada', source_map_name: 'Cases-Ugumlos', target_name: 'Ouyos-Aoeuam', expires_at_ms: AHORA - 1 },
    { id: 'pronto', source_map_name: 'Cases-Ugumlos', target_name: 'Ouyos-Aoeuam', closes_in_seconds: 600, first_seen_at: '2026-09-25T11:55:00Z' },
  ]);

  const { conexiones, estado } = await servicio.resumen();
  assert.deepEqual(conexiones.map((c) => c.id), ['pronto', 'tarde']);
  assert.equal(conexiones[0].cierraEn, Date.parse('2026-09-25T12:05:00Z'));
  assert.equal(estado.activas, 2);
});

test('el detalle de un mapa lista sus conexiones en ambos sentidos', async () => {
  const { servicio } = crearServicio([
    { id: 'sale', source_map_name: 'Ouyos-Aoeuam', target_name: 'Cases-Ugumlos', expires_at_ms: AHORA + 60_000 },
    { id: 'entra', source_cluster_id: '337', target_name: 'Ouyos-Aoeuam', expires_at_ms: AHORA + 120_000 },
  ]);

  const detalle = await servicio.detalle('ouyos aoeuam');
  assert.equal(detalle.ok, true);
  assert.equal(detalle.mapa.clase, 'avalon');
  assert.equal(detalle.mapa.camino.tier, 4);
  assert.deepEqual(
    detalle.conexiones.map((c) => [c.id, c.sentido, c.hacia.nombre]),
    [['sale', 'salida', 'Cases-Ugumlos'], ['entra', 'entrada', 'Deepwood Copse']]
  );

  const zonaNegra = await servicio.detalle('Deepwood Copse');
  assert.equal(zonaNegra.mapa.clase, 'zonaNegra');
  assert.equal(zonaNegra.conexiones.length, 1);

  const inexistente = await servicio.detalle('No Existe');
  assert.equal(inexistente.ok, false);
});

test('el resumen cuenta las conexiones de cada camino', async () => {
  const { servicio } = crearServicio([
    { id: 'x', source_map_name: 'Ouyos-Aoeuam', target_name: 'Cases-Ugumlos', expires_at_ms: AHORA + 60_000 },
  ]);

  const { caminos, mapasZonaNegra } = await servicio.resumen();
  assert.equal(caminos.find((c) => c.nombre === 'Ouyos-Aoeuam').conexiones, 1);
  assert.equal(caminos.find((c) => c.nombre === 'Ouyos-Aoeuam').etiqueta, 'Real');
  assert.equal(mapasZonaNegra[0].conexiones, 0);
});

test('usa caché: la fuente no se consulta en cada petición', async () => {
  const { servicio, llamadas } = crearServicio([]);
  await Promise.all([servicio.resumen(), servicio.resumen(), servicio.detalle('Cases-Ugumlos')]);
  assert.equal(llamadas(), 1);
});

test('si la fuente falla, conserva la última respuesta buena y avisa', async () => {
  let reloj = AHORA;
  let fallar = false;
  const servicio = new TrackingService({
    catalogo: CATALOGO,
    mapaRepository: mapasFalsos,
    ttlMs: 1000,
    ahora: () => reloj,
    obtenerEnVivo: async () => {
      if (fallar) throw new Error('caída');
      return { ok: true, roads: [{ id: 'x', source_map_name: 'Ouyos-Aoeuam', target_name: 'Cases-Ugumlos', expires_at_ms: AHORA + 60_000 }] };
    },
  });

  assert.equal((await servicio.resumen()).conexiones.length, 1);

  fallar = true;
  reloj += 5000;
  const trasFallo = await servicio.resumen();
  assert.equal(trasFallo.conexiones.length, 1);
  assert.match(trasFallo.estado.error, /No se pudo consultar/);
});

test('ignora datos malformados de la fuente', async () => {
  const { servicio } = crearServicio([null, 42, { id: 'sin-extremos' }, { source_map_name: 'x'.repeat(500), target_name: 'Cases-Ugumlos' }]);
  const { conexiones } = await servicio.resumen();
  assert.equal(conexiones.length, 1);
  assert.equal(conexiones[0].origen.nombre.length, 80, 'los textos externos se recortan');
  assert.equal(conexiones[0].cierraEn, null);
});

// ------------------------------------------------ conexiones del gremio --

const ReportesCaminosService = require('../src/services/ReportesCaminosService');
const ConexionReportadaRepository = require('../src/repositories/ConexionReportadaRepository');
const AuthService = require('../src/services/AuthService');

const ZONAS = [
  { id: 'TNL-001', nombre: 'Ouyos-Aoeuam', grupo: 'avalon' },
  { id: 'TNL-045', nombre: 'Cases-Ugumlos', grupo: 'avalon' },
  { id: '0337', nombre: 'Deepwood Copse', grupo: 'zonaNegra' },
  { id: '3004', nombre: 'Martlock', grupo: 'ciudad' },
  { id: '1000', nombre: 'Lymhurst', grupo: 'ciudad' },
];

let autor;
let otro;
let admin;
test.before(() => {
  const auth = new AuthService();
  autor = auth.registrar({ usuario: 'explorador', clave: 'ClaveSegura99' });
  otro = auth.registrar({ usuario: 'curioso', clave: 'ClaveSegura99' });
  admin = auth.registrar({ usuario: 'jefa', clave: 'ClaveSegura99', rol: 'ADMIN' });
});

function limpiarReportes() {
  require('../src/config/database').getConnection().exec('DELETE FROM conexiones_reportadas');
}

function servicioReportes(reloj = () => AHORA) {
  return new ReportesCaminosService({ zonas: ZONAS, ahora: reloj });
}

test('registra conexiones con el nombre oficial y calcula el cierre', () => {
  limpiarReportes();
  const r = servicioReportes().registrar(autor.id, [{ origen: 'ouyos-aoeuam', destino: 'MARTLOCK', minutos: 200 }]);

  assert.equal(r.creadas, 1);
  assert.equal(r.conexiones[0].origen, 'Ouyos-Aoeuam');
  assert.equal(r.conexiones[0].destino, 'Martlock');
  assert.equal(r.conexiones[0].cierraEn, new Date(AHORA + 200 * 60_000).toISOString());
  assert.equal(r.conexiones[0].usuario, 'explorador');
});

test('rechaza zonas desconocidas, iguales, sin camino o tiempos imposibles', () => {
  limpiarReportes();
  const s = servicioReportes();
  const casos = [
    [{ origen: 'Narnia', destino: 'Martlock', minutos: 10 }, /no es una zona/],
    [{ origen: 'Ouyos-Aoeuam', destino: 'Ouyos-Aoeuam', minutos: 10 }, /misma zona/],
    [{ origen: 'Martlock', destino: 'Lymhurst', minutos: 10 }, /camino de Avalon/],
    [{ origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 0 }, /entre 1 minuto y 24 horas/],
    [{ origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 1441 }, /entre 1 minuto y 24 horas/],
    [{ origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: '30' }, /entre 1 minuto y 24 horas/],
  ];
  for (const [conexion, mensaje] of casos) {
    assert.throws(() => s.registrar(autor.id, [conexion]), mensaje);
  }
  assert.throws(() => s.registrar(autor.id, []), /ninguna conexión/);
  assert.throws(() => s.registrar(autor.id, Array(21).fill({ origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 5 })), /Como máximo 20/);

  // Si una falla, no se guarda ninguna.
  assert.throws(() => s.registrar(autor.id, [
    { origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 30 },
    { origen: 'Narnia', destino: 'Martlock', minutos: 30 },
  ]), /Conexión 2/);
  assert.equal(new ConexionReportadaRepository().listarVigentes(new Date(AHORA).toISOString()).length, 0);
});

test('la misma conexión en cualquier sentido se actualiza en vez de duplicarse', () => {
  limpiarReportes();
  const s = servicioReportes();
  s.registrar(autor.id, [{ origen: 'Ouyos-Aoeuam', destino: 'Deepwood Copse', minutos: 60 }]);
  const r = s.registrar(otro.id, [{ origen: 'Deepwood Copse', destino: 'Ouyos-Aoeuam', minutos: 50 }]);

  assert.equal(r.actualizadas, 1);
  const vigentes = new ConexionReportadaRepository().listarVigentes(new Date(AHORA).toISOString());
  assert.equal(vigentes.length, 1);
  assert.equal(vigentes[0].usuario, 'curioso');
  assert.equal(vigentes[0].cierraEn, new Date(AHORA + 50 * 60_000).toISOString());
});

test('solo el autor o un administrador pueden borrar una conexión', () => {
  limpiarReportes();
  const s = servicioReportes();
  const [propia, ajena] = s.registrar(autor.id, [
    { origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 60 },
    { origen: 'Cases-Ugumlos', destino: 'Lymhurst', minutos: 60 },
  ]).conexiones;

  assert.throws(() => s.eliminar(otro, propia.id), (e) => e.estado === 403);
  s.eliminar(autor, propia.id);
  s.eliminar(admin, ajena.id);
  assert.throws(() => s.eliminar(autor, ajena.id), (e) => e.estado === 404);
});

test('las conexiones del gremio se mezclan con smugden sin duplicarse', async () => {
  limpiarReportes();
  servicioReportes().registrar(autor.id, [
    { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 60 },
    { origen: 'Cases-Ugumlos', destino: 'Martlock', minutos: 90 },
  ]);

  const { servicio } = crearServicio([
    // La misma conexión que ya reportó el gremio (cierre a 5 min de diferencia): se descarta.
    { id: 'dup', source_map_name: 'Cases-Ugumlos', target_name: 'Ouyos-Aoeuam', expires_at_ms: AHORA + 65 * 60_000 },
    { id: 'nueva', source_map_name: 'Ouyos-Aoeuam', target_cluster_id: '0337', expires_at_ms: AHORA + 30 * 60_000 },
  ], { zonas: ZONAS });

  const { conexiones, estado } = await servicio.resumen();
  assert.deepEqual(conexiones.map((c) => c.fuente), ['smugden', 'gremio', 'gremio']);
  assert.equal(estado.delGremio, 2);
  assert.equal(estado.activas, 3);

  const martlock = conexiones.find((c) => c.destino.nombre === 'Martlock');
  assert.equal(martlock.destino.etiqueta, 'Ciudad', 'las zonas fuera del catálogo llevan su tipo');
  assert.equal(martlock.reportadoPor, 'explorador');

  const detalle = await servicio.detalle('Martlock');
  assert.equal(detalle.ok, true);
  assert.equal(detalle.conexiones[0].fuente, 'gremio');
  assert.equal(detalle.conexiones[0].reportadoPor, 'explorador');

  // Pasado el cierre, deja de mostrarse.
  const { servicio: despues } = crearServicio([], { zonas: ZONAS, ahora: () => AHORA + 120 * 60_000 });
  assert.equal((await despues.resumen()).estado.delGremio, 0);
});
