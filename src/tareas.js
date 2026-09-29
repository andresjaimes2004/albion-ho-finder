'use strict';

const TrackingService = require('./services/TrackingService');
const AuthService = require('./services/AuthService');

/**
 * tareas.js
 * ----------------------------------------------------------------------
 * Tareas periódicas del servidor:
 *
 *  - Cada minuto: rutas que cerraron hace más de 30 minutos (se borran con
 *    los tramos que quedaron después del portal cerrado) y conexiones ya
 *    cerradas (ver src/services/estadoRutas.js).
 *  - Cada hora: sesiones caducadas e intentos de inicio de sesión viejos.
 *
 * Un fallo en una tarea se registra y no detiene el servidor.
 * ----------------------------------------------------------------------
 */

function ejecutar(nombre, tarea) {
  try {
    tarea();
  } catch (error) {
    console.error(`[tareas] ${nombre}: ${error.message}`);
  }
}

function iniciarTareas({ seguimiento = new TrackingService(), auth = new AuthService() } = {}) {
  const rutas = () => ejecutar('rutas cerradas', () => seguimiento.mantenimiento());
  const sesiones = () => ejecutar('sesiones', () => auth.mantenimiento());
  rutas();
  sesiones();

  const temporizadores = [setInterval(rutas, 60_000), setInterval(sesiones, 3_600_000)];
  // No mantienen vivo el proceso por sí solos (cierre ordenado y pruebas).
  for (const t of temporizadores) t.unref();
  return () => temporizadores.forEach(clearInterval);
}

module.exports = iniciarTareas;
