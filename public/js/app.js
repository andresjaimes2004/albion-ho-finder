'use strict';

import api from './api.js';
import { VentanaMapa } from './mapaDetalle.js';
import { MapaMundial } from './mapaMundial.js';
import { PanelSesion } from './sesion.js';
import { PanelAdmin } from './admin.js';
import { PanelCaminos } from './tracking.js';
import { PanelRegistro } from './registroCaminos.js';
import { crear, crearListaConexiones, crearTarjetaRuta, iniciarRelojes } from './rutas.js';
import { t, tn } from './i18n.js';
import { Portada } from './portada.js';
import { mostrarSuave, ocultarSuave } from './animar.js';

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
const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      irACaminos: (nombre) => {
        this.ventanaMapa.cerrar();
        this._irACaminos(nombre);
      },
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
        this._irA('hideouts');
        this.input.value = termino;
        this._ejecutarBusqueda(termino);
      },
    });

    this.portada = new Portada({
      irA: (vista, opciones) => this._irA(vista, opciones),
      abrirRegistro: () => this.panelRegistro.abrir(),
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
      const mundo = await this.mapaMundial.cargar();
      this._mostrarCifras(mundo);
    } catch (error) {
      /* el mapa es un complemento: si falla, el buscador sigue sirviendo */
    }
  }

  /** Cifras de la portada a partir de los mapas de la Zona Negra. */
  _mostrarCifras(mundo) {
    const mapas = (mundo && mundo.mapas) || [];
    this.portada.mostrarCifras({
      hideouts: mapas.reduce((total, m) => total + (m.hideouts || 0), 0),
      mapas: mapas.filter((m) => m.hideouts).length,
      temporada: mundo && mundo.temporada,
    });
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
      const boton = evento.currentTarget;
      // Se decide por el estado del botón: la sección puede estar a mitad de animación.
      const abrir = boton.getAttribute('aria-expanded') !== 'true';
      boton.setAttribute('aria-expanded', String(abrir));
      boton.textContent = abrir ? t('Ocultar mapa') : t('Ver mapa de la Zona Negra');
      if (abrir) {
        mostrarSuave(seccion);
        this.mapaMundial.cargar().catch(() => {});
      } else {
        ocultarSuave(seccion);
      }
    });
  }

  /** Pestañas Hideouts / Caminos de Avalon, enlazables con #caminos. */
  /**
   * Tres apartados en la misma página: Inicio (sin hash), Hideouts
   * (#hideouts) y Caminos de Avalon (#caminos). Cada cambio deja una entrada
   * en el historial, así "atrás" vuelve al apartado anterior.
   */
  _bindPestanas() {
    this.pestanas = [...document.querySelectorAll('.pestanas__boton')];
    this.paneles = [...document.querySelectorAll('[data-panel]')];
    for (const pestana of this.pestanas) {
      pestana.addEventListener('click', () => this._irA(pestana.dataset.vista));
    }
    // "hashchange" cubre los enlaces con #; "popstate", el botón atrás tras pushState.
    const alCambiarUrl = () => {
      const vista = this._vistaDeUrl();
      if (vista === this.vistaActual) return;
      this._transicion(() => {
        this._mostrarVista(vista);
        if (!location.hash.startsWith('#apoyar')) window.scrollTo({ top: 0, behavior: 'instant' });
      });
    };
    window.addEventListener('hashchange', alCambiarUrl);
    window.addEventListener('popstate', alCambiarUrl);
    this._mostrarVista(this._vistaDeUrl());
  }

  _vistaDeUrl() {
    if (location.hash === '#caminos') return 'caminos';
    if (location.hash === '#hideouts') return 'hideouts';
    return 'inicio';
  }

  /**
   * Cambia de apartado dejando entrada en el historial.
   *  - Si ya se está en ese apartado, sube (o baja a `destino`) con
   *    desplazamiento suave.
   *  - Si no, cambia con un fundido (_transicion): el salto de posición
   *    queda oculto dentro del fundido, así no se ve brusco.
   * @param {object} opciones
   *   - destino: elemento al que ir dentro del apartado (si no, arriba)
   *   - alTerminar(): se ejecuta ya con el apartado visible
   */
  _irA(vista, { destino = null, alTerminar = null } = {}) {
    const url = vista === 'inicio' ? location.pathname : `#${vista}`;
    const yaEsta = vista === this.vistaActual && (vista === 'inicio' ? !location.hash : location.hash === url);
    if (yaEsta) {
      const suave = sinMovimiento() ? 'auto' : 'smooth';
      if (destino) destino.scrollIntoView({ behavior: suave, block: 'start' });
      else window.scrollTo({ top: 0, behavior: suave });
      if (alTerminar) alTerminar();
      return;
    }
    this._transicion(() => {
      history.pushState(null, '', url);
      this._mostrarVista(vista);
      if (destino) destino.scrollIntoView({ behavior: 'instant', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
      if (alTerminar) alTerminar();
    });
  }

  /**
   * Aplica un cambio de apartado con fundido. Usa la View Transitions API
   * donde existe (Chrome, Edge, Safari): la barra superior queda quieta y
   * el resto se funde. En los demás navegadores el apartado nuevo aparece
   * con una animación CSS. Sin animación si el usuario pide reducirla.
   */
  _transicion(actualizar) {
    if (sinMovimiento()) {
      actualizar();
      return;
    }
    if (typeof document.startViewTransition === 'function') {
      const transicion = document.startViewTransition(actualizar);
      // Si el navegador omite la animación (pestaña oculta, otra transición
      // en curso...) el cambio se aplica igual; solo se evita el error.
      transicion.ready.catch(() => {});
      return;
    }
    actualizar();
    const panel = this.paneles.find((p) => !p.hidden);
    if (panel) {
      panel.classList.remove('vista-entrando');
      void panel.offsetWidth; // reinicia la animación si se repite
      panel.classList.add('vista-entrando');
    }
  }

  _mostrarVista(vista) {
    this.vistaActual = vista;
    for (const panel of this.paneles) panel.hidden = panel.dataset.panel !== vista;
    for (const pestana of this.pestanas) {
      pestana.setAttribute('aria-selected', String(pestana.dataset.vista === vista));
    }
    document.body.dataset.vista = vista;
    if (vista === 'caminos') this.panelCaminos.activar();
    else this.panelCaminos.desactivar();
    this.panelRegistro.establecerVisible(vista === 'caminos');

    // El selector de idioma lleva al mismo apartado en el otro idioma.
    for (const enlace of document.querySelectorAll('.idioma__opcion')) {
      enlace.hash = vista === 'inicio' ? '' : vista;
    }
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
      this.errorTexto.textContent = error.message || t('No se pudo conectar con el servidor.');
      this._mostrarEstado('error');
    }
  }

  _actualizarBadgeTemporada(codigo) {
    if (!codigo) return;
    this.badgeTemporada.textContent = t('Temporada {codigo}', { codigo });
    this.badgeTemporada.hidden = false;
  }

  _renderizarResultados(datos) {
    this._mostrarEstado(null);

    this.resumen.hidden = false;
    this.resumen.replaceChildren(
      this._crearSpanResumen(tn(datos.totalMapas, '{n} mapa', '{n} mapas')),
      this._crearSpanResumen(tn(datos.totalHideouts, '{n} hideout', '{n} hideouts'))
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
    encabezado.setAttribute('aria-label', t('Ver el mapa {mapa} en detalle', { mapa: grupo.mapa }));

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

    // Flecha de la esquina, como en las tarjetas de la portada: toda la
    // tarjeta abre el mapa (el botón se estira sobre ella con CSS).
    const ir = document.createElement('span');
    ir.className = 'tarjeta-mapa__ir';
    ir.setAttribute('aria-hidden', 'true');
    const flecha = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    flecha.setAttribute('viewBox', '0 0 24 24');
    flecha.setAttribute('width', '16');
    flecha.setAttribute('height', '16');
    flecha.setAttribute('fill', 'none');
    const trazo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trazo.setAttribute('d', 'M5 12h14m0 0-6-6m6 6-6 6');
    trazo.setAttribute('stroke', 'currentColor');
    trazo.setAttribute('stroke-width', '2.2');
    trazo.setAttribute('stroke-linecap', 'round');
    trazo.setAttribute('stroke-linejoin', 'round');
    flecha.appendChild(trazo);
    ir.appendChild(flecha);
    encabezado.appendChild(ir);

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
    if (rutas.length) partes.push(tn(rutas.length, '{n} ruta', '{n} rutas'));
    if (conexiones.length) partes.push(tn(conexiones.length, '{n} conexión', '{n} conexiones'));

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
      panel.appendChild(crear('p', 'rutas-hideout__subtitulo', t('Conexiones directas de este mapa')));
      panel.appendChild(crearListaConexiones(conexiones));
    }

    const ver = crear('button', 'boton boton--pequeno boton--sutil', t('Ver en Caminos de Avalon'));
    ver.type = 'button';
    ver.addEventListener('click', () => this._irACaminos(nombre));
    panel.appendChild(ver);
  }

  /** Cambia a la pestaña de caminos con la ficha de un mapa abierta. */
  _irACaminos(nombre) {
    this._irA('caminos', { alTerminar: () => this.panelCaminos.abrirDetalle(nombre) });
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

    const etiqueta = document.createElement('span');
    etiqueta.className = `etiqueta-tipo etiqueta-tipo--${hideout.tipo.toLowerCase()}`;
    etiqueta.textContent = hideout.tipo === 'ESTANDAR' ? 'HO' : hideout.tipo;

    item.append(gremio, etiqueta);

    if (hideout.ubicado) {
      const ubicado = document.createElement('span');
      ubicado.className = 'item-hideout__ubicado';
      ubicado.title = t('Ubicación marcada en el mapa');
      ubicado.textContent = '📍';
      item.appendChild(ubicado);
    }

    return item;
  }
}

document.addEventListener('DOMContentLoaded', () => new BuscadorUI());
