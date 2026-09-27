'use strict';

/**
 * preguntas.js
 * ----------------------------------------------------------------------
 * Preguntas frecuentes de la página de inicio, por idioma. Se pintan como
 * acordeón (src/http/paginas.js) y se publican también como datos
 * estructurados FAQPage de schema.org, para que Google pueda mostrarlas
 * en los resultados. Texto plano: se escapa al generar la página.
 *
 * Las dos listas deben tener las mismas preguntas en el mismo orden (lo
 * comprueban las pruebas).
 * ----------------------------------------------------------------------
 */

const PREGUNTAS = {
  es: [
    {
      pregunta: '¿Qué es Albion Navigator?',
      respuesta:
        'Es una herramienta gratuita para jugadores de Albion Online. Te dice en qué mapas de la Zona Negra tiene hideout cualquier gremio y te muestra las rutas y conexiones de Avalon que están abiertas ahora, registradas por la comunidad.',
    },
    {
      pregunta: '¿Es gratis? ¿Necesito crear una cuenta?',
      respuesta:
        'Es 100 % gratis y sin anuncios. Para buscar hideouts y consultar los caminos de Avalon no necesitas cuenta. Solo la necesitas para registrar conexiones desde capturas, para que cada una quede a tu nombre.',
    },
    {
      pregunta: '¿Cómo encuentro los hideouts de un gremio?',
      respuesta:
        'Entra en el apartado Hideouts y escribe el nombre del gremio, completo o solo una parte. Verás cada mapa donde tiene hideout, con su tipo (HQ o HO). Toca un mapa para abrirlo en detalle, con su ubicación y las rutas de Avalon que llegan a él.',
    },
    {
      pregunta: '¿De dónde salen los datos de los hideouts y de los mapas?',
      respuesta:
        'Los hideouts se actualizan en cada temporada. La geografía de los mapas (salidas, caminos y territorios) y el catálogo de los 400 caminos de Avalon salen de los datos oficiales del cliente del juego. La ubicación exacta de cada hideout la marca un administrador, porque el juego no la publica.',
    },
    {
      pregunta: '¿Qué son los caminos de Avalon y cómo sé cuáles están abiertos?',
      respuesta:
        'Son zonas del juego conectadas entre sí y con el resto del mundo por portales que se abren y se cierran cada pocas horas. En el apartado Caminos de Avalon ves los 400 caminos, las conexiones abiertas ahora y cuánto les queda, con una cuenta regresiva en vivo.',
    },
    {
      pregunta: '¿Cómo registro una conexión o una ruta?',
      respuesta:
        'Inicia sesión y abre "Registrar conexiones desde capturas" en Caminos de Avalon. En el juego, pasa el cursor por encima de un portal, saca una captura (Win+Shift+S) y pégala con Ctrl+V. El lector la convierte en origen, destino y tiempo de cierre; revisa los datos y guarda. Para una ruta, pega un portal de cada tramo y se encadenan solos.',
    },
    {
      pregunta: '¿Mis capturas se suben al servidor?',
      respuesta:
        'No. Las capturas se leen en tu propio navegador y nunca se suben. Solo se guarda lo que confirmas: el origen, el destino y el tiempo de cierre de cada conexión.',
    },
    {
      pregunta: '¿Qué tan actualizadas están las conexiones?',
      respuesta:
        'Dependen de lo que registra la comunidad. Cada conexión muestra quién la registró y desaparece sola cuando cierra. Si ves en el juego un portal que no está en la lista, regístralo: así ayudas a todos.',
    },
    {
      pregunta: '¿Usar Albion Navigator va contra las reglas del juego?',
      respuesta:
        'Albion Navigator no se conecta al juego ni lee su tráfico de red: solo usa datos públicos y las capturas que tú decides pegar. No modifica ni automatiza nada en tu cliente.',
    },
    {
      pregunta: '¿Cómo puedo apoyar el proyecto?',
      respuesta:
        'Puedes donar lo que quieras con Ko-fi (tarjeta o PayPal, desde cualquier país) o con Bre-B (desde Colombia, sin comisiones), en la sección "Mantén Albion Navigator en línea". Las donaciones pagan el servidor, el dominio propio y las actualizaciones. Compartir el sitio con tu gremio también ayuda mucho.',
    },
    {
      pregunta: '¿Está disponible en inglés?',
      respuesta: 'Sí. Cambia de idioma con el selector ES / EN de la barra superior; el apartado en el que estás se conserva.',
    },
  ],
  en: [
    {
      pregunta: 'What is Albion Navigator?',
      respuesta:
        'It is a free tool for Albion Online players. It tells you which Black Zone maps any guild has a hideout in and shows the Avalon routes and connections open right now, logged by the community.',
    },
    {
      pregunta: 'Is it free? Do I need an account?',
      respuesta:
        'It is 100% free and ad-free. You do not need an account to search hideouts or browse the Avalonian roads. You only need one to log connections from screenshots, so each one is saved under your name.',
    },
    {
      pregunta: 'How do I find a guild’s hideouts?',
      respuesta:
        'Open the Hideouts section and type the guild name, in full or just part of it. You will see every map where it has a hideout, with its type (HQ or HO). Tap a map to open it in detail, with its location and the Avalon routes that lead there.',
    },
    {
      pregunta: 'Where does the hideout and map data come from?',
      respuesta:
        'Hideouts are updated every season. Map geography (exits, paths and territories) and the catalog of all 400 Avalonian roads come from the official game client data. The exact location of each hideout is marked by an administrator, because the game does not publish it.',
    },
    {
      pregunta: 'What are the Avalonian roads and how do I know which ones are open?',
      respuesta:
        'They are zones connected to each other and to the rest of the world by portals that open and close every few hours. In the Avalonian Roads section you can see all 400 roads, the connections open right now and how long they have left, with a live countdown.',
    },
    {
      pregunta: 'How do I log a connection or a route?',
      respuesta:
        'Sign in and open "Log connections from screenshots" in Avalonian Roads. In the game, hover over a portal, take a screenshot (Win+Shift+S) and paste it with Ctrl+V. The reader turns it into origin, destination and closing time; check the data and save. For a route, paste one portal from each leg and they chain together automatically.',
    },
    {
      pregunta: 'Are my screenshots uploaded to the server?',
      respuesta:
        'No. Screenshots are read in your own browser and never uploaded. Only what you confirm is saved: the origin, destination and closing time of each connection.',
    },
    {
      pregunta: 'How up to date are the connections?',
      respuesta:
        'They depend on what the community logs. Each connection shows who logged it and disappears on its own when it closes. If you see a portal in the game that is not listed, log it: that helps everyone.',
    },
    {
      pregunta: 'Is using Albion Navigator against the game rules?',
      respuesta:
        'Albion Navigator does not connect to the game or read its network traffic: it only uses public data and the screenshots you choose to paste. It does not modify or automate anything in your client.',
    },
    {
      pregunta: 'How can I support the project?',
      respuesta:
        'You can donate any amount on Ko-fi (card or PayPal, from any country) or with Bre-B (from Colombia, fee-free), in the "Keep Albion Navigator online" section. Donations pay for the server, an own domain and updates. Sharing the site with your guild also helps a lot.',
    },
    {
      pregunta: 'Is it available in Spanish?',
      respuesta: 'Yes. Switch languages with the ES / EN selector in the top bar; the section you are on is kept.',
    },
  ],
};

module.exports = { PREGUNTAS };
