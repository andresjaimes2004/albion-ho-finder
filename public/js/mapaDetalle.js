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
import { crear as crearHtml, crearListaConexiones, crearTarjetaRuta } from './rutas.js';
import { t, tn } from './i18n.js';

/**
 * mapaDetalle.js
 * ----------------------------------------------------------------------
 * Ventana flotante con el detalle de un mapa de la Zona Negra.
 *
 * El mapa se dibuja en diamante, con la misma orientación que tiene en
 * el juego. De fondo usa la imagen que haya subido un administrador (con
 * su ajuste de escala, desplazamiento y rotación) o, si no hay, el recorte
 * de esa zona del mapa del juego (teselas de la wiki oficial, alineadas
 * con la calibración de mapaOficial.js).
 *
 * Encima van las salidas hacia los mapas vecinos, los territorios y los
 * hideouts. La ubicación de cada hideout la marca un administrador
 * con un clic; se guarda en coordenadas del juego, así que sigue siendo
 * válida aunque se cambie el fondo.
 *
 * Si el mapa aparece en rutas de Avalon vigentes o tiene conexiones
 * abiertas, el panel lateral las muestra con un acceso directo a su ficha
 * en la pestaña Caminos de Avalon.
 * ----------------------------------------------------------------------
 */

const COLOR_TIPO = { HQ: 'hq', ESTANDAR: 'estandar' };
const MARGEN_VISTA = 70;

/**
 * Jerarquía de lo que se dibuja sobre el mapa, en píxeles de pantalla: lo
 * que más se consulta (mapas vecinos, gremios) se lee primero y las
 * referencias (torres, castillos, Smuggler's Den, portales, pasajes)
 * quedan en segundo plano para no saturar los mapas con muchas salidas.
 */
const ESTILO = {
  salida: { fuente: 11.5, contorno: 2.6, radio: 8, centro: 3, separacion: 14 },
  salidaFija: { fuente: 9, contorno: 2.2, radio: 5.5, centro: 2, separacion: 10 },
  pin: { fuente: 10.5, contorno: 2.4 },
  territorio: { fuente: 9.5, contorno: 2.2 },
};

/** Duración del fundido al saltar a un mapa vecino (igual que en el CSS). */
const FUNDIDO_MS = 220;
const reducirMovimiento = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Descarga y decodifica la imagen antes de mostrar el mapa, para que no
 * aparezca a trozos después del fundido. Si tarda o falla, se sigue igual.
 */
function precargarImagen(url, limiteMs = 4000) {
  const imagen = new Image();
  imagen.src = url;
  const lista = typeof imagen.decode === 'function'
    ? imagen.decode().catch(() => {})
    : new Promise((resolver) => { imagen.onload = imagen.onerror = resolver; });
  return Promise.race([lista, esperar(limiteMs)]);
}

