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

-- ============================================================================
-- v2: geografía real de los mapas, cuentas de usuario, historial y auditoría
-- ============================================================================

-- Datos geográficos oficiales de cada mapa (cluster) de la Zona Negra,
-- extraídos de los dumps del cliente (ao-bin-dumps, cluster/world.json).
-- Se guardan en una tabla aparte para no alterar la clave natural de `mapas`.
CREATE TABLE IF NOT EXISTS mapas_geo (
    mapa_id       INTEGER PRIMARY KEY REFERENCES mapas(id) ON DELETE CASCADE,
    cluster_id    TEXT    NOT NULL,
    tipo          TEXT,                 -- OPENPVP_BLACK_1..6
    tier          INTEGER,
    bioma         TEXT,                 -- FR, HL, MN, ST, SW
    faccion       TEXT,                 -- KPR, MOR, UND...
    cuadrante     TEXT,                 -- Q1..Q6
    mundo_x       REAL NOT NULL,        -- posición en el mapa mundial
    mundo_y       REAL NOT NULL,
    lim_min_x     REAL,                 -- límites del minimapa (escala real)
    lim_min_y     REAL,
    lim_max_x     REAL,
    lim_max_y     REAL,
    salidas       TEXT,                 -- JSON: salidas hacia mapas vecinos
    caminos       TEXT,                 -- JSON: nodos y enlaces de caminos
    territorios   TEXT,                 -- JSON: torres y castillos
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mapas_geo_cluster ON mapas_geo (cluster_id);

-- Cuentas de acceso. La contraseña se guarda SIEMPRE como hash scrypt
-- con sal individual; nunca en texto plano ni reversible.
CREATE TABLE IF NOT EXISTS usuarios (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario            TEXT NOT NULL UNIQUE,
    usuario_normalizado TEXT NOT NULL UNIQUE,
    clave_hash         TEXT NOT NULL,
    rol                TEXT NOT NULL DEFAULT 'USUARIO'
                       CHECK (rol IN ('USUARIO', 'ADMIN')),
    activo             INTEGER NOT NULL DEFAULT 1,
    creado_en          TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_acceso_en   TEXT
);

-- Sesiones activas. De la cookie solo se guarda su hash SHA-256: si alguien
-- lee la base de datos no puede suplantar sesiones existentes.
CREATE TABLE IF NOT EXISTS sesiones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash   TEXT NOT NULL UNIQUE,
    csrf_hash    TEXT NOT NULL,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creada_en    TEXT NOT NULL DEFAULT (datetime('now')),
    expira_en    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira  ON sesiones (expira_en);

-- Intentos de inicio de sesión, para bloquear fuerza bruta.
CREATE TABLE IF NOT EXISTS intentos_login (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    clave        TEXT NOT NULL,   -- usuario normalizado + huella de origen
    exito        INTEGER NOT NULL DEFAULT 0,
    creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_intentos_clave ON intentos_login (clave, creado_en);

-- Historial de búsquedas por usuario.
CREATE TABLE IF NOT EXISTS busquedas (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    termino      TEXT NOT NULL,
    total_mapas  INTEGER NOT NULL DEFAULT 0,
    total_hideouts INTEGER NOT NULL DEFAULT 0,
    creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_busquedas_usuario ON busquedas (usuario_id, creado_en DESC);

-- Registro de cambios hechos desde el panel de administración.
CREATE TABLE IF NOT EXISTS auditoria (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    accion       TEXT NOT NULL,
    entidad      TEXT NOT NULL,
    entidad_id   TEXT,
    detalle      TEXT,
    creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (creado_en DESC);

-- ============================================================================
-- v3: imagen de fondo propia por mapa
-- ============================================================================

-- Imagen que un administrador sube para un mapa concreto (por ejemplo, una
-- captura del minimapa del juego). Se guarda como BLOB para no escribir
-- archivos en disco, y se acompaña del ajuste que la alinea con la
-- geometría real del mapa: escala, desplazamiento y rotación.
CREATE TABLE IF NOT EXISTS mapas_imagen (
    mapa_id         INTEGER PRIMARY KEY REFERENCES mapas(id) ON DELETE CASCADE,
    mime            TEXT    NOT NULL,
    datos           BLOB    NOT NULL,
    bytes           INTEGER NOT NULL,
    escala          REAL    NOT NULL DEFAULT 1,
    desplazamiento_x REAL   NOT NULL DEFAULT 0,
    desplazamiento_y REAL   NOT NULL DEFAULT 0,
    rotacion        INTEGER NOT NULL DEFAULT 0
                    CHECK (rotacion IN (0, 90, 180, 270)),
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- v4: conexiones de caminos de Avalon reportadas por el gremio
-- ============================================================================

-- Conexión entre dos zonas leída de una captura del juego (o escrita a mano)
-- por un usuario con sesión. Los nombres son los oficiales de
-- data/zonas_albion.json. `cierra_en` es la hora UTC calculada a partir del
-- tiempo restante que mostraba el juego; pasada esa hora el registro deja de
-- mostrarse y se purga.
CREATE TABLE IF NOT EXISTS conexiones_reportadas (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    origen       TEXT    NOT NULL,
    destino      TEXT    NOT NULL,
    cierra_en    TEXT    NOT NULL,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en    TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (origen <> destino)
);

CREATE INDEX IF NOT EXISTS idx_conexiones_reportadas_cierre ON conexiones_reportadas (cierra_en);
