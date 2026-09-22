'use strict';

import { crear, limpiar, habilitarNavegacion } from './svg.js';
import api from './api.js';

/**
 * mapaDetalle.js
 * ----------------------------------------------------------------------
 * Ventana flotante con el detalle de un mapa de la Zona Negra.
 *
 * Lo que se dibuja es geografía real del juego, tomada de los dumps
 * oficiales del cliente: los límites del mapa, la red de caminos, las
 * salidas hacia cada mapa vecino (en su posición exacta del borde) y los
 * territorios con su monolito.
 *
 * Sobre ese mapa se marcan los hideouts. La coordenada de un hideout NO
 * existe en los datos del juego (son construcciones de jugadores), así
 * que se muestra la que un administrador haya marcado; los que nadie ha
 * ubicado aparecen en la lista lateral como "sin ubicar" en vez de
 * inventarles una posición.
 * ----------------------------------------------------------------------
 */

const COLOR_TIPO = { HQ: 'hq', P: 'personal', ESTANDAR: 'estandar' };

export class VentanaMapa {
  constructor({ obtenerSesion, alCambiar } = {}) {
    this.obtenerSesion = obtenerSesion || (() => null);
    this.alCambiar = alCambiar || (() => {});

    this.dialogo = document.getElementById('ventana-mapa');
    this.titulo = document.getElementById('ventana-mapa__titulo');
    this.insignias = document.getElementById('ventana-mapa__insignias');
    this.svg = document.getElementById('ventana-mapa__svg');
    this.lista = document.getElementById('ventana-mapa__hideouts');
    this.pie = document.getElementById('ventana-mapa__pie');
    this.aviso = document.getElementById('ventana-mapa__aviso');
    this.panelAdmin = document.getElementById('ventana-mapa__admin');

    this.datos = null;
    this.resaltado = null;
    this.hideoutSeleccionado = null;
    this.navegacion = null;

    this._prepararEventos();
  }

  _prepararEventos() {
    document.getElementById('ventana-mapa__cerrar').addEventListener('click', () => this.cerrar());
    document.getElementById('ventana-mapa__reiniciar').addEventListener('click', () => {
      if (this.navegacion) this.navegacion.reiniciar();
    });

    this.dialogo.addEventListener('cancel', (evento) => {
      evento.preventDefault();
      this.cerrar();
    });

    this.dialogo.addEventListener('click', (evento) => {
      // Clic fuera del contenido (sobre el fondo oscuro) cierra la ventana.
      if (evento.target === this.dialogo) this.cerrar();
    });
  }

  get esAdmin() {
    const sesion = this.obtenerSesion();
    return Boolean(sesion && sesion.rol === 'ADMIN');
  }

