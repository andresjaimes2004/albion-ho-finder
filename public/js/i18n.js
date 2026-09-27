'use strict';

/**
 * i18n.js
 * ----------------------------------------------------------------------
 * Traducción de los textos que genera el JavaScript. El idioma lo fija
 * la página (<html lang="en"> en /en/); no se detecta del navegador.
 *
 *  - t('Texto en español', { n: 3 }): la clave es el propio texto en
 *    español, así el código se sigue leyendo en español. Los {nombre} se
 *    sustituyen por los valores.
 *  - tn(n, 'singular', 'plural'): elige la forma según n y rellena {n}.
 *  - También traduce etiquetas y mensajes que llegan ya escritos desde el
 *    servidor (tipos de camino, errores frecuentes). Si falta una
 *    traducción se muestra el texto original.
 *
 * Las pruebas comprueban que cada t('...') del frontend tenga su
 * traducción en EN.
 * ----------------------------------------------------------------------
 */

export const idioma =
  typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'es';

/** Configuración regional para fechas y horas. */
export const regional = idioma === 'en' ? 'en-US' : 'es';

export const EN = {
  // --- Buscador de hideouts ---
  'Ver mapa de la Zona Negra': 'Show Black Zone map',
  'Ocultar mapa': 'Hide map',
  'No se pudo conectar con el servidor.': 'Could not connect to the server.',
  'Temporada {codigo}': 'Season {codigo}',
  '{n} mapa': '{n} map',
  '{n} mapas': '{n} maps',
  '{n} hideout': '{n} hideout',
  '{n} hideouts': '{n} hideouts',
  'Ver el mapa {mapa} en detalle': 'View map {mapa} in detail',
  'Ver mapa': 'View map',
  '{n} ruta': '{n} route',
  '{n} rutas': '{n} routes',
  '{n} conexión': '{n} connection',
  '{n} conexiones': '{n} connections',
  'Conexiones directas de este mapa': 'Direct connections of this map',
  'Ver en Caminos de Avalon': 'View in Avalonian Roads',
  'Ubicación marcada en el mapa': 'Location marked on the map',

  // --- Rutas y relojes ---
  'cierra en ': 'closes in ',
  'cerrada': 'closed',
  'Cierra a las {hora}': 'Closes at {hora}',
  '{n} tramo': '{n} leg',
  '{n} tramos': '{n} legs',
  'gremio': 'guild',
  'gremio · {usuario}': 'guild · {usuario}',
  'Borrar esta ruta': 'Delete this route',
  'No se pudo borrar.': 'Could not delete it.',
  'Zona desconocida': 'Unknown zone',
  'Portal': 'Portal',
  'Mapa desconocido': 'Unknown map',
  'sin hora de cierre': 'no closing time',

  // --- Caminos de Avalon ---
  'Mineral': 'Ore',
  'Madera': 'Wood',
  'Fibra': 'Fiber',
  'Piel': 'Hide',
  'Piedra': 'Stone',
  'No se pudieron cargar los caminos de Avalon.': 'Could not load the Avalonian roads.',
  'Mapa de Zona Negra': 'Black Zone map',
  'Otro mapa': 'Other map',
  'mapa': 'map',
  'mapas': 'maps',
  '{n} conexión activa': '{n} open connection',
  '{n} conexiones activas': '{n} open connections',
  'Conexiones registradas por los usuarios desde capturas del juego':
    'Connections logged by users from in-game screenshots',
  'con conexiones abiertas': 'with open connections',
  'Ningún camino coincide con la búsqueda.': 'No road matches your search.',
  'Ver conexiones de {nombre}': 'View connections of {nombre}',
  'sin conexiones': 'no connections',
  '{n} dungeon': '{n} dungeon',
  '{n} dungeons': '{n} dungeons',
  'Consultando conexiones...': 'Looking up connections...',
  'No se pudo consultar ese mapa.': 'Could not look up that map.',
  'Cerrar detalle': 'Close details',
  'Ver mapa de Zona Negra': 'View Black Zone map',
  'Conexiones abiertas ahora': 'Connections open now',
  'No hay conexiones registradas en este momento. Si estás en este camino, registra sus portales desde una captura del juego con el panel "Registrar conexiones desde capturas".':
    'No connections logged right now. If you are on this road, log its portals from an in-game screenshot with the "Log connections from screenshots" panel.',
  'Portal que sale de este mapa': 'Portal leaving this map',
  'Portal que llega a este mapa': 'Portal arriving at this map',
  'Registrada por un miembro desde una captura del juego': 'Logged by a member from an in-game screenshot',
  'Borrar esta conexión': 'Delete this connection',
  'Datos oficiales del camino': 'Official road data',
  'Dungeons': 'Dungeons',
  '{solo} solo · {grupo} grupo · {elite} élite': '{solo} solo · {grupo} group · {elite} elite',
  'Recursos': 'Resources',
  'Rutas del gremio': 'Guild routes',
  'Rutas que pasan por aquí': 'Routes through here',

  // Etiquetas que envía el servidor (tipos de camino y de zona)
  'Real': 'Royal',
  'Real · roja': 'Royal · red',
  'Zona Negra': 'Black Zone',
  'Zona Negra · baja': 'Black Zone · low',
  'Zona Negra · media': 'Black Zone · medium',
  'Zona Negra · alta': 'Black Zone · high',
  'Avalon · bajo': 'Avalon · low',
  'Avalon · medio': 'Avalon · medium',
  'Avalon · alto': 'Avalon · high',
  'Profundo': 'Deep',
  'Profundo · raid': 'Deep · raid',
  'Hideout': 'Hideout',
  'Hideout profundo': 'Deep hideout',
  'Camino de Avalon': 'Avalonian road',
  'Zona roja': 'Red zone',
  'Zona amarilla': 'Yellow zone',
  'Zona azul': 'Blue zone',
  'Ciudad': 'City',
  'Portal de ciudad': 'City portal',
  'Descanso': 'Rest',
  'Hideout principal (HQ)': 'Headquarters (HQ)',
  'Hideout (HO)': 'Hideout (HO)',

  // --- Cuenta ---
  'Iniciar sesión': 'Sign in',
  'Crear cuenta': 'Sign up',
  'Entrar': 'Sign in',
  'Registrarme': 'Create account',
  '¿No tienes cuenta? Regístrate': 'No account? Sign up',
  'Ya tengo cuenta': 'I already have an account',
  'La contraseña debe tener al menos 10 caracteres, con letras y números.':
    'The password must be at least 10 characters long, with letters and numbers.',
  'Admin': 'Admin',
  'Salir': 'Sign out',
  'Todavía no has hecho búsquedas.': 'You have not searched yet.',

  // --- Mapa mundial ---
  'Cargando mapa de la Zona Negra...': 'Loading the Black Zone map...',
  '{nombre} — T{tier} · {n} hideout(s)': '{nombre} — T{tier} · {n} hideout(s)',
  '{mapas} mapas de Zona Negra · {conexiones} conexiones': '{mapas} Black Zone maps · {conexiones} connections',
  'Mapa del juego: © Sandbox Interactive GmbH, vía la wiki oficial de Albion Online.':
    'Game map: © Sandbox Interactive GmbH, via the official Albion Online wiki.',

  // --- Ventana del mapa ---
  'Mapa': 'Map',
  'Cargando mapa...': 'Loading map...',
  'Rutas de Avalon activas': 'Active Avalon routes',
  'Ir a la ruta en Caminos de Avalon →': 'Go to the route in Avalonian Roads →',
  'Salidas y territorios: dumps oficiales del cliente de Albion Online.':
    'Exits and territories: official Albion Online client data dumps.',
  'La ubicación de cada hideout la marca un administrador: el juego no la publica.':
    'Each hideout location is marked by an administrator: the game does not publish it.',
  'El mapa mundial es ilustrativo: la superposición es aproximada.':
    'The world map is illustrative: the overlay is approximate.',
  'Bosque': 'Forest',
  'Tierras altas': 'Highlands',
  'Montaña': 'Mountain',
  'Estepa': 'Steppe',
  'Pantano': 'Swamp',
  'Tier {tier}': 'Tier {tier}',
  'Cuadrante {cuadrante}': 'Quadrant {cuadrante}',
  'Territorio': 'Territory',
  'Salida': 'Exit',
  'Ir a {destino}': 'Go to {destino}',
  'mapa vecino': 'neighboring map',
  '{gremio} — {tipo} (slot {slot})': '{gremio} — {tipo} (slot {slot})',
  'Este mapa no tiene hideouts registrados en la temporada activa.':
    'This map has no hideouts registered for the current season.',
  'Slot {slot} · ubicado en el mapa': 'Slot {slot} · placed on the map',
  'Slot {slot} · sin ubicar en el mapa': 'Slot {slot} · not placed on the map',
  'Slot {slot}': 'Slot {slot}',
  'Haz clic en el mapa...': 'Click on the map...',
  'Marcar en el mapa': 'Mark on the map',
  'Quitar ubicación': 'Remove location',
  'Eliminar': 'Delete',
  '¿Eliminar el hideout de "{gremio}" (slot {slot})?': 'Delete the hideout of "{gremio}" (slot {slot})?',
  'Haz clic sobre el mapa para fijar la ubicación del hideout seleccionado.':
    'Click on the map to set the location of the selected hideout.',
  'Modo administrador: elige un hideout de la lista para marcar su ubicación, o añade uno nuevo.':
    'Admin mode: pick a hideout from the list to mark its location, or add a new one.',
  'Gremio': 'Guild',
  'Slot': 'Slot',
  'Tipo de hideout': 'Hideout type',
  'Añadir hideout': 'Add hideout',
  'Imagen de fondo propia': 'Custom background image',
  'Ajusta la imagen hasta que las salidas y el borde coincidan con el mapa. Se guarda para todos los visitantes.':
    'Adjust the image until the exits and the border match the map. It is saved for all visitors.',
  'Sube una captura del mapa completo en diamante (PNG, JPG o WebP, máx. 4 MB). Después podrás ajustarla.':
    'Upload a screenshot of the full diamond-shaped map (PNG, JPG or WebP, max. 4 MB). You can adjust it afterwards.',
  'Subir imagen de fondo': 'Upload background image',
  'Escala': 'Scale',
  'Mover X': 'Move X',
  'Mover Y': 'Move Y',
  'Rotación': 'Rotation',
  'Guardar ajuste': 'Save adjustment',
  'Quitar imagen': 'Remove image',
  '¿Quitar la imagen de fondo de este mapa?': 'Remove the background image of this map?',

  // --- Registro desde capturas ---
  'Cerrar': 'Close',
  'Abrir': 'Open',
  'Leyendo la captura…': 'Reading the screenshot…',
  'Preparando el lector de capturas (solo la primera vez)…': 'Preparing the screenshot reader (first time only)…',
  'Revisa los datos y guarda.': 'Check the data and save.',
  'Completa los campos resaltados.': 'Fill in the highlighted fields.',
  'No se pudo leer la captura. Puedes escribir los datos a mano.':
    'Could not read the screenshot. You can type the data by hand.',
  'Quitar esta captura': 'Remove this screenshot',
  'horas': 'hours',
  'minutos': 'minutes',
  'Origen': 'From',
  'Destino': 'To',
  'Cierra en': 'Closes in',
  'Sin recuadro': 'No tooltip',
  'Lista para guardar.': 'Ready to save.',
  'Ruta {ruta} · tramo {tramo} de {total}': 'Route {ruta} · leg {tramo} of {total}',
  'Ruta {n}': 'Route {n}',
  'En {n} rutas: {lista}': 'In {n} routes: {lista}',
  'Hay demasiadas combinaciones: se muestran las primeras {n} rutas.': 'Too many combinations: showing the first {n} routes.',
  ' · {n} tramos': ' · {n} legs',
  ' (se guardarán por separado)': ' (will be saved separately)',
  'Invertir sentido': 'Reverse direction',
  'Agrupar como ruta': 'Group as a route',
  'Guardar tramos por separado': 'Save legs separately',
  'Guardar {n} conexión': 'Save {n} connection',
  'Guardar {n} conexiones': 'Save {n} connections',
  'Guardar conexiones': 'Save connections',
  'Guardando…': 'Saving…',
  '{n} nueva': '{n} new',
  '{n} nuevas': '{n} new',
  '{n} actualizada': '{n} updated',
  '{n} actualizadas': '{n} updated',
  ' y ': ' and ',
  'Guardado: {resumen}. ¡Gracias!': 'Saved: {resumen}. Thank you!',
  'No se pudo guardar.': 'Could not save.',
  'No se encontró el recuadro del portal ni el título del camino en la imagen.':
    'Neither the portal tooltip nor the road title was found in the image.',
  'No se ve el recuadro de un portal: pasa el cursor por encima del portal antes de sacar la captura.':
    'No portal tooltip is visible: hover over the portal before taking the screenshot.',

  // --- Administración ---
  'Temporada': 'Season',
  'Mapas': 'Maps',
  'Mapas con geografía': 'Maps with geography',
  'Gremios': 'Guilds',
  'Hideouts': 'Hideouts',
  'Administradores': 'Administrators',
  'Ningún gremio coincide con la búsqueda.': 'No guild matches your search.',
  'Guardar nombre': 'Save name',
  'Gremio actualizado: {nombre}': 'Guild updated: {nombre}',
  'Logo actualizado para {nombre}.': 'Logo updated for {nombre}.',
  'Quitar logo': 'Remove logo',
  'Administrador': 'Administrator',
  'Usuario': 'User',
  'Rol actualizado para {usuario}.': 'Role updated for {usuario}.',
  'Desactivar': 'Deactivate',
  'Activar': 'Activate',
  'Último acceso: {fecha}': 'Last access: {fecha}',
  'Sin accesos': 'Never signed in',
  'Sin cambios registrados.': 'No changes logged.',
  'sistema': 'system',

  // --- Mensajes frecuentes del servidor ---
  'No se pudo completar la operación.': 'The operation could not be completed.',
  'Usuario o contraseña incorrectos.': 'Wrong username or password.',
  'Demasiados intentos. Espera un minuto.': 'Too many attempts. Wait a minute.',
  'Ese nombre de usuario ya está tomado.': 'That username is already taken.',
  'El usuario solo admite letras, números, punto, guion y guion bajo.':
    'Usernames can only contain letters, numbers, dots, hyphens and underscores.',
  'Debes iniciar sesión.': 'You need to sign in.',
  'No tienes permisos para esta acción.': 'You do not have permission for this action.',
  'Token de seguridad inválido. Recarga la página.': 'Invalid security token. Reload the page.',
  'Error interno del servidor.': 'Internal server error.',
  'No hay una temporada activa.': 'There is no active season.',
  'No se encontró ese mapa de la Zona Negra.': 'That Black Zone map was not found.',
  'No se encontró ningún camino de Avalon ni mapa con ese nombre.': 'No Avalonian road or map has that name.',
  'No se envió ninguna conexión.': 'No connection was sent.',
  'Formato no admitido. Usa PNG, JPG o WebP.': 'Unsupported format. Use PNG, JPG or WebP.',
  'Contraseña actualizada. Vuelve a iniciar sesión.': 'Password updated. Please sign in again.',
};

const tiene = Object.prototype.hasOwnProperty;

export function t(texto, valores = {}) {
  const base = idioma === 'en' && tiene.call(EN, texto) ? EN[texto] : texto;
  return base.replace(/\{(\w+)\}/g, (marca, clave) => (tiene.call(valores, clave) ? String(valores[clave]) : marca));
}

/** Singular o plural según n; {n} se rellena solo. */
export function tn(n, singular, plural, valores = {}) {
  return t(n === 1 ? singular : plural, { n, ...valores });
}
