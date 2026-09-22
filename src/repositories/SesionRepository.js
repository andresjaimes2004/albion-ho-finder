'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * SesionRepository
 * ----------------------------------------------------------------------
 * Sesiones del lado del servidor. La cookie del navegador contiene un
 * token aleatorio; en la base solo vive su SHA-256, junto con el hash
 * del token CSRF asociado y la fecha de expiración.
 * ----------------------------------------------------------------------
 */
class SesionRepository extends BaseRepository {
  crear({ tokenHash, csrfHash, usuarioId, expiraEn }) {
    this.db
      .prepare(
        `INSERT INTO sesiones (token_hash, csrf_hash, usuario_id, expira_en)
         VALUES ($token, $csrf, $usuario, $expira)`
      )
      .run({ $token: tokenHash, $csrf: csrfHash, $usuario: usuarioId, $expira: expiraEn });
  }

  /** Devuelve la sesión y el usuario dueño, solo si no ha expirado y está activo. */
  obtenerVigente(tokenHash) {
    return this.db
      .prepare(
        `SELECT s.id           AS sesion_id,
                s.csrf_hash    AS csrf_hash,
                s.expira_en    AS expira_en,
                u.id           AS usuario_id,
                u.usuario      AS usuario,
                u.rol          AS rol,
                u.activo       AS activo
         FROM sesiones s
         INNER JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token_hash = $token
           AND s.expira_en > datetime('now')
           AND u.activo = 1`
      )
      .get({ $token: tokenHash });
  }

  prolongar(tokenHash, expiraEn) {
    this.db
      .prepare('UPDATE sesiones SET expira_en = $expira WHERE token_hash = $token')
      .run({ $token: tokenHash, $expira: expiraEn });
  }

  eliminar(tokenHash) {
    this.db.prepare('DELETE FROM sesiones WHERE token_hash = $token').run({ $token: tokenHash });
  }

  eliminarDeUsuario(usuarioId) {
    this.db.prepare('DELETE FROM sesiones WHERE usuario_id = $usuario').run({ $usuario: usuarioId });
  }

  limpiarExpiradas() {
    this.db.prepare("DELETE FROM sesiones WHERE expira_en <= datetime('now')").run();
  }
}

module.exports = SesionRepository;
