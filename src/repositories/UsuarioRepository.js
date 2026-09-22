'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * UsuarioRepository
 * ----------------------------------------------------------------------
 * Acceso a la tabla `usuarios`. Todas las consultas usan sentencias
 * preparadas con parámetros nombrados: el valor viaja fuera del SQL, por
 * lo que una entrada como `' OR 1=1 --` se trata como texto literal y
 * nunca como código.
 *
 * Los métodos públicos devuelven el usuario "seguro" (sin el hash de la
 * contraseña). Solo `buscarConClave` expone el hash, y se usa
 * exclusivamente dentro del servicio de autenticación.
 * ----------------------------------------------------------------------
 */

function aUsuarioSeguro(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    usuario: fila.usuario,
    rol: fila.rol,
    activo: Boolean(fila.activo),
    creadoEn: fila.creado_en,
    ultimoAccesoEn: fila.ultimo_acceso_en,
  };
}

class UsuarioRepository extends BaseRepository {
  crear({ usuario, usuarioNormalizado, claveHash, rol = 'USUARIO' }) {
    const info = this.db
      .prepare(
        `INSERT INTO usuarios (usuario, usuario_normalizado, clave_hash, rol)
         VALUES ($usuario, $normalizado, $hash, $rol)`
      )
      .run({ $usuario: usuario, $normalizado: usuarioNormalizado, $hash: claveHash, $rol: rol });

    return this.obtenerPorId(Number(info.lastInsertRowid));
  }

  /** Uso interno de autenticación: incluye el hash de la contraseña. */
  buscarConClave(usuarioNormalizado) {
    return this.db
      .prepare('SELECT * FROM usuarios WHERE usuario_normalizado = $normalizado')
      .get({ $normalizado: usuarioNormalizado });
  }

  obtenerPorId(id) {
    return aUsuarioSeguro(
      this.db.prepare('SELECT * FROM usuarios WHERE id = $id').get({ $id: id })
    );
  }

  existe(usuarioNormalizado) {
    const fila = this.db
      .prepare('SELECT 1 AS existe FROM usuarios WHERE usuario_normalizado = $normalizado')
      .get({ $normalizado: usuarioNormalizado });
    return Boolean(fila);
  }

  listar({ limite = 100, desplazamiento = 0 } = {}) {
    return this.db
      .prepare(
        `SELECT * FROM usuarios
         ORDER BY creado_en DESC
         LIMIT $limite OFFSET $desplazamiento`
      )
      .all({ $limite: limite, $desplazamiento: desplazamiento })
      .map(aUsuarioSeguro);
  }

  contarPorRol(rol) {
    return this.db
      .prepare('SELECT COUNT(*) AS total FROM usuarios WHERE rol = $rol AND activo = 1')
      .get({ $rol: rol }).total;
  }

  registrarAcceso(id) {
    this.db
      .prepare("UPDATE usuarios SET ultimo_acceso_en = datetime('now') WHERE id = $id")
      .run({ $id: id });
  }

  cambiarEstado(id, activo) {
    this.db
      .prepare('UPDATE usuarios SET activo = $activo WHERE id = $id')
      .run({ $id: id, $activo: activo ? 1 : 0 });
    return this.obtenerPorId(id);
  }

  cambiarRol(id, rol) {
    this.db.prepare('UPDATE usuarios SET rol = $rol WHERE id = $id').run({ $id: id, $rol: rol });
    return this.obtenerPorId(id);
  }

  cambiarClave(id, claveHash) {
    this.db
      .prepare('UPDATE usuarios SET clave_hash = $hash WHERE id = $id')
      .run({ $id: id, $hash: claveHash });
    return this.obtenerPorId(id);
  }

  eliminar(id) {
    this.db.prepare('DELETE FROM usuarios WHERE id = $id').run({ $id: id });
  }
}

module.exports = UsuarioRepository;
module.exports.aUsuarioSeguro = aUsuarioSeguro;
