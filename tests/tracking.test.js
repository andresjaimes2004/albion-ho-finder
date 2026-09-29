'use strict';

/**
 * Pruebas del seguimiento de caminos de Avalon. Las conexiones salen
 * solo de lo que registran los usuarios (base temporal) y del catálogo
 * oficial: el servicio nunca consulta APIs externas.
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

function crearServicio(opciones = {}) {
  const servicio = new TrackingService({
    catalogo: CATALOGO,
    mapaRepository: mapasFalsos,
    zonas: ZONAS,
    ahora: () => AHORA,
    ...opciones,
  });
  return { servicio };
}

test.after(() => {
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_TEMPORAL}${sufijo}`, { force: true });
  }
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
  require('../src/config/database').getConnection().exec('DELETE FROM rutas_reportadas; DELETE FROM conexiones_reportadas;');
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
  assert.throws(() => s.registrar(autor.id, Array(101).fill({ origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 5 })), /Como máximo 100/);

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

test('no consulta ninguna API externa', async () => {
  limpiarReportes();
  const fetchOriginal = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => {
    llamadas += 1;
    throw new Error('sin red');
  };
  try {
    const { servicio } = crearServicio();
    await Promise.all([servicio.resumen(), servicio.detalle('Cases-Ugumlos'), servicio.paraMapas(['Deepwood Copse'])]);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  assert.equal(llamadas, 0);
});

test('muestra las conexiones del gremio con nombres oficiales, ordenadas por cierre', async () => {
  limpiarReportes();
  servicioReportes().registrar(autor.id, [
    { origen: 'Cases-Ugumlos', destino: 'Martlock', minutos: 90 },
    { origen: 'deepwood copse', destino: 'OUYOS-AOEUAM', minutos: 30 },
    { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 60 },
  ]);

  const { servicio } = crearServicio();
  const { conexiones, estado } = await servicio.resumen();
  assert.deepEqual(conexiones.map((c) => (c.cierraEn - AHORA) / 60_000), [30, 60, 90]);
  assert.ok(conexiones.every((c) => c.fuente === 'gremio'));
  assert.equal(estado.activas, 3);

  const [primera] = conexiones;
  assert.equal(primera.origen.nombre, 'Deepwood Copse');
  assert.equal(primera.origen.clase, 'zonaNegra');
  assert.equal(primera.destino.nombre, 'Ouyos-Aoeuam');
  assert.equal(primera.destino.clase, 'avalon');
  assert.equal(primera.reportadoPor, 'explorador');

  const martlock = conexiones.find((c) => c.destino.nombre === 'Martlock');
  assert.equal(martlock.destino.etiqueta, 'Ciudad', 'las zonas fuera del catálogo llevan su tipo');

  // Pasado el cierre, deja de mostrarse.
  const { servicio: despues } = crearServicio({ ahora: () => AHORA + 45 * 60_000 });
  assert.equal((await despues.resumen()).estado.activas, 2);
});

test('el detalle de un mapa lista sus conexiones en ambos sentidos', async () => {
  limpiarReportes();
  servicioReportes().registrar(autor.id, [
    { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 1 },
    { origen: 'Deepwood Copse', destino: 'Ouyos-Aoeuam', minutos: 2 },
  ]);
  const { servicio } = crearServicio();

  const detalle = await servicio.detalle('ouyos aoeuam');
  assert.equal(detalle.ok, true);
  assert.equal(detalle.mapa.clase, 'avalon');
  assert.equal(detalle.mapa.camino.tier, 4);
  assert.deepEqual(
    detalle.conexiones.map((c) => [c.sentido, c.hacia.nombre]),
    [['salida', 'Cases-Ugumlos'], ['entrada', 'Deepwood Copse']]
  );

  const zonaNegra = await servicio.detalle('Deepwood Copse');
  assert.equal(zonaNegra.mapa.clase, 'zonaNegra');
  assert.equal(zonaNegra.conexiones.length, 1);

  const inexistente = await servicio.detalle('No Existe');
  assert.equal(inexistente.ok, false);
});

test('el resumen cuenta las conexiones de cada camino', async () => {
  limpiarReportes();
  servicioReportes().registrar(autor.id, [{ origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 60 }]);
  const { servicio } = crearServicio();

  const { caminos, mapasZonaNegra } = await servicio.resumen();
  assert.equal(caminos.find((c) => c.nombre === 'Ouyos-Aoeuam').conexiones, 1);
  assert.equal(caminos.find((c) => c.nombre === 'Ouyos-Aoeuam').etiqueta, 'Real');
  assert.equal(mapasZonaNegra[0].conexiones, 0);
});

// ---------------------------------------------------------------- rutas --

const RUTA = [
  // Tramos en cualquier sentido: el servicio los orienta según la ruta.
  { origen: 'Ouyos-Aoeuam', destino: 'Deepwood Copse', minutos: 120 },
  { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 45 },
  { origen: 'Martlock', destino: 'Cases-Ugumlos', minutos: 300 },
];

test('registra una ruta encadenada y orienta sus tramos', () => {
  limpiarReportes();
  const r = servicioReportes().registrar(autor.id, RUTA, [[0, 1, 2]]);

  assert.equal(r.creadas, 3);
  assert.equal(r.rutas.length, 1);
  assert.deepEqual(r.rutas[0].zonas, ['Deepwood Copse', 'Ouyos-Aoeuam', 'Cases-Ugumlos', 'Martlock']);
  assert.deepEqual(r.rutas[0].conexionIds, r.conexiones.map((c) => c.id));
  assert.equal(r.rutas[0].usuario, 'explorador');
});

test('rechaza rutas que no se encadenan o repiten zonas, sin guardar nada', () => {
  limpiarReportes();
  const s = servicioReportes();
  const casos = [
    [[0, 2], /no continúa desde/],
    [[0], /al menos dos tramos/],
    [[0, 0], /repite un tramo/],
    [[0, 9], /no existe/],
  ];
  for (const [ruta, mensaje] of casos) assert.throws(() => s.registrar(autor.id, RUTA, [ruta]), mensaje);

  // Deepwood Copse → Ouyos → Cases → Ouyos: vuelve a una zona ya visitada.
  const vuelta = [...RUTA, { origen: 'Cases-Ugumlos', destino: 'Ouyos-Aoeuam', minutos: 30 }];
  assert.throws(() => s.registrar(autor.id, vuelta, [[0, 1, 3]]), /dos veces por la misma zona/);
  assert.equal(new ConexionReportadaRepository().listarVigentes(new Date(AHORA).toISOString()).length, 0);
});

test('la misma ruta registrada otra vez (incluso al revés) se actualiza, no se duplica', () => {
  limpiarReportes();
  const s = servicioReportes();
  const primera = s.registrar(autor.id, RUTA, [[0, 1, 2]]).rutas[0];
  const segunda = s.registrar(otro.id, [...RUTA].reverse(), [[0, 1, 2]]).rutas[0];

  assert.equal(segunda.id, primera.id);
  assert.deepEqual(segunda.zonas, primera.zonas, 'conserva el sentido original');
  assert.equal(segunda.usuario, 'curioso');
});

test('las rutas aparecen en el resumen, en la ficha y en la vista de hideouts mientras sigan abiertas', async () => {
  limpiarReportes();
  servicioReportes().registrar(autor.id, RUTA, [[0, 1, 2]]);
  const { servicio } = crearServicio();

  const { rutas } = await servicio.resumen();
  assert.equal(rutas.length, 1);
  assert.deepEqual(rutas[0].zonas.map((z) => z.nombre), ['Deepwood Copse', 'Ouyos-Aoeuam', 'Cases-Ugumlos', 'Martlock']);
  assert.equal(rutas[0].cierraEn, AHORA + 45 * 60_000, 'cierra con su primer tramo');
  assert.deepEqual(rutas[0].tramos.map((t) => (t.cierraEn - AHORA) / 60_000), [120, 45, 300]);

  const ficha = await servicio.detalle('Martlock');
  assert.equal(ficha.rutas.length, 1);

  const hideouts = await servicio.paraMapas(['Deepwood Copse', 'Lymhurst']);
  assert.deepEqual(Object.keys(hideouts.mapas), ['Deepwood Copse']);
  assert.equal(hideouts.mapas['Deepwood Copse'].rutas.length, 1);
  assert.equal(hideouts.mapas['Deepwood Copse'].conexiones[0].hacia.nombre, 'Ouyos-Aoeuam');

  // Cuando cierra un tramo, la ruta deja de mostrarse.
  const { servicio: despues } = crearServicio({ ahora: () => AHORA + 60 * 60_000 });
  assert.equal((await despues.resumen()).rutas.length, 0);
});

test('borrar una ruta quita sus tramos exclusivos y conserva los compartidos', async () => {
  limpiarReportes();
  const s = servicioReportes();
  const larga = s.registrar(autor.id, RUTA, [[0, 1, 2]]).rutas[0];
  const corta = s.registrar(otro.id, RUTA.slice(0, 2), [[0, 1]]).rutas[0];

  assert.throws(() => s.eliminarRuta(otro, larga.id), (e) => e.estado === 403);
  s.eliminarRuta(autor, larga.id);

  const vigentes = new ConexionReportadaRepository().listarVigentes(new Date(AHORA).toISOString());
  assert.equal(vigentes.length, 2, 'se borró solo el tramo Cases-Ugumlos – Martlock');
  const { servicio } = crearServicio();
  assert.deepEqual((await servicio.resumen()).rutas.map((r) => r.id), [corta.id]);

  // Si se borra una conexión suelta que usaba una ruta, la ruta desaparece.
  s.eliminar(admin, vigentes[0].id);
  assert.equal((await servicio.resumen()).rutas.length, 0);
});

test('guarda en un envío varias rutas que comparten tramos (bifurcaciones)', async () => {
  limpiarReportes();
  const conexiones = [
    { origen: 'Deepwood Copse', destino: 'Ouyos-Aoeuam', minutos: 120 },
    { origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 90 },
    { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 60 },
    { origen: 'Cases-Ugumlos', destino: 'Lymhurst', minutos: 200 },
  ];
  // Desde Ouyos el portal lleva a Martlock y a Cases → Lymhurst: tres rutas.
  const r = servicioReportes().registrar(autor.id, conexiones, [[0, 1], [0, 2, 3], [1, 2, 3]]);
  assert.equal(r.creadas, 4, 'cada portal se guarda una sola vez');
  assert.deepEqual(r.rutas.map((x) => x.zonas.join(' > ')), [
    'Deepwood Copse > Ouyos-Aoeuam > Martlock',
    'Deepwood Copse > Ouyos-Aoeuam > Cases-Ugumlos > Lymhurst',
    'Martlock > Ouyos-Aoeuam > Cases-Ugumlos > Lymhurst',
  ]);

  const { servicio } = crearServicio();
  const { rutas } = await servicio.resumen();
  assert.equal(rutas.length, 3);
  const deepwood = await servicio.paraMapas(['Deepwood Copse']);
  assert.equal(deepwood.mapas['Deepwood Copse'].rutas.length, 2, 'el mapa de Zona Negra aparece en sus dos rutas');
});

test('una ruta nueva puede continuar desde conexiones ya guardadas (sin volver a subir sus capturas)', async () => {
  limpiarReportes();
  const s = servicioReportes();
  // Primer envío: Deepwood Copse → Ouyos-Aoeuam, todavía sin salida.
  const primera = s.registrar(autor.id, [{ origen: 'Deepwood Copse', destino: 'Ouyos-Aoeuam', minutos: 120 }]);
  const guardadaId = primera.conexiones[0].id;

  // Más tarde, otro miembro captura los portales que siguen.
  const r = s.registrar(
    otro.id,
    [
      { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 45 },
      { origen: 'Cases-Ugumlos', destino: 'Martlock', minutos: 300 },
    ],
    [[{ id: guardadaId }, 0, 1]]
  );
  assert.equal(r.creadas, 2);
  assert.deepEqual(r.rutas[0].zonas, ['Deepwood Copse', 'Ouyos-Aoeuam', 'Cases-Ugumlos', 'Martlock']);
  assert.equal(r.rutas[0].conexionIds[0], guardadaId, 'reutiliza la conexión guardada');

  const { servicio } = crearServicio();
  assert.equal((await servicio.resumen()).rutas.length, 1);

  // Una conexión guardada que ya cerró (o no existe) no puede usarse.
  const tarde = servicioReportes(() => AHORA + 130 * 60_000);
  assert.throws(
    () => tarde.registrar(autor.id, [{ origen: 'Cases-Ugumlos', destino: 'Martlock', minutos: 30 }], [[{ id: guardadaId }, 0]]),
    /ya cerró o se borró/
  );
  assert.throws(() => s.registrar(autor.id, RUTA, [[{ id: 999999 }, 0]]), /ya cerró o se borró/);
  assert.throws(() => s.registrar(autor.id, RUTA, [[{ id: guardadaId }, { id: guardadaId }]]), /repite un tramo/);
});

// ------------------------------------------------ rutas que se cierran --

const { clasificarRutas, VENTANA_CERRADAS_MS } = require('../src/services/estadoRutas');

test('clasifica las rutas: abiertas, cerradas hace poco (30 min) y expiradas', () => {
  const MIN = 60_000;
  const cierres = new Map([[1, 100 * MIN], [2, 10 * MIN], [3, 200 * MIN], [4, 300 * MIN], [5, 50 * MIN]]);
  const ahora = 20 * MIN;
  const rutas = [
    { id: 'abierta', conexionIds: [1, 3] },
    { id: 'rota', conexionIds: [1, 2, 3, 4] }, // cerró el tramo 2 (índice 1) hace 10 min
    { id: 'sin-tramo', conexionIds: [1, 99] },
  ];
  const r = clasificarRutas(rutas, cierres, ahora);
  assert.deepEqual(r.activas.map((x) => x.id), ['abierta']);
  assert.equal(r.cerradas.length, 1);
  assert.equal(r.cerradas[0].indiceCierre, 1);
  assert.equal(r.cerradas[0].cerradaEn, 10 * MIN);
  // 3 y 4 venían después del portal cerrado; 3 sigue en una ruta abierta.
  assert.deepEqual([...r.desconectadas], [4]);

  const tarde = clasificarRutas(rutas, cierres, 10 * MIN + VENTANA_CERRADAS_MS);
  assert.equal(tarde.cerradas.length, 0);
  assert.deepEqual(tarde.expiradas.map((e) => [e.ruta.id, e.siguientes]), [['rota', [3, 4]]]);
});

test('al cerrar un portal la ruta se ve 30 min como cerrada y los tramos siguientes dejan de contar', async () => {
  limpiarReportes();
  // Deepwood Copse → Ouyos (120 min) → Cases (45 min) → Martlock (300 min).
  servicioReportes().registrar(autor.id, RUTA, [[0, 1, 2]]);

  // 50 min después cerró Ouyos–Cases.
  const { servicio } = crearServicio({ ahora: () => AHORA + 50 * 60_000 });
  const resumen = await servicio.resumen();
  assert.equal(resumen.rutas.length, 0);
  assert.equal(resumen.rutasCerradas.length, 1);
  const cerrada = resumen.rutasCerradas[0];
  assert.deepEqual(cerrada.tramos.map((t) => t.estado), ['abierto', 'cerrado', 'desconectado']);
  assert.equal(cerrada.borraEn, AHORA + 45 * 60_000 + VENTANA_CERRADAS_MS);
  assert.deepEqual(
    resumen.conexiones.map((c) => `${c.origen.nombre}-${c.destino.nombre}`),
    ['Ouyos-Aoeuam-Deepwood Copse'],
    'Cases–Martlock queda desconectada aunque su portal siga abierto'
  );

  // El mantenimiento no borra nada dentro de la ventana...
  servicio.mantenimiento();
  assert.equal((await servicio.resumen()).rutasCerradas.length, 1);

  // ...y pasada la ventana borra la ruta y el tramo siguiente, no el anterior.
  const { servicio: despues } = crearServicio({ ahora: () => AHORA + 80 * 60_000 });
  const borrado = despues.mantenimiento();
  assert.equal(borrado.rutas, 1);
  const quedan = new ConexionReportadaRepository().listarDesde('').map((c) => `${c.origen}-${c.destino}`);
  assert.deepEqual(quedan, ['Ouyos-Aoeuam-Deepwood Copse']);
  const final = await despues.resumen();
  assert.equal(final.rutasCerradas.length, 0);
  assert.equal(final.conexiones.length, 1);
});

test('un tramo desconectado sigue visible si otra ruta abierta lo usa', async () => {
  limpiarReportes();
  const conexiones = [
    { origen: 'Deepwood Copse', destino: 'Ouyos-Aoeuam', minutos: 120 },
    { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 20 }, // cierra pronto
    { origen: 'Cases-Ugumlos', destino: 'Martlock', minutos: 300 },
    { origen: 'Cases-Ugumlos', destino: 'Lymhurst', minutos: 300 },
  ];
  // Rutas: Deepwood → Ouyos → Cases → Martlock y Lymhurst → Cases → Martlock.
  servicioReportes().registrar(autor.id, conexiones, [[0, 1, 2], [3, 2]]);
  const { servicio } = crearServicio({ ahora: () => AHORA + 30 * 60_000 });
  const resumen = await servicio.resumen();
  assert.equal(resumen.rutas.length, 1);
  assert.equal(resumen.rutasCerradas.length, 1);
  assert.equal(resumen.conexiones.length, 3, 'Cases–Martlock sigue: la usa la ruta abierta');

  const { servicio: despues } = crearServicio({ ahora: () => AHORA + 60 * 60_000 });
  despues.mantenimiento();
  assert.equal((await despues.resumen()).rutas.length, 1, 'la otra ruta sigue intacta');
  assert.equal(new ConexionReportadaRepository().listarDesde('').length, 3);
});
