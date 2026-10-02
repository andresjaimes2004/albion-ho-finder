'use strict';

/**
 * Configuración del .env que se publica en el sitio (Discord, correo,
 * Ko-fi, Bre-B), el lector del .env y el script de verificación.
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const enlaces = require('../src/config/enlacesPublicos');
const { leerArchivoEntorno } = require('../src/config/entorno');

test('la invitación de Discord se acepta como se suele copiar y se publica limpia; un perfil o un dominio falso, no', () => {
  const validas = [
    ['https://discord.gg/AbC123', 'https://discord.gg/AbC123'],
    ['discord.gg/AbC123', 'https://discord.gg/AbC123'],
    ['https://discord.gg/AbC123/', 'https://discord.gg/AbC123'],
    ['https://discord.com/invite/abc-123', 'https://discord.gg/abc-123'],
    ['https://www.discord.com/invite/abc-123?event=1', 'https://discord.gg/abc-123'],
    ['http://discordapp.com/invite/Gremio', 'https://discord.gg/Gremio'],
  ];
  for (const [entrada, salida] of validas) assert.equal(enlaces.discord(entrada), salida, entrada);
  for (const mala of [
    'https://discord.com/users/123456789012345678', // perfil personal: el enlace es al grupo
    'https://discord.gg.evil.com/abc',
    'https://evil.com/discord.gg/abc',
    'javascript:alert(1)',
    'https://discord.gg/<script>',
    '',
  ]) {
    assert.equal(enlaces.discord(mala), null, mala);
  }
});

test('Ko-fi, correo y llave Bre-B: formas habituales aceptadas, lo raro rechazado', () => {
  assert.equal(enlaces.kofi('https://ko-fi.com/albionnavigator'), 'https://ko-fi.com/albionnavigator');
  assert.equal(enlaces.kofi('ko-fi.com/albionnavigator/'), 'https://ko-fi.com/albionnavigator');
  assert.equal(enlaces.kofi('https://www.ko-fi.com/albion_nav'), 'https://ko-fi.com/albion_nav');
  assert.equal(enlaces.kofi('https://evil.example/ko-fi.com/x'), null);
  assert.equal(enlaces.kofi('https://ko-fi.com.evil.com/x'), null);

  assert.equal(enlaces.correo('soporte@albionnavigator.com'), 'soporte@albionnavigator.com');
  assert.equal(enlaces.correo('mailto:soporte@albionnavigator.com'), 'soporte@albionnavigator.com');
  for (const malo of ['sin-arroba', 'x@y.z"><script>', 'a@b.com?cc=otro@c.com', 'a b@c.com']) {
    assert.equal(enlaces.correo(malo), null, malo);
  }

  assert.equal(enlaces.llaveBreb('@albionnavigator'), '@albionnavigator');
  assert.equal(enlaces.llaveBreb('300 123 4567'), '3001234567');
  assert.equal(enlaces.llaveBreb('<script>alert(1)</script>'), null);
});

test('el .env: gana la última aparición, se quitan comillas y comentarios al final', () => {
  const ruta = path.join(os.tmpdir(), `albion-env-${Date.now()}.env`);
  fs.writeFileSync(
    ruta,
    [
      '# Copiado de .env.example (con las líneas vacías)',
      'DONAR_KOFI_URL=',
      'DISCORD_URL=',
      '',
      '# Valores añadidos al final',
      'DONAR_KOFI_URL=https://ko-fi.com/albionnavigator',
      'DISCORD_URL="https://discord.gg/AbC123"',
      "CONTACTO_CORREO='soporte@albionnavigator.com'",
      'DONAR_BREB_LLAVE=@albionnavigator   # llave alfanumérica',
      'export SITIO_URL=https://albionho.duckdns.org',
    ].join('\n')
  );
  try {
    const valores = leerArchivoEntorno(ruta);
    assert.equal(valores.DONAR_KOFI_URL, 'https://ko-fi.com/albionnavigator', 'la última gana, no la vacía');
    assert.equal(valores.DISCORD_URL, 'https://discord.gg/AbC123');
    assert.equal(valores.CONTACTO_CORREO, 'soporte@albionnavigator.com');
    assert.equal(valores.DONAR_BREB_LLAVE, '@albionnavigator');
    assert.equal(valores.SITIO_URL, 'https://albionho.duckdns.org');
  } finally {
    fs.rmSync(ruta, { force: true });
  }
});

test('npm run config:verificar dice qué está activo y no imprime otros secretos', () => {
  const salida = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'verificarConfig.js')], {
    env: {
      ...process.env,
      DISCORD_URL: 'discord.gg/AbC123',
      CONTACTO_CORREO: 'soporte@albionnavigator.com',
      DONAR_KOFI_URL: 'https://evil.example/x',
      DONAR_BREB_LLAVE: '',
      SESION_SECRETO_DE_PRUEBA: 'no-debe-salir-123',
    },
    encoding: 'utf8',
  });
  assert.match(salida, /✔ DISCORD_URL: https:\/\/discord\.gg\/AbC123/);
  assert.match(salida, /✔ CONTACTO_CORREO: soporte@albionnavigator\.com/);
  assert.match(salida, /✘ DONAR_KOFI_URL: el valor no es válido/);
  assert.doesNotMatch(salida, /evil\.example/, 'no repite el valor inválido');
  assert.match(salida, /· DONAR_BREB_LLAVE: sin valor/);
  assert.match(salida, /2 de 4 activas/);
  assert.doesNotMatch(salida, /no-debe-salir-123/);
});
