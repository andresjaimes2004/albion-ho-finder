'use strict';

const BaseRepository = require('./BaseRepository');

/** Normaliza un texto para comparaciones insensibles a mayúsculas/espacios. */
function normalizar(texto) {
  return texto.trim().toLowerCase();
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

  contarTotal() {
    return this.db.prepare('SELECT COUNT(*) AS total FROM gremios').get().total;
  }
}

module.exports = GremioRepository;
module.exports.normalizar = normalizar;
