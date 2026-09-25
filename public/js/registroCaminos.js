'use strict';

import api from './api.js';
import { crearIndiceZonas, buscarZona, MAX_MINUTOS } from './capturas/lectura.js';

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
 * ----------------------------------------------------------------------
 */

const CONFIANZA_SEGURA = 0.9;

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

    this.alternar = document.getElementById('registro-alternar');
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

    this._bindEventos();
    this._renderizarSesion();
  }

  establecerUsuario(usuario) {
    this.usuario = usuario;
    this._renderizarSesion();
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
      this.filas = [];
      this.lista.replaceChildren();
      this._actualizarAcciones();
      this.estado.textContent = '';
    });
  }

  _abrir() {
    this.abierto = true;
    this.cuerpo.hidden = false;
    this.alternar.textContent = 'Cerrar';
    this.alternar.setAttribute('aria-expanded', 'true');
    this._cargarZonas();
    if (this.usuario) {
      // Descarga el OCR en segundo plano para que la primera lectura sea rápida.
      import('./capturas/ocr.js').then((m) => m.precargarOcr()).catch(() => {});
    }
  }

  _cerrar() {
    this.abierto = false;
    this.cuerpo.hidden = true;
    this.alternar.textContent = 'Abrir';
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
    for (const archivo of imagenes) {
      const fila = this._crearFila(capturadaEn || archivo.lastModified || Date.now());
      this.cola = this.cola.then(() => this._leer(fila, archivo));
    }
    this._actualizarAcciones();
  }

  async _leer(fila, archivo) {
    fila.poner('leyendo', 'Leyendo la captura…');
    try {
      await this._cargarZonas();
      const { leerCaptura } = await import('./capturas/ocr.js');
      const resultado = await leerCaptura(archivo, this.indice, {
        progreso: (m) => {
          if (m.status && m.status.includes('loading')) fila.poner('leyendo', 'Preparando el lector de capturas (solo la primera vez)…');
        },
      });

      const origen = resultado.origen || this.ultimoOrigen;
      if (resultado.origen) this.ultimoOrigen = resultado.origen;
      fila.rellenar({
        origen,
        destino: resultado.destino,
        minutos: resultado.minutos,
        dudoso: {
          origen: !resultado.origen || resultado.confianza.origen < CONFIANZA_SEGURA,
          destino: !resultado.destino || resultado.confianza.destino < CONFIANZA_SEGURA,
          minutos: resultado.minutos === null,
        },
        vista: resultado.vista,
      });

      if (resultado.aviso) fila.poner('revisar', resultado.aviso);
      else if (fila.valida()) fila.poner('lista', 'Revisa los datos y guarda.');
      else fila.poner('revisar', 'Completa los campos resaltados.');
    } catch (error) {
      fila.poner('error', 'No se pudo leer la captura. Puedes escribir los datos a mano.');
    }
    this._actualizarAcciones();
  }

  _crearFila(capturadaEn) {
    const item = crear('li', 'registro__fila');
    const vista = crear('div', 'registro__vista');
    const campos = crear('div', 'registro__campos');
    const estado = crear('p', 'registro__fila-estado');

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
    const horas = entradaNumero(24, 'horas');
    const minutos = entradaNumero(59, 'minutos');
    const tiempo = crear('span', 'registro__tiempo');
    tiempo.append(horas, crear('span', null, 'h'), minutos, crear('span', null, 'm'));

    const quitar = crear('button', 'boton boton--icono registro__quitar', '✕');
    quitar.type = 'button';
    quitar.setAttribute('aria-label', 'Quitar esta captura');

    campos.append(campo('Origen', origen), campo('Destino', destino), campo('Cierra en', tiempo));
    item.append(vista, campos, quitar, estado);
    this.lista.append(item);

    const fila = {
      item,
      capturadaEn,
      estadoActual: 'leyendo',
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
        vista.replaceChildren(datos.vista || crear('span', 'registro__sin-vista', 'Sin recuadro'));
      },
      /** Datos listos para enviar, o null si falta algo. */
      datos: () => {
        const o = this._zonaExacta(origen.value);
        const d = this._zonaExacta(destino.value);
        const total = Number(horas.value || 0) * 60 + Number(minutos.value || 0);
        if (!o || !d || o === d || !Number.isInteger(total) || total < 1 || total > MAX_MINUTOS) return null;
        // Descuenta el tiempo transcurrido desde la captura.
        const transcurrido = Math.floor((Date.now() - fila.capturadaEn) / 60_000);
        return { origen: o, destino: d, minutos: Math.max(1, total - Math.max(0, transcurrido)) };
      },
      valida: () => fila.datos() !== null,
    };

    for (const input of [origen, destino, horas, minutos]) {
      input.addEventListener('input', () => {
        input.classList.remove('campo--dudoso');
        if (input === horas || input === minutos) tiempo.classList.remove('campo--dudoso');
        if (fila.estadoActual !== 'leyendo') {
          fila.poner(fila.valida() ? 'lista' : 'revisar', fila.valida() ? 'Lista para guardar.' : 'Completa los campos resaltados.');
        }
        this._actualizarAcciones();
      });
    }
    quitar.addEventListener('click', () => {
      this.filas = this.filas.filter((f) => f !== fila);
      item.remove();
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

  _actualizarAcciones() {
    const listas = this.filas.filter((f) => f.estadoActual !== 'leyendo' && f.valida()).length;
    const leyendo = this.filas.some((f) => f.estadoActual === 'leyendo');
    this.acciones.hidden = !this.filas.length;
    this.guardar.disabled = !listas || leyendo;
    this.guardar.textContent = listas ? `Guardar ${listas} conexi${listas === 1 ? 'ón' : 'ones'}` : 'Guardar conexiones';
  }

  // ----------------------------------------------------------- guardado --

  async _guardar() {
    const listas = this.filas.filter((f) => f.valida());
    if (!listas.length) return;

    this.guardar.disabled = true;
    this.estado.textContent = 'Guardando…';
    try {
      const r = await api.reportarConexiones(listas.map((f) => f.datos()));
      for (const fila of listas) fila.item.remove();
      this.filas = this.filas.filter((f) => !listas.includes(f));
      const partes = [];
      if (r.creadas) partes.push(`${r.creadas} nueva${r.creadas === 1 ? '' : 's'}`);
      if (r.actualizadas) partes.push(`${r.actualizadas} actualizada${r.actualizadas === 1 ? '' : 's'}`);
      this.estado.textContent = `Guardado: ${partes.join(' y ')}. ¡Gracias!`;
      if (this.alGuardar) this.alGuardar();
    } catch (error) {
      this.estado.textContent = error.message || 'No se pudo guardar.';
    }
    this._actualizarAcciones();
  }
}

export default PanelRegistro;
