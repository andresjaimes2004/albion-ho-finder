'use strict';

import api from './api.js';
import { t, tn, regional } from './i18n.js';
import { confirmar } from './dialogos.js';

/**
 * admin.js
 * ----------------------------------------------------------------------
 * Panel de administración embebido en la propia web: sincronización con
 * el Excel de Drive, gestión de usuarios y bitácora de cambios. (Los
 * gremios ya no se editan aquí: los mantiene el Excel.)
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
    this.listaUsuarios = document.getElementById('admin-usuarios');
    this.listaAuditoria = document.getElementById('admin-auditoria');
    this.mensaje = document.getElementById('admin-mensaje');

    this.visible = false;
    this._prepararEventos();
  }

  _prepararEventos() {
    document.getElementById('admin-recargar').addEventListener('click', () => this.refrescar());

    this.sincEstado = document.getElementById('admin-sinc-estado');
    this.sincAhora = document.getElementById('admin-sinc-ahora');
    this.sincForzar = document.getElementById('admin-sinc-forzar');
    this.sincAhora.addEventListener('click', () => this._sincronizar(false));
    this.sincForzar.addEventListener('click', async () => {
      // Aplicar un Excel que borraría muchos hideouts: se confirma antes.
      const ok = await confirmar({
        titulo: t('¿Aplicar el Excel de todos modos?'),
        mensaje: t('El Excel borraría o cambiaría muchos hideouts. ¿Seguro que es correcto?'),
        aceptar: t('Aplicar de todos modos'),
        peligro: true,
      });
      if (ok) this._sincronizar(true);
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
    // Gremios de caminos de hideouts anotados en la web que el Excel aún no tiene.
    const caminos = estado.caminos || {};
    const exportacion = caminos.ultimaExportacion;
    let pendientes = '';
    if (caminos.pendientes) {
      pendientes = ` ${tn(caminos.pendientes, '{n} gremio de caminos pendiente de agregar al Excel.', '{n} gremios de caminos pendientes de agregar al Excel.')}`;
      if (exportacion && (!exportacion.ok || exportacion.aviso) && !ultimo.mensaje.includes(exportacion.mensaje)) {
        pendientes += ` ${exportacion.mensaje}`;
      }
    }
    this.sincEstado.textContent = `${t('Última revisión: {cuando}.', { cuando })} ${ultimo.ok ? '' : t('Error:')} ${ultimo.mensaje}${pendientes}${cuenta}`;
    this.sincEstado.classList.toggle('admin-sincronizacion__estado--error', !ultimo.ok || Boolean(exportacion && !exportacion.ok));
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
