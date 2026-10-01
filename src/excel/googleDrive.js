'use strict';

const fs = require('fs');
const path = require('path');

const { crearAutenticacion, ErrorDrive } = require('./googleAuth');

/**
 * googleDrive.js
 * ----------------------------------------------------------------------
 * Descarga de un archivo privado de Google Drive con una cuenta de
 * servicio, sin dependencias.
 *
 * El archivo NO se publica con enlace: se comparte solo con el correo de
 * la cuenta de servicio, como lector. El permiso es de solo lectura
 * (drive.readonly). Dos formas de identificarse ante Google:
 *
 *  - Recomendada, sin claves: la cuenta de servicio está vinculada a la
 *    VM de Compute Engine y el token temporal se pide al servidor de
 *    metadatos de la propia VM. No hay ningún secreto guardado que se
 *    pueda filtrar. Es lo que Google aconseja para programas que corren
 *    dentro de Google Cloud.
 *  - Con clave JSON (GOOGLE_CREDENCIALES): el token se firma con `crypto`.
 *    Solo para ejecutar fuera de Google Cloud (por ejemplo, en local).
 *
 * Sirve tanto para un .xlsx subido a Drive como para una hoja de cálculo
 * de Google (se exporta como .xlsx).
 * ----------------------------------------------------------------------
 */

const ALCANCE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3/files';
const HOJA_GOOGLE = 'application/vnd.google-apps.spreadsheet';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 20 * 1024 * 1024;
const FORMATO_ID = /^[A-Za-z0-9_-]{10,200}$/;

/** Lee y valida el JSON de la cuenta de servicio. */
function cargarCredenciales(ruta) {
  let datos;
  try {
    datos = JSON.parse(fs.readFileSync(path.resolve(ruta), 'utf8'));
  } catch (error) {
    throw new ErrorDrive('No se pudo leer el archivo de credenciales de Google (GOOGLE_CREDENCIALES).');
  }
  if (datos.type !== 'service_account' || !datos.client_email || !datos.private_key) {
    throw new ErrorDrive('Las credenciales de Google no son de una cuenta de servicio.');
  }
  return { correo: datos.client_email, clave: datos.private_key };
}

/**
 * @param {{correo: string, clave: string} | null} credenciales  null = usar
 *   la cuenta de servicio vinculada a la VM (sin claves).
 * @param {{fetch?: Function, ahora?: () => number}} [opciones]
 */
function crearClienteDrive(credenciales, { fetch = globalThis.fetch, ahora = Date.now } = {}) {
  const google = crearAutenticacion(credenciales, {
    alcance: ALCANCE,
    fetch,
    ahora,
    mensajes: {
      conexion: 'No se pudo conectar con Google Drive.',
      sinAlcance: 'La VM no tiene el permiso de Drive: vincúlale la cuenta de servicio con el alcance drive.readonly (ver README).',
      403: 'La cuenta de servicio no tiene acceso al archivo: compártelo con su correo como lector.',
      404: 'No se encontró el archivo en Drive: revisa EXCEL_DRIVE_ID y que esté compartido con la cuenta de servicio.',
    },
  });
  const autorizada = (url) => google.autorizada(url);

  return {
    /** Correo de la cuenta de servicio (con quién hay que compartir el Excel). */
    cuenta: () => google.cuenta(),

    /** Nombre, tipo y fecha de última modificación del archivo. */
    async metadatos(archivoId) {
      if (!FORMATO_ID.test(archivoId || '')) throw new ErrorDrive('EXCEL_DRIVE_ID no tiene el formato de un id de Drive.');
      const url = `${API}/${archivoId}?fields=id,name,mimeType,modifiedTime,size&supportsAllDrives=true`;
      return (await autorizada(url)).json();
    },

    /** Contenido del archivo como .xlsx (Buffer), con tope de tamaño. */
    async descargar(meta) {
      let url;
      if (meta.mimeType === HOJA_GOOGLE) url = `${API}/${meta.id}/export?mimeType=${encodeURIComponent(XLSX)}`;
      else if (meta.mimeType === XLSX) url = `${API}/${meta.id}?alt=media&supportsAllDrives=true`;
      else throw new ErrorDrive('El archivo de Drive no es un Excel (.xlsx) ni una hoja de cálculo de Google.');

      const respuesta = await autorizada(url);
      const partes = [];
      let total = 0;
      for await (const parte of respuesta.body) {
        total += parte.length;
        if (total > MAX_BYTES) throw new ErrorDrive('El Excel de Drive es demasiado grande.');
        partes.push(Buffer.from(parte));
      }
      return Buffer.concat(partes);
    },
  };
}

module.exports = { crearClienteDrive, cargarCredenciales, ErrorDrive, HOJA_GOOGLE, FORMATO_ID };
