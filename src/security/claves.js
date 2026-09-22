'use strict';

const crypto = require('crypto');

/**
 * claves.js
 * ----------------------------------------------------------------------
 * Derivación y verificación de contraseñas con scrypt (RFC 7914), el
 * algoritmo de derivación con coste de memoria que trae Node de fábrica.
 * Se elige sobre bcrypt/argon2 de npm para no introducir dependencias
 * binarias que compilar en el hosting, manteniendo resistencia real a
 * ataques por GPU.
 *
 * Formato almacenado:  scrypt$N$r$p$<sal_base64>$<hash_base64>
 * La sal es única por usuario, así que dos claves iguales producen
 * hashes distintos.
 * ----------------------------------------------------------------------
 */

const PARAMETROS = { N: 16384, r: 8, p: 1, longitud: 64 };
const LONGITUD_SAL = 16;

const REGLAS_CLAVE = {
  minimo: 10,
  maximo: 128,
};

/** Valida la robustez mínima exigida a una contraseña. */
function validarFortaleza(clave) {
  if (typeof clave !== 'string') return 'La contraseña es obligatoria.';
  if (clave.length < REGLAS_CLAVE.minimo) {
    return `La contraseña debe tener al menos ${REGLAS_CLAVE.minimo} caracteres.`;
  }
  if (clave.length > REGLAS_CLAVE.maximo) {
    return `La contraseña no puede superar los ${REGLAS_CLAVE.maximo} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(clave)) return 'La contraseña debe incluir al menos una letra.';
  if (!/[0-9]/.test(clave)) return 'La contraseña debe incluir al menos un número.';
  return null;
}

function derivar(clave, sal, { N, r, p, longitud }) {
  return crypto.scryptSync(clave.normalize('NFKC'), sal, longitud, {
    N,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  });
}

/** @returns {string} hash serializado, listo para guardar en la base. */
function hashear(clave) {
  const sal = crypto.randomBytes(LONGITUD_SAL);
  const hash = derivar(clave, sal, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return `scrypt$${N}$${r}$${p}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Comparación en tiempo constante: no filtra información por el tiempo
 * de respuesta sobre cuántos caracteres coinciden.
 */
function verificar(clave, almacenado) {
  if (typeof clave !== 'string' || typeof almacenado !== 'string') return false;

  const partes = almacenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const [, N, r, p, salB64, hashB64] = partes;
  let sal;
  let esperado;
  try {
    sal = Buffer.from(salB64, 'base64');
    esperado = Buffer.from(hashB64, 'base64');
  } catch (error) {
    return false;
  }

  let calculado;
  try {
    calculado = derivar(clave, sal, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      longitud: esperado.length,
    });
  } catch (error) {
    return false;
  }

  if (calculado.length !== esperado.length) return false;
  return crypto.timingSafeEqual(calculado, esperado);
}

/**
 * Hash señuelo: se ejecuta cuando el usuario no existe, para que el
 * tiempo de respuesta de "usuario inexistente" y "clave incorrecta" sea
 * equivalente y no se puedan enumerar cuentas.
 */
const HASH_SENUELO = hashear(crypto.randomBytes(24).toString('hex'));

function consumirTiempoSenuelo() {
  verificar('senuelo-invalido', HASH_SENUELO);
}

module.exports = {
  hashear,
  verificar,
  validarFortaleza,
  consumirTiempoSenuelo,
  REGLAS_CLAVE,
};
