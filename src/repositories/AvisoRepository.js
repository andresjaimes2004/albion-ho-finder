'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * AvisoRepository
 * ----------------------------------------------------------------------
 * Avisos para cada usuario (tabla avisos): cambios en sus espacios
 * privados que debe ver aunque no haya recargado la página. Cada usuario
 * solo lee y marca los suyos (todas las consultas filtran por usuario_id).
 * ----------------------------------------------------------------------
 */
const MAX_DATOS = 2000;

class AvisoRepository extends BaseRepository {
  crear(usuarioId, tipo, datos = {}) {
    const json = JSON.stringify(datos).slice(0, MAX_DATOS);
    this.db
      .prepare('INSERT INTO avisos (usuario_id, tipo, datos) VALUES ($usuario, $tipo, $datos)')
      .run({ $usuario: usuarioId, $tipo: tipo, $datos: json });
  }

  /** Los no leídos del usuario, los más antiguos primero. */
  listarNoLeidos(usuarioId, limite = 20) {
    return this.db
      .prepare(
        `SELECT id, tipo, datos, creado_en AS creadoEn FROM avisos
         WHERE usuario_id = $usuario AND leido = 0
         ORDER BY id LIMIT $limite`
      )
      .all({ $usuario: usuarioId, $limite: limite })
      .map((fila) => {
        let datos = {};
        try {
          datos = JSON.parse(fila.datos);
        } catch (error) {
          // Datos dañados: el aviso se muestra sin detalles.
        }
        return { id: fila.id, tipo: fila.tipo, datos, creadoEn: fila.creadoEn };
      });
  }

  /** Marca como leídos solo los avisos de ese usuario. */
  marcarLeidos(usuarioId, ids) {
    const marcar = this.db.prepare('UPDATE avisos SET leido = 1 WHERE id = $id AND usuario_id = $usuario');
    let total = 0;
    for (const id of ids) total += marcar.run({ $id: id, $usuario: usuarioId }).changes;
    return total;
  }

  /** Borra los avisos anteriores a `limiteSqlite` ("AAAA-MM-DD HH:MM:SS", UTC). */
  purgarAntesDe(limiteSqlite) {
    return this.db.prepare('DELETE FROM avisos WHERE creado_en < $limite').run({ $limite: limiteSqlite }).changes;
  }
}

module.exports = AvisoRepository;
