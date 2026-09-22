'use strict';

const GremioRepository = require('../repositories/GremioRepository');
const MapaRepository = require('../repositories/MapaRepository');
const HideoutRepository = require('../repositories/HideoutRepository');
const TemporadaRepository = require('../repositories/TemporadaRepository');
const UsuarioRepository = require('../repositories/UsuarioRepository');
const AuditoriaRepository = require('../repositories/AuditoriaRepository');
const { detectarTipo } = require('../security/imagenes');
const config = require('../config/seguridad');
const {
  ErrorValidacion,
  texto,
  entero,
  decimal,
  opcion,
} = require('../security/validacion');

/**
 * AdminService
 * ----------------------------------------------------------------------
 * Operaciones de administración: editar gremios (nombre, logo, notas),
 * mapas, hideouts (incluida su posición dentro del mapa), usuarios y
 * temporadas. Cada cambio queda registrado en la bitácora de auditoría.
 *
 * Toda entrada pasa por los validadores antes de tocar la base, y todas
 * las consultas son sentencias preparadas (ver repositorios).
 * ----------------------------------------------------------------------
 */
class AdminService {
  constructor({
    gremioRepository = new GremioRepository(),
    mapaRepository = new MapaRepository(),
    hideoutRepository = new HideoutRepository(),
    temporadaRepository = new TemporadaRepository(),
    usuarioRepository = new UsuarioRepository(),
    auditoriaRepository = new AuditoriaRepository(),
  } = {}) {
    this.gremios = gremioRepository;
    this.mapas = mapaRepository;
    this.hideouts = hideoutRepository;
    this.temporadas = temporadaRepository;
    this.usuarios = usuarioRepository;
    this.auditoria = auditoriaRepository;
  }

  _auditar(usuarioId, accion, entidad, entidadId, detalle) {
    this.auditoria.registrar({ usuarioId, accion, entidad, entidadId, detalle });
  }

  // ------------------------------------------------------------ resumen ---

  resumen() {
    const temporada = this.temporadas.obtenerActiva();
    return {
      temporada: temporada ? temporada.codigo : null,
      totalMapas: this.mapas.contarTotal(),
      totalMapasConGeo: this.mapas.contarGeo(),
      totalGremios: this.gremios.contarTotal(),
      totalHideouts: temporada ? this.hideouts.contarTotal(temporada.id) : 0,
      totalAdmins: this.usuarios.contarPorRol('ADMIN'),
    };
  }

  // ------------------------------------------------------------ gremios ---

  buscarGremios(consulta, { limite = 25, desplazamiento = 0 } = {}) {
    return this.gremios.buscar(consulta || '', { limite, desplazamiento });
  }

  renombrarGremio(usuarioId, id, nombreNuevo) {
    const gremioId = entero(id, 'id', { min: 1 });
    const nombre = texto(nombreNuevo, 'nombre', { min: 1, max: 60 });

    const actual = this.gremios.obtenerPorId(gremioId);
    if (!actual) throw new ErrorValidacion('El gremio indicado no existe.');

    const actualizado = this.gremios.renombrar(gremioId, nombre);
    this._auditar(usuarioId, 'RENOMBRAR', 'gremio', gremioId, { antes: actual.nombre, ahora: nombre });
    return actualizado;
  }

  actualizarNotasGremio(usuarioId, id, notas) {
    const gremioId = entero(id, 'id', { min: 1 });
    const contenido = texto(notas, 'notas', { min: 0, max: 500, obligatorio: false }) || '';
    const actualizado = this.gremios.actualizarNotas(gremioId, contenido);
    this._auditar(usuarioId, 'NOTAS', 'gremio', gremioId, null);
    return actualizado;
  }

  guardarLogoGremio(usuarioId, id, buffer) {
    const gremioId = entero(id, 'id', { min: 1 });
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ErrorValidacion('No se recibió ninguna imagen.');
    }
    if (buffer.length > config.limites.logoBytes) {
      throw new ErrorValidacion('La imagen supera el tamaño máximo de 1 MB.');
    }

    const mime = detectarTipo(buffer);
    if (!mime || !config.logo.tiposPermitidos.includes(mime)) {
      throw new ErrorValidacion('Formato no admitido. Usa PNG, JPG o WebP.');
    }

    const actualizado = this.gremios.guardarLogo(gremioId, mime, buffer);
    if (!actualizado) throw new ErrorValidacion('El gremio indicado no existe.');

