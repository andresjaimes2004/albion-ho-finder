'use strict';

const db = require('../config/database');

/**
 * BaseRepository
 * ----------------------------------------------------------------------
 * Clase base abstracta para el patrón Repository. Centraliza el acceso
 * a la conexión y deja que cada repositorio concreto (herencia) exponga
 * solo las operaciones propias de su tabla.
 * ----------------------------------------------------------------------
 */
class BaseRepository {
  constructor() {
    if (new.target === BaseRepository) {
      throw new Error('BaseRepository es abstracta y no debe instanciarse directamente.');
    }
    this.db = db.getConnection();
  }
}

module.exports = BaseRepository;
