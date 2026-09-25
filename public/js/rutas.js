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
  const prefijo = el.dataset.prefijo === undefined ? 'cierra en ' : el.dataset.prefijo;
  el.textContent = restante > 0 ? `${prefijo}${formatearRestante(restante)}` : 'cerrada';
  el.classList.toggle('reloj--urgente', restante > 0 && restante < 30 * 60_000);
  el.classList.toggle('reloj--pronto', restante >= 30 * 60_000 && restante < 60 * 60_000);
  el.classList.toggle('reloj--cerrado', restante <= 0);
}

/** Elemento con cuenta regresiva hasta `cierraEn`. */
export function crearReloj(cierraEn, { clase = 'reloj', prefijo } = {}) {
  const el = crear('span', clase);
  el.dataset.cierra = String(cierraEn);
  if (prefijo !== undefined) el.dataset.prefijo = prefijo;
  el.title = `Cierra a las ${new Date(cierraEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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

/**
 * Tarjeta de una ruta del gremio.
 * @param {object} ruta  { id, zonas:[{nombre, etiqueta, tier, clase}], tramos:[{cierraEn}], cierraEn, reportadoPor, reportadoPorId }
 * @param {object} opciones
 *   - usuario: sesión actual (para mostrar el botón de borrar)
 *   - resaltar: nombre de zona a destacar (p. ej. el mapa del hideout)
 *   - alElegirZona(nombre): al tocar una zona
 *   - alBorrar(ruta): al borrar (autor o admin)
 */
export function crearTarjetaRuta(ruta, { usuario = null, resaltar = null, alElegirZona = null, alBorrar = null } = {}) {
  const tarjeta = crear('article', 'ruta');

  const cabecera = crear('div', 'ruta__cabecera');
  const tramos = ruta.tramos.length;
  cabecera.append(
    crear('span', 'ruta__titulo', `${ruta.zonas[0].nombre} → ${ruta.zonas[ruta.zonas.length - 1].nombre}`),
    crear('span', 'ruta__tramos', `${tramos} tramo${tramos === 1 ? '' : 's'}`),
    crearReloj(ruta.cierraEn, { clase: 'reloj ruta__cierre' })
  );

  const fuente = crear('span', 'conexion__fuente conexion__fuente--gremio', ruta.reportadoPor ? `gremio · ${ruta.reportadoPor}` : 'gremio');
  const puedeBorrar = alBorrar && usuario && (usuario.id === ruta.reportadoPorId || usuario.rol === 'ADMIN');
  if (puedeBorrar) {
    const borrar = crear('button', 'conexion__borrar', '✕');
    borrar.type = 'button';
    borrar.title = 'Borrar esta ruta';
    borrar.setAttribute('aria-label', 'Borrar esta ruta');
    borrar.addEventListener('click', async () => {
      borrar.disabled = true;
      try {
        await alBorrar(ruta);
      } catch (error) {
        borrar.disabled = false;
        borrar.title = error.message || 'No se pudo borrar.';
      }
    });
    fuente.append(' ', borrar);
  }
  cabecera.append(fuente);

  const pasos = crear('ol', 'ruta__pasos');
  ruta.zonas.forEach((zona, k) => {
    const paso = crear('li', 'ruta__zona');
    if (resaltar && zona.nombre === resaltar) paso.classList.add('ruta__zona--resaltada');

    const nombre = zona.nombre || 'Zona desconocida';
    if (alElegirZona && zona.nombre) {
      const boton = crear('button', 'ruta__nombre', nombre);
      boton.type = 'button';
      boton.addEventListener('click', () => alElegirZona(zona.nombre));
      paso.append(boton);
    } else {
      paso.append(crear('span', 'ruta__nombre', nombre));
    }
    const meta = [zona.tier ? `T${zona.tier}` : null, zona.etiqueta].filter(Boolean).join(' · ');
    if (meta) paso.append(crear('span', 'ruta__meta', meta));
    pasos.append(paso);

    if (k < ruta.tramos.length) {
      const tramo = crear('li', 'ruta__tramo');
      tramo.setAttribute('aria-label', 'Portal');
      tramo.append(crearReloj(ruta.tramos[k].cierraEn, { prefijo: '' }));
      pasos.append(tramo);
    }
  });

  tarjeta.append(cabecera, pasos);
  return tarjeta;
}
