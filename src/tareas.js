'use strict';

const TrackingService = require('./services/TrackingService');
const AuthService = require('./services/AuthService');
const AvisoRepository = require('./repositories/AvisoRepository');
const { obtenerSincronizacion, intervaloMinutos } = require('./services/SincronizacionExcelService');

/**
 * tareas.js
 * ----------------------------------------------------------------------
 * Tareas periódicas del servidor:
 *
 *  - Cada minuto: rutas que cerraron hace más de 30 minutos (se borran con
 *    los tramos que quedaron después del portal cerrado) y conexiones ya
 *    cerradas (ver src/services/estadoRutas.js).
 *  - Cada hora: sesiones caducadas, intentos de inicio de sesión viejos y
 *    avisos de más de 30 días.
 *  - Cada EXCEL_SYNC_MINUTOS (60 por defecto), si está configurada: los
 *    hideouts con el Excel de Google Drive (SincronizacionExcelService).
 *    Y, cada minuto, si hay gremios de caminos de hideouts anotados en la
 *    web que el Excel aún no tiene, se adelanta la sincronización para
 *    agregarlos (como mucho cada 2 minutos; tras un fallo, cada 30).
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
  const sesiones = () =>
    ejecutar('sesiones', () => {
      auth.mantenimiento();
      // Avisos de más de 30 días (leídos o no).
      const limite = new Date(Date.now() - 30 * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
      new AvisoRepository().purgarAntesDe(limite);
    });
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
    // Gremios de caminos recién anotados: no esperan a la próxima hora.
    const pendientes = () => ejecutar('Excel de Drive', () => {
      if (excel.debeExportarPronto()) sincronizar();
    });
    temporizadores.push(setInterval(pendientes, 60_000));
  }
  // No mantienen vivo el proceso por sí solos (cierre ordenado y pruebas).
  for (const t of temporizadores) t.unref();
  return () => temporizadores.forEach(clearInterval);
}

module.exports = iniciarTareas;
