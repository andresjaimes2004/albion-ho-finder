'use strict';

/**
 * Filtro de nombres de usuario ofensivos (src/security/nombresOfensivos.js).
 *
 * Ejecutar con: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { esOfensivo } = require('../src/security/nombresOfensivos');

test('rechaza insultos y términos de odio en español e inglés, también disfrazados', () => {
  const ofensivos = [
    'HijoDePuta', 'hij0_de_pu7a', 'malparido23', 'Gonorrea', 'pendejo_x', 'maricon', 'cabron',
    'Puta', 'puuuuta', 'xX_Puta_Xx', 'ElPuto', 'puta69', 'la.zorra', 'Marica', 'NaziLord', 'KKK_clan',
    'fuckyou', 'F.U.C.K', 'shithead', 'b1tch', 'NiggaBoy', 'asshole', 'big_ass', 'DickHead', 'kys',
    'retardado', 'retard', 'RetardedKing', 'idiota', 'Imbécil', 'Sudaca', 'Cabronita',
  ];
  for (const nombre of ofensivos) assert.equal(esOfensivo(nombre), true, `"${nombre}" debería rechazarse`);
});

test('no bloquea nombres inocentes que contienen esas letras', () => {
  const inocentes = [
    'Computadora', 'Diputado', 'Assassin', 'Class', 'Passion', 'Peacock', 'Hancock', 'Dickens', 'Grape',
    'Maricarmen', 'Torpedo', 'Kike', 'Enrique', 'Spicy', 'Raccoon', 'Scunthorpe', 'Nigeria', 'Cumbia',
    'As', 'Andres_Jaimes', 'TurnDark', 'Albion.Navigator', 'Culebra', 'Pepito', 'Cabrera', 'Verganza', 'Retardo',
    'Cockatoo', 'Shogun', 'Titan', 'Essex', 'Analyst', 'Cocoon', 'Pedro', 'Nazareth', 'Bitcoin', 'Skyscraper',
  ];
  for (const nombre of inocentes) assert.equal(esOfensivo(nombre), false, `"${nombre}" no debería rechazarse`);
});

test('registrar una cuenta con un nombre ofensivo falla sin decir qué palabra', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const ruta = path.join(os.tmpdir(), `albion-nombres-${Date.now()}.db`);
  process.env.DB_PATH = ruta;
  const AuthService = require('../src/services/AuthService');
  const auth = new AuthService();
  assert.throws(() => auth.registrar({ usuario: 'hijo_de_puta', clave: 'ClaveSegura99' }), (e) => {
    assert.match(e.message, /no está permitido/);
    assert.doesNotMatch(e.message, /puta/i);
    return true;
  });
  assert.equal(auth.registrar({ usuario: 'Maricarmen', clave: 'ClaveSegura99' }).usuario, 'Maricarmen');
  require('../src/config/database').close();
  for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(`${ruta}${sufijo}`, { force: true });
});
