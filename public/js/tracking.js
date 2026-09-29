'use strict';

import api from './api.js';
import { crear, crearReloj, crearTarjetaRuta, textoCercania } from './rutas.js';
import { t, tn, regional } from './i18n.js';

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
const POR_PAGINA = 60;

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


export class PanelCaminos {
  constructor({ abrirMapa, alActualizar = null, alEditarRuta = null }) {
    this.abrirMapa = abrirMapa;
    this.alEditarRuta = alEditarRuta;
    // Avisa de cada resumen nuevo (el panel de registro usa sus conexiones).
    this.alActualizar = alActualizar;

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
      if (this.mapaAbierto) this.abrirDetalle(this.mapaAbierto, { silencioso: true });
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

    const partes = [tn(estado.activas, '{n} conexión activa', '{n} conexiones activas')];
    if (estado.rutas) partes.push(tn(estado.rutas, '{n} ruta', '{n} rutas'));
    if (!estado.activas) this.estadoFuente.classList.add('caminos-estado--vacio');

    this.estadoFuente.append(crear('span', 'caminos-estado__punto'), partes.join(' · '));
    this.estadoFuente.title = t('Conexiones registradas por los usuarios desde capturas del juego');
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
      this._crearDato(filtradas.length, filtradas.length === 1 ? t('mapa') : t('mapas')),
      this._crearDato(conConexiones, t('con conexiones abiertas'))
    );

    this.lista.replaceChildren(...filtradas.slice(0, this.visibles).map((e) => this._crearTarjeta(e)));
    if (!filtradas.length) {
      this.lista.appendChild(crear('p', 'estado estado--advertencia', t('Ningún camino coincide con la búsqueda.')));
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
      this.detalle.replaceChildren(crear('div', 'estado', t('Consultando conexiones...')));
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
          crear('p', 'estado estado--error', error.message || t('No se pudo consultar ese mapa.'))
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

    const cuerpo = crear('div', 'caminos-detalle__cuerpo');
    cuerpo.append(this._crearBloqueConexiones(conexiones));
    if (camino) cuerpo.append(this._crearBloqueOficial(camino));
    partes.push(cuerpo);

    this.detalle.hidden = false;
    this.detalle.replaceChildren(...partes);
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
        if (h.usuario) partes.push(t('anotado por {usuario}', { usuario: h.usuario }));
        if (!Number.isNaN(fecha.getTime())) partes.push(t('visto el {fecha}', { fecha: fecha.toLocaleDateString(regional) }));
        item.append(crear('span', 'hideouts-camino__meta', partes.join(' · ')));
        const puedeBorrar = this.usuario && (this.usuario.id === h.usuarioId || this.usuario.rol === 'ADMIN');
        if (puedeBorrar) {
          const borrar = crear('button', 'conexion__borrar', '✕');
          borrar.type = 'button';
          borrar.title = t('Borrar esta anotación');
          borrar.setAttribute('aria-label', t('Borrar esta anotación'));
          borrar.addEventListener('click', async () => {
            borrar.disabled = true;
            try {
              await api.borrarHideoutCamino(h.id);
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
    const formulario = crear('form', 'hideouts-camino__formulario');
    const entrada = crear('input');
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
    formulario.append(entrada, anotar, mensaje);
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
      const enlace = crear('button', 'conexion__nombre', nombre);
      enlace.type = 'button';
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

    if (hacia.clase === 'zonaNegra' && this.abrirMapa) {
      const ver = crear('button', 'boton boton--pequeno boton--sutil', t('Ver mapa'));
      ver.type = 'button';
      ver.addEventListener('click', () => this.abrirMapa(hacia.nombre));
      item.append(ver);
    }
    return item;
  }

  /** Quién registró la conexión y, si es tuya (o eres admin), botón para borrarla. */
  _crearFuente(conexion) {
    const fuente = crear('span', 'conexion__fuente conexion__fuente--gremio');
    fuente.textContent = conexion.reportadoPor ? t('gremio · {usuario}', { usuario: conexion.reportadoPor }) : t('gremio');
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
    const rutas = (this.datos && this.datos.rutas) || [];
    const cerradas = (this.datos && this.datos.rutasCerradas) || [];
    contenedor.hidden = !rutas.length && !cerradas.length;
    if (contenedor.hidden) {
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
    bloque.append(crear('h4', null, `${t('Rutas del gremio')} (${rutas.length})`));

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
    if (this.usuario && this.usuario.rol === 'ADMIN') bloque.append(this._crearHerramientasAdmin(elegido));

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
      if (!window.confirm(pregunta)) return;
      boton.disabled = true;
      try {
        const r = await api.borrarRutas(alcance, valor);
        await this.refrescar();
        this._mensajeAdmin = t('Borradas: {rutas} rutas y {conexiones} conexiones.', r);
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

    // Por zona: todas las rutas que pasan por un mapa o camino.
    const formulario = crear('form', 'rutas-admin__zona');
    const zona = crear('input');
    zona.type = 'text';
    zona.maxLength = 80;
    zona.required = true;
    zona.setAttribute('list', 'caminos-sugerencias');
    zona.placeholder = t('Mapa o camino (ej. Sandrift Coast)');
    zona.setAttribute('aria-label', t('Mapa o camino cuyas rutas se borran'));
    const botonZona = crear('button', 'boton boton--pequeno boton--peligro', t('Borrar las de este mapa'));
    botonZona.type = 'submit';
    formulario.append(zona, botonZona);
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const valor = zona.value.trim();
      if (valor) borrar('zona', valor, t('¿Borrar todas las rutas que pasan por {zona}?', { zona: valor }), botonZona);
    });
    caja.append(formulario, mensaje);
    if (this._mensajeAdmin) {
      mensaje.textContent = this._mensajeAdmin;
      this._mensajeAdmin = null;
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
      alBorrar: async (r) => {
        await api.borrarRuta(r.id);
        await this.refrescar();
      },
      alEditar: this.alEditarRuta,
    });
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
