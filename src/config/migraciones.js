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
  // Cómo está dibujada la imagen de fondo de un mapa: 'diamante' = ya girada
  // como se ve en el juego (una captura), 'juego' = la textura cuadrada del
  // minimapa en coordenadas del mapa (archivos del cliente). Las imágenes
  // anteriores a esta columna eran capturas.
  { tabla: 'mapas_imagen', columna: 'proyeccion', definicion: "TEXT NOT NULL DEFAULT 'diamante'" },
  // Gremios de caminos de hideouts: de dónde vienen y si el Excel ya los
  // tiene (los de la web se agregan al Excel; ver SincronizacionExcelService).
  { tabla: 'hideouts_camino', columna: 'origen', definicion: "TEXT NOT NULL DEFAULT 'web'" },
  { tabla: 'hideouts_camino', columna: 'en_excel', definicion: 'INTEGER NOT NULL DEFAULT 0' },
  // Espacios privados: a qué espacio pertenece cada conexión y ruta (NULL =
  // pública). Al borrar el espacio se borran con él.
  { tabla: 'conexiones_reportadas', columna: 'espacio_id', definicion: 'INTEGER REFERENCES espacios(id) ON DELETE CASCADE' },
  { tabla: 'rutas_reportadas', columna: 'espacio_id', definicion: 'INTEGER REFERENCES espacios(id) ON DELETE CASCADE' },
];

// Índices sobre columnas añadidas por estas migraciones (schema.sql se
// ejecuta antes y no puede crearlos en una base de datos anterior).
const INDICES_NUEVOS = [
  'CREATE INDEX IF NOT EXISTS idx_conexiones_reportadas_espacio ON conexiones_reportadas (espacio_id)',
  'CREATE INDEX IF NOT EXISTS idx_rutas_reportadas_espacio ON rutas_reportadas (espacio_id)',
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
  for (const sql of INDICES_NUEVOS) conexion.exec(sql);
}

module.exports = ejecutarMigraciones;
