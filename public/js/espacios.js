'use strict';

import api from './api.js';
import { crear } from './rutas.js';
import { t, tn } from './i18n.js';
import { mostrarSuave, ocultarSuave } from './animar.js';
import { conectarSugerencias, agregarBotonBorrar } from './sugerencias.js';

/**
 * espacios.js
 * ----------------------------------------------------------------------
 * Panel "Espacios privados" de la pestaña Caminos de Avalon: crear un
 * espacio, agregar o quitar cuentas (hasta 7 en total), elegir si los
 * demás ven sus conexiones, salir o borrarlo.
 *
 * Los permisos los vuelve a comprobar el servidor en cada petición: aquí
 * solo se ocultan los botones que no le sirven a quien mira. Todo el
 * texto se inserta con textContent (nombres escritos por otras personas).
 * ----------------------------------------------------------------------
 */
export class PanelEspacios {
  /**
   * @param {object} opciones
   *   - alCambiar(espacios): tras cargar o cambiar la lista (registro y rutas)
   */
  constructor({ alCambiar = null } = {}) {
    this.alCambiar = alCambiar;
    this.usuario = null;
    this.espacios = [];
    // Cuentas que este usuario agregó antes a sus espacios: solo de aquí
    // salen las sugerencias (nunca otros usuarios del sitio).
    this.contactos = [];
    this.abierto = false;

    this.alternar = document.getElementById('espacios-alternar');
    this.cuerpo = document.getElementById('espacios-cuerpo');
    this.sinSesion = document.getElementById('espacios-sin-sesion');
    this.conSesion = document.getElementById('espacios-con-sesion');
    this.lista = document.getElementById('espacios-lista');
    this.formulario = document.getElementById('espacios-crear');
    this.nombre = document.getElementById('espacios-nombre');
    this.publico = document.getElementById('espacios-publico');
    this.mensaje = document.getElementById('espacios-mensaje');

    agregarBotonBorrar(this.nombre);
    this.alternar.addEventListener('click', () => (this.abierto ? this._cerrar() : this._abrir()));
    this.formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      this._crear();
    });
  }

  async establecerUsuario(usuario) {
    this.usuario = usuario;
    this.sinSesion.hidden = Boolean(usuario);
    this.conSesion.hidden = !usuario;
    this.espacios = [];
    this.contactos = [];
    this.lista.replaceChildren();
    this.mensaje.textContent = '';
    if (usuario) await this.cargar();
    else if (this.alCambiar) this.alCambiar([]);
  }

  async cargar() {
    try {
      const [lista, contactos] = await Promise.all([api.espacios.listar(), api.espacios.contactos().catch(() => ({ contactos: [] }))]);
      this.espacios = lista.espacios || [];
      this.contactos = contactos.contactos || [];
    } catch (error) {
      this.espacios = [];
      this.mensaje.textContent = error.message || t('No se pudieron cargar tus espacios.');
    }
    this._renderizar();
    if (this.alCambiar) this.alCambiar(this.espacios);
  }

  /** Abre el panel y lleva la vista hasta un espacio (desde un aviso). */
  mostrar(espacioId = null) {
    const recienAbierto = !this.abierto;
    if (recienAbierto) this._abrir();
    // Si se acaba de abrir, se espera a que termine la animación de apertura.
    setTimeout(() => {
      const tarjeta = espacioId ? this.lista.querySelector(`[data-espacio="${Number(espacioId)}"]`) : null;
      (tarjeta || this.alternar.closest('.espacios')).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, recienAbierto ? 350 : 0);
  }

  _abrir() {
    this.abierto = true;
    mostrarSuave(this.cuerpo);
    this.alternar.textContent = t('Cerrar');
    this.alternar.setAttribute('aria-expanded', 'true');
  }

  _cerrar() {
    this.abierto = false;
    ocultarSuave(this.cuerpo);
    this.alternar.textContent = t('Abrir');
    this.alternar.setAttribute('aria-expanded', 'false');
  }

  /** Ejecuta una acción, muestra su error si falla y vuelve a cargar la lista. */
  async _accion(fn, salida = this.mensaje) {
    salida.textContent = '';
    try {
      await fn();
      await this.cargar();
      return true;
    } catch (error) {
      salida.textContent = error.message || t('No se pudo guardar.');
      return false;
    }
  }

  async _crear() {
    const boton = this.formulario.querySelector('button[type="submit"]');
    boton.disabled = true;
    const ok = await this._accion(() => api.espacios.crear(this.nombre.value, this.publico.checked));
    boton.disabled = false;
    if (ok) {
      this.nombre.value = '';
      this.publico.checked = false;
      this.mensaje.textContent = t('Espacio creado. Agrega las cuentas de tu grupo por su nombre de usuario.');
    }
  }

  _renderizar() {
    if (!this.espacios.length) {
      this.lista.replaceChildren(crear('p', 'caminos-detalle__vacio', t('Todavía no perteneces a ningún espacio.')));
      return;
    }
    this.lista.replaceChildren(...this.espacios.map((e) => this._tarjeta(e)));
  }

  _tarjeta(espacio) {
    const tarjeta = crear('article', 'espacio');
    tarjeta.dataset.espacio = String(espacio.id);
    const mensaje = crear('p', 'espacios__mensaje');
    mensaje.setAttribute('aria-live', 'polite');

    const cabecera = crear('div', 'espacio__cabecera');
    cabecera.append(
      crear('strong', 'espacio__nombre', `${espacio.publico ? '👥' : '🔒'} ${espacio.nombre}`),
      crear(
        'span',
        'espacio__meta',
        `${tn(espacio.miembros.length, '{n} cuenta', '{n} cuentas')} / ${espacio.maxCuentas} · ${
          espacio.publico ? t('sus conexiones las ven todos') : t('solo lo ven sus miembros')
        }`
      )
    );
    tarjeta.append(cabecera);

    // Miembros: el creador puede quitar a cualquiera menos a sí mismo.
    const miembros = crear('ul', 'espacio__miembros');
    for (const m of espacio.miembros) {
      const item = crear('li', 'espacio__miembro', m.usuario);
      if (m.esCreador) item.append(crear('span', 'espacio__rol', t('creador')));
      if (espacio.esCreador && !m.esCreador) {
        const quitar = crear('button', 'conexion__borrar', '✕');
        quitar.type = 'button';
        quitar.title = t('Quitar a {usuario} del espacio', { usuario: m.usuario });
        quitar.setAttribute('aria-label', quitar.title);
        quitar.addEventListener('click', () => this._accion(() => api.espacios.quitarMiembro(espacio.id, m.id), mensaje));
        item.append(quitar);
      }
      miembros.append(item);
    }
    tarjeta.append(miembros);

    if (espacio.esCreador) {
      if (espacio.miembros.length < espacio.maxCuentas) {
        const formulario = crear('form', 'espacio__agregar');
        const caja = crear('div', 'panel-busqueda__caja espacios__caja');
        const entrada = crear('input', 'entrada-busqueda');
        entrada.type = 'text';
        entrada.maxLength = 30;
        entrada.minLength = 3;
        entrada.required = true;
        entrada.autocomplete = 'off';
        entrada.placeholder = t('Nombre de usuario');
        entrada.setAttribute('aria-label', t('Nombre de usuario a agregar'));
        caja.append(entrada);
        agregarBotonBorrar(entrada);
        // Sugiere las cuentas que ya agregaste antes y no están en este espacio.
        const presentes = new Set(espacio.miembros.map((m) => m.usuario.toLowerCase()));
        conectarSugerencias(entrada, {
          opciones: () => this.contactos.filter((c) => !presentes.has(c.toLowerCase())),
          alEnfocar: true,
        });
        const agregar = crear('button', 'boton boton--pequeno', t('Agregar cuenta'));
        agregar.type = 'submit';
        formulario.append(caja, agregar);
        formulario.addEventListener('submit', async (evento) => {
          evento.preventDefault();
          agregar.disabled = true;
          await this._accion(() => api.espacios.agregarMiembro(espacio.id, entrada.value), mensaje);
          agregar.disabled = false;
        });
        tarjeta.append(formulario);
      }

      const visible = crear('label', 'casilla espacio__visible');
      const casilla = crear('input');
      casilla.type = 'checkbox';
      casilla.checked = espacio.publico;
      casilla.addEventListener('change', () => this._accion(() => api.espacios.actualizar(espacio.id, { publico: casilla.checked }), mensaje));
      visible.append(casilla, ` ${t('Permitir que los demás vean las conexiones')}`);
      tarjeta.append(visible);
    }

    const acciones = crear('div', 'espacio__acciones');
    if (espacio.esCreador) {
      const borrar = crear('button', 'boton boton--pequeno boton--sutil boton--peligro', t('Borrar el espacio'));
      borrar.type = 'button';
      borrar.addEventListener('click', () => {
        const pregunta = t('¿Borrar el espacio {nombre}? Se borran también todas sus rutas y conexiones.', { nombre: espacio.nombre });
        if (window.confirm(pregunta)) this._accion(() => api.espacios.borrar(espacio.id), mensaje);
      });
      acciones.append(borrar);
    } else {
      const salir = crear('button', 'boton boton--pequeno boton--sutil', t('Salir del espacio'));
      salir.type = 'button';
      salir.addEventListener('click', () => {
        if (window.confirm(t('¿Salir del espacio {nombre}? Dejarás de ver sus rutas.', { nombre: espacio.nombre }))) {
          this._accion(() => api.espacios.quitarMiembro(espacio.id, this.usuario.id), mensaje);
        }
      });
      acciones.append(salir);
    }
    tarjeta.append(acciones, mensaje);
    return tarjeta;
  }
}

export default PanelEspacios;