export class VentanaMapa {
  constructor({ obtenerSesion, alCambiar, irACaminos } = {}) {
    this.obtenerSesion = obtenerSesion || (() => null);
    this.alCambiar = alCambiar || (() => {});
    this.irACaminos = irACaminos || null;

    this.dialogo = document.getElementById('ventana-mapa');
    this.contenido = this.dialogo.querySelector('.ventana__contenido');
    this.turno = 0;
    this.titulo = document.getElementById('ventana-mapa__titulo');
    this.insignias = document.getElementById('ventana-mapa__insignias');
    this.svg = document.getElementById('ventana-mapa__svg');
    this.selectorFondo = document.getElementById('ventana-mapa__fondos');
    this.lista = document.getElementById('ventana-mapa__hideouts');
    this.pie = document.getElementById('ventana-mapa__pie');
    this.aviso = document.getElementById('ventana-mapa__aviso');
    this.panelAdmin = document.getElementById('ventana-mapa__admin');
    this.panelRutas = document.getElementById('ventana-mapa__rutas');
    this.controladorRutas = null;

    this.datos = null;
    this.resaltado = null;
    this.hideoutSeleccionado = null;
    this.teselas = null;
    this.imagenFondo = null;
    this.fondo = 'oficial';
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

  /**
   * Abre la ventana con un mapa, o salta a otro si ya está abierta. Al
   * saltar (salidas a mapas vecinos) el mapa actual se desvanece, el nuevo
   * se carga con su imagen ya descargada y aparece con un fundido; así no
   * se ve la ventana vacía ni la imagen cargándose a trozos.
   */
  async abrir(nombreMapa, { resaltarGremio = null } = {}) {
    // Si se pulsan varias salidas seguidas, solo cuenta la última.
    const turno = ++this.turno;
    const saltando = this.dialogo.open && Boolean(this.datos);
    this.resaltado = resaltarGremio;
    this.hideoutSeleccionado = null;
    this.contenido.classList.add('ventana__contenido--cambiando');

    if (!saltando) {
      this.datos = null;
      this.titulo.textContent = nombreMapa;
      limpiar(this.insignias);
      limpiar(this.svg);
      this.lista.replaceChildren();
      this.aviso.textContent = t('Cargando mapa...');
      this.aviso.hidden = false;
      if (!this.dialogo.open) this.dialogo.showModal();
    }
    this._cargarRutas(nombreMapa);

    try {
      const [datos] = await Promise.all([
        api.detalleMapa(nombreMapa),
        saltando && !reducirMovimiento() ? esperar(FUNDIDO_MS) : null,
      ]);
      if (turno !== this.turno) return;
      if (datos.imagen) await precargarImagen(datos.imagen.url);
      if (turno !== this.turno) return;

      this.datos = datos;
      this.aviso.hidden = true;
      // Si el mapa tiene imagen propia, se muestra por defecto.
      this.fondo = datos.imagen ? 'propia' : 'oficial';
      this.ajuste = datos.imagen ? { ...datos.imagen } : null;
      this.navegacion.reiniciar();
      this._render();
    } catch (error) {
      if (turno !== this.turno) return;
      this.aviso.textContent = error.message;
      this.aviso.hidden = false;
    }

    // Un fotograma después, para que el navegador pinte el mapa nuevo aún
    // transparente y el fundido de entrada se note.
    requestAnimationFrame(() => {
      if (turno === this.turno) this.contenido.classList.remove('ventana__contenido--cambiando');
    });
  }

  cerrar() {
    if (this.dialogo.open) this.dialogo.close();
    if (this.controladorRutas) this.controladorRutas.abort();
    this.hideoutSeleccionado = null;
  }

  // ---------------------------------------------------- rutas de Avalon ---

  /** Rutas y conexiones vigentes del mapa; es un complemento: si falla, se oculta. */
  async _cargarRutas(nombreMapa) {
    if (this.controladorRutas) this.controladorRutas.abort();
    this.controladorRutas = new AbortController();
    const senal = this.controladorRutas.signal;
    this.panelRutas.hidden = true;
    this.panelRutas.replaceChildren();

    let info;
    try {
      const datos = await api.rutasDeMapas([nombreMapa], senal);
      info = datos.mapas && datos.mapas[nombreMapa];
    } catch (error) {
      return;
    }
    if (senal.aborted || !info) return;
    this._renderRutas(nombreMapa, info);
  }

  _renderRutas(nombreMapa, { rutas = [], conexiones = [] }) {
    this.panelRutas.replaceChildren();
    if (!rutas.length && !conexiones.length) {
      this.panelRutas.hidden = true;
      return;
    }
    this.panelRutas.hidden = false;

    const partes = [];
    if (rutas.length) partes.push(tn(rutas.length, '{n} ruta', '{n} rutas'));
    if (conexiones.length) partes.push(tn(conexiones.length, '{n} conexión', '{n} conexiones'));

    const cabecera = crearHtml('div', 'ventana__rutas-cabecera');
    cabecera.append(
      crearHtml('h3', null, t('Rutas de Avalon activas')),
      crearHtml('span', 'ventana__rutas-resumen', partes.join(' · '))
    );
    this.panelRutas.appendChild(cabecera);

    const irA = this.irACaminos ? (zona) => this.irACaminos(zona) : null;

    for (const ruta of rutas) {
      this.panelRutas.appendChild(
        crearTarjetaRuta(ruta, {
          usuario: this.obtenerSesion(),
          resaltar: nombreMapa,
          alElegirZona: irA,
          alBorrar: async (r) => {
            await api.borrarRuta(r.id);
            this._cargarRutas(nombreMapa);
            this.alCambiar();
          },
        })
      );
    }

    if (conexiones.length) {
      this.panelRutas.appendChild(crearHtml('p', 'rutas-hideout__subtitulo', t('Conexiones directas de este mapa')));
      this.panelRutas.appendChild(crearListaConexiones(conexiones, { alElegirZona: irA }));
    }

    if (irA) {
      const ir = crearHtml('button', 'boton boton--pequeno', t('Ir a la ruta en Caminos de Avalon →'));
      ir.type = 'button';
      ir.addEventListener('click', () => irA(nombreMapa));
      this.panelRutas.appendChild(ir);
    }
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
      t('Salidas y territorios: dumps oficiales del cliente de Albion Online.'),
      t('La ubicación de cada hideout la marca un administrador: el juego no la publica.'),
    ];
    if (this.fondo === 'oficial') {
      textos.push(`${t(TESELAS.atribucion)} ${t('El mapa mundial es ilustrativo: la superposición es aproximada.')}`);
    }
    this.pie.textContent = textos.join(' ');
  }

