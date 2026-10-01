'use strict';

import api from './api.js';
import { t } from './i18n.js';

/**
 * avisos.js
 * ----------------------------------------------------------------------
 * Notificaciones en vivo para el usuario con sesión: le agregaron a un
 * espacio privado, se lo quitaron, lo borraron o alguien salió del suyo.
 *
 *  - Pregunta al servidor cada INTERVALO_MS mientras la pestaña del
 *    navegador está visible (y en cuanto vuelve a estarlo).
 *  - Cada aviso se muestra una vez como notificación (abajo a la derecha;
 *    en el móvil, abajo a lo ancho) y se marca como leído.
 *  - Si cambia algún espacio, avisa a la página para que actualice sus
 *    espacios y rutas sin recargar.
 *  - Los textos se insertan con textContent: los nombres los escriben otros
 *    usuarios.
 * ----------------------------------------------------------------------
 */

const INTERVALO_MS = 10_000;
const MAX_VISIBLES = 4;

const CONTENIDO = {
  ESPACIO_AGREGADO: (d) => ({
    clase: 'aviso--exito',
    titulo: t('Te agregaron a un espacio privado'),
    texto: t('{por} te agregó a «{espacio}». Ya puedes ver y registrar sus rutas.', d),
    accion: t('Ver espacio'),
  }),
  ESPACIO_QUITADO: (d) => ({
    clase: 'aviso--alerta',
    titulo: t('Ya no estás en un espacio privado'),
    texto: t('{por} te quitó de «{espacio}». Dejarás de ver sus rutas.', d),
  }),
  ESPACIO_BORRADO: (d) => ({
    clase: 'aviso--alerta',
    titulo: t('Se borró un espacio privado'),
    texto: t('{por} borró «{espacio}» junto con sus rutas.', d),
  }),
  ESPACIO_SALIO: (d) => ({
    clase: 'aviso--info',
    titulo: t('Alguien salió de tu espacio'),
    texto: t('{usuario} salió de «{espacio}».', d),
    accion: t('Ver espacio'),
  }),
};

export class CentroAvisos {
  /**
   * @param {object} opciones
   *   - alCambiarEspacios(): algún espacio del usuario cambió
   *   - verEspacio(id): el usuario pulsó "Ver espacio"
   */
  constructor({ alCambiarEspacios = null, verEspacio = null } = {}) {
    this.alCambiarEspacios = alCambiarEspacios;
    this.verEspacio = verEspacio;
    this.usuario = null;
    this.temporizador = null;
    this.revisando = false;

    this.contenedor = document.createElement('div');
    this.contenedor.className = 'avisos';
    this.contenedor.setAttribute('role', 'region');
    this.contenedor.setAttribute('aria-label', t('Notificaciones'));
    this.contenedor.setAttribute('aria-live', 'polite');
    document.body.append(this.contenedor);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.revisar();
    });
  }

  establecerUsuario(usuario) {
    const otro = (usuario && usuario.id) !== (this.usuario && this.usuario.id);
    this.usuario = usuario;
    if (!otro) return;
    clearInterval(this.temporizador);
    this.temporizador = null;
    // Al cambiar de cuenta, fuera las notificaciones de la anterior.
    this.contenedor.replaceChildren();
    if (!usuario) return;
    this.revisar();
    this.temporizador = setInterval(() => {
      if (!document.hidden) this.revisar();
    }, INTERVALO_MS);
  }

  async revisar() {
    if (!this.usuario || this.revisando) return;
    this.revisando = true;
    try {
      const { avisos = [] } = await api.avisos.listar();
      if (!avisos.length) return;
      // Se marcan antes de mostrarlos: otra pestaña abierta no los repite.
      await api.avisos.marcarLeidos(avisos.map((a) => a.id)).catch(() => {});
      for (const aviso of avisos) this._mostrar(aviso);
      if (avisos.some((a) => a.tipo.startsWith('ESPACIO_')) && this.alCambiarEspacios) this.alCambiarEspacios();
    } catch (error) {
      // Sin conexión o sesión caducada: se reintenta en la próxima vuelta.
    } finally {
      this.revisando = false;
    }
  }

  _mostrar(aviso) {
    const crearContenido = CONTENIDO[aviso.tipo];
    if (!crearContenido) return;
    const datos = { espacio: '', por: '', usuario: '', ...aviso.datos };
    const contenido = crearContenido(datos);

    const caja = document.createElement('div');
    caja.className = `aviso ${contenido.clase}`;
    caja.setAttribute('role', 'status');

    const cuerpo = document.createElement('div');
    cuerpo.className = 'aviso__cuerpo';
    const titulo = document.createElement('strong');
    titulo.className = 'aviso__titulo';
    titulo.textContent = contenido.titulo;
    const texto = document.createElement('p');
    texto.className = 'aviso__texto';
    texto.textContent = contenido.texto;
    cuerpo.append(titulo, texto);

    const cerrar = () => {
      caja.classList.add('aviso--saliendo');
      setTimeout(() => caja.remove(), 200);
    };

    if (contenido.accion && this.verEspacio && aviso.datos.espacioId) {
      const accion = document.createElement('button');
      accion.type = 'button';
      accion.className = 'boton boton--pequeno aviso__accion';
      accion.textContent = contenido.accion;
      accion.addEventListener('click', () => {
        this.verEspacio(aviso.datos.espacioId);
        cerrar();
      });
      cuerpo.append(accion);
    }

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'aviso__cerrar';
    boton.textContent = '✕';
    boton.setAttribute('aria-label', t('Cerrar notificación'));
    boton.addEventListener('click', cerrar);

    caja.append(cuerpo, boton);
    this.contenedor.append(caja);
    while (this.contenedor.children.length > MAX_VISIBLES) this.contenedor.firstElementChild.remove();
  }
}

export default CentroAvisos;
