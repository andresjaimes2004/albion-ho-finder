'use strict';

import api from './api.js';

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
      const [resumen, usuarios, auditoria] = await Promise.all([
        api.admin.resumen(),
        api.admin.usuarios(),
        api.admin.auditoria(),
      ]);
      this._pintarResumen(resumen.resumen);
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
      ['Temporada', resumen.temporada || '—'],
      ['Mapas', resumen.totalMapas],
      ['Mapas con geografía', resumen.totalMapasConGeo],
      ['Gremios', resumen.totalGremios],
      ['Hideouts', resumen.totalHideouts],
      ['Administradores', resumen.totalAdmins],
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
      vacio.textContent = 'Ningún gremio coincide con la búsqueda.';
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
      logo.src = gremio.tieneLogo ? `/api/gremios/${gremio.id}/logo?t=${Date.now()}` : 'assets/logo.svg';

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
      guardar.textContent = 'Guardar nombre';
      guardar.addEventListener('click', async () => {
        try {
          await api.admin.renombrarGremio(gremio.id, nombre.value);
          this.mensaje.textContent = `Gremio actualizado: ${nombre.value}`;
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
          this.mensaje.textContent = `Logo actualizado para ${gremio.nombre}.`;
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
        borrar.textContent = 'Quitar logo';
        borrar.addEventListener('click', async () => {
          await api.admin.borrarLogo(gremio.id);
          logo.src = 'assets/logo.svg';
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
        opcion.textContent = valor === 'ADMIN' ? 'Administrador' : 'Usuario';
        opcion.selected = usuario.rol === valor;
        rol.appendChild(opcion);
      }
      rol.addEventListener('change', async () => {
        try {
          await api.admin.cambiarRolUsuario(usuario.id, rol.value);
          this.mensaje.textContent = `Rol actualizado para ${usuario.usuario}.`;
        } catch (error) {
          this.mensaje.textContent = error.message;
          await this.refrescar();
        }
      });

      const estado = document.createElement('button');
      estado.type = 'button';
      estado.className = 'boton boton--pequeno boton--sutil';
      estado.textContent = usuario.activo ? 'Desactivar' : 'Activar';
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
      acceso.textContent = usuario.ultimoAccesoEn ? `Último acceso: ${usuario.ultimoAccesoEn}` : 'Sin accesos';

      item.append(nombre, rol, estado, acceso);
      this.listaUsuarios.appendChild(item);
    }
  }

  _pintarAuditoria(registros) {
    this.listaAuditoria.replaceChildren();

    if (!registros.length) {
      const vacio = document.createElement('li');
      vacio.textContent = 'Sin cambios registrados.';
      this.listaAuditoria.appendChild(vacio);
      return;
    }

    for (const registro of registros.slice(0, 25)) {
      const item = document.createElement('li');
      item.className = 'admin-auditoria__fila';
      item.textContent = `${registro.creadoEn} · ${registro.usuario || 'sistema'} · ${registro.accion} ${registro.entidad} #${registro.entidadId || '-'}`;
      this.listaAuditoria.appendChild(item);
    }
  }
}

export default PanelAdmin;
