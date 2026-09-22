'use strict';

const BaseRepository = require('./BaseRepository');
const Hideout = require('../models/Hideout');
const { normalizar } = require('./GremioRepository');
const db = require('../config/database');

/** Escapa % y _ para que no actúen como comodines de LIKE dentro del texto buscado. */
function escaparParaLike(texto) {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

const SELECCION = `h.id AS id, m.nombre AS mapa, h.slot AS slot, g.nombre AS gremio,
                   h.tipo AS tipo, h.pos_x AS posX, h.pos_y AS posY, h.nota AS nota,
                   g.id AS gremioId, m.id AS mapaId,
                   (g.logo_mime IS NOT NULL) AS tieneLogo`;

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
        `SELECT ${SELECCION}
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

  /** Todos los hideouts de un mapa concreto (para el detalle del mapa). */
  listarPorMapa(nombreMapa, temporadaId) {
    const filas = this.db
      .prepare(
        `SELECT ${SELECCION}
         FROM hideouts h
         INNER JOIN mapas   m ON m.id = h.mapa_id
         INNER JOIN gremios g ON g.id = h.gremio_id
         WHERE h.temporada_id = $temporadaId
           AND m.nombre = $mapa
         ORDER BY h.slot ASC`
      )
      .all({ $temporadaId: temporadaId, $mapa: nombreMapa });

    return filas.map((fila) => new Hideout(fila));
  }

  obtenerPorId(id) {
    const fila = this.db
      .prepare(
        `SELECT ${SELECCION}, h.temporada_id AS temporadaId
         FROM hideouts h
         INNER JOIN mapas   m ON m.id = h.mapa_id
         INNER JOIN gremios g ON g.id = h.gremio_id
         WHERE h.id = $id`
      )
      .get({ $id: id });
    return fila ? new Hideout(fila) : null;
  }

  crear({ temporadaId, mapaId, gremioId, slot, tipo = 'ESTANDAR' }) {
    const info = this.db
      .prepare(
        `INSERT INTO hideouts (temporada_id, mapa_id, gremio_id, slot, tipo, actualizado_en)
         VALUES ($temporadaId, $mapaId, $gremioId, $slot, $tipo, datetime('now'))`
      )
      .run({
        $temporadaId: temporadaId,
        $mapaId: mapaId,
        $gremioId: gremioId,
        $slot: slot,
        $tipo: tipo,
      });
    return this.obtenerPorId(Number(info.lastInsertRowid));
  }

  actualizar(id, { gremioId, slot, tipo, nota }) {
    this.db
      .prepare(
        `UPDATE hideouts SET
            gremio_id = COALESCE($gremioId, gremio_id),
            slot      = COALESCE($slot, slot),
            tipo      = COALESCE($tipo, tipo),
            nota      = COALESCE($nota, nota),
            actualizado_en = datetime('now')
         WHERE id = $id`
      )
      .run({
        $id: id,
        $gremioId: gremioId ?? null,
        $slot: slot ?? null,
        $tipo: tipo ?? null,
        $nota: nota ?? null,
      });
    return this.obtenerPorId(id);
  }

  /**
   * Fija (o borra, con null) la posición del hideout dentro del mapa.
   * Esta coordenada no existe en los dumps del juego: la marca un
   * administrador sobre el mapa real del cluster.
   */
  actualizarPosicion(id, posX, posY) {
    this.db
      .prepare(
        `UPDATE hideouts SET pos_x = $x, pos_y = $y, actualizado_en = datetime('now')
         WHERE id = $id`
      )
      .run({ $id: id, $x: posX, $y: posY });
    return this.obtenerPorId(id);
  }

  eliminar(id) {
    this.db.prepare('DELETE FROM hideouts WHERE id = $id').run({ $id: id });
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

  /** Mapas de la temporada que tienen al menos un hideout registrado. */
  listarMapasConHideouts(temporadaId) {
    return this.db
      .prepare(
        `SELECT m.nombre AS mapa, COUNT(*) AS total
         FROM hideouts h
         INNER JOIN mapas m ON m.id = h.mapa_id
         WHERE h.temporada_id = $temporadaId
         GROUP BY m.nombre
         ORDER BY m.nombre ASC`
      )
      .all({ $temporadaId: temporadaId });
  }
}

module.exports = HideoutRepository;
