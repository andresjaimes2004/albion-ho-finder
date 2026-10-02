'use strict';

const fs = require('fs');
const path = require('path');

/**
 * entorno.js
 * ----------------------------------------------------------------------
 * Carga de variables de entorno desde un archivo .env (reemplazo propio
 * de dotenv, para no depender de paquetes externos). Las variables ya
 * definidas en el sistema tienen prioridad y nunca se sobrescriben.
 *
 * Dentro del archivo, si una variable aparece varias veces gana la última
 * (como en dotenv): así, copiar .env.example (con las líneas vacías) y
 * añadir los valores al final funciona. En valores sin comillas, lo que
 * va tras " #" es un comentario.
 * ----------------------------------------------------------------------
 */

/** Lee un .env y devuelve { clave: valor } (la última aparición gana). */
function leerArchivoEntorno(ruta) {
  const valores = {};
  for (const lineaCruda of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    if (!linea || linea.startsWith('#')) continue;

    const separador = linea.indexOf('=');
    if (separador < 1) continue;

    const clave = linea.slice(0, separador).replace(/^export\s+/, '').trim();
    let valor = linea.slice(separador + 1).trim();

    if (
      valor.length >= 2 &&
      ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'")))
    ) {
      valor = valor.slice(1, -1);
    } else {
      valor = valor.replace(/\s+#.*$/, '');
    }
    valores[clave] = valor;
  }
  return valores;
}

function cargarEntorno(ruta = path.join(__dirname, '..', '..', '.env')) {
  if (!fs.existsSync(ruta)) return {};

  const cargadas = {};
  for (const [clave, valor] of Object.entries(leerArchivoEntorno(ruta))) {
    if (process.env[clave] === undefined) {
      process.env[clave] = valor;
      cargadas[clave] = valor;
    }
  }
  return cargadas;
}

module.exports = cargarEntorno;
module.exports.leerArchivoEntorno = leerArchivoEntorno;
