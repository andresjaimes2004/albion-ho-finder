'use strict';

const fs = require('fs');
const path = require('path');

/**
 * enlacesPublicos.js
 * ----------------------------------------------------------------------
 * Los datos públicos que se configuran en el .env del servidor y se
 * muestran en el sitio:
 *
 *   DISCORD_URL       invitación al grupo (servidor) de Discord
 *   CONTACTO_CORREO   correo de contacto
 *   DONAR_KOFI_URL    página de Ko-fi
 *   DONAR_BREB_LLAVE  llave Bre-B (y el QR en public/assets/qr-breb.png)
 *
 * Cada valor se valida y se normaliza: se aceptan las formas habituales de
 * copiarlo (con o sin https://, con www., con barra final, la llave con
 * espacios) y se publica siempre en una forma limpia construida aquí. Un
 * valor inválido o vacío se trata como "sin configurar" (la opción sale
 * como "muy pronto" o no aparece) en vez de publicar algo raro.
 * ----------------------------------------------------------------------
 */

const QR_BREB = path.join(__dirname, '..', '..', 'public', 'assets', 'qr-breb.png');

const leer = (nombre) => String(process.env[nombre] || '').trim();
const sinEsquema = (valor) => valor.replace(/^https?:\/\//i, '').replace(/^www\./i, '');

/** Invitación a un grupo de Discord → https://discord.gg/<código>, o null. */
function discord(valor = leer('DISCORD_URL')) {
  const m = sinEsquema(valor).match(/^(?:discord\.gg\/|(?:discord|discordapp)\.com\/invite\/)([A-Za-z0-9-]{2,32})\/?(?:[?#].*)?$/i);
  return m ? `https://discord.gg/${m[1]}` : null;
}

/** Correo corriente (sin espacios, comillas ni nada que rompa el HTML), o null. */
function correo(valor = leer('CONTACTO_CORREO')) {
  const limpio = valor.replace(/^mailto:/i, '');
  return /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(limpio) ? limpio : null;
}

/** Página de Ko-fi → https://ko-fi.com/<usuario>, o null. */
function kofi(valor = leer('DONAR_KOFI_URL')) {
  const m = sinEsquema(valor).match(/^ko-fi\.com\/([A-Za-z0-9_]{2,40})\/?(?:[?#].*)?$/i);
  return m ? `https://ko-fi.com/${m[1]}` : null;
}

/**
 * Llave Bre-B: alfanumérica (@nombre), celular, cédula o correo. Los
 * espacios se quitan (un celular copiado como "300 123 4567").
 */
function llaveBreb(valor = leer('DONAR_BREB_LLAVE')) {
  const limpia = valor.replace(/\s+/g, '');
  return /^[@A-Za-z0-9._+-]{3,60}$/.test(limpia) ? limpia : null;
}

function hayQrBreb() {
  return fs.existsSync(QR_BREB);
}

module.exports = { discord, correo, kofi, llaveBreb, hayQrBreb, QR_BREB };
