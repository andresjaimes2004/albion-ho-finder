'use strict';

/**
 * verificarConfig.js  (npm run config:verificar)
 * ----------------------------------------------------------------------
 * Comprueba los datos públicos del .env que se muestran en el sitio
 * (Discord, correo de contacto, Ko-fi, llave y QR de Bre-B) y dice cuáles
 * quedarán activos al reiniciar. Solo muestra estos valores, que son
 * públicos (aparecen en el sitio); nunca imprime el resto del .env
 * (claves, credenciales…). Si un valor no es válido, dice qué formato
 * espera sin repetir lo escrito.
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const cargarEntorno = require('../src/config/entorno');
const enlaces = require('../src/config/enlacesPublicos');

const RUTA_ENV = path.join(__dirname, '..', '.env');
const antes = new Set(Object.keys(process.env));
cargarEntorno(RUTA_ENV);

const VARIABLES = [
  {
    nombre: 'DISCORD_URL',
    leer: () => enlaces.discord(),
    formato: 'https://discord.gg/xxxx o https://discord.com/invite/xxxx (invitación al grupo)',
    donde: 'icono del pie y tarjeta de Contáctanos',
  },
  {
    nombre: 'CONTACTO_CORREO',
    leer: () => enlaces.correo(),
    formato: 'nombre@dominio.com',
    donde: 'Contáctanos, Política de privacidad y Términos',
  },
  {
    nombre: 'DONAR_KOFI_URL',
    leer: () => enlaces.kofi(),
    formato: 'https://ko-fi.com/tu_usuario',
    donde: 'botón "Donar con Ko-fi" en Apoyar',
  },
  {
    nombre: 'DONAR_BREB_LLAVE',
    leer: () => enlaces.llaveBreb(),
    formato: '@tullave (o celular, cédula o correo)',
    donde: 'tarjeta Bre-B en Apoyar',
  },
];

// Variables repetidas en el .env: se usa la última, pero conviene saberlo.
const repetidas = new Map();
if (fs.existsSync(RUTA_ENV)) {
  for (const linea of fs.readFileSync(RUTA_ENV, 'utf8').split(/\r?\n/)) {
    const m = linea.trim().match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/);
    if (m) repetidas.set(m[1], (repetidas.get(m[1]) || 0) + 1);
  }
} else {
  console.log(`No hay archivo .env en ${RUTA_ENV}`);
}

let activas = 0;
for (const v of VARIABLES) {
  const crudo = String(process.env[v.nombre] || '').trim();
  const valor = v.leer();
  let linea;
  if (valor) {
    activas += 1;
    linea = `✔ ${v.nombre}: ${valor}  → ${v.donde}`;
  } else if (!crudo) {
    linea = `· ${v.nombre}: sin valor ("muy pronto" en el sitio)`;
  } else {
    linea = `✘ ${v.nombre}: el valor no es válido. Formato esperado: ${v.formato}`;
  }
  if (antes.has(v.nombre)) linea += '  (definida en el sistema: tiene prioridad sobre el .env)';
  if ((repetidas.get(v.nombre) || 0) > 1) linea += `  (aparece ${repetidas.get(v.nombre)} veces en el .env: se usa la última)`;
  console.log(linea);
}

const llave = enlaces.llaveBreb();
if (llave) {
  console.log(
    enlaces.hayQrBreb()
      ? '✔ QR de Bre-B: public/assets/qr-breb.png'
      : '· QR de Bre-B: no está (opcional). Súbelo como public/assets/qr-breb.png para mostrarlo.'
  );
}

console.log(`\n${activas} de ${VARIABLES.length} activas. Tras cambiar el .env: sudo systemctl restart albion`);
