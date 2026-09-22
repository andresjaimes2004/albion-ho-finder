'use strict';

import api from './api.js';
import { VentanaMapa } from './mapaDetalle.js';
import { MapaMundial } from './mapaMundial.js';
import { PanelSesion } from './sesion.js';
import { PanelAdmin } from './admin.js';

/**
 * app.js
 * ----------------------------------------------------------------------
 * Controlador de la interfaz (POO, sin frameworks): encapsula referencias
 * al DOM y el estado de la búsqueda, y coordina los módulos de mapa,
 * sesión y administración.
 *
 * Todo el contenido dinámico se inserta con textContent/createElement
 * (nunca innerHTML con datos de la API) para evitar XSS con nombres de
 * gremio arbitrarios.
 * ----------------------------------------------------------------------
 */
class BuscadorUI {
  constructor() {
    this.input = document.getElementById('input-gremio');
    this.badgeTemporada = document.getElementById('badge-temporada');

    this.estados = {
      vacio: document.getElementById('estado-vacio'),
      cargando: document.getElementById('estado-cargando'),
      sinResultados: document.getElementById('estado-sin-resultados'),
      error: document.getElementById('estado-error'),
    };
    this.errorTexto = document.getElementById('estado-error__texto');

    this.resumen = document.getElementById('resumen-resultados');
    this.listaMapas = document.getElementById('lista-mapas');

    this.temporizadorDebounce = null;
    this.controladorActual = null;
    this.usuario = null;
    this.ultimoTermino = '';

    this.ventanaMapa = new VentanaMapa({
      obtenerSesion: () => this.usuario,
      alCambiar: () => this._repetirBusqueda(),
    });

    this.mapaMundial = new MapaMundial({
      alSeleccionar: (nombre) => this.ventanaMapa.abrir(nombre, { resaltarGremio: this.ultimoTermino }),
    });

    this.panelAdmin = new PanelAdmin();

    this.panelSesion = new PanelSesion({
      alCambiarSesion: (usuario) => {
        this.usuario = usuario;
        this.panelAdmin.establecerUsuario(usuario);
      },
      alElegirTermino: (termino) => {
        this.input.value = termino;
        this._ejecutarBusqueda(termino);
      },
    });

    this._bindEventos();
    this._iniciar();
  }

  async _iniciar() {
    await this.panelSesion.refrescar();
    try {
      await this.mapaMundial.cargar();
    } catch (error) {
      /* el mapa es un complemento: si falla, el buscador sigue sirviendo */
    }
  }

  _bindEventos() {
    this.input.addEventListener('input', () => {
      clearTimeout(this.temporizadorDebounce);
      const texto = this.input.value.trim();

      if (texto.length < 2) {
        this._mostrarEstado('vacio');
        this.mapaMundial.destacar([]);
        return;
      }

      this.temporizadorDebounce = setTimeout(() => this._ejecutarBusqueda(texto), 300);
    });

    document.getElementById('alternar-mapa').addEventListener('click', (evento) => {
      const seccion = document.getElementById('mapa-mundial');
      seccion.hidden = !seccion.hidden;
      evento.currentTarget.setAttribute('aria-expanded', String(!seccion.hidden));
      evento.currentTarget.textContent = seccion.hidden ? 'Ver mapa de la Zona Negra' : 'Ocultar mapa';
      if (!seccion.hidden) this.mapaMundial.cargar().catch(() => {});
    });
  }

  _mostrarEstado(nombreEstado) {
    Object.values(this.estados).forEach((el) => (el.hidden = true));
    this.resumen.hidden = true;
    this.listaMapas.replaceChildren();

    if (nombreEstado && this.estados[nombreEstado]) {
      this.estados[nombreEstado].hidden = false;
    }
  }

  _repetirBusqueda() {
    if (this.ultimoTermino) this._ejecutarBusqueda(this.ultimoTermino);
  }

  async _ejecutarBusqueda(texto) {
    this._mostrarEstado('cargando');
    this.ultimoTermino = texto;

    if (this.controladorActual) this.controladorActual.abort();
    this.controladorActual = new AbortController();

    try {
      const datos = await api.buscar(texto, this.controladorActual.signal);

      this._actualizarBadgeTemporada(datos.temporada);

      if (datos.totalMapas === 0) {
        this._mostrarEstado('sinResultados');
        this.mapaMundial.destacar([]);
        return;
      }

      this._renderizarResultados(datos);
      this.mapaMundial.destacar(datos.resultados.map((r) => r.mapa));
      this.panelSesion.refrescarHistorial();
    } catch (error) {
      if (error.name === 'AbortError') return;
      this.errorTexto.textContent = error.message || 'No se pudo conectar con el servidor.';
      this._mostrarEstado('error');
    }
  }

