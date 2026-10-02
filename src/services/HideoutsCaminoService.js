'use strict';

const path = require('path');
const fs = require('fs');

const HideoutCaminoRepository = require('../repositories/HideoutCaminoRepository');
const { texto, ErrorValidacion } = require('../security/validacion');
const { COLUMNAS_GREMIOS } = require('../excel/hojaHideouts');

/**
 * HideoutsCaminoService
 * ----------------------------------------------------------------------
 * Gremios con hideout en los caminos de Avalon de hideouts.
 *
 * Los caminos de tipo TUNNEL_HIDEOUT y TUNNEL_HIDEOUT_DEEP (dumps del
 * juego) admiten hideouts, pero los datos oficiales no dicen de quién son.
 * Quien llega a uno por una ruta anota los gremios que tienen hideout allí
 * y quedan guardados para siempre: la próxima ruta a ese camino ya los
 * muestra, y se buscan por gremio o por camino.
 *
 * Además se comparten con la hoja "Caminos Avalon" del Excel de Drive (ver
 * SincronizacionExcelService): lo anotado en la web se agrega al Excel y lo
 * que el equipo escribe en el Excel aparece en la web.
 *
 * Reglas:
 *  - Solo usuarios con sesión; cada registro queda a su nombre.
 *  - El camino debe ser un camino de hideouts del catálogo oficial (se
 *    guarda su nombre canónico).
 *  - El nombre del gremio: 2 a 40 caracteres, letras, números, espacios y
 *    . _ - ' &. Se compara sin mayúsculas ni espacios de más: anotar otra
 *    vez el mismo gremio solo renueva la fecha. No se filtran palabras: el
 *    nombre es el del gremio en el juego, y si el juego lo permite, aquí
 *    también (el filtro de insultos es solo para los nombres de cuenta y de
 *    espacio, que sí elige cada usuario).
 *  - Como mucho MAX_POR_CAMINO gremios por camino (las columnas de gremios
 *    del Excel; también evita el spam).
 *  - Solo quien lo anotó o un administrador pueden borrarlo, y solo
 *    mientras no esté en el Excel: el Excel manda y la web nunca borra
 *    nada del Excel.
 * ----------------------------------------------------------------------
 */

const TIPOS_HIDEOUT = new Set(['TUNNEL_HIDEOUT', 'TUNNEL_HIDEOUT_DEEP']);
const MAX_POR_CAMINO = COLUMNAS_GREMIOS;
const FORMATO_GREMIO = /^[\p{L}\p{N} ._\-'&]+$/u;

function clave(textoLibre) {
  return String(textoLibre || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Nombre de gremio para comparar: minúsculas y espacios simples. */
function normalizarGremio(nombre) {
  return nombre.trim().replace(/\s+/g, ' ').toLowerCase();
}

function errorPublico(mensaje, estado) {
  const error = new Error(mensaje);
  error.publico = true;
  error.estado = estado;
  return error;
}

function cargarCatalogo() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'caminos_avalon.json'), 'utf-8'));
}

class HideoutsCaminoService {
  constructor({ catalogo = cargarCatalogo(), repositorio = new HideoutCaminoRepository() } = {}) {
    this.repositorio = repositorio;
    this.caminos = new Map(
      catalogo.caminos.filter((c) => TIPOS_HIDEOUT.has(c.tipo)).map((c) => [clave(c.nombre), c])
    );
  }

  /** El camino de hideouts con ese nombre (tolerando mayúsculas), o null. */
  camino(nombre) {
    return this.caminos.get(clave(nombre)) || null;
  }

  esCaminoHideout(nombre) {
    return this.caminos.has(clave(nombre));
  }

  listar(nombreCamino) {
    const camino = this.camino(nombreCamino);
    if (!camino) throw errorPublico('Ese no es un camino de Avalon de hideouts.', 404);
    return this.repositorio.listarPorCamino(camino.nombre);
  }

