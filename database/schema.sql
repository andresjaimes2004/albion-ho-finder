-- ============================================================================
-- Esquema relacional - Buscador de Hideouts de Zona Negra (Albion Online)
-- Motor: SQLite (portable, cero configuración, ideal para bajo mantenimiento)
-- Diseño normalizado (3FN): un gremio y un mapa se guardan una sola vez,
-- sin importar en cuántos hideouts aparezcan. Elimina la redundancia del
-- Excel original, donde el nombre del gremio se repetía en cada celda.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- Temporadas del juego (permite conservar histórico al importar un nuevo Excel
-- cada season, en vez de sobreescribir los datos anteriores).
CREATE TABLE IF NOT EXISTS temporadas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo        TEXT NOT NULL UNIQUE,        -- Ej: "S34"
    activa        INTEGER NOT NULL DEFAULT 0,  -- 1 = temporada vigente
    creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mapas de la Zona Negra.
CREATE TABLE IF NOT EXISTS mapas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT NOT NULL UNIQUE
);

-- Gremios. nombre_normalizado guarda la versión en minúsculas/sin espacios
-- extra, usada exclusivamente para búsquedas rápidas por substring.
CREATE TABLE IF NOT EXISTS gremios (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre              TEXT NOT NULL UNIQUE,
    nombre_normalizado  TEXT NOT NULL
);

-- Hideouts: tabla relacional intermedia (gremio ocupa un slot de un mapa
-- en una temporada determinada). Un mismo mapa no puede repetir slot.
CREATE TABLE IF NOT EXISTS hideouts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    temporada_id  INTEGER NOT NULL REFERENCES temporadas(id) ON DELETE CASCADE,
    mapa_id       INTEGER NOT NULL REFERENCES mapas(id)      ON DELETE CASCADE,
    gremio_id     INTEGER NOT NULL REFERENCES gremios(id)    ON DELETE CASCADE,
    slot          INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 10),
    tipo          TEXT NOT NULL DEFAULT 'ESTANDAR'
                  CHECK (tipo IN ('HQ', 'P', 'ESTANDAR')),
    UNIQUE (temporada_id, mapa_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_gremios_normalizado
    ON gremios (nombre_normalizado);

CREATE INDEX IF NOT EXISTS idx_hideouts_temporada_gremio
    ON hideouts (temporada_id, gremio_id);

CREATE INDEX IF NOT EXISTS idx_hideouts_temporada_mapa
    ON hideouts (temporada_id, mapa_id);
