'use strict';

import { crear, limpiar, habilitarNavegacion } from './svg.js';
import {
  CapaTeselas,
  TESELAS,
  ESCALA_MAPA,
  mundoAPixel0,
  localAVista,
  vistaALocal,
} from './mapaOficial.js';
import api from './api.js';

/**
 * mapaDetalle.js
 * ----------------------------------------------------------------------
 * Ventana flotante con el detalle de un mapa de la Zona Negra.
 *
 * El mapa se dibuja en diamante, con la misma orientación que tiene en
 * el juego, y puede mostrar tres fondos:
 *
 *  - "Mapa oficial": el recorte de esa zona del mapa del juego (teselas
 *    de la wiki oficial), alineado con la calibración de mapaOficial.js.
 *  - "Imagen propia": la imagen que haya subido un administrador (por
 *    ejemplo, una captura del minimapa), con su ajuste de escala,
 *    desplazamiento y rotación.
 *  - "Sin fondo": solo la geometría de los datos del juego.
 *
 * Encima van las salidas hacia los mapas vecinos, los territorios, los
 * caminos (opcionales cuando hay fondo, porque el fondo ya los muestra) y
 * los hideouts. La ubicación de cada hideout la marca un administrador
 * con un clic; se guarda en coordenadas del juego, así que sigue siendo
 * válida aunque se cambie el fondo.
 * ----------------------------------------------------------------------
 */

const COLOR_TIPO = { HQ: 'hq', P: 'personal', ESTANDAR: 'estandar' };
const MARGEN_VISTA = 70;

const FONDOS = [
  { id: 'oficial', etiqueta: 'Mapa oficial' },
  { id: 'propia', etiqueta: 'Imagen propia' },
  { id: 'ninguno', etiqueta: 'Sin fondo' },
];

export class VentanaMapa {
  constructor({ obtenerSesion, alCambiar } = {}) {
    this.obtenerSesion = obtenerSesion || (() => null);
    this.alCambiar = alCambiar || (() => {});

    this.dialogo = document.getElementById('ventana-mapa');
    this.titulo = document.getElementById('ventana-mapa__titulo');
    this.insignias = document.getElementById('ventana-mapa__insignias');
    this.svg = document.getElementById('ventana-mapa__svg');
    this.selectorFondo = document.getElementById('ventana-mapa__fondos');
    this.lista = document.getElementById('ventana-mapa__hideouts');
    this.pie = document.getElementById('ventana-mapa__pie');
    this.aviso = document.getElementById('ventana-mapa__aviso');
    this.panelAdmin = document.getElementById('ventana-mapa__admin');

    this.datos = null;
    this.resaltado = null;
    this.hideoutSeleccionado = null;
    this.teselas = null;
    this.imagenFondo = null;
    this.fondo = 'oficial';
    this.mostrarCaminos = false;
    this.ajuste = null;

    // Una sola instancia de navegación por SVG: crear una por cada render
    // acumularía manejadores de eventos y el zoom se aceleraría.
    this.navegacion = habilitarNavegacion(this.svg, {
      minEscala: 0.6,
      maxEscala: 8,
      alCambiar: (estado) => {
        if (this.teselas) this.teselas.actualizar();
        this._ajustarMarcadores(estado.escala);
      },
    });
    this.marcadores = [];
    this.pixel = 2.4;

    this._prepararEventos();
  }

