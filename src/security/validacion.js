'use strict';

/**
 * validacion.js
 * ----------------------------------------------------------------------
 * Validadores de entrada reutilizables. Toda la información que llega
 * del cliente (query, body o parámetros de ruta) pasa por aquí antes de
 * tocar la capa de datos: se comprueba tipo, longitud y rango, y se
 * rechaza cualquier cosa fuera de lo esperado.
 *
 * Esto es la primera barrera; la segunda es que el 100% de las consultas
 * SQL usan sentencias preparadas con parámetros nombrados (ver
 * repositorios), por lo que el contenido nunca se concatena al SQL.
 * ----------------------------------------------------------------------
 */

class ErrorValidacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorValidacion';
    this.estado = 400;
    this.publico = true;
  }
}

/** Elimina caracteres de control invisibles y normaliza espacios. */
function limpiar(texto) {
  return String(texto)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function texto(valor, campo, { min = 1, max = 120, obligatorio = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new ErrorValidacion(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  if (typeof valor !== 'string') throw new ErrorValidacion(`El campo "${campo}" debe ser texto.`);

  const limpio = limpiar(valor);
  if (limpio.length < min) {
    throw new ErrorValidacion(`El campo "${campo}" debe tener al menos ${min} caracteres.`);
  }
  if (limpio.length > max) {
    throw new ErrorValidacion(`El campo "${campo}" no puede superar ${max} caracteres.`);
  }
  return limpio;
}

function entero(valor, campo, { min = -Infinity, max = Infinity, obligatorio = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new ErrorValidacion(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  const numero = Number(valor);
  if (!Number.isInteger(numero)) {
    throw new ErrorValidacion(`El campo "${campo}" debe ser un número entero.`);
  }
  if (numero < min || numero > max) {
    throw new ErrorValidacion(`El campo "${campo}" debe estar entre ${min} y ${max}.`);
  }
  return numero;
}

function decimal(valor, campo, { min = -Infinity, max = Infinity, obligatorio = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new ErrorValidacion(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    throw new ErrorValidacion(`El campo "${campo}" debe ser un número.`);
  }
  if (numero < min || numero > max) {
    throw new ErrorValidacion(`El campo "${campo}" debe estar entre ${min} y ${max}.`);
  }
  return numero;
}

function opcion(valor, campo, permitidos, { obligatorio = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new ErrorValidacion(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  const limpio = String(valor).trim().toUpperCase();
  if (!permitidos.includes(limpio)) {
    throw new ErrorValidacion(`El campo "${campo}" solo admite: ${permitidos.join(', ')}.`);
  }
  return limpio;
}

/** Nombre de usuario: letras, números, punto, guion y guion bajo. */
function nombreUsuario(valor) {
  const limpio = texto(valor, 'usuario', { min: 3, max: 32 });
  if (!/^[a-zA-Z0-9._-]+$/.test(limpio)) {
    throw new ErrorValidacion('El usuario solo admite letras, números, punto, guion y guion bajo.');
  }
  return limpio;
}

module.exports = {
  ErrorValidacion,
  limpiar,
  texto,
  entero,
  decimal,
  opcion,
  nombreUsuario,
};