  _renderInsignias(mapa, temporada) {
    limpiar(this.insignias);
    const nombresBioma = { FR: t('Bosque'), HL: t('Tierras altas'), MN: t('Montaña'), ST: t('Estepa'), SW: t('Pantano') };
    const insignias = [
      temporada ? t('Temporada {codigo}', { codigo: temporada }) : null,
      mapa.tier ? t('Tier {tier}', { tier: mapa.tier }) : null,
      nombresBioma[mapa.bioma] || null,
      mapa.cuadrante ? t('Cuadrante {cuadrante}', { cuadrante: mapa.cuadrante }) : null,
      tn(this.datos.totalHideouts, '{n} hideout', '{n} hideouts'),
    ].filter(Boolean);

    for (const texto of insignias) {
      const span = document.createElement('span');
      span.className = 'insignia';
      span.textContent = texto;
      this.insignias.appendChild(span);
    }
  }

  /** Rótulo sobre el mapa (antes había un selector de fondos). */
  _renderSelectorFondo() {
    const rotulo = document.createElement('span');
    rotulo.className = 'selector-fondo__titulo';
    rotulo.textContent = t('Mapa');
    this.selectorFondo.replaceChildren(rotulo);
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
    // tamaño de ventana. En mapas pequeños (móvil, pantallas bajas) se
    // reducen hasta un 85 % para no tapar el terreno.
    const caja = this.svg.getBoundingClientRect();
    const lado = Math.min(caja.width, caja.height) || 540;
    this.pixel = ((borde * 2) / lado) * Math.min(1, Math.max(0.85, lado / 540));
    this.marcadores = [];
    // Textos y marcadores que entran en el reparto de espacio (_evitarSolapes).
    this.etiquetas = [];
    this.obstaculos = [];

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
      this.imagenFondo = this._crearImagenPropia(mapa, mitad);
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
      const texto = crear(
        'text',
        {
          y: -6,
          'text-anchor': 'middle',
          class: 'mapa__etiqueta mapa__etiqueta--territorio',
          'font-size': ESTILO.territorio.fuente,
          'stroke-width': ESTILO.territorio.contorno,
        },
        territorio.nombre || t('Territorio')
      );
      etiqueta.interior.appendChild(texto);
      capa.appendChild(etiqueta.grupo);
      // Encima del vértice superior o, si choca, justo por dentro.
      this.etiquetas.push({
        nodo: texto,
        prioridad: 2,
        posiciones: [{ y: -6 }, { y: ESTILO.territorio.fuente + 6 }],
      });
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
    // Con imagen propia, lo de fuera del rombo es el arte del apartado:
    // se oscurece menos que las teselas de los mapas vecinos.
    this.svg.classList.toggle('lienzo--con-imagen', Boolean(this.imagenFondo));
    this._escalaMarcadores = null;
    this.navegacion.refrescarCapa();
    this._evitarSolapes();
  }

