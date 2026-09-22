'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * IntentoLoginRepository
 * ----------------------------------------------------------------------
 * Contabiliza intentos fallidos de inicio de sesión por combinación de
 * usuario + huella de origen, para frenar ataques de fuerza bruta y de
 * relleno de credenciales. La huella es un hash, no guarda IP en claro.
 * ----------------------------------------------------------------------
 */
class IntentoLoginRepository extends BaseRepository {
  registrar(clave, exito) {
    this.db
      .prepare('INSERT INTO intentos_login (clave, exito) VALUES ($clave, $exito)')
      .run({ $clave: clave, $exito: exito ? 1 : 0 });
  }

  /** Fallos acumulados en los últimos `minutos`. */
  contarFallos(clave, minutos) {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS total FROM intentos_login
         WHERE clave = $clave
           AND exito = 0
           AND creado_en > datetime('now', $ventana)`
      )
      .get({ $clave: clave, $ventana: `-${minutos} minutes` }).total;
  }

  limpiarDe(clave) {
    this.db.prepare('DELETE FROM intentos_login WHERE clave = $clave').run({ $clave: clave });
  }

  purgarAntiguos(dias = 7) {
    this.db
      .prepare("DELETE FROM intentos_login WHERE creado_en < datetime('now', $ventana)")
      .run({ $ventana: `-${dias} days` });
  }
}

module.exports = IntentoLoginRepository;
