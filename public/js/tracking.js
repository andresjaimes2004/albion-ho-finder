'use strict';

import api from './api.js';

/**
 * tracking.js
 * ----------------------------------------------------------------------
 * Sección "Caminos de Avalon": catálogo oficial de caminos, filtrable, y
 * las conexiones vigentes de cada uno con cuenta regresiva hasta su
 * cierre.
 *
 *  - Mientras la sección está visible, el resumen se refresca cada 60 s
 *    (el servidor ya cachea la fuente externa, así que es barato).
 *  - Las cuentas regresivas se actualizan cada segundo en el navegador,
 *    sin pedir nada al servidor.
 *  - Todo el texto se inserta con textContent: los nombres vienen de una
 *    fuente externa y nunca se interpretan como HTML.
 * ----------------------------------------------------------------------
 */

const INTERVALO_REFRESCO_MS = 60_000;
const POR_PAGINA = 60;

const RECURSOS = {
  ORE: 'Mineral',
  WOOD: 'Madera',
  FIBER: 'Fibra',
  HIDE: 'Piel',
  ROCK: 'Piedra',
};

function normalizar(texto) {
  return String(texto || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined && texto !== null) el.textContent = texto;
  return el;
}

/** "2h 13m", "12m 05s", "cerrada". */
function formatearRestante(ms) {
  if (ms <= 0) return 'cerrada';
  const total = Math.floor(ms / 1000);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  if (horas > 0) return `${horas}h ${String(minutos).padStart(2, '0')}m`;
  return `${minutos}m ${String(segundos).padStart(2, '0')}s`;
}