    this._auditar(usuarioId, 'LOGO', 'gremio', gremioId, { mime, bytes: buffer.length });
    return actualizado;
  }

  borrarLogoGremio(usuarioId, id) {
    const gremioId = entero(id, 'id', { min: 1 });
    const actualizado = this.gremios.borrarLogo(gremioId);
    this._auditar(usuarioId, 'LOGO_BORRADO', 'gremio', gremioId, null);
    return actualizado;
  }

  // -------------------------------------------------------------- mapas ---

  renombrarMapa(usuarioId, id, nombreNuevo) {
    const mapaId = entero(id, 'id', { min: 1 });
    const nombre = texto(nombreNuevo, 'nombre', { min: 2, max: 80 });

    const actual = this.mapas.obtenerPorId(mapaId);
    if (!actual) throw new ErrorValidacion('El mapa indicado no existe.');

    const actualizado = this.mapas.renombrar(mapaId, nombre);
    this._auditar(usuarioId, 'RENOMBRAR', 'mapa', mapaId, { antes: actual.nombre, ahora: nombre });
    return actualizado;
  }

  // -------------------------------------------- imagen de fondo del mapa ---

  _mapaExistente(id) {
    const mapaId = entero(id, 'id', { min: 1 });
    const mapa = this.mapas.obtenerPorId(mapaId);
    if (!mapa) throw new ErrorValidacion('El mapa indicado no existe.');
    return mapa;
  }

  /**
   * Sube (o reemplaza) la imagen de fondo de un mapa. Igual que con los
   * logos, el tipo se valida por la firma binaria del archivo, nunca por
   * lo que declare el navegador.
   */
  guardarImagenMapa(usuarioId, id, buffer) {
    const mapa = this._mapaExistente(id);

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ErrorValidacion('No se recibió ninguna imagen.');
    }
    if (buffer.length > config.limites.imagenMapaBytes) {
      throw new ErrorValidacion('La imagen supera el tamaño máximo de 4 MB.');
    }

    const mime = detectarTipo(buffer);
    if (!mime || !config.logo.tiposPermitidos.includes(mime)) {
      throw new ErrorValidacion('Formato no admitido. Usa PNG, JPG o WebP.');
    }

    const meta = this.mapas.guardarImagen(mapa.id, { mime, datos: buffer, usuarioId });
    this._auditar(usuarioId, 'IMAGEN', 'mapa', mapa.id, { mime, bytes: buffer.length });
    return meta;
  }

  /**
   * Ajuste que alinea la imagen subida con la geometría real del mapa.
   * Los desplazamientos están en las mismas unidades que la vista del mapa
   * (metros del juego girados 45°), la escala es un factor y la rotación
   * solo admite cuartos de vuelta.
   */
  ajustarImagenMapa(usuarioId, id, { escala, dx, dy, rotacion }) {
    const mapa = this._mapaExistente(id);
    if (!this.mapas.obtenerImagenMeta(mapa.id)) {
      throw new ErrorValidacion('Ese mapa todavía no tiene una imagen subida.');
    }

    const ajuste = {
      escala: decimal(escala, 'escala', { min: 0.2, max: 5 }),
      dx: decimal(dx, 'dx', { min: -2000, max: 2000 }),
      dy: decimal(dy, 'dy', { min: -2000, max: 2000 }),
      rotacion: entero(rotacion, 'rotacion', { min: 0, max: 270 }),
    };
    if (![0, 90, 180, 270].includes(ajuste.rotacion)) {
      throw new ErrorValidacion('La rotación solo admite 0, 90, 180 o 270 grados.');
    }

    const meta = this.mapas.guardarAjusteImagen(mapa.id, ajuste);
    this._auditar(usuarioId, 'AJUSTE_IMAGEN', 'mapa', mapa.id, ajuste);
    return meta;
  }

  borrarImagenMapa(usuarioId, id) {
    const mapa = this._mapaExistente(id);
    this.mapas.borrarImagen(mapa.id);
    this._auditar(usuarioId, 'IMAGEN_BORRADA', 'mapa', mapa.id, null);
    return { id: mapa.id };
  }

  // ----------------------------------------------------------- hideouts ---

  crearHideout(usuarioId, { mapa, gremio, slot, tipo }) {
    const temporada = this.temporadas.obtenerActiva();
    if (!temporada) throw new ErrorValidacion('No hay una temporada activa.');

    const nombreMapa = texto(mapa, 'mapa', { min: 2, max: 80 });
    const nombreGremio = texto(gremio, 'gremio', { min: 1, max: 60 });
    const numeroSlot = entero(slot, 'slot', { min: 1, max: 10 });
    const tipoHideout = opcion(tipo, 'tipo', ['HQ', 'P', 'ESTANDAR'], { obligatorio: false }) || 'ESTANDAR';

    const filaMapa = this.mapas.obtenerPorNombre(nombreMapa);
    if (!filaMapa) throw new ErrorValidacion('Ese mapa no existe en la Zona Negra.');

    const filaGremio = this.gremios.obtenerOCrear(nombreGremio);

    const creado = this.hideouts.crear({
      temporadaId: temporada.id,
      mapaId: filaMapa.id,
      gremioId: filaGremio.id,
      slot: numeroSlot,
      tipo: tipoHideout,
    });

    this._auditar(usuarioId, 'CREAR', 'hideout', creado.id, {
      mapa: nombreMapa,
      gremio: nombreGremio,
      slot: numeroSlot,
    });
    return creado.toJSON();
  }

  actualizarHideout(usuarioId, id, { gremio, slot, tipo, nota }) {
    const hideoutId = entero(id, 'id', { min: 1 });
    const actual = this.hideouts.obtenerPorId(hideoutId);
    if (!actual) throw new ErrorValidacion('El hideout indicado no existe.');

    let gremioId = null;
    if (gremio !== undefined && gremio !== null && gremio !== '') {
      const nombreGremio = texto(gremio, 'gremio', { min: 1, max: 60 });
      gremioId = this.gremios.obtenerOCrear(nombreGremio).id;
    }

    const numeroSlot = entero(slot, 'slot', { min: 1, max: 10, obligatorio: false });
    const tipoHideout = opcion(tipo, 'tipo', ['HQ', 'P', 'ESTANDAR'], { obligatorio: false });
    const comentario = texto(nota, 'nota', { min: 0, max: 200, obligatorio: false });

    const actualizado = this.hideouts.actualizar(hideoutId, {
      gremioId,
      slot: numeroSlot,
      tipo: tipoHideout,
      nota: comentario,
    });

    this._auditar(usuarioId, 'EDITAR', 'hideout', hideoutId, { gremio, slot, tipo });
    return actualizado.toJSON();
  }

  /**
   * Marca dónde está el hideout dentro del mapa. Las coordenadas se
   * validan contra los límites reales del cluster, así que no se puede
   * guardar un punto fuera del mapa.
   */
  posicionarHideout(usuarioId, id, { x, y }) {
    const hideoutId = entero(id, 'id', { min: 1 });
    const actual = this.hideouts.obtenerPorId(hideoutId);
    if (!actual) throw new ErrorValidacion('El hideout indicado no existe.');

    if (x === null && y === null) {
      const limpio = this.hideouts.actualizarPosicion(hideoutId, null, null);
      this._auditar(usuarioId, 'QUITAR_POSICION', 'hideout', hideoutId, null);
      return limpio.toJSON();
    }

    const geo = this.mapas.obtenerGeoPorNombre(actual.mapa);
    if (!geo) throw new ErrorValidacion('Ese mapa no tiene datos geográficos cargados.');

    const [minX, minY] = geo.limites.min;
    const [maxX, maxY] = geo.limites.max;

    const posX = decimal(x, 'x', { min: minX, max: maxX });
    const posY = decimal(y, 'y', { min: minY, max: maxY });

    const actualizado = this.hideouts.actualizarPosicion(hideoutId, posX, posY);
    this._auditar(usuarioId, 'POSICIONAR', 'hideout', hideoutId, { x: posX, y: posY });
    return actualizado.toJSON();
  }

  eliminarHideout(usuarioId, id) {
    const hideoutId = entero(id, 'id', { min: 1 });
    const actual = this.hideouts.obtenerPorId(hideoutId);
    if (!actual) throw new ErrorValidacion('El hideout indicado no existe.');

    this.hideouts.eliminar(hideoutId);
    this._auditar(usuarioId, 'ELIMINAR', 'hideout', hideoutId, {
      mapa: actual.mapa,
      gremio: actual.gremio,
      slot: actual.slot,
    });
    return { id: hideoutId };
  }

  // ----------------------------------------------------------- usuarios ---

  listarUsuarios() {
    return this.usuarios.listar({ limite: 200 });
  }

  cambiarEstadoUsuario(usuarioAdminId, id, activo) {
    const usuarioId = entero(id, 'id', { min: 1 });
    if (usuarioId === usuarioAdminId) {
      throw new ErrorValidacion('No puedes desactivar tu propia cuenta.');
    }
    const objetivo = this.usuarios.obtenerPorId(usuarioId);
    if (!objetivo) throw new ErrorValidacion('El usuario indicado no existe.');

    if (objetivo.rol === 'ADMIN' && !activo && this.usuarios.contarPorRol('ADMIN') <= 1) {
      throw new ErrorValidacion('Debe quedar al menos un administrador activo.');
    }

    const actualizado = this.usuarios.cambiarEstado(usuarioId, activo);
    this._auditar(usuarioAdminId, activo ? 'ACTIVAR' : 'DESACTIVAR', 'usuario', usuarioId, null);
    return actualizado;
  }

  cambiarRolUsuario(usuarioAdminId, id, rol) {
    const usuarioId = entero(id, 'id', { min: 1 });
    const nuevoRol = opcion(rol, 'rol', ['USUARIO', 'ADMIN']);

    const objetivo = this.usuarios.obtenerPorId(usuarioId);
    if (!objetivo) throw new ErrorValidacion('El usuario indicado no existe.');

    if (objetivo.rol === 'ADMIN' && nuevoRol !== 'ADMIN' && this.usuarios.contarPorRol('ADMIN') <= 1) {
      throw new ErrorValidacion('Debe quedar al menos un administrador.');
    }

    const actualizado = this.usuarios.cambiarRol(usuarioId, nuevoRol);
    this._auditar(usuarioAdminId, 'ROL', 'usuario', usuarioId, { rol: nuevoRol });
    return actualizado;
  }

  // ---------------------------------------------------------- auditoría ---

  listarAuditoria(limite = 50) {
    return this.auditoria.listar(entero(limite, 'limite', { min: 1, max: 200, obligatorio: false }) || 50);
  }
}

module.exports = AdminService;
