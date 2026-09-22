'use strict';

const Router = require('../http/Router');
const { binario } = require('../http/cuerpo');

const buscador = require('../controllers/buscadorController');
const auth = require('../controllers/authController');
const mapas = require('../controllers/mapaController');
const admin = require('../controllers/adminController');
const db = require('../config/database');
const crearLimitador = require('../middlewares/limitador');
const config = require('../config/seguridad');
const { exigirAutenticacion, exigirAdmin } = require('../middlewares/autenticacion');

const router = new Router();

/**
 * Limitadores: uno general para toda la API y otro más estricto en las
 * rutas de autenticación, que son las más interesantes de automatizar
 * para un atacante.
 */
const limitarGeneral = crearLimitador({
  maximo: config.limites.peticionesPorMinuto,
  ventanaMs: 60_000,
});
const limitarAuth = crearLimitador({
  maximo: 15,
  ventanaMs: 60_000,
  mensaje: 'Demasiados intentos. Espera un minuto.',
});

router.use(limitarGeneral);

// ---------------------------------------------------------------- público ---

router.get('/buscar', buscador.buscarGremio);
router.get('/mapas', mapas.mundo);
router.get('/mapas/:nombre', mapas.detalle);
router.get('/gremios/:id/logo', admin.servirLogo);

router.get('/salud', (req, res) => {
  try {
    db.getConnection().prepare('SELECT 1').get();
    res.json({ ok: true, estado: 'operativo' });
  } catch (error) {
    // No se devuelve el detalle: podría revelar rutas internas del servidor.
    res.status(500).json({ ok: false, estado: 'error' });
  }
});

// --------------------------------------------------------------- sesiones ---

router.post('/auth/registro', limitarAuth, auth.registrar);
router.post('/auth/login', limitarAuth, auth.iniciarSesion);
router.post('/auth/logout', auth.cerrarSesion);
router.get('/auth/sesion', auth.sesionActual);
router.post('/auth/clave', exigirAutenticacion, auth.cambiarClave);

// -------------------------------------------------------------- historial ---

router.get('/historial', exigirAutenticacion, buscador.historial);
router.delete('/historial', exigirAutenticacion, buscador.limpiarHistorial);

// ------------------------------------------------------------------ admin ---

const rutasAdmin = new Router();
rutasAdmin.use(exigirAdmin);

rutasAdmin.get('/resumen', admin.resumen);

rutasAdmin.get('/gremios', admin.buscarGremios);
rutasAdmin.put('/gremios/:id/nombre', admin.renombrarGremio);
rutasAdmin.put('/gremios/:id/notas', admin.notasGremio);
rutasAdmin.put(
  '/gremios/:id/logo',
  binario({ tipos: config.logo.tiposPermitidos, limite: config.limites.logoBytes }),
  admin.subirLogo
);
rutasAdmin.delete('/gremios/:id/logo', admin.borrarLogo);

rutasAdmin.put('/mapas/:id/nombre', admin.renombrarMapa);

rutasAdmin.post('/hideouts', admin.crearHideout);
rutasAdmin.put('/hideouts/:id', admin.actualizarHideout);
rutasAdmin.put('/hideouts/:id/posicion', admin.posicionarHideout);
rutasAdmin.delete('/hideouts/:id', admin.eliminarHideout);

rutasAdmin.get('/usuarios', admin.listarUsuarios);
rutasAdmin.put('/usuarios/:id/estado', admin.cambiarEstadoUsuario);
rutasAdmin.put('/usuarios/:id/rol', admin.cambiarRolUsuario);

rutasAdmin.get('/auditoria', admin.auditoria);

router.use('/admin', rutasAdmin);

// Cualquier ruta /api desconocida responde JSON, nunca el index.html.
router.use((req, res) => {
  res.status(404).json({ ok: false, mensaje: 'Recurso no encontrado.' });
});

module.exports = router;
