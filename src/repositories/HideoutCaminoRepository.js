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
const COLUMNAS = `h.id, h.camino, h.gremio, h.gremio_normalizado AS gremioNormalizado,
                  h.usuario_id AS usuarioId, u.usuario AS usuario,
                  h.creado_en AS creadoEn, h.confirmado_en AS confirmadoEn,
                  h.origen, h.en_excel AS enExcel`;

class HideoutCaminoRepository extends BaseRepository {
  /**
   * Crea el registro o, si el gremio ya estaba en ese camino, renueva su
   * confirmación. Desde el Excel (origen 'excel') nace ya marcado como
   * presente en el Excel.
   */
  guardar({ camino, gremio, gremioNormalizado, usuarioId = null, origen = 'web' }) {
    const enExcel = origen === 'excel' ? 1 : 0;
    const existente = this.db
      .prepare('SELECT id FROM hideouts_camino WHERE camino = $camino AND gremio_normalizado = $normalizado')
      .get({ $camino: camino, $normalizado: gremioNormalizado });
    if (existente) {
      this.db
        .prepare(`UPDATE hideouts_camino SET confirmado_en = datetime('now'), en_excel = MAX(en_excel, $enExcel) WHERE id = $id`)
        .run({ $id: existente.id, $enExcel: enExcel });
      return { ...this.obtener(existente.id), nuevo: false };
    }
    const info = this.db
      .prepare(
        `INSERT INTO hideouts_camino (camino, gremio, gremio_normalizado, usuario_id, origen, en_excel)
         VALUES ($camino, $gremio, $normalizado, $usuario, $origen, $enExcel)`
      )
      .run({ $camino: camino, $gremio: gremio, $normalizado: gremioNormalizado, $usuario: usuarioId, $origen: origen, $enExcel: enExcel });
    return { ...this.obtener(Number(info.lastInsertRowid)), nuevo: true };
  }

  /** El Excel ya tiene este gremio en ese camino. */
  marcarEnExcel(id) {
    this.db.prepare('UPDATE hideouts_camino SET en_excel = 1 WHERE id = $id').run({ $id: id });
  }

  /** Anotados en la web que todavía no están en el Excel (los más antiguos primero). */
  listarPendientesExcel(limite = 200) {
    return this.db
      .prepare(
        `SELECT ${COLUMNAS} FROM hideouts_camino h LEFT JOIN usuarios u ON u.id = h.usuario_id
         WHERE h.en_excel = 0 ORDER BY h.creado_en, h.id LIMIT $limite`
      )
      .all({ $limite: limite });
  }

  contarPendientesExcel() {
    return this.db.prepare('SELECT COUNT(*) AS total FROM hideouts_camino WHERE en_excel = 0').get().total;
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
