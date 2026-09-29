'use strict';

import api from './api.js';
import { crearIndiceZonas, buscarZona, MAX_MINUTOS } from './capturas/lectura.js';
import { agruparEnRutas, invertirRuta, claveRuta } from './capturas/encadenar.js';
import { t, tn } from './i18n.js';
import { mostrarSuave, ocultarSuave } from './animar.js';
import * as borrador from './capturas/borrador.js';
import { crearReloj, iniciarRelojes } from './rutas.js';

/**
 * registroCaminos.js
 * ----------------------------------------------------------------------
 * Panel "Registrar conexiones desde capturas":
 *
 *  1. El usuario pega (Ctrl+V), arrastra o elige capturas del juego con
 *     el recuadro de un portal de Avalon a la vista.
 *  2. Cada captura se lee en el navegador (capturas/ocr.js) y se
 *     convierte en una fila editable: origen, destino y tiempo de cierre.
 *  3. El usuario revisa (los campos dudosos se resaltan) y guarda.
 *
 * El tiempo leído es el restante en el momento de la captura; al guardar
 * se descuenta lo que haya pasado desde entonces.
 *
 * Las filas que se encadenan (el destino de una es el origen de otra, en
 * cualquier sentido) se proponen como una ruta; el usuario puede
 * invertirla o guardar los tramos por separado. Al encadenar también
 * cuentan las conexiones ya guardadas que siguen abiertas: una captura
 * nueva continúa una ruta registrada antes (por otro miembro o en otro
 * envío) sin volver a subir sus capturas.
 *
 * Mientras no se guardan, las capturas (imagen, lectura y correcciones)
 * se conservan en el navegador (capturas/borrador.js): si la página se
 * recarga, vuelven a aparecer tal como estaban.
 * ----------------------------------------------------------------------
 */

const CONFIANZA_SEGURA = 0.9;
// Una lectura que tarde más que esto se da por atascada (con el OCR ya
// cargado: la primera descarga no cuenta).
const LECTURA_MAX_MS = 60_000;
// Las conexiones guardadas a punto de cerrar no se proponen para rutas.
const MARGEN_GUARDADAS_MS = 60_000;

function nuevoId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Recorte del recuadro como imagen, para guardarlo en el borrador. */
function lienzoABlob(lienzo) {
  if (!lienzo || typeof lienzo.toBlob !== 'function') return Promise.resolve(null);
  return new Promise((resolver) => lienzo.toBlob((blob) => resolver(blob), 'image/png'));
}

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined && texto !== null) el.textContent = texto;
  return el;
}

export class PanelRegistro {
  constructor({ alGuardar }) {
    this.alGuardar = alGuardar;
    this.usuario = null;
    this.abierto = false;
    this.filas = [];
    this.cola = Promise.resolve();
    this.zonas = null;
    this.indice = null;
    this.ultimoOrigen = null;
    // Decisiones del usuario sobre cada ruta detectada (por clave de zonas).
    this.preferencias = new Map();
    this.rutasDetectadas = [];
    // Conexiones ya guardadas y abiertas: { id, origen, destino, cierraEn }.
    this.guardadas = [];
    this.guardadasEnRutas = [];
    // Modo edición de una ruta ya guardada: { ruta, previas, preferencias }.
    this.edicion = null;

    this.alternar = document.getElementById('registro-alternar');
    this.avisoEdicion = document.getElementById('registro-edicion');
    this.rutaEdicion = document.getElementById('registro-edicion-ruta');
    this.cuerpo = document.getElementById('registro-cuerpo');
    this.sinSesion = document.getElementById('registro-sin-sesion');
    this.conSesion = document.getElementById('registro-con-sesion');
    this.zona = document.getElementById('registro-zona');
    this.archivos = document.getElementById('registro-archivos');
    this.estado = document.getElementById('registro-estado');
    this.lista = document.getElementById('registro-lista');
    this.acciones = document.getElementById('registro-acciones');
    this.guardar = document.getElementById('registro-guardar');
    this.sugerencias = document.getElementById('registro-zonas');
    this.contenedorRutas = document.getElementById('registro-rutas');

    this._bindEventos();
    this._renderizarSesion();
  }

  establecerUsuario(usuario) {
    const antes = this._claveUsuario();
    this.usuario = usuario;
    this._renderizarSesion();
    const ahora = this._claveUsuario();
    if (ahora !== antes) {
      // Otro usuario (o sin sesión): sus capturas pendientes no se mezclan.
      if (this.edicion) this._salirDeEdicion({ restaurar: false });
      this._limpiarLista();
      if (ahora !== null) this._restaurar(ahora);
    }
  }

