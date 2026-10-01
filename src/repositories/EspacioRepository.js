'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * EspacioRepository
 * ----------------------------------------------------------------------
 * Espacios privados (tablas espacios y espacio_miembros). El creador
 * figura también como miembro. Todas las consultas usan parámetros: los
 * nombres los escriben los usuarios y nunca forman parte del SQL.
 * ----------------------------------------------------------------------
 */
const COLUMNAS = `e.id, e.nombre, e.creador_id AS creadorId, u.usuario AS creador,
                  e.publico, e.creado_en AS creadoEn`;

function aEspacio(fila) {
  return fila ? { ...fila, publico: Boolean(fila.publico) } : null;
}

class EspacioRepository extends BaseRepository {
  /** Crea el espacio con su creador como primer miembro. */
  crear({ nombre, creadorId, publico = false }) {
    const info = this.db
      .prepare('INSERT INTO espacios (nombre, creador_id, publico) VALUES ($nombre, $creador, $publico)')
      .run({ $nombre: nombre, $creador: creadorId, $publico: publico ? 1 : 0 });
    const id = Number(info.lastInsertRowid);
    this.agregarMiembro(id, creadorId);
    return this.obtener(id);
  }

  obtener(id) {
    return aEspacio(
      this.db
        .prepare(`SELECT ${COLUMNAS} FROM espacios e LEFT JOIN usuarios u ON u.id = e.creador_id WHERE e.id = $id`)
        .get({ $id: id })
    );
  }

  /** Espacios de los que el usuario es miembro. */
  listarDeUsuario(usuarioId) {
    return this.db
      .prepare(
        `SELECT ${COLUMNAS} FROM espacios e
         JOIN espacio_miembros m ON m.espacio_id = e.id AND m.usuario_id = $usuario
         LEFT JOIN usuarios u ON u.id = e.creador_id
         ORDER BY e.nombre COLLATE NOCASE`
      )
      .all({ $usuario: usuarioId })
      .map(aEspacio);
  }

  miembros(espacioId) {
    return this.db
      .prepare(
        `SELECT m.usuario_id AS id, u.usuario, m.agregado_en AS agregadoEn
         FROM espacio_miembros m JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.espacio_id = $espacio
         ORDER BY m.agregado_en, u.usuario COLLATE NOCASE`
      )
      .all({ $espacio: espacioId });
  }

  esMiembro(espacioId, usuarioId) {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM espacio_miembros WHERE espacio_id = $espacio AND usuario_id = $usuario')
        .get({ $espacio: espacioId, $usuario: usuarioId })
    );
  }

  contarMiembros(espacioId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM espacio_miembros WHERE espacio_id = $id').get({ $id: espacioId }).n;
  }

  contarCreadosPor(usuarioId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM espacios WHERE creador_id = $id').get({ $id: usuarioId }).n;
  }

  contarDeUsuario(usuarioId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM espacio_miembros WHERE usuario_id = $id').get({ $id: usuarioId }).n;
  }

  agregarMiembro(espacioId, usuarioId) {
    this.db
      .prepare('INSERT OR IGNORE INTO espacio_miembros (espacio_id, usuario_id) VALUES ($espacio, $usuario)')
      .run({ $espacio: espacioId, $usuario: usuarioId });
  }

  quitarMiembro(espacioId, usuarioId) {
    return (
      this.db
        .prepare('DELETE FROM espacio_miembros WHERE espacio_id = $espacio AND usuario_id = $usuario')
        .run({ $espacio: espacioId, $usuario: usuarioId }).changes > 0
    );
  }

  actualizar(id, { nombre, publico }) {
    this.db
      .prepare('UPDATE espacios SET nombre = $nombre, publico = $publico WHERE id = $id')
      .run({ $id: id, $nombre: nombre, $publico: publico ? 1 : 0 });
    return this.obtener(id);
  }

  /** Borra el espacio; sus miembros, conexiones y rutas se borran en cascada. */
  eliminar(id) {
    return this.db.prepare('DELETE FROM espacios WHERE id = $id').run({ $id: id }).changes > 0;
  }

  /**
   * Espacios cuyas conexiones puede ver el usuario: los suyos y los que
   * permiten que los demás las vean. Sin usuario, solo los públicos.
   */
  visiblesPara(usuarioId) {
    return this.db
      .prepare(
        `SELECT e.id, e.nombre, e.publico,
                EXISTS (SELECT 1 FROM espacio_miembros m WHERE m.espacio_id = e.id AND m.usuario_id = $usuario) AS miembro
         FROM espacios e
         WHERE e.publico = 1
            OR EXISTS (SELECT 1 FROM espacio_miembros m WHERE m.espacio_id = e.id AND m.usuario_id = $usuario)`
      )
      .all({ $usuario: usuarioId || 0 })
      .map((f) => ({ id: f.id, nombre: f.nombre, publico: Boolean(f.publico), miembro: Boolean(f.miembro) }));
  }

  /** Id de una cuenta activa por su nombre (sin mayúsculas), o null. */
  idDeUsuario(nombreNormalizado) {
    const fila = this.db
      .prepare('SELECT id FROM usuarios WHERE usuario_normalizado = $nombre AND activo = 1')
      .get({ $nombre: nombreNormalizado });
    return fila ? fila.id : null;
  }
}

module.exports = EspacioRepository;
