'use strict';

/**
 * sembrarDemo.js
 * ----------------------------------------------------------------------
 * Datos de ejemplo para ver el sitio en local con contenido: dos cuentas
 * de prueba, rutas públicas, un espacio privado con su ruta, gremios en un
 * camino de hideouts (uno "del Excel") y avisos pendientes.
 *
 *   node herramientas/demo/sembrarDemo.js           → crea (o recrea) la demo
 *   node herramientas/demo/sembrarDemo.js --borrar  → borra todo lo de la demo
 *
 * SOLO PARA LA BASE DE DATOS LOCAL. Las claves de las cuentas de prueba se
 * generan al azar y se guardan en credenciales-demo.local.txt (junto a este
 * archivo, ignorado por git). Todo lo creado queda a nombre de las cuentas
 * demo_*: --borrar lo quita sin tocar nada más.
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (process.env.NODE_ENV === 'production') {
  console.error('sembrarDemo.js es solo para la base de datos local.');
  process.exit(1);
}

const db = require('../../src/config/database');
const AuthService = require('../../src/services/AuthService');
const ReportesCaminosService = require('../../src/services/ReportesCaminosService');
const EspaciosService = require('../../src/services/EspaciosService');
const HideoutsCaminoService = require('../../src/services/HideoutsCaminoService');

const CUENTAS = ['demo_lider', 'demo_amigo'];
const ARCHIVO_CLAVES = path.join(__dirname, 'credenciales-demo.local.txt');

function borrarDemo() {
  const conexion = db.getConnection();
  let borradas = 0;
  db.transaccion(() => {
    for (const usuario of CUENTAS) {
      const fila = conexion.prepare('SELECT id FROM usuarios WHERE usuario = $u').get({ $u: usuario });
      if (!fila) continue;
      conexion.prepare('DELETE FROM espacios WHERE creador_id = $id').run({ $id: fila.id });
      for (const tabla of ['rutas_reportadas', 'conexiones_reportadas', 'hideouts_camino', 'busquedas', 'sesiones']) {
        conexion.prepare(`DELETE FROM ${tabla} WHERE usuario_id = $id`).run({ $id: fila.id });
      }
      borradas += conexion.prepare('DELETE FROM usuarios WHERE id = $id').run({ $id: fila.id }).changes;
    }
    // Rutas que quedaron sin alguno de sus tramos.
    conexion.exec(`DELETE FROM rutas_reportadas
                   WHERE (SELECT COUNT(*) FROM rutas_tramos t WHERE t.ruta_id = rutas_reportadas.id) < total_tramos`);
  });
  fs.rmSync(ARCHIVO_CLAVES, { force: true });
  return borradas;
}

function sembrar() {
  borrarDemo();
  const auth = new AuthService();
  const claves = {};
  const cuentas = {};
  for (const usuario of CUENTAS) {
    claves[usuario] = `Demo${crypto.randomBytes(9).toString('base64url')}9`;
    cuentas[usuario] = auth.registrar({ usuario, clave: claves[usuario] });
  }
  const { demo_lider: lider, demo_amigo: amigo } = cuentas;
  const reportes = new ReportesCaminosService();

  // Rutas públicas: una hasta una ciudad y otra que termina en un camino de hideouts.
  reportes.registrar(
    lider.id,
    [
      { origen: 'Deepwood Copse', destino: 'Ouyos-Aoeuam', minutos: 180 },
      { origen: 'Ouyos-Aoeuam', destino: 'Cases-Ugumlos', minutos: 150 },
      { origen: 'Cases-Ugumlos', destino: 'Lymhurst', minutos: 120 },
    ],
    [[0, 1, 2]]
  );
  reportes.registrar(
    amigo.id,
    [
      { origen: 'Battlebrae Lake', destino: 'Casos-Aiagsum', minutos: 200 },
      { origen: 'Casos-Aiagsum', destino: 'Qiient-Al-Nusom', minutos: 95 },
    ],
    [[0, 1]]
  );

  // Espacio privado con dos cuentas y una ruta solo para ellas.
  const espacios = new EspaciosService();
  const espacio = espacios.crear(lider, { nombre: 'Demo Gankers' });
  espacios.agregarMiembro(lider, espacio.id, 'demo_amigo');
  reportes.registrar(
    lider.id,
    [
      { origen: 'Battlebrae Lake', destino: 'Ouyos-Aoeuam', minutos: 240 },
      { origen: 'Ouyos-Aoeuam', destino: 'Martlock', minutos: 75 },
    ],
    [[0, 1]],
    { espacioId: espacio.id }
  );

  // Gremios en el camino de hideouts: uno anotado en la web y otro "del Excel".
  const hideouts = new HideoutsCaminoService();
  hideouts.agregar(amigo, 'Qiient-Al-Nusom', 'Los Topos');
  hideouts.repositorio.guardar({
    camino: 'Qiient-Al-Nusom',
    gremio: 'R E Q U I E M',
    gremioNormalizado: 'r e q u i e m',
    usuarioId: lider.id,
    origen: 'excel',
  });

  fs.writeFileSync(
    ARCHIVO_CLAVES,
    [
      'Cuentas de prueba de la demo local (solo para http://localhost:3000).',
      'Se borran con: node herramientas/demo/sembrarDemo.js --borrar',
      '',
      ...CUENTAS.map((u) => `${u}  ${claves[u]}`),
      '',
    ].join('\n')
  );
  return { espacio: espacio.nombre };
}

try {
  if (process.argv.includes('--borrar')) {
    console.log(`Demo borrada (${borrarDemo()} cuentas).`);
  } else {
    const r = sembrar();
    console.log(`Demo creada: 3 rutas (una en el espacio privado "${r.espacio}"), 2 gremios en Qiient-Al-Nusom y avisos para demo_amigo.`);
    console.log(`Claves de las cuentas de prueba: ${path.relative(process.cwd(), ARCHIVO_CLAVES)}`);
  }
} finally {
  db.close();
}
