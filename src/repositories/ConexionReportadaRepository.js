'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * ConexionReportadaRepository
 * ----------------------------------------------------------------------
 * Conexiones de caminos de Avalon registradas por los usuarios a partir
 * de capturas del juego. Las fechas se guardan como ISO 8601 en UTC, que
 * se comparan bien como texto.
 * ----------------------------------------------------------------------
 */
class ConexionReportadaRepository extends BaseRepository {
  crear({ origen, destino, cierraEn, usuarioId }) {
    const info = this.db
      .prepare(
        `INSERT INTO conexiones_reportadas (origen, destino, cierra_en, usuario_id)
         VALUES ($origen, $destino, $cierra, $usuario)`
      )
      .run({ $origen: origen, $destino: destino, $cierra: cierraEn, $usuario: usuarioId });
    return this.obtener(Number(info.lastInsertRowid));
  }

  /** Conexión vigente entre las mismas dos zonas, en cualquier sentido. */
  buscarVigenteEntre(zonaA, zonaB, ahoraIso) {
    return this.db
      .prepare(
        `SELECT id FROM conexiones_reportadas
         WHERE cierra_en > $ahora
           AND ((origen = $a AND destino = $b) OR (origen = $b AND destino = $a))
         ORDER BY cierra_en DESC
         LIMIT 1`
      )
      .get({ $ahora: ahoraIso, $a: zonaA, $b: zonaB });
  }

  actualizar(id, { origen, destino, cierraEn, usuarioId }) {
    this.db
      .prepare(
        `UPDATE conexiones_reportadas
         SET origen = $origen, destino = $destino, cierra_en = $cierra,
             usuario_id = $usuario, creado_en = datetime('now')
         WHERE id = $id`
      )
      .run({ $id: id, $origen: origen, $destino: destino, $cierra: cierraEn, $usuario: usuarioId });
    return this.obtener(id);
  }

  obtener(id) {
    return this.db
      .prepare(
        `SELECT c.id, c.origen, c.destino, c.cierra_en AS cierraEn, c.creado_en AS creadoEn,
                c.usuario_id AS usuarioId, u.usuario AS usuario
         FROM conexiones_reportadas c
         LEFT JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.id = $id`
      )
      .get({ $id: id });
  }

  listarVigentes(ahoraIso) {
    return this.db
      .prepare(
        `SELECT c.id, c.origen, c.destino, c.cierra_en AS cierraEn, c.creado_en AS creadoEn,
                c.usuario_id AS usuarioId, u.usuario AS usuario
         FROM conexiones_reportadas c
         LEFT JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.cierra_en > $ahora
         ORDER BY c.cierra_en ASC`
      )
      .all({ $ahora: ahoraIso });
  }

  eliminar(id) {
    return this.db.prepare('DELETE FROM conexiones_reportadas WHERE id = $id').run({ $id: id }).changes > 0;
  }

  /**
   * Borra las conexiones que cerraron antes de `limiteIso`. El límite se
   * calcula en JS: `datetime()` de SQLite usa otro formato ("AAAA-MM-DD
   * HH:MM:SS") y compararlo como texto con ISO daría resultados erróneos.
   */
  purgarCerradasAntesDe(limiteIso) {
    return this.db
      .prepare('DELETE FROM conexiones_reportadas WHERE cierra_en < $limite')
      .run({ $limite: limiteIso }).changes;
  }
}

module.exports = ConexionReportadaRepository;
