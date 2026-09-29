'use strict';

const BaseRepository = require('./BaseRepository');
const { compactar, sqlCompacto } = require('./GremioRepository');

/**
 * HideoutCaminoRepository
 * ----------------------------------------------------------------------
 * Gremios con hideout en caminos de Avalon de hideouts, registrados por
 * los usuarios (tabla hideouts_camino).
 * ----------------------------------------------------------------------
 */
const COLUMNAS = `h.id, h.camino, h.gremio, h.usuario_id AS usuarioId, u.usuario AS usuario,
                  h.creado_en AS creadoEn, h.confirmado_en AS confirmadoEn`;

class HideoutCaminoRepository extends BaseRepository {
  /** Crea el registro o, si el gremio ya estaba en ese camino, renueva su confirmación. */
  guardar({ camino, gremio, gremioNormalizado, usuarioId }) {
    const existente = this.db
      .prepare('SELECT id FROM hideouts_camino WHERE camino = $camino AND gremio_normalizado = $normalizado')
      .get({ $camino: camino, $normalizado: gremioNormalizado });
    if (existente) {
      this.db
        .prepare(`UPDATE hideouts_camino SET confirmado_en = datetime('now') WHERE id = $id`)
        .run({ $id: existente.id });
      return { ...this.obtener(existente.id), nuevo: false };
    }
    const info = this.db
      .prepare(
        `INSERT INTO hideouts_camino (camino, gremio, gremio_normalizado, usuario_id)
         VALUES ($camino, $gremio, $normalizado, $usuario)`
      )
      .run({ $camino: camino, $gremio: gremio, $normalizado: gremioNormalizado, $usuario: usuarioId });
    return { ...this.obtener(Number(info.lastInsertRowid)), nuevo: true };
  }

  obtener(id) {
    return this.db
      .prepare(`SELECT ${COLUMNAS} FROM hideouts_camino h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE h.id = $id`)
      .get({ $id: id });
  }

  listarPorCamino(camino) {
    return this.db
      .prepare(
        `SELECT ${COLUMNAS} FROM hideouts_camino h LEFT JOIN usuarios u ON u.id = h.usuario_id
         WHERE h.camino = $camino ORDER BY h.gremio COLLATE NOCASE`
      )
      .all({ $camino: camino });
  }

  /** Todos, para anotar las rutas que terminan en un camino de hideouts. */
  listarTodos() {
    return this.db
      .prepare(`SELECT ${COLUMNAS} FROM hideouts_camino h LEFT JOIN usuarios u ON u.id = h.usuario_id ORDER BY h.gremio COLLATE NOCASE`)
      .all();
  }

  /** Por parte del nombre del gremio (ya normalizado), también sin espacios. */
  buscarPorGremio(textoNormalizado, limite = 50) {
    const compacto = compactar(textoNormalizado);
    return this.db
      .prepare(
        `SELECT ${COLUMNAS} FROM hideouts_camino h LEFT JOIN usuarios u ON u.id = h.usuario_id
         WHERE instr(h.gremio_normalizado, $texto) > 0
            OR ($compacto <> '' AND instr(${sqlCompacto('h.gremio_normalizado')}, $compacto) > 0)
         ORDER BY h.camino, h.gremio COLLATE NOCASE
         LIMIT $limite`
      )
      .all({ $texto: textoNormalizado, $compacto: compacto.length >= 2 ? compacto : '', $limite: limite });
  }

  eliminar(id) {
    return this.db.prepare('DELETE FROM hideouts_camino WHERE id = $id').run({ $id: id }).changes > 0;
  }
}

module.exports = HideoutCaminoRepository;
