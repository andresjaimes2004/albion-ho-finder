'use strict';

const db = require('../config/database');
const HideoutRepository = require('../repositories/HideoutRepository');
const MapaRepository = require('../repositories/MapaRepository');
const GremioRepository = require('../repositories/GremioRepository');
const TemporadaRepository = require('../repositories/TemporadaRepository');
const AuditoriaRepository = require('../repositories/AuditoriaRepository');
const { leerHideoutsXlsx } = require('../excel/hojaHideouts');
const { crearClienteDrive, cargarCredenciales } = require('../excel/googleDrive');

/**
 * SincronizacionExcelService
 * ----------------------------------------------------------------------
 * Mantiene los hideouts de la temporada activa al día con el Excel que
 * el equipo edita en Google Drive.
 *
 *  1. Consulta la fecha de modificación del archivo; si no cambió desde
 *     la última vez, no descarga nada (ahorra tráfico).
 *  2. Descarga el .xlsx y lo lee (hoja "Mapas BZ", ver hojaHideouts.js).
 *  3. Compara slot por slot con la base de datos y aplica solo las
 *     diferencias, en una transacción:
 *       - slot nuevo en el Excel        → se crea el hideout
 *       - slot que ya no está           → se borra (lo destruyeron)
 *       - otro gremio en el mismo slot  → se reemplaza (y se borran la
 *                                          posición y la nota del anterior)
 *       - mismo gremio, otro tipo       → se cambia el tipo (HQ / P)
 *     Lo demás (posiciones, notas, logos) no se toca.
 *  4. Deja constancia en la auditoría.
 *
 * El Excel manda: si alguien cambia un hideout desde el panel de
 * administración y el Excel dice otra cosa, la próxima sincronización
 * vuelve a lo del Excel.
 *
 * Protecciones:
 *  - Los mapas que el Excel nombra y la web no conoce se ignoran (se
 *    avisa de ellos), y los mapas que faltan en el Excel no se vacían.
 *  - Si se borrarían o reemplazarían más del 30 % de los hideouts, no se
 *    aplica nada (una hoja vaciada por error no borra la web) salvo que
 *    un administrador lo fuerce.
 *
 * Configuración (.env): EXCEL_DRIVE_ID y, opcional, EXCEL_SYNC_MINUTOS
 * (por defecto 60, mínimo 15). En la VM de Google Cloud no hace falta
 * ninguna clave: se usa la cuenta de servicio vinculada a la VM. Solo
 * fuera de Google Cloud se indica GOOGLE_CREDENCIALES (clave JSON).
 * ----------------------------------------------------------------------
 */

const LIMITE_CAMBIOS = 0.3;
const MINIMO_PARA_LIMITE = 20;

class ErrorSincronizacion extends Error {
  constructor(mensaje, { requiereForzar = false } = {}) {
    super(mensaje);
    this.publico = true;
    this.estado = 409;
    this.requiereForzar = requiereForzar;
  }
}