  /**
   * Conexiones vigentes del servidor (las que muestra la pestaña de
   * caminos), para continuar rutas ya registradas.
   */
  establecerGuardadas(conexiones = []) {
    this.guardadas = conexiones
      .filter((c) => c.reporteId && c.origen && c.origen.nombre && c.destino && c.destino.nombre)
      .map((c) => ({ id: c.reporteId, origen: c.origen.nombre, destino: c.destino.nombre, cierraEn: c.cierraEn }));
    if (this.filas.length) this._actualizarAcciones();
  }

  _claveUsuario() {
    return this.usuario ? String(this.usuario.id ?? this.usuario.usuario) : null;
  }

  _limpiarLista() {
    this.filas = [];
    this.preferencias.clear();
    this.lista.replaceChildren();
    this._actualizarAcciones();
  }

  // ------------------------------------------------------------ edición --

  /**
   * Abre una ruta guardada para corregirla: cada tramo pasa a ser una fila
   * (sin captura) que se puede quitar, mover o corregir, y se pueden pegar
   * capturas nuevas. Las capturas pendientes del panel se apartan y
   * vuelven al terminar. En edición las filas no van al borrador.
   */
  async editarRuta(ruta) {
    if (!this.usuario) return;
    if (this.edicion) this._salirDeEdicion();
    try {
      await this._cargarZonas();
    } catch (error) {
      // Sin zonas se edita igual; se validarán al escribir.
    }

    this.edicion = { ruta, previas: this.filas, preferencias: new Map(this.preferencias) };
    for (const fila of this.filas) fila.item.remove();
    this.filas = [];
    this.preferencias.clear();

    const ahora = Date.now();
    ruta.tramos.forEach((tramo, k) => {
      const fila = this._crearFila(ahora);
      const restantes = Math.max(0, Math.floor((tramo.cierraEn - ahora) / 60_000));
      fila.restaurar({
        valores: {
          origen: ruta.zonas[k].nombre,
          destino: ruta.zonas[k + 1].nombre,
          horas: restantes ? String(Math.floor(restantes / 60)) : '',
          minutos: restantes ? String(restantes % 60) : '',
        },
      });
      // Un portal que ya cerró hay que reemplazarlo (o quitarlo).
      if (!restantes) fila.poner('error', t('Este portal ya cerró: reemplázalo por el nuevo o quítalo.'));
    });

    this.rutaEdicion.textContent = `${ruta.zonas[0].nombre} → ${ruta.zonas[ruta.zonas.length - 1].nombre}`;
    this.avisoEdicion.hidden = false;
    this.cuerpo.closest('.registro').classList.add('registro--edicion');
    this.estado.textContent = '';
    if (!this.abierto) this._abrir();
    this._actualizarAcciones();
    this.avisoEdicion.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Termina la edición y devuelve al panel las capturas que había antes. */
  _salirDeEdicion({ restaurar = true } = {}) {
    const edicion = this.edicion;
    if (!edicion) return;
    this.edicion = null;
    this.avisoEdicion.hidden = true;
    this.cuerpo.closest('.registro').classList.remove('registro--edicion');
    this.lista.replaceChildren();
    this.filas = [];
    this.preferencias.clear();
    if (restaurar) {
      this.filas = edicion.previas;
      this.preferencias = edicion.preferencias;
      this.lista.append(...this.filas.map((f) => f.item));
    }
    this._actualizarAcciones();
  }

  /** Mueve una fila una posición arriba (-1) o abajo (+1). Solo en edición. */
  _moverFila(fila, paso) {
    const desde = this.filas.indexOf(fila);
    const hasta = desde + paso;
    if (desde < 0 || hasta < 0 || hasta >= this.filas.length) return;
    [this.filas[desde], this.filas[hasta]] = [this.filas[hasta], this.filas[desde]];
    this.lista.replaceChildren(...this.filas.map((f) => f.item));
    this._actualizarAcciones();
  }

  /**
   * Vuelve a mostrar las capturas que quedaron sin guardar (recarga,
   * pestaña cerrada...). Las de portales que ya cerraron se descartan.
   */
  async _restaurar(usuario) {
    const registros = await borrador.listar(usuario);
    if (usuario !== this._claveUsuario() || !registros.length) return;
    // Sin la lista de zonas ninguna fila parece válida (y Guardar quedaría
    // desactivado): se espera a tenerla.
    try {
      await this._cargarZonas();
    } catch (error) {
      // Sin zonas se restaura igual; se validarán al escribir.
    }
    if (usuario !== this._claveUsuario()) return;

    let recuperadas = 0;
    let caducadas = 0;
    for (const registro of registros) {
      if (this._caducado(registro)) {
        caducadas += 1;
        borrador.borrar(registro.id);
        continue;
      }
      const fila = this._crearFila(registro.capturadaEn, registro.id, registro.orden);
      recuperadas += 1;
      if (registro.leida) {
        fila.restaurar(registro);
      } else if (registro.archivo) {
        this.cola = this.cola.then(() => this._leer(fila, registro.archivo));
      }
    }

    const partes = [];
    if (recuperadas) partes.push(tn(recuperadas, 'Se recuperó {n} captura que no se había guardado.', 'Se recuperaron {n} capturas que no se habían guardado.'));
    if (caducadas) partes.push(tn(caducadas, 'Se descartó {n} de un portal que ya cerró.', 'Se descartaron {n} de portales que ya cerraron.'));
    this.estado.textContent = partes.join(' ');
    if (recuperadas && !this.abierto) this._abrir();
    this._actualizarAcciones();
  }

  /** Borrador que ya no sirve: muy antiguo o de un portal que ya cerró. */
  _caducado(registro) {
    const edad = Date.now() - registro.capturadaEn;
    if (edad > borrador.VIGENCIA_MS) return true;
    const valores = registro.valores;
    if (!registro.leida || !valores) return false;
    const total = Number(valores.horas || 0) * 60 + Number(valores.minutos || 0);
    return total > 0 && edad > total * 60_000;
  }

  /** Solo se atienden pegados mientras la pestaña de caminos está visible. */
  establecerVisible(visible) {
    this.visible = visible;
  }

  _bindEventos() {
    this.alternar.addEventListener('click', () => (this.abierto ? this._cerrar() : this._abrir()));

    window.addEventListener('paste', (evento) => {
      if (!this.visible || !this.usuario) return;
      const imagenes = [...(evento.clipboardData ? evento.clipboardData.files : [])].filter((f) => f.type.startsWith('image/'));
      if (!imagenes.length) return;
      evento.preventDefault();
      if (!this.abierto) this._abrir();
      this._agregar(imagenes, Date.now());
    });

    this.archivos.addEventListener('change', () => {
      this._agregar([...this.archivos.files], null);
      this.archivos.value = '';
    });

    for (const tipo of ['dragenter', 'dragover']) {
      this.zona.addEventListener(tipo, (evento) => {
        evento.preventDefault();
        this.zona.classList.add('registro__zona--activa');
      });
    }
    for (const tipo of ['dragleave', 'drop']) {
      this.zona.addEventListener(tipo, () => this.zona.classList.remove('registro__zona--activa'));
    }
    this.zona.addEventListener('drop', (evento) => {
      evento.preventDefault();
      const imagenes = [...evento.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
      this._agregar(imagenes, null);
    });

    this.guardar.addEventListener('click', () => this._guardar());
    document.getElementById('registro-vaciar').addEventListener('click', () => {
      this._limpiarLista();
      this.estado.textContent = '';
      // En edición solo se vacía la ruta que se edita; el borrador no se toca.
      const usuario = this._claveUsuario();
      if (usuario !== null && !this.edicion) borrador.vaciar(usuario);
    });
    document.getElementById('registro-edicion-cancelar').addEventListener('click', () => {
      this._salirDeEdicion();
      this.estado.textContent = t('Edición cancelada: la ruta no cambió.');
    });
  }

  /** Abre el panel (por ejemplo, desde la tarjeta "Registra conexiones"). */
  abrir() {
    if (!this.abierto) this._abrir();
  }

  _abrir() {
    this.abierto = true;
    mostrarSuave(this.cuerpo);
    this.alternar.textContent = t('Cerrar');
    this.alternar.setAttribute('aria-expanded', 'true');
    this._cargarZonas();
    if (this.usuario) {
      // Descarga el OCR en segundo plano para que la primera lectura sea rápida.
      import('./capturas/ocr.js').then((m) => m.precargarOcr()).catch(() => {});
    }
  }

  _cerrar() {
    this.abierto = false;
    ocultarSuave(this.cuerpo);
    this.alternar.textContent = t('Abrir');
    this.alternar.setAttribute('aria-expanded', 'false');
  }

  _renderizarSesion() {
    this.sinSesion.hidden = Boolean(this.usuario);
    this.conSesion.hidden = !this.usuario;
  }

  async _cargarZonas() {
    if (this.zonas) return this.zonas;
    if (!this._cargaZonas) {
      this._cargaZonas = api.zonas().then((r) => {
        this.zonas = r.zonas;
        this.indice = crearIndiceZonas(r.zonas);
        this.porNombre = new Map(r.zonas.map((z) => [z.nombre.toLowerCase(), z]));
        this.sugerencias.replaceChildren(
          ...r.zonas.map((z) => {
            const opcion = document.createElement('option');
            opcion.value = z.nombre;
            return opcion;
          })
        );
        return this.zonas;
      });
      this._cargaZonas.catch(() => { this._cargaZonas = null; });
    }
    return this._cargaZonas;
  }

  // ----------------------------------------------------------- lectura --

  /**
   * Encola las imágenes: el OCR usa un único worker, así que se leen de
   * una en una. `capturadaEn` es la hora de la captura si se conoce (al
   * pegar es "ahora"; en archivos se usa su fecha de modificación).
   */
  _agregar(imagenes, capturadaEn) {
    const usuario = this._claveUsuario();
    imagenes.forEach((archivo, n) => {
      const orden = Date.now() + n;
      const fila = this._crearFila(capturadaEn || archivo.lastModified || Date.now(), nuevoId(), orden);
      // Se guarda la imagen antes de leerla: si la página se recarga a
      // mitad de la cola, al volver se retoma la lectura. (En edición no:
      // esas capturas son de la ruta que se edita.)
      if (usuario !== null && !this.edicion) {
        borrador.guardar({ id: fila.id, usuario, orden, capturadaEn: fila.capturadaEn, archivo, leida: false });
      }
      this.cola = this.cola.then(() => this._leer(fila, archivo));
    });
    this._actualizarAcciones();
  }

  async _leer(fila, archivo) {
    fila.poner('leyendo', t('Leyendo la captura…'));
    let temporizador = null;
    try {
      await this._cargarZonas();
      const { leerCaptura, precargarOcr, reiniciarOcr } = await import('./capturas/ocr.js');
      await precargarOcr();
      // Una lectura colgada no puede dejar esperando a todas las capturas
      // que vienen detrás (el panel dejaba de admitir más).
      const atascada = new Promise((_, rechazar) => {
        temporizador = setTimeout(() => {
          reiniciarOcr();
          rechazar(Object.assign(new Error('tiempo'), { atascada: true }));
        }, LECTURA_MAX_MS);
      });
      const resultado = await Promise.race([
        leerCaptura(archivo, this.indice, {
          progreso: (m) => {
            if (m.status && m.status.includes('loading')) fila.poner('leyendo', t('Preparando el lector de capturas (solo la primera vez)…'));
          },
        }),
        atascada,
      ]);
      clearTimeout(temporizador);

      const origen = resultado.origen || this.ultimoOrigen;
      if (resultado.origen) this.ultimoOrigen = resultado.origen;
      fila.rellenar({
        origen,
        destino: resultado.destino,
        minutos: resultado.minutos,
        dudoso: {
          origen: !resultado.origen || resultado.confianza.origen < CONFIANZA_SEGURA,
          destino: !resultado.destino || resultado.confianza.destino < CONFIANZA_SEGURA,
          // Tiempo leído con poco margen entre dos cifras: se propone, pero se resalta.
          minutos: resultado.minutos === null || resultado.confianza.minutos < 1,
        },
        vista: resultado.vista,
      });

      if (fila.cerrado()) fila.evaluar();
      else if (resultado.aviso) fila.poner('revisar', t(resultado.aviso));
      else if (fila.valida()) fila.poner('lista', t('Revisa los datos y guarda.'));
      else fila.poner('revisar', t('Completa los campos resaltados.'));
      borrador.actualizar(fila.id, {
        leida: true,
        valores: fila.valores(),
        dudoso: fila.dudosos(),
        aviso: resultado.aviso || null,
        vista: await lienzoABlob(resultado.vista),
      });
    } catch (error) {
      clearTimeout(temporizador);
      fila.poner(
        'error',
        error && error.atascada
          ? t('La lectura tardó demasiado. Escribe los datos a mano, o quita la captura y pégala otra vez.')
          : t('No se pudo leer la captura. Puedes escribir los datos a mano.')
      );
      borrador.actualizar(fila.id, { leida: true, valores: fila.valores(), dudoso: fila.dudosos(), error: true });
    }
    this._actualizarAcciones();
  }

  _crearFila(capturadaEn, id = nuevoId(), orden = Date.now()) {
    const item = crear('li', 'registro__fila');
    const vista = crear('div', 'registro__vista');
    const campos = crear('div', 'registro__campos');
    const estado = crear('p', 'registro__fila-estado');
    const etiquetaRuta = crear('span', 'registro__en-ruta');
    etiquetaRuta.hidden = true;

    const campo = (etiqueta, input) => {
      const envoltura = crear('label', 'registro__campo');
      envoltura.append(crear('span', null, etiqueta), input);
      return envoltura;
    };
    const entradaZona = () => {
      const input = crear('input');
      input.type = 'text';
      input.setAttribute('list', 'registro-zonas');
      input.maxLength = 60;
      input.autocomplete = 'off';
      return input;
    };
    const entradaNumero = (max, sufijo) => {
      const input = crear('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(max);
      input.inputMode = 'numeric';
      input.setAttribute('aria-label', sufijo);
      return input;
    };

    const origen = entradaZona();
    const destino = entradaZona();
    const horas = entradaNumero(24, t('horas'));
    const minutos = entradaNumero(59, t('minutos'));
    const tiempo = crear('span', 'registro__tiempo');
    tiempo.append(horas, crear('span', null, 'h'), minutos, crear('span', null, 'm'));

    const quitar = crear('button', 'boton boton--icono registro__quitar', '✕');
    quitar.type = 'button';
    quitar.setAttribute('aria-label', t('Quitar esta captura'));

    campos.append(campo(t('Origen'), origen), campo(t('Destino'), destino), campo(t('Cierra en'), tiempo));
    item.append(vista, campos, quitar, estado, etiquetaRuta);

    // En edición el orden de las filas es el de la ruta: se puede cambiar.
    const mover = crear('span', 'registro__mover');
    for (const [simbolo, paso, etiqueta] of [['↑', -1, t('Subir')], ['↓', 1, t('Bajar')]]) {
      const boton = crear('button', 'boton boton--icono', simbolo);
      boton.type = 'button';
      boton.title = etiqueta;
      boton.setAttribute('aria-label', etiqueta);
      boton.addEventListener('click', () => this._moverFila(fila, paso));
      mover.append(boton);
    }
    item.append(mover);
    this.lista.append(item);

    const fila = {
      id,
      orden,
      item,
      capturadaEn,
      estadoActual: 'leyendo',
      marcarRuta: (texto) => {
        etiquetaRuta.hidden = !texto;
        etiquetaRuta.textContent = texto || '';
      },
      poner: (tipo, texto) => {
        fila.estadoActual = tipo;
        estado.textContent = texto;
        item.dataset.estado = tipo;
      },
      rellenar: (datos) => {
        origen.value = datos.origen || '';
        destino.value = datos.destino || '';
        if (datos.minutos !== null && datos.minutos !== undefined) {
          horas.value = String(Math.floor(datos.minutos / 60));
          minutos.value = String(datos.minutos % 60);
        }
        origen.classList.toggle('campo--dudoso', datos.dudoso.origen);
        destino.classList.toggle('campo--dudoso', datos.dudoso.destino);
        tiempo.classList.toggle('campo--dudoso', datos.dudoso.minutos);
        vista.replaceChildren(datos.vista || crear('span', 'registro__sin-vista', t('Sin recuadro')));
      },
      /** Lo escrito en los campos, tal cual (para el borrador). */
      valores: () => ({ origen: origen.value, destino: destino.value, horas: horas.value, minutos: minutos.value }),
      dudosos: () => ({
        origen: origen.classList.contains('campo--dudoso'),
        destino: destino.classList.contains('campo--dudoso'),
        minutos: tiempo.classList.contains('campo--dudoso'),
      }),
      /** Vuelve a mostrar una captura guardada en el borrador. */
      restaurar: (registro) => {
        const v = registro.valores || {};
        origen.value = v.origen || '';
        destino.value = v.destino || '';
        horas.value = v.horas || '';
        minutos.value = v.minutos || '';
        const dudoso = registro.dudoso || {};
        origen.classList.toggle('campo--dudoso', Boolean(dudoso.origen));
        destino.classList.toggle('campo--dudoso', Boolean(dudoso.destino));
        tiempo.classList.toggle('campo--dudoso', Boolean(dudoso.minutos));
        if (registro.vista) {
          // Se dibuja en un lienzo: la política de seguridad no admite
          // imágenes blob: (y así no hace falta relajarla).
          const lienzo = crear('canvas');
          vista.replaceChildren(lienzo);
          createImageBitmap(registro.vista)
            .then((bitmap) => {
              lienzo.width = bitmap.width;
              lienzo.height = bitmap.height;
              lienzo.getContext('2d').drawImage(bitmap, 0, 0);
              bitmap.close();
            })
            .catch(() => vista.replaceChildren(crear('span', 'registro__sin-vista', t('Sin recuadro'))));
        } else {
          vista.replaceChildren(crear('span', 'registro__sin-vista', t('Sin recuadro')));
        }
        if (registro.error && !fila.valida()) fila.poner('error', t('No se pudo leer la captura. Puedes escribir los datos a mano.'));
        else fila.evaluar(registro.aviso);
      },
      /** Datos listos para enviar, o null si falta algo. */
      datos: () => {
        const o = this._zonaExacta(origen.value);
        const d = this._zonaExacta(destino.value);
        const total = Number(horas.value || 0) * 60 + Number(minutos.value || 0);
        if (!o || !d || o === d || !Number.isInteger(total) || total < 1 || total > MAX_MINUTOS) return null;
        // Descuenta el tiempo transcurrido desde la captura. Si ya pasó, el
        // portal cerró: no se guarda ni forma rutas (antes quedaba con 1 min).
        const restante = total - Math.max(0, Math.floor((Date.now() - fila.capturadaEn) / 60_000));
        if (restante < 1) return null;
        return { origen: o, destino: d, minutos: restante };
      },
      valida: () => fila.datos() !== null,
      /** Momento en que cierra el portal (hora de la captura + tiempo leído). */
      cierraEn: () => fila.capturadaEn + (Number(horas.value || 0) * 60 + Number(minutos.value || 0)) * 60_000,
      /** Campos completos, pero el portal ya cerró desde la captura. */
      cerrado: () => {
        const total = Number(horas.value || 0) * 60 + Number(minutos.value || 0);
        return total > 0 && Date.now() - fila.capturadaEn >= total * 60_000;
      },
      /** Pone el estado que corresponde a lo escrito (lista, cerrada o incompleta). */
      evaluar: (avisoLectura = null) => {
        if (fila.valida()) fila.poner('lista', t('Lista para guardar.'));
        else if (fila.cerrado()) fila.poner('error', t('Este portal ya cerró: la captura es anterior a su cierre. Quítala.'));
        else if (avisoLectura) fila.poner('revisar', t(avisoLectura));
        else fila.poner('revisar', t('Completa los campos resaltados.'));
      },
    };

    for (const input of [origen, destino, horas, minutos]) {
      input.addEventListener('input', () => {
        input.classList.remove('campo--dudoso');
        if (input === horas || input === minutos) tiempo.classList.remove('campo--dudoso');
        if (fila.estadoActual !== 'leyendo') {
          fila.evaluar();
          // Las correcciones también se conservan (con una pausa corta
          // para no escribir en cada tecla).
          clearTimeout(fila._guardado);
          fila._guardado = setTimeout(
            () => borrador.actualizar(fila.id, { valores: fila.valores(), dudoso: fila.dudosos() }),
            400
          );
        }
        this._actualizarAcciones();
      });
    }
    quitar.addEventListener('click', () => {
      this.filas = this.filas.filter((f) => f !== fila);
      item.remove();
      borrador.borrar(fila.id);
      this._actualizarAcciones();
    });

    this.filas.push(fila);
    return fila;
  }

  /** Nombre oficial de una zona escrita o elegida (tolera mayúsculas y errores pequeños). */
  _zonaExacta(texto) {
    const limpio = String(texto || '').trim();
    if (!limpio || !this.porNombre) return null;
    const exacta = this.porNombre.get(limpio.toLowerCase());
    if (exacta) return exacta.nombre;
    const parecida = buscarZona(limpio, this.indice);
    return parecida && parecida.confianza >= CONFIANZA_SEGURA ? parecida.zona.nombre : null;
  }

  // ------------------------------------------------------------- rutas --

  /**
   * Recalcula qué filas forman rutas y las muestra para confirmar. Los
   * índices desde filas.length en adelante son conexiones ya guardadas;
   * solo se proponen las rutas que usan alguna captura nueva.
   */
  _actualizarRutas() {
    if (this.edicion) {
      this._actualizarRutaEditada();
      return;
    }
    const nuevas = this.filas.length;
    const tramos = this.filas.map((f) => (f.estadoActual !== 'leyendo' ? f.datos() : null));
    const limite = Date.now() + MARGEN_GUARDADAS_MS;
    this.guardadasEnRutas = nuevas ? this.guardadas.filter((g) => g.cierraEn > limite) : [];
    for (const g of this.guardadasEnRutas) tramos.push({ origen: g.origen, destino: g.destino });

    const grupoDe = (zona) => {
      const z = this.porNombre && this.porNombre.get(zona.toLowerCase());
      return z ? z.grupo : undefined;
    };
    const { rutas, truncado } = agruparEnRutas(tramos, grupoDe, {
      aceptar: (indices) => indices.some((i) => i < nuevas),
      // Una ruta puede terminar en un camino de hideouts.
      puedeTerminar: (zona) => {
        const z = this.porNombre && this.porNombre.get(zona.toLowerCase());
        return Boolean(z && z.hideout);
      },
    });

    this.rutasDetectadas = rutas.map((ruta) => {
      const clave = claveRuta(ruta.zonas);
      const pref = this.preferencias.get(clave) || {};
      return { ...(pref.invertida ? invertirRuta(ruta) : ruta), clave, separada: Boolean(pref.separada) };
    });

    // Un tramo puede estar en varias rutas (bifurcaciones): se listan todas.
    const pertenencias = new Map();
    this.rutasDetectadas.forEach((ruta, n) => {
      if (ruta.separada) return;
      ruta.indices.forEach((i, k) => {
        if (!pertenencias.has(i)) pertenencias.set(i, []);
        pertenencias.get(i).push({ ruta: n + 1, tramo: k + 1, total: ruta.indices.length });
      });
    });
    this.filas.forEach((fila, i) => {
      const lista = pertenencias.get(i);
      if (!lista) fila.marcarRuta(null);
      else if (lista.length === 1) fila.marcarRuta(t('Ruta {ruta} · tramo {tramo} de {total}', lista[0]));
      else fila.marcarRuta(t('En {n} rutas: {lista}', { n: lista.length, lista: lista.map((p) => p.ruta).join(', ') }));
    });

    const avisos = this.rutasDetectadas.map((ruta, n) => this._crearAvisoRuta(ruta, n));
    if (truncado) {
      avisos.unshift(crear('p', 'registro__ruta-tope', t('Hay demasiadas combinaciones: se muestran las primeras {n} rutas.', { n: rutas.length })));
    }
    this.contenedorRutas.hidden = !avisos.length;
    this.contenedorRutas.replaceChildren(...avisos);
  }

  /**
   * En edición la ruta son las filas en su orden (no se buscan
   * combinaciones): cada conexión tiene que continuar desde la anterior.
   * Devuelve las zonas de la ruta o null, y muestra el recorrido o el
   * problema.
   */
  _actualizarRutaEditada() {
    const aviso = (texto, clase = 'registro__ruta-tope') => {
      this.contenedorRutas.hidden = false;
      this.contenedorRutas.replaceChildren(crear('p', clase, texto));
      return null;
    };
    this.rutasDetectadas = [];
    for (const fila of this.filas) fila.marcarRuta(null);
    if (this.filas.some((f) => f.estadoActual === 'leyendo')) return aviso(t('Leyendo capturas…'), 'registro__ruta-zonas');
    if (this.filas.length < 2) return aviso(t('La ruta necesita al menos dos conexiones.'));
    const tramos = this.filas.map((f) => f.datos());
    const incompleta = tramos.findIndex((tramo) => !tramo);
    if (incompleta >= 0) return aviso(t('Completa o quita la conexión {n} para guardar.', { n: incompleta + 1 }));

    // Orienta la primera hacia la zona que comparte con la segunda.
    const [a, b] = tramos;
    const zonas = [b.origen, b.destino].includes(a.destino) ? [a.origen, a.destino] : [a.destino, a.origen];
    for (let k = 1; k < tramos.length; k++) {
      const final = zonas[zonas.length - 1];
      if (tramos[k].origen === final) zonas.push(tramos[k].destino);
      else if (tramos[k].destino === final) zonas.push(tramos[k].origen);
      else return aviso(t('La conexión {n} no continúa desde {zona}: corrígela o cambia el orden.', { n: k + 1, zona: final }));
    }
    if (new Set(zonas).size !== zonas.length) return aviso(t('La ruta pasa dos veces por la misma zona.'));

    this.filas.forEach((fila, k) => fila.marcarRuta(t('Tramo {tramo} de {total}', { tramo: k + 1, total: this.filas.length })));
    const caja = crear('div', 'registro__ruta');
    const titulo = crear('p', 'registro__ruta-titulo');
    const cierre = Math.min(...this.filas.map((f) => f.cierraEn()));
    titulo.append(crear('strong', null, t('Ruta editada')), t(' · {n} tramos', { n: tramos.length }), ' · ', crearReloj(cierre, { clase: 'reloj registro__ruta-reloj' }));
    iniciarRelojes();
    caja.append(titulo, crear('p', 'registro__ruta-zonas', zonas.join(' → ')));
    this.contenedorRutas.hidden = false;
    this.contenedorRutas.replaceChildren(caja);
    return zonas;
  }

  /** Momento de cierre del tramo i: una fila del panel o una conexión guardada. */
  _cierreTramo(i) {
    const nuevas = this.filas.length;
    return i < nuevas ? this.filas[i].cierraEn() : this.guardadasEnRutas[i - nuevas].cierraEn;
  }

  _crearAvisoRuta(ruta, n) {
    const caja = crear('div', `registro__ruta${ruta.separada ? ' registro__ruta--separada' : ''}`);
    const titulo = crear('p', 'registro__ruta-titulo');
    const yaGuardados = ruta.indices.filter((i) => i >= this.filas.length).length;
    titulo.append(
      crear('strong', null, t('Ruta {n}', { n: n + 1 })),
      t(' · {n} tramos', { n: ruta.indices.length }) +
        (yaGuardados ? tn(yaGuardados, ' ({n} ya guardado)', ' ({n} ya guardados)') : '') +
        (ruta.separada ? t(' (se guardarán por separado)') : '')
    );
    // Una ruta solo sirve mientras siga abierto el primero de sus portales en cerrar.
    if (!ruta.separada) {
      const cierre = Math.min(...ruta.indices.map((i) => this._cierreTramo(i)));
      titulo.append(' · ', crearReloj(cierre, { clase: 'reloj registro__ruta-reloj' }));
      iniciarRelojes();
    }
    const recorrido = crear('p', 'registro__ruta-zonas', ruta.zonas.join(' → '));

    const acciones = crear('div', 'registro__ruta-acciones');
    const invertir = crear('button', 'boton boton--pequeno boton--sutil', t('Invertir sentido'));
    invertir.type = 'button';
    invertir.disabled = ruta.separada;
    invertir.addEventListener('click', () => this._cambiarPreferencia(ruta.clave, 'invertida'));
    const separar = crear('button', 'boton boton--pequeno boton--sutil', ruta.separada ? t('Agrupar como ruta') : t('Guardar tramos por separado'));
    separar.type = 'button';
    separar.addEventListener('click', () => this._cambiarPreferencia(ruta.clave, 'separada'));
    acciones.append(invertir, separar);

    caja.append(titulo, recorrido, acciones);
    return caja;
  }

  _cambiarPreferencia(clave, campo) {
    const actual = this.preferencias.get(clave) || {};
    this.preferencias.set(clave, { ...actual, [campo]: !actual[campo] });
    this._actualizarAcciones();
  }

  _actualizarAcciones() {
    if (this.edicion) {
      // Se guarda la ruta entera, y solo si se encadena bien.
      const valida = Boolean(this._actualizarRutaEditada());
      this.acciones.hidden = false;
      this.guardar.disabled = !valida;
      this.guardar.textContent = t('Guardar cambios de la ruta');
      return;
    }
    this._actualizarRutas();
    const listas = this.filas.filter((f) => f.estadoActual !== 'leyendo' && f.valida()).length;
    const leyendo = this.filas.some((f) => f.estadoActual === 'leyendo');
    this.acciones.hidden = !this.filas.length;
    this.guardar.disabled = !listas || leyendo;
    this.guardar.textContent = listas ? tn(listas, 'Guardar {n} conexión', 'Guardar {n} conexiones') : t('Guardar conexiones');
  }

  // ----------------------------------------------------------- guardado --

  /** Guarda la ruta que se está editando (todas sus filas, en orden). */
  async _guardarEdicion() {
    const { ruta } = this.edicion;
    this.guardar.disabled = true;
    this.estado.textContent = t('Guardando…');
    try {
      await api.editarRuta(ruta.id, this.filas.map((f) => f.datos()));
      this._salirDeEdicion();
      this.estado.textContent = t('Ruta actualizada. ¡Gracias!');
      if (this.alGuardar) this.alGuardar();
    } catch (error) {
      this.estado.textContent = error.message || t('No se pudo guardar.');
      this._actualizarAcciones();
    }
  }

  async _guardar() {
    if (this.edicion) {
      await this._guardarEdicion();
      return;
    }
    const listas = this.filas.filter((f) => f.valida());
    if (!listas.length) return;

    // Las rutas se envían como listas de posiciones dentro de `conexiones`
    // o, para las conexiones ya guardadas, como { id }.
    const nuevas = this.filas.length;
    const posicion = new Map(listas.map((f, i) => [this.filas.indexOf(f), i]));
    const rutas = this.rutasDetectadas
      .filter((ruta) => !ruta.separada && ruta.indices.every((i) => i >= nuevas || posicion.has(i)))
      .map((ruta) =>
        ruta.indices.map((i) => (i < nuevas ? posicion.get(i) : { id: this.guardadasEnRutas[i - nuevas].id }))
      );

    this.guardar.disabled = true;
    this.estado.textContent = t('Guardando…');
    try {
      const r = await api.reportarConexiones(listas.map((f) => f.datos()), rutas);
      for (const fila of listas) {
        fila.item.remove();
        borrador.borrar(fila.id);
      }
      this.filas = this.filas.filter((f) => !listas.includes(f));
      const partes = [];
      if (r.creadas) partes.push(tn(r.creadas, '{n} nueva', '{n} nuevas'));
      if (r.actualizadas) partes.push(tn(r.actualizadas, '{n} actualizada', '{n} actualizadas'));
      if (r.rutas && r.rutas.length) partes.push(tn(r.rutas.length, '{n} ruta', '{n} rutas'));
      this.estado.textContent = t('Guardado: {resumen}. ¡Gracias!', { resumen: partes.join(t(' y ')) });
      if (this.alGuardar) this.alGuardar();
    } catch (error) {
      this.estado.textContent = error.message || t('No se pudo guardar.');
    }
    this._actualizarAcciones();
  }
}

export default PanelRegistro;
