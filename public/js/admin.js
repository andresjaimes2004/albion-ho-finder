'use strict';

import api from './api.js';
import { t, regional } from './i18n.js';

/**
 * admin.js
 * ----------------------------------------------------------------------
 * Panel de administración embebido en la propia web: edición de gremios
 * (nombre, logo, notas), gestión de usuarios y bitácora de cambios.
 *
 * La interfaz solo aparece si el servidor confirma que la sesión tiene
 * rol ADMIN; ocultar botones no es la protección real: cada endpoint del
 * panel vuelve a verificar el rol en el servidor.
 * ----------------------------------------------------------------------
 */
export class PanelAdmin {
  constructor() {
    this.seccion = document.getElementById('panel-admin');
    this.resumen = document.getElementById('admin-resumen');
    this.buscador = document.getElementById('admin-buscar-gremio');
    this.listaGremios = document.getElementById('admin-gremios');
    this.listaUsuarios = document.getElementById('admin-usuarios');
    this.listaAuditoria = document.getElementById('admin-auditoria');
    this.mensaje = document.getElementById('admin-mensaje');

    this.visible = false;
    this._prepararEventos();
  }

  _prepararEventos() {
    let temporizador = null;
    this.buscador.addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => this._buscarGremios(this.buscador.value), 300);
    });

    document.getElementById('admin-recargar').addEventListener('click', () => this.refrescar());

    this.sincEstado = document.getElementById('admin-sinc-estado');
    this.sincAhora = document.getElementById('admin-sinc-ahora');
    this.sincForzar = document.getElementById('admin-sinc-forzar');
    this.sincAhora.addEventListener('click', () => this._sincronizar(false));
    this.sincForzar.addEventListener('click', () => {
      // Aplicar un Excel que borraría muchos hideouts: se confirma antes.
      if (window.confirm(t('El Excel borraría o cambiaría muchos hideouts. ¿Seguro que es correcto?'))) this._sincronizar(true);
    });
  }

  /** Estado de la sincronización con el Excel de Google Drive. */
  _pintarSincronizacion(estado) {
    this.sincForzar.hidden = true;
    this.sincEstado.classList.remove('admin-sincronizacion__estado--error');
    if (!estado.configurada) {
      this.sincAhora.disabled = true;
      this.sincEstado.textContent = estado.error
        ? t('Mal configurada: {error}', { error: estado.error })
        : t('No configurada. Falta EXCEL_DRIVE_ID en el .env del servidor (ver README).');
      return;
    }
    this.sincAhora.disabled = false;
    const ultimo = estado.ultimo;
    if (!ultimo) {
      this.sincEstado.textContent = t('Configurada. Todavía no se ha revisado el Excel desde que arrancó el servidor.');
      return;
    }
    const cuando = new Date(ultimo.en).toLocaleString(regional);
    const cuenta = estado.cuenta ? ` ${t('Cuenta con la que compartir el Excel: {cuenta}.', { cuenta: estado.cuenta })}` : '';
    this.sincEstado.textContent = `${t('Última revisión: {cuando}.', { cuando })} ${ultimo.ok ? '' : t('Error:')} ${ultimo.mensaje}${cuenta}`;
    this.sincEstado.classList.toggle('admin-sincronizacion__estado--error', !ultimo.ok);
    this.sincForzar.hidden = !ultimo.requiereForzar;
  }

  async _sincronizar(forzar) {
    this.sincAhora.disabled = true;
    this.sincForzar.disabled = true;
    this.sincEstado.textContent = t('Revisando el Excel de Drive…');
    try {
      const r = await api.admin.sincronizar(forzar);
      this._pintarSincronizacion(r.sincronizacion);
      await this.refrescar();
    } catch (error) {
      try {
        this._pintarSincronizacion((await api.admin.estadoSincronizacion()).sincronizacion);
      } catch (otro) {
        this.sincEstado.textContent = error.message;
      }
    } finally {
      this.sincAhora.disabled = false;
      this.sincForzar.disabled = false;
    }
  }

  async establecerUsuario(usuario) {
    this.visible = Boolean(usuario && usuario.rol === 'ADMIN');
    this.seccion.hidden = !this.visible;
    if (this.visible) await this.refrescar();
  }

  async refrescar() {
    if (!this.visible) return;
    this.mensaje.textContent = '';
    try {
      const [resumen, usuarios, auditoria, sincronizacion] = await Promise.all([
        api.admin.resumen(),
        api.admin.usuarios(),
        api.admin.auditoria(),
        api.admin.estadoSincronizacion(),
      ]);
      this._pintarResumen(resumen.resumen);
      this._pintarSincronizacion(sincronizacion.sincronizacion);
      this._pintarUsuarios(usuarios.usuarios);
      this._pintarAuditoria(auditoria.auditoria);
      await this._buscarGremios(this.buscador.value);
    } catch (error) {
      this.mensaje.textContent = error.message;
    }
  }

  _pintarResumen(resumen) {
    this.resumen.replaceChildren();
    const campos = [
      [t('Temporada'), resumen.temporada || '—'],
      [t('Mapas'), resumen.totalMapas],
      [t('Mapas con geografía'), resumen.totalMapasConGeo],
      [t('Gremios'), resumen.totalGremios],
      [t('Hideouts'), resumen.totalHideouts],
      [t('Administradores'), resumen.totalAdmins],
    ];

    for (const [etiqueta, valor] of campos) {
      const tarjeta = document.createElement('div');
      tarjeta.className = 'admin-tarjeta';

      const titulo = document.createElement('span');
      titulo.className = 'admin-tarjeta__titulo';
      titulo.textContent = etiqueta;

      const dato = document.createElement('strong');
      dato.textContent = String(valor);

      tarjeta.append(titulo, dato);
      this.resumen.appendChild(tarjeta);
    }
  }

  async _buscarGremios(consulta) {
    if (!this.visible) return;
    try {
      const datos = await api.admin.buscarGremios(consulta);
      this._pintarGremios(datos.gremios);
    } catch (error) {
      this.mensaje.textContent = error.message;
    }
  }

  _pintarGremios(gremios) {
    this.listaGremios.replaceChildren();

    if (!gremios.length) {
      const vacio = document.createElement('li');
      vacio.textContent = t('Ningún gremio coincide con la búsqueda.');
      this.listaGremios.appendChild(vacio);
      return;
    }

    for (const gremio of gremios) {
      const item = document.createElement('li');
      item.className = 'admin-fila';

      const logo = document.createElement('img');
      logo.className = 'admin-fila__logo';
      logo.alt = '';
      logo.width = 36;
      logo.height = 36;
      logo.src = gremio.tieneLogo ? `/api/gremios/${gremio.id}/logo?t=${Date.now()}` : '/assets/logo.svg';

      const nombre = document.createElement('input');
      nombre.type = 'text';
      nombre.value = gremio.nombre;
      nombre.maxLength = 60;
      nombre.className = 'admin-fila__nombre';

      const conteo = document.createElement('span');
      conteo.className = 'admin-fila__conteo';
      conteo.textContent = `${gremio.totalHideouts} HO`;

      const guardar = document.createElement('button');
      guardar.type = 'button';
      guardar.className = 'boton boton--pequeno';
      guardar.textContent = t('Guardar nombre');
      guardar.addEventListener('click', async () => {
        try {
          await api.admin.renombrarGremio(gremio.id, nombre.value);
          this.mensaje.textContent = t('Gremio actualizado: {nombre}', { nombre: nombre.value });
        } catch (error) {
          this.mensaje.textContent = error.message;
        }
      });

      const archivo = document.createElement('input');
      archivo.type = 'file';
      archivo.accept = 'image/png,image/jpeg,image/webp';
      archivo.className = 'admin-fila__archivo';
      archivo.addEventListener('change', async () => {
        const fichero = archivo.files && archivo.files[0];
        if (!fichero) return;
        try {
          await api.admin.subirLogo(gremio.id, fichero);
          logo.src = `/api/gremios/${gremio.id}/logo?t=${Date.now()}`;
          this.mensaje.textContent = t('Logo actualizado para {nombre}.', { nombre: gremio.nombre });
        } catch (error) {
          this.mensaje.textContent = error.message;
        } finally {
          archivo.value = '';
        }
      });

      item.append(logo, nombre, conteo, guardar, archivo);

      if (gremio.tieneLogo) {
        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'boton boton--pequeno boton--sutil';
        borrar.textContent = t('Quitar logo');
        borrar.addEventListener('click', async () => {
          await api.admin.borrarLogo(gremio.id);
          logo.src = '/assets/logo.svg';
        });
        item.appendChild(borrar);
      }

      this.listaGremios.appendChild(item);
    }
  }

  _pintarUsuarios(usuarios) {
    this.listaUsuarios.replaceChildren();

    for (const usuario of usuarios) {
      const item = document.createElement('li');
      item.className = 'admin-fila';

      const nombre = document.createElement('strong');
      nombre.textContent = usuario.usuario;

      const rol = document.createElement('select');
      for (const valor of ['USUARIO', 'ADMIN']) {
        const opcion = document.createElement('option');
        opcion.value = valor;
        opcion.textContent = valor === 'ADMIN' ? t('Administrador') : t('Usuario');
        opcion.selected = usuario.rol === valor;
        rol.appendChild(opcion);
      }
      rol.addEventListener('change', async () => {
        try {
          await api.admin.cambiarRolUsuario(usuario.id, rol.value);
          this.mensaje.textContent = t('Rol actualizado para {usuario}.', { usuario: usuario.usuario });
        } catch (error) {
          this.mensaje.textContent = error.message;
          await this.refrescar();
        }
      });

      const estado = document.createElement('button');
      estado.type = 'button';
      estado.className = 'boton boton--pequeno boton--sutil';
      estado.textContent = usuario.activo ? t('Desactivar') : t('Activar');
      estado.addEventListener('click', async () => {
        try {
          await api.admin.cambiarEstadoUsuario(usuario.id, !usuario.activo);
          await this.refrescar();
        } catch (error) {
          this.mensaje.textContent = error.message;
        }
      });

      const acceso = document.createElement('span');
      acceso.className = 'admin-fila__conteo';
      acceso.textContent = usuario.ultimoAccesoEn ? t('Último acceso: {fecha}', { fecha: usuario.ultimoAccesoEn }) : t('Sin accesos');

      item.append(nombre, rol, estado, acceso);
      this.listaUsuarios.appendChild(item);
    }
  }

  _pintarAuditoria(registros) {
    this.listaAuditoria.replaceChildren();

    if (!registros.length) {
      const vacio = document.createElement('li');
      vacio.textContent = t('Sin cambios registrados.');
      this.listaAuditoria.appendChild(vacio);
      return;
    }

    for (const registro of registros.slice(0, 25)) {
      const item = document.createElement('li');
      item.className = 'admin-auditoria__fila';
      item.textContent = `${registro.creadoEn} · ${registro.usuario || t('sistema')} · ${registro.accion} ${registro.entidad} #${registro.entidadId || '-'}`;
      this.listaAuditoria.appendChild(item);
    }
  }
}

export default PanelAdmin;
