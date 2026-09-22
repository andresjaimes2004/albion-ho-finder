'use strict';

const BaseRepository = require('./BaseRepository');
const Hideout = require('../models/Hideout');
const { normalizar } = require('./GremioRepository');
const db = require('../config/database');

/** Escapa % y _ para que no actúen como comodines de LIKE dentro del texto buscado. */
function escaparParaLike(texto) {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

class HideoutRepository extends BaseRepository {
  /**
   * Busca hideouts cuyo nombre de gremio contenga el texto dado
   * (substring, insensible a mayúsculas) dentro de una temporada.
   * Replica el comportamiento de la fórmula SEARCH() del Excel original.
   *
   * @param {string} textoBusqueda
   * @param {number} temporadaId
   * @returns {Hideout[]}
   */
  buscarPorGremio(textoBusqueda, temporadaId) {
    const patron = `%${escaparParaLike(normalizar(textoBusqueda))}%`;

    const filas = this.db
      .prepare(
        `SELECT m.nombre AS mapa, h.slot AS slot, g.nombre AS gremio, h.tipo AS tipo
         FROM hideouts h
         INNER JOIN mapas   m ON m.id = h.mapa_id
         INNER JOIN gremios g ON g.id = h.gremio_id
         WHERE h.temporada_id = $temporadaId
           AND g.nombre_normalizado LIKE $patron ESCAPE '\\'
         ORDER BY m.nombre ASC, h.slot ASC`
      )
      .all({ $temporadaId: temporadaId, $patron: patron });

    return filas.map((fila) => new Hideout(fila));
  }

  insertarLote(temporadaId, mapaId, hideouts) {
    const insertar = this.db.prepare(
      `INSERT INTO hideouts (temporada_id, mapa_id, gremio_id, slot, tipo)
       VALUES ($temporadaId, $mapaId, $gremioId, $slot, $tipo)
       ON CONFLICT (temporada_id, mapa_id, slot) DO UPDATE SET
         gremio_id = excluded.gremio_id,
         tipo      = excluded.tipo`
    );

    db.transaccion(() => {
      for (const registro of hideouts) {
        insertar.run({
          $temporadaId: temporadaId,
          $mapaId: mapaId,
          $gremioId: registro.gremioId,
          $slot: registro.slot,
          $tipo: registro.tipo,
        });
      }
    });
  }

  contarTotal(temporadaId) {
    return this.db
      .prepare('SELECT COUNT(*) AS total FROM hideouts WHERE temporada_id = $temporadaId')
      .get({ $temporadaId: temporadaId }).total;
  }
}

module.exports = HideoutRepository;
