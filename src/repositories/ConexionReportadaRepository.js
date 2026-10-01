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
  crear({ origen, destino, cierraEn, usuarioId, espacioId = null }) {
    const info = this.db
      .prepare(
        `INSERT INTO conexiones_reportadas (origen, destino, cierra_en, usuario_id, espacio_id)
         VALUES ($origen, $destino, $cierra, $usuario, $espacio)`
      )
      .run({ $origen: origen, $destino: destino, $cierra: cierraEn, $usuario: usuarioId, $espacio: espacioId });
    return this.obtener(Number(info.lastInsertRowid));
  }

  /**
   * Conexión vigente entre las mismas dos zonas, en cualquier sentido, del
   * mismo espacio (null = pública): nunca se toca una de otro espacio.
   */
  buscarVigenteEntre(zonaA, zonaB, ahoraIso, espacioId = null) {
    return this.db
      .prepare(
        `SELECT id FROM conexiones_reportadas
         WHERE cierra_en > $ahora
           AND ((origen = $a AND destino = $b) OR (origen = $b AND destino = $a))
           AND espacio_id IS $espacio
         ORDER BY cierra_en DESC
         LIMIT 1`
      )
      .get({ $ahora: ahoraIso, $a: zonaA, $b: zonaB, $espacio: espacioId });
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
                c.usuario_id AS usuarioId, u.usuario AS usuario, c.espacio_id AS espacioId
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
                c.usuario_id AS usuarioId, u.usuario AS usuario, c.espacio_id AS espacioId
         FROM conexiones_reportadas c
         LEFT JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.cierra_en > $ahora
         ORDER BY c.cierra_en ASC`
      )
      .all({ $ahora: ahoraIso });
  }

  /** Conexiones que cierran después de `limiteIso` (abiertas y recién cerradas). */
  listarDesde(limiteIso) {
    return this.db
      .prepare(
        `SELECT c.id, c.origen, c.destino, c.cierra_en AS cierraEn, c.creado_en AS creadoEn,
                c.usuario_id AS usuarioId, u.usuario AS usuario, c.espacio_id AS espacioId
         FROM conexiones_reportadas c
         LEFT JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.cierra_en > $limite
         ORDER BY c.cierra_en ASC`
      )
      .all({ $limite: limiteIso });
  }

  /**
   * Borra las conexiones que no forman parte de ninguna ruta y se
   * registraron (o actualizaron) antes de `limiteSqlite` ("AAAA-MM-DD
   * HH:MM:SS" en UTC, el formato de creado_en).
   */
  purgarSueltasAntesDe(limiteSqlite) {
    return this.db
      .prepare(
        `DELETE FROM conexiones_reportadas
         WHERE creado_en < $limite
           AND NOT EXISTS (SELECT 1 FROM rutas_tramos t WHERE t.conexion_id = conexiones_reportadas.id)`
      )
      .run({ $limite: limiteSqlite }).changes;
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
