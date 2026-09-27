'use strict';

/**
 * pagina.js
 * ----------------------------------------------------------------------
 * Textos de la página principal por idioma.
 *
 *  - SEO: título, descripción y datos estructurados de cada idioma,
 *    pensados para las búsquedas de los jugadores (hideouts de gremios,
 *    Zona Negra / Black Zone, caminos o rutas de Avalon / Avalonian roads).
 *  - EN: traducción de cada texto marcado con {{...}} en
 *    src/vistas/index.html. La clave es el texto en español, así la
 *    plantilla se sigue leyendo en español. Las pruebas exigen que cada
 *    texto marcado tenga su traducción.
 * ----------------------------------------------------------------------
 */

const SEO = {
  es: {
    titulo: 'Albion Navigator — Buscador de hideouts de gremios y rutas de Avalon | Albion Online',
    descripcion:
      'Busca en qué mapas de la Zona Negra tiene hideout cualquier gremio de Albion Online, con slot y tipo (HQ o personal), y consulta las rutas y caminos de Avalon abiertos ahora. Gratis.',
    locale: 'es_ES',
    nombreApp: 'Albion Navigator — Buscador de hideouts y rutas de Avalon',
    palabrasClave: [
      'hideouts Albion Online',
      'buscar hideout de gremio',
      'Zona Negra',
      'caminos de Avalon',
      'rutas de Avalon',
      'mapa de la Zona Negra',
    ],
  },
  en: {
    titulo: 'Albion Navigator — Guild Hideout Finder & Avalonian Roads Tracker | Albion Online',
    descripcion:
      'Find which Black Zone maps any Albion Online guild has a hideout in, with slot and type (HQ or personal), and check the Avalonian roads and routes open right now. Free.',
    locale: 'en_US',
    nombreApp: 'Albion Navigator — Guild hideout finder and Avalonian roads tracker',
    palabrasClave: [
      'Albion Online hideouts',
      'guild hideout finder',
      'Black Zone map',
      'Avalonian roads',
      'Avalon roads tracker',
      'roads of Avalon',
    ],
  },
};

