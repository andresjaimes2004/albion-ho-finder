'use strict';

/**
 * migraciones.js
 * ----------------------------------------------------------------------
 * Migraciones idempotentes: añaden columnas nuevas a tablas ya existentes
 * (schema.sql solo sabe crear tablas desde cero). Se ejecutan en cada
 * arranque y no hacen nada si la columna ya está presente, de modo que
 * una base de datos creada con la versión anterior queda al día sin
 * perder información ni requerir pasos manuales.
 * ----------------------------------------------------------------------
 */

const COLUMNAS_NUEVAS = [
  // Personalización visual del gremio administrable desde la web.
  { tabla: 'gremios', columna: 'logo_mime', definicion: 'TEXT' },
  { tabla: 'gremios', columna: 'logo_datos', definicion: 'BLOB' },
  { tabla: 'gremios', columna: 'logo_actualizado_en', definicion: 'TEXT' },
  { tabla: 'gremios', columna: 'notas', definicion: 'TEXT' },
  // Posición del hideout dentro del mapa, marcada por un administrador.
  // Los dumps del juego no contienen esta coordenada (los hideouts son
  // construcciones de jugadores), por eso nace nula y solo se llena
  // cuando alguien con permisos la marca en el mapa.
  { tabla: 'hideouts', columna: 'pos_x', definicion: 'REAL' },
  { tabla: 'hideouts', columna: 'pos_y', definicion: 'REAL' },
  { tabla: 'hideouts', columna: 'nota', definicion: 'TEXT' },
  { tabla: 'hideouts', columna: 'actualizado_en', definicion: 'TEXT' },
];

function columnasDe(conexion, tabla) {
  try {
    return conexion
      .prepare(`PRAGMA table_info(${tabla})`)
      .all()
      .map((fila) => fila.name);
  } catch (error) {
    return [];
  }
}

/**
 * @param {import('node:sqlite').DatabaseSync} conexion
 */
function ejecutarMigraciones(conexion) {
  for (const { tabla, columna, definicion } of COLUMNAS_NUEVAS) {
    const existentes = columnasDe(conexion, tabla);
    if (!existentes.length) continue; // la tabla aún no existe
    if (existentes.includes(columna)) continue;
    // Nombres de tabla/columna son literales del código fuente, nunca
    // entrada del usuario: no hay superficie de inyección aquí.
    conexion.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

module.exports = ejecutarMigraciones;
