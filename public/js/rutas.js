'use strict';

/**
 * rutas.js
 * ----------------------------------------------------------------------
 * Piezas de interfaz compartidas por la pestaña de caminos y la de
 * hideouts:
 *
 *  - Relojes de cierre: cualquier elemento con `data-cierra` (ms epoch)
 *    muestra "cierra en 1h 05m" y cambia de color al acercarse el cierre.
 *    Un único intervalo global los actualiza cada segundo.
 *  - Tarjeta de ruta: zonas en orden con el tiempo de cada tramo.
 *
 * Todo el texto se inserta con textContent.
 * ----------------------------------------------------------------------
 */

import { t, tn, regional } from './i18n.js';

export function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined && texto !== null) el.textContent = texto;
  return el;
}

/** "2h 13m", "12m 05s". */
export function formatearRestante(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  if (horas > 0) return `${horas}h ${String(minutos).padStart(2, '0')}m`;
  return `${minutos}m ${String(segundos).padStart(2, '0')}s`;
}

// ------------------------------------------------------------ relojes --

export function pintarReloj(el, ahora = Date.now()) {
  const restante = Number(el.dataset.cierra) - ahora;
  const prefijo = el.dataset.prefijo === undefined ? t('cierra en ') : el.dataset.prefijo;
  el.textContent = restante > 0 ? `${prefijo}${formatearRestante(restante)}` : t('cerrada');
  el.classList.toggle('reloj--urgente', restante > 0 && restante < 30 * 60_000);
  el.classList.toggle('reloj--pronto', restante >= 30 * 60_000 && restante < 60 * 60_000);
  el.classList.toggle('reloj--cerrado', restante <= 0);
}

/** Elemento con cuenta regresiva hasta `cierraEn`. */
export function crearReloj(cierraEn, { clase = 'reloj', prefijo } = {}) {
  const el = crear('span', clase);
  el.dataset.cierra = String(cierraEn);
  if (prefijo !== undefined) el.dataset.prefijo = prefijo;
  el.title = t('Cierra a las {hora}', { hora: new Date(cierraEn).toLocaleTimeString(regional, { hour: '2-digit', minute: '2-digit' }) });
  pintarReloj(el);
  return el;
}

let intervalo = null;

/** Arranca (una sola vez) el intervalo que actualiza todos los relojes visibles. */
export function iniciarRelojes() {
  if (intervalo) return;
  intervalo = setInterval(() => {
    if (document.hidden) return;
    const ahora = Date.now();
    for (const el of document.querySelectorAll('[data-cierra]')) pintarReloj(el, ahora);
  }, 1000);
}

// -------------------------------------------------------------- rutas --

/** "a 2 mapas de Lymhurst Portal", "en Lymhurst Portal". */
export function textoCercania({ portal, saltos }) {
  if (!saltos) return t('en {portal}', { portal });
  return tn(saltos, 'a {n} mapa de {portal}', 'a {n} mapas de {portal}', { portal });
}

/**
 * Quién registró una ruta o conexión y, si es de un espacio, cuál: un
 * candado si es privado (solo lo ven sus miembros) o un grupo si sus
 * conexiones las ven todos.
 */
export function crearFuente(item) {
  const fuente = crear('span', 'conexion__fuente conexion__fuente--gremio');
  if (item.espacio) {
    const abierto = item.espacio.publico;
    const insignia = crear('span', `insignia-espacio${abierto ? ' insignia-espacio--abierto' : ''}`, `${abierto ? '👥' : '🔒'} ${item.espacio.nombre}`);
    insignia.title = abierto
      ? t('Espacio {nombre}: sus conexiones las ven todos', { nombre: item.espacio.nombre })
      : t('Espacio privado {nombre}: solo lo ven sus miembros', { nombre: item.espacio.nombre });
    fuente.append(insignia, ' ');
  }
  if (item.reportadoPor) fuente.append(t('por {usuario}', { usuario: item.reportadoPor }));
  return fuente;
}

/**
 * Tarjeta de una ruta del gremio.
 * @param {object} ruta  { id, zonas:[{nombre, etiqueta, tier, clase}], tramos:[{cierraEn}], cierraEn, reportadoPor, reportadoPorId }
 * @param {object} opciones
 *   - usuario: sesión actual (para mostrar el botón de borrar)
 *   - resaltar: nombre de zona a destacar (p. ej. el mapa del hideout)
 *   - alElegirZona(nombre): al tocar una zona
 *   - alBorrar(ruta): al borrar (autor o admin)
 *   - alEditar(ruta): al pulsar "Editar" (autor o admin)
 */
