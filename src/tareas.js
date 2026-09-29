'use strict';

const TrackingService = require('./services/TrackingService');
const AuthService = require('./services/AuthService');
const { obtenerSincronizacion, intervaloMinutos } = require('./services/SincronizacionExcelService');

/**
 * tareas.js
 * ----------------------------------------------------------------------
 * Tareas periódicas del servidor:
 *
 *  - Cada minuto: rutas que cerraron hace más de 30 minutos (se borran con
 *    los tramos que quedaron después del portal cerrado) y conexiones ya
 *    cerradas (ver src/services/estadoRutas.js).
 *  - Cada hora: sesiones caducadas e intentos de inicio de sesión viejos.
 *  - Cada EXCEL_SYNC_MINUTOS (60 por defecto), si está configurada: los
 *    hideouts con el Excel de Google Drive (SincronizacionExcelService).
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

function iniciarTareas({ seguimiento = new TrackingService(), auth = new AuthService(), sincronizacion = null } = {}) {
  const rutas = () => ejecutar('rutas cerradas', () => seguimiento.mantenimiento());
  const sesiones = () => ejecutar('sesiones', () => auth.mantenimiento());
  rutas();
  sesiones();

  const temporizadores = [setInterval(rutas, 60_000), setInterval(sesiones, 3_600_000)];

  let excel = sincronizacion;
  if (!excel) {
    try {
      excel = obtenerSincronizacion();
    } catch (error) {
      console.error(`[tareas] Excel de Drive: ${error.message}`);
    }
  }
  if (excel && excel.configurada()) {
    const sincronizar = () =>
      excel
        .sincronizar()
        .then((r) => console.log(`[tareas] Excel de Drive: ${r.mensaje}`))
        .catch((error) => console.error(`[tareas] Excel de Drive: ${error.message}`));
    // La primera, poco después de arrancar; luego cada EXCEL_SYNC_MINUTOS.
    temporizadores.push(setTimeout(sincronizar, 30_000), setInterval(sincronizar, intervaloMinutos() * 60_000));
  }
  // No mantienen vivo el proceso por sí solos (cierre ordenado y pruebas).
  for (const t of temporizadores) t.unref();
  return () => temporizadores.forEach(clearInterval);
}

module.exports = iniciarTareas;
