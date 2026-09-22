'use strict';

const fs = require('fs');
const path = require('path');

/**
 * entorno.js
 * ----------------------------------------------------------------------
 * Carga de variables de entorno desde un archivo .env (reemplazo propio
 * de dotenv, para no depender de paquetes externos). Las variables ya
 * definidas en el sistema tienen prioridad y nunca se sobrescriben.
 * ----------------------------------------------------------------------
 */
function cargarEntorno(ruta = path.join(__dirname, '..', '..', '.env')) {
  if (!fs.existsSync(ruta)) return {};

  const contenido = fs.readFileSync(ruta, 'utf8');
  const cargadas = {};

  for (const lineaCruda of contenido.split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    if (!linea || linea.startsWith('#')) continue;

    const separador = linea.indexOf('=');
    if (separador < 1) continue;

    const clave = linea.slice(0, separador).trim();
    let valor = linea.slice(separador + 1).trim();

    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    if (process.env[clave] === undefined) {
      process.env[clave] = valor;
      cargadas[clave] = valor;
    }
  }

  return cargadas;
}

module.exports = cargarEntorno;
