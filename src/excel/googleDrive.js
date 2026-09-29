'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * googleDrive.js
 * ----------------------------------------------------------------------
 * Descarga de un archivo privado de Google Drive con una cuenta de
 * servicio (sin dependencias: el token se firma con `crypto`).
 *
 * El archivo NO se publica con enlace: se comparte solo con el correo de
 * la cuenta de servicio, como lector. La clave de la cuenta (JSON) vive
 * únicamente en el servidor, fuera del repositorio (GOOGLE_CREDENCIALES).
 * El permiso pedido es de solo lectura (drive.readonly).
 *
 * Sirve tanto para un .xlsx subido a Drive como para una hoja de cálculo
 * de Google (se exporta como .xlsx).
 * ----------------------------------------------------------------------
 */

const ALCANCE = 'https://www.googleapis.com/auth/drive.readonly';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3/files';
const HOJA_GOOGLE = 'application/vnd.google-apps.spreadsheet';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 20 * 1024 * 1024;
const ESPERA_MS = 30_000;
const FORMATO_ID = /^[A-Za-z0-9_-]{10,200}$/;

class ErrorDrive extends Error {}

function base64url(datos) {
  return Buffer.from(datos).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

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
 * @param {{correo: string, clave: string}} credenciales
 * @param {{fetch?: Function, ahora?: () => number}} [opciones]
 */
function crearClienteDrive(credenciales, { fetch = globalThis.fetch, ahora = Date.now } = {}) {
  let token = null;

  async function pedir(url, opciones = {}) {
    let respuesta;
    try {
      respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(ESPERA_MS) });
    } catch (error) {
      throw new ErrorDrive('No se pudo conectar con Google Drive.');
    }
    if (!respuesta.ok) {
      const motivo = {
        401: 'Google rechazó las credenciales.',
        403: 'La cuenta de servicio no tiene acceso al archivo: compártelo con su correo como lector.',
        404: 'No se encontró el archivo en Drive: revisa EXCEL_DRIVE_ID y que esté compartido con la cuenta de servicio.',
      }[respuesta.status];
      throw new ErrorDrive(motivo || `Google Drive respondió con el código ${respuesta.status}.`);
    }
    return respuesta;
  }

  async function obtenerToken() {
    const segundos = Math.floor(ahora() / 1000);
    if (token && token.expira - 60 > segundos) return token.valor;
    const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const cuerpo = base64url(JSON.stringify({ iss: credenciales.correo, scope: ALCANCE, aud: URL_TOKEN, iat: segundos, exp: segundos + 3600 }));
    let firma;
    try {
      firma = crypto.createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(credenciales.clave);
    } catch (error) {
      throw new ErrorDrive('La clave privada de las credenciales de Google no es válida.');
    }
    const respuesta = await pedir(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${cabecera}.${cuerpo}.${base64url(firma)}`,
      }),
    });
    const datos = await respuesta.json();
    if (!datos.access_token) throw new ErrorDrive('Google no devolvió un token de acceso.');
    token = { valor: datos.access_token, expira: segundos + Number(datos.expires_in || 3600) };
    return token.valor;
  }

  async function autorizada(url) {
    return pedir(url, { headers: { Authorization: `Bearer ${await obtenerToken()}` } });
  }

  return {
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

module.exports = { crearClienteDrive, cargarCredenciales, ErrorDrive };
