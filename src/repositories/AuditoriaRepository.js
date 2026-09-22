'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * AuditoriaRepository
 * ----------------------------------------------------------------------
 * Bitácora de los cambios hechos desde el panel de administración: quién,
 * qué entidad, cuándo. Permite rastrear una modificación indebida.
 * ----------------------------------------------------------------------
 */
class AuditoriaRepository extends BaseRepository {
  registrar({ usuarioId = null, accion, entidad, entidadId = null, detalle = null }) {
    this.db
      .prepare(
        `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
         VALUES ($usuario, $accion, $entidad, $entidadId, $detalle)`
      )
      .run({
        $usuario: usuarioId,
        $accion: accion,
        $entidad: entidad,
        $entidadId: entidadId === null ? null : String(entidadId),
        $detalle: detalle === null ? null : JSON.stringify(detalle).slice(0, 1000),
      });
  }

  listar(limite = 50) {
    return this.db
      .prepare(
        `SELECT a.accion, a.entidad, a.entidad_id AS entidadId, a.detalle,
                a.creado_en AS creadoEn, u.usuario AS usuario
         FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         ORDER BY a.creado_en DESC, a.id DESC
         LIMIT $limite`
      )
      .all({ $limite: limite });
  }
}

module.exports = AuditoriaRepository;