function clave(texto) {
  return String(texto || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

class SincronizacionExcelService {
  constructor({
    drive = null,
    archivoId = null,
    hideouts = new HideoutRepository(),
    mapas = new MapaRepository(),
    gremios = new GremioRepository(),
    temporadas = new TemporadaRepository(),
    auditoria = new AuditoriaRepository(),
    transaccion = (fn) => db.transaccion(fn),
    ahora = () => Date.now(),
  } = {}) {
    this.drive = drive;
    this.archivoId = archivoId;
    this.hideouts = hideouts;
    this.mapas = mapas;
    this.gremios = gremios;
    this.temporadas = temporadas;
    this.auditoria = auditoria;
    this.transaccion = transaccion;
    this.ahora = ahora;

    this.enCurso = null;
    this.ultimaModificacion = null;
    this.ultimo = null; // { en, ok, mensaje, resultado, archivo }
    // Correo de la cuenta de servicio: con él se comparte el Excel.
    this.cuenta = null;
  }

  configurada() {
    return Boolean(this.drive && this.archivoId);
  }

  estado() {
    return { configurada: this.configurada(), cuenta: this.cuenta, ultimo: this.ultimo };
  }

  /**
   * Revisa Drive y aplica los cambios. Si ya hay una sincronización en
   * curso, devuelve esa misma (no se solapan).
   */
  sincronizar({ forzar = false, usuarioId = null } = {}) {
    if (!this.configurada()) {
      return Promise.reject(new ErrorSincronizacion('La sincronización con Google Drive no está configurada.'));
    }
    if (!this.enCurso) {
      this.enCurso = this._sincronizar({ forzar, usuarioId }).finally(() => {
        this.enCurso = null;
      });
    }
    return this.enCurso;
  }

  async _sincronizar({ forzar, usuarioId }) {
    const en = new Date(this.ahora()).toISOString();
    if (!this.cuenta && typeof this.drive.cuenta === 'function') {
      this.cuenta = await this.drive.cuenta().catch(() => null);
    }
    try {
      const meta = await this.drive.metadatos(this.archivoId);
      const archivo = { nombre: meta.name, modificadoEn: meta.modifiedTime };
      if (!forzar && meta.modifiedTime && meta.modifiedTime === this.ultimaModificacion) {
        this.ultimo = { en, ok: true, mensaje: 'El Excel no cambió desde la última revisión.', resultado: null, archivo };
        return this.ultimo;
      }
      const mapas = leerHideoutsXlsx(await this.drive.descargar(meta));
      const resultado = this.aplicar(mapas, { forzar, usuarioId });
      this.ultimaModificacion = meta.modifiedTime || null;
      this.ultimo = { en, ok: true, mensaje: resultado.mensaje, resultado, archivo };
      return this.ultimo;
    } catch (error) {
      this.ultimo = { en, ok: false, mensaje: error.message, requiereForzar: Boolean(error.requiereForzar), resultado: null };
      throw error;
    }
  }

  /**
   * Compara los mapas del Excel con la temporada activa y aplica las
   * diferencias (síncrono: se prueba sin Drive).
   * @param {Array<{mapa: string, hideouts: Array<{slot, gremio, tipo}>}>} mapasExcel
   */
  aplicar(mapasExcel, { forzar = false, usuarioId = null } = {}) {
    if (!mapasExcel.length) throw new ErrorSincronizacion('La hoja "Mapas BZ" del Excel está vacía: no se aplicó nada.');
    const temporada = this.temporadas.obtenerActiva();
    if (!temporada) throw new ErrorSincronizacion('No hay una temporada activa en la base de datos.');

    const actuales = this.hideouts.listarTemporada(temporada.id);
    const porSlot = new Map(actuales.map((h) => [`${h.mapaId}:${h.slot}`, h]));
    const mapasWeb = new Map(this.mapas.listarNombres().map((m) => [clave(m.nombre), m]));

    const crear = [];
    const reemplazar = [];
    const cambiarTipo = [];
    const borrar = [];
    const desconocidos = [];
    const vistos = new Set();

    for (const { mapa, hideouts } of mapasExcel) {
      const fila = mapasWeb.get(clave(mapa));
      if (!fila) {
        desconocidos.push(mapa);
        continue;
      }
      vistos.add(fila.id);
      const enExcel = new Map(hideouts.map((h) => [h.slot, h]));
      for (let slot = 1; slot <= 10; slot++) {
        const actual = porSlot.get(`${fila.id}:${slot}`);
        const nuevo = enExcel.get(slot);
        if (nuevo && !actual) crear.push({ mapa: fila, slot, ...nuevo });
        else if (!nuevo && actual) borrar.push(actual);
        else if (nuevo && actual) {
          if (clave(nuevo.gremio) !== clave(actual.gremio)) reemplazar.push({ actual, ...nuevo });
          else if (nuevo.tipo !== actual.tipo) cambiarTipo.push({ actual, tipo: nuevo.tipo });
        }
      }
    }
    const mapasAusentes = [...new Set(actuales.filter((h) => !vistos.has(h.mapaId)).map((h) => h.mapa))];

    const destructivos = borrar.length + reemplazar.length;
    if (!forzar && actuales.length >= MINIMO_PARA_LIMITE && destructivos > actuales.length * LIMITE_CAMBIOS) {
      throw new ErrorSincronizacion(
        `El Excel borraría o cambiaría ${destructivos} de ${actuales.length} hideouts. Parece un error en la hoja, así que no se aplicó nada. Si es correcto, un administrador puede forzarlo.`,
        { requiereForzar: true }
      );
    }

    this.transaccion(() => {
      for (const h of crear) {
        const gremio = this.gremios.obtenerOCrear(h.gremio);
        this.hideouts.crear({ temporadaId: temporada.id, mapaId: h.mapa.id, gremioId: gremio.id, slot: h.slot, tipo: h.tipo });
      }
      for (const { actual, gremio, tipo } of reemplazar) {
        this.hideouts.reemplazarGremio(actual.id, { gremioId: this.gremios.obtenerOCrear(gremio).id, tipo });
      }
      for (const { actual, tipo } of cambiarTipo) this.hideouts.actualizar(actual.id, { tipo });
      for (const h of borrar) this.hideouts.eliminar(h.id);
    });

    const resultado = {
      creados: crear.length,
      reemplazados: reemplazar.length,
      tiposCambiados: cambiarTipo.length,
      eliminados: borrar.length,
      mapasDesconocidos: desconocidos,
      mapasAusentes,
    };
    const hubo = crear.length + reemplazar.length + cambiarTipo.length + borrar.length;
    resultado.mensaje = hubo
      ? `Actualizado: ${crear.length} nuevos, ${reemplazar.length} reemplazados, ${cambiarTipo.length} con otro tipo y ${borrar.length} eliminados.`
      : 'El Excel y la web ya coincidían.';

    if (hubo || desconocidos.length) {
      this.auditoria.registrar({
        usuarioId,
        accion: 'SINCRONIZAR_EXCEL',
        entidad: 'hideouts',
        detalle: {
          ...resultado,
          mensaje: undefined,
          ejemplos: [
            ...crear.slice(0, 5).map((h) => `+ ${h.mapa.nombre} HO${h.slot}: ${h.gremio}`),
            ...reemplazar.slice(0, 5).map((h) => `~ ${h.actual.mapa} HO${h.actual.slot}: ${h.actual.gremio} → ${h.gremio}`),
            ...borrar.slice(0, 5).map((h) => `- ${h.mapa} HO${h.slot}: ${h.gremio}`),
          ],
        },
      });
    }
    return resultado;
  }
}

/** Instancia única, configurada con las variables de entorno. */
let compartida = null;
function obtenerSincronizacion() {
  if (!compartida) {
    const archivoId = (process.env.EXCEL_DRIVE_ID || '').trim() || null;
    const ruta = (process.env.GOOGLE_CREDENCIALES || '').trim();
    let drive = null;
    // Sin GOOGLE_CREDENCIALES se usa la cuenta vinculada a la VM (sin claves).
    if (archivoId) drive = crearClienteDrive(ruta ? cargarCredenciales(ruta) : null);
    compartida = new SincronizacionExcelService({ drive, archivoId });
  }
  return compartida;
}

/** Minutos entre sincronizaciones (EXCEL_SYNC_MINUTOS, 60 por defecto, mínimo 15). */
function intervaloMinutos() {
  const valor = Number(process.env.EXCEL_SYNC_MINUTOS);
  return Number.isFinite(valor) && valor >= 15 ? valor : 60;
}

module.exports = SincronizacionExcelService;
module.exports.obtenerSincronizacion = obtenerSincronizacion;
module.exports.intervaloMinutos = intervaloMinutos;
module.exports.ErrorSincronizacion = ErrorSincronizacion;
