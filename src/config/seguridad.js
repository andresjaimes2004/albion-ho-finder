'use strict';

/**
 * seguridad.js
 * ----------------------------------------------------------------------
 * Parámetros de seguridad en un único lugar, para que auditar la
 * configuración no exija leer toda la aplicación.
 * ----------------------------------------------------------------------
 */

const enProduccion = process.env.NODE_ENV === 'production';

module.exports = {
  enProduccion,

  cookies: {
    sesion: 'ho_sesion',
    csrf: 'ho_csrf',
    opciones: {
      httpOnly: true,
      sameSite: 'strict',
      secure: enProduccion, // exige HTTPS en producción
      path: '/',
    },
  },

  // Duración de la sesión y umbral a partir del cual se renueva sola.
  sesion: {
    horasVigencia: 8,
    renovarSiRestanMenosDeHoras: 2,
  },

  login: {
    maxIntentos: 5,
    ventanaMinutos: 15,
  },

  limites: {
    jsonBytes: '32kb',
    logoBytes: 1024 * 1024, // 1 MB
    peticionesPorMinuto: 120,
    peticionesEscrituraPorMinuto: 30,
  },

  logo: {
    // Tipos permitidos; se verifica la firma binaria del archivo, no la
    // extensión ni la cabecera Content-Type que envíe el cliente.
    tiposPermitidos: ['image/png', 'image/jpeg', 'image/webp'],
  },
};