  /** Gremios por camino (nombre del camino → nombres de gremio). */
  porCamino() {
    const mapa = new Map();
    for (const h of this.repositorio.listarTodos()) {
      if (!mapa.has(h.camino)) mapa.set(h.camino, []);
      mapa.get(h.camino).push(h.gremio);
    }
    return mapa;
  }

  /**
   * Nombre de gremio válido (con espacios simples) o ErrorValidacion. Vale
   * para lo que escriben los usuarios y para lo que llega del Excel. Solo
   * se comprueba el formato (longitud y caracteres), no las palabras.
   */
  validarGremio(nombreGremio) {
    const gremio = texto(nombreGremio, 'gremio', { min: 2, max: 40 }).replace(/\s+/g, ' ');
    if (!FORMATO_GREMIO.test(gremio)) {
      throw new ErrorValidacion('El nombre del gremio solo puede tener letras, números, espacios y . _ - \' &');
    }
    return gremio;
  }

  agregar(usuario, nombreCamino, nombreGremio) {
    const camino = this.camino(typeof nombreCamino === 'string' ? nombreCamino : '');
    if (!camino) throw new ErrorValidacion('Ese no es un camino de Avalon de hideouts.');
    const gremio = this.validarGremio(nombreGremio);
    const normalizado = normalizarGremio(gremio);
    const actuales = this.repositorio.listarPorCamino(camino.nombre);
    const yaEsta = actuales.some((h) => normalizarGremio(h.gremio) === normalizado);
    if (!yaEsta && actuales.length >= MAX_POR_CAMINO) {
      throw new ErrorValidacion(`Ese camino ya tiene ${MAX_POR_CAMINO} gremios anotados. Borra los que ya no estén.`);
    }
    return this.repositorio.guardar({ camino: camino.nombre, gremio, gremioNormalizado: normalizado, usuarioId: usuario.id });
  }

  eliminar(usuario, id) {
    const registro = this.repositorio.obtener(id);
    if (!registro) throw errorPublico('Ese registro no existe.', 404);
    if (registro.usuarioId !== usuario.id && usuario.rol !== 'ADMIN') {
      throw errorPublico('Solo quien lo anotó o un administrador puede borrarlo.', 403);
    }
    if (registro.enExcel) {
      throw errorPublico(
        'Este gremio ya está en el Excel del equipo: para quitarlo, bórralo del Excel y la web lo quitará en la próxima sincronización.',
        409
      );
    }
    this.repositorio.eliminar(id);
  }

  /**
   * Para el buscador: caminos de hideouts con algún gremio cuyo nombre
   * contiene el texto, o cuyo propio nombre contiene el texto. Cada camino
   * con todos sus gremios anotados.
   */
  buscar(textoBuscado) {
    const buscado = normalizarGremio(String(textoBuscado || ''));
    const buscadoClave = clave(textoBuscado);
    if (buscado.length < 2) return [];

    const nombres = new Set(this.repositorio.buscarPorGremio(buscado).map((h) => h.camino));
    if (buscadoClave.length >= 3) {
      for (const camino of this.caminos.values()) {
        if (clave(camino.nombre).includes(buscadoClave)) nombres.add(camino.nombre);
      }
    }
    return [...nombres]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 20)
      .map((nombre) => {
        const camino = this.camino(nombre);
        return {
          camino: nombre,
          tier: camino ? camino.tier : null,
          profundo: camino ? camino.tipo === 'TUNNEL_HIDEOUT_DEEP' : false,
          gremios: this.repositorio.listarPorCamino(nombre).map((h) => ({
            id: h.id,
            gremio: h.gremio,
            usuario: h.usuario || null,
            confirmadoEn: h.confirmadoEn,
            origen: h.origen,
          })),
        };
      });
  }
}

module.exports = HideoutsCaminoService;
module.exports.MAX_POR_CAMINO = MAX_POR_CAMINO;
module.exports.normalizarGremio = normalizarGremio;
