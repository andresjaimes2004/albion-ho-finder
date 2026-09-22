'use strict';

const BaseRepository = require('./BaseRepository');

class MapaRepository extends BaseRepository {
  obtenerOCrear(nombre) {
    const existente = this.db.prepare('SELECT * FROM mapas WHERE nombre = $nombre').get({ $nombre: nombre });
    if (existente) return existente;

    const info = this.db.prepare('INSERT INTO mapas (nombre) VALUES ($nombre)').run({ $nombre: nombre });
    return { id: Number(info.lastInsertRowid), nombre };
  }

  contarTotal() {
    return this.db.prepare('SELECT COUNT(*) AS total FROM mapas').get().total;
  }
}

module.exports = MapaRepository;
