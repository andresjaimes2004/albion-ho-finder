'use strict';

const { crearAutenticacion, ErrorDrive } = require('./googleAuth');

/**
 * googleSheets.js
 * ----------------------------------------------------------------------
 * Escritura en la Hoja de cálculo de Google del equipo, SOLO PARA AGREGAR.
 * La usa la sincronización para pasar al Excel los gremios de caminos de
 * hideouts que se anotan en la web.
 *
 * Por diseño este cliente no sabe borrar: solo lee, crea una hoja nueva,
 * escribe en una celda que esté vacía y agrega filas al final. No hay
 * ninguna función que limpie, sobrescriba o elimine celdas, filas u hojas,
 * de modo que ningún fallo ni petición de la web puede quitar información
 * del Excel.
 *
 * Los valores se envían como texto literal (valueInputOption=RAW): un
 * nombre que empiece por "=" no se convierte en fórmula.
 *
 * Permisos: la cuenta de servicio debe ser Editor de la hoja y, en la VM,
 * estar vinculada con el alcance "spreadsheets" (ver README). Solo sirve
 * para Hojas de cálculo de Google, no para un .xlsx subido a Drive.
 * ----------------------------------------------------------------------
 */

const ALCANCE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const FORMATO_ID = /^[A-Za-z0-9_-]{10,200}$/;
const FORMATO_CELDA = /^[A-Z]{1,2}[1-9][0-9]{0,5}$/;
const FORMATO_HOJA = /^[\p{L}\p{N} _-]{1,60}$/u;
const MAX_VALOR = 60;
const MAX_COLUMNAS = 12;

/** Nombre de hoja entre comillas para un rango A1 ('Mi hoja'!A1:K). */
function rango(hoja, celdas) {
  if (!FORMATO_HOJA.test(hoja)) throw new ErrorDrive('Nombre de hoja no válido.');
  return `'${hoja}'!${celdas}`;
}

function comprobarId(id) {
  if (!FORMATO_ID.test(id || '')) throw new ErrorDrive('EXCEL_DRIVE_ID no tiene el formato de un id de Drive.');
}

function comprobarValores(valores) {
  if (!Array.isArray(valores) || !valores.length || valores.length > MAX_COLUMNAS) {
    throw new ErrorDrive('Fila no válida para el Excel.');
  }
  for (const v of valores) {
    if (typeof v !== 'string' || v.length > MAX_VALOR) throw new ErrorDrive('Valor no válido para el Excel.');
  }
}

/**
 * @param {{correo: string, clave: string} | null} credenciales  null = la
 *   cuenta de servicio vinculada a la VM (sin claves).
 */
function crearClienteHojas(credenciales, { fetch = globalThis.fetch, ahora = Date.now } = {}) {
  const google = crearAutenticacion(credenciales, {
    alcance: ALCANCE,
    fetch,
    ahora,
    mensajes: {
      conexion: 'No se pudo conectar con Google Sheets.',
      sinAlcance:
        'La VM no tiene el permiso de Hojas de cálculo: añade el alcance "spreadsheets" a la cuenta de servicio de la VM (ver README).',
      400: 'Google Sheets rechazó la petición: ¿el archivo es una Hoja de cálculo de Google y no un .xlsx?',
      403: 'La cuenta de servicio no puede editar la hoja: compártela con su correo como Editor.',
      404: 'No se encontró la hoja de cálculo: revisa EXCEL_DRIVE_ID.',
    },
  });
  const json = async (url, opciones = {}) => {
    const respuesta = await google.autorizada(url, {
      ...opciones,
      headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    });
    return respuesta.json();
  };

  return {
    cuenta: () => google.cuenta(),

    /** Nombres de las hojas (pestañas) del libro. */
    async titulos(id) {
      comprobarId(id);
      const datos = await json(`${API}/${id}?fields=sheets.properties.title`);
      return (datos.sheets || []).map((h) => h.properties && h.properties.title).filter(Boolean);
    },

    /** Crea una hoja nueva (si ya existe, Google lo rechaza: no toca la existente). */
    async crearHoja(id, titulo, encabezado) {
      comprobarId(id);
      rango(titulo, 'A1');
      comprobarValores(encabezado);
      await json(`${API}/${id}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: titulo } } }] }),
      });
      await this.agregarFila(id, titulo, encabezado);
    },

    /** Filas de un rango (texto como se ve en la hoja). */
    async leer(id, hoja, celdas) {
      comprobarId(id);
      const url = `${API}/${id}/values/${encodeURIComponent(rango(hoja, celdas))}?majorDimension=ROWS`;
      const datos = await json(url);
      return Array.isArray(datos.values) ? datos.values : [];
    },

    /**
     * Escribe un valor en una celda SOLO si está vacía: la vuelve a leer
     * justo antes. Devuelve false (sin escribir) si ya tiene algo.
     */
    async escribirSiVacia(id, hoja, celda, valor) {
      comprobarId(id);
      if (!FORMATO_CELDA.test(celda)) throw new ErrorDrive('Celda no válida.');
      comprobarValores([valor]);
      const actual = await this.leer(id, hoja, celda);
      if (actual.length && actual[0].length && String(actual[0][0]).trim() !== '') return false;
      const destino = rango(hoja, celda);
      await json(`${API}/${id}/values/${encodeURIComponent(destino)}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ range: destino, majorDimension: 'ROWS', values: [[valor]] }),
      });
      return true;
    },

    /** Agrega una fila al final de la tabla de la hoja (nunca encima de otra). */
    async agregarFila(id, hoja, valores) {
      comprobarId(id);
      comprobarValores(valores);
      const destino = rango(hoja, 'A1');
      await json(
        `${API}/${id}/values/${encodeURIComponent(destino)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: [valores] }) }
      );
    },
  };
}

module.exports = { crearClienteHojas, ErrorDrive };