  /**
   * Reparte el espacio entre los textos del mapa. Se colocan primero los
   * más importantes (mapas vecinos, gremios); los secundarios (torres,
   * castillos, ciudades, Smuggler's Den, pasajes) prueban otra posición si
   * chocan, y los de salidas no navegables se ocultan si no caben: su
   * nombre aparece al pasar el ratón por el marcador.
   */
  _evitarSolapes() {
    if (!this.etiquetas || !this.etiquetas.length) return;
    const holgura = 2;
    const caja = (nodo) => {
      const r = nodo.getBoundingClientRect();
      return { izq: r.left - holgura, der: r.right + holgura, arr: r.top - holgura, aba: r.bottom + holgura };
    };
    const chocan = (a, b) => a.izq < b.der && a.der > b.izq && a.arr < b.aba && a.aba > b.arr;
    const colocar = (nodo, posicion) => {
      for (const [atributo, valor] of Object.entries(posicion)) nodo.setAttribute(atributo, valor);
    };
    // Cada marcador es obstáculo para todos los textos menos el suyo.
    const ocupadas = this.obstaculos.map(({ nodo, dueno }) => ({ ...caja(nodo), dueno }));

    for (const etiqueta of [...this.etiquetas].sort((a, b) => a.prioridad - b.prioridad)) {
      etiqueta.nodo.classList.remove('mapa__etiqueta--oculta');
      let libre = null;
      for (const posicion of etiqueta.posiciones) {
        colocar(etiqueta.nodo, posicion);
        const actual = caja(etiqueta.nodo);
        if (!ocupadas.some((otra) => otra.dueno !== etiqueta.nodo && chocan(actual, otra))) {
          libre = actual;
          break;
        }
      }
      if (!libre) {
        colocar(etiqueta.nodo, etiqueta.posiciones[0]);
        if (etiqueta.ocultable) {
          etiqueta.nodo.classList.add('mapa__etiqueta--oculta');
          continue;
        }
        libre = caja(etiqueta.nodo);
      }
      ocupadas.push(libre);
    }
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
    // Al acercar, los textos se separan y los ocultos pueden volver a caber.
    this._evitarSolapes();
  }