const EN = {
  'Escudo de Albion Navigator sobre arte de Albion Online': 'Albion Navigator crest over Albion Online artwork',
  'Albion Navigator, inicio': 'Albion Navigator, home',
  'Hideouts · Rutas de Avalon': 'Hideouts · Avalon Routes',
  'Secciones': 'Sections',
  'Caminos de Avalon': 'Avalonian Roads',
  'Idioma': 'Language',
  'Hideouts de la Zona Negra': 'Black Zone Guild Hideouts',
  'Escribe el nombre de un gremio y descubre en qué mapas tiene hideout, con su slot, su tipo y las rutas de Avalon que llegan a ellos.':
    'Type a guild name to see every map where it has a hideout, with its slot, its type and the Avalon routes that lead there.',
  'Buscador de gremio': 'Guild search',
  'Nombre del gremio': 'Guild name',
  'Ej: Gankers Letales, ARCH...': 'e.g. Gankers Letales, ARCH...',
  'Escribe el nombre completo o solo una parte. Toca cualquier mapa del resultado para abrirlo en detalle.':
    'Type the full name or just part of it. Tap any map in the results to open it in detail.',
  'Ver mapa de la Zona Negra': 'Show Black Zone map',
  'Tus últimas búsquedas': 'Your recent searches',
  'Limpiar': 'Clear',
  'Mapa interactivo de la Zona Negra': 'Interactive Black Zone map',
  'Mapa de la Zona Negra': 'Black Zone map',
  'Mapa de clusters de la Zona Negra': 'Black Zone cluster map',
  'Arrastra para moverte y usa la rueda para acercar. Los mapas resaltados son los del gremio buscado.':
    'Drag to move and use the wheel to zoom. Highlighted maps belong to the guild you searched for.',
  'Escribe al menos 2 caracteres para empezar a buscar.': 'Type at least 2 characters to start searching.',
  'Buscando en la Zona Negra...': 'Searching the Black Zone...',
  'No se encontró ningún Hideout para ese gremio.': 'No hideout was found for that guild.',
  'Ocurrió un error al consultar los datos.': 'Something went wrong while loading the data.',
  'Panel de administración': 'Admin panel',
  'Administración': 'Administration',
  'Recargar': 'Reload',
  'Gremios': 'Guilds',
  'Buscar gremio para editar...': 'Search a guild to edit...',
  'Usuarios': 'Users',
  'Últimos cambios': 'Latest changes',
  'Explora los 400 caminos avalonianos, filtra por tipo y tier, y mira qué portales están abiertos ahora y cuánto les queda.':
    'Browse all 400 Avalonian roads, filter by type and tier, and see which portals are open right now and how long they have left.',
  'Buscador de caminos de Avalon': 'Avalonian roads search',
  'Camino o mapa': 'Road or map',
  'Ej: Ouyos-Aoeuam, Deepwood Copse...': 'e.g. Ouyos-Aoeuam, Deepwood Copse...',
  'Tipo de camino': 'Road type',
  'Todos los tipos': 'All types',
  'Reales': 'Royal',
  'Zona Negra': 'Black Zone',
  'Profundos': 'Deep',
  'Todos los tiers': 'All tiers',
  'Solo con conexiones activas': 'Only with open connections',
  'Toca un camino para ver sus datos oficiales y las conexiones que tiene abiertas ahora, con el tiempo que les queda.':
    'Tap a road to see its official data and the connections open right now, with the time they have left.',
  'Registrar conexiones desde capturas': 'Log connections from screenshots',
  'Suma al mapa las conexiones que ve tu gremio.': 'Add the connections your guild finds to the map.',
  'Abrir': 'Open',
  'Inicia sesión para registrar conexiones: cada una queda a tu nombre.':
    'Sign in to log connections: each one is saved under your name.',
  'En el juego, abre el mapa del camino y <strong>pasa el cursor por encima de un portal</strong>.':
    'In the game, open the road map and <strong>hover over a portal</strong>.',
  'Saca la captura con <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (pantalla completa o solo esa zona, incluyendo el recuadro del portal).':
    'Take a screenshot with <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (full screen or just that area, including the portal tooltip).',
  'Vuelve aquí y pégala con <kbd>Ctrl</kbd>+<kbd>V</kbd>. Una captura por portal; puedes pegar varias seguidas.':
    'Come back here and paste it with <kbd>Ctrl</kbd>+<kbd>V</kbd>. One screenshot per portal; you can paste several in a row.',
  'Para una <strong>ruta</strong> (Zona Negra → camino → … → mapa final), pega un portal de cada tramo, en cualquier orden: se encadenan solos.':
    'For a <strong>route</strong> (Black Zone → road → … → final map), paste one portal from each leg, in any order: they chain together automatically.',
  'Pega aquí tus capturas (Ctrl+V)': 'Paste your screenshots here (Ctrl+V)',
  'o arrástralas, o': 'or drag them in, or',
  'elige archivos': 'choose files',
  'Guardar conexiones': 'Save connections',
  'Vaciar': 'Clear all',
  'Las capturas se leen en tu navegador y no se suben: solo se guarda lo que confirmas.':
    'Screenshots are read in your browser and never uploaded: only what you confirm is saved.',
  'Rutas del gremio': 'Guild routes',
  'Cargando caminos de Avalon...': 'Loading Avalonian roads...',
  'Mostrar más': 'Show more',
  'Catálogo de caminos: dumps oficiales del cliente de Albion Online (Sandbox Interactive).':
    'Road catalog: official Albion Online client data dumps (Sandbox Interactive).',
  'Conexiones: registradas por los usuarios desde capturas del juego.':
    'Connections: logged by users from in-game screenshots.',
  'Encuentra los hideouts de cualquier gremio en la Zona Negra y sigue las rutas de Avalon que registra la comunidad.':
    'Find any guild’s hideouts in the Black Zone and follow the Avalon routes logged by the community.',
  'Herramientas': 'Tools',
  'Buscador de hideouts': 'Hideout finder',
  'Recursos': 'Resources',
  'Wiki oficial': 'Official wiki',
  'Datos del juego (ao-bin-dumps)': 'Game data (ao-bin-dumps)',
  '© 2026 Albion Navigator · Datos actualizados por temporada.': '© 2026 Albion Navigator · Data updated every season.',
  'Creado por <strong>TurnDark</strong>': 'Created by <strong>TurnDark</strong>',
  'Albion Online es una marca registrada de Sandbox Interactive GmbH. Albion Navigator es un proyecto independiente y no está afiliado, aprobado ni patrocinado por Sandbox Interactive. Geografía de los mapas tomada de los dumps públicos del cliente del juego.':
    'Albion Online is a registered trademark of Sandbox Interactive GmbH. Albion Navigator is an independent project and is not affiliated with, endorsed or sponsored by Sandbox Interactive. Map geography comes from the public game client data dumps.',
  'Detalle del mapa': 'Map details',
  'Centrar': 'Center',
  'Cerrar': 'Close',
  'Mapa del cluster': 'Cluster map',
  'Personal': 'Personal',
  'Salida a mapa vecino': 'Exit to neighboring map',
  'Rutas de Avalon de este mapa': 'Avalon routes for this map',
  'Hideouts en este mapa': 'Hideouts on this map',
  'Cuenta': 'Account',
  'Iniciar sesión': 'Sign in',
  'Usuario': 'Username',
  'Contraseña': 'Password',
  'Entrar': 'Sign in',
  '¿No tienes cuenta? Regístrate': 'No account? Sign up',

  // Página 404
  'Página no encontrada': 'Page not found',
  'La página que buscas no existe o cambió de dirección.': 'The page you are looking for does not exist or has moved.',
  'Volver al inicio': 'Back to home',
};

module.exports = { SEO, EN };
