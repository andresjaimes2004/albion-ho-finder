'use strict';

import api from './api.js';
import { crear, crearFuente, crearReloj, crearTarjetaRuta, textoCercania } from './rutas.js';
import { t, tn, regional } from './i18n.js';
import { confirmar } from './dialogos.js';
import { conectarSugerencias, agregarBotonBorrar } from './sugerencias.js';
import { mostrarSuave, ocultarSuave, conectarDesplegable, retirarSuave } from './animar.js';
import { tanda } from './paginacion.js';

/**
 * tracking.js
 * ----------------------------------------------------------------------
 * Sección "Caminos de Avalon": catálogo oficial de caminos, filtrable, y
 * las conexiones vigentes de cada uno con cuenta regresiva hasta su
 * cierre.
 *
 *  - Las conexiones las registran los propios usuarios desde capturas
 *    del juego; mientras la sección está visible, el resumen se refresca
 *    cada 60 s para mostrar las que registren otros.
 *  - Las cuentas regresivas se actualizan cada segundo en el navegador,
 *    sin pedir nada al servidor.
 *  - Todo el texto se inserta con textContent: los nombres y usuarios los
 *    escriben otras personas y nunca se interpretan como HTML.
 * ----------------------------------------------------------------------
 */

const INTERVALO_REFRESCO_MS = 60_000;
// Resultados de la búsqueda y "Caminos avalonianos": de 9 en 9 (3 × 3), en
// tandas circulares.
const POR_TANDA = 9;
const CURVA = 'cubic-bezier(0.4, 0, 0.2, 1)';

const RECURSOS = {
  ORE: t('Mineral'),
  WOOD: t('Madera'),
  FIBER: t('Fibra'),
  HIDE: t('Piel'),
  ROCK: t('Piedra'),
};

