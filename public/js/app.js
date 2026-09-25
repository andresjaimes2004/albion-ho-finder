'use strict';

import api from './api.js';
import { VentanaMapa } from './mapaDetalle.js';
import { MapaMundial } from './mapaMundial.js';
import { PanelSesion } from './sesion.js';
import { PanelAdmin } from './admin.js';
import { PanelCaminos } from './tracking.js';
import { PanelRegistro } from './registroCaminos.js';
import { crear, crearReloj, crearTarjetaRuta, iniciarRelojes } from './rutas.js';

/**
 * app.js
 * ----------------------------------------------------------------------
 * Controlador de la interfaz (POO, sin frameworks): encapsula referencias
 * al DOM y el estado de la búsqueda, y coordina los módulos de mapa,
 * sesión, administración y caminos de Avalon. En cada mapa del resultado
 * muestra las rutas y conexiones de Avalon registradas que lo tocan.
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

    this.panelCaminos = new PanelCaminos({
      abrirMapa: (nombre) => this.ventanaMapa.abrir(nombre),
    });

    this.panelRegistro = new PanelRegistro({
      alGuardar: () => this.panelCaminos.refrescar(),
    });

    this.panelSesion = new PanelSesion({
      alCambiarSesion: (usuario) => {
        this.usuario = usuario;
        this.panelAdmin.establecerUsuario(usuario);
        this.panelCaminos.establecerUsuario(usuario);
        this.panelRegistro.establecerUsuario(usuario);
      },
      alElegirTermino: (termino) => {
        this.input.value = termino;
        this._ejecutarBusqueda(termino);
      },
    });

    iniciarRelojes();
    this.tarjetasPorMapa = new Map();

    this._bindEventos();
    this._bindPestanas();
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

  /** Pestañas Hideouts / Caminos de Avalon, enlazables con #caminos. */
  _bindPestanas() {
    this.pestanas = [...document.querySelectorAll('.pestanas__boton')];
    for (const pestana of this.pestanas) {
      pestana.addEventListener('click', () => {
        history.replaceState(null, '', pestana.dataset.vista === 'caminos' ? '#caminos' : location.pathname);
        this._mostrarVista(pestana.dataset.vista);
      });
    }
    window.addEventListener('hashchange', () => this._mostrarVista(this._vistaDeUrl()));
    this._mostrarVista(this._vistaDeUrl());
  }

  _vistaDeUrl() {
    return location.hash === '#caminos' ? 'caminos' : 'hideouts';
  }

  _mostrarVista(vista) {
    for (const pestana of this.pestanas) {
      const activa = pestana.dataset.vista === vista;
      pestana.setAttribute('aria-selected', String(activa));
      document.getElementById(`vista-${pestana.dataset.vista}`).hidden = !activa;
    }
    if (vista === 'caminos') this.panelCaminos.activar();
    else this.panelCaminos.desactivar();
    this.panelRegistro.establecerVisible(vista === 'caminos');
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
      this._cargarRutas(datos.resultados.map((r) => r.mapa), this.controladorActual.signal);
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
    this.tarjetasPorMapa.clear();
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
    this.tarjetasPorMapa.set(grupo.mapa, tarjeta);
    return tarjeta;
  }

  // ------------------------------------------------ rutas de Avalon --

  /** Rutas del gremio y conexiones vigentes de los mapas del resultado. */
  async _cargarRutas(nombres, senal) {
    if (!nombres.length) return;
    let datos;
    try {
      datos = await api.rutasDeMapas(nombres, senal);
    } catch (error) {
      return; // es un complemento: sin rutas, el resultado sigue sirviendo
    }
    if (senal.aborted) return;

    for (const [nombre, info] of Object.entries(datos.mapas)) {
      const tarjeta = this.tarjetasPorMapa.get(nombre);
      if (!tarjeta) continue;
      const previa = tarjeta.querySelector('.rutas-hideout');
      if (previa) previa.remove();
      tarjeta.appendChild(this._crearSeccionRutas(nombre, info));
    }
  }

  _crearSeccionRutas(nombre, { rutas, conexiones }) {
    const seccion = crear('div', 'rutas-hideout');
    const partes = [];
    if (rutas.length) partes.push(`${rutas.length} ruta${rutas.length === 1 ? '' : 's'}`);
    if (conexiones.length) partes.push(`${conexiones.length} conexi${conexiones.length === 1 ? 'ón' : 'ones'}`);

    const alternar = crear('button', 'rutas-hideout__alternar', `Avalon: ${partes.join(' · ')}`);
    alternar.type = 'button';
    alternar.setAttribute('aria-expanded', 'false');

    const panel = crear('div', 'rutas-hideout__panel');
    panel.hidden = true;
    alternar.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      alternar.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden && !panel.childElementCount) this._rellenarPanelRutas(panel, nombre, rutas, conexiones);
    });

    seccion.append(alternar, panel);
    return seccion;
  }

  _rellenarPanelRutas(panel, nombre, rutas, conexiones) {
    for (const ruta of rutas) {
      panel.appendChild(
        crearTarjetaRuta(ruta, {
          usuario: this.usuario,
          resaltar: nombre,
          alElegirZona: (zona) => this._irACaminos(zona),
          alBorrar: async (r) => {
            await api.borrarRuta(r.id);
            this._repetirBusqueda();
          },
        })
      );
    }

    if (conexiones.length) {
      panel.appendChild(crear('p', 'rutas-hideout__subtitulo', 'Conexiones directas de este mapa'));
      const lista = crear('ul', 'rutas-hideout__conexiones');
      for (const c of conexiones) {
        const item = crear('li');
        const meta = [c.hacia.tier ? `T${c.hacia.tier}` : null, c.hacia.etiqueta].filter(Boolean).join(' · ');
        item.append(
          crear('span', 'rutas-hideout__sentido', c.sentido === 'salida' ? '→' : '←'),
          crear('span', 'rutas-hideout__destino', c.hacia.nombre || 'Mapa desconocido'),
          crear('span', 'rutas-hideout__meta', meta),
          c.cierraEn ? crearReloj(c.cierraEn) : crear('span', 'rutas-hideout__meta', 'sin hora de cierre'),
          crear('span', `conexion__fuente conexion__fuente--${c.fuente}`, c.fuente === 'gremio' ? 'gremio' : 'smugden')
        );
        lista.appendChild(item);
      }
      panel.appendChild(lista);
    }

    const ver = crear('button', 'boton boton--pequeno boton--sutil', 'Ver en Caminos de Avalon');
    ver.type = 'button';
    ver.addEventListener('click', () => this._irACaminos(nombre));
    panel.appendChild(ver);
  }

  /** Cambia a la pestaña de caminos con la ficha de un mapa abierta. */
  _irACaminos(nombre) {
    history.replaceState(null, '', '#caminos');
    this._mostrarVista('caminos');
    this.panelCaminos.abrirDetalle(nombre);
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
