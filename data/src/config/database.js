'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

/**
 * Database
 * ----------------------------------------------------------------------
 * Encapsula la conexión a SQLite bajo el patrón Singleton: toda la
 * aplicación comparte una única instancia y una única conexión física,
 * evitando bloqueos y duplicidad de recursos.
 *
 * Usa el módulo nativo `node:sqlite` (disponible desde Node 22.5+) en
 * lugar de un paquete externo compilado: cero dependencias binarias que
 * instalar o compilar en el hosting, arranque más rápido y menos
 * superficie de fallo en despliegue ("low-code" real).
 * ----------------------------------------------------------------------
 */
class DatabaseConnection {
  constructor() {
    if (DatabaseConnection._instance) {
      return DatabaseConnection._instance;
    }

    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'database', 'albion.db');
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');

    this._ensureDirectory(dbPath);

    this.connection = new DatabaseSync(dbPath);
    this.connection.exec('PRAGMA journal_mode = WAL;');
    this.connection.exec('PRAGMA foreign_keys = ON;');

    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      this.connection.exec(schema);
    }

    DatabaseConnection._instance = this;
  }

  _ensureDirectory(filePath) {
    if (filePath === ':memory:') return;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /** @returns {import('node:sqlite').DatabaseSync} conexión activa */
  getConnection() {
    return this.connection;
  }

  /** Ejecuta una función dentro de una transacción SQL manual. */
  transaccion(fn) {
    this.connection.exec('BEGIN');
    try {
      const resultado = fn();
      this.connection.exec('COMMIT');
      return resultado;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.connection.close();
  }
}

module.exports = new DatabaseConnection();
