'use strict';

/**
 * Espacios privados: quién puede crear, agregar y salir, límites, y sobre
 * todo que lo privado no se filtra a quien no es miembro (ni al
 * deduplicar, ni al encadenar rutas, ni a un administrador, ni en los
 * borrados masivos).
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-espacios-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;

const EspaciosService = require('../src/services/EspaciosService');
const TrackingService = require('../src/services/TrackingService');
const ReportesCaminosService = require('../src/services/ReportesCaminosService');
const AuthService = require('../src/services/AuthService');

const AHORA = Date.parse('2026-10-01T12:00:00Z');
const ZONAS = [
  { nombre: 'Ouyos-Aoeuam', grupo: 'avalon' },
  { nombre: 'Cases-Ugumlos', grupo: 'avalon' },
  { nombre: 'Deepwood Copse', grupo: 'zonaNegra' },
  { nombre: 'Martlock', grupo: 'ciudad' },
];
const CATALOGO = {
  caminos: [
    { id: 'TNL-001', nombre: 'Ouyos-Aoeuam', tipo: 'TUNNEL_ROYAL', tier: 4, recursos: [], dungeons: { solo: 0, grupo: 0, elite: 0 } },
    { id: 'TNL-045', nombre: 'Cases-Ugumlos', tipo: 'TUNNEL_BLACK_LOW', tier: 6, recursos: [], dungeons: { solo: 0, grupo: 0, elite: 0 } },
  ],
};

const usuarios = {};
test.before(() => {
  const auth = new AuthService();
  for (const nombre of ['creadora', 'amigo', 'extrano', 'otro1', 'otro2', 'otro3', 'otro4', 'otro5', 'otro6']) {
    usuarios[nombre] = auth.registrar({ usuario: nombre, clave: 'ClaveSegura99' });
  }
  usuarios.admin = auth.registrar({ usuario: 'jefatura', clave: 'ClaveSegura99', rol: 'ADMIN' });
});

test.after(() => {
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(`${DB_TEMPORAL}${sufijo}`, { force: true });
});

function limpiar() {
  require('../src/config/database')
    .getConnection()
    .exec('DELETE FROM rutas_reportadas; DELETE FROM conexiones_reportadas; DELETE FROM espacios;');
}

const espacios = () => new EspaciosService();
const reportes = () => new ReportesCaminosService({ zonas: ZONAS, ahora: () => AHORA });
const seguimiento = () =>
  new TrackingService({
    catalogo: CATALOGO,
    mapaRepository: { listarResumenGeo: () => [{ nombre: 'Deepwood Copse', tier: 6 }], listarSalidas: () => [] },
    zonas: ZONAS,
    ahora: () => AHORA,
  });

const RUTA = [
  { origen: 'Deepwood Copse', destino: 'Ouyos-Aoeuam', minutos: 120 },
  { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 90 },
];

// ------------------------------------------------------------ gestión --

test('crear un espacio: nombre válido, el creador es miembro y hay tope de espacios', () => {
  limpiar();
  const s = espacios();
  const { creadora } = usuarios;
  const espacio = s.crear(creadora, { nombre: '  Los   Gankers ' });
  assert.equal(espacio.nombre, 'Los Gankers');
  assert.equal(espacio.publico, false, 'privado por defecto');
  assert.equal(espacio.esCreador, true);
  assert.deepEqual(espacio.miembros.map((m) => m.usuario), ['creadora']);

  assert.throws(() => s.crear(creadora, { nombre: 'ab' }), /al menos 3/);
  assert.throws(() => s.crear(creadora, { nombre: '<b>hola</b>' }), /solo puede tener/);
  assert.throws(() => s.crear(creadora, { nombre: 'Hijos de Puta' }), /no está permitido/);
  assert.throws(() => s.crear(creadora, { nombre: 'Farmers', publico: 'si' }), /verdadero o falso/);

  s.crear(creadora, { nombre: 'Farmers' });
  s.crear(creadora, { nombre: 'Transporte', publico: true });
  assert.throws(() => s.crear(creadora, { nombre: 'Uno Más' }), /como mucho 3 espacios/);
  assert.deepEqual(s.listar(creadora).map((e) => e.nombre), ['Farmers', 'Los Gankers', 'Transporte']);
});

test('solo el creador agrega cuentas, hasta 7 en total; cualquiera puede salir', () => {
  limpiar();
  const s = espacios();
  const { creadora, amigo, extrano } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });

  assert.equal(s.agregarMiembro(creadora, espacio.id, 'AMIGO').miembros.length, 2, 'el nombre sin mayúsculas');
  assert.throws(() => s.agregarMiembro(creadora, espacio.id, 'amigo'), /ya está en el espacio/);
  assert.throws(() => s.agregarMiembro(creadora, espacio.id, 'nadie_existe'), /No existe ninguna cuenta/);
  assert.throws(() => s.agregarMiembro(amigo, espacio.id, 'otro1'), (e) => e.estado === 403, 'un miembro no agrega');
  assert.throws(() => s.agregarMiembro(extrano, espacio.id, 'otro1'), (e) => e.estado === 404, 'quien no es miembro no ve el espacio');

  for (const nombre of ['otro1', 'otro2', 'otro3', 'otro4', 'otro5']) s.agregarMiembro(creadora, espacio.id, nombre);
  assert.equal(s.listar(creadora)[0].miembros.length, 7);
  assert.throws(() => s.agregarMiembro(creadora, espacio.id, 'otro6'), /ya tiene 7 cuentas/);

  // Salir, quitar y el creador no puede salir.
  assert.equal(s.quitarMiembro(amigo, espacio.id, amigo.id), null);
  assert.equal(s.listar(amigo).length, 0);
  assert.throws(() => s.quitarMiembro(usuarios.otro1, espacio.id, usuarios.otro2.id), (e) => e.estado === 403);
  assert.equal(s.quitarMiembro(creadora, espacio.id, usuarios.otro2.id).miembros.length, 5);
  assert.throws(() => s.quitarMiembro(creadora, espacio.id, creadora.id), /puede borrarlo/);

  assert.throws(() => s.actualizar(usuarios.otro1, espacio.id, { publico: true }), (e) => e.estado === 403);
  assert.equal(s.actualizar(creadora, espacio.id, { nombre: 'Gank Squad 2', publico: true }).publico, true);
  assert.throws(() => s.eliminar(usuarios.otro1, espacio.id), (e) => e.estado === 403);
});

// --------------------------------------------------------- visibilidad --

test('lo privado solo lo ven sus miembros: ni otros usuarios, ni visitantes, ni un administrador', async () => {
  limpiar();
  const s = espacios();
  const { creadora, amigo, extrano, admin } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });
  s.agregarMiembro(creadora, espacio.id, 'amigo');
  reportes().registrar(creadora.id, RUTA, [[0, 1]], { espacioId: espacio.id });
  reportes().registrar(extrano.id, [{ origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 60 }]);

  const t = seguimiento();
  const deAmigo = await t.resumen(s.visor(amigo));
  assert.equal(deAmigo.rutas.length, 1);
  assert.equal(deAmigo.conexiones.length, 3);
  assert.deepEqual(deAmigo.rutas[0].espacio, { id: espacio.id, nombre: 'Gank Squad', publico: false, miembro: true });

  for (const visor of [s.visor(extrano), s.visor(null), s.visor(admin), EspaciosService.VISOR_PUBLICO]) {
    const r = await t.resumen(visor);
    assert.equal(r.rutas.length, 0);
    assert.deepEqual(r.conexiones.map((c) => c.destino.nombre), ['Martlock'], 'solo la pública');
    assert.equal(r.caminos.find((c) => c.nombre === 'Cases-Ugumlos').conexiones, 0, 'ni en los conteos');
    const ficha = await t.detalle('Cases-Ugumlos', visor);
    assert.deepEqual([ficha.conexiones.length, ficha.rutas.length], [0, 0]);
    assert.deepEqual((await t.paraMapas(['Deepwood Copse'], visor)).mapas, {});
  }

  // Con "Permitir que los demás vean las conexiones", lo ve todo el mundo.
  s.actualizar(creadora, espacio.id, { publico: true });
  const abierto = await t.resumen(s.visor(null));
  assert.equal(abierto.rutas.length, 1);
  assert.deepEqual(abierto.rutas[0].espacio, { id: espacio.id, nombre: 'Gank Squad', publico: true, miembro: false });
});

test('solo los miembros registran en un espacio', () => {
  limpiar();
  const s = espacios();
  const espacio = s.crear(usuarios.creadora, { nombre: 'Farmers' });
  assert.throws(() => s.espacioParaRegistrar(usuarios.extrano, espacio.id), (e) => e.estado === 404);
  assert.throws(() => s.espacioParaRegistrar(usuarios.creadora, 'uno'), /no es válido/);
  assert.equal(s.espacioParaRegistrar(usuarios.creadora, null), null);
  // El servicio de registro lo comprueba también (defensa en profundidad).
  assert.throws(() => reportes().registrar(usuarios.extrano.id, RUTA, [], { espacioId: espacio.id }), (e) => e.estado === 404);
});

test('al deduplicar nunca se toca una conexión o ruta de otro espacio', async () => {
  limpiar();
  const s = espacios();
  const { creadora, extrano } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });
  const privado = reportes().registrar(creadora.id, RUTA, [[0, 1]], { espacioId: espacio.id });
  // Otra persona registra lo mismo en público: se crea aparte, no "actualiza" lo privado.
  const publico = reportes().registrar(extrano.id, RUTA, [[0, 1]]);
  assert.equal(publico.creadas, 2);
  assert.equal(publico.actualizadas, 0);
  assert.notEqual(publico.rutas[0].id, privado.rutas[0].id);

  const delMiembro = await seguimiento().resumen(s.visor(creadora));
  assert.equal(delMiembro.rutas.length, 2, 'el miembro ve la suya y la pública');
  const t = await seguimiento().resumen(s.visor(extrano));
  assert.equal(t.rutas.length, 1);
  assert.equal(t.rutas[0].reportadoPor, 'extrano', 'la ruta privada sigue siendo de su autora');

  // Repetirla en el espacio sí actualiza la privada.
  const otraVez = reportes().registrar(creadora.id, RUTA, [[0, 1]], { espacioId: espacio.id });
  assert.equal(otraVez.actualizadas, 2);
  assert.equal(otraVez.rutas[0].id, privado.rutas[0].id);
});

test('una ruta no mezcla conexiones públicas, privadas ni de espacios distintos', () => {
  limpiar();
  const s = espacios();
  const { creadora, extrano } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });
  const otroEspacio = s.crear(creadora, { nombre: 'Farmers' });
  const privada = reportes().registrar(creadora.id, [RUTA[0]], [], { espacioId: espacio.id }).conexiones[0];
  const publica = reportes().registrar(extrano.id, [RUTA[0]]).conexiones[0];
  const siguiente = [RUTA[1]];

  // Quien no es miembro: la conexión privada "no existe".
  assert.throws(() => reportes().registrar(extrano.id, siguiente, [[{ id: privada.id }, 0]]), /ya cerró o se borró/);
  // La miembro: no se pueden mezclar.
  assert.throws(() => reportes().registrar(creadora.id, siguiente, [[{ id: privada.id }, 0]]), /no se pueden mezclar/);
  assert.throws(() => reportes().registrar(creadora.id, siguiente, [[{ id: publica.id }, 0]], { espacioId: espacio.id }), /no se pueden mezclar/);
  assert.throws(() => reportes().registrar(creadora.id, siguiente, [[{ id: privada.id }, 0]], { espacioId: otroEspacio.id }), /no se pueden mezclar/);
  // En el mismo espacio, sí.
  const bien = reportes().registrar(creadora.id, siguiente, [[{ id: privada.id }, 0]], { espacioId: espacio.id });
  assert.equal(bien.rutas.length, 1);
});

test('editar o borrar algo privado: para quien no es miembro no existe, aunque sea administrador', () => {
  limpiar();
  const s = espacios();
  const { creadora, admin } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });
  const r = reportes().registrar(creadora.id, RUTA, [[0, 1]], { espacioId: espacio.id });
  const rutaId = r.rutas[0].id;

  assert.throws(() => reportes().editarRuta(admin, rutaId, RUTA), (e) => e.estado === 404);
  assert.throws(() => reportes().eliminarRuta(admin, rutaId), (e) => e.estado === 404);
  assert.throws(() => reportes().eliminar(admin, r.conexiones[0].id), (e) => e.estado === 404);

  // Al editarla, sus conexiones nuevas siguen en el espacio.
  const editada = reportes().editarRuta(creadora, rutaId, [...RUTA, { origen: 'Cases-Ugumlos', destino: 'Martlock', minutos: 30 }]);
  assert.equal(editada.espacioId, espacio.id);
  const conexiones = new (require('../src/repositories/ConexionReportadaRepository'))();
  assert.ok(editada.conexionIds.every((id) => conexiones.obtener(id).espacioId === espacio.id));
});

test('los borrados masivos del administrador no tocan los espacios privados', async () => {
  limpiar();
  const s = espacios();
  const { creadora, extrano } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });
  reportes().registrar(creadora.id, RUTA, [[0, 1]], { espacioId: espacio.id });
  reportes().registrar(extrano.id, RUTA, [[0, 1]]);
  reportes().registrar(extrano.id, [{ origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 60 }]);

  const t = seguimiento();
  assert.deepEqual(t.borrarRutas({ alcance: 'todas', visor: s.visor(null) }), { rutas: 1, conexiones: 3 });
  const miembro = await t.resumen(s.visor(creadora));
  assert.equal(miembro.rutas.length, 1, 'la privada sigue ahí');
  assert.equal(miembro.conexiones.length, 2);
});

test('borrar el espacio borra sus conexiones y rutas', async () => {
  limpiar();
  const s = espacios();
  const { creadora } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });
  reportes().registrar(creadora.id, RUTA, [[0, 1]], { espacioId: espacio.id });
  s.eliminar(creadora, espacio.id);
  const db = require('../src/config/database').getConnection();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conexiones_reportadas').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rutas_reportadas').get().n, 0);
  assert.equal(s.listar(creadora).length, 0);
});

// ------------------------------------------------- avisos y contactos --

test('cada cambio de membresía deja un aviso solo a quien le afecta', () => {
  limpiar();
  const db = require('../src/config/database').getConnection();
  db.exec('DELETE FROM avisos; DELETE FROM espacio_contactos;');
  const AvisoRepository = require('../src/repositories/AvisoRepository');
  const avisos = new AvisoRepository();
  const s = espacios();
  const { creadora, amigo, extrano } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });

  s.agregarMiembro(creadora, espacio.id, 'amigo');
  const agregado = avisos.listarNoLeidos(amigo.id);
  assert.deepEqual(agregado.map((a) => [a.tipo, a.datos.espacio, a.datos.por]), [['ESPACIO_AGREGADO', 'Gank Squad', 'creadora']]);
  assert.equal(avisos.listarNoLeidos(extrano.id).length, 0);

  // Otro usuario no puede marcar como leídos los avisos ajenos.
  assert.equal(avisos.marcarLeidos(extrano.id, [agregado[0].id]), 0);
  assert.equal(avisos.marcarLeidos(amigo.id, [agregado[0].id]), 1);
  assert.equal(avisos.listarNoLeidos(amigo.id).length, 0);

  s.quitarMiembro(creadora, espacio.id, amigo.id);
  assert.equal(avisos.listarNoLeidos(amigo.id)[0].tipo, 'ESPACIO_QUITADO');

  s.agregarMiembro(creadora, espacio.id, 'amigo');
  s.quitarMiembro(amigo, espacio.id, amigo.id);
  assert.deepEqual(avisos.listarNoLeidos(creadora.id).map((a) => [a.tipo, a.datos.usuario]), [['ESPACIO_SALIO', 'amigo']]);

  s.agregarMiembro(creadora, espacio.id, 'amigo');
  s.eliminar(creadora, espacio.id);
  assert.equal(avisos.listarNoLeidos(amigo.id).at(-1).tipo, 'ESPACIO_BORRADO');
});

test('las sugerencias de cuentas son solo las que ese usuario agregó antes', () => {
  limpiar();
  require('../src/config/database').getConnection().exec('DELETE FROM espacio_contactos;');
  const s = espacios();
  const { creadora, amigo, extrano } = usuarios;
  const uno = s.crear(creadora, { nombre: 'Gank Squad' });
  s.agregarMiembro(creadora, uno.id, 'amigo');
  s.agregarMiembro(creadora, uno.id, 'otro1');
  assert.deepEqual(s.contactos(creadora).sort(), ['amigo', 'otro1']);
  assert.deepEqual(s.contactos(amigo), [], 'ser miembro no da acceso a los nombres de los demás');
  assert.deepEqual(s.contactos(extrano), []);

  // Se recuerdan aunque el espacio ya no exista.
  s.eliminar(creadora, uno.id);
  assert.deepEqual(s.contactos(creadora).sort(), ['amigo', 'otro1']);
});

test('editar una ruta puede moverla entre público y un espacio sin duplicarla', async () => {
  limpiar();
  const s = espacios();
  const { creadora, amigo, extrano } = usuarios;
  const espacio = s.crear(creadora, { nombre: 'Gank Squad' });
  s.agregarMiembro(creadora, espacio.id, 'amigo');
  const publica = reportes().registrar(creadora.id, RUTA, [[0, 1]]).rutas[0];
  const db = require('../src/config/database').getConnection();
  const cuantas = () => db.prepare('SELECT COUNT(*) AS n FROM rutas_reportadas').get().n;
  const conexionesPublicas = () => db.prepare('SELECT COUNT(*) AS n FROM conexiones_reportadas WHERE espacio_id IS NULL').get().n;

  // Pública → espacio privado: la misma ruta (mismo id), ahora solo para miembros.
  const movida = reportes().editarRuta(creadora, publica.id, RUTA, { espacioDestino: espacio.id });
  assert.equal(movida.id, publica.id);
  assert.equal(movida.espacioId, espacio.id);
  assert.equal(cuantas(), 1, 'no se duplica');
  assert.equal(conexionesPublicas(), 0, 'sus tramos públicos ya no se usan y se borran');
  assert.equal((await seguimiento().resumen(s.visor(extrano))).rutas.length, 0);
  assert.equal((await seguimiento().resumen(s.visor(amigo))).rutas.length, 1);

  // Sin indicar destino, se queda donde está.
  assert.equal(reportes().editarRuta(creadora, publica.id, RUTA).espacioId, espacio.id);

  // Y de vuelta a público.
  const devuelta = reportes().editarRuta(creadora, publica.id, RUTA, { espacioDestino: null });
  assert.equal(devuelta.espacioId, null);
  assert.equal(cuantas(), 1);
  assert.equal((await seguimiento().resumen(s.visor(extrano))).rutas.length, 1);

  // A un espacio del que no se es miembro: no.
  const ajeno = s.crear(extrano, { nombre: 'Ajeno' });
  assert.throws(() => reportes().editarRuta(creadora, publica.id, RUTA, { espacioDestino: ajeno.id }), (e) => e.estado === 404);
  assert.throws(() => s.espacioParaRegistrar(creadora, ajeno.id), (e) => e.estado === 404);

  // Si en el destino ya hay una ruta con el mismo recorrido, no se mueve (sería un duplicado).
  reportes().registrar(creadora.id, RUTA, [[0, 1]], { espacioId: espacio.id });
  assert.throws(() => reportes().editarRuta(creadora, publica.id, RUTA, { espacioDestino: espacio.id }), /mismo recorrido/);
});
