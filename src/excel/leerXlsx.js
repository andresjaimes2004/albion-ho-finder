'use strict';

const zlib = require('zlib');

/**
 * leerXlsx.js
 * ----------------------------------------------------------------------
 * Lector mínimo de archivos .xlsx, sin dependencias: devuelve las filas
 * de una hoja como listas de valores (texto o número), igual que
 * `sheet_to_json(hoja, { header: 1 })` del paquete xlsx.
 *
 * Por qué propio: el paquete `xlsx` publicado en npm (0.18.5) tiene fallos
 * de seguridad conocidos sin corregir (contaminación de prototipos y
 * ReDoS), y el Excel ahora llega solo desde Internet (Google Drive).
 *
 * Un .xlsx es un ZIP con XML dentro. Se lee lo justo:
 *   xl/workbook.xml            → nombre de cada hoja y su relación
 *   xl/_rels/workbook.xml.rels → archivo de cada hoja
 *   xl/sharedStrings.xml       → textos compartidos
 *   xl/worksheets/sheetN.xml   → celdas
 *
 * Límites contra archivos malformados o "bombas zip": tamaño del archivo,
 * tamaño descomprimido de cada parte y número de filas y columnas.
 * ----------------------------------------------------------------------
 */

const MAX_ARCHIVO = 20 * 1024 * 1024;
const MAX_PARTE = 10 * 1024 * 1024;
const MAX_FILAS = 20_000;
const MAX_COLUMNAS = 200;

class ErrorExcel extends Error {}

// ------------------------------------------------------------------ ZIP --

/** Índice del ZIP: nombre de archivo → { metodo, comprimido, desplazamiento }. */
function indiceZip(buffer) {
  // Fin del directorio central: firma 0x06054b50 en los últimos 64 KB.
  let fin = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErrorExcel('El archivo no es un Excel (.xlsx) válido.');

  const entradas = buffer.readUInt16LE(fin + 10);
  let posicion = buffer.readUInt32LE(fin + 16);
  const indice = new Map();
  for (let n = 0; n < entradas; n++) {
    if (posicion + 46 > buffer.length || buffer.readUInt32LE(posicion) !== 0x02014b50) {
      throw new ErrorExcel('El Excel está dañado (directorio del ZIP).');
    }
    const metodo = buffer.readUInt16LE(posicion + 10);
    const comprimido = buffer.readUInt32LE(posicion + 20);
    const largoNombre = buffer.readUInt16LE(posicion + 28);
    const largoExtra = buffer.readUInt16LE(posicion + 30);
    const largoComentario = buffer.readUInt16LE(posicion + 32);
    const desplazamiento = buffer.readUInt32LE(posicion + 42);
    const nombre = buffer.toString('utf8', posicion + 46, posicion + 46 + largoNombre);
    indice.set(nombre, { metodo, comprimido, desplazamiento });
    posicion += 46 + largoNombre + largoExtra + largoComentario;
  }
  return indice;
}

function leerParte(buffer, indice, nombre) {
  const entrada = indice.get(nombre);
  if (!entrada) return null;
  const local = entrada.desplazamiento;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) {
    throw new ErrorExcel('El Excel está dañado (cabecera del ZIP).');
  }
  const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
  const datos = buffer.subarray(inicio, inicio + entrada.comprimido);
  if (entrada.metodo === 0) return datos.toString('utf8');
  if (entrada.metodo !== 8) throw new ErrorExcel('El Excel usa una compresión no admitida.');
  try {
    return zlib.inflateRawSync(datos, { maxOutputLength: MAX_PARTE }).toString('utf8');
  } catch (error) {
    throw new ErrorExcel('El Excel está dañado o es demasiado grande.');
  }
}

// ------------------------------------------------------------------ XML --

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodificar(texto) {
  return texto.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e[0] !== '#') return ENTIDADES[e];
    const codigo = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(codigo) && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : '';
  });
}

function atributo(etiqueta, nombre) {
  const m = etiqueta.match(new RegExp(`\\s${nombre}="([^"]*)"`));
  return m ? decodificar(m[1]) : null;
}

