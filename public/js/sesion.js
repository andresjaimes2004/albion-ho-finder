'use strict';

import api from './api.js';

/**
 * sesion.js
 * ----------------------------------------------------------------------
 * Interfaz de cuenta: iniciar sesión, registrarse, cerrar sesión y ver el
 * historial personal de búsquedas.
 *
 * El navegador nunca guarda la contraseña ni el token de sesión en
 * localStorage: la sesión viaja en una cookie httpOnly que JavaScript no
 * puede leer. Aquí solo se refleja el estado que responde el servidor.
 * ----------------------------------------------------------------------
 */
export class PanelSesion {
  constructor({ alCambiarSesion, alElegirTermino } = {}) {
    this.alCambiarSesion = alCambiarSesion || (() => {});
    this.alElegirTermino = alElegirTermino || (() => {});

    this.contenedor = document.getElementById('cuenta');
    this.dialogo = document.getElementById('ventana-cuenta');
    this.formulario = document.getElementById('formulario-cuenta');
    this.campoUsuario = document.getElementById('cuenta-usuario');
    this.campoClave = document.getElementById('cuenta-clave');
    this.mensaje = document.getElementById('cuenta-mensaje');
    this.titulo = document.getElementById('ventana-cuenta__titulo');
    this.enviar = document.getElementById('cuenta-enviar');
    this.alternar = document.getElementById('cuenta-alternar');
    this.historialLista = document.getElementById('historial-lista');
    this.historialPanel = document.getElementById('historial');

    this.modo = 'login';
    this.usuario = null;

    this._prepararEventos();
  }

  _prepararEventos() {
    document.getElementById('ventana-cuenta__cerrar').addEventListener('click', () => this.dialogo.close());

    this.alternar.addEventListener('click', () => {
      this.modo = this.modo === 'login' ? 'registro' : 'login';
      this._pintarFormulario();
    });

    this.formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      this.mensaje.textContent = '';
      this.enviar.disabled = true;

      try {
        const usuario = this.campoUsuario.value;
        const clave = this.campoClave.value;
        const respuesta =
          this.modo === 'login' ? await api.login(usuario, clave) : await api.registro(usuario, clave);

        this.usuario = respuesta.usuario;
        this.campoClave.value = '';
        this.dialogo.close();
        await this.refrescar();
      } catch (error) {
        this.mensaje.textContent = error.message;
      } finally {
        this.enviar.disabled = false;
      }
    });

    document.getElementById('historial-limpiar').addEventListener('click', async () => {
      await api.limpiarHistorial();
      this._pintarHistorial([]);
    });
  }

  _pintarFormulario() {
    const esLogin = this.modo === 'login';
    this.titulo.textContent = esLogin ? 'Iniciar sesión' : 'Crear cuenta';
    this.enviar.textContent = esLogin ? 'Entrar' : 'Registrarme';
    this.alternar.textContent = esLogin ? '¿No tienes cuenta? Regístrate' : 'Ya tengo cuenta';
    this.mensaje.textContent = esLogin
      ? ''
      : 'La contraseña debe tener al menos 10 caracteres, con letras y números.';
  }

  abrir(modo = 'login') {
    this.modo = modo;
    this._pintarFormulario();
    if (!this.dialogo.open) this.dialogo.showModal();
    this.campoUsuario.focus();
  }

  async refrescar() {
    let datos;
    try {
      datos = await api.sesion();
    } catch (error) {
      datos = { autenticado: false, usuario: null };
    }

    this.usuario = datos.autenticado ? datos.usuario : null;
    this._pintarCuenta();
    this._pintarHistorial(datos.historial || []);
    this.alCambiarSesion(this.usuario);
    return this.usuario;
  }

  _pintarCuenta() {
    this.contenedor.replaceChildren();

    if (!this.usuario) {
      const entrar = document.createElement('button');
      entrar.type = 'button';
      entrar.className = 'boton';
      entrar.textContent = 'Iniciar sesión';
      entrar.addEventListener('click', () => this.abrir('login'));

      const registrarse = document.createElement('button');
      registrarse.type = 'button';
      registrarse.className = 'boton boton--sutil';
      registrarse.textContent = 'Crear cuenta';
      registrarse.addEventListener('click', () => this.abrir('registro'));

      this.contenedor.append(entrar, registrarse);
      this.historialPanel.hidden = true;
      return;
    }

    const saludo = document.createElement('span');
    saludo.className = 'cuenta__nombre';
    saludo.textContent = this.usuario.usuario;

    if (this.usuario.rol === 'ADMIN') {
      const insignia = document.createElement('span');
      insignia.className = 'insignia insignia--admin';
      insignia.textContent = 'Admin';
      saludo.appendChild(insignia);
    }

    const salir = document.createElement('button');
    salir.type = 'button';
    salir.className = 'boton boton--sutil';
    salir.textContent = 'Salir';
    salir.addEventListener('click', async () => {
      await api.logout();
      await this.refrescar();
    });

    this.contenedor.append(saludo, salir);
    this.historialPanel.hidden = false;
  }

  _pintarHistorial(historial) {
    this.historialLista.replaceChildren();

    if (!this.usuario) return;

    if (!historial.length) {
      const vacio = document.createElement('li');
      vacio.className = 'historial__vacio';
      vacio.textContent = 'Todavía no has hecho búsquedas.';
      this.historialLista.appendChild(vacio);
      return;
    }

    for (const entrada of historial) {
      const item = document.createElement('li');

      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'historial__item';
      boton.textContent = entrada.termino;
      boton.addEventListener('click', () => this.alElegirTermino(entrada.termino));

      const detalle = document.createElement('span');
      detalle.className = 'historial__detalle';
      detalle.textContent = `${entrada.totalMapas} mapa${entrada.totalMapas === 1 ? '' : 's'}`;

      item.append(boton, detalle);
      this.historialLista.appendChild(item);
    }
  }

  async refrescarHistorial() {
    if (!this.usuario) return;
    try {
      const datos = await api.historial();
      this._pintarHistorial(datos.historial || []);
    } catch (error) {
      /* el historial es secundario: si falla, no se interrumpe la búsqueda */
    }
  }
}

export default PanelSesion;