  _prepararEventos() {
    document.getElementById('ventana-mapa__cerrar').addEventListener('click', () => this.cerrar());
    document.getElementById('ventana-mapa__reiniciar').addEventListener('click', () => {
      this.navegacion.reiniciar();
    });

    this.dialogo.addEventListener('cancel', (evento) => {
      evento.preventDefault();
      this.cerrar();
    });

    this.dialogo.addEventListener('click', (evento) => {
      // Clic sobre el fondo oscuro (fuera del contenido) cierra la ventana.
      if (evento.target === this.dialogo) this.cerrar();
    });

    // Modo administrador: clic en el mapa = fijar la ubicación del
    // hideout seleccionado en la lista.
    this.svg.addEventListener('click', (evento) => {
      if (!this.esAdmin || !this.hideoutSeleccionado || !this.datos) return;
      if (evento.target.closest('.mapa__pin')) return;

      const punto = this._puntoDelEvento(evento);
      if (!punto) return;
      this._guardarPosicion(this.hideoutSeleccionado, punto[0], punto[1]);
    });

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.teselas && this.teselas.actualizar()).observe(this.svg);
    }
  }

  get esAdmin() {
    const sesion = this.obtenerSesion();
    return Boolean(sesion && sesion.rol === 'ADMIN');
  }

  async abrir(nombreMapa, { resaltarGremio = null } = {}) {
    this.resaltado = resaltarGremio;
    this.hideoutSeleccionado = null;
    this.titulo.textContent = nombreMapa;
    limpiar(this.insignias);
    limpiar(this.svg);
    this.lista.replaceChildren();
    this.aviso.textContent = 'Cargando mapa...';
    this.aviso.hidden = false;

    if (!this.dialogo.open) this.dialogo.showModal();

    try {
      this.datos = await api.detalleMapa(nombreMapa);
      this.aviso.hidden = true;
      // Si el mapa tiene imagen propia, se muestra por defecto.
      this.fondo = this.datos.imagen ? 'propia' : 'oficial';
      this.ajuste = this.datos.imagen ? { ...this.datos.imagen } : null;
      this.navegacion.reiniciar();
      this._render();
    } catch (error) {
      this.aviso.textContent = error.message;
      this.aviso.hidden = false;
    }
  }

  cerrar() {
    if (this.dialogo.open) this.dialogo.close();
    this.hideoutSeleccionado = null;
  }

  async _recargar({ conservarFondo = true } = {}) {
    if (!this.datos) return;
    const fondoPrevio = this.fondo;
    this.datos = await api.detalleMapa(this.datos.mapa.nombre);
    this.ajuste = this.datos.imagen ? { ...this.datos.imagen } : null;
    if (!conservarFondo || (fondoPrevio === 'propia' && !this.datos.imagen)) {
      this.fondo = this.datos.imagen ? 'propia' : 'oficial';
    }
    this._render();
    this.alCambiar();
  }

  // ------------------------------------------------------------ render ---

  _render() {
    const { mapa, hideouts, temporada } = this.datos;

    this.titulo.textContent = mapa.nombre;
    this._renderInsignias(mapa, temporada);
    this._renderSelectorFondo();
    this._renderSvg(mapa, hideouts);
    this._renderLista(hideouts);
    this._renderAdmin();

    const textos = [
      'Salidas, caminos y territorios: dumps oficiales del cliente de Albion Online.',
      'La ubicación de cada hideout la marca un administrador: el juego no la publica.',
    ];
    if (this.fondo === 'oficial') {
      textos.push(`${TESELAS.atribucion} El mapa mundial es ilustrativo: la superposición es aproximada.`);
    }
    this.pie.textContent = textos.join(' ');
  }

  _renderInsignias(mapa, temporada) {
    limpiar(this.insignias);
    const nombresBioma = { FR: 'Bosque', HL: 'Tierras altas', MN: 'Montaña', ST: 'Estepa', SW: 'Pantano' };
    const insignias = [
      temporada ? `Temporada ${temporada}` : null,
      mapa.tier ? `Tier ${mapa.tier}` : null,
      nombresBioma[mapa.bioma] || null,
      mapa.cuadrante ? `Cuadrante ${mapa.cuadrante}` : null,
      `${this.datos.totalHideouts} hideout${this.datos.totalHideouts === 1 ? '' : 's'}`,
    ].filter(Boolean);

    for (const texto of insignias) {
      const span = document.createElement('span');
      span.className = 'insignia';
      span.textContent = texto;
      this.insignias.appendChild(span);
    }
  }

  _renderSelectorFondo() {
    this.selectorFondo.replaceChildren();

    const grupo = document.createElement('div');
    grupo.className = 'selector-fondo__opciones';
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', 'Fondo del mapa');

    for (const opcion of FONDOS) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'selector-fondo__boton';
      boton.textContent = opcion.etiqueta;
      boton.setAttribute('aria-pressed', String(this.fondo === opcion.id));
      if (opcion.id === 'propia' && !this.datos.imagen) {
        boton.disabled = true;
        boton.title = 'Este mapa todavía no tiene una imagen subida por un administrador.';
      }
      boton.addEventListener('click', () => {
        this.fondo = opcion.id;
        this._render();
      });
      grupo.appendChild(boton);
    }

    const caminos = document.createElement('label');
    caminos.className = 'selector-fondo__caminos';
    const casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.checked = this.fondo === 'ninguno' || this.mostrarCaminos;
    casilla.disabled = this.fondo === 'ninguno';
    casilla.addEventListener('change', () => {
      this.mostrarCaminos = casilla.checked;
      this._render();
    });
    caminos.append(casilla, ' Caminos de los datos');

    this.selectorFondo.append(grupo, caminos);
  }

  /** Esquinas del área del minimapa, ya giradas a la vista en diamante. */
  _diamante(mapa) {
    const [minX, minY] = mapa.limites.min;
    const [maxX, maxY] = mapa.limites.max;
    return [
      [minX, maxY],
      [maxX, maxY],
      [maxX, minY],
      [minX, minY],
    ].map(([x, y]) => localAVista(x, y));
  }

  _renderSvg(mapa, hideouts) {
    limpiar(this.svg);
    this.teselas = null;
    this.imagenFondo = null;

    const diamante = this._diamante(mapa);
    const mitad = Math.max(...diamante.flat().map(Math.abs));
    const borde = mitad + MARGEN_VISTA;
    this.svg.setAttribute('viewBox', `${-borde} ${-borde} ${borde * 2} ${borde * 2}`);

    // Unidades de la vista por píxel de pantalla (a zoom 1): los marcadores
    // y textos se dibujan en píxeles para que se lean igual en cualquier
    // tamaño de ventana.
    const caja = this.svg.getBoundingClientRect();
    this.pixel = (borde * 2) / (Math.min(caja.width, caja.height) || 540);
    this.marcadores = [];

    const capa = crear('g', { 'data-capa-zoom': '' });
    this.svg.appendChild(capa);

    const puntosDiamante = diamante.map((p) => p.join(',')).join(' ');
    const conFondo = this.fondo !== 'ninguno';

    // 1. Fondo
    const fondo = crear('g', { class: 'mapa__fondo' });
    capa.appendChild(fondo);

    if (this.fondo === 'oficial') {
      const origen = mundoAPixel0(mapa.mundo[0], mapa.mundo[1]);
      const factor = 0.32 * ESCALA_MAPA;
      this.teselas = new CapaTeselas(this.svg, fondo, {
        origen,
        factor,
        zoomBase: 5,
        areaBase: {
          minX: origen[0] - borde * factor,
          maxX: origen[0] + borde * factor,
          minY: origen[1] - borde * factor,
          maxY: origen[1] + borde * factor,
        },
        maxTeselas: 60,
      });
    } else if (this.fondo === 'propia' && this.datos.imagen) {
      this.imagenFondo = crear('image', {
        href: this.datos.imagen.url,
        x: -mitad,
        y: -mitad,
        width: mitad * 2,
        height: mitad * 2,
        preserveAspectRatio: 'xMidYMid meet',
      });
      fondo.appendChild(this.imagenFondo);
      this._aplicarAjuste();
    } else {
      capa.appendChild(crear('polygon', { points: puntosDiamante, class: 'mapa__terreno' }));
    }

    // 2. Oscurecer lo que queda fuera del mapa, sin ocultarlo del todo:
    // así se ve el contexto de los mapas vecinos.
    if (conFondo) {
      capa.appendChild(
        crear('path', {
          class: 'mapa__mascara',
          'fill-rule': 'evenodd',
          d: `M${-borde * 3} ${-borde * 3}H${borde * 3}V${borde * 3}H${-borde * 3}Z M${diamante
            .map((p) => p.join(' '))
            .join(' L')} Z`,
        })
      );
    }
    capa.appendChild(crear('polygon', { points: puntosDiamante, class: 'mapa__borde' }));

    // 3. Territorios (torres y castillos)
    for (const territorio of mapa.territorios || []) {
      if (!territorio.centro || !territorio.tam) continue;
      const [cx, cy] = territorio.centro;
      const [tw, th] = territorio.tam;
      const esquinas = [
        [cx - tw / 2, cy - th / 2],
        [cx + tw / 2, cy - th / 2],
        [cx + tw / 2, cy + th / 2],
        [cx - tw / 2, cy + th / 2],
      ].map(([x, y]) => localAVista(x, y));

      const grupo = crear('g', {
        class: `mapa__territorio mapa__territorio--${(territorio.tipo || '').toLowerCase()}${conFondo ? ' mapa__territorio--sutil' : ''}`,
      });
      grupo.appendChild(crear('polygon', { points: esquinas.map((p) => p.join(',')).join(' ') }));
      capa.appendChild(grupo);

      if (territorio.monolito) {
        const [mx, my] = localAVista(territorio.monolito[0], territorio.monolito[1]);
        const monolito = this._marcador(mx, my, 'mapa__territorio mapa__monolito');
        monolito.interior.appendChild(crear('circle', { r: 4 }));
        capa.appendChild(monolito.grupo);
      }
      const arriba = esquinas.reduce((min, p) => (p[1] < min[1] ? p : min), esquinas[0]);
      const etiqueta = this._marcador(arriba[0], arriba[1], 'mapa__rotulo');
      etiqueta.interior.appendChild(
        crear(
          'text',
          { y: -8, 'text-anchor': 'middle', class: 'mapa__etiqueta', 'font-size': 11, 'stroke-width': 3 },
          territorio.nombre || 'Territorio'
        )
      );
      capa.appendChild(etiqueta.grupo);
    }

    // 4. Caminos: siempre sin fondo; con fondo, solo si se piden (el fondo
    // ya los muestra y la superposición es aproximada).
    if ((!conFondo || this.mostrarCaminos) && mapa.caminos && mapa.caminos.nodos) {
      const caminos = crear('g', { class: `mapa__caminos${conFondo ? ' mapa__caminos--sobre-fondo' : ''}` });
      for (const [desde, hasta] of mapa.caminos.enlaces || []) {
        const a = mapa.caminos.nodos[desde];
        const b = mapa.caminos.nodos[hasta];
        if (!a || !b) continue;
        const [x1, y1] = localAVista(a[0], a[1]);
        const [x2, y2] = localAVista(b[0], b[1]);
        caminos.appendChild(crear('line', { x1, y1, x2, y2 }));
      }
      capa.appendChild(caminos);
    }

    // 5. Salidas hacia mapas vecinos
    for (const salida of mapa.salidas || []) {
      capa.appendChild(this._crearSalida(salida));
    }

    // 6. Hideouts ubicados
    const capaHideouts = crear('g', { class: 'mapa__hideouts' });
    for (const hideout of hideouts) {
      if (!hideout.pos) continue;
      capaHideouts.appendChild(this._crearPin(hideout));
    }
    capa.appendChild(capaHideouts);

    this.svg.classList.toggle('svg--marcando', Boolean(this.hideoutSeleccionado) && this.esAdmin);
    this._escalaMarcadores = null;
    this.navegacion.refrescarCapa();
  }

  /**
   * Grupo posicionado en la vista cuyo interior se dibuja en píxeles de
   * pantalla. Al hacer zoom se contraescala para no tapar el terreno.
   */
  _marcador(x, y, clase, atributos = {}) {
    const grupo = crear('g', { class: clase, transform: `translate(${x} ${y})`, ...atributos });
    const interior = crear('g', { transform: `scale(${this.pixel})` });
    grupo.appendChild(interior);
    this.marcadores.push({ grupo, x, y });
    return { grupo, interior };
  }

  _ajustarMarcadores(escala) {
    if (this._escalaMarcadores === escala) return;
    this._escalaMarcadores = escala;
    const factor = 1 / escala ** 0.75;
    for (const { grupo, x, y } of this.marcadores) {
      grupo.setAttribute('transform', `translate(${x} ${y}) scale(${factor})`);
    }
  }

  _crearSalida(salida) {
    const [vx, vy] = localAVista(salida.pos[0], salida.pos[1]);
    const distancia = Math.hypot(vx, vy) || 1;
    // La etiqueta se aparta hacia fuera del mapa para no tapar la salida.
    const ux = vx / distancia;
    const uy = vy / distancia;

    const { grupo, interior } = this._marcador(vx, vy, 'mapa__salida', {
      'data-interactivo': '',
      tabindex: '0',
      role: 'button',
    });
    interior.appendChild(crear('circle', { r: 9 }));
    interior.appendChild(crear('circle', { r: 3.5, class: 'mapa__salida-centro' }));
    interior.appendChild(
      crear(
        'text',
        {
          x: ux * 16,
          y: uy * 16 + 4,
          'text-anchor': ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle',
          class: 'mapa__etiqueta mapa__etiqueta--salida',
          'font-size': 12,
          'stroke-width': 3,
        },
        salida.destino || 'Salida'
      )
    );
    grupo.appendChild(crear('title', {}, `Ir a ${salida.destino || 'mapa vecino'}`));

    if (salida.destino) {
      const navegar = (evento) => {
        // En modo "marcar ubicación" el clic pertenece al mapa, no a la
        // salida: si no, no se podría situar un hideout junto a ella.
        if (this.esAdmin && this.hideoutSeleccionado) return;
        if (evento) evento.stopPropagation();
        this.abrir(salida.destino, { resaltarGremio: this.resaltado });
      };
      grupo.addEventListener('click', navegar);
      grupo.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          navegar(evento);
        }
      });
    }
    return grupo;
  }

  _crearPin(hideout) {
    const [x, y] = localAVista(hideout.pos[0], hideout.pos[1]);
    const destacado =
      this.resaltado && hideout.gremio.toLowerCase().includes(this.resaltado.toLowerCase());

    const { grupo, interior } = this._marcador(
      x,
      y,
      `mapa__pin mapa__pin--${COLOR_TIPO[hideout.tipo] || 'estandar'}${destacado ? ' mapa__pin--destacado' : ''}`,
      { 'data-interactivo': '', tabindex: '0', role: 'button' }
    );

    interior.appendChild(crear('path', { d: 'M0 0 L-9 -14 A10.5 10.5 0 1 1 9 -14 Z', class: 'mapa__pin-cuerpo' }));
    interior.appendChild(crear('circle', { cy: -19, r: 4.5, class: 'mapa__pin-centro' }));
    interior.appendChild(
      crear(
        'text',
        {
          y: 15,
          'text-anchor': 'middle',
          class: 'mapa__etiqueta mapa__etiqueta--pin',
          'font-size': 12,
          'stroke-width': 3,
        },
        hideout.gremio
      )
    );
    grupo.appendChild(crear('title', {}, `${hideout.gremio} — ${hideout.etiquetaTipo} (slot ${hideout.slot})`));

    grupo.addEventListener('click', (evento) => {
      evento.stopPropagation();
      this._seleccionar(hideout.id);
    });

    return grupo;
  }

  /** Clic en pantalla → coordenadas del juego dentro del mapa. */
  _puntoDelEvento(evento) {
    const capa = this.svg.querySelector('[data-capa-zoom]');
    const matriz = capa && capa.getScreenCTM();
    if (!matriz) return null;

    const punto = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matriz.inverse());
    const [x, y] = vistaALocal(punto.x, punto.y);
    const redondear = (v) => Math.round(v * 10) / 10;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [redondear(x), redondear(y)];
  }

  /** Aplica escala, desplazamiento y rotación a la imagen propia. */
  _aplicarAjuste() {
    if (!this.imagenFondo || !this.ajuste) return;
    const { escala = 1, dx = 0, dy = 0, rotacion = 0 } = this.ajuste;
    this.imagenFondo.setAttribute(
      'transform',
      `translate(${dx} ${dy}) rotate(${rotacion}) scale(${escala})`
    );
  }

  // ------------------------------------------------------------- lista ---

  _renderLista(hideouts) {
    this.lista.replaceChildren();

    if (!hideouts.length) {
      const vacio = document.createElement('p');
      vacio.className = 'ventana-mapa__vacio';
      vacio.textContent = 'Este mapa no tiene hideouts registrados en la temporada activa.';
      this.lista.appendChild(vacio);
      return;
    }

    for (const hideout of hideouts) {
      const item = document.createElement('li');
      item.className = 'hideout-fila';
      if (this.hideoutSeleccionado === hideout.id) item.classList.add('hideout-fila--activa');
      if (this.resaltado && hideout.gremio.toLowerCase().includes(this.resaltado.toLowerCase())) {
        item.classList.add('hideout-fila--destacada');
      }

      const cabecera = document.createElement('div');
      cabecera.className = 'hideout-fila__cabecera';

      if (hideout.tieneLogo) {
        const logo = document.createElement('img');
        logo.className = 'hideout-fila__logo';
        logo.src = `/api/gremios/${hideout.gremioId}/logo`;
        logo.alt = '';
        logo.width = 28;
        logo.height = 28;
        cabecera.appendChild(logo);
      }

      const nombre = document.createElement('strong');
      nombre.textContent = hideout.gremio;
      cabecera.appendChild(nombre);

      const tipo = document.createElement('span');
      tipo.className = `etiqueta-tipo etiqueta-tipo--${hideout.tipo.toLowerCase()}`;
      tipo.textContent = hideout.tipo === 'ESTANDAR' ? 'HO' : hideout.tipo;
      cabecera.appendChild(tipo);

      const detalle = document.createElement('div');
      detalle.className = 'hideout-fila__detalle';
      detalle.textContent = hideout.pos
        ? `Slot ${hideout.slot} · ubicado en el mapa`
        : `Slot ${hideout.slot} · sin ubicar en el mapa`;

      item.append(cabecera, detalle);

      if (this.esAdmin) item.appendChild(this._accionesHideout(hideout));

      item.addEventListener('click', () => this._seleccionar(hideout.id));
      this.lista.appendChild(item);
    }
  }

  _accionesHideout(hideout) {
    const acciones = document.createElement('div');
    acciones.className = 'hideout-fila__acciones';

    const marcar = document.createElement('button');
    marcar.type = 'button';
    marcar.className = 'boton boton--pequeno';
    marcar.textContent =
      this.hideoutSeleccionado === hideout.id ? 'Haz clic en el mapa...' : 'Marcar en el mapa';
    marcar.addEventListener('click', (evento) => {
      evento.stopPropagation();
      this._seleccionar(hideout.id);
    });
    acciones.appendChild(marcar);

    if (hideout.pos) {
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'boton boton--pequeno boton--sutil';
      quitar.textContent = 'Quitar ubicación';
      quitar.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        await this._ejecutar(() => api.admin.posicionarHideout(hideout.id, null, null));
      });
      acciones.appendChild(quitar);
    }

    const eliminar = document.createElement('button');
    eliminar.type = 'button';
    eliminar.className = 'boton boton--pequeno boton--peligro';
    eliminar.textContent = 'Eliminar';
    eliminar.addEventListener('click', async (evento) => {
      evento.stopPropagation();
      if (!window.confirm(`¿Eliminar el hideout de "${hideout.gremio}" (slot ${hideout.slot})?`)) return;
      await this._ejecutar(() => api.admin.eliminarHideout(hideout.id));
    });
    acciones.appendChild(eliminar);

    return acciones;
  }

  _seleccionar(id) {
    this.hideoutSeleccionado = this.hideoutSeleccionado === id ? null : id;
    this._renderLista(this.datos.hideouts);
    this.svg.classList.toggle('svg--marcando', Boolean(this.hideoutSeleccionado) && this.esAdmin);
    this._renderAdmin();
  }

  async _guardarPosicion(id, x, y) {
    this.hideoutSeleccionado = null;
    this.svg.classList.remove('svg--marcando');
    await this._ejecutar(() => api.admin.posicionarHideout(id, x, y));
  }

  /** Ejecuta una acción de administración y recarga, mostrando errores. */
  async _ejecutar(accion, opciones) {
    try {
      await accion();
      await this._recargar(opciones);
    } catch (error) {
      this.aviso.textContent = error.message;
      this.aviso.hidden = false;
    }
  }

  // ------------------------------------------------------ administración ---

  _renderAdmin() {
    this.panelAdmin.replaceChildren();
    if (!this.esAdmin || !this.datos) {
      this.panelAdmin.hidden = true;
      return;
    }
    this.panelAdmin.hidden = false;

    const ayuda = document.createElement('p');
    ayuda.className = 'ventana__ayuda';
    ayuda.textContent = this.hideoutSeleccionado
      ? 'Haz clic sobre el mapa para fijar la ubicación del hideout seleccionado.'
      : 'Modo administrador: elige un hideout de la lista para marcar su ubicación, o añade uno nuevo.';
    this.panelAdmin.appendChild(ayuda);

    this.panelAdmin.appendChild(this._formularioHideout());
    this.panelAdmin.appendChild(this._seccionImagen());
  }

  _formularioHideout() {
    const formulario = document.createElement('form');
    formulario.className = 'formulario-linea';

    const gremio = document.createElement('input');
    gremio.type = 'text';
    gremio.placeholder = 'Gremio';
    gremio.maxLength = 60;
    gremio.required = true;

    const slot = document.createElement('input');
    slot.type = 'number';
    slot.min = '1';
    slot.max = '10';
    slot.value = '1';
    slot.required = true;
    slot.className = 'entrada-corta';
    slot.setAttribute('aria-label', 'Slot');

    const tipo = document.createElement('select');
    tipo.setAttribute('aria-label', 'Tipo de hideout');
    for (const [valor, etiqueta] of [
      ['ESTANDAR', 'HO'],
      ['HQ', 'HQ'],
      ['P', 'Personal'],
    ]) {
      const opcion = document.createElement('option');
      opcion.value = valor;
      opcion.textContent = etiqueta;
      tipo.appendChild(opcion);
    }

    const enviar = document.createElement('button');
    enviar.type = 'submit';
    enviar.className = 'boton boton--pequeno';
    enviar.textContent = 'Añadir hideout';

    formulario.append(gremio, slot, tipo, enviar);
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      await this._ejecutar(() =>
        api.admin.crearHideout({
          mapa: this.datos.mapa.nombre,
          gremio: gremio.value,
          slot: Number(slot.value),
          tipo: tipo.value,
        })
      );
    });
    return formulario;
  }

  /** Subida, ajuste y borrado de la imagen de fondo propia del mapa. */
  _seccionImagen() {
    const seccion = document.createElement('div');
    seccion.className = 'ajuste-imagen';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Imagen de fondo propia';
    seccion.appendChild(titulo);

    const explicacion = document.createElement('p');
    explicacion.className = 'ventana__ayuda';
    explicacion.textContent = this.datos.imagen
      ? 'Ajusta la imagen hasta que las salidas y el borde coincidan con el mapa. Se guarda para todos los visitantes.'
      : 'Sube una captura del mapa completo en diamante (PNG, JPG o WebP, máx. 4 MB). Después podrás ajustarla.';
    seccion.appendChild(explicacion);

    const archivo = document.createElement('input');
    archivo.type = 'file';
    archivo.accept = 'image/png,image/jpeg,image/webp';
    archivo.className = 'ajuste-imagen__archivo';
    archivo.setAttribute('aria-label', 'Subir imagen de fondo');
    archivo.addEventListener('change', async () => {
      const fichero = archivo.files && archivo.files[0];
      if (!fichero) return;
      this.fondo = 'propia';
      await this._ejecutar(() => api.admin.subirImagenMapa(this.datos.mapa.id, fichero), {
        conservarFondo: false,
      });
    });
    seccion.appendChild(archivo);

    if (!this.datos.imagen) return seccion;

    const ajuste = this.ajuste || { escala: 1, dx: 0, dy: 0, rotacion: 0 };
    const controles = document.createElement('div');
    controles.className = 'ajuste-imagen__controles';

    const crearControl = (etiqueta, clave, { min, max, paso }) => {
      const fila = document.createElement('label');
      fila.className = 'ajuste-imagen__fila';
      const texto = document.createElement('span');
      texto.textContent = etiqueta;
      const rango = document.createElement('input');
      rango.type = 'range';
      rango.min = String(min);
      rango.max = String(max);
      rango.step = String(paso);
      rango.value = String(ajuste[clave]);
      const valor = document.createElement('output');
      valor.textContent = String(ajuste[clave]);
      rango.addEventListener('input', () => {
        this.ajuste = { ...this.ajuste, [clave]: Number(rango.value) };
        valor.textContent = rango.value;
        // Vista previa inmediata, sin guardar todavía.
        if (this.fondo !== 'propia') {
          this.fondo = 'propia';
          this._renderSelectorFondo();
          this._renderSvg(this.datos.mapa, this.datos.hideouts);
        }
        this._aplicarAjuste();
      });
      fila.append(texto, rango, valor);
      return fila;
    };

    controles.append(
      crearControl('Escala', 'escala', { min: 0.2, max: 3, paso: 0.01 }),
      crearControl('Mover X', 'dx', { min: -600, max: 600, paso: 1 }),
      crearControl('Mover Y', 'dy', { min: -600, max: 600, paso: 1 })
    );

    const filaRotacion = document.createElement('label');
    filaRotacion.className = 'ajuste-imagen__fila';
    const textoRotacion = document.createElement('span');
    textoRotacion.textContent = 'Rotación';
    const rotacion = document.createElement('select');
    for (const grados of [0, 90, 180, 270]) {
      const opcion = document.createElement('option');
      opcion.value = String(grados);
      opcion.textContent = `${grados}°`;
      opcion.selected = ajuste.rotacion === grados;
      rotacion.appendChild(opcion);
    }
    rotacion.addEventListener('change', () => {
      this.ajuste = { ...this.ajuste, rotacion: Number(rotacion.value) };
      this._aplicarAjuste();
    });
    filaRotacion.append(textoRotacion, rotacion);
    controles.appendChild(filaRotacion);
    seccion.appendChild(controles);

    const botones = document.createElement('div');
    botones.className = 'hideout-fila__acciones';

    const guardar = document.createElement('button');
    guardar.type = 'button';
    guardar.className = 'boton boton--pequeno';
    guardar.textContent = 'Guardar ajuste';
    guardar.addEventListener('click', async () => {
      const { escala, dx, dy, rotacion: grados } = this.ajuste;
      await this._ejecutar(() =>
        api.admin.ajustarImagenMapa(this.datos.mapa.id, { escala, dx, dy, rotacion: grados })
      );
    });

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'boton boton--pequeno boton--peligro';
    quitar.textContent = 'Quitar imagen';
    quitar.addEventListener('click', async () => {
      if (!window.confirm('¿Quitar la imagen de fondo de este mapa?')) return;
      await this._ejecutar(() => api.admin.borrarImagenMapa(this.datos.mapa.id), { conservarFondo: false });
    });

    botones.append(guardar, quitar);
    seccion.appendChild(botones);
    return seccion;
  }
}

export default VentanaMapa;