  _actualizarBadgeTemporada(codigo) {
    if (!codigo) return;
    this.badgeTemporada.textContent = `Temporada ${codigo}`;
    this.badgeTemporada.hidden = false;
  }

  _renderizarResultados(datos) {
    this._mostrarEstado(null);

    this.resumen.hidden = false;
    this.resumen.replaceChildren(
      this._crearSpanResumen(`${datos.totalMapas} mapa${datos.totalMapas === 1 ? '' : 's'}`),
      this._crearSpanResumen(`${datos.totalHideouts} hideout${datos.totalHideouts === 1 ? '' : 's'}`)
    );

    this.listaMapas.replaceChildren();
    for (const grupo of datos.resultados) {
      this.listaMapas.appendChild(this._crearTarjetaMapa(grupo));
    }
  }

  _crearSpanResumen(texto) {
    const span = document.createElement('span');
    const partes = texto.split(' ');
    const fuerte = document.createElement('strong');
    fuerte.textContent = partes[0];
    span.appendChild(fuerte);
    span.append(' ' + partes.slice(1).join(' '));
    return span;
  }

  _crearTarjetaMapa(grupo) {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta-mapa';

    const encabezado = document.createElement('button');
    encabezado.type = 'button';
    encabezado.className = 'tarjeta-mapa__encabezado';
    encabezado.setAttribute('aria-label', `Ver el mapa ${grupo.mapa} en detalle`);

    const titulo = document.createElement('h3');
    titulo.className = 'tarjeta-mapa__nombre';
    titulo.textContent = grupo.mapa;
    encabezado.appendChild(titulo);

    if (grupo.geo) {
      const meta = document.createElement('span');
      meta.className = 'tarjeta-mapa__meta';
      const partes = [];
      if (grupo.geo.tier) partes.push(`T${grupo.geo.tier}`);
      if (grupo.geo.cuadrante) partes.push(grupo.geo.cuadrante);
      meta.textContent = partes.join(' · ');
      encabezado.appendChild(meta);
    }

    const verMapa = document.createElement('span');
    verMapa.className = 'tarjeta-mapa__accion';
    verMapa.textContent = 'Ver mapa';
    encabezado.appendChild(verMapa);

    encabezado.addEventListener('click', () =>
      this.ventanaMapa.abrir(grupo.mapa, { resaltarGremio: this.ultimoTermino })
    );

    tarjeta.appendChild(encabezado);

    const lista = document.createElement('ul');
    lista.className = 'lista-hideouts';
    for (const hideout of grupo.hideouts) {
      lista.appendChild(this._crearItemHideout(hideout));
    }

    tarjeta.appendChild(lista);
    return tarjeta;
  }

  _crearItemHideout(hideout) {
    const item = document.createElement('li');
    item.className = 'item-hideout';

    if (hideout.tieneLogo) {
      const logo = document.createElement('img');
      logo.className = 'item-hideout__logo';
      logo.src = `/api/gremios/${hideout.gremioId}/logo`;
      logo.alt = '';
      logo.width = 24;
      logo.height = 24;
      item.appendChild(logo);
    }

    const gremio = document.createElement('span');
    gremio.className = 'item-hideout__gremio';
    gremio.textContent = hideout.gremio;

    const slot = document.createElement('span');
    slot.className = 'item-hideout__slot';
    slot.textContent = `Slot ${hideout.slot}`;

    const etiqueta = document.createElement('span');
    etiqueta.className = `etiqueta-tipo etiqueta-tipo--${hideout.tipo.toLowerCase()}`;
    etiqueta.textContent = hideout.tipo === 'ESTANDAR' ? 'HO' : hideout.tipo;

    item.append(gremio, slot, etiqueta);

    if (hideout.ubicado) {
      const ubicado = document.createElement('span');
      ubicado.className = 'item-hideout__ubicado';
      ubicado.title = 'Ubicación marcada en el mapa';
      ubicado.textContent = '📍';
      item.appendChild(ubicado);
    }

    return item;
  }
}

document.addEventListener('DOMContentLoaded', () => new BuscadorUI());