/** Texto de un <si> o <is>: sus <t> juntos (ignora la fonética <rPh>). */
function textoRico(xml) {
  const sinFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let texto = '';
  for (const m of sinFonetica.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) texto += decodificar(m[1]);
  return texto;
}

/** "B12" → 1 (columna B, base 0). */
function columna(referencia) {
  const letras = /^([A-Z]+)/.exec(referencia || '');
  if (!letras) return -1;
  let numero = 0;
  for (const letra of letras[1]) numero = numero * 26 + (letra.charCodeAt(0) - 64);
  return numero - 1;
}

// ---------------------------------------------------------------- hojas --

/**
 * @param {Buffer} buffer  Contenido del .xlsx.
 * @param {string} nombreHoja
 * @returns {Array<Array<string|number|null>>} filas (la primera, el encabezado)
 */
function leerHoja(buffer, nombreHoja) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new ErrorExcel('El archivo está vacío.');
  if (buffer.length > MAX_ARCHIVO) throw new ErrorExcel('El Excel es demasiado grande.');
  const indice = indiceZip(buffer);

  const libro = leerParte(buffer, indice, 'xl/workbook.xml');
  const relaciones = leerParte(buffer, indice, 'xl/_rels/workbook.xml.rels');
  if (!libro || !relaciones) throw new ErrorExcel('El archivo no es un Excel (.xlsx) válido.');

  const hoja = [...libro.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((e) => atributo(e, 'name') === nombreHoja);
  if (!hoja) throw new ErrorExcel(`El Excel no tiene una hoja llamada "${nombreHoja}".`);
  const idRelacion = atributo(hoja, 'r:id');
  const relacion = [...relaciones.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((e) => atributo(e, 'Id') === idRelacion);
  if (!relacion) throw new ErrorExcel('El Excel está dañado (relación de la hoja).');
  const destino = atributo(relacion, 'Target').replace(/^\/?(xl\/)?/, '');
  const xmlHoja = leerParte(buffer, indice, `xl/${destino}`);
  if (!xmlHoja) throw new ErrorExcel('El Excel está dañado (falta la hoja).');

  const compartidasXml = leerParte(buffer, indice, 'xl/sharedStrings.xml') || '';
  const compartidas = [...compartidasXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoRico(m[1]));

  const filas = [];
  let numeroFilas = 0;
  for (const mFila of xmlHoja.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (++numeroFilas > MAX_FILAS) throw new ErrorExcel('El Excel tiene demasiadas filas.');
    const numero = Number(atributo(`<row${mFila[1]}>`, 'r')) || filas.length + 1;
    if (!Number.isInteger(numero) || numero < 1 || numero > MAX_FILAS) throw new ErrorExcel('El Excel tiene demasiadas filas.');
    const fila = [];
    for (const mCelda of (mFila[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cabecera = `<c${mCelda[1]}>`;
      const col = columna(atributo(cabecera, 'r'));
      if (col < 0 || col >= MAX_COLUMNAS) continue;
      const tipo = atributo(cabecera, 't');
      const cuerpo = mCelda[2] || '';
      const valorCrudo = (/<v>([\s\S]*?)<\/v>/.exec(cuerpo) || [])[1];
      let valor = null;
      if (tipo === 's') valor = compartidas[Number(valorCrudo)] ?? null;
      else if (tipo === 'inlineStr') valor = textoRico((/<is>([\s\S]*?)<\/is>/.exec(cuerpo) || ['', ''])[1]);
      else if (tipo === 'str' || tipo === 'e') valor = valorCrudo !== undefined ? decodificar(valorCrudo) : null;
      else if (tipo === 'b') valor = valorCrudo === '1';
      else if (valorCrudo !== undefined) valor = Number(valorCrudo);
      while (fila.length < col) fila.push(null);
      fila[col] = valor === '' ? null : valor;
    }
    filas[numero - 1] = fila;
  }
  // Filas vacías intermedias como listas vacías (como hace xlsx).
  return Array.from(filas, (fila) => fila || []);
}

module.exports = { leerHoja, ErrorExcel };
