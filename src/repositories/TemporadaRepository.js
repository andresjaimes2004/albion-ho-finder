'use strict';

const BaseRepository = require('./BaseRepository');
const db = require('../config/database');

class TemporadaRepository extends BaseRepository {
  obtenerActiva() {
    return this.db
      .prepare('SELECT * FROM temporadas WHERE activa = 1 ORDER BY id DESC LIMIT 1')
      .get();
  }

  obtenerPorCodigo(codigo) {
    return this.db.prepare('SELECT * FROM temporadas WHERE codigo = $codigo').get({ $codigo: codigo });
  }

  crear(codigo, { activar = true } = {}) {
    const existente = this.obtenerPorCodigo(codigo);
    if (existente) return existente;

    return db.transaccion(() => {
      if (activar) {
        this.db.exec('UPDATE temporadas SET activa = 0');
      }
      this.db
        .prepare('INSERT INTO temporadas (codigo, activa) VALUES ($codigo, $activa)')
        .run({ $codigo: codigo, $activa: activar ? 1 : 0 });

      return this.obtenerPorCodigo(codigo);
    });
  }
}

module.exports = TemporadaRepository;
