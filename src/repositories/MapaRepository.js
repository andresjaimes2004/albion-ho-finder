'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * MapaRepository
 * ----------------------------------------------------------------------
 * Mapas (clusters) de la Zona Negra y su geografía oficial, tomada de
 * los dumps del cliente del juego (tabla `mapas_geo`).
 * ----------------------------------------------------------------------
 */

function parsearJson(texto, porDefecto) {
  if (!texto) return porDefecto;
  try {
    return JSON.parse(texto);
  } catch (error) {
    return porDefecto;
  }
}

function aGeo(fila) {
  if (!fila) return null;
  return {
    id: fila.mapa_id,
    nombre: fila.nombre,
    clusterId: fila.cluster_id,
    tipo: fila.tipo,
    tier: fila.tier,
    bioma: fila.bioma,
    faccion: fila.faccion,
    cuadrante: fila.cuadrante,
    mundo: [fila.mundo_x, fila.mundo_y],
    limites: {
      min: [fila.lim_min_x, fila.lim_min_y],
      max: [fila.lim_max_x, fila.lim_max_y],
    },
    salidas: parsearJson(fila.salidas, []),
    caminos: parsearJson(fila.caminos, null),
    territorios: parsearJson(fila.territorios, []),
  };
}

class MapaRepository extends BaseRepository {
  obtenerOCrear(nombre) {
    const existente = this.db.prepare('SELECT * FROM mapas WHERE nombre = $nombre').get({ $nombre: nombre });
    if (existente) return existente;

    const info = this.db.prepare('INSERT INTO mapas (nombre) VALUES ($nombre)').run({ $nombre: nombre });
    return { id: Number(info.lastInsertRowid), nombre };
  }

  obtenerPorNombre(nombre) {
    return this.db.prepare('SELECT * FROM mapas WHERE nombre = $nombre').get({ $nombre: nombre });
  }

  obtenerPorId(id) {
    return this.db.prepare('SELECT * FROM mapas WHERE id = $id').get({ $id: id });
  }

  renombrar(id, nombre) {
    this.db.prepare('UPDATE mapas SET nombre = $nombre WHERE id = $id').run({ $id: id, $nombre: nombre });
    return this.obtenerPorId(id);
  }

  contarTotal() {
    return this.db.prepare('SELECT COUNT(*) AS total FROM mapas').get().total;
  }

  // ---------------------------------------------------------------- geo ---

  guardarGeo(mapaId, geo) {
    this.db
      .prepare(
        `INSERT INTO mapas_geo (
            mapa_id, cluster_id, tipo, tier, bioma, faccion, cuadrante,
            mundo_x, mundo_y, lim_min_x, lim_min_y, lim_max_x, lim_max_y,
            salidas, caminos, territorios, actualizado_en
         ) VALUES (
            $mapaId, $clusterId, $tipo, $tier, $bioma, $faccion, $cuadrante,
            $mundoX, $mundoY, $limMinX, $limMinY, $limMaxX, $limMaxY,
            $salidas, $caminos, $territorios, datetime('now')
         )
         ON CONFLICT (mapa_id) DO UPDATE SET
            cluster_id = excluded.cluster_id,
            tipo       = excluded.tipo,
            tier       = excluded.tier,
            bioma      = excluded.bioma,
            faccion    = excluded.faccion,
            cuadrante  = excluded.cuadrante,
            mundo_x    = excluded.mundo_x,
            mundo_y    = excluded.mundo_y,
            lim_min_x  = excluded.lim_min_x,
            lim_min_y  = excluded.lim_min_y,
            lim_max_x  = excluded.lim_max_x,
            lim_max_y  = excluded.lim_max_y,
            salidas    = excluded.salidas,
            caminos    = excluded.caminos,
            territorios = excluded.territorios,
            actualizado_en = datetime('now')`
      )
      .run({
        $mapaId: mapaId,
        $clusterId: geo.id,
        $tipo: geo.tipo || null,
        $tier: geo.tier ?? null,
        $bioma: geo.bioma || null,
        $faccion: geo.faccion || null,
        $cuadrante: geo.cuadrante || null,
        $mundoX: geo.mundo[0],
        $mundoY: geo.mundo[1],
        $limMinX: geo.limites?.min?.[0] ?? null,
        $limMinY: geo.limites?.min?.[1] ?? null,
        $limMaxX: geo.limites?.max?.[0] ?? null,
        $limMaxY: geo.limites?.max?.[1] ?? null,
        $salidas: JSON.stringify(geo.salidas || []),
        $caminos: geo.caminos ? JSON.stringify(geo.caminos) : null,
        $territorios: JSON.stringify(geo.territorios || []),
      });
  }

