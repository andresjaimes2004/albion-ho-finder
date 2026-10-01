'use strict';

const db = require('../config/database');
const HideoutRepository = require('../repositories/HideoutRepository');
const MapaRepository = require('../repositories/MapaRepository');
const GremioRepository = require('../repositories/GremioRepository');
const TemporadaRepository = require('../repositories/TemporadaRepository');
const AuditoriaRepository = require('../repositories/AuditoriaRepository');
const HideoutsCaminoService = require('./HideoutsCaminoService');
const { normalizarGremio } = require('./HideoutsCaminoService');
const { leerLibroHideouts, gremioDeCelda, HOJA_CAMINOS, COLUMNAS_GREMIOS, ENCABEZADO_CAMINOS } = require('../excel/hojaHideouts');
const { crearClienteDrive, cargarCredenciales, HOJA_GOOGLE } = require('../excel/googleDrive');
const { crearClienteHojas } = require('../excel/googleSheets');

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
 * Gremios de caminos de Avalon de hideouts (hoja "Caminos Avalon"):
 *  - Del Excel a la web: cada gremio válido del Excel se guarda en la web
 *    (caminos y gremios se validan antes: los que no son caminos de
 *    hideouts o no son nombres válidos se ignoran y se avisa). Si el
 *    equipo borra del Excel un gremio que la web ya le había pasado, la
 *    web también lo quita (el Excel manda), con la misma protección del
 *    30 %. Lo anotado en la web y aún no enviado no se toca.
 *  - De la web al Excel, SOLO AGREGANDO: lo anotado en la web que el
 *    Excel no tiene se escribe en la primera celda libre de la fila de
 *    su camino (o en una fila nueva al final). Se vuelve a leer la hoja
 *    justo antes y se comprueba que la celda siga vacía; si el gremio ya
 *    está, no se escribe nada. El cliente de Hojas de cálculo
 *    (googleSheets.js) no tiene ninguna operación de borrar o
 *    sobrescribir. Solo funciona si el archivo es una Hoja de cálculo de
 *    Google; con un .xlsx subido a Drive se avisa y se espera.
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
    caminos = new HideoutsCaminoService(),
    hojas = null,
    transaccion = (fn) => db.transaccion(fn),
    ahora = () => Date.now(),
  } = {}) {
    this.drive = drive;
    this.archivoId = archivoId;
    // Gremios de caminos de hideouts y cliente para agregarlos al Excel.
    this.caminos = caminos;
    this.hojas = hojas;
    this.ultimaExportacion = null; // { en, ok, mensaje, pendientes }
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
    return {
      configurada: this.configurada(),
      cuenta: this.cuenta,
      ultimo: this.ultimo,
      // Gremios de caminos anotados en la web que el Excel aún no tiene.
      caminos: { pendientes: this.caminos.repositorio.contarPendientesExcel(), ultimaExportacion: this.ultimaExportacion },
    };
  }

  /**
   * Para las tareas periódicas: hay gremios de caminos por pasar al Excel
   * y conviene no esperar a la próxima sincronización (pero sin insistir
   * cada minuto si el último intento falló o se acaba de intentar).
   */
  debeExportarPronto({ esperaMs = 2 * 60_000, esperaTrasFalloMs = 30 * 60_000 } = {}) {
    if (!this.configurada() || !this.hojas || this.enCurso) return false;
    if (!this.caminos.repositorio.contarPendientesExcel()) return false;
    // Si la última sincronización falló (Drive, protección del 30 %...), se
    // espera también: exportar exige una lectura correcta antes.
    if (this.ultimo && !this.ultimo.ok && this.ahora() - Date.parse(this.ultimo.en) < esperaTrasFalloMs) return false;
    const ultima = this.ultimaExportacion;
    if (!ultima) return true;
    const desde = this.ahora() - Date.parse(ultima.en);
    return desde >= (ultima.ok && !ultima.aviso ? esperaMs : esperaTrasFalloMs);
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
      let resultado = null;
      const mensajes = [];
      if (!forzar && meta.modifiedTime && meta.modifiedTime === this.ultimaModificacion) {
        mensajes.push('El Excel no cambió desde la última revisión.');
      } else {
        const libro = leerLibroHideouts(await this.drive.descargar(meta));
        resultado = this.aplicar(libro.mapas, { forzar, usuarioId });
        resultado.caminos = this.aplicarCaminos(libro.caminos, { forzar, usuarioId });
        this.ultimaModificacion = meta.modifiedTime || null;
        mensajes.push(resultado.mensaje);
        if (resultado.caminos && resultado.caminos.mensaje) mensajes.push(resultado.caminos.mensaje);
      }
      // De la web al Excel, solo agregando. Un fallo aquí no anula lo leído.
      const exportacion = await this._exportar(meta, { usuarioId });
      if (exportacion && exportacion.mensaje) mensajes.push(exportacion.mensaje);
      this.ultimo = { en, ok: true, mensaje: mensajes.join(' '), resultado, archivo, exportacion };
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

  // ------------------------------------------ caminos de hideouts --

  /**
   * Hoja "Caminos Avalon" → web (síncrono: se prueba sin Drive).
   * @param {Array<{camino: string, gremios: string[]}> | null} caminosExcel
   *   null si el Excel no tiene la hoja: no se toca nada.
   */
  aplicarCaminos(caminosExcel, { forzar = false, usuarioId = null } = {}) {
    if (!caminosExcel) return null;
    const repositorio = this.caminos.repositorio;

    // 1. Validar: solo caminos de hideouts del catálogo y nombres válidos.
    const enExcel = new Map();
    const caminosDesconocidos = [];
    const gremiosInvalidos = [];
    for (const fila of caminosExcel) {
      const camino = this.caminos.camino(fila.camino);
      if (!camino) {
        caminosDesconocidos.push(fila.camino);
        continue;
      }
      for (const nombre of fila.gremios) {
        let gremio;
        try {
          // Del Excel (lo mantiene el equipo): sin el filtro de insultos.
          gremio = this.caminos.validarGremio(nombre, { revisarOfensivo: false });
        } catch (error) {
          gremiosInvalidos.push(`${camino.nombre}: ${nombre}`);
          continue;
        }
        const normalizado = normalizarGremio(gremio);
        enExcel.set(`${camino.nombre}|${normalizado}`, { camino: camino.nombre, gremio, normalizado });
      }
    }

    // 2. Comparar con la web.
    const actuales = repositorio.listarTodos();
    const porClave = new Map(actuales.map((h) => [`${h.camino}|${h.gremioNormalizado}`, h]));
    const agregar = [...enExcel.entries()].filter(([k]) => !porClave.has(k)).map(([, v]) => v);
    const marcar = actuales.filter((h) => !h.enExcel && enExcel.has(`${h.camino}|${h.gremioNormalizado}`));
    // Solo se quita lo que el Excel ya tenía (lo pendiente de enviar se queda).
    const quitar = actuales.filter((h) => h.enExcel && !enExcel.has(`${h.camino}|${h.gremioNormalizado}`));

    const conocidos = actuales.filter((h) => h.enExcel).length;
    if (!forzar && conocidos >= MINIMO_PARA_LIMITE && quitar.length > conocidos * LIMITE_CAMBIOS) {
      throw new ErrorSincronizacion(
        `La hoja "${HOJA_CAMINOS}" quitaría ${quitar.length} de ${conocidos} gremios de caminos. Parece un error en la hoja, así que no se aplicó nada. Si es correcto, un administrador puede forzarlo.`,
        { requiereForzar: true }
      );
    }

    this.transaccion(() => {
      for (const g of agregar) {
        repositorio.guardar({ camino: g.camino, gremio: g.gremio, gremioNormalizado: g.normalizado, origen: 'excel' });
      }
      for (const h of marcar) repositorio.marcarEnExcel(h.id);
      for (const h of quitar) repositorio.eliminar(h.id);
    });

    const resultado = {
      agregados: agregar.length,
      quitados: quitar.length,
      caminosDesconocidos,
      gremiosInvalidos,
      mensaje:
        agregar.length || quitar.length
          ? `Caminos de hideouts: ${agregar.length} gremios nuevos desde el Excel y ${quitar.length} quitados.`
          : null,
    };
    if (agregar.length || quitar.length || caminosDesconocidos.length || gremiosInvalidos.length) {
      this.auditoria.registrar({
        usuarioId,
        accion: 'SINCRONIZAR_EXCEL',
        entidad: 'hideouts_camino',
        detalle: {
          ...resultado,
          mensaje: undefined,
          ejemplos: [
            ...agregar.slice(0, 5).map((g) => `+ ${g.camino}: ${g.gremio}`),
            ...quitar.slice(0, 5).map((h) => `- ${h.camino}: ${h.gremio}`),
          ],
        },
      });
    }
    return resultado;
  }

  /** Envía lo pendiente al Excel y deja constancia del intento (nunca lanza). */
  async _exportar(meta, { usuarioId = null } = {}) {
    const pendientes = this.caminos.repositorio.contarPendientesExcel();
    if (!pendientes || !this.hojas) return null;
    const en = new Date(this.ahora()).toISOString();
    let resultado;
    if (meta.mimeType !== HOJA_GOOGLE) {
      resultado = {
        ok: true,
        aviso: true,
        mensaje: `Hay ${pendientes} gremios de caminos por agregar al Excel, pero el archivo es un .xlsx subido a Drive y la web solo puede escribir en una Hoja de cálculo de Google (ver README).`,
      };
    } else {
      try {
        resultado = { ok: true, ...(await this.exportarCaminos({ usuarioId })) };
      } catch (error) {
        resultado = { ok: false, mensaje: `No se pudieron agregar los gremios de caminos al Excel: ${error.message}` };
      }
    }
    this.ultimaExportacion = { en, ...resultado, pendientes: this.caminos.repositorio.contarPendientesExcel() };
    return this.ultimaExportacion;
  }

  /**
   * Web → hoja "Caminos Avalon", SOLO AGREGANDO. Lee la hoja justo antes;
   * por cada gremio pendiente:
   *   - si su camino ya tiene ese gremio, solo se marca como presente;
   *   - si no, se escribe en la primera celda vacía de la fila del camino
   *     (el cliente comprueba otra vez que siga vacía);
   *   - si el camino no tiene fila, se agrega una al final;
   *   - si la fila está llena (10 gremios), se queda pendiente.
   */
  async exportarCaminos({ usuarioId = null } = {}) {
    const id = this.archivoId;
    const repositorio = this.caminos.repositorio;
    const pendientes = repositorio.listarPendientesExcel();
    if (!pendientes.length) return { agregados: 0, yaEstaban: 0, sinHueco: 0, mensaje: null };

    if (!(await this.hojas.titulos(id)).includes(HOJA_CAMINOS)) {
      await this.hojas.crearHoja(id, HOJA_CAMINOS, ENCABEZADO_CAMINOS);
    }
    const ultimaColumna = String.fromCharCode(65 + COLUMNAS_GREMIOS);
    const filas = await this.hojas.leer(id, HOJA_CAMINOS, `A1:${ultimaColumna}`);
    const porCamino = new Map();
    filas.forEach((fila, i) => {
      if (i === 0 || !fila || !String(fila[0] || '').trim()) return;
      const camino = this.caminos.camino(String(fila[0]));
      const claveCamino = camino ? camino.nombre : clave(fila[0]);
      if (porCamino.has(claveCamino)) return; // camino repetido: cuenta la primera fila
      const celdas = Array.from({ length: COLUMNAS_GREMIOS + 1 }, (_, c) => String(fila[c] ?? '').trim());
      porCamino.set(claveCamino, { numero: i + 1, celdas });
    });

    // 1. Validar otra vez lo pendiente antes de escribir nada.
    const grupos = new Map();
    let invalidos = 0;
    for (const h of pendientes) {
      const camino = this.caminos.camino(h.camino);
      let gremio = null;
      try {
        gremio = camino ? this.caminos.validarGremio(h.gremio) : null;
      } catch (error) {
        gremio = null;
      }
      if (!gremio) {
        invalidos += 1;
        continue;
      }
      if (!grupos.has(camino.nombre)) grupos.set(camino.nombre, []);
      grupos.get(camino.nombre).push({ ...h, gremio });
    }

    let agregados = 0;
    let yaEstaban = 0;
    let sinHueco = 0;
    const ejemplos = [];
    for (const [camino, lista] of grupos) {
      const fila = porCamino.get(camino);
      if (!fila) {
        // Fila nueva al final de la tabla con los primeros 10 gremios.
        const caben = lista.slice(0, COLUMNAS_GREMIOS);
        await this.hojas.agregarFila(id, HOJA_CAMINOS, [camino, ...caben.map((h) => h.gremio)]);
        for (const h of caben) repositorio.marcarEnExcel(h.id);
        agregados += caben.length;
        sinHueco += lista.length - caben.length;
        ejemplos.push(...caben.map((h) => `+ ${camino}: ${h.gremio}`));
        continue;
      }
      const presentes = new Set(fila.celdas.slice(1).filter(Boolean).map((c) => normalizarGremio(gremioDeCelda(c))));
      for (const h of lista) {
        if (presentes.has(h.gremioNormalizado)) {
          repositorio.marcarEnExcel(h.id);
          yaEstaban += 1;
          continue;
        }
        const columna = fila.celdas.findIndex((c, k) => k >= 1 && !c);
        if (columna === -1) {
          sinHueco += 1;
          continue;
        }
        const celda = `${String.fromCharCode(65 + columna)}${fila.numero}`;
        const escrita = await this.hojas.escribirSiVacia(id, HOJA_CAMINOS, celda, h.gremio);
        // Si alguien la ocupó justo ahora, se deja para la próxima vez.
        fila.celdas[columna] = escrita ? h.gremio : '(ocupada)';
        if (!escrita) continue;
        presentes.add(h.gremioNormalizado);
        repositorio.marcarEnExcel(h.id);
        agregados += 1;
        ejemplos.push(`+ ${camino}: ${h.gremio}`);
      }
    }

    if (agregados) {
      this.auditoria.registrar({
        usuarioId,
        accion: 'AGREGAR_EXCEL',
        entidad: 'hideouts_camino',
        detalle: { agregados, yaEstaban, sinHueco, invalidos, ejemplos: ejemplos.slice(0, 10) },
      });
    }
    const partes = [];
    if (agregados) partes.push(`${agregados} gremios de caminos agregados al Excel`);
    if (sinHueco) partes.push(`${sinHueco} sin hueco en su fila (máximo ${COLUMNAS_GREMIOS} por camino)`);
    if (invalidos) partes.push(`${invalidos} no válidos`);
    return { agregados, yaEstaban, sinHueco, invalidos, mensaje: partes.length ? `${partes.join(', ')}.` : null };
  }
}

/** Instancia única, configurada con las variables de entorno. */
let compartida = null;
function obtenerSincronizacion() {
  if (!compartida) {
    const archivoId = (process.env.EXCEL_DRIVE_ID || '').trim() || null;
    const ruta = (process.env.GOOGLE_CREDENCIALES || '').trim();
    let drive = null;
    let hojas = null;
    // Sin GOOGLE_CREDENCIALES se usa la cuenta vinculada a la VM (sin claves).
    if (archivoId) {
      const credenciales = ruta ? cargarCredenciales(ruta) : null;
      drive = crearClienteDrive(credenciales);
      hojas = crearClienteHojas(credenciales);
    }
    compartida = new SincronizacionExcelService({ drive, archivoId, hojas });
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