function haceCuanto(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const minutos = Math.round(ms / 60_000);
  if (minutos < 1) return 'hace menos de un minuto';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

export class PanelCaminos {
  constructor({ abrirMapa }) {
    this.abrirMapa = abrirMapa;

    this.input = document.getElementById('input-camino');
    this.sugerencias = document.getElementById('caminos-sugerencias');
    this.filtroGrupo = document.getElementById('caminos-grupo');
    this.filtroTier = document.getElementById('caminos-tier');
    this.filtroActivos = document.getElementById('caminos-activos');
    this.estadoFuente = document.getElementById('caminos-estado');
    this.cargando = document.getElementById('caminos-cargando');
    this.error = document.getElementById('caminos-error');
    this.resumen = document.getElementById('caminos-resumen');
    this.lista = document.getElementById('caminos-lista');
    this.botonMas = document.getElementById('caminos-mas');
    this.detalle = document.getElementById('caminos-detalle');

    this.datos = null;
    this.visibles = POR_PAGINA;
    this.mapaAbierto = null;
    this.controladorDetalle = null;
    this.temporizadorRefresco = null;
    this.temporizadorReloj = null;
    this.activo = false;

    this._bindEventos();
  }

  _bindEventos() {
    let espera = null;
    this.input.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(() => this._reiniciarLista(), 200);
    });
    // Elegir una sugerencia exacta abre el detalle directamente.
    this.input.addEventListener('change', () => {
      const entrada = this._buscarEntrada(this.input.value);
      if (entrada) this.abrirDetalle(entrada.nombre);
    });
    this.input.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Enter') return;
      const primera = this._entradasFiltradas()[0];
      if (primera) this.abrirDetalle(primera.nombre);
    });

    for (const filtro of [this.filtroGrupo, this.filtroTier, this.filtroActivos]) {
      filtro.addEventListener('change', () => this._reiniciarLista());
    }

    this.botonMas.addEventListener('click', () => {
      this.visibles += POR_PAGINA;
      this._renderizarLista();
    });

    document.addEventListener('visibilitychange', () => {
      if (this.activo && !document.hidden) this.refrescar();
    });
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
    this.temporizadorReloj = setInterval(() => this._actualizarRelojes(), 1000);
  }

  /** Se llama al ocultar la sección: no se consulta nada en segundo plano. */
  desactivar() {
    this.activo = false;
    clearInterval(this.temporizadorRefresco);
    clearInterval(this.temporizadorReloj);
  }

  async refrescar() {
    try {
      this.datos = await api.tracking();
      this.error.hidden = true;
      this._renderizarEstado();
      this._renderizarSugerencias();
      this._renderizarLista();
      if (this.mapaAbierto) this.abrirDetalle(this.mapaAbierto, { silencioso: true });
    } catch (error) {
      if (!this.datos) {
        this.error.textContent = error.message || 'No se pudieron cargar los caminos de Avalon.';
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
    const grupo = this.filtroGrupo.value;
    const tier = this.filtroTier.value ? Number(this.filtroTier.value) : null;
    const soloActivos = this.filtroActivos.checked;

    return this._entradas()
      .filter((e) => {
        if (texto && !normalizar(e.nombre).includes(texto)) return false;
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

    const partes = [];
    if (estado.error) {
      this.estadoFuente.classList.add('caminos-estado--error');
      partes.push(estado.error);
    } else {
      partes.push(`${estado.activas} conexi${estado.activas === 1 ? 'ón activa' : 'ones activas'}`);
    }

    if (estado.actualizadoEn) {
      const antiguedadMs = Date.now() - Date.parse(estado.actualizadoEn);
      if (!estado.error && antiguedadMs > 60 * 60_000) {
        this.estadoFuente.classList.add('caminos-estado--viejo');
      }
      partes.push(`fuente actualizada ${haceCuanto(estado.actualizadoEn)}`);
    }

    this.estadoFuente.append(crear('span', 'caminos-estado__punto'), partes.join(' · '));
    this.estadoFuente.title = `Consultado a ${estado.fuente} ${haceCuanto(estado.consultadoEn) || ''}`.trim();
  }

  _renderizarSugerencias() {
    const opciones = this._entradas().map((e) => {
      const opcion = document.createElement('option');
      opcion.value = e.nombre;
      return opcion;
    });
    this.sugerencias.replaceChildren(...opciones);
  }

  _reiniciarLista() {
    this.visibles = POR_PAGINA;
    this._renderizarLista();
  }

  _renderizarLista() {
    if (!this.datos) return;
    const filtradas = this._entradasFiltradas();
    const conConexiones = filtradas.filter((e) => e.conexiones > 0).length;

    this.resumen.hidden = false;
    this.resumen.replaceChildren(
      this._crearDato(filtradas.length, filtradas.length === 1 ? 'mapa' : 'mapas'),
      this._crearDato(conConexiones, 'con conexiones abiertas')
    );

    this.lista.replaceChildren(...filtradas.slice(0, this.visibles).map((e) => this._crearTarjeta(e)));
    if (!filtradas.length) {
      this.lista.appendChild(crear('p', 'estado estado--advertencia', 'Ningún camino coincide con la búsqueda.'));
    }
    this.botonMas.hidden = filtradas.length <= this.visibles;
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
    tarjeta.setAttribute('aria-label', `Ver conexiones de ${entrada.nombre}`);

    const cabeza = crear('span', 'tarjeta-camino__cabeza');
    cabeza.append(crear('span', 'tarjeta-camino__nombre', entrada.nombre));
    cabeza.append(
      crear(
        'span',
        `tarjeta-camino__conexiones${entrada.conexiones ? ' tarjeta-camino__conexiones--si' : ''}`,
        entrada.conexiones ? `${entrada.conexiones} conexi${entrada.conexiones === 1 ? 'ón' : 'ones'}` : 'sin conexiones'
      )
    );

    const meta = [];
    if (entrada.tier) meta.push(`T${entrada.tier}`);
    if (entrada.etiqueta) meta.push(entrada.etiqueta);
    if (entrada.dungeons) {
      const d = entrada.dungeons;
      const total = d.solo + d.grupo + d.elite;
      if (total) meta.push(`${total} dungeon${total === 1 ? '' : 's'}`);
    }
    if (entrada.recursos && entrada.recursos.length) {
      meta.push(entrada.recursos.map((r) => RECURSOS[r] || r).join(', '));
    }

    tarjeta.append(cabeza, crear('span', 'tarjeta-camino__meta', meta.join(' · ')));
    tarjeta.addEventListener('click', () => this.abrirDetalle(entrada.nombre));
    return tarjeta;
  }

  // --------------------------------------------------------------- detalle --

  async abrirDetalle(nombre, { silencioso = false } = {}) {
    if (this.controladorDetalle) this.controladorDetalle.abort();
    this.controladorDetalle = new AbortController();
    this.mapaAbierto = nombre;

    if (!silencioso) {
      this.detalle.hidden = false;
      this.detalle.replaceChildren(crear('div', 'estado', 'Consultando conexiones...'));
      // La cabecera es fija y su alto cambia en móvil: se descuenta al desplazar.
      const cabecera = document.querySelector('.cabecera');
      const margen = (cabecera ? cabecera.getBoundingClientRect().height : 0) + 12;
      window.scrollTo({ top: this.detalle.getBoundingClientRect().top + window.scrollY - margen, behavior: 'smooth' });
    }

    try {
      const datos = await api.detalleTracking(nombre, this.controladorDetalle.signal);
      this._renderizarDetalle(datos);
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (!silencioso) {
        this.detalle.replaceChildren(
          this._crearCabeceraDetalle(nombre),
          crear('p', 'estado estado--error', error.message || 'No se pudo consultar ese mapa.')
        );
      }
    }
  }

  cerrarDetalle() {
    if (this.controladorDetalle) this.controladorDetalle.abort();
    this.mapaAbierto = null;
    this.detalle.hidden = true;
    this.detalle.replaceChildren();
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
    cerrar.setAttribute('aria-label', 'Cerrar detalle');
    cerrar.addEventListener('click', () => this.cerrarDetalle());

    cabecera.append(titulo, cerrar);
    return cabecera;
  }

  _renderizarDetalle(datos) {
    const { mapa, conexiones } = datos;
    const camino = mapa.camino;

    const insignias = [];
    const tier = camino ? camino.tier : mapa.tier;
    if (tier) insignias.push(`T${tier}`);
    if (camino) insignias.push(camino.etiqueta, camino.id);
    else if (mapa.clase === 'zonaNegra') insignias.push('Mapa de Zona Negra');

    const partes = [this._crearCabeceraDetalle(mapa.nombre, insignias)];

    if (mapa.clase === 'zonaNegra' && this.abrirMapa) {
      const ver = crear('button', 'boton boton--pequeno', 'Ver mapa de Zona Negra');
      ver.type = 'button';
      ver.addEventListener('click', () => this.abrirMapa(mapa.nombre));
      partes.push(ver);
    }

    const cuerpo = crear('div', 'caminos-detalle__cuerpo');
    cuerpo.append(this._crearBloqueConexiones(conexiones));
    if (camino) cuerpo.append(this._crearBloqueOficial(camino));
    partes.push(cuerpo);

    this.detalle.hidden = false;
    this.detalle.replaceChildren(...partes);
  }

  _crearBloqueConexiones(conexiones) {
    const bloque = crear('div', 'caminos-detalle__bloque');
    bloque.append(crear('h4', null, 'Conexiones abiertas ahora'));

    if (!conexiones.length) {
      bloque.append(
        crear(
          'p',
          'caminos-detalle__vacio',
          'No hay conexiones reportadas en este momento. Aparecen cuando alguien de la comunidad escanea el camino con la herramienta de smugden.'
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
    item.lastChild.title = conexion.sentido === 'salida' ? 'Portal que sale de este mapa' : 'Portal que llega a este mapa';

    const destino = crear('span', 'conexion__destino');
    const nombre = hacia.nombre || (hacia.idCluster ? `Mapa ${hacia.idCluster}` : 'Mapa desconocido');
    if (hacia.nombre) {
      const enlace = crear('button', 'conexion__nombre', nombre);
      enlace.type = 'button';
      enlace.addEventListener('click', () => this.abrirDetalle(hacia.nombre));
      destino.append(enlace);
    } else {
      destino.append(crear('span', 'conexion__nombre conexion__nombre--oculto', nombre));
    }
    const meta = [hacia.tier ? `T${hacia.tier}` : null, hacia.etiqueta].filter(Boolean).join(' · ');
    if (meta) destino.append(crear('span', 'conexion__meta', meta));

    const tiempo = crear('span', 'conexion__tiempo');
    if (conexion.cierraEn) {
      tiempo.dataset.cierra = String(conexion.cierraEn);
      tiempo.title = `Cierra a las ${new Date(conexion.cierraEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      this._pintarReloj(tiempo, Date.now());
    } else {
      tiempo.textContent = 'sin hora de cierre';
      tiempo.classList.add('conexion__tiempo--desconocido');
    }

    item.append(destino, tiempo);

    if (hacia.clase === 'zonaNegra' && this.abrirMapa) {
      const ver = crear('button', 'boton boton--pequeno boton--sutil', 'Ver mapa');
      ver.type = 'button';
      ver.addEventListener('click', () => this.abrirMapa(hacia.nombre));
      item.append(ver);
    }
    return item;
  }

  _crearBloqueOficial(camino) {
    const bloque = crear('div', 'caminos-detalle__bloque');
    bloque.append(crear('h4', null, 'Datos oficiales del camino'));

    const d = camino.dungeons;
    const lineas = crear('dl', 'caminos-datos');
    const agregar = (termino, valor) => {
      lineas.append(crear('dt', null, termino), crear('dd', null, valor));
    };
    agregar('Dungeons', `${d.solo} solo · ${d.grupo} grupo · ${d.elite} élite`);

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

  // --------------------------------------------------------------- relojes --

  _actualizarRelojes() {
    const ahora = Date.now();
    for (const el of this.detalle.querySelectorAll('[data-cierra]')) this._pintarReloj(el, ahora);
  }

  _pintarReloj(el, ahora) {
    const restante = Number(el.dataset.cierra) - ahora;
    el.textContent = restante > 0 ? `cierra en ${formatearRestante(restante)}` : 'cerrada';
    el.classList.toggle('conexion__tiempo--urgente', restante > 0 && restante < 30 * 60_000);
    el.classList.toggle('conexion__tiempo--pronto', restante >= 30 * 60_000 && restante < 60 * 60_000);
    el.classList.toggle('conexion__tiempo--cerrada', restante <= 0);
  }
}

export default PanelCaminos;