export function crearTarjetaRuta(ruta, { usuario = null, resaltar = null, alElegirZona = null, alBorrar = null, alEditar = null } = {}) {
  // Ruta que cerró hace poco: sus tramos traen estado (abierto, cerrado,
  // desconectado) y se ve hasta `borraEn`.
  const cerrada = Boolean(ruta.borraEn);
  const tarjeta = crear('article', cerrada ? 'ruta ruta--cerrada' : 'ruta');

  const cabecera = crear('div', 'ruta__cabecera');
  const tramos = ruta.tramos.length;
  cabecera.append(
    crear('span', 'ruta__titulo', `${ruta.zonas[0].nombre} → ${ruta.zonas[ruta.zonas.length - 1].nombre}`),
    crear('span', 'ruta__tramos', tn(tramos, '{n} tramo', '{n} tramos'))
  );
  if (cerrada) {
    cabecera.append(
      crear('span', 'insignia ruta__insignia-cerrada', t('Cerrada')),
      crearReloj(ruta.borraEn, { clase: 'reloj ruta__cierre', prefijo: t('se borra en ') })
    );
  } else {
    cabecera.append(crearReloj(ruta.cierraEn, { clase: 'reloj ruta__cierre' }));
  }

  const fuente = crearFuente(ruta);
  const puedeBorrar = alBorrar && usuario && (usuario.id === ruta.reportadoPorId || usuario.rol === 'ADMIN');
  if (puedeBorrar) {
    const borrar = crear('button', 'conexion__borrar', '✕');
    borrar.type = 'button';
    borrar.title = t('Borrar esta ruta');
    borrar.setAttribute('aria-label', t('Borrar esta ruta'));
    borrar.addEventListener('click', async () => {
      borrar.disabled = true;
      try {
        await alBorrar(ruta);
      } catch (error) {
        borrar.disabled = false;
        borrar.title = error.message || t('No se pudo borrar.');
      }
    });
    fuente.append(' ', borrar);
  }
  cabecera.append(fuente);
  const esSuya = usuario && (usuario.id === ruta.reportadoPorId || usuario.rol === 'ADMIN');
  if (alEditar && esSuya) {
    const editar = crear('button', 'boton boton--pequeno boton--sutil ruta__editar', t('Editar'));
    editar.type = 'button';
    editar.title = t('Editar esta ruta');
    editar.addEventListener('click', () => alEditar(ruta));
    cabecera.append(editar);
  }
  if (ruta.cercania) {
    cabecera.append(
      crear('span', 'ruta__cercania', t('Entrada: {mapa}, {cercania}', { mapa: ruta.cercania.desde, cercania: textoCercania(ruta.cercania) }))
    );
  }

  const pasos = crear('ol', 'ruta__pasos');
  // Las zonas después del portal cerrado ya no se alcanzan desde la entrada.
  const indiceCierre = cerrada ? ruta.tramoCerrado : -1;
  ruta.zonas.forEach((zona, k) => {
    const paso = crear('li', 'ruta__zona');
    if (resaltar && zona.nombre === resaltar) paso.classList.add('ruta__zona--resaltada');
    if (indiceCierre >= 0 && k > indiceCierre) paso.classList.add('ruta__zona--desconectada');

    const nombre = zona.nombre || t('Zona desconocida');
    if (alElegirZona && zona.nombre) {
      const boton = crear('button', 'ruta__nombre', nombre);
      boton.type = 'button';
      boton.addEventListener('click', () => alElegirZona(zona.nombre));
      paso.append(boton);
    } else {
      paso.append(crear('span', 'ruta__nombre', nombre));
    }
    const meta = [zona.tier ? `T${zona.tier}` : null, zona.etiqueta && t(zona.etiqueta)].filter(Boolean).join(' · ');
    if (meta) paso.append(crear('span', 'ruta__meta', meta));
    // Camino de hideouts: de quién son (lo anotan los usuarios).
    if (zona.esHideout) {
      const gremios = zona.gremios || [];
      const linea = crear('span', 'ruta__gremios');
      if (gremios.length) linea.append(t('Hideouts: {gremios}', { gremios: gremios.join(', ') }));
      if (alElegirZona) {
        const anotar = crear('button', 'ruta__anotar', gremios.length ? t('Ver o anotar') : t('¿De quién son los hideouts? Anótalo'));
        anotar.type = 'button';
        anotar.addEventListener('click', () => alElegirZona(zona.nombre));
        linea.append(gremios.length ? ' · ' : '', anotar);
      }
      if (linea.childNodes.length) paso.append(linea);
    }
    pasos.append(paso);

    if (k < ruta.tramos.length) {
      const tramo = crear('li', 'ruta__tramo');
      tramo.setAttribute('aria-label', t('Portal'));
      const estado = ruta.tramos[k].estado;
      if (estado === 'cerrado' || estado === 'desconectado') {
        tramo.classList.add(`ruta__tramo--${estado}`);
        tramo.append(crear('span', null, estado === 'cerrado' ? t('portal cerrado') : t('desconectado')));
      } else {
        tramo.append(crearReloj(ruta.tramos[k].cierraEn, { prefijo: '' }));
      }
      pasos.append(tramo);
    }
  });

  tarjeta.append(cabecera, pasos);
  return tarjeta;
}

/**
 * Lista de conexiones directas vigentes de un mapa.
 * @param {Array} conexiones  [{ sentido, hacia:{nombre, tier, etiqueta}, cierraEn, reportadoPor }]
 * @param {object} opciones
 *   - alElegirZona(nombre): al tocar el mapa del otro extremo
 */
export function crearListaConexiones(conexiones, { alElegirZona = null } = {}) {
  const lista = crear('ul', 'rutas-hideout__conexiones');
  for (const c of conexiones) {
    const item = crear('li');
    const meta = [c.hacia.tier ? `T${c.hacia.tier}` : null, c.hacia.etiqueta && t(c.hacia.etiqueta)].filter(Boolean).join(' · ');
    const nombre = c.hacia.nombre || t('Mapa desconocido');
    let destino;
    if (alElegirZona && c.hacia.nombre) {
      destino = crear('button', 'rutas-hideout__destino ruta__nombre', nombre);
      destino.type = 'button';
      destino.addEventListener('click', () => alElegirZona(c.hacia.nombre));
    } else {
      destino = crear('span', 'rutas-hideout__destino', nombre);
    }
    item.append(
      crear('span', 'rutas-hideout__sentido', c.sentido === 'salida' ? '→' : '←'),
      destino,
      crear('span', 'rutas-hideout__meta', meta),
      c.cierraEn ? crearReloj(c.cierraEn) : crear('span', 'rutas-hideout__meta', t('sin hora de cierre')),
      crearFuente(c)
    );
    lista.appendChild(item);
  }
  return lista;
}
