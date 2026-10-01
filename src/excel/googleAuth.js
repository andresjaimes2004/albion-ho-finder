'use strict';

const crypto = require('crypto');

/**
 * googleAuth.js
 * ----------------------------------------------------------------------
 * Identidad ante las APIs de Google con una cuenta de servicio, sin
 * dependencias. La comparten el cliente de Drive (lectura del Excel) y el
 * de Hojas de cálculo (agregar gremios de caminos de hideouts).
 *
 *  - Sin claves (recomendado): la cuenta de servicio está vinculada a la
 *    VM de Compute Engine y el token temporal se pide al servidor de
 *    metadatos de la propia VM. Los permisos son los alcances que se
 *    fijaron al vincularla.
 *  - Con clave JSON (GOOGLE_CREDENCIALES): el token se firma con `crypto`
 *    pidiendo solo el alcance de cada cliente. Para ejecutar fuera de
 *    Google Cloud.
 * ----------------------------------------------------------------------
 */

const URL_TOKEN = 'https://oauth2.googleapis.com/token';
// Servidor de metadatos de Compute Engine (solo accesible desde la VM).
const METADATOS = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';
const ESPERA_MS = 30_000;

class ErrorDrive extends Error {}

function base64url(datos) {
  return Buffer.from(datos).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * @param {{correo: string, clave: string} | null} credenciales  null = la
 *   cuenta de servicio vinculada a la VM.
 * @param {object} opciones
 *   - alcance: el alcance OAuth que se pide al firmar con clave.
 *   - mensajes: { sinAlcance, 401, 403, 404 } para los errores de la API.
 *   - fetch, ahora: inyectables en las pruebas.
 */
function crearAutenticacion(credenciales, { alcance, mensajes = {}, fetch = globalThis.fetch, ahora = Date.now } = {}) {
  let token = null;

  async function pedir(url, opciones = {}) {
    let respuesta;
    try {
      respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(ESPERA_MS) });
    } catch (error) {
      throw new ErrorDrive(mensajes.conexion || 'No se pudo conectar con Google.');
    }
    if (!respuesta.ok) {
      let detalle = '';
      try {
        detalle = JSON.stringify(await respuesta.json());
      } catch (error) {
        // Sin cuerpo JSON: basta con el código.
      }
      // 403 porque la VM no tiene ese alcance, no porque falte compartir el archivo.
      if (respuesta.status === 403 && /scope/i.test(detalle) && mensajes.sinAlcance) {
        throw new ErrorDrive(mensajes.sinAlcance);
      }
      const motivo = { 401: 'Google rechazó las credenciales.', ...mensajes }[respuesta.status];
      throw new ErrorDrive(motivo || `Google respondió con el código ${respuesta.status}.`);
    }
    return respuesta;
  }

  /** Pide algo al servidor de metadatos de la VM. */
  async function metadatosVm(ruta) {
    let respuesta;
    try {
      respuesta = await fetch(`${METADATOS}/${ruta}`, {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      throw new ErrorDrive(
        'No se pudo obtener la identidad de la VM: esto solo funciona dentro de Google Cloud. Fuera de él, usa GOOGLE_CREDENCIALES.'
      );
    }
    if (respuesta.status === 404) throw new ErrorDrive('La VM no tiene ninguna cuenta de servicio vinculada (ver README).');
    if (!respuesta.ok) throw new ErrorDrive(`El servidor de metadatos de la VM respondió con el código ${respuesta.status}.`);
    return respuesta;
  }

  async function obtenerToken() {
    const segundos = Math.floor(ahora() / 1000);
    if (token && token.expira - 60 > segundos) return token.valor;
    if (!credenciales) {
      // Sin claves: la VM entrega un token temporal de su cuenta de servicio,
      // con los alcances fijados al vincularla (ver README).
      const datos = await (await metadatosVm('token')).json();
      if (!datos.access_token) throw new ErrorDrive('La VM no devolvió un token de acceso.');
      token = { valor: datos.access_token, expira: segundos + Number(datos.expires_in || 300) };
      return token.valor;
    }
    const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const cuerpo = base64url(JSON.stringify({ iss: credenciales.correo, scope: alcance, aud: URL_TOKEN, iat: segundos, exp: segundos + 3600 }));
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

  return {
    pedir,

    /** Petición a la API con el token de la cuenta de servicio. */
    async autorizada(url, opciones = {}) {
      const cabeceras = { ...(opciones.headers || {}), Authorization: `Bearer ${await obtenerToken()}` };
      return pedir(url, { ...opciones, headers: cabeceras });
    },

    /** Correo de la cuenta de servicio (con quién hay que compartir el archivo). */
    async cuenta() {
      if (credenciales) return credenciales.correo;
      return (await (await metadatosVm('email')).text()).trim();
    },
  };
}

module.exports = { crearAutenticacion, ErrorDrive };
