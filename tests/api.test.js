'use strict';

/**
 * Pruebas de la API HTTP completa: se levanta el servidor real sobre un
 * puerto efímero con una base de datos temporal y se prueban sesiones,
 * CSRF, permisos, historial y el detalle de los mapas.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-api-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;
process.env.NODE_ENV = 'test';

const crearApp = require('../src/app');
const MapaRepository = require('../src/repositories/MapaRepository');
const GremioRepository = require('../src/repositories/GremioRepository');
const HideoutRepository = require('../src/repositories/HideoutRepository');
const TemporadaRepository = require('../src/repositories/TemporadaRepository');
const AuthService = require('../src/services/AuthService');

let servidor;
let base;

const GEO_PRUEBA = {
  id: '9001',
  nombre: 'Deepwood Copse',
  tipo: 'OPENPVP_BLACK_2',
  tier: 6,
  bioma: 'FR',
  faccion: 'KPR',
  cuadrante: 'Q1',
  mundo: [10, 20],
  limites: { min: [-100, -100], max: [100, 100] },
  salidas: [{ pos: [90, 10], destinoId: '9002', destino: 'Battlebrae Lake', tipo: 'Primary' }],
  caminos: { nodos: [[0, 0], [10, 10]], enlaces: [[0, 1]] },
  territorios: [],
};

/** Cliente HTTP mínimo que recuerda las cookies, como haría un navegador. */
function crearCliente() {
  const galleta = new Map();

  return {
    get cookies() {
      return galleta;
    },
    async peticion(ruta, { metodo = 'GET', datos, cabeceras = {}, cuerpo } = {}) {
      const opciones = { method: metodo, headers: { ...cabeceras } };

      if (galleta.size) {
        opciones.headers.cookie = [...galleta.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      if (datos !== undefined) {
        opciones.headers['content-type'] = 'application/json';
        opciones.body = JSON.stringify(datos);
      }
      if (cuerpo !== undefined) opciones.body = cuerpo;

      const respuesta = await fetch(`${base}${ruta}`, opciones);

      for (const [nombre, valor] of respuesta.headers) {
        if (nombre.toLowerCase() !== 'set-cookie') continue;
        for (const cookie of valor.split(/,(?=[^;]+=)/)) {
          const [par] = cookie.split(';');
          const indice = par.indexOf('=');
          galleta.set(par.slice(0, indice).trim(), decodeURIComponent(par.slice(indice + 1).trim()));
        }
      }

      let json = null;
      const tipo = respuesta.headers.get('content-type') || '';
      if (tipo.includes('application/json')) json = await respuesta.json();
      else await respuesta.text();

      return { estado: respuesta.status, json, cabeceras: respuesta.headers };
    },
    /** Igual que peticion, pero añadiendo el token CSRF de la sesión. */
    async escribir(ruta, opciones = {}) {
      return this.peticion(ruta, {
        ...opciones,
        cabeceras: { ...(opciones.cabeceras || {}), 'x-csrf-token': galleta.get('ho_csrf') || '' },
      });
    },
  };
}

test.before(async () => {
  const temporadaRepo = new TemporadaRepository();
  const mapaRepo = new MapaRepository();
  const gremioRepo = new GremioRepository();
  const hideoutRepo = new HideoutRepository();

  const temporada = temporadaRepo.crear('S-API', { activar: true });
  const mapa = mapaRepo.obtenerOCrear('Deepwood Copse');
  mapaRepo.guardarGeo(mapa.id, GEO_PRUEBA);

  const gremio = gremioRepo.obtenerOCrear('Gankers Letales');
  hideoutRepo.insertarLote(temporada.id, mapa.id, [{ gremioId: gremio.id, slot: 1, tipo: 'HQ' }]);

  new AuthService().registrar({ usuario: 'jefe', clave: 'ClaveSegura99', rol: 'ADMIN' });

  const app = crearApp();
  servidor = app.crearServidor();
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(async () => {
  await new Promise((resolver) => servidor.close(resolver));
  // En Windows no se puede borrar un archivo abierto: cerrar la conexión primero.
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_TEMPORAL}${sufijo}`, { force: true });
  }
});

// ------------------------------------------------------------------ público --

test('la búsqueda pública responde con los mapas del gremio', async () => {
  const cliente = crearCliente();
  const { estado, json } = await cliente.peticion('/api/buscar?gremio=Gankers');

  assert.equal(estado, 200);
  assert.equal(json.ok, true);
  assert.equal(json.totalMapas, 1);
  assert.equal(json.resultados[0].geo.tier, 6);
});

test('el detalle del mapa entrega la geografía real y sus hideouts', async () => {
  const cliente = crearCliente();
  const { json } = await cliente.peticion('/api/mapas/Deepwood%20Copse');

  assert.equal(json.ok, true);
  assert.equal(json.mapa.salidas[0].destino, 'Battlebrae Lake');
  assert.equal(json.mapa.caminos.enlaces.length, 1);
  assert.equal(json.hideouts.length, 1);
  assert.equal(json.hideouts[0].pos, null);
});

test('un mapa inexistente responde 404 sin filtrar detalles internos', async () => {
  const cliente = crearCliente();
  const { estado, json } = await cliente.peticion('/api/mapas/No%20Existe');

  assert.equal(estado, 404);
  assert.equal(json.ok, false);
  assert.equal(/sqlite|SELECT|\/home/i.test(json.mensaje), false);
});

test('la API responde con cabeceras de seguridad', async () => {
  const cliente = crearCliente();
  const { cabeceras } = await cliente.peticion('/api/salud');

  assert.match(cabeceras.get('content-security-policy'), /script-src 'self'/);
  assert.equal(cabeceras.get('x-content-type-options'), 'nosniff');
  assert.equal(cabeceras.get('x-frame-options'), 'DENY');
});

// ------------------------------------------------------------------ cuentas --

test('registro, sesión y cierre de sesión funcionan de extremo a extremo', async () => {
  const cliente = crearCliente();

  const registro = await cliente.peticion('/api/auth/registro', {
    metodo: 'POST',
    datos: { usuario: 'jugador1', clave: 'ClaveSegura99' },
  });
  assert.equal(registro.estado, 201);
  assert.equal(registro.json.usuario.rol, 'USUARIO');

  const sesion = await cliente.peticion('/api/auth/sesion');
  assert.equal(sesion.json.autenticado, true);

  const salida = await cliente.escribir('/api/auth/logout', { metodo: 'POST' });
  assert.equal(salida.estado, 200);

  const despues = await cliente.peticion('/api/auth/sesion');
  assert.equal(despues.json.autenticado, false);
});

test('la cookie de sesión es httpOnly y SameSite=Strict', async () => {
  const cliente = crearCliente();
  const { cabeceras } = await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    datos: { usuario: 'jefe', clave: 'ClaveSegura99' },
  });

  const cookies = cabeceras.getSetCookie ? cabeceras.getSetCookie() : [cabeceras.get('set-cookie')];
  const sesion = cookies.find((c) => c.startsWith('ho_sesion='));

  assert.match(sesion, /HttpOnly/);
  assert.match(sesion, /SameSite=Strict/);
});

test('el registro rechaza contraseñas débiles y usuarios inválidos', async () => {
  const cliente = crearCliente();

  const debil = await cliente.peticion('/api/auth/registro', {
    metodo: 'POST',
    datos: { usuario: 'pepito', clave: '123' },
  });
  assert.equal(debil.estado, 400);

  const raro = await cliente.peticion('/api/auth/registro', {
    metodo: 'POST',
    datos: { usuario: '<script>x</script>', clave: 'ClaveSegura99' },
  });
  assert.equal(raro.estado, 400);
});

test('el login incorrecto no revela si el usuario existe', async () => {
  const cliente = crearCliente();

  const inexistente = await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    datos: { usuario: 'nadie-aqui', clave: 'ClaveSegura99' },
  });
  const claveMala = await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    datos: { usuario: 'jefe', clave: 'OtraClave123' },
  });

  assert.equal(inexistente.json.mensaje, claveMala.json.mensaje);
});

// ---------------------------------------------------------------- historial --

test('el historial guarda las búsquedas del usuario autenticado', async () => {
  const cliente = crearCliente();
  await cliente.peticion('/api/auth/registro', {
    metodo: 'POST',
    datos: { usuario: 'historiador', clave: 'ClaveSegura99' },
  });

  await cliente.peticion('/api/buscar?gremio=Gankers');
  await cliente.peticion('/api/buscar?gremio=Letales');

  const { json } = await cliente.peticion('/api/historial');
  assert.equal(json.historial.length, 2);
  assert.equal(json.historial[0].termino, 'Letales');

  const limpio = await cliente.escribir('/api/historial', { metodo: 'DELETE' });
  assert.equal(limpio.json.historial.length, 0);
});

test('el historial es privado: sin sesión no se puede consultar', async () => {
  const cliente = crearCliente();
  const { estado } = await cliente.peticion('/api/historial');
  assert.equal(estado, 401);
});

// -------------------------------------------------------------------- CSRF --

test('una escritura sin token CSRF es rechazada', async () => {
  const cliente = crearCliente();
  await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    datos: { usuario: 'jefe', clave: 'ClaveSegura99' },
  });

  const sinToken = await cliente.peticion('/api/admin/hideouts/1/posicion', {
    metodo: 'PUT',
    datos: { x: 10, y: 10 },
  });
  assert.equal(sinToken.estado, 403);

  const conToken = await cliente.escribir('/api/admin/hideouts/1/posicion', {
    metodo: 'PUT',
    datos: { x: 10, y: 10 },
  });
  assert.equal(conToken.estado, 200);
  assert.deepEqual(conToken.json.hideout.pos, [10, 10]);
});

// ------------------------------------------------------------------- admin --

test('un usuario normal no puede entrar al panel de administración', async () => {
  const cliente = crearCliente();
  await cliente.peticion('/api/auth/registro', {
    metodo: 'POST',
    datos: { usuario: 'curioso', clave: 'ClaveSegura99' },
  });

  const resumen = await cliente.peticion('/api/admin/resumen');
  assert.equal(resumen.estado, 403);

  const escritura = await cliente.escribir('/api/admin/hideouts/1/posicion', {
    metodo: 'PUT',
    datos: { x: 0, y: 0 },
  });
  assert.equal(escritura.estado, 403);
});

test('sin sesión el panel de administración responde 401', async () => {
  const cliente = crearCliente();
  const { estado } = await cliente.peticion('/api/admin/usuarios');
  assert.equal(estado, 401);
});

test('la posición del hideout se valida contra los límites reales del mapa', async () => {
  const cliente = crearCliente();
  await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    datos: { usuario: 'jefe', clave: 'ClaveSegura99' },
  });

  const fuera = await cliente.escribir('/api/admin/hideouts/1/posicion', {
    metodo: 'PUT',
    datos: { x: 99999, y: 0 },
  });
  assert.equal(fuera.estado, 400);
  assert.match(fuera.json.mensaje, /entre/);

  const dentro = await cliente.escribir('/api/admin/hideouts/1/posicion', {
    metodo: 'PUT',
    datos: { x: -50.5, y: 75 },
  });
  assert.equal(dentro.estado, 200);
  assert.deepEqual(dentro.json.hideout.pos, [-50.5, 75]);
});

test('el administrador puede renombrar un gremio y queda auditado', async () => {
  const cliente = crearCliente();
  await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    datos: { usuario: 'jefe', clave: 'ClaveSegura99' },
  });

  const gremios = await cliente.peticion('/api/admin/gremios?q=Gankers');
  const id = gremios.json.gremios[0].id;

  const renombrado = await cliente.escribir(`/api/admin/gremios/${id}/nombre`, {
    metodo: 'PUT',
    datos: { nombre: 'Gankers Letales II' },
  });
  assert.equal(renombrado.estado, 200);

  const auditoria = await cliente.peticion('/api/admin/auditoria');
  assert.equal(auditoria.json.auditoria[0].accion, 'RENOMBRAR');

  // Se deja como estaba para no afectar a otras pruebas.
  await cliente.escribir(`/api/admin/gremios/${id}/nombre`, {
    metodo: 'PUT',
    datos: { nombre: 'Gankers Letales' },
  });
});

test('rechaza como logo un archivo que no es una imagen real', async () => {
  const cliente = crearCliente();
  await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    datos: { usuario: 'jefe', clave: 'ClaveSegura99' },
  });

  const gremios = await cliente.peticion('/api/admin/gremios?q=Gankers');
  const id = gremios.json.gremios[0].id;

  const falso = await cliente.escribir(`/api/admin/gremios/${id}/logo`, {
    metodo: 'PUT',
    cabeceras: { 'content-type': 'image/png' },
    cuerpo: Buffer.from('<?php system($_GET["c"]); ?>'),
  });
  assert.equal(falso.estado, 400);

  const tipoNoPermitido = await cliente.escribir(`/api/admin/gremios/${id}/logo`, {
    metodo: 'PUT',
    cabeceras: { 'content-type': 'image/svg+xml' },
    cuerpo: Buffer.from('<svg onload="alert(1)"></svg>'),
  });
  assert.equal(tipoNoPermitido.estado, 415);
});

// ------------------------------------------------- imagen de fondo del mapa --

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function clienteAdmin() {
  const cliente = crearCliente();
  await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    datos: { usuario: 'jefe', clave: 'ClaveSegura99' },
  });
  return cliente;
}

test('la CSP solo abre las imágenes a la wiki oficial de Albion', async () => {
  const cliente = crearCliente();
  const { cabeceras } = await cliente.peticion('/api/salud');
  const csp = cabeceras.get('content-security-policy');

  assert.match(csp, /img-src 'self' data: https:\/\/wiki\.albiononline\.com(;|$)/);
  // Solo se añade WebAssembly (OCR de capturas): nada de 'unsafe-eval' ni 'unsafe-inline'.
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/);
});

test('el administrador sube, ajusta y quita la imagen de fondo de un mapa', async () => {
  const cliente = await clienteAdmin();
  const detalle = await cliente.peticion('/api/mapas/Deepwood%20Copse');
  const id = detalle.json.mapa.id;
  assert.equal(detalle.json.imagen, null);

  const subida = await cliente.escribir(`/api/admin/mapas/${id}/imagen`, {
    metodo: 'PUT',
    cabeceras: { 'content-type': 'image/png' },
    cuerpo: PNG_1X1,
  });
  assert.equal(subida.estado, 200);
  assert.equal(subida.json.imagen.mime, 'image/png');

  const conImagen = await cliente.peticion('/api/mapas/Deepwood%20Copse');
  assert.match(conImagen.json.imagen.url, /^\/api\/mapas\/Deepwood%20Copse\/imagen\?v=/);
  assert.equal(conImagen.json.imagen.escala, 1);

  const servida = await fetch(`${base}/api/mapas/Deepwood%20Copse/imagen`);
  assert.equal(servida.status, 200);
  assert.equal(servida.headers.get('content-type'), 'image/png');
  assert.equal(servida.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await servida.arrayBuffer()), PNG_1X1);

  const ajuste = await cliente.escribir(`/api/admin/mapas/${id}/imagen/ajuste`, {
    metodo: 'PUT',
    datos: { escala: 1.25, dx: -40, dy: 12.5, rotacion: 90 },
  });
  assert.equal(ajuste.estado, 200);
  assert.equal(ajuste.json.imagen.rotacion, 90);

  const ajustado = await cliente.peticion('/api/mapas/Deepwood%20Copse');
  assert.equal(ajustado.json.imagen.escala, 1.25);
  assert.equal(ajustado.json.imagen.dx, -40);

  const borrada = await cliente.escribir(`/api/admin/mapas/${id}/imagen`, { metodo: 'DELETE' });
  assert.equal(borrada.estado, 200);

  const sinImagen = await cliente.peticion('/api/mapas/Deepwood%20Copse');
  assert.equal(sinImagen.json.imagen, null);
  const noEncontrada = await fetch(`${base}/api/mapas/Deepwood%20Copse/imagen`);
  assert.equal(noEncontrada.status, 404);
});

test('el ajuste de la imagen rechaza valores fuera de rango', async () => {
  const cliente = await clienteAdmin();
  const id = (await cliente.peticion('/api/mapas/Deepwood%20Copse')).json.mapa.id;

  await cliente.escribir(`/api/admin/mapas/${id}/imagen`, {
    metodo: 'PUT',
    cabeceras: { 'content-type': 'image/png' },
    cuerpo: PNG_1X1,
  });

  for (const datos of [
    { escala: 50, dx: 0, dy: 0, rotacion: 0 },
    { escala: 1, dx: 99999, dy: 0, rotacion: 0 },
    { escala: 1, dx: 0, dy: 0, rotacion: 45 },
    { escala: 'uno', dx: 0, dy: 0, rotacion: 0 },
  ]) {
    const respuesta = await cliente.escribir(`/api/admin/mapas/${id}/imagen/ajuste`, {
      metodo: 'PUT',
      datos,
    });
    assert.equal(respuesta.estado, 400, `se aceptó ${JSON.stringify(datos)}`);
  }

  await cliente.escribir(`/api/admin/mapas/${id}/imagen`, { metodo: 'DELETE' });
});

test('la imagen del mapa valida el tipo real del archivo y exige ser admin', async () => {
  const admin = await clienteAdmin();
  const id = (await admin.peticion('/api/mapas/Deepwood%20Copse')).json.mapa.id;

  const disfrazada = await admin.escribir(`/api/admin/mapas/${id}/imagen`, {
    metodo: 'PUT',
    cabeceras: { 'content-type': 'image/png' },
    cuerpo: Buffer.from('<script>alert(1)</script> no soy una imagen'),
  });
  assert.equal(disfrazada.estado, 400);

  // Otro "navegador" (user-agent distinto) para no chocar con el límite
  // de intentos de autenticación que ya consumieron las pruebas anteriores.
  const usuario = crearCliente();
  const registro = await usuario.peticion('/api/auth/registro', {
    metodo: 'POST',
    cabeceras: { 'user-agent': 'navegador-de-prueba-imagen' },
    datos: { usuario: 'miron', clave: 'ClaveSegura99' },
  });
  assert.equal(registro.estado, 201);
  const sinPermiso = await usuario.escribir(`/api/admin/mapas/${id}/imagen`, {
    metodo: 'PUT',
    cabeceras: { 'content-type': 'image/png' },
    cuerpo: PNG_1X1,
  });
  assert.equal(sinPermiso.estado, 403);
});

// ---------------------------------------------------------------- estáticos --

test('no se puede salir de la carpeta pública (path traversal)', async () => {
  const cliente = crearCliente();

  for (const ruta of [
    '/../../../../etc/passwd',
    '/css/../../../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
  ]) {
    const respuesta = await fetch(`${base}${ruta}`);
    const texto = await respuesta.text();
    assert.equal(texto.includes('root:'), false, `fuga con ${ruta}`);
  }

  const paginaPrincipal = await cliente.peticion('/');
  assert.equal(paginaPrincipal.estado, 200);
});

test('un cuerpo JSON demasiado grande se rechaza con 413', async () => {
  const cliente = crearCliente();
  const { estado } = await cliente.peticion('/api/auth/login', {
    metodo: 'POST',
    cabeceras: { 'content-type': 'application/json' },
    cuerpo: JSON.stringify({ usuario: 'x'.repeat(200000), clave: 'y' }),
  });

  assert.equal(estado, 413);
});

test('una ruta desconocida de la API responde JSON, no la página web', async () => {
  const cliente = crearCliente();
  const { estado, json } = await cliente.peticion('/api/no-existe');

  assert.equal(estado, 404);
  assert.equal(json.ok, false);
});

// ------------------------------------------------ caminos de Avalon --

test('registrar conexiones de caminos exige sesión y token CSRF', async () => {
  const anonimo = crearCliente();
  const conexiones = [{ origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 90 }];

  const sinSesion = await anonimo.peticion('/api/tracking/reportes', { metodo: 'POST', datos: { conexiones } });
  assert.equal(sinSesion.estado, 401);

  // Sesión creada con el servicio: las pruebas anteriores agotan a
  // propósito el límite de intentos de login por minuto.
  const auth = new AuthService();
  auth.registrar({ usuario: 'mapeador', clave: 'ClaveSegura99' });
  const sesion = auth.iniciarSesion({ usuario: 'mapeador', clave: 'ClaveSegura99', huella: 'pruebas' });
  const cliente = crearCliente();
  cliente.cookies.set('ho_sesion', sesion.token);
  cliente.cookies.set('ho_csrf', sesion.csrf);

  const sinCsrf = await cliente.peticion('/api/tracking/reportes', { metodo: 'POST', datos: { conexiones } });
  assert.equal(sinCsrf.estado, 403);

  const creada = await cliente.escribir('/api/tracking/reportes', { metodo: 'POST', datos: { conexiones } });
  assert.equal(creada.estado, 201);
  assert.equal(creada.json.creadas, 1);
  const id = creada.json.conexiones[0].id;

  const invalida = await cliente.escribir('/api/tracking/reportes', {
    metodo: 'POST',
    datos: { conexiones: [{ origen: 'Narnia', destino: 'Martlock', minutos: 5 }] },
  });
  assert.equal(invalida.estado, 400);
  assert.match(invalida.json.mensaje, /no es una zona/);

  const borrada = await cliente.escribir(`/api/tracking/reportes/${id}`, { metodo: 'DELETE' });
  assert.equal(borrada.estado, 200);
});

test('la lista de zonas oficiales es pública y cacheable', async () => {
  const { estado, json, cabeceras } = await crearCliente().peticion('/api/tracking/zonas');
  assert.equal(estado, 200);
  assert.ok(json.zonas.length > 800);
  assert.ok(json.zonas.some((z) => z.nombre === 'Meltwater Sump' && z.grupo === 'zonaNegra'));
  assert.match(cabeceras.get('cache-control'), /max-age/);
});

test('la consulta de rutas por mapa valida la lista de mapas', async () => {
  const cliente = crearCliente();
  const bien = await cliente.peticion('/api/tracking/rutas?mapas=' + encodeURIComponent('Deepwood Copse,Martlock'));
  assert.equal(bien.estado, 200);
  assert.equal(bien.json.ok, true);
  assert.equal(typeof bien.json.mapas, 'object');

  const sinMapas = await cliente.peticion('/api/tracking/rutas');
  assert.equal(sinMapas.estado, 400);

  const demasiados = Array.from({ length: 51 }, (_, i) => `Mapa ${i}`).join(',');
  const excedida = await cliente.peticion('/api/tracking/rutas?mapas=' + encodeURIComponent(demasiados));
  assert.equal(excedida.estado, 400);
});