function normalizar(texto) {
  return String(texto || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Nombre de gremio para buscar: sin tildes, mayúsculas, espacios ni
 * signos ("R E Q U I E M" y "Requiem" coinciden).
 */
function claveGremio(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}


export class PanelCaminos {
  constructor({ abrirMapa, alActualizar = null, alEditarRuta = null }) {
    this.abrirMapa = abrirMapa;
    this.alEditarRuta = alEditarRuta;
    // Avisa de cada resumen nuevo (el panel de registro usa sus conexiones).
    this.alActualizar = alActualizar;

    this.input = document.getElementById('input-camino');
    // Sugerencias propias (caminos, mapas y gremios de caminos de hideouts)
    // y ✕ para borrar lo escrito.
    // Elegir una sugerencia que es un camino o mapa abre su ficha (solo al
    // elegirla: el evento "change" del campo también salta al perder el foco,
    // por ejemplo al pulsar la ✕ de la ficha, y la volvía a abrir).
    this.sugerencias = conectarSugerencias(this.input, {
      opciones: () => this._opcionesSugeridas(),
      alElegir: (valor) => {
        const entrada = this._buscarEntrada(valor);
        if (entrada) this.abrirDetalle(entrada.nombre);
      },
    });
    agregarBotonBorrar(this.input);
    this.filtroGrupo = document.getElementById('caminos-grupo');
    this.filtroTier = document.getElementById('caminos-tier');
    this.filtroActivos = document.getElementById('caminos-activos');
    this.estadoFuente = document.getElementById('caminos-estado');
    this.cargando = document.getElementById('caminos-cargando');
    this.error = document.getElementById('caminos-error');
    this.resumen = document.getElementById('caminos-resumen');
    this.lista = document.getElementById('caminos-lista');
    this.detalle = document.getElementById('caminos-detalle');
    // Resultados de la búsqueda (bajo el buscador) y tarjeta desplegable con
    // todos los caminos (cuando no se busca nada).
    this.resultados = document.getElementById('caminos-resultados');
    this.todos = document.getElementById('caminos-todos');
    this.todosCuerpo = document.getElementById('caminos-todos-cuerpo');
    this.todosCantidad = document.getElementById('todos-cantidad');
    this.rutasTarjeta = document.getElementById('caminos-rutas-tarjeta');
    this.rutasCantidad = document.getElementById('rutas-cantidad');
    // Las dos secciones fijas con tandas de 9: cada una recuerda la suya.
    this.secciones = {
      resultados: {
        seccion: this.resultados,
        cuerpo: document.getElementById('caminos-resultados-cuerpo'),
        cantidad: document.getElementById('resultados-cantidad'),
      },
      todos: { seccion: this.todos, cuerpo: this.todosCuerpo, cantidad: this.todosCantidad },
    };
    for (const [nombre, seccion] of Object.entries(this.secciones)) {
      seccion.tanda = 0;
      seccion.paginadores = [...seccion.seccion.querySelectorAll('.paginador')];
      seccion.posiciones = [...seccion.seccion.querySelectorAll('.paginador__posicion')];
      seccion.botones = [...seccion.seccion.querySelectorAll('.paginador__boton')];
      for (const boton of seccion.botones) {
        boton.addEventListener('click', () => this._cambiarTanda(nombre, Number(boton.dataset.paso)));
      }
    }
    conectarDesplegable(document.getElementById('rutas-alternar'), document.getElementById('caminos-rutas'), {
      clave: 'rutas-abiertas',
      abierto: true,
    });

    this.datos = null;
    this.mapaAbierto = null;
    this.controladorDetalle = null;
    this.temporizadorRefresco = null;
    this.activo = false;

    this._bindEventos();
  }

  _bindEventos() {
    let espera = null;
    this.input.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(() => this._reiniciarLista(), 200);
    });
    this.input.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Enter') return;
      const primera = this._entradasFiltradas()[0];
      if (primera) this.abrirDetalle(primera.nombre);
    });

    for (const filtro of [this.filtroGrupo, this.filtroTier, this.filtroActivos]) {
      filtro.addEventListener('change', () => this._reiniciarLista());
    }

    document.addEventListener('visibilitychange', () => {
      if (this.activo && !document.hidden) this.refrescar();
    });
  }

  /**
   * Espacios del usuario: aparecen en el filtro de rutas desde que entra en
   * ellos, aunque todavía no tengan rutas.
   */
  establecerEspacios(espacios = []) {
    this.espaciosUsuario = espacios.map((e) => ({ id: e.id, nombre: e.nombre, publico: e.publico, miembro: true }));
    if (this.datos) this._renderizarRutas();
  }

  establecerUsuario(usuario) {
    this.usuario = usuario;
    // Los botones de cada ruta (borrar...) dependen de quién mira.
    if (this.datos) this._renderizarRutas();
    if (this.mapaAbierto) this.abrirDetalle(this.mapaAbierto, { silencioso: true });
  }

  // --------------------------------------------------------- ciclo de vida --

  /** Se llama al mostrar la sección. */
  activar() {
    if (this.activo) return;
    this.activo = true;
    this.refrescar();
    this.temporizadorRefresco = setInterval(() => {
      if (!document.hidden) this.refrescar();
    }, INTERVALO_REFRESCO_MS);
  }

  /** Se llama al ocultar la sección: no se consulta nada en segundo plano. */
  desactivar() {
    this.activo = false;
    clearInterval(this.temporizadorRefresco);
  }

  async refrescar() {
    try {
      this.datos = await api.tracking();
      this.error.hidden = true;
      this._renderizarEstado();
      this._renderizarSugerencias();
      this._renderizarLista();
      this._renderizarRutas();
      if (this.alActualizar) this.alActualizar(this.datos);
      if (this._restauracion) {
        // Venimos de cambiar de idioma: se reabre el camino que se miraba.
        const { mapaAbierto, resolver } = this._restauracion;
        this._restauracion = null;
        if (mapaAbierto) await this.abrirDetalle(mapaAbierto, { desplazar: false });
        resolver();
      } else if (this.mapaAbierto) {
        this.abrirDetalle(this.mapaAbierto, { silencioso: true });
      }
    } catch (error) {
      if (!this.datos) {
        this.error.textContent = error.message || t('No se pudieron cargar los caminos de Avalon.');
        this.error.hidden = false;
      }
    } finally {
      this.cargando.hidden = true;
    }
  }

  // ------------------------------------------------------------- entradas --

  /**
   * Una lista única para buscar: los caminos del catálogo, los mapas de
   * Zona Negra y cualquier otro mapa (ciudades, zonas reales...) que
   * aparezca en una conexión vigente.
   */
  _entradas() {
    if (!this.datos) return [];
    if (this._cacheEntradas && this._cacheEntradas.datos === this.datos) return this._cacheEntradas.lista;

    const lista = this.datos.caminos.map((c) => ({ ...c, clase: 'avalon' }));
    const vistas = new Set(lista.map((e) => normalizar(e.nombre)));

    for (const m of this.datos.mapasZonaNegra) {
      lista.push({ ...m, clase: 'zonaNegra', grupo: null, etiqueta: 'Mapa de Zona Negra' });
      vistas.add(normalizar(m.nombre));
    }

    const conteoOtros = new Map();
    for (const c of this.datos.conexiones) {
      for (const extremo of [c.origen, c.destino]) {
        if (extremo.clase !== 'otro' || !extremo.nombre) continue;
        const clave = normalizar(extremo.nombre);
        if (vistas.has(clave) && !conteoOtros.has(clave)) continue;
        vistas.add(clave);
        const previa = conteoOtros.get(clave);
        conteoOtros.set(clave, previa
          ? { ...previa, conexiones: previa.conexiones + 1 }
          : { nombre: extremo.nombre, clase: 'otro', grupo: null, tier: null, etiqueta: extremo.etiqueta || 'Otro mapa', conexiones: 1 });
      }
    }
    lista.push(...conteoOtros.values());

    this._cacheEntradas = { datos: this.datos, lista };
    return lista;
  }

  _buscarEntrada(texto) {
    const clave = normalizar(texto);
    return clave ? this._entradas().find((e) => normalizar(e.nombre) === clave) : null;
  }

  _entradasFiltradas() {
    const texto = normalizar(this.input.value);
    const textoGremio = claveGremio(this.input.value);
    const grupo = this.filtroGrupo.value;
    const tier = this.filtroTier.value ? Number(this.filtroTier.value) : null;
    const soloActivos = this.filtroActivos.checked;

    return this._entradas()
      .filter((e) => {
        // Un camino de hideouts también se encuentra por sus gremios.
        const porGremio = textoGremio.length >= 2 && (e.gremios || []).some((g) => claveGremio(g).includes(textoGremio));
        if (texto && !normalizar(e.nombre).includes(texto) && !porGremio) return false;
        if (grupo && e.grupo !== grupo) return false;
        if (tier && e.tier !== tier) return false;
        if (soloActivos && !e.conexiones) return false;
        // Los mapas que no son caminos solo se listan si se buscan por
        // nombre o si tienen alguna conexión abierta ahora.
        if (e.clase !== 'avalon' && !texto && !e.conexiones) return false;
        return true;
      })
      .sort((a, b) => b.conexiones - a.conexiones || a.nombre.localeCompare(b.nombre));
  }

  // ----------------------------------------------------------- renderizado --

  _renderizarEstado() {
    const { estado } = this.datos;
    this.estadoFuente.replaceChildren();
    this.estadoFuente.className = 'caminos-estado';

    const partes = [tn(estado.activas, '{n} conexión activa', '{n} conexiones activas')];
    if (estado.rutas) partes.push(tn(estado.rutas, '{n} ruta', '{n} rutas'));
    if (!estado.activas) this.estadoFuente.classList.add('caminos-estado--vacio');

    this.estadoFuente.append(crear('span', 'caminos-estado__punto'), partes.join(' · '));
    this.estadoFuente.title = t('Conexiones registradas por los usuarios desde capturas del juego');
  }

  _renderizarSugerencias() {
    this._cacheOpciones = null;
    this.sugerencias.actualizar();
  }

  /** Caminos y mapas (con su tipo) y los gremios con hideout en caminos. */
  _opcionesSugeridas() {
    if (this._cacheOpciones) return this._cacheOpciones;
    const entradas = this._entradas();
    const gremios = [...new Set(entradas.flatMap((e) => e.gremios || []))].sort((a, b) => a.localeCompare(b));
    this._cacheOpciones = [
      ...entradas.map((e) => ({ valor: e.nombre, tipo: e.etiqueta ? t(e.etiqueta) : '' })),
      ...gremios.map((valor) => ({ valor, tipo: t('Gremio con hideout') })),
    ];
    return this._cacheOpciones;
  }

  /** Búsqueda o filtros nuevos: los resultados vuelven a su primera tanda. */
  _reiniciarLista() {
    this.secciones.resultados.tanda = 0;
    this._renderizarLista();
  }

  /** ¿Hay algo escrito o algún filtro puesto? */
  _busquedaActiva() {
    return Boolean(
      normalizar(this.input.value) || this.filtroGrupo.value || this.filtroTier.value || this.filtroActivos.checked
    );
  }

  /**
   * Siguiente o anterior tanda de 9 caminos. Da la vuelta: desde la última
   * se pasa a la primera y desde la primera a la última.
   */
  _cambiarTanda(nombre, paso) {
    const seccion = this.secciones[nombre];
    seccion.tanda += paso;
    this._renderizarLista({ direccion: paso });
    // Si la sección queda por encima de la pantalla, se vuelve a su inicio.
    if (seccion.seccion.getBoundingClientRect().top < 0) seccion.seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  _renderizarLista({ direccion = 0 } = {}) {
    if (!this.datos) return;
    const filtradas = this._entradasFiltradas();
    const conConexiones = filtradas.filter((e) => e.conexiones > 0).length;

    // Con una búsqueda o un filtro, los resultados van justo bajo el
    // buscador; sin nada, la lista vive en la sección "Caminos avalonianos".
    // Las dos son secciones fijas con tandas de 9.
    const activa = this._busquedaActiva();
    const seccion = activa ? this.secciones.resultados : this.secciones.todos;
    if (this.lista.parentElement !== seccion.cuerpo) seccion.cuerpo.append(this.resumen, this.lista);
    if (activa) {
      mostrarSuave(this.resultados);
      ocultarSuave(this.todos);
    } else {
      ocultarSuave(this.resultados);
      mostrarSuave(this.todos);
    }
    seccion.cantidad.textContent = `(${filtradas.length})`;

    this.resumen.hidden = false;
    this.resumen.replaceChildren(
      this._crearDato(filtradas.length, filtradas.length === 1 ? t('mapa') : t('mapas')),
      this._crearDato(conConexiones, t('con conexiones abiertas'))
    );

    // La tanda de 9 que toca; las flechas solo si hay más de una tanda.
    const { pagina, paginas, desde, hasta } = tanda(filtradas.length, seccion.tanda, POR_TANDA);
    seccion.tanda = pagina;
    const visibles = filtradas.slice(desde, hasta);
    let texto = '';
    if (hasta - desde === 1) texto = t('{n} de {total}', { n: hasta, total: filtradas.length });
    else if (filtradas.length) texto = t('{desde}–{hasta} de {total}', { desde: desde + 1, hasta, total: filtradas.length });
    for (const posicion of seccion.posiciones) posicion.textContent = texto;
    for (const paginador of seccion.paginadores) paginador.hidden = paginas <= 1;

    this.lista.replaceChildren(...visibles.map((e) => this._crearTarjeta(e)));
    if (!filtradas.length) {
      this.lista.appendChild(crear('p', 'estado estado--advertencia', t('Ningún camino coincide con la búsqueda.')));
    }
    // Al cambiar de tanda, la nueva entra deslizándose desde el lado al que se va.
    if (direccion && typeof this.lista.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Pulsando seguido, cada tanda sustituye a la animación anterior.
      for (const previa of this.lista.getAnimations()) previa.cancel();
      this.lista.animate(
        [
          { opacity: 0, transform: `translateX(${direccion > 0 ? 32 : -32}px)` },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 280, easing: CURVA }
      );
    }
  }

  _crearDato(numero, texto) {
    const span = crear('span');
    span.append(crear('strong', null, String(numero)), ` ${texto}`);
    return span;
  }

  _crearTarjeta(entrada) {
    const tarjeta = crear('button', `tarjeta-camino tarjeta-camino--${entrada.clase}`);
    tarjeta.type = 'button';
    if (entrada.conexiones) tarjeta.classList.add('tarjeta-camino--activa');
    tarjeta.setAttribute('aria-label', t('Ver conexiones de {nombre}', { nombre: entrada.nombre }));

    const cabeza = crear('span', 'tarjeta-camino__cabeza');
    cabeza.append(crear('span', 'tarjeta-camino__nombre', entrada.nombre));
    cabeza.append(
      crear(
        'span',
        `tarjeta-camino__conexiones${entrada.conexiones ? ' tarjeta-camino__conexiones--si' : ''}`,
        entrada.conexiones ? tn(entrada.conexiones, '{n} conexión', '{n} conexiones') : t('sin conexiones')
      )
    );

    const meta = [];
    if (entrada.tier) meta.push(`T${entrada.tier}`);
    if (entrada.etiqueta) meta.push(t(entrada.etiqueta));
    if (entrada.dungeons) {
      const d = entrada.dungeons;
      const total = d.solo + d.grupo + d.elite;
      if (total) meta.push(tn(total, '{n} dungeon', '{n} dungeons'));
    }
    if (entrada.recursos && entrada.recursos.length) {
      meta.push(entrada.recursos.map((r) => RECURSOS[r] || r).join(', '));
    }

    tarjeta.append(cabeza, crear('span', 'tarjeta-camino__meta', meta.join(' · ')));
    // Caminos de hideouts: qué gremios tienen hideout allí.
    if (entrada.gremios) {
      const gremios = crear(
        'span',
        `tarjeta-camino__gremios${entrada.gremios.length ? '' : ' tarjeta-camino__gremios--vacio'}`,
        entrada.gremios.length
          ? t('Hideouts: {gremios}', { gremios: entrada.gremios.join(', ') })
          : t('Sin gremios anotados todavía')
      );
      tarjeta.append(gremios);
    }
    tarjeta.addEventListener('click', () => this.abrirDetalle(entrada.nombre));
    return tarjeta;
  }

  // --------------------------------------------------------------- detalle --

  /**
   * Lo que se está mirando, para conservarlo al cambiar de idioma (la
   * página del otro idioma lo recibe en restaurar()).
   */
  estado() {
    return {
      texto: this.input.value,
      grupo: this.filtroGrupo.value,
      tier: this.filtroTier.value,
      activos: this.filtroActivos.checked,
      tandas: { resultados: this.secciones.resultados.tanda, todos: this.secciones.todos.tanda },
      mapaAbierto: this.mapaAbierto,
      entradasAbiertas: [...(this._entradasAbiertas || [])],
      cerradasAbiertas: Boolean(this._cerradasAbiertas),
    };
  }

  /**
   * Deja la sección como estaba en el otro idioma. Devuelve una promesa que
   * se cumple cuando ya está todo pintado (con el camino consultado
   * abierto), para recolocar después la posición de la página.
   */
  restaurar(estado = {}) {
    const texto = (v) => (typeof v === 'string' ? v.slice(0, 80) : '');
    this.input.value = texto(estado.texto);
    this.filtroGrupo.value = texto(estado.grupo);
    if (this.filtroGrupo.selectedIndex < 0) this.filtroGrupo.value = '';
    this.filtroTier.value = texto(estado.tier);
    if (this.filtroTier.selectedIndex < 0) this.filtroTier.value = '';
    this.filtroActivos.checked = Boolean(estado.activos);
    const tandas = estado.tandas || {};
    this.secciones.resultados.tanda = Number.isInteger(tandas.resultados) ? tandas.resultados : 0;
    this.secciones.todos.tanda = Number.isInteger(tandas.todos) ? tandas.todos : 0;
    this._entradasAbiertas = new Set((estado.entradasAbiertas || []).filter((e) => typeof e === 'string'));
    this._cerradasAbiertas = Boolean(estado.cerradasAbiertas);
    const mapaAbierto = typeof estado.mapaAbierto === 'string' ? estado.mapaAbierto : null;
    return new Promise((resolver) => {
      this._restauracion = { mapaAbierto, resolver };
      // Si los datos ya llegaron, se aplica ahora; si no, al llegar.
      if (this.datos) this.refrescar();
    });
  }

  async abrirDetalle(nombre, { silencioso = false, desplazar = !silencioso } = {}) {
    if (this.controladorDetalle) this.controladorDetalle.abort();
    this.controladorDetalle = new AbortController();
    this.mapaAbierto = nombre;

    if (!silencioso) {
      this.detalle.replaceChildren(crear('div', 'estado', t('Consultando conexiones...')));
      mostrarSuave(this.detalle);
    }
    if (desplazar) {
      // La cabecera es fija y su alto cambia en móvil: se descuenta al desplazar.
      const cabecera = document.querySelector('.cabecera');
      const margen = (cabecera ? cabecera.getBoundingClientRect().height : 0) + 12;
      window.scrollTo({ top: this.detalle.getBoundingClientRect().top + window.scrollY - margen, behavior: 'smooth' });
    }

    try {
      const datos = await api.detalleTracking(nombre, this.controladorDetalle.signal);
      this._renderizarDetalle(datos);
      // Con el nombre oficial del mapa abierto, la barra de administración
      // ofrece "Borrar las de <mapa>".
      if (!silencioso) this._actualizarBarraAdmin(datos.mapa && datos.mapa.nombre);
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (!silencioso) {
        this.detalle.replaceChildren(
          this._crearCabeceraDetalle(nombre),
          crear('p', 'estado estado--error', error.message || t('No se pudo consultar ese mapa.'))
        );
      }
    }
  }

  cerrarDetalle() {
    if (this.controladorDetalle) this.controladorDetalle.abort();
    this.mapaAbierto = null;
    // Se pliega con suavidad (el contenido se sustituye al abrir otra).
    ocultarSuave(this.detalle);
    this._actualizarBarraAdmin(null);
  }

  /** Vuelve a pintar las rutas (y su barra) si lo mira un administrador. */
  _actualizarBarraAdmin(mapa) {
    if (mapa) this.mapaAbierto = mapa;
    if (this.datos && this.usuario && this.usuario.rol === 'ADMIN') this._renderizarRutas();
  }

  _crearCabeceraDetalle(nombre, insignias = []) {
    const cabecera = crear('header', 'caminos-detalle__cabecera');
    const titulo = crear('div');
    titulo.append(crear('h3', 'caminos-detalle__titulo', nombre));
    if (insignias.length) {
      const fila = crear('div', 'ventana__insignias');
      for (const texto of insignias) fila.append(crear('span', 'insignia', texto));
      titulo.append(fila);
    }

    const cerrar = crear('button', 'boton boton--icono', '✕');
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label', t('Cerrar detalle'));
    cerrar.addEventListener('click', () => this.cerrarDetalle());

    cabecera.append(titulo, cerrar);
    return cabecera;
  }

  _renderizarDetalle(datos) {
    const { mapa, conexiones, rutas = [] } = datos;
    const camino = mapa.camino;

    const insignias = [];
    const tier = camino ? camino.tier : mapa.tier;
    if (tier) insignias.push(`T${tier}`);
    if (camino) insignias.push(t(camino.etiqueta), camino.id);
    else if (mapa.clase === 'zonaNegra') insignias.push(t('Mapa de Zona Negra'));

    const partes = [this._crearCabeceraDetalle(mapa.nombre, insignias)];

    if (mapa.clase === 'zonaNegra' && this.abrirMapa) {
      const ver = crear('button', 'boton boton--pequeno', t('Ver mapa de Zona Negra'));
      ver.type = 'button';
      ver.addEventListener('click', () => this.abrirMapa(mapa.nombre));
      partes.push(ver);
    }

    if (datos.hideouts) partes.push(this._crearBloqueHideouts(mapa.nombre, datos.hideouts));
    if (rutas.length) partes.push(this._crearBloqueRutas(rutas, { resaltar: mapa.nombre }));

    const cuerpo = crear('div', 'caminos-detalle__cuerpo caminos-detalle__cuerpo--una');
    cuerpo.append(this._crearBloqueConexiones(conexiones));
    partes.push(cuerpo);
    // Los datos oficiales (dungeons y recursos), plegados al final: dejan
    // el espacio a lo importante (conexiones, rutas y gremios).
    if (camino) partes.push(this._crearDatosOficiales(camino));

    this.detalle.replaceChildren(...partes);
    // Si se estaba cerrando, la ficha vuelve (sin pelear con la animación).
    if (this.mapaAbierto) mostrarSuave(this.detalle);
  }

  /**
   * Camino de Avalon de hideouts: los gremios que tienen hideout allí,
   * anotados por los usuarios, y el formulario para anotar más.
   */
  _crearBloqueHideouts(camino, hideouts) {
    const bloque = crear('div', 'caminos-detalle__bloque hideouts-camino');
    bloque.append(crear('h4', null, t('Gremios con hideout en este camino')));

    if (!hideouts.length) {
      bloque.append(
        crear('p', 'caminos-detalle__vacio', t('Nadie ha anotado gremios en este camino todavía. Si llegaste aquí, anota los hideouts que veas.'))
      );
    } else {
      const lista = crear('ul', 'hideouts-camino__lista');
      for (const h of hideouts) {
        const item = crear('li', 'hideouts-camino__gremio');
        item.append(crear('strong', null, h.gremio));
        const fecha = new Date(`${String(h.confirmadoEn).replace(' ', 'T')}Z`);
        const partes = [];
        if (h.origen === 'excel') partes.push(t('del Excel del equipo'));
        else if (h.usuario) partes.push(t('anotado por {usuario}', { usuario: h.usuario }));
        if (!Number.isNaN(fecha.getTime())) partes.push(t('visto el {fecha}', { fecha: fecha.toLocaleDateString(regional) }));
        item.append(crear('span', 'hideouts-camino__meta', partes.join(' · ')));
        // Lo que ya está en el Excel solo se quita desde el Excel (el Excel manda).
        const puedeBorrar = this.usuario && !h.enExcel && (this.usuario.id === h.usuarioId || this.usuario.rol === 'ADMIN');
        if (puedeBorrar) {
          const borrar = crear('button', 'conexion__borrar', '✕');
          borrar.type = 'button';
          borrar.title = t('Borrar esta anotación');
          borrar.setAttribute('aria-label', t('Borrar esta anotación'));
          borrar.addEventListener('click', async () => {
            borrar.disabled = true;
            try {
              await api.borrarHideoutCamino(h.id);
              await retirarSuave(item);
              await this.refrescar();
            } catch (error) {
              borrar.disabled = false;
              borrar.title = error.message || t('No se pudo borrar.');
            }
          });
          item.append(borrar);
        }
        lista.append(item);
      }
      bloque.append(lista);
    }

    if (!this.usuario) {
      bloque.append(crear('p', 'caminos-detalle__vacio', t('Inicia sesión para anotar gremios.')));
      return bloque;
    }
    bloque.append(
      crear(
        'p',
        'hideouts-camino__nota',
        t('Lo que anotes queda guardado: la próxima ruta a este camino ya mostrará estos gremios, y se agrega al Excel del equipo.')
      )
    );
    const formulario = crear('form', 'hideouts-camino__formulario');
    // Mismo estilo que el buscador de caminos: caja con borde y entrada lisa.
    const caja = crear('div', 'panel-busqueda__caja hideouts-camino__caja');
    const entrada = crear('input', 'entrada-busqueda');
    entrada.type = 'text';
    entrada.maxLength = 40;
    entrada.minLength = 2;
    entrada.required = true;
    entrada.autocomplete = 'off';
    entrada.placeholder = t('Nombre del gremio');
    entrada.setAttribute('aria-label', t('Nombre del gremio'));
    const anotar = crear('button', 'boton boton--pequeno', t('Anotar'));
    anotar.type = 'submit';
    const mensaje = crear('p', 'hideouts-camino__mensaje');
    mensaje.setAttribute('aria-live', 'polite');
    caja.append(entrada);
    agregarBotonBorrar(entrada);
    formulario.append(caja, anotar, mensaje);
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      anotar.disabled = true;
      try {
        await api.anotarHideoutCamino(camino, entrada.value);
        await this.refrescar();
      } catch (error) {
        mensaje.textContent = error.message || t('No se pudo guardar.');
        anotar.disabled = false;
      }
    });
    bloque.append(formulario);
    return bloque;
  }

  _crearBloqueConexiones(conexiones) {
    const bloque = crear('div', 'caminos-detalle__bloque');
    bloque.append(crear('h4', null, t('Conexiones abiertas ahora')));

    if (!conexiones.length) {
      bloque.append(
        crear(
          'p',
          'caminos-detalle__vacio',
          t('No hay conexiones registradas en este momento. Si estás en este camino, registra sus portales desde una captura del juego con el panel "Registrar conexiones desde capturas".')
        )
      );
      return bloque;
    }

    const lista = crear('ul', 'lista-conexiones');
    for (const conexion of conexiones) lista.append(this._crearConexion(conexion));
    bloque.append(lista);
    return bloque;
  }

  _crearConexion(conexion) {
    const { hacia } = conexion;
    const item = crear('li', 'conexion');

    item.append(
      crear(
        'span',
        'conexion__sentido',
        conexion.sentido === 'salida' ? '→' : '←'
      )
    );
    item.lastChild.title = conexion.sentido === 'salida' ? t('Portal que sale de este mapa') : t('Portal que llega a este mapa');

    const destino = crear('span', 'conexion__destino');
    const nombre = hacia.nombre || t('Mapa desconocido');
    if (hacia.nombre) {
      // Toda la tarjeta lleva a la ficha de ese mapa: el nombre es el botón
      // y su ::after (CSS) cubre la tarjeta entera.
      item.classList.add('conexion--accionable');
      const enlace = crear('button', 'conexion__nombre', nombre);
      enlace.type = 'button';
      enlace.setAttribute('aria-label', t('Ver la ficha de {nombre}', { nombre }));
      enlace.addEventListener('click', () => this.abrirDetalle(hacia.nombre));
      destino.append(enlace);
    } else {
      destino.append(crear('span', 'conexion__nombre conexion__nombre--oculto', nombre));
    }
    const meta = [hacia.tier ? `T${hacia.tier}` : null, hacia.etiqueta && t(hacia.etiqueta)].filter(Boolean).join(' · ');
    if (meta) destino.append(crear('span', 'conexion__meta', meta));

    let tiempo;
    if (conexion.cierraEn) {
      tiempo = crearReloj(conexion.cierraEn, { clase: 'reloj conexion__tiempo' });
    } else {
      tiempo = crear('span', 'conexion__tiempo conexion__tiempo--desconocido', t('sin hora de cierre'));
    }

    item.append(destino, tiempo, this._crearFuente(conexion));
    // Sin botón "Ver mapa": la ficha de un mapa de Zona Negra ya lo ofrece.
    if (hacia.nombre) item.append(crear('span', 'conexion__ir'));
    return item;
  }

  /** Quién registró la conexión y, si es tuya (o eres admin), botón para borrarla. */
  _crearFuente(conexion) {
    const fuente = crearFuente(conexion);
    fuente.title = t('Registrada por un miembro desde una captura del juego');
    const puedeBorrar = this.usuario && (this.usuario.id === conexion.reportadoPorId || this.usuario.rol === 'ADMIN');
    if (puedeBorrar) {
      const borrar = crear('button', 'conexion__borrar', '✕');
      borrar.type = 'button';
      borrar.title = t('Borrar esta conexión');
      borrar.setAttribute('aria-label', t('Borrar esta conexión'));
      borrar.addEventListener('click', async () => {
        borrar.disabled = true;
        try {
          await api.borrarReporte(conexion.reporteId);
          await retirarSuave(borrar.closest('li') || fuente);
          await this.refrescar();
        } catch (error) {
          borrar.disabled = false;
          borrar.title = error.message || t('No se pudo borrar.');
        }
      });
      fuente.append(' ', borrar);
    }
    return fuente;
  }

  /**
   * Tarjeta desplegable "Datos oficiales del camino" (como las demás
   * secciones). Recuerda si se dejó abierta: la ficha se redibuja cada
   * minuto y al cambiar de camino, y no se cierra sola.
   */
  _crearDatosOficiales(camino) {
    const bloque = this._crearBloqueOficial(camino);
    const tituloViejo = bloque.querySelector('h4');
    if (tituloViejo) tituloViejo.remove();

    const tarjeta = crear('section', 'registro desplegable datos-oficiales');
    const encabezado = crear('h4', 'desplegable__encabezado');
    const boton = crear('button', 'desplegable__cabecera');
    boton.type = 'button';
    boton.setAttribute('aria-controls', 'datos-oficiales-cuerpo');
    const textos = crear('span', 'desplegable__textos');
    textos.append(
      crear('span', 'registro__titulo', t('Datos oficiales del camino')),
      crear('span', 'registro__subtitulo', t('Dungeons y recursos según los archivos del juego.'))
    );
    const flecha = crear('span', 'desplegable__flecha');
    flecha.setAttribute('aria-hidden', 'true');
    boton.append(textos, flecha);
    encabezado.append(boton);

    const cuerpo = crear('div', 'registro__cuerpo');
    cuerpo.id = 'datos-oficiales-cuerpo';
    cuerpo.append(bloque);
    tarjeta.append(encabezado, cuerpo);
    conectarDesplegable(boton, cuerpo, { clave: 'datos-oficiales-abiertos', abierto: false });
    return tarjeta;
  }

  _crearBloqueOficial(camino) {
    const bloque = crear('div', 'caminos-detalle__bloque');
    bloque.append(crear('h4', null, t('Datos oficiales del camino')));

    const d = camino.dungeons;
    const lineas = crear('dl', 'caminos-datos');
    const agregar = (termino, valor) => {
      lineas.append(crear('dt', null, termino), crear('dd', null, valor));
    };
    agregar(t('Dungeons'), t('{solo} solo · {grupo} grupo · {elite} élite', d));

    const porTipo = new Map();
    for (const r of camino.recursos) {
      if (!porTipo.has(r.tipo)) porTipo.set(r.tipo, []);
      porTipo.get(r.tipo).push(r);
    }
    for (const [tipo, recursos] of porTipo) {
      agregar(
        RECURSOS[tipo] || tipo,
        recursos
          .sort((a, b) => a.tier - b.tier)
          .map((r) => `T${r.tier} ×${r.cantidad}`)
          .join(' · ')
      );
    }

    bloque.append(lineas);
    return bloque;
  }

  // ----------------------------------------------------------------- rutas --

  /**
   * Lista general "Rutas del gremio", organizada para leerla rápido:
   *
   *  1. Un filtro por portal de ciudad (Lymhurst, Martlock...): cada ruta
   *     cuenta para el portal más cercano a uno de sus extremos.
   *  2. Dentro, las rutas se agrupan por mapa de entrada (el extremo más
   *     cercano al portal) en bloques plegables, de la entrada más cercana
   *     a la más lejana. El resumen de cada bloque ya dice a dónde llevan
   *     sus rutas; se despliega solo el que interesa.
   */
  _renderizarRutas() {
    const contenedor = document.getElementById('caminos-rutas');
    const todasAbiertas = (this.datos && this.datos.rutas) || [];
    const todasCerradas = (this.datos && this.datos.rutasCerradas) || [];
    const esAdmin = Boolean(this.usuario && this.usuario.rol === 'ADMIN');

    // Espacios privados (o abiertos) que aparecen en las rutas: filtro
    // "Todas / Públicas / <espacio>", recordado en este navegador.
    const espacios = new Map((this.espaciosUsuario || []).map((e) => [String(e.id), e]));
    for (const r of [...todasAbiertas, ...todasCerradas]) if (r.espacio) espacios.set(String(r.espacio.id), r.espacio);
    if (this._espacioElegido === undefined) {
      this._espacioElegido = null;
      try {
        this._espacioElegido = localStorage.getItem('rutas-espacio');
      } catch (error) {
        // Sin almacenamiento: se muestran todas.
      }
    }
    const espacioElegido = this._espacioElegido === 'publicas' || espacios.has(this._espacioElegido) ? this._espacioElegido : null;
    const pasa = (r) =>
      espacioElegido === null || (espacioElegido === 'publicas' ? !r.espacio : Boolean(r.espacio) && String(r.espacio.id) === espacioElegido);
    const rutas = todasAbiertas.filter(pasa);
    const cerradas = todasCerradas.filter(pasa);

    // Un administrador ve siempre el bloque, con su barra de borrado (y el
    // resultado de la última acción) aunque ya no quede ninguna ruta.
    // La tarjeta "Rutas del gremio" (su cuerpo se pliega aparte).
    this.rutasTarjeta.hidden = !todasAbiertas.length && !todasCerradas.length && !esAdmin && !espacios.size;
    this.rutasCantidad.textContent = `(${todasAbiertas.length})`;
    if (this.rutasTarjeta.hidden) {
      contenedor.replaceChildren();
      return;
    }

    // Las abiertas y las cerradas hace poco se agrupan igual, por el portal
    // de ciudad más cercano: el mismo filtro vale para las dos.
    const OTRAS = '';
    const agrupar = (lista) => {
      const mapa = new Map();
      for (const ruta of lista) {
        const portal = ruta.cercania ? ruta.cercania.portal : OTRAS;
        if (!mapa.has(portal)) mapa.set(portal, []);
        mapa.get(portal).push(ruta);
      }
      return mapa;
    };
    const porPortal = agrupar(rutas);
    const cerradasPorPortal = agrupar(cerradas);
    const orden = [...(this.datos.portales || []), OTRAS].filter((p) => porPortal.has(p) || cerradasPorPortal.has(p));

    if (this._portalElegido === undefined) {
      this._portalElegido = null;
      try {
        this._portalElegido = localStorage.getItem('rutas-portal');
      } catch (error) {
        // Sin almacenamiento (modo privado estricto): se muestran todas.
      }
    }
    const elegido = this._portalElegido !== null && orden.includes(this._portalElegido) ? this._portalElegido : null;

    const bloque = crear('div', 'caminos-detalle__bloque bloque-rutas');

    // Filtro por portal.
    const filtro = crear('div', 'rutas-portales');
    filtro.setAttribute('role', 'group');
    filtro.setAttribute('aria-label', t('Filtrar rutas por portal de ciudad'));
    const chip = (valor, texto, cantidad, cantidadCerradas) => {
      const boton = crear('button', 'rutas-portales__chip');
      boton.type = 'button';
      boton.setAttribute('aria-pressed', String(valor === elegido));
      boton.append(texto, ' ', crear('span', 'rutas-portales__cantidad', String(cantidad)));
      if (cantidadCerradas) {
        const extra = crear('span', 'rutas-portales__cerradas', `+${cantidadCerradas}`);
        extra.title = tn(cantidadCerradas, '{n} cerrada hace poco', '{n} cerradas hace poco');
        boton.append(' ', extra);
      }
      boton.addEventListener('click', () => {
        this._portalElegido = valor;
        try {
          if (valor === null) localStorage.removeItem('rutas-portal');
          else localStorage.setItem('rutas-portal', valor);
        } catch (error) {
          // Sin almacenamiento: el filtro vale hasta la próxima recarga.
        }
        this._renderizarRutas();
      });
      return boton;
    };
    const cuantas = (mapa, portal) => (mapa.get(portal) || []).length;
    filtro.append(chip(null, t('Todas'), rutas.length, cerradas.length));
    for (const portal of orden) {
      filtro.append(
        chip(
          portal,
          portal === OTRAS ? t('Otras') : portal.replace(/ Portal$/, ''),
          cuantas(porPortal, portal),
          cuantas(cerradasPorPortal, portal)
        )
      );
    }
    bloque.append(filtro);
    if (espacios.size) bloque.append(this._crearFiltroEspacios(espacios, espacioElegido, todasAbiertas));
    if (esAdmin) bloque.append(this._crearHerramientasAdmin(elegido));
    if (!rutas.length && !cerradas.length) {
      const enEspacio = espacioElegido && espacioElegido !== 'publicas' ? espacios.get(espacioElegido) : null;
      bloque.append(
        crear(
          'p',
          'caminos-detalle__vacio',
          enEspacio
            ? t('Todavía no hay rutas abiertas en «{espacio}». Regístralas eligiendo este espacio en «Guardar en».', { espacio: enEspacio.nombre })
            : t('No hay rutas registradas ahora.')
        )
      );
    }

    const portalesVisibles = elegido === null ? orden : [elegido];
    const tituloPortal = (portal) => (portal === OTRAS ? t('Lejos de los portales de ciudad') : portal);
    const cerradasVisibles = portalesVisibles.filter((p) => cerradasPorPortal.has(p));
    if (cerradasVisibles.length) {
      bloque.append(this._crearCerradas(cerradasVisibles.map((p) => [elegido === null ? tituloPortal(p) : null, cerradasPorPortal.get(p)])));
    }

    for (const portal of portalesVisibles) {
      if (!porPortal.has(portal)) continue;
      if (elegido === null) bloque.append(crear('h5', 'rutas-portal__titulo', tituloPortal(portal)));
      bloque.append(this._crearEntradas(porPortal.get(portal)));
    }
    if (elegido !== null && !porPortal.has(elegido)) {
      bloque.append(crear('p', 'caminos-detalle__vacio', t('No hay rutas abiertas cerca de este portal.')));
    }
    contenedor.replaceChildren(bloque);
  }

  /**
   * Borrado masivo de rutas, solo para administradores (el servidor lo
   * vuelve a comprobar). Cada acción pide confirmación.
   */
  _crearHerramientasAdmin(portalElegido) {
    const caja = crear('div', 'rutas-admin');
    caja.append(crear('span', 'rutas-admin__titulo', t('Administrar rutas:')));
    const mensaje = crear('span', 'rutas-admin__mensaje');
    mensaje.setAttribute('aria-live', 'polite');

    const borrar = async (alcance, valor, pregunta, boton) => {
      const ok = await confirmar({ titulo: t('¿Borrar rutas?'), mensaje: pregunta, aceptar: t('Borrar'), peligro: true });
      if (!ok) return;
      boton.disabled = true;
      try {
        const r = await api.borrarRutas(alcance, valor);
        // Se muestra en la barra que se pinta al refrescar.
        // Se ve unos segundos aunque la barra se vuelva a pintar.
        this._mensajeAdmin = { texto: t('Borradas: {rutas} rutas y {conexiones} conexiones.', r), hasta: Date.now() + 10_000 };
        await this.refrescar();
      } catch (error) {
        mensaje.textContent = error.message || t('No se pudo borrar.');
        boton.disabled = false;
      }
    };
    const accion = (texto, alcance, valor, pregunta) => {
      const boton = crear('button', 'boton boton--pequeno boton--peligro', texto);
      boton.type = 'button';
      boton.addEventListener('click', () => borrar(alcance, valor, pregunta, boton));
      return boton;
    };

    caja.append(
      accion(t('Borrar todas'), 'todas', '', t('¿Borrar TODAS las rutas y conexiones (abiertas, cerradas y sueltas)?')),
      accion(t('Borrar las abiertas'), 'activas', '', t('¿Borrar todas las rutas abiertas?'))
    );
    if (portalElegido) {
      caja.append(
        accion(
          t('Borrar las de {portal}', { portal: portalElegido.replace(/ Portal$/, '') }),
          'portal',
          portalElegido,
          t('¿Borrar todas las rutas cercanas a {portal}?', { portal: portalElegido })
        )
      );
    }

    // Por zona: las rutas que pasan por el mapa o camino abierto en la ficha
    // (el que se busca arriba). Sin ficha abierta, el botón no aparece.
    if (this.mapaAbierto) {
      caja.append(
        accion(
          t('Borrar las de {mapa}', { mapa: this.mapaAbierto }),
          'zona',
          this.mapaAbierto,
          t('¿Borrar todas las rutas que pasan por {zona}?', { zona: this.mapaAbierto })
        )
      );
    }
    caja.append(mensaje);
    if (this._mensajeAdmin && this._mensajeAdmin.hasta > Date.now()) {
      mensaje.textContent = this._mensajeAdmin.texto;
    }
    return caja;
  }

  /**
   * Rutas que cerraron hace menos de 30 minutos: se ven enteras (con el
   * portal cerrado y lo que quedó desconectado) para saber a dónde
   * llevaban y corregirlas antes de que se borren. Van agrupadas por el
   * portal de ciudad más cercano (y filtradas con el mismo filtro que las
   * abiertas), para ver rápido por dónde hay que salir.
   *
   * @param {Array<[string|null, object[]]>} grupos  [título del portal, rutas]
   */
  _crearCerradas(grupos) {
    const cerradas = grupos.flatMap(([, rutas]) => rutas);
    const detalles = crear('details', 'rutas-entrada rutas-cerradas');
    detalles.open = Boolean(this._cerradasAbiertas);
    detalles.addEventListener('toggle', () => {
      this._cerradasAbiertas = detalles.open;
    });
    const resumen = crear('summary', 'rutas-entrada__resumen');
    const cabeza = crear('span', 'rutas-entrada__cabeza');
    cabeza.append(
      crear('strong', null, t('Cerradas hace poco')),
      crear('span', 'rutas-entrada__cercania', t('Se ven 30 minutos después de cerrar un portal, para corregirlas.')),
      crear('span', 'rutas-entrada__cantidad', tn(cerradas.length, '{n} ruta', '{n} rutas'))
    );
    resumen.append(cabeza);
    detalles.append(resumen);

    const contenido = crear('div', 'rutas-cerradas__grupos');
    for (const [titulo, rutas] of grupos) {
      if (titulo) contenido.append(crear('h5', 'rutas-portal__titulo', titulo));
      const tarjetas = crear('div', 'lista-rutas');
      for (const ruta of rutas) tarjetas.append(this._tarjetaRuta(ruta));
      contenido.append(tarjetas);
    }
    detalles.append(contenido);
    return detalles;
  }

  /** Rutas de un portal agrupadas por su mapa de entrada, en bloques plegables. */
  _crearEntradas(rutas) {
    const porEntrada = new Map();
    for (const ruta of rutas) {
      const desde = ruta.zonas[0].nombre;
      if (!porEntrada.has(desde)) porEntrada.set(desde, []);
      porEntrada.get(desde).push(ruta);
    }

    // Los bloques abiertos siguen abiertos cuando la lista se refresca.
    if (!this._entradasAbiertas) this._entradasAbiertas = new Set();
    const lista = crear('div', 'rutas-entradas');
    for (const [desde, grupo] of porEntrada) {
      const detalles = crear('details', 'rutas-entrada');
      detalles.open = this._entradasAbiertas.has(desde);
      detalles.addEventListener('toggle', () => {
        if (detalles.open) this._entradasAbiertas.add(desde);
        else this._entradasAbiertas.delete(desde);
      });
      const resumen = crear('summary', 'rutas-entrada__resumen');
      const cabeza = crear('span', 'rutas-entrada__cabeza');
      cabeza.append(crear('strong', null, desde));
      const cercania = grupo[0].cercania;
      if (cercania) cabeza.append(crear('span', 'rutas-entrada__cercania', textoCercania(cercania)));
      cabeza.append(crear('span', 'rutas-entrada__cantidad', tn(grupo.length, '{n} ruta', '{n} rutas')));

      // A dónde lleva cada ruta y cuánto le queda, sin desplegar.
      const destinos = crear('span', 'rutas-entrada__destinos');
      for (const ruta of grupo) {
        const destino = crear('span', 'rutas-entrada__destino');
        destino.append(`→ ${ruta.zonas[ruta.zonas.length - 1].nombre} `, crearReloj(ruta.cierraEn, { prefijo: '' }));
        destinos.append(destino);
      }
      resumen.append(cabeza, destinos);
      detalles.append(resumen);

      const tarjetas = crear('div', 'lista-rutas');
      for (const ruta of grupo) tarjetas.append(this._tarjetaRuta(ruta));
      detalles.append(tarjetas);
      lista.append(detalles);
    }
    return lista;
  }

  _tarjetaRuta(ruta, resaltar = null) {
    return crearTarjetaRuta(ruta, {
      usuario: this.usuario,
      resaltar,
      alElegirZona: (nombre) => this.abrirDetalle(nombre),
      alBorrar: async (r, retirar) => {
        await api.borrarRuta(r.id);
        await retirar();
        await this.refrescar();
      },
      // Además de la ruta, su conjunto: para editarlo desde la raíz.
      alEditar: this.alEditarRuta ? (r) => this.alEditarRuta(r, this.conjuntoDe(r)) : null,
    });
  }

  /**
   * El conjunto de una ruta: las rutas de su misma red (comparten alguna
   * conexión, directa o indirectamente), del mismo sitio (público o el
   * mismo espacio) y que este usuario puede editar. Es lo que se edita
   * "desde la raíz", como cuando se registraron juntas.
   */
  /** Una ruta de las que se ven ahora (abierta o cerrada hace poco), por su id. */
  rutaPorId(id) {
    const todas = [...((this.datos && this.datos.rutas) || []), ...((this.datos && this.datos.rutasCerradas) || [])];
    return todas.find((r) => r.id === id) || null;
  }

  conjuntoDe(ruta) {
    const todas = [...((this.datos && this.datos.rutas) || []), ...((this.datos && this.datos.rutasCerradas) || [])];
    const espacioDe = (r) => (r.espacio ? r.espacio.id : null);
    const editable = (r) => this.usuario && (this.usuario.id === r.reportadoPorId || this.usuario.rol === 'ADMIN');
    const candidatas = todas.filter((r) => espacioDe(r) === espacioDe(ruta) && editable(r));
    const conjunto = new Map([[ruta.id, ruta]]);
    const conexiones = new Set(ruta.tramos.map((t) => t.reporteId));
    let crecio = true;
    while (crecio) {
      crecio = false;
      for (const r of candidatas) {
        if (conjunto.has(r.id) || !r.tramos.some((t) => conexiones.has(t.reporteId))) continue;
        conjunto.set(r.id, r);
        for (const t of r.tramos) conexiones.add(t.reporteId);
        crecio = true;
      }
    }
    return [...conjunto.values()];
  }

  /** Chips "Todas / Públicas / 🔒 espacio" sobre la lista de rutas. */
  _crearFiltroEspacios(espacios, elegido, abiertas) {
    const filtro = crear('div', 'rutas-portales rutas-espacios');
    filtro.setAttribute('role', 'group');
    filtro.setAttribute('aria-label', t('Filtrar rutas por espacio'));
    const cuantas = (pasa) => abiertas.filter(pasa).length;
    const chip = (valor, texto, cantidad) => {
      const boton = crear('button', 'rutas-portales__chip');
      boton.type = 'button';
      boton.setAttribute('aria-pressed', String(valor === elegido));
      boton.append(texto, ' ', crear('span', 'rutas-portales__cantidad', String(cantidad)));
      boton.addEventListener('click', () => {
        this._espacioElegido = valor;
        try {
          if (valor === null) localStorage.removeItem('rutas-espacio');
          else localStorage.setItem('rutas-espacio', valor);
        } catch (error) {
          // Sin almacenamiento: el filtro vale hasta la próxima recarga.
        }
        this._renderizarRutas();
      });
      return boton;
    };
    filtro.append(
      chip(null, t('Todos los espacios'), abiertas.length),
      chip('publicas', t('Públicas'), cuantas((r) => !r.espacio))
    );
    for (const [id, espacio] of espacios) {
      filtro.append(chip(id, `${espacio.publico ? '👥' : '🔒'} ${espacio.nombre}`, cuantas((r) => r.espacio && String(r.espacio.id) === id)));
    }
    return filtro;
  }

  _crearBloqueRutas(rutas, { titulo = t('Rutas que pasan por aquí'), resaltar = null } = {}) {
    const bloque = crear('div', 'caminos-detalle__bloque bloque-rutas');
    bloque.append(crear('h4', null, `${titulo} (${rutas.length})`));
    const lista = crear('div', 'lista-rutas');
    for (const ruta of rutas) lista.append(this._tarjetaRuta(ruta, resaltar));
    bloque.append(lista);
    return bloque;
  }
}

export default PanelCaminos;
