'use strict';

/**
 * Sincronización de hideouts con el Excel de Google Drive: lector de
 * .xlsx propio, comparación slot por slot, protecciones y cliente de
 * Drive (con un fetch falso: las pruebas no salen a Internet).
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const DB_TEMPORAL = path.join(os.tmpdir(), `albion-sincronizacion-${Date.now()}.db`);
process.env.DB_PATH = DB_TEMPORAL;

const { leerHoja, ErrorExcel } = require('../src/excel/leerXlsx');
const { leerHideoutsXlsx, interpretarFilas } = require('../src/excel/hojaHideouts');
const { crearClienteDrive } = require('../src/excel/googleDrive');
const SincronizacionExcelService = require('../src/services/SincronizacionExcelService');

test.after(() => {
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(`${DB_TEMPORAL}${sufijo}`, { force: true });
});

// ------------------------------------------------ .xlsx de prueba --

/** ZIP mínimo (unas partes comprimidas y otras no, como hacen los Excel reales). */
function zip(archivos) {
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const datos = Buffer.from(texto, 'utf8');
    const comprimir = nombre.endsWith('.xml') && datos.length > 200;
    const cuerpo = comprimir ? zlib.deflateRawSync(datos) : datos;
    const nombreB = Buffer.from(nombre);
    const crc = zlib.crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(comprimir ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(cuerpo.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreB.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(comprimir ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(cuerpo.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreB.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(local, nombreB, cuerpo);
    centrales.push(central, nombreB);
    desplazamiento += 30 + nombreB.length + cuerpo.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(archivos).length, 8);
  fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Excel con la hoja "Mapas BZ" (como segunda hoja) a partir de filas de textos. */
function crearXlsx(filas, { nombreHoja = 'Mapas BZ' } = {}) {
  const compartidas = [];
  const indice = new Map();
  const celdas = filas
    .map((fila, f) => {
      const cs = fila
        .map((valor, c) => {
          if (valor === null || valor === undefined) return '';
          const ref = `${String.fromCharCode(65 + c)}${f + 1}`;
          if (typeof valor === 'number') return `<c r="${ref}"><v>${valor}</v></c>`;
          // Una celda como texto en línea; el resto, compartidas.
          if (valor.startsWith('!')) return `<c r="${ref}" t="inlineStr"><is><t>${escapar(valor.slice(1))}</t></is></c>`;
          if (!indice.has(valor)) {
            indice.set(valor, compartidas.length);
            compartidas.push(valor);
          }
          return `<c r="${ref}" t="s"><v>${indice.get(valor)}</v></c>`;
        })
        .join('');
      return `<row r="${f + 1}">${cs}</row>`;
    })
    .join('');
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Otra" sheetId="1" r:id="rId1"/><sheet name="${nombreHoja}" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>nada</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': `<?xml version="1.0"?><worksheet><sheetData>${celdas}</sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst>${compartidas
      // Un texto partido en dos "runs" con formato, como los genera Excel.
      .map((t) => (t.length > 6 ? `<si><r><t>${escapar(t.slice(0, 3))}</t></r><r><t xml:space="preserve">${escapar(t.slice(3))}</t></r></si>` : `<si><t>${escapar(t)}</t></si>`))
      .join('')}</sst>`,
  });
}

test('lee la hoja pedida de un .xlsx: textos compartidos, en línea, números y entidades', () => {
  const xlsx = crearXlsx([
    ['Mapa', 'HO 1', 'HO 2'],
    ['Deepwood Copse', 'Los Topos (HQ)', null, '!Señores & Co. <3'],
    [],
    ['Razorrock Verge', 42],
  ]);
  const filas = leerHoja(xlsx, 'Mapas BZ');
  assert.deepEqual(filas[0], ['Mapa', 'HO 1', 'HO 2']);
  assert.deepEqual(filas[1], ['Deepwood Copse', 'Los Topos (HQ)', null, 'Señores & Co. <3']);
  assert.deepEqual(filas[2], []);
  assert.deepEqual(filas[3], ['Razorrock Verge', 42]);

  assert.throws(() => leerHoja(xlsx, 'No existe'), /no tiene una hoja llamada "No existe"/);
  assert.throws(() => leerHoja(Buffer.from('esto no es un zip, solo texto de relleno'), 'Mapas BZ'), ErrorExcel);
  assert.throws(() => leerHoja(Buffer.alloc(0), 'Mapas BZ'), /vacío/);
});

test('interpreta la hoja "Mapas BZ": gremio, tipo HQ o P y slot', () => {
  const mapas = interpretarFilas([
    ['Mapa', 'HO 1', 'HO 2', 'HO 3'],
    ['  Deepwood  Copse ', 'Los Topos (HQ)', 'Gremio   Dos (p)', ' Tres '],
    [null, 'sin mapa'],
    ['Deepwood Copse', 'fila repetida: se ignora'],
  ]);
  assert.deepEqual(mapas, [
    {
      mapa: 'Deepwood Copse',
      hideouts: [
        { slot: 1, gremio: 'Los Topos', tipo: 'HQ' },
        { slot: 2, gremio: 'Gremio Dos', tipo: 'P' },
        { slot: 3, gremio: 'Tres', tipo: 'ESTANDAR' },
      ],
    },
  ]);
});

// ------------------------------------------------------- aplicar --

const MapaRepository = require('../src/repositories/MapaRepository');
const GremioRepository = require('../src/repositories/GremioRepository');
const HideoutRepository = require('../src/repositories/HideoutRepository');
const TemporadaRepository = require('../src/repositories/TemporadaRepository');
const AuditoriaRepository = require('../src/repositories/AuditoriaRepository');

/** Temporada con 20 mapas y un hideout en cada uno (más dos en el mapa 1). */
function sembrar() {
  const conexion = require('../src/config/database').getConnection();
  conexion.exec('DELETE FROM hideouts; DELETE FROM temporadas; DELETE FROM auditoria;');
  const temporada = new TemporadaRepository().crear('S99', { activar: true });
  const mapas = new MapaRepository();
  const gremios = new GremioRepository();
  const hideouts = new HideoutRepository();
  for (let i = 1; i <= 20; i++) {
    const mapa = mapas.obtenerOCrear(`Mapa ${i}`);
    hideouts.crear({ temporadaId: temporada.id, mapaId: mapa.id, gremioId: gremios.obtenerOCrear(`Gremio ${i}`).id, slot: 1 });
  }
  const uno = mapas.obtenerPorNombre('Mapa 1');
  const conPosicion = hideouts.crear({ temporadaId: temporada.id, mapaId: uno.id, gremioId: gremios.obtenerOCrear('Con Posición').id, slot: 2 });
  hideouts.actualizarPosicion(conPosicion.id, 10, 20);
  hideouts.actualizar(conPosicion.id, { nota: 'entrada por el norte' });
  const otroConPosicion = hideouts.crear({ temporadaId: temporada.id, mapaId: uno.id, gremioId: gremios.obtenerOCrear('Se Muda').id, slot: 3 });
  hideouts.actualizarPosicion(otroConPosicion.id, 5, 5);
  return temporada;
}

/** El Excel equivalente a lo sembrado. */
function excelIgual() {
  const mapas = [];
  for (let i = 1; i <= 20; i++) mapas.push({ mapa: `Mapa ${i}`, hideouts: [{ slot: 1, gremio: `Gremio ${i}`, tipo: 'ESTANDAR' }] });
  mapas[0].hideouts.push({ slot: 2, gremio: 'Con Posición', tipo: 'ESTANDAR' }, { slot: 3, gremio: 'Se Muda', tipo: 'ESTANDAR' });
  return mapas;
}

test('sin diferencias no cambia nada ni deja auditoría', () => {
  sembrar();
  const r = new SincronizacionExcelService().aplicar(excelIgual());
  assert.deepEqual([r.creados, r.reemplazados, r.tiposCambiados, r.eliminados], [0, 0, 0, 0]);
  assert.equal(r.mensaje, 'El Excel y la web ya coincidían.');
  assert.equal(new AuditoriaRepository().listar().length, 0);
});

test('aplica solo las diferencias y conserva posiciones y notas del mismo gremio', () => {
  const temporada = sembrar();
  const excel = excelIgual();
  excel[0].hideouts[1].tipo = 'HQ'; // Con Posición ahora es HQ
  excel[0].hideouts[2].gremio = 'Recién Llegados'; // otro gremio en el slot 3
  excel[0].hideouts.push({ slot: 4, gremio: 'Nuevo Gremio', tipo: 'P' }); // hideout nuevo
  excel[1].hideouts = []; // destruyeron el del Mapa 2
  excel.push({ mapa: 'Mapa Inventado', hideouts: [{ slot: 1, gremio: 'X', tipo: 'ESTANDAR' }] });
  excel.splice(19, 1); // el Mapa 20 no aparece en el Excel: no se vacía

  const r = new SincronizacionExcelService().aplicar(excel, { usuarioId: null });
  assert.deepEqual([r.creados, r.reemplazados, r.tiposCambiados, r.eliminados], [1, 1, 1, 1]);
  assert.deepEqual(r.mapasDesconocidos, ['Mapa Inventado']);
  assert.deepEqual(r.mapasAusentes, ['Mapa 20']);

  const repo = new HideoutRepository();
  const mapa1 = new Map(repo.listarPorMapa('Mapa 1', temporada.id).map((h) => [h.slot, h]));
  assert.equal(mapa1.get(2).tipo, 'HQ');
  assert.deepEqual([mapa1.get(2).posX, mapa1.get(2).posY, mapa1.get(2).nota], [10, 20, 'entrada por el norte'], 'mismo gremio: se conserva');
  assert.equal(mapa1.get(3).gremio, 'Recién Llegados');
  assert.deepEqual([mapa1.get(3).posX, mapa1.get(3).posY], [null, null], 'otro gremio: la posición era del anterior');
  assert.equal(mapa1.get(4).gremio, 'Nuevo Gremio');
  assert.equal(repo.listarPorMapa('Mapa 2', temporada.id).length, 0);
  assert.equal(repo.listarPorMapa('Mapa 20', temporada.id).length, 1);

  const auditoria = new AuditoriaRepository().listar();
  assert.equal(auditoria.length, 1);
  assert.equal(auditoria[0].accion, 'SINCRONIZAR_EXCEL');
});

test('no aplica un Excel que borraría más del 30 % de los hideouts, salvo que se fuerce', () => {
  const temporada = sembrar();
  const vacio = excelIgual().map((m) => ({ ...m, hideouts: [] }));
  const s = new SincronizacionExcelService();
  assert.throws(() => s.aplicar(vacio), (e) => e.requiereForzar === true && /no se aplicó nada/.test(e.message));
  assert.equal(new HideoutRepository().contarTotal(temporada.id), 22, 'no se tocó nada');
  assert.throws(() => s.aplicar([]), /está vacía/);

  const r = s.aplicar(vacio, { forzar: true });
  assert.equal(r.eliminados, 22);
});

// ---------------------------------------------------- Google Drive --

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CREDENCIALES = { correo: 'lector@proyecto.iam.gserviceaccount.com', clave: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

/** Google falso: token con JWT firmado, metadatos y descarga. */
function googleFalso({ archivo, meta, estadoArchivo = 200 }) {
  const llamadas = [];
  const fetch = async (url, opciones = {}) => {
    llamadas.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      const assertion = opciones.body.get('assertion');
      const [cabecera, cuerpo, firma] = assertion.split('.');
      const valida = crypto.createVerify('RSA-SHA256').update(`${cabecera}.${cuerpo}`).verify(publicKey, Buffer.from(firma, 'base64url'));
      const datos = JSON.parse(Buffer.from(cuerpo, 'base64url'));
      assert.equal(valida, true, 'el JWT va firmado con la clave de la cuenta de servicio');
      assert.equal(datos.scope, 'https://www.googleapis.com/auth/drive.readonly', 'solo lectura');
      assert.equal(datos.iss, CREDENCIALES.correo);
      return new Response(JSON.stringify({ access_token: 'token-falso', expires_in: 3600 }));
    }
    assert.equal(opciones.headers.Authorization, 'Bearer token-falso');
    if (url.includes('fields=')) return new Response(JSON.stringify(meta), { status: estadoArchivo });
    return new Response(archivo);
  };
  return { fetch, llamadas };
}

test('el cliente de Drive se autentica con la cuenta de servicio y descarga el Excel', async () => {
  const xlsx = crearXlsx([['Mapa', 'HO 1'], ['Mapa 1', 'Gremio 1']]);
  const meta = { id: 'archivo_de_prueba_123', name: 'Buscador.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', modifiedTime: '2026-09-29T10:00:00Z' };
  const falso = googleFalso({ archivo: xlsx, meta });
  const drive = crearClienteDrive(CREDENCIALES, { fetch: falso.fetch });

  const leidos = await drive.metadatos('archivo_de_prueba_123');
  assert.equal(leidos.name, 'Buscador.xlsx');
  const descargado = await drive.descargar(leidos);
  assert.deepEqual(leerHideoutsXlsx(descargado), [{ mapa: 'Mapa 1', hideouts: [{ slot: 1, gremio: 'Gremio 1', tipo: 'ESTANDAR' }] }]);
  assert.ok(falso.llamadas.some((u) => u.includes('alt=media')));
  assert.equal(falso.llamadas.filter((u) => u.includes('oauth2')).length, 1, 'el token se reutiliza');

  // Una hoja de cálculo de Google se exporta como .xlsx.
  await drive.descargar({ ...meta, mimeType: 'application/vnd.google-apps.spreadsheet' });
  assert.ok(falso.llamadas.some((u) => u.includes('/export?mimeType=')));

  await assert.rejects(() => drive.metadatos('../../etc/passwd'), /formato de un id/);
  await assert.rejects(() => drive.descargar({ ...meta, mimeType: 'application/pdf' }), /no es un Excel/);
  const sinPermiso = crearClienteDrive(CREDENCIALES, { fetch: googleFalso({ archivo: xlsx, meta, estadoArchivo: 403 }).fetch });
  await assert.rejects(() => sinPermiso.metadatos('archivo_de_prueba_123'), /compártelo con su correo como lector/);
});

test('sincronizar no descarga el Excel si no cambió desde la última revisión', async () => {
  sembrar();
  let descargas = 0;
  let modificado = '2026-09-29T10:00:00Z';
  const drive = {
    metadatos: async () => ({ id: 'x', name: 'Buscador.xlsx', modifiedTime: modificado }),
    descargar: async () => {
      descargas += 1;
      const filas = [['Mapa', 'HO 1', 'HO 2', 'HO 3']];
      for (const m of excelIgual()) filas.push([m.mapa, ...m.hideouts.map((h) => h.gremio)]);
      filas[1][4] = 'Otro Más';
      return crearXlsx(filas);
    },
  };
  const s = new SincronizacionExcelService({ drive, archivoId: 'x' });
  const primera = await s.sincronizar();
  assert.equal(primera.resultado.creados, 1);
  const segunda = await s.sincronizar();
  assert.equal(segunda.resultado, null);
  assert.match(segunda.mensaje, /no cambió/);
  assert.equal(descargas, 1);

  modificado = '2026-09-29T11:00:00Z';
  const tercera = await s.sincronizar();
  assert.equal(descargas, 2);
  assert.equal(tercera.resultado.creados, 0, 'ya estaba al día');
  assert.equal(s.estado().ultimo.ok, true);

  const sinConfigurar = new SincronizacionExcelService();
  await assert.rejects(() => sinConfigurar.sincronizar(), /no está configurada/);
});
