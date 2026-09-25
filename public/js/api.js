'use strict';

/**
 * api.js
 * ----------------------------------------------------------------------
 * Cliente HTTP de la aplicación. Centraliza:
 *  - el envío automático del token CSRF en toda operación de escritura
 *    (se lee de la cookie legible que emite el servidor),
 *  - el manejo uniforme de errores,
 *  - `credentials: 'same-origin'` para que la cookie de sesión viaje solo
 *    a este mismo sitio.
 * ----------------------------------------------------------------------
 */

function leerCookie(nombre) {
  const objetivo = `${nombre}=`;
  for (const parte of document.cookie.split(';')) {
    const limpio = parte.trim();
    if (limpio.startsWith(objetivo)) {
      return decodeURIComponent(limpio.slice(objetivo.length));
    }
  }
  return null;
}

async function peticion(ruta, { metodo = 'GET', datos, senal, binario } = {}) {
  const opciones = {
    method: metodo,
    credentials: 'same-origin',
    headers: {},
    signal: senal,
  };

  if (metodo !== 'GET' && metodo !== 'HEAD') {
    const csrf = leerCookie('ho_csrf');
    if (csrf) opciones.headers['X-CSRF-Token'] = csrf;
  }

  if (binario) {
    opciones.headers['Content-Type'] = binario.type || 'application/octet-stream';
    opciones.body = binario;
  } else if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }

  const respuesta = await fetch(ruta, opciones);

  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch (error) {
    cuerpo = null;
  }

  if (!respuesta.ok || (cuerpo && cuerpo.ok === false)) {
    const mensaje = (cuerpo && cuerpo.mensaje) || 'No se pudo completar la operación.';
    const fallo = new Error(mensaje);
    fallo.estado = respuesta.status;
    fallo.cuerpo = cuerpo;
    throw fallo;
  }

  return cuerpo;
}

export const api = {
  buscar: (gremio, senal) =>
    peticion(`/api/buscar?gremio=${encodeURIComponent(gremio)}`, { senal }),

  mundo: () => peticion('/api/mapas'),
  detalleMapa: (nombre) => peticion(`/api/mapas/${encodeURIComponent(nombre)}`),

  tracking: () => peticion('/api/tracking'),
  detalleTracking: (nombre, senal) =>
    peticion(`/api/tracking/${encodeURIComponent(nombre)}`, { senal }),

  sesion: () => peticion('/api/auth/sesion'),
  login: (usuario, clave) =>
    peticion('/api/auth/login', { metodo: 'POST', datos: { usuario, clave } }),
  registro: (usuario, clave) =>
    peticion('/api/auth/registro', { metodo: 'POST', datos: { usuario, clave } }),
  logout: () => peticion('/api/auth/logout', { metodo: 'POST' }),
  cambiarClave: (claveNueva) =>
    peticion('/api/auth/clave', { metodo: 'POST', datos: { claveNueva } }),

  historial: () => peticion('/api/historial'),
  limpiarHistorial: () => peticion('/api/historial', { metodo: 'DELETE' }),

  admin: {
    resumen: () => peticion('/api/admin/resumen'),
    buscarGremios: (q) => peticion(`/api/admin/gremios?q=${encodeURIComponent(q || '')}`),
    renombrarGremio: (id, nombre) =>
      peticion(`/api/admin/gremios/${id}/nombre`, { metodo: 'PUT', datos: { nombre } }),
    notasGremio: (id, notas) =>
      peticion(`/api/admin/gremios/${id}/notas`, { metodo: 'PUT', datos: { notas } }),
    subirLogo: (id, archivo) =>
      peticion(`/api/admin/gremios/${id}/logo`, { metodo: 'PUT', binario: archivo }),
    borrarLogo: (id) => peticion(`/api/admin/gremios/${id}/logo`, { metodo: 'DELETE' }),

    subirImagenMapa: (id, archivo) =>
      peticion(`/api/admin/mapas/${id}/imagen`, { metodo: 'PUT', binario: archivo }),
    ajustarImagenMapa: (id, ajuste) =>
      peticion(`/api/admin/mapas/${id}/imagen/ajuste`, { metodo: 'PUT', datos: ajuste }),
    borrarImagenMapa: (id) => peticion(`/api/admin/mapas/${id}/imagen`, { metodo: 'DELETE' }),

    crearHideout: (datos) => peticion('/api/admin/hideouts', { metodo: 'POST', datos }),
    actualizarHideout: (id, datos) =>
      peticion(`/api/admin/hideouts/${id}`, { metodo: 'PUT', datos }),
    posicionarHideout: (id, x, y) =>
      peticion(`/api/admin/hideouts/${id}/posicion`, { metodo: 'PUT', datos: { x, y } }),
    eliminarHideout: (id) => peticion(`/api/admin/hideouts/${id}`, { metodo: 'DELETE' }),

    usuarios: () => peticion('/api/admin/usuarios'),
    cambiarEstadoUsuario: (id, activo) =>
      peticion(`/api/admin/usuarios/${id}/estado`, { metodo: 'PUT', datos: { activo } }),
    cambiarRolUsuario: (id, rol) =>
      peticion(`/api/admin/usuarios/${id}/rol`, { metodo: 'PUT', datos: { rol } }),

    auditoria: () => peticion('/api/admin/auditoria'),
  },
};

export default api;