  obtenerGeoPorNombre(nombre) {
    const fila = this.db
      .prepare(
        `SELECT m.nombre AS nombre, g.*
         FROM mapas m
         INNER JOIN mapas_geo g ON g.mapa_id = m.id
         WHERE m.nombre = $nombre`
      )
      .get({ $nombre: nombre });
    return aGeo(fila);
  }

  /** Resumen liviano de todos los mapas, para pintar el mapa mundial. */
  listarResumenGeo() {
    return this.db
      .prepare(
        `SELECT m.nombre AS nombre, g.cluster_id AS clusterId, g.tipo AS tipo,
                g.tier AS tier, g.bioma AS bioma, g.faccion AS faccion,
                g.cuadrante AS cuadrante, g.mundo_x AS x, g.mundo_y AS y
         FROM mapas m
         INNER JOIN mapas_geo g ON g.mapa_id = m.id
         ORDER BY m.nombre ASC`
      )
      .all();
  }

  /**
   * Conexiones entre mapas (aristas del mapa mundial), sin duplicar.
   * Solo se devuelven las que unen dos mapas con geografía cargada: un
   * mapa de Zona Negra también conecta con zonas reales/portales que no
   * forman parte de este buscador, y dibujar esas aristas dejaría líneas
   * colgando hacia la nada.
   */
  listarConexiones() {
    const filas = this.db
      .prepare(
        `SELECT m.nombre AS origen, g.salidas AS salidas
         FROM mapas m INNER JOIN mapas_geo g ON g.mapa_id = m.id`
      )
      .all();

    const conocidos = new Set(filas.map((fila) => fila.origen));
    const vistas = new Set();
    const conexiones = [];
    for (const fila of filas) {
      for (const salida of parsearJson(fila.salidas, [])) {
        if (!salida.destino || !conocidos.has(salida.destino)) continue;
        const clave = [fila.origen, salida.destino].sort().join('||');
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        conexiones.push({ a: fila.origen, b: salida.destino });
      }
    }
    return conexiones;
  }

  contarGeo() {
    return this.db.prepare('SELECT COUNT(*) AS total FROM mapas_geo').get().total;
  }

  // ------------------------------------------------------ imagen propia ---

  /** Metadatos de la imagen subida para un mapa (sin los bytes). */
  obtenerImagenMeta(mapaId) {
    const fila = this.db
      .prepare(
        `SELECT mime, bytes, escala, desplazamiento_x AS dx, desplazamiento_y AS dy,
                rotacion, actualizado_en AS actualizadoEn
         FROM mapas_imagen WHERE mapa_id = $mapaId`
      )
      .get({ $mapaId: mapaId });
    return fila || null;
  }

  obtenerImagenDatos(mapaId) {
    return this.db
      .prepare('SELECT mime, datos FROM mapas_imagen WHERE mapa_id = $mapaId')
      .get({ $mapaId: mapaId });
  }

  /**
   * Guarda (o reemplaza) la imagen de un mapa. Al reemplazar la imagen se
   * reinicia el ajuste, porque el de la imagen anterior ya no aplica.
   */
  guardarImagen(mapaId, { mime, datos, usuarioId }) {
    this.db
      .prepare(
        `INSERT INTO mapas_imagen (mapa_id, mime, datos, bytes, usuario_id, actualizado_en)
         VALUES ($mapaId, $mime, $datos, $bytes, $usuario, datetime('now'))
         ON CONFLICT (mapa_id) DO UPDATE SET
            mime = excluded.mime,
            datos = excluded.datos,
            bytes = excluded.bytes,
            usuario_id = excluded.usuario_id,
            escala = 1,
            desplazamiento_x = 0,
            desplazamiento_y = 0,
            rotacion = 0,
            actualizado_en = datetime('now')`
      )
      .run({ $mapaId: mapaId, $mime: mime, $datos: datos, $bytes: datos.length, $usuario: usuarioId });
    return this.obtenerImagenMeta(mapaId);
  }

  guardarAjusteImagen(mapaId, { escala, dx, dy, rotacion }) {
    this.db
      .prepare(
        `UPDATE mapas_imagen SET
            escala = $escala,
            desplazamiento_x = $dx,
            desplazamiento_y = $dy,
            rotacion = $rotacion,
            actualizado_en = datetime('now')
         WHERE mapa_id = $mapaId`
      )
      .run({ $mapaId: mapaId, $escala: escala, $dx: dx, $dy: dy, $rotacion: rotacion });
    return this.obtenerImagenMeta(mapaId);
  }

  borrarImagen(mapaId) {
    this.db.prepare('DELETE FROM mapas_imagen WHERE mapa_id = $mapaId').run({ $mapaId: mapaId });
  }
}

module.exports = MapaRepository;
