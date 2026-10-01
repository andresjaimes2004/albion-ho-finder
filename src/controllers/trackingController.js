'use strict';

const TrackingService = require('../services/TrackingService');
const ReportesCaminosService = require('../services/ReportesCaminosService');
const HideoutsCaminoService = require('../services/HideoutsCaminoService');
const EspaciosService = require('../services/EspaciosService');
const AuditoriaRepository = require('../repositories/AuditoriaRepository');
const { texto, entero, ErrorValidacion } = require('../security/validacion');

const MAX_MAPAS_CONSULTA = 50;
const { manejar } = require('./utilidades');

/**
 * trackingController
 * ----------------------------------------------------------------------
 * GET    /api/tracking               → catálogo de caminos de Avalon + todas
 *                                      las conexiones vigentes
 * GET    /api/tracking/zonas         → zonas oficiales (para leer capturas)
 * GET    /api/tracking/rutas?mapas=A,B → rutas del gremio y conexiones de
 *                                      esos mapas (vista de hideouts)
 * GET    /api/tracking/:nombre       → un camino o mapa: datos oficiales y
 *                                      sus conexiones vigentes
 * POST   /api/tracking/reportes      → registrar conexiones (con sesión),
 *                                      en público o en un espacio privado
 * DELETE /api/tracking/reportes/:id  → borrar una (autor o admin)
 * GET    /api/tracking/hideouts?camino=X → gremios con hideout en un
 *                                      camino de Avalon de hideouts
 * POST   /api/tracking/hideouts      → anotar un gremio (con sesión)
 * DELETE /api/tracking/hideouts/:id  → borrar la anotación (autor o admin)
 * PUT    /api/tracking/rutas/:id     → editar una ruta (autor o admin)
 * DELETE /api/tracking/rutas/:id     → borrar una ruta (autor o admin)
 * DELETE /api/tracking/rutas?alcance=todas|activas|zona|portal&valor=X
 *                                    → borrado masivo (solo admin)
 *
 * Las consultas solo devuelven lo que quien pregunta puede ver: lo
 * público, lo de sus espacios privados y lo de espacios abiertos.
 * ----------------------------------------------------------------------
 */
const hideouts = new HideoutsCaminoService();
const servicio = new TrackingService({ hideoutsCamino: hideouts });
const reportes = new ReportesCaminosService();
const espacios = new EspaciosService();
/** Qué espacios puede ver quien hace la petición (sin sesión: solo los abiertos). */
const visor = (req) => espacios.visor(req.usuario || null);

const resumen = manejar(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await servicio.resumen(visor(req)));
});

const zonas = manejar((req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  // `hideout`: camino de Avalon de hideouts (una ruta puede terminar ahí).
  const zonas = reportes
    .zonasPublicas()
    .map((z) => (z.grupo === 'avalon' && hideouts.esCaminoHideout(z.nombre) ? { ...z, hideout: true } : z));
  res.json({ ok: true, zonas });
});

const detalle = manejar(async (req, res) => {
  const nombre = texto(req.params.nombre, 'mapa', { min: 2, max: 80 });
  const resultado = await servicio.detalle(nombre, visor(req));

  res.set('Cache-Control', 'no-store');
  if (!resultado.ok) {
    return res.status(404).json(resultado);
  }
  return res.json(resultado);
});

/** Lista "A,B,C" de nombres de mapa, validada y sin repetidos. */
function listaDeMapas(valor) {
  const crudo = texto(valor, 'mapas', { min: 2, max: MAX_MAPAS_CONSULTA * 81 });
  const nombres = [...new Set(crudo.split(',').map((n) => n.trim()).filter(Boolean))];
  if (nombres.length > MAX_MAPAS_CONSULTA) {
    throw new ErrorValidacion(`Como máximo ${MAX_MAPAS_CONSULTA} mapas por consulta.`);
  }
  return nombres.map((n) => texto(n, 'mapa', { min: 2, max: 80 }));
}

const rutasDeMapas = manejar(async (req, res) => {
  const nombres = listaDeMapas(req.query.mapas);
  res.set('Cache-Control', 'no-store');
  res.json(await servicio.paraMapas(nombres, visor(req)));
});

const registrar = manejar((req, res) => {
  const cuerpo = req.body || {};
  // null = público; si no, un espacio del que sea miembro (o 404).
  const espacioId = espacios.espacioParaRegistrar(req.usuario, cuerpo.espacio ?? null);
  const resultado = reportes.registrar(req.usuario.id, cuerpo.conexiones, cuerpo.rutas || [], { espacioId });
  res.status(201).json({ ok: true, ...resultado });
});

const eliminar = manejar((req, res) => {
  reportes.eliminar(req.usuario, entero(req.params.id, 'id', { min: 1 }));
  res.json({ ok: true });
});

const editarRuta = manejar((req, res) => {
  const cuerpo = req.body || {};
  const ruta = reportes.editarRuta(req.usuario, entero(req.params.id, 'id', { min: 1 }), cuerpo.conexiones);
  res.json({ ok: true, ruta });
});

const listarHideoutsCamino = manejar((req, res) => {
  const camino = texto(req.query.camino, 'camino', { min: 2, max: 80 });
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, hideouts: hideouts.listar(camino) });
});

const agregarHideoutCamino = manejar((req, res) => {
  const cuerpo = req.body || {};
  const registro = hideouts.agregar(req.usuario, cuerpo.camino, cuerpo.gremio);
  res.status(registro.nuevo ? 201 : 200).json({ ok: true, hideout: registro });
});

const eliminarHideoutCamino = manejar((req, res) => {
  hideouts.eliminar(req.usuario, entero(req.params.id, 'id', { min: 1 }));
  res.json({ ok: true });
});

const auditoria = new AuditoriaRepository();

const borrarRutasEnBloque = manejar((req, res) => {
  const alcance = texto(req.query.alcance, 'alcance', { min: 4, max: 10 });
  const valor = texto(req.query.valor, 'valor', { min: 2, max: 80, obligatorio: false });
  // Solo lo público: los espacios privados no se tocan.
  const resultado = servicio.borrarRutas({ alcance, valor, visor: espacios.visor(null) });
  auditoria.registrar({
    usuarioId: req.usuario.id,
    accion: 'BORRAR_RUTAS',
    entidad: 'rutas',
    detalle: { alcance, valor, ...resultado },
  });
  res.json({ ok: true, ...resultado });
});

const eliminarRuta = manejar((req, res) => {
  reportes.eliminarRuta(req.usuario, entero(req.params.id, 'id', { min: 1 }));
  res.json({ ok: true });
});

module.exports = {
  resumen,
  zonas,
  rutasDeMapas,
  detalle,
  registrar,
  eliminar,
  editarRuta,
  eliminarRuta,
  borrarRutasEnBloque,
  listarHideoutsCamino,
  agregarHideoutCamino,
  eliminarHideoutCamino,
};
