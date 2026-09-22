'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * BusquedaRepository
 * ----------------------------------------------------------------------
 * Historial de búsquedas por usuario. Guarda el término buscado y el
 * tamaño del resultado; nunca se comparte entre usuarios (todas las
 * consultas filtran por usuario_id).
 * ----------------------------------------------------------------------
 */
const LIMITE_HISTORIAL = 20;

class BusquedaRepository extends BaseRepository {
  registrar({ usuarioId, termino, totalMapas = 0, totalHideouts = 0 }) {
    // Si el usuario repite la misma búsqueda, se actualiza la existente
    // para que el historial no se llene de duplicados consecutivos.
    this.db
      .prepare(
        `DELETE FROM busquedas
         WHERE usuario_id = $usuario AND lower(termino) = lower($termino)`
      )
      .run({ $usuario: usuarioId, $termino: termino });

    this.db
      .prepare(
        `INSERT INTO busquedas (usuario_id, termino, total_mapas, total_hideouts)
         VALUES ($usuario, $termino, $mapas, $hideouts)`
      )
      .run({
        $usuario: usuarioId,
        $termino: termino,
        $mapas: totalMapas,
        $hideouts: totalHideouts,
      });

    // Conserva solo las últimas N búsquedas del usuario.
    this.db
      .prepare(
        `DELETE FROM busquedas
         WHERE usuario_id = $usuario
           AND id NOT IN (
             SELECT id FROM busquedas
             WHERE usuario_id = $usuario
             ORDER BY creado_en DESC, id DESC
             LIMIT $limite
           )`
      )
      .run({ $usuario: usuarioId, $limite: LIMITE_HISTORIAL });
  }

  listar(usuarioId, limite = LIMITE_HISTORIAL) {
    return this.db
      .prepare(
        `SELECT termino, total_mapas AS totalMapas, total_hideouts AS totalHideouts,
                creado_en AS creadoEn
         FROM busquedas
         WHERE usuario_id = $usuario
         ORDER BY creado_en DESC, id DESC
         LIMIT $limite`
      )
      .all({ $usuario: usuarioId, $limite: limite });
  }

  limpiar(usuarioId) {
    this.db.prepare('DELETE FROM busquedas WHERE usuario_id = $usuario').run({ $usuario: usuarioId });
  }
}

module.exports = BusquedaRepository;
module.exports.LIMITE_HISTORIAL = LIMITE_HISTORIAL;
