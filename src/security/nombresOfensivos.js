'use strict';

/**
 * nombresOfensivos.js
 * ----------------------------------------------------------------------
 * Filtro de nombres de usuario ofensivos (insultos, groserías, términos
 * denigrantes o de odio) en español e inglés.
 *
 * Cómo compara:
 *  - Pasa el nombre a minúsculas, quita tildes (no la ñ), deshace el
 *    "leet" típico (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, 8→b, $→s) y quita los
 *    separadores (. _ -): "Hij0_De_Pu7a" o "p.u.t.o" no se cuelan.
 *  - Compara también con las letras repetidas juntadas ("puuuta" → "puta").
 *  - Dos listas:
 *     · CONTIENE: palabras largas o inequívocas que no pueden aparecer en
 *       ninguna parte del nombre.
 *     · PALABRA: palabras cortas que aparecen dentro de palabras inocentes
 *       ("puta" en "computadora", "ass" en "assassin", "cock" en "peacock",
 *       "marica" en "Maricarmen"). Solo se rechazan si son una palabra del
 *       nombre (entre separadores, números o cambios de mayúscula) o el
 *       nombre entero.
 *
 * Es una red, no un muro: nadie puede listar todas las formas de insultar.
 * Un administrador puede desactivar las cuentas que se salten el filtro.
 * ----------------------------------------------------------------------
 */

const CONTIENE = [
  // Español
  'hijodeputa', 'hijueputa', 'hijoeputa', 'malparid', 'gonorrea', 'pendej', 'maricon', 'mariquita', 'maraco',
  'culero', 'culiado', 'culiao', 'cabron', 'mierda', 'putita', 'putona', 'putazo', 'follador', 'chupapija',
  'chupapinga', 'chupaverga', 'mamaverga', 'mamaguevo', 'mamahuevo', 'huevon', 'gilipollas', 'soplapollas',
  'imbecil', 'idiota', 'estupid', 'retrasad', 'retardad', 'subnormal', 'mongolo', 'mogolico', 'sudaca', 'negrata',
  'tortillera', 'bollera', 'travelo', 'violador', 'pedofil', 'zoofil', 'nazi', 'hitler', 'kkk', 'siegheil',
  'conchetumadre', 'conchadetumadre', 'coñoetumadre', 'chingatumadre', 'chingada', 'lameculos', 'comemierda',
  'carechimba', 'caremonda', 'malnacid', 'bastardo', 'prostitut', 'ramera',
  // Inglés
  'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retarded', 'asshole',
  'motherfuck', 'bastard', 'pussy', 'dickhead', 'cocksuck', 'jerkoff', 'wanker', 'twat', 'bollock', 'tranny',
  'chink', 'raghead', 'towelhead', 'wetback', 'rapist', 'molest', 'porn', 'killyourself', 'dumbass', 'jackass',
  'dipshit', 'shithead', 'douche',
];

const PALABRA = [
  // Español
  'puta', 'puto', 'putas', 'putos', 'verga', 'zorra', 'perra', 'culo', 'coño', 'polla', 'pija', 'pinga',
  'teta', 'tetas', 'joto', 'naco', 'marica', 'tarado', 'hdp', 'weon', 'capullo',
  // Inglés
  'ass', 'dick', 'cock', 'rape', 'fag', 'fags', 'cum', 'tits', 'hoe', 'hoes', 'dyke', 'spic', 'coon', 'kys', 'retard', 'retards',
];

// Palabras inocentes conocidas que contienen una de CONTIENE ("cunt" en
// Scunthorpe...): se retiran antes de comparar.
const EXCEPCIONES = ['scunthorpe', 'penistone', 'cockburn', 'shitake', 'shiitake', 'hancock', 'dickens', 'matsushita', 'nigeria'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', $: 's', '@': 'a', '!': 'i' };

function desLeet(texto) {
  return texto.replace(/[0134578$@!]/g, (c) => LEET[c]);
}

function sinTildes(texto) {
  // Conserva la ñ (coño no es cono), quita las demás tildes.
  return texto.replace(/ñ/g, '\u0000').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0000/g, 'ñ');
}

function juntarRepetidas(texto) {
  return texto.replace(/(.)\1+/g, '$1');
}

/**
 * Formas con las que se compara cada palabra de la lista: tal cual y con
 * las repetidas juntadas, salvo que así quede demasiado corta ("kkk" no
 * puede convertirse en "k", ni "ass" en "as").
 */
function formas(lista, minimo) {
  const salida = new Set();
  for (const palabra of lista) {
    const limpia = sinTildes(palabra);
    salida.add(limpia);
    const junta = juntarRepetidas(limpia);
    if (junta.length >= minimo) salida.add(junta);
  }
  return [...salida];
}

const CONTIENE_FORMAS = formas(CONTIENE, 4);
const PALABRA_FORMAS = new Set(formas(PALABRA, 3));

/** Palabras del nombre: separadores, números y cambios de minúscula a mayúscula. */
function palabras(nombre) {
  return nombre
    .replace(/([a-zñ])([A-ZÑ])/g, '$1 $2')
    .split(/[\s._\-0-9]+/)
    .map((p) => sinTildes(p.toLowerCase()))
    .filter(Boolean);
}

/** true si el nombre contiene un insulto o un término ofensivo. */
function esOfensivo(nombre) {
  const original = String(nombre || '');
  const compacto = desLeet(sinTildes(original.toLowerCase())).replace(/[\s._-]+/g, '');
  const limpio = EXCEPCIONES.reduce((texto, palabra) => texto.split(palabra).join(''), compacto);
  const variantes = [limpio, juntarRepetidas(limpio)];
  if (variantes.some((v) => CONTIENE_FORMAS.some((p) => v.includes(p)))) return true;

  // Palabras cortas: solo sueltas (con y sin leet) o como nombre entero.
  const sueltas = [...palabras(original), ...palabras(desLeet(original)), compacto, compacto.replace(/[0-9]+$/, '')];
  return sueltas.some((p) => PALABRA_FORMAS.has(p) || PALABRA_FORMAS.has(juntarRepetidas(p)));
}

module.exports = { esOfensivo };