  _crearSalida(salida) {
    const [vx, vy] = localAVista(salida.pos[0], salida.pos[1]);
    const distancia = Math.hypot(vx, vy) || 1;
    // La etiqueta se aparta hacia fuera del mapa para no tapar la salida.
    const ux = vx / distancia;
    const uy = vy / distancia;

    // Las salidas a ciudades, Smuggler's Den o pasajes no tienen ficha:
    // se dibujan como referencia, sin poder abrirse.
    const navegable = Boolean(salida.destino) && salida.navegable !== false;
    const { grupo, interior } = this._marcador(
      vx,
      vy,
      navegable ? 'mapa__salida' : 'mapa__salida mapa__salida--fija',
      navegable ? { 'data-interactivo': '', tabindex: '0', role: 'button' } : {}
    );
    const estilo = navegable ? ESTILO.salida : ESTILO.salidaFija;
    const circulo = crear('circle', { r: estilo.radio });
    interior.appendChild(circulo);
    interior.appendChild(crear('circle', { r: estilo.centro, class: 'mapa__salida-centro' }));
    // Hacia fuera del mapa o, si choca con otro texto, hacia dentro.
    const lado = (u) => (u > 0.3 ? 'start' : u < -0.3 ? 'end' : 'middle');
    const fuera = {
      x: ux * estilo.separacion,
      y: uy * estilo.separacion + estilo.fuente / 3,
      'text-anchor': lado(ux),
    };
    const dentro = {
      x: -ux * estilo.separacion,
      y: -uy * estilo.separacion + estilo.fuente / 3,
      'text-anchor': lado(-ux),
    };
    const texto = crear(
      'text',
      {
        ...fuera,
        class: 'mapa__etiqueta mapa__etiqueta--salida',
        'font-size': estilo.fuente,
        'stroke-width': estilo.contorno,
      },
      salida.destino || t('Salida')
    );
    interior.appendChild(texto);
    this.obstaculos.push({ nodo: circulo, dueno: texto });
    this.etiquetas.push({
      nodo: texto,
      prioridad: navegable ? 0 : 3,
      posiciones: navegable ? [fuera] : [fuera, dentro],
      ocultable: !navegable,
    });
    grupo.appendChild(
      crear(
        'title',
        {},
        navegable
          ? t('Ir a {destino}', { destino: salida.destino })
          : t('Salida a {destino} (no es un mapa de Zona Negra)', { destino: salida.destino || t('mapa vecino') })
      )
    );

    if (navegable) {
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

    const cuerpo = crear('path', { d: 'M0 0 L-9 -14 A10.5 10.5 0 1 1 9 -14 Z', class: 'mapa__pin-cuerpo' });
    interior.appendChild(cuerpo);
    interior.appendChild(crear('circle', { cy: -19, r: 4.5, class: 'mapa__pin-centro' }));
    const texto = crear(
      'text',
      {
        y: 14,
        'text-anchor': 'middle',
        class: 'mapa__etiqueta mapa__etiqueta--pin',
        'font-size': ESTILO.pin.fuente,
        'stroke-width': ESTILO.pin.contorno,
      },
      hideout.gremio
    );
    interior.appendChild(texto);
    this.obstaculos.push({ nodo: cuerpo, dueno: texto });
    this.etiquetas.push({ nodo: texto, prioridad: 1, posiciones: [{ y: 14 }] });
    grupo.appendChild(crear('title', {}, t('{gremio} — {tipo}', { gremio: hideout.gremio, tipo: t(hideout.etiquetaTipo) })));

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

  /**
   * Imagen de fondo propia. Una captura ('diamante') ya viene girada y
   * solo se encaja en el recuadro del rombo. La textura del minimapa del
   * juego ('juego') es un cuadrado en coordenadas del mapa: X a la
   * derecha e Y hacia abajo, de limites.min a limites.max. Se coloca ahí
   * y se proyecta con la misma transformación que las salidas y los pines
   * (localAVista), así que encaja sin ajustes.
   */
  _crearImagenPropia(mapa, mitad) {
    if (this._proyeccion() !== 'juego') {
      this.transformBase = '';
      return crear('image', {
        href: this.datos.imagen.url,
        x: -mitad,
        y: -mitad,
        width: mitad * 2,
        height: mitad * 2,
        preserveAspectRatio: 'xMidYMid meet',
      });
    }

    const [minX, minY] = mapa.limites.min;
    const [maxX, maxY] = mapa.limites.max;
    const [a, b] = localAVista(1, 0);
    const [c, d] = localAVista(0, 1);
    this.transformBase = ` matrix(${a} ${b} ${c} ${d} 0 0)`;
    return crear('image', {
      href: this.datos.imagen.url,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      preserveAspectRatio: 'none',
    });
  }

  _proyeccion() {
    return (this.ajuste && this.ajuste.proyeccion) || (this.datos.imagen && this.datos.imagen.proyeccion) || 'diamante';
  }

  /** Aplica escala, desplazamiento y rotación a la imagen propia. */
  _aplicarAjuste() {
    if (!this.imagenFondo || !this.ajuste) return;
    const { escala = 1, dx = 0, dy = 0, rotacion = 0 } = this.ajuste;
    this.imagenFondo.setAttribute(
      'transform',
      `translate(${dx} ${dy}) rotate(${rotacion}) scale(${escala})${this.transformBase || ''}`
    );
  }

  // ------------------------------------------------------------- lista ---

  _renderLista(hideouts) {
    this.lista.replaceChildren();

    if (!hideouts.length) {
      const vacio = document.createElement('p');
      vacio.className = 'ventana-mapa__vacio';
      vacio.textContent = t('Este mapa no tiene hideouts registrados en la temporada activa.');
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
        ? t('Ubicado en el mapa')
        : t('Sin ubicar en el mapa');

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
      this.hideoutSeleccionado === hideout.id ? t('Haz clic en el mapa...') : t('Marcar en el mapa');
    marcar.addEventListener('click', (evento) => {
      evento.stopPropagation();
      this._seleccionar(hideout.id);
    });
    acciones.appendChild(marcar);

    if (hideout.pos) {
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'boton boton--pequeno boton--sutil';
      quitar.textContent = t('Quitar ubicación');
      quitar.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        await this._ejecutar(() => api.admin.posicionarHideout(hideout.id, null, null));
      });
      acciones.appendChild(quitar);
    }

    const eliminar = document.createElement('button');
    eliminar.type = 'button';
    eliminar.className = 'boton boton--pequeno boton--peligro';
    eliminar.textContent = t('Eliminar');
    eliminar.addEventListener('click', async (evento) => {
      evento.stopPropagation();
      if (!window.confirm(t('¿Eliminar el hideout de "{gremio}"?', { gremio: hideout.gremio }))) return;
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
      ? t('Haz clic sobre el mapa para fijar la ubicación del hideout seleccionado.')
      : t('Modo administrador: elige un hideout de la lista para marcar su ubicación, o añade uno nuevo.');
    this.panelAdmin.appendChild(ayuda);

    this.panelAdmin.appendChild(this._formularioHideout());
    this.panelAdmin.appendChild(this._seccionImagen());
  }

  _formularioHideout() {
    const formulario = document.createElement('form');
    formulario.className = 'formulario-linea';

    const gremio = document.createElement('input');
    gremio.type = 'text';
    gremio.placeholder = t('Gremio');
    gremio.maxLength = 60;
    gremio.required = true;

    const slot = document.createElement('input');
    slot.type = 'number';
    slot.min = '1';
    slot.max = '10';
    slot.value = '1';
    slot.required = true;
    slot.className = 'entrada-corta';
    slot.setAttribute('aria-label', t('Slot'));

    const tipo = document.createElement('select');
    tipo.setAttribute('aria-label', t('Tipo de hideout'));
    for (const [valor, etiqueta] of [
      ['ESTANDAR', 'HO'],
      ['HQ', 'HQ'],
    ]) {
      const opcion = document.createElement('option');
      opcion.value = valor;
      opcion.textContent = etiqueta;
      tipo.appendChild(opcion);
    }

    const enviar = document.createElement('button');
    enviar.type = 'submit';
    enviar.className = 'boton boton--pequeno';
    enviar.textContent = t('Añadir hideout');

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
    titulo.textContent = t('Imagen de fondo propia');
    seccion.appendChild(titulo);

    const explicacion = document.createElement('p');
    explicacion.className = 'ventana__ayuda';
    explicacion.textContent = this.datos.imagen
      ? t('Ajusta la imagen hasta que las salidas y el borde coincidan con el mapa. Se guarda para todos los visitantes.')
      : t('Sube la imagen del minimapa del juego o una captura del mapa en diamante (PNG, JPG o WebP, máx. 4 MB). Después podrás ajustarla.');
    seccion.appendChild(explicacion);

    const archivo = document.createElement('input');
    archivo.type = 'file';
    archivo.accept = 'image/png,image/jpeg,image/webp';
    archivo.className = 'ajuste-imagen__archivo';
    archivo.setAttribute('aria-label', t('Subir imagen de fondo'));
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

    const filaTipo = document.createElement('label');
    filaTipo.className = 'ajuste-imagen__fila';
    const textoTipo = document.createElement('span');
    textoTipo.textContent = t('Tipo');
    const tipo = document.createElement('select');
    for (const [valor, etiqueta] of [
      ['juego', t('Minimapa del juego (cuadrado)')],
      ['diamante', t('Captura en diamante')],
    ]) {
      const opcion = document.createElement('option');
      opcion.value = valor;
      opcion.textContent = etiqueta;
      opcion.selected = this._proyeccion() === valor;
      tipo.appendChild(opcion);
    }
    tipo.addEventListener('change', () => {
      this.ajuste = { ...this.ajuste, proyeccion: tipo.value };
      this.fondo = 'propia';
      this._renderSvg(this.datos.mapa, this.datos.hideouts);
      this._aplicarAjuste();
    });
    filaTipo.append(textoTipo, tipo);
    controles.appendChild(filaTipo);

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
      crearControl(t('Escala'), 'escala', { min: 0.2, max: 3, paso: 0.01 }),
      crearControl(t('Mover X'), 'dx', { min: -600, max: 600, paso: 1 }),
      crearControl(t('Mover Y'), 'dy', { min: -600, max: 600, paso: 1 })
    );

    const filaRotacion = document.createElement('label');
    filaRotacion.className = 'ajuste-imagen__fila';
    const textoRotacion = document.createElement('span');
    textoRotacion.textContent = t('Rotación');
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
    guardar.textContent = t('Guardar ajuste');
    guardar.addEventListener('click', async () => {
      const { escala, dx, dy, rotacion: grados } = this.ajuste;
      const proyeccion = this._proyeccion();
      await this._ejecutar(() =>
        api.admin.ajustarImagenMapa(this.datos.mapa.id, { escala, dx, dy, rotacion: grados, proyeccion })
      );
    });

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'boton boton--pequeno boton--peligro';
    quitar.textContent = t('Quitar imagen');
    quitar.addEventListener('click', async () => {
      if (!window.confirm(t('¿Quitar la imagen de fondo de este mapa?'))) return;
      await this._ejecutar(() => api.admin.borrarImagenMapa(this.datos.mapa.id), { conservarFondo: false });
    });

    botones.append(guardar, quitar);
    seccion.appendChild(botones);
    return seccion;
  }
}

export default VentanaMapa;
