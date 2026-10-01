'use strict';

/**
 * paginacion.js
 * ----------------------------------------------------------------------
 * Tandas circulares: pasar de la última tanda lleva a la primera y
 * retroceder desde la primera lleva a la última. Sin DOM (se prueba en
 * Node: tests/paginacion.test.js).
 * ----------------------------------------------------------------------
 */

/**
 * @param {number} total   cuántos elementos hay
 * @param {number} pagina  tanda pedida (puede salirse del rango: da la vuelta)
 * @param {number} tamano  elementos por tanda
 * @returns {{pagina: number, paginas: number, desde: number, hasta: number}}
 *   `desde` incluido y `hasta` excluido, listos para slice().
 */
export function tanda(total, pagina, tamano) {
  const cuantos = Math.max(0, Math.floor(Number(total) || 0));
  const porTanda = Math.max(1, Math.floor(Number(tamano) || 1));
  const paginas = Math.max(1, Math.ceil(cuantos / porTanda));
  const pedida = Math.floor(Number(pagina) || 0);
  const actual = ((pedida % paginas) + paginas) % paginas;
  const desde = actual * porTanda;
  return { pagina: actual, paginas, desde, hasta: Math.min(cuantos, desde + porTanda) };
}

export default tanda;
