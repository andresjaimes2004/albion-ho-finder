'use strict';

const BaseRepository = require('./BaseRepository');

/** Normaliza un texto para comparaciones insensibles a mayúsculas/espacios. */
function normalizar(texto) {
  return texto.trim().toLowerCase();
}

/** Escapa los comodines de LIKE para que se busquen como texto literal. */
function escaparParaLike(texto) {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

class GremioRepository extends BaseRepository {
  obtenerOCrear(nombre) {
    const normalizado = normalizar(nombre);
    const existente = this.db
      .prepare('SELECT * FROM gremios WHERE nombre_normalizado = $normalizado')
      .get({ $normalizado: normalizado });
    if (existente) return existente;

    const info = this.db
      .prepare('INSERT INTO gremios (nombre, nombre_normalizado) VALUES ($nombre, $normalizado)')
      .run({ $nombre: nombre, $normalizado: normalizado });
    return { id: Number(info.lastInsertRowid), nombre, nombre_normalizado: normalizado };
  }

  obtenerPorId(id) {
    return this.db
      .prepare(
        `SELECT id, nombre, nombre_normalizado AS nombreNormalizado, notas,
                (logo_mime IS NOT NULL) AS tieneLogo, logo_actualizado_en AS logoActualizadoEn
         FROM gremios WHERE id = $id`
      )
      .get({ $id: id });
  }

  /** Búsqueda paginada por nombre, para el buscador del panel admin. */
  buscar(texto, { limite = 25, desplazamiento = 0 } = {}) {
    const patron = `%${escaparParaLike(normalizar(texto || ''))}%`;
    return this.db
      .prepare(
        `SELECT g.id, g.nombre, g.notas,
                (g.logo_mime IS NOT NULL) AS tieneLogo,
                COUNT(h.id) AS totalHideouts
         FROM gremios g
         LEFT JOIN hideouts h ON h.gremio_id = g.id
         WHERE g.nombre_normalizado LIKE $patron ESCAPE '\\'
         GROUP BY g.id
         ORDER BY g.nombre ASC
         LIMIT $limite OFFSET $desplazamiento`
      )
      .all({ $patron: patron, $limite: limite, $desplazamiento: desplazamiento });
  }

  renombrar(id, nombre) {
    this.db
      .prepare(
        `UPDATE gremios SET nombre = $nombre, nombre_normalizado = $normalizado
         WHERE id = $id`
      )
      .run({ $id: id, $nombre: nombre, $normalizado: normalizar(nombre) });
    return this.obtenerPorId(id);
  }

  actualizarNotas(id, notas) {
    this.db.prepare('UPDATE gremios SET notas = $notas WHERE id = $id').run({ $id: id, $notas: notas });
    return this.obtenerPorId(id);
  }

  /** Guarda el logo como BLOB en la base: no se escriben archivos al disco. */
  guardarLogo(id, mime, datos) {
    this.db
      .prepare(
        `UPDATE gremios SET logo_mime = $mime, logo_datos = $datos,
                logo_actualizado_en = datetime('now')
         WHERE id = $id`
      )
      .run({ $id: id, $mime: mime, $datos: datos });
    return this.obtenerPorId(id);
  }

  borrarLogo(id) {
    this.db
      .prepare(
        `UPDATE gremios SET logo_mime = NULL, logo_datos = NULL,
                logo_actualizado_en = NULL
         WHERE id = $id`
      )
      .run({ $id: id });
    return this.obtenerPorId(id);
  }

  obtenerLogo(id) {
    return this.db
      .prepare('SELECT logo_mime AS mime, logo_datos AS datos FROM gremios WHERE id = $id')
      .get({ $id: id });
  }

  contarTotal() {
    return this.db.prepare('SELECT COUNT(*) AS total FROM gremios').get().total;
  }
}

module.exports = GremioRepository;
module.exports.normalizar = normalizar;
module.exports.escaparParaLike = escaparParaLike;
