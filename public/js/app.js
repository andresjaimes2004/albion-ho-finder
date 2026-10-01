'use strict';

import api from './api.js';
import { VentanaMapa } from './mapaDetalle.js';
import { MapaMundial } from './mapaMundial.js';
import { PanelSesion } from './sesion.js';
import { PanelAdmin } from './admin.js';
import { PanelCaminos } from './tracking.js';
import { PanelRegistro } from './registroCaminos.js';
import { PanelEspacios } from './espacios.js';
import { CentroAvisos } from './avisos.js';
import { activarValidacion } from './validacionFormularios.js';
import { crear, crearListaConexiones, crearTarjetaRuta, iniciarRelojes } from './rutas.js';
import { t, tn } from './i18n.js';
import { Portada } from './portada.js';
import { mostrarSuave, ocultarSuave } from './animar.js';
import { conectarSugerencias, agregarBotonBorrar } from './sugerencias.js';

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
    // Sugerencias propias (gremios y mapas) y ✕ para borrar lo escrito.
    this.opcionesBusqueda = [];
    this.sugerenciasBusqueda = conectarSugerencias(this.input, { opciones: () => this.opcionesBusqueda });
    agregarBotonBorrar(this.input);

    this.estados = {
      vacio: document.getElementById('estado-vacio'),
      cargando: document.getElementById('estado-cargando'),
      sinResultados: document.getElementById('estado-sin-resultados'),
      error: document.getElementById('estado-error'),
    };
    this.errorTexto = document.getElementById('estado-error__texto');

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
      // Las conexiones guardadas permiten continuar rutas desde el registro.
      alActualizar: (datos) => {
        this.panelRegistro.establecerGuardadas(datos.conexiones);
        // Gremios conocidos de cada camino de hideouts, para las rutas nuevas.
        this.panelRegistro.establecerGremiosCaminos(datos.caminos);
      },
      // "Editar" en una ruta la abre en el panel de registro.
      alEditarRuta: (ruta) => this.panelRegistro.editarRuta(ruta),
    });

    this.panelRegistro = new PanelRegistro({
      alGuardar: () => this.panelCaminos.refrescar(),
    });

    // Espacios privados: alimentan el "Guardar en" del registro y, al
    // cambiar (crear, salir, cambiar visibilidad), se recargan las rutas.
    this.panelEspacios = new PanelEspacios({
      alCambiar: (espacios) => {
        this.panelRegistro.establecerEspacios(espacios);
        // Los espacios se ven en el filtro de rutas aunque aún no tengan rutas.
        this.panelCaminos.establecerEspacios(espacios);
        // Lo que se ve depende de la sesión: al entrar, salir o cambiar de
        // espacios se vuelve a pedir (si la pestaña no está abierta, se
        // pedirá al abrirla).
        if (this.panelCaminos.activo) this.panelCaminos.refrescar();
      },
    });

    // Avisos en vivo: al agregarte o quitarte de un espacio se actualizan
    // los espacios y las rutas sin recargar, con una notificación.
    this.avisos = new CentroAvisos({
      alCambiarEspacios: () => {
        this.panelEspacios.cargar();
        // La búsqueda de hideouts también muestra rutas: se repite.
        if (this.vistaActual === 'hideouts') this._repetirBusqueda();
      },
      verEspacio: (id) => this._irA('caminos', { alTerminar: () => this.panelEspacios.mostrar(id) }),
    });

    this.panelSesion = new PanelSesion({
      alCambiarSesion: (usuario) => {
        this.usuario = usuario;
        this.panelAdmin.establecerUsuario(usuario);
        this.panelCaminos.establecerUsuario(usuario);
        this.panelRegistro.establecerUsuario(usuario);
        this.panelEspacios.establecerUsuario(usuario);
        this.avisos.establecerUsuario(usuario);
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
    this._vigilarCabecera();
    this._iniciar();
  }

  /**
   * La barra superior se adapta a lo que realmente cabe: el espacio
   * depende del idioma, de si hay sesión y del nombre de usuario, así que
   * un ancho fijo en el CSS no basta. Si las pestañas no caben, primero
   * se compacta ("Apoyar" solo con el corazón) y, si aún no, las pestañas
   * pasan a su propia fila. Nunca quedan tapadas por otros elementos.
   */
  _vigilarCabecera() {
    const cabecera = document.querySelector('.cabecera');
    const pestanas = document.querySelector('.pestanas');
    if (!cabecera || !pestanas) return;
    const noCaben = () => pestanas.scrollWidth > pestanas.clientWidth + 1;
    const ajustar = () => {
      cabecera.classList.remove('cabecera--compacta', 'cabecera--dos-filas');
      if (!noCaben()) return;
      cabecera.classList.add('cabecera--compacta');
      if (noCaben()) cabecera.classList.add('cabecera--dos-filas');
    };
    ajustar();
    if (typeof ResizeObserver === 'function') {
      // Cambia el ancho de la ventana o lo que hay a la derecha (sesión).
      const observador = new ResizeObserver(() => requestAnimationFrame(ajustar));
      observador.observe(cabecera.querySelector('.cabecera__contenido'));
      observador.observe(cabecera.querySelector('.cabecera__derecha'));
    } else {
      window.addEventListener('resize', ajustar);
    }
  }

  async _iniciar() {
    await this.panelSesion.refrescar();
    try {
      const mundo = await this.mapaMundial.cargar();
      this._mostrarCifras(mundo);
      // La temporada de los datos se ve junto al buscador desde el principio.
      this._actualizarBadgeTemporada(mundo && mundo.temporada);
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

  /**
   * Sugerencias del buscador (gremios y mapas), como en Caminos de Avalon.
   * Se cargan una vez, al empezar a usar el buscador, y se muestran en el
   * desplegable propio (sugerencias.js), que también encuentra los nombres
   * escritos con espacios ("requiem" → "R E Q U I E M").
   */
  _cargarSugerencias() {
    if (this._sugerenciasCargadas) return;
    this._sugerenciasCargadas = true;
    api
      .sugerencias()
      .then(({ gremios = [], mapas = [] }) => {
        this.opcionesBusqueda = [
          ...gremios.map((valor) => ({ valor, tipo: t('Gremio') })),
          ...mapas.map((valor) => ({ valor, tipo: t('Mapa') })),
        ];
        this.sugerenciasBusqueda.actualizar();
      })
      .catch(() => {
        this._sugerenciasCargadas = false;
      });
  }

  _bindEventos() {
    this.input.addEventListener('focus', () => this._cargarSugerencias());
    this.input.addEventListener('input', () => {
      this._cargarSugerencias();
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
    // También en <html>: la barra de desplazamiento de la página toma el
    // color del apartado.
    document.documentElement.dataset.vista = vista;
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

      const porNombre = datos.mapas || [];
      if (datos.totalMapas === 0 && !porNombre.length && !(datos.caminos || []).length) {
        this._mostrarEstado('sinResultados');
        this.mapaMundial.destacar([]);
        return;
      }

      this._renderizarResultados(datos);
      const nombres = [...new Set([...porNombre, ...datos.resultados].map((r) => r.mapa))];
      this._cargarRutas(nombres, this.controladorActual.signal);
      this.mapaMundial.destacar(nombres);
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

  /**
   * Dos bloques: los mapas cuyo nombre coincide (con todos sus hideouts,
   * o ninguno) y los mapas donde tiene hideout el gremio buscado.
   */
  _renderizarResultados(datos) {
    this._mostrarEstado(null);
    this.listaMapas.replaceChildren();
    this.tarjetasPorMapa.clear();

    const porNombre = datos.mapas || [];
    if (porNombre.length) {
      this.listaMapas.appendChild(
        this._crearTituloSeccion(t('Mapas'), tn(datos.totalMapasPorNombre || porNombre.length, '{n} mapa', '{n} mapas'))
      );
      for (const grupo of porNombre) {
        this.listaMapas.appendChild(this._crearTarjetaMapa(grupo, { resaltar: null }));
      }
      if ((datos.totalMapasPorNombre || 0) > porNombre.length) {
        this.listaMapas.appendChild(
          crear('p', 'resultados__mas', t('Hay más mapas con ese nombre: sigue escribiendo para acotar la búsqueda.'))
        );
      }
    }

    if (datos.resultados.length) {
      this.listaMapas.appendChild(
        this._crearTituloSeccion(
          t('Gremios'),
          `${tn(datos.totalMapas, '{n} mapa', '{n} mapas')} · ${tn(datos.totalHideouts, '{n} hideout', '{n} hideouts')}`
        )
      );
      for (const grupo of datos.resultados) {
        this.listaMapas.appendChild(this._crearTarjetaMapa(grupo));
      }
    }

    const caminos = datos.caminos || [];
    if (caminos.length) {
      this.listaMapas.appendChild(
        this._crearTituloSeccion(t('Hideouts en caminos de Avalon'), tn(caminos.length, '{n} camino', '{n} caminos'))
      );
      for (const camino of caminos) this.listaMapas.appendChild(this._crearTarjetaCaminoHideout(camino));
    }
  }

  /**
   * Camino de Avalon de hideouts encontrado por gremio o por nombre, con
   * los gremios que anotaron los usuarios. Abre su ficha en "Caminos de
   * Avalon", donde se ven sus rutas y se anotan más gremios.
   */
  _crearTarjetaCaminoHideout(camino) {
    const tarjeta = crear('article', 'tarjeta-mapa tarjeta-mapa--camino');
    const encabezado = crear('button', 'tarjeta-mapa__encabezado');
    encabezado.type = 'button';
    encabezado.setAttribute('aria-label', t('Ver el camino {camino}', { camino: camino.camino }));
    encabezado.append(crear('h3', 'tarjeta-mapa__nombre', camino.camino));
    const meta = [camino.tier ? `T${camino.tier}` : null, camino.profundo ? t('Hideout profundo') : t('Hideout')].filter(Boolean);
    encabezado.append(crear('span', 'tarjeta-mapa__meta', meta.join(' · ')));
    encabezado.addEventListener('click', () => {
      this._irA('caminos', { alTerminar: () => this.panelCaminos.abrirDetalle(camino.camino) });
    });
    tarjeta.append(encabezado);

    const gremios = crear('p', 'tarjeta-mapa__gremios-camino');
    if (camino.gremios.length) {
      const buscado = (this.ultimoTermino || '').toLowerCase();
      camino.gremios.forEach((g, i) => {
        if (i) gremios.append(', ');
        const nombre = crear(buscado && g.gremio.toLowerCase().includes(buscado) ? 'mark' : 'span', null, g.gremio);
        gremios.append(nombre);
      });
    } else {
      gremios.textContent = t('Sin gremios anotados todavía.');
    }
    tarjeta.append(gremios);
    return tarjeta;
  }

  _crearTituloSeccion(titulo, detalle) {
    const cabecera = crear('h3', 'resultados__titulo', titulo);
    cabecera.appendChild(crear('span', 'resultados__cuenta', detalle));
    return cabecera;
  }

  /**
   * Tarjeta de un mapa. `resaltar`: texto del gremio buscado, para
   * destacarlo al abrir el mapa (null en los mapas encontrados por nombre).
   */
  _crearTarjetaMapa(grupo, { resaltar = this.ultimoTermino } = {}) {
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

    encabezado.addEventListener('click', () => this.ventanaMapa.abrir(grupo.mapa, { resaltarGremio: resaltar }));

    tarjeta.appendChild(encabezado);

    if (grupo.hideouts.length) {
      const lista = document.createElement('ul');
      lista.className = 'lista-hideouts';
      for (const hideout of grupo.hideouts) {
        lista.appendChild(this._crearItemHideout(hideout));
      }
      tarjeta.appendChild(lista);
    } else {
      tarjeta.appendChild(crear('p', 'tarjeta-mapa__vacia', t('Sin hideouts registrados esta temporada.')));
    }

    // Un mismo mapa puede salir en los dos bloques (por nombre y por gremio).
    if (!this.tarjetasPorMapa.has(grupo.mapa)) this.tarjetasPorMapa.set(grupo.mapa, []);
    this.tarjetasPorMapa.get(grupo.mapa).push(tarjeta);
    return tarjeta;
  }

  // ------------------------------------------------ rutas de Avalon --

  /**
   * Rutas y conexiones vigentes de los mapas del resultado. La API admite
   * hasta 50 mapas por consulta: con búsquedas cortas hay más, así que se
   * piden por tandas.
   */
  async _cargarRutas(nombres, senal) {
    if (!nombres.length) return;
    const tandas = [];
    for (let i = 0; i < nombres.length; i += 50) tandas.push(nombres.slice(i, i + 50));
    let mapas;
    try {
      const respuestas = await Promise.all(tandas.map((tanda) => api.rutasDeMapas(tanda, senal)));
      mapas = Object.assign({}, ...respuestas.map((r) => r.mapas));
    } catch (error) {
      return; // es un complemento: sin rutas, el resultado sigue sirviendo
    }
    if (senal.aborted) return;

    for (const [nombre, info] of Object.entries(mapas)) {
      for (const tarjeta of this.tarjetasPorMapa.get(nombre) || []) {
        const previa = tarjeta.querySelector('.rutas-hideout');
        if (previa) previa.remove();
        tarjeta.appendChild(this._crearSeccionRutas(nombre, info));
      }
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

document.addEventListener('DOMContentLoaded', () => {
  // Alertas de los campos con el estilo del sitio (no las del navegador).
  activarValidacion();
  new BuscadorUI();
});
