'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * RutaReportadaRepository
 * ----------------------------------------------------------------------
 * Rutas del gremio: secuencias de conexiones reportadas en orden. La
 * ruta guarda la lista de zonas y cada tramo apunta a una fila de
 * conexiones_reportadas (que es donde vive el tiempo de cierre).
 * ----------------------------------------------------------------------
 */
class RutaReportadaRepository extends BaseRepository {
  crear({ zonas, conexionIds, usuarioId, espacioId = null }) {
    const info = this.db
      .prepare(
        `INSERT INTO rutas_reportadas (zonas, total_tramos, usuario_id, espacio_id)
         VALUES ($zonas, $total, $usuario, $espacio)`
      )
      .run({ $zonas: JSON.stringify(zonas), $total: conexionIds.length, $usuario: usuarioId, $espacio: espacioId });
    const id = Number(info.lastInsertRowid);

    const tramo = this.db.prepare(
      'INSERT INTO rutas_tramos (ruta_id, orden, conexion_id) VALUES ($ruta, $orden, $conexion)'
    );
    conexionIds.forEach((conexionId, orden) => tramo.run({ $ruta: id, $orden: orden, $conexion: conexionId }));
    return this.obtener(id);
  }

  /** Ruta existente con exactamente la misma secuencia de zonas, en el mismo espacio (null = pública). */
  buscarPorZonas(zonas, espacioId = null) {
    return this.db
      .prepare('SELECT id FROM rutas_reportadas WHERE zonas = $zonas AND espacio_id IS $espacio')
      .get({ $zonas: JSON.stringify(zonas), $espacio: espacioId });
  }

  /** Vuelve a apuntar los tramos (tras actualizar las conexiones) y renueva autor y fecha. */
  reemplazarTramos(id, { conexionIds, usuarioId }) {
    this.db.prepare('DELETE FROM rutas_tramos WHERE ruta_id = $id').run({ $id: id });
    const tramo = this.db.prepare(
      'INSERT INTO rutas_tramos (ruta_id, orden, conexion_id) VALUES ($ruta, $orden, $conexion)'
    );
    conexionIds.forEach((conexionId, orden) => tramo.run({ $ruta: id, $orden: orden, $conexion: conexionId }));
    this.db
      .prepare(`UPDATE rutas_reportadas SET usuario_id = $usuario, creado_en = datetime('now') WHERE id = $id`)
      .run({ $id: id, $usuario: usuarioId });
    return this.obtener(id);
  }

  /** Cambia el recorrido de una ruta (edición): zonas y tramos, sin tocar su autor. */
  actualizarRecorrido(id, { zonas, conexionIds }) {
    this.db.prepare('DELETE FROM rutas_tramos WHERE ruta_id = $id').run({ $id: id });
    const tramo = this.db.prepare(
      'INSERT INTO rutas_tramos (ruta_id, orden, conexion_id) VALUES ($ruta, $orden, $conexion)'
    );
    conexionIds.forEach((conexionId, orden) => tramo.run({ $ruta: id, $orden: orden, $conexion: conexionId }));
    this.db
      .prepare('UPDATE rutas_reportadas SET zonas = $zonas, total_tramos = $total WHERE id = $id')
      .run({ $id: id, $zonas: JSON.stringify(zonas), $total: conexionIds.length });
    return this.obtener(id);
  }

  obtener(id) {
    const fila = this.db
      .prepare(
        `SELECT r.id, r.zonas, r.total_tramos AS totalTramos, r.usuario_id AS usuarioId,
                r.creado_en AS creadoEn, u.usuario AS usuario, r.espacio_id AS espacioId
         FROM rutas_reportadas r
         LEFT JOIN usuarios u ON u.id = r.usuario_id
         WHERE r.id = $id`
      )
      .get({ $id: id });
    return fila ? this._conTramos(fila) : null;
  }

  /** Todas las rutas completas (con todos sus tramos), con los ids de conexión en orden. */
  listarCompletas() {
    return this.db
      .prepare(
        `SELECT r.id, r.zonas, r.total_tramos AS totalTramos, r.usuario_id AS usuarioId,
                r.creado_en AS creadoEn, u.usuario AS usuario, r.espacio_id AS espacioId
         FROM rutas_reportadas r
         LEFT JOIN usuarios u ON u.id = r.usuario_id
         WHERE (SELECT COUNT(*) FROM rutas_tramos t WHERE t.ruta_id = r.id) = r.total_tramos
         ORDER BY r.creado_en DESC, r.id DESC`
      )
      .all()
      .map((fila) => this._conTramos(fila));
  }

  _conTramos(fila) {
    const conexionIds = this.db
      .prepare('SELECT conexion_id AS id FROM rutas_tramos WHERE ruta_id = $id ORDER BY orden')
      .all({ $id: fila.id })
      .map((t) => t.id);
    return { ...fila, zonas: JSON.parse(fila.zonas), conexionIds };
  }

  /** Conexiones de la ruta que no forman parte de ninguna otra ruta. */
  conexionesExclusivas(id) {
    return this.db
      .prepare(
        `SELECT t.conexion_id AS id FROM rutas_tramos t
         WHERE t.ruta_id = $id
           AND NOT EXISTS (SELECT 1 FROM rutas_tramos o WHERE o.conexion_id = t.conexion_id AND o.ruta_id <> $id)`
      )
      .all({ $id: id })
      .map((f) => f.id);
  }

  /** ¿Alguna ruta usa esta conexión? */
  usaConexion(conexionId) {
    return Boolean(
      this.db.prepare('SELECT 1 FROM rutas_tramos WHERE conexion_id = $id LIMIT 1').get({ $id: conexionId })
    );
  }

  eliminar(id) {
    return this.db.prepare('DELETE FROM rutas_reportadas WHERE id = $id').run({ $id: id }).changes > 0;
  }

  /** Borra las rutas que perdieron algún tramo (su conexión se purgó o se borró). */
  purgarIncompletas() {
    return this.db
      .prepare(
        `DELETE FROM rutas_reportadas
         WHERE (SELECT COUNT(*) FROM rutas_tramos t WHERE t.ruta_id = rutas_reportadas.id) < total_tramos`
      )
      .run().changes;
  }
}

module.exports = RutaReportadaRepository;