  async abrir(nombreMapa, { resaltarGremio = null } = {}) {
    this.resaltado = resaltarGremio;
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

  async _recargar() {
    if (!this.datos) return;
    this.datos = await api.detalleMapa(this.datos.mapa.nombre);
    this._render();
    this.alCambiar();
  }

  // ------------------------------------------------------------ render ---

  _render() {
    const { mapa, hideouts, temporada } = this.datos;

    this.titulo.textContent = mapa.nombre;
    this._renderInsignias(mapa, temporada);
    this._renderSvg(mapa, hideouts);
    this._renderLista(hideouts);
    this._renderAdmin();

    this.pie.textContent =
      'Geografía tomada de los dumps oficiales del cliente de Albion Online. ' +
      'La ubicación de cada hideout dentro del mapa la marca un administrador: el juego no la publica.';
  }

  _renderInsignias(mapa, temporada) {
    limpiar(this.insignias);
    const insignias = [
      temporada ? `Temporada ${temporada}` : null,
      mapa.tier ? `Tier ${mapa.tier}` : null,
      mapa.biomaNombre || this._nombreBioma(mapa.bioma),
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

  _nombreBioma(codigo) {
    const nombres = {
      FR: 'Bosque',
      HL: 'Tierras altas',
      MN: 'Montaña',
      ST: 'Estepa',
      SW: 'Pantano',
    };
    return nombres[codigo] || null;
  }

  _renderSvg(mapa, hideouts) {
    limpiar(this.svg);

    const [minX, minY] = mapa.limites.min;
    const [maxX, maxY] = mapa.limites.max;
    const ancho = maxX - minX;
    const alto = maxY - minY;

    // El eje Y del juego crece hacia el norte; en SVG crece hacia abajo.
    const aY = (y) => maxY + minY - y;

    this.svg.setAttribute('viewBox', `${minX} ${minY} ${ancho} ${alto}`);

    const capa = crear('g', { 'data-capa-zoom': '' });
    this.svg.appendChild(capa);

    // Terreno
    capa.appendChild(
      crear('rect', {
        x: minX,
        y: minY,
        width: ancho,
        height: alto,
        class: 'mapa__terreno',
        rx: ancho * 0.03,
      })
    );

    // Rejilla de referencia cada 100 unidades del juego.
    const rejilla = crear('g', { class: 'mapa__rejilla' });
    for (let x = Math.ceil(minX / 100) * 100; x < maxX; x += 100) {
      rejilla.appendChild(crear('line', { x1: x, y1: minY, x2: x, y2: maxY }));
    }
    for (let y = Math.ceil(minY / 100) * 100; y < maxY; y += 100) {
      rejilla.appendChild(crear('line', { x1: minX, y1: aY(y), x2: maxX, y2: aY(y) }));
    }
    capa.appendChild(rejilla);

    // Territorios (torres de vigilancia y castillos)
    for (const territorio of mapa.territorios || []) {
      if (!territorio.centro || !territorio.tam) continue;
      const [cx, cy] = territorio.centro;
      const [tw, th] = territorio.tam;
      const grupo = crear('g', { class: `mapa__territorio mapa__territorio--${(territorio.tipo || '').toLowerCase()}` });
      grupo.appendChild(
        crear('rect', {
          x: cx - tw / 2,
          y: aY(cy) - th / 2,
          width: tw,
          height: th,
          rx: 8,
        })
      );
      if (territorio.monolito) {
        grupo.appendChild(
          crear('circle', { cx: territorio.monolito[0], cy: aY(territorio.monolito[1]), r: 9 })
        );
      }
      grupo.appendChild(
        crear(
          'text',
          { x: cx, y: aY(cy) - th / 2 - 12, 'text-anchor': 'middle', class: 'mapa__etiqueta' },
          territorio.nombre || 'Territorio'
        )
      );
      capa.appendChild(grupo);
    }

    // Caminos reales del cluster
    if (mapa.caminos && mapa.caminos.nodos) {
      const caminos = crear('g', { class: 'mapa__caminos' });
      for (const [desde, hasta] of mapa.caminos.enlaces || []) {
        const a = mapa.caminos.nodos[desde];
        const b = mapa.caminos.nodos[hasta];
        if (!a || !b) continue;
        caminos.appendChild(crear('line', { x1: a[0], y1: aY(a[1]), x2: b[0], y2: aY(b[1]) }));
      }
      capa.appendChild(caminos);
    }

    // Salidas hacia mapas vecinos: cada una en su posición real del borde.
    for (const salida of mapa.salidas || []) {
      const [sx, sy] = salida.pos;
      const grupo = crear('g', {
        class: 'mapa__salida',
        'data-interactivo': '',
        tabindex: '0',
        role: 'button',
      });
      grupo.appendChild(crear('circle', { cx: sx, cy: aY(sy), r: 16 }));
      grupo.appendChild(crear('circle', { cx: sx, cy: aY(sy), r: 7, class: 'mapa__salida-centro' }));

      const etiqueta = crear(
        'text',
        {
          x: sx,
          y: aY(sy) + (sy > 0 ? 34 : -22),
          'text-anchor': 'middle',
          class: 'mapa__etiqueta mapa__etiqueta--salida',
        },
        salida.destino || 'Salida'
      );
      grupo.appendChild(etiqueta);

      const titulo = crear('title', {}, `Ir a ${salida.destino || 'mapa vecino'}`);
      grupo.appendChild(titulo);

      if (salida.destino) {
        const navegar = (evento) => {
          // En modo "marcar ubicación" el clic pertenece al mapa, no a la
          // salida: si no, sería imposible situar un hideout junto a ella.
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
      capa.appendChild(grupo);
    }

    // Hideouts ubicados
    const capaHideouts = crear('g', { class: 'mapa__hideouts' });
    for (const hideout of hideouts) {
      if (!hideout.pos) continue;
      capaHideouts.appendChild(this._crearPin(hideout, aY));
    }
    capa.appendChild(capaHideouts);

    this.navegacion = habilitarNavegacion(this.svg);
    this.navegacion.refrescarCapa();

    // Modo administrador: clic sobre el mapa = marcar la posición del
    // hideout seleccionado en la lista.
    this.svg.onclick = (evento) => {
      if (!this.esAdmin || !this.hideoutSeleccionado) return;
      // Los pines sí conservan su propio clic (seleccionar/deseleccionar);
      // el resto del mapa, incluidas las salidas, sirve para marcar.
      if (evento.target.closest('.mapa__pin')) return;

      const punto = this._puntoDelEvento(evento, aY);
      if (!punto) return;
      this._guardarPosicion(this.hideoutSeleccionado, punto.x, punto.y);
    };
  }

  _puntoDelEvento(evento, aY) {
    const capa = this.svg.querySelector('[data-capa-zoom]');
    if (!capa) return null;

    // getScreenCTM() da la matriz que lleva de coordenadas del mapa a
    // píxeles de pantalla; su inversa convierte el clic del usuario a las
    // coordenadas internas del cluster, ya sin el zoom ni el arrastre.
    const matriz = capa.getScreenCTM();
    if (!matriz) return null;

    const punto = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matriz.inverse());

    const x = Math.round(punto.x * 10) / 10;
    const y = Math.round(aY(punto.y) * 10) / 10;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  _crearPin(hideout, aY) {
    const [x, y] = hideout.pos;
    const destacado = this.resaltado && hideout.gremio.toLowerCase().includes(this.resaltado.toLowerCase());

    const grupo = crear('g', {
      class: `mapa__pin mapa__pin--${COLOR_TIPO[hideout.tipo] || 'estandar'}${destacado ? ' mapa__pin--destacado' : ''}`,
      'data-interactivo': '',
      tabindex: '0',
      role: 'button',
      transform: `translate(${x} ${aY(y)})`,
    });

    grupo.appendChild(crear('path', { d: 'M0 0 L-13 -20 A15 15 0 1 1 13 -20 Z', class: 'mapa__pin-cuerpo' }));
    grupo.appendChild(crear('circle', { cx: 0, cy: -27, r: 7, class: 'mapa__pin-centro' }));
    grupo.appendChild(
      crear('text', { x: 0, y: 18, 'text-anchor': 'middle', class: 'mapa__etiqueta' }, hideout.gremio)
    );
    grupo.appendChild(
      crear('title', {}, `${hideout.gremio} — ${hideout.etiquetaTipo} (slot ${hideout.slot})`)
    );

    grupo.addEventListener('click', (evento) => {
      evento.stopPropagation();
      this._seleccionar(hideout.id);
    });

    return grupo;
  }

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
        ? `Slot ${hideout.slot} · ubicado en ${hideout.pos[0]}, ${hideout.pos[1]}`
        : `Slot ${hideout.slot} · sin ubicar en el mapa`;

      item.append(cabecera, detalle);

      if (this.esAdmin) {
        item.appendChild(this._accionesAdmin(hideout));
      }

      item.addEventListener('click', () => this._seleccionar(hideout.id));
      this.lista.appendChild(item);
    }
  }

  _accionesAdmin(hideout) {
    const acciones = document.createElement('div');
    acciones.className = 'hideout-fila__acciones';

    const marcar = document.createElement('button');
    marcar.type = 'button';
    marcar.className = 'boton boton--pequeno';
    marcar.textContent = this.hideoutSeleccionado === hideout.id ? 'Haz clic en el mapa...' : 'Marcar en el mapa';
    marcar.addEventListener('click', (evento) => {
      evento.stopPropagation();
      this._seleccionar(hideout.id);
    });
    acciones.appendChild(marcar);

    if (hideout.pos) {
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'boton boton--pequeno boton--sutil';
      quitar.textContent = 'Quitar posición';
      quitar.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        await api.admin.posicionarHideout(hideout.id, null, null);
        await this._recargar();
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
      await api.admin.eliminarHideout(hideout.id);
      await this._recargar();
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
    try {
      await api.admin.posicionarHideout(id, x, y);
      this.hideoutSeleccionado = null;
      this.svg.classList.remove('svg--marcando');
      await this._recargar();
    } catch (error) {
      this.aviso.textContent = error.message;
      this.aviso.hidden = false;
    }
  }

  _renderAdmin() {
    this.panelAdmin.replaceChildren();
    if (!this.esAdmin) {
      this.panelAdmin.hidden = true;
      return;
    }
    this.panelAdmin.hidden = false;

    const ayuda = document.createElement('p');
    ayuda.className = 'ventana-mapa__ayuda';
    ayuda.textContent = this.hideoutSeleccionado
      ? 'Haz clic sobre el mapa para fijar la ubicación del hideout seleccionado.'
      : 'Modo administrador: elige un hideout de la lista para marcar su ubicación, o añade uno nuevo.';
    this.panelAdmin.appendChild(ayuda);

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

    const tipo = document.createElement('select');
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
      try {
        await api.admin.crearHideout({
          mapa: this.datos.mapa.nombre,
          gremio: gremio.value,
          slot: Number(slot.value),
          tipo: tipo.value,
        });
        gremio.value = '';
        await this._recargar();
      } catch (error) {
        this.aviso.textContent = error.message;
        this.aviso.hidden = false;
      }
    });

    this.panelAdmin.appendChild(formulario);
  }
}

export default VentanaMapa;
