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
      'Busca en qué mapas de la Zona Negra tiene hideout cualquier gremio de Albion Online, con su tipo (HQ o personal), y consulta las rutas y caminos de Avalon abiertos ahora. Gratis.',
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
      'Find which Black Zone maps any Albion Online guild has a hideout in, with its type (HQ or personal), and check the Avalonian roads and routes open right now. Free.',
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
  'Busca un gremio para ver en qué mapas tiene hideout, o un mapa para ver quién tiene hideout en él, con su tipo y las rutas de Avalon que llegan.':
    'Search a guild to see which maps it has a hideout in, or a map to see who has a hideout there, with their type and the Avalon routes that lead there.',
  'Buscador de gremios y mapas':
    'Guild and map search',
  'Gremio o mapa':
    'Guild or map',
  'Ej: Gankers Letales o Timbertop Escarp':
    'e.g. Gankers Letales or Timbertop Escarp',
  'Escribe el nombre de un gremio o de un mapa, completo o solo una parte. Toca cualquier mapa del resultado para abrirlo en detalle.':
    'Type the name of a guild or a map, in full or just part of it. Tap any map in the results to open it in detail.',
  'Ver mapa de la Zona Negra': 'Show Black Zone map',
  'Tus últimas búsquedas': 'Your recent searches',
  'Limpiar': 'Clear',
  'Mapa interactivo de la Zona Negra': 'Interactive Black Zone map',
  'Mapa de la Zona Negra': 'Black Zone map',
  'Mapa de clusters de la Zona Negra': 'Black Zone cluster map',
  'Arrastra para moverte; acerca con la rueda, pellizcando, con doble toque o con los botones + y −. Al acercar aparecen los nombres de los mapas. Los mapas resaltados son los de tu búsqueda.':
    'Drag to move; zoom with the wheel, by pinching, by double-tapping or with the + and − buttons. Map names appear as you zoom in. Highlighted maps are the ones from your search.',
  'Editando la ruta': 'Editing the route',
  'Pega capturas nuevas (se colocan solas en su sitio), quita las conexiones que sobran, cambia el orden con ↑ ↓ o corrige los tiempos. Sin ninguna conexión, guardar borra la ruta. Las capturas que tenías pendientes vuelven al terminar.':
    'Paste new screenshots (they fall into place on their own), remove the connections you do not need, reorder them with ↑ ↓ or fix the times. With no connections left, saving deletes the route. Your pending screenshots come back when you finish.',
  'Invertir sentido': 'Reverse direction',
  'Cancelar edición': 'Cancel editing',
  'Excel de Google Drive': 'Google Drive spreadsheet',
  'Sincronizar ahora': 'Sync now',
  'Aplicar de todos modos': 'Apply anyway',
  'Zoom del mapa': 'Map zoom',
  'Acercar': 'Zoom in',
  'Alejar': 'Zoom out',
  'Ver todo el mapa': 'Show the whole map',
  'No se pudo cargar la imagen del mapa desde la wiki oficial de Albion (tu red o tu navegador la bloqueó). El mapa sigue funcionando: puntos, nombres y conexiones.':
    "The map image couldn't be loaded from the official Albion wiki (your network or browser blocked it). The map still works: points, names and connections.",
  'Colores por tier': 'Colors by tier',
  'Con hideouts': 'With hideouts',
  'Escribe al menos 2 caracteres para empezar a buscar.': 'Type at least 2 characters to start searching.',
  'Buscando en la Zona Negra...': 'Searching the Black Zone...',
  'No se encontró ningún gremio ni mapa con ese nombre.':
    'No guild or map was found with that name.',
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
  '© 2026 Albion Navigator. Todos los derechos reservados.': '© 2026 Albion Navigator. All rights reserved.',
  'Creado por <strong>TurnDark</strong>': 'Created by <strong>TurnDark</strong>',
  'Albion Online es una marca registrada de Sandbox Interactive GmbH. Albion Navigator es un proyecto independiente y no está afiliado, aprobado ni patrocinado por Sandbox Interactive. Datos actualizados por temporada; geografía de los mapas tomada de los dumps públicos del cliente del juego.':
    'Albion Online is a registered trademark of Sandbox Interactive GmbH. Albion Navigator is an independent project and is not affiliated with, endorsed or sponsored by Sandbox Interactive. Data updated every season; map geography comes from the public game client data dumps.',
  'Detalle del mapa': 'Map details',
  'Centrar': 'Center',
  'Cerrar': 'Close',
  'Mapa del cluster': 'Cluster map',
  'Salida a mapa vecino': 'Exit to neighboring map',
  'Ciudad o pasaje (no se abre)': 'City or passage (does not open)',
  'Rutas de Avalon de este mapa': 'Avalon routes for this map',
  'Hideouts en este mapa': 'Hideouts on this map',
  'Cuenta': 'Account',
  'Iniciar sesión': 'Sign in',
  'Usuario': 'Username',
  'Contraseña': 'Password',
  'Entrar': 'Sign in',
  '¿No tienes cuenta? Regístrate': 'No account? Sign up',

  // Portada, cifras, funciones y donaciones
  'Apoyar': 'Support',
  'Encuentra cualquier hideout. Sigue cada ruta de Avalon.': 'Find any hideout. Follow every Avalon route.',
  'Albion Navigator reúne los hideouts de la Zona Negra y las rutas de Avalon que registra la comunidad de Albion Online. Es gratis, sin anuncios y no necesitas cuenta para buscar.':
    'Albion Navigator brings together Black Zone hideouts and the Avalon routes logged by the Albion Online community. It is free, ad-free and you do not need an account to search.',
  'Buscar un gremio': 'Search a guild',
  'Apoyar el proyecto': 'Support the project',
  '100 % gratis · Sin anuncios · Español e inglés': '100% free · No ads · English and Spanish',
  'Albion Navigator en cifras': 'Albion Navigator in numbers',
  'hideouts registrados': 'hideouts registered',
  'mapas de la Zona Negra con hideouts': 'Black Zone maps with hideouts',
  'caminos de Avalon en el catálogo': 'Avalonian roads in the catalog',
  'temporada actual, datos al día': 'current season, up-to-date data',
  'Todo lo que necesitas para moverte por Albion': 'Everything you need to find your way in Albion',
  'Tres herramientas pensadas para gremios, exploradores y cazadores de la Zona Negra.':
    'Three tools built for guilds, scouts and Black Zone hunters.',
  'Busca hideouts': 'Find hideouts',
  'Busca un gremio o un mapa y mira sus hideouts, con su tipo, sobre el mapa del juego.':
    'Search a guild or a map and see its hideouts, with their type, on the game map.',
  'Sigue las rutas de Avalon': 'Follow Avalon routes',
  'Consulta los 400 caminos y los portales abiertos ahora, con la cuenta regresiva hasta que cierran.':
    'Check all 400 roads and the portals open right now, with a countdown until they close.',
  'Registra conexiones': 'Log connections',
  'Pega una captura del juego y el lector la convierte en conexiones y rutas para tu gremio.':
    'Paste an in-game screenshot and the reader turns it into connections and routes for your guild.',
  'Mantén Albion Navigator en línea': 'Keep Albion Navigator online',
  'Albion Navigator es gratis y sin anuncios. Si te sirve, puedes donar lo que quieras: cada aporte ayuda a mantenerlo en línea y con actualizaciones constantes.':
    'Albion Navigator is free and ad-free. If it helps you, you can donate any amount: every contribution keeps it online and regularly updated.',
  'Servidor 24/7': 'Server 24/7',
  'Para que el buscador y las rutas estén siempre disponibles.': 'So the finder and the routes are always available.',
  'Dominio propio': 'Own domain',
  'Una dirección fácil de recordar y mejor posicionada.': 'An address that is easy to remember and ranks better.',
  'Datos al día': 'Up-to-date data',
  'Hideouts y mapas actualizados en cada temporada, y funciones nuevas.': 'Hideouts and maps updated every season, plus new features.',
  'Desde cualquier país': 'From any country',
  'Con tarjeta de crédito o débito, o con PayPal. En dólares y sin crear cuenta.':
    'With a credit or debit card, or with PayPal. In US dollars, no account needed.',
  'Donar con Ko-fi': 'Donate on Ko-fi',
  'Muy pronto podrás donar desde aquí.': 'Donations will be available here very soon.',
  'Desde Colombia': 'From Colombia',
  'Sin comisiones y al instante, desde Nequi, Bancolombia, Daviplata o cualquier banco.':
    'Instant and fee-free, from Nequi, Bancolombia, Daviplata or any Colombian bank.',
  'Llave Bre-B': 'Bre-B key',
  '¡Copiada!': 'Copied!',
  'Copiar': 'Copy',
  'Abre la app de tu banco o billetera.': 'Open your bank or wallet app.',
  'Elige enviar con llave Bre-B (o escanea el QR).': 'Choose to send with a Bre-B key (or scan the QR code).',
  'Pega la llave y escribe el valor que quieras donar.': 'Paste the key and enter the amount you want to donate.',
  'Los pagos se hacen en Ko-fi, PayPal o la app de tu banco. Albion Navigator nunca ve ni guarda datos de tarjetas ni de cuentas.':
    'Payments happen on Ko-fi, PayPal or your banking app. Albion Navigator never sees or stores card or account details.',
  'Donar': 'Donate',
  'Preguntas frecuentes': 'Frequently asked questions',

  // Página 404
  'Página no encontrada': 'Page not found',
  'La página que buscas no existe o cambió de dirección.': 'The page you are looking for does not exist or has moved.',
  'Volver al inicio': 'Back to home',
};

module.exports = { SEO, EN };
