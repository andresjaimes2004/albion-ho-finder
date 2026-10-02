'use strict';

/**
 * Textos de las páginas de soporte: Contáctanos, Política de privacidad y
 * Términos de uso, en español e inglés.
 *
 * Cada página tiene secciones con bloques:
 *   - { p: 'texto' }                         párrafo
 *   - { sub: 'texto' }                       subtítulo (h3)
 *   - { lista: ['texto', ...] }              lista con viñetas
 *   - { tarjetas: [{ icono, titulo, texto, accion? }] }  tarjetas (contacto)
 * En los textos:
 *   - **así** se escribe en negrita;
 *   - {correo} y {discord} se cambian por los enlaces configurados (o por
 *     "muy pronto" si aún no hay);
 *   - {contacto}, {privacidad} y {terminos} enlazan a esas páginas.
 * Todo se escapa al generar el HTML (src/http/legal.js).
 *
 * Lo que se dice aquí tiene que coincidir con lo que hace el sitio (qué se
 * guarda, cuánto tiempo, qué cookies): si cambia el código, se actualiza.
 */

const ACTUALIZADO = { es: '2 de octubre de 2026', en: 'October 2, 2026' };

const es = {
  comun: {
    actualizado: `Última actualización: ${ACTUALIZADO.es}`,
    volver: 'Volver al inicio',
    pendiente: 'muy pronto',
    soporte: 'Soporte',
    indice: 'En esta página',
  },
  contacto: {
    titulo: 'Contáctanos',
    descripcion:
      'Escríbenos para reportar un error, corregir un hideout o un gremio, resolver un problema con tu cuenta o proponer ideas para Albion Navigator.',
    intro:
      '¿Encontraste un error, un hideout que no cuadra o tienes una idea? Escríbenos: Albion Navigator crece con lo que reporta la comunidad.',
    secciones: [
      {
        id: 'canales',
        titulo: 'Cómo escribirnos',
        bloques: [
          {
            tarjetas: [
              {
                icono: 'correo',
                titulo: 'Correo electrónico',
                texto: 'Para todo lo que necesite una respuesta con calma: cuentas, privacidad o datos que haya que corregir.',
                accion: 'correo',
              },
              {
                icono: 'discord',
                titulo: 'Discord',
                texto: 'Para avisos rápidos, dudas sobre el uso del sitio y para proponer y votar ideas con la comunidad.',
                accion: 'discord',
              },
            ],
          },
          { p: 'Respondemos en cuanto podemos; normalmente en pocos días. Albion Navigator lo mantiene una sola persona en su tiempo libre.' },
        ],
      },
      {
        id: 'ayuda',
        titulo: '¿En qué podemos ayudarte?',
        bloques: [
          {
            tarjetas: [
              { icono: 'error', titulo: 'Reportar un error', texto: 'Algo no carga, se ve mal o no hace lo que esperabas. Cuéntanos qué hiciste y qué pasó.' },
              { icono: 'mapa', titulo: 'Corregir datos', texto: 'Un hideout, un gremio o un camino de Avalon con datos equivocados o desactualizados.' },
              { icono: 'cuenta', titulo: 'Tu cuenta', texto: 'Problemas para entrar, cambiar tu contraseña o borrar tu cuenta y tus datos.' },
              { icono: 'idea', titulo: 'Ideas y sugerencias', texto: 'Funciones nuevas o mejoras que te harían la vida más fácil en la Zona Negra.' },
            ],
          },
        ],
      },
      {
        id: 'antes',
        titulo: 'Para ayudarte más rápido',
        bloques: [
          {
            lista: [
              'Incluye el nombre del **gremio, mapa o camino** del que hablas.',
              'Si es un error, di qué **navegador y dispositivo** usas, y añade una captura si puedes.',
              'Si es sobre tu cuenta, indica tu **nombre de usuario**. Nunca te pediremos tu contraseña.',
            ],
          },
          { p: 'Para saber qué datos guardamos y cómo pedir que se borren, lee la {privacidad}.' },
        ],
      },
    ],
  },
  privacidad: {
    titulo: 'Política de privacidad',
    descripcion:
      'Qué datos guarda Albion Navigator, para qué, cuánto tiempo y cómo puedes consultarlos o pedir que se borren.',
    intro:
      'En Albion Navigator guardamos lo mínimo para que el sitio funcione. Esta política explica qué datos tratamos, para qué y qué puedes hacer con ellos.',
    secciones: [
      {
        id: 'resumen',
        titulo: 'En resumen',
        bloques: [
          {
            lista: [
              'Para buscar hideouts y caminos **no necesitas cuenta** ni das ningún dato.',
              'Si creas una cuenta, solo pedimos un **nombre de usuario y una contraseña**: ni correo, ni nombre real, ni teléfono.',
              'Las **capturas de pantalla se leen en tu navegador** y nunca se suben al servidor.',
              '**Sin publicidad, sin analítica y sin rastreadores.** Solo usamos las cookies imprescindibles para iniciar sesión.',
              'No vendemos ni compartimos tus datos con nadie para fines comerciales.',
            ],
          },
        ],
      },
      {
        id: 'responsable',
        titulo: 'Quién es el responsable',
        bloques: [
          {
            p: 'Albion Navigator es un proyecto independiente creado y mantenido por TurnDark desde Colombia. Para cualquier asunto sobre tus datos puedes escribir a {correo} o usar la página de {contacto}.',
          },
        ],
      },
      {
        id: 'datos',
        titulo: 'Qué datos tratamos',
        bloques: [
          { sub: 'Si solo visitas el sitio' },
          {
            p: 'No te pedimos nada. Como cualquier servidor web, el nuestro anota en registros técnicos la dirección IP, el navegador y la página pedida de cada visita. Los usamos solo para mantener el sitio seguro y resolver fallos, y se conservan poco tiempo.',
          },
          { sub: 'Si creas una cuenta' },
          {
            lista: [
              '**Nombre de usuario**: el que tú elijas; se ve junto a lo que aportas.',
              '**Contraseña**: nunca se guarda en claro, sino transformada con scrypt, un método diseñado para que no se pueda recuperar.',
              '**Fechas** de creación de la cuenta y de tu último acceso.',
              '**Historial de búsquedas**: tus últimas 20 búsquedas, para que vuelvas a ellas con un clic. Solo tú lo ves y puedes borrarlo cuando quieras con «Limpiar».',
            ],
          },
          { sub: 'Lo que aportas a la comunidad' },
          {
            lista: [
              '**Conexiones y rutas de Avalon** que registras, con tu usuario como autor. Las públicas las ve todo el mundo; las de un espacio privado, solo sus miembros.',
              '**Gremios anotados** en caminos de hideouts. Son públicos y se copian a la hoja comunitaria de gremios (solo el nombre del gremio y el camino, nunca tu usuario).',
              '**Espacios privados**: su nombre y las cuentas que agregas como miembros.',
              '**Avisos** dentro del sitio (por ejemplo, «te agregaron a un espacio»).',
            ],
          },
          { sub: 'Para proteger las cuentas' },
          {
            p: 'Para frenar a quien intente adivinar contraseñas, contamos los intentos fallidos de inicio de sesión junto a una huella irreversible (un resumen cifrado de la IP y el navegador que no permite saber cuáles eran). Los cambios hechos desde el panel de administración quedan registrados para poder revisarlos.',
          },
        ],
      },
      {
        id: 'capturas',
        titulo: 'Capturas de pantalla',
        bloques: [
          {
            p: 'Cuando pegas capturas para registrar conexiones, la lectura se hace en tu propio navegador. Las imágenes no se envían al servidor: solo se guardan los datos que confirmas (zonas y tiempo de cierre). Mientras no las guardes, las capturas pendientes se conservan en tu dispositivo para que no las pierdas si recargas la página.',
          },
        ],
      },
      {
        id: 'cookies',
        titulo: 'Cookies y almacenamiento en tu navegador',
        bloques: [
          {
            lista: [
              '**ho_sesion**: mantiene tu sesión iniciada. No es accesible desde JavaScript y caduca a las 8 horas sin uso.',
              '**ho_csrf**: protege tus acciones frente a sitios maliciosos que intenten hacerse pasar por ti.',
              '**Preferencias** (almacenamiento local): filtros, secciones abiertas o el último espacio elegido. Se quedan en tu navegador.',
            ],
          },
          { p: 'No usamos cookies de publicidad ni de analítica, así que no necesitas aceptar nada para usar el sitio.' },
        ],
      },
      {
        id: 'uso',
        titulo: 'Para qué usamos los datos',
        bloques: [
          {
            lista: [
              'Prestar el servicio: tu cuenta, tu historial, tus rutas y tus espacios.',
              'Mostrar a la comunidad lo que aportas, con tu nombre de usuario como autor.',
              'Proteger el sitio y las cuentas frente a abusos y ataques.',
              'Resolver fallos y mejorar Albion Navigator.',
            ],
          },
          { p: 'No usamos tus datos para publicidad, no creamos perfiles y no los vendemos.' },
        ],
      },
      {
        id: 'terceros',
        titulo: 'Servicios de terceros',
        bloques: [
          {
            lista: [
              '**Google Cloud**: aloja el servidor y la base de datos (Estados Unidos).',
              '**DuckDNS** y **Let’s Encrypt**: la dirección del sitio y su certificado de seguridad (HTTPS).',
              '**Google Fonts**: tu navegador descarga de Google las tipografías del sitio.',
              '**Google Drive**: la hoja comunitaria de gremios de caminos de hideouts (solo nombres de gremio y de camino).',
              '**Ko-fi, PayPal y las apps de tu banco**: si donas, el pago se hace en sus plataformas y con sus políticas. Nosotros nunca vemos ni guardamos datos de tarjetas ni de cuentas.',
              '**Discord**: si entras a nuestro servidor, se aplica la política de privacidad de Discord.',
            ],
          },
        ],
      },
      {
        id: 'conservacion',
        titulo: 'Cuánto tiempo los guardamos',
        bloques: [
          {
            lista: [
              '**Conexiones y rutas**: se borran solas poco después de que cierren sus portales (como mucho, 30 minutos después).',
              '**Historial de búsquedas**: solo las 20 últimas; las anteriores se borran.',
              '**Sesiones**: 8 horas sin uso. **Intentos de inicio de sesión**: 7 días. **Avisos**: 30 días.',
              '**Tu cuenta y lo que aportas**: mientras la cuenta exista o hasta que pidas borrarla.',
            ],
          },
        ],
      },
      {
        id: 'seguridad',
        titulo: 'Cómo protegemos los datos',
        bloques: [
          {
            p: 'Todo el tráfico va cifrado con HTTPS. Las contraseñas y las cookies de sesión se guardan transformadas, nunca en claro; las cookies son HttpOnly y SameSite=Strict, cada acción lleva un token anti-falsificación, los intentos de inicio de sesión están limitados y el contenido de los espacios privados se filtra en el servidor para que solo lo reciban sus miembros. Ningún sistema es infalible, pero trabajamos para que tus datos estén tan protegidos como sea posible.',
          },
        ],
      },
      {
        id: 'derechos',
        titulo: 'Tus derechos',
        bloques: [
          {
            p: 'De acuerdo con la Ley 1581 de 2012 de Colombia (protección de datos personales) y normas equivalentes de otros países, puedes conocer, actualizar, corregir y pedir que se borren tus datos, así como retirar tu autorización para tratarlos.',
          },
          {
            lista: [
              '**Tú mismo**: puedes borrar tu historial de búsquedas, cambiar tu contraseña, editar o borrar tus rutas y salir de los espacios.',
              '**Escribiéndonos**: para consultar tus datos o borrar tu cuenta, escribe a {correo} indicando tu nombre de usuario. Como no guardamos tu correo, te pediremos una prueba sencilla de que la cuenta es tuya.',
              'Respondemos las consultas en un máximo de 10 días hábiles y los reclamos en un máximo de 15, como establece la ley colombiana.',
            ],
          },
        ],
      },
      {
        id: 'menores',
        titulo: 'Menores de edad',
        bloques: [
          {
            p: 'Albion Navigator no está dirigido a menores de 13 años. Si eres madre, padre o tutor y crees que un menor creó una cuenta, escríbenos y la borraremos.',
          },
        ],
      },
      {
        id: 'cambios',
        titulo: 'Cambios en esta política',
        bloques: [
          {
            p: 'Si cambiamos lo que hacemos con los datos, actualizaremos esta página y su fecha. Si el cambio es importante, también lo avisaremos en el sitio.',
          },
        ],
      },
    ],
  },
  terminos: {
    titulo: 'Términos de uso',
    descripcion:
      'Las reglas para usar Albion Navigator: tu cuenta, lo que aportas a la comunidad, las donaciones y los límites de responsabilidad.',
    intro:
      'Estos términos son las reglas para usar Albion Navigator. Son pocas y buscan una sola cosa: que el sitio siga siendo útil y justo para toda la comunidad.',
    secciones: [
      {
        id: 'aceptacion',
        titulo: 'Aceptación',
        bloques: [
          { p: 'Al usar Albion Navigator aceptas estos términos y la {privacidad}. Si no estás de acuerdo, por favor no uses el sitio.' },
        ],
      },
      {
        id: 'servicio',
        titulo: 'Qué es Albion Navigator',
        bloques: [
          {
            p: 'Una herramienta gratuita para encontrar los hideouts de los gremios de la Zona Negra de Albion Online y seguir las rutas de Avalon que registra la comunidad. Es un proyecto independiente: no está afiliado, aprobado ni patrocinado por Sandbox Interactive GmbH, creadora de Albion Online.',
          },
        ],
      },
      {
        id: 'cuenta',
        titulo: 'Tu cuenta',
        bloques: [
          {
            lista: [
              'Eres responsable de lo que se haga con tu cuenta: usa una contraseña segura y no la compartas.',
              'Elige un nombre de usuario que no suplante a otras personas ni resulte ofensivo.',
              'Si crees que alguien entró en tu cuenta, cambia tu contraseña y escríbenos.',
            ],
          },
        ],
      },
      {
        id: 'uso',
        titulo: 'Uso aceptable',
        bloques: [
          { p: 'Para que el sitio funcione para todos, no está permitido:' },
          {
            lista: [
              'Registrar a propósito datos falsos (conexiones, rutas o gremios inventados) para engañar a otros jugadores.',
              'Intentar acceder a cuentas o espacios privados ajenos, o saltarse las medidas de seguridad.',
              'Hacer peticiones automáticas masivas, copiar los datos del sitio en bloque o sobrecargar el servidor.',
              'Usar el sitio para acosar, amenazar o difundir contenido ofensivo o ilegal.',
            ],
          },
        ],
      },
      {
        id: 'contenido',
        titulo: 'Lo que aportas',
        bloques: [
          {
            p: 'Las conexiones, rutas y gremios que registras siguen siendo tu aporte, pero nos das permiso para mostrarlos en el sitio a quien corresponda: a todo el mundo si son públicos, o solo a los miembros si están en un espacio privado. Los nombres de gremio que anotas también se copian a la hoja comunitaria de gremios.',
          },
          {
            p: 'Al aportar algo confirmas que lo viste en el juego y que es correcto según tu conocimiento. Los administradores pueden corregir o borrar contenido que incumpla estos términos o que esté equivocado, y las conexiones y rutas se borran solas cuando cierran sus portales.',
          },
        ],
      },
      {
        id: 'exactitud',
        titulo: 'Datos del juego y exactitud',
        bloques: [
          {
            p: 'Los hideouts se actualizan por temporada y las rutas de Avalon las registra la comunidad, así que pueden estar incompletos o desactualizados. Úsalos como guía y confirma siempre en el juego: Albion Navigator no garantiza que un portal siga abierto ni que un mapa sea seguro.',
          },
        ],
      },
      {
        id: 'donaciones',
        titulo: 'Donaciones',
        bloques: [
          {
            p: 'Las donaciones son voluntarias y ayudan a mantener el servidor y el desarrollo. No dan acceso a funciones extra ni ventajas de ningún tipo. Se procesan en Ko-fi, PayPal o la app de tu banco, con sus propias condiciones; salvo lo que exija la ley, no son reembolsables. Si donaste por error, escríbenos y lo revisamos.',
          },
        ],
      },
      {
        id: 'propiedad',
        titulo: 'Propiedad intelectual',
        bloques: [
          {
            p: 'Albion Online, sus nombres, mapas, imágenes y marcas pertenecen a Sandbox Interactive GmbH. El diseño, el código y los textos propios de Albion Navigator pertenecen a su creador; no los copies ni los publiques como tuyos sin permiso.',
          },
        ],
      },
      {
        id: 'terceros',
        titulo: 'Enlaces y servicios de terceros',
        bloques: [
          {
            p: 'El sitio enlaza a servicios de otros (Albion Online, su wiki, Discord, Ko-fi y otros). No controlamos su contenido ni sus condiciones, y usarlos es decisión tuya.',
          },
        ],
      },
      {
        id: 'responsabilidad',
        titulo: 'Sin garantías y límite de responsabilidad',
        bloques: [
          {
            p: 'Albion Navigator se ofrece gratis y «tal como está», sin garantías de disponibilidad continua ni de exactitud de los datos. En la medida en que lo permita la ley, no respondemos por pérdidas dentro del juego (equipo, plata, territorios) ni por otros daños derivados de usar o no poder usar el sitio.',
          },
        ],
      },
      {
        id: 'suspension',
        titulo: 'Suspensión de cuentas',
        bloques: [
          {
            p: 'Podemos suspender o borrar cuentas que incumplan estos términos, sobre todo si ponen en riesgo a otros usuarios o al sitio. Tú puedes dejar de usar el sitio cuando quieras y pedirnos que borremos tu cuenta.',
          },
        ],
      },
      {
        id: 'cambios',
        titulo: 'Cambios y ley aplicable',
        bloques: [
          {
            p: 'Podemos actualizar estos términos; la fecha de arriba indica la última versión, y seguir usando el sitio después de un cambio significa que lo aceptas. Estos términos se rigen por las leyes de la República de Colombia.',
          },
        ],
      },
    ],
  },
};

const en = {
  comun: {
    actualizado: `Last updated: ${ACTUALIZADO.en}`,
    volver: 'Back to home',
    pendiente: 'coming soon',
    soporte: 'Support',
    indice: 'On this page',
  },
  contacto: {
    titulo: 'Contact us',
    descripcion:
      'Write to us to report a bug, fix a hideout or a guild, solve a problem with your account or suggest ideas for Albion Navigator.',
    intro:
      'Found a bug, a hideout that doesn’t add up, or have an idea? Write to us: Albion Navigator grows with what the community reports.',
    secciones: [
      {
        id: 'canales',
        titulo: 'How to reach us',
        bloques: [
          {
            tarjetas: [
              {
                icono: 'correo',
                titulo: 'Email',
                texto: 'For anything that needs a careful answer: accounts, privacy or data that needs fixing.',
                accion: 'correo',
              },
              {
                icono: 'discord',
                titulo: 'Discord',
                texto: 'For quick reports, questions about using the site, and to suggest and vote on ideas with the community.',
                accion: 'discord',
              },
            ],
          },
          { p: 'We reply as soon as we can, usually within a few days. Albion Navigator is run by one person in their spare time.' },
        ],
      },
      {
        id: 'ayuda',
        titulo: 'How can we help?',
        bloques: [
          {
            tarjetas: [
              { icono: 'error', titulo: 'Report a bug', texto: 'Something doesn’t load, looks wrong or doesn’t do what you expected. Tell us what you did and what happened.' },
              { icono: 'mapa', titulo: 'Fix data', texto: 'A hideout, a guild or an Avalonian road with wrong or outdated data.' },
              { icono: 'cuenta', titulo: 'Your account', texto: 'Trouble signing in, changing your password or deleting your account and data.' },
              { icono: 'idea', titulo: 'Ideas and suggestions', texto: 'New features or improvements that would make life in the Black Zone easier.' },
            ],
          },
        ],
      },
      {
        id: 'antes',
        titulo: 'To help you faster',
        bloques: [
          {
            lista: [
              'Include the name of the **guild, map or road** you are talking about.',
              'If it’s a bug, tell us which **browser and device** you use, and add a screenshot if you can.',
              'If it’s about your account, include your **username**. We will never ask for your password.',
            ],
          },
          { p: 'To learn what data we keep and how to have it deleted, read the {privacidad}.' },
        ],
      },
    ],
  },
  privacidad: {
    titulo: 'Privacy policy',
    descripcion: 'What data Albion Navigator keeps, why, for how long, and how you can access it or have it deleted.',
    intro:
      'At Albion Navigator we keep the bare minimum for the site to work. This policy explains what data we handle, why, and what you can do about it.',
    secciones: [
      {
        id: 'resumen',
        titulo: 'In short',
        bloques: [
          {
            lista: [
              'You **don’t need an account** to search hideouts and roads, and you give no data.',
              'If you create an account, we only ask for a **username and a password**: no email, no real name, no phone.',
              '**Screenshots are read in your browser** and are never uploaded to the server.',
              '**No ads, no analytics and no trackers.** We only use the cookies needed to sign in.',
              'We don’t sell or share your data with anyone for commercial purposes.',
            ],
          },
        ],
      },
      {
        id: 'responsable',
        titulo: 'Who is responsible',
        bloques: [
          {
            p: 'Albion Navigator is an independent project created and run by TurnDark from Colombia. For anything about your data you can write to {correo} or use the {contacto} page.',
          },
        ],
      },
      {
        id: 'datos',
        titulo: 'What data we handle',
        bloques: [
          { sub: 'If you just visit the site' },
          {
            p: 'We don’t ask you for anything. Like any web server, ours writes the IP address, browser and requested page of each visit to technical logs. We use them only to keep the site secure and fix problems, and they are kept for a short time.',
          },
          { sub: 'If you create an account' },
          {
            lista: [
              '**Username**: the one you choose; it is shown next to what you contribute.',
              '**Password**: never stored in plain text, but transformed with scrypt, a method designed so it can’t be recovered.',
              '**Dates** when your account was created and when you last signed in.',
              '**Search history**: your last 20 searches, so you can go back to them in one click. Only you can see it, and you can delete it at any time with “Clear”.',
            ],
          },
          { sub: 'What you contribute to the community' },
          {
            lista: [
              '**Avalonian connections and routes** you register, with your username as author. Public ones are visible to everyone; those in a private space, only to its members.',
              '**Guilds** noted on hideout roads. They are public and are copied to the community guild sheet (only the guild and road names, never your username).',
              '**Private spaces**: their name and the accounts you add as members.',
              '**Notices** inside the site (for example, “you were added to a space”).',
            ],
          },
          { sub: 'To protect accounts' },
          {
            p: 'To stop anyone trying to guess passwords, we count failed sign-in attempts together with an irreversible fingerprint (an encrypted digest of the IP and browser that doesn’t reveal what they were). Changes made from the administration panel are logged so they can be reviewed.',
          },
        ],
      },
      {
        id: 'capturas',
        titulo: 'Screenshots',
        bloques: [
          {
            p: 'When you paste screenshots to register connections, they are read in your own browser. The images are not sent to the server: only the data you confirm (zones and closing time) is saved. Until you save them, pending screenshots are kept on your device so you don’t lose them if you reload the page.',
          },
        ],
      },
      {
        id: 'cookies',
        titulo: 'Cookies and storage in your browser',
        bloques: [
          {
            lista: [
              '**ho_sesion**: keeps you signed in. It can’t be read by JavaScript and expires after 8 hours without use.',
              '**ho_csrf**: protects your actions from malicious sites trying to act on your behalf.',
              '**Preferences** (local storage): filters, open sections or the last space you chose. They stay in your browser.',
            ],
          },
          { p: 'We don’t use advertising or analytics cookies, so you don’t need to accept anything to use the site.' },
        ],
      },
      {
        id: 'uso',
        titulo: 'What we use the data for',
        bloques: [
          {
            lista: [
              'Providing the service: your account, history, routes and spaces.',
              'Showing the community what you contribute, with your username as author.',
              'Protecting the site and accounts from abuse and attacks.',
              'Fixing problems and improving Albion Navigator.',
            ],
          },
          { p: 'We don’t use your data for advertising, we don’t build profiles and we don’t sell it.' },
        ],
      },
      {
        id: 'terceros',
        titulo: 'Third-party services',
        bloques: [
          {
            lista: [
              '**Google Cloud**: hosts the server and the database (United States).',
              '**DuckDNS** and **Let’s Encrypt**: the site’s address and its security certificate (HTTPS).',
              '**Google Fonts**: your browser downloads the site’s fonts from Google.',
              '**Google Drive**: the community sheet of hideout-road guilds (guild and road names only).',
              '**Ko-fi, PayPal and your bank’s app**: if you donate, the payment happens on their platforms under their policies. We never see or store card or account details.',
              '**Discord**: if you join our server, Discord’s privacy policy applies.',
            ],
          },
        ],
      },
      {
        id: 'conservacion',
        titulo: 'How long we keep it',
        bloques: [
          {
            lista: [
              '**Connections and routes**: deleted automatically shortly after their portals close (at most 30 minutes later).',
              '**Search history**: only the last 20; older ones are deleted.',
              '**Sessions**: 8 hours without use. **Sign-in attempts**: 7 days. **Notices**: 30 days.',
              '**Your account and contributions**: as long as the account exists or until you ask us to delete it.',
            ],
          },
        ],
      },
      {
        id: 'seguridad',
        titulo: 'How we protect the data',
        bloques: [
          {
            p: 'All traffic is encrypted with HTTPS. Passwords and session cookies are stored transformed, never in plain text; cookies are HttpOnly and SameSite=Strict, every action carries an anti-forgery token, sign-in attempts are limited, and the content of private spaces is filtered on the server so only their members receive it. No system is foolproof, but we work to keep your data as safe as possible.',
          },
        ],
      },
      {
        id: 'derechos',
        titulo: 'Your rights',
        bloques: [
          {
            p: 'Under Colombia’s Law 1581 of 2012 (personal data protection) and equivalent laws in other countries, you can access, update, correct and have your data deleted, and withdraw your consent to its use.',
          },
          {
            lista: [
              '**By yourself**: you can clear your search history, change your password, edit or delete your routes and leave spaces.',
              '**By writing to us**: to access your data or delete your account, write to {correo} with your username. Since we don’t keep your email, we’ll ask for a simple proof that the account is yours.',
              'We answer requests within 10 business days and complaints within 15, as Colombian law requires.',
            ],
          },
        ],
      },
      {
        id: 'menores',
        titulo: 'Children',
        bloques: [
          {
            p: 'Albion Navigator is not aimed at children under 13. If you are a parent or guardian and believe a child created an account, write to us and we will delete it.',
          },
        ],
      },
      {
        id: 'cambios',
        titulo: 'Changes to this policy',
        bloques: [
          {
            p: 'If we change what we do with data, we will update this page and its date. If the change is important, we will also announce it on the site.',
          },
        ],
      },
    ],
  },
  terminos: {
    titulo: 'Terms of use',
    descripcion:
      'The rules for using Albion Navigator: your account, what you contribute to the community, donations and limits of liability.',
    intro:
      'These terms are the rules for using Albion Navigator. There are few of them and they aim at one thing: keeping the site useful and fair for the whole community.',
    secciones: [
      {
        id: 'aceptacion',
        titulo: 'Acceptance',
        bloques: [{ p: 'By using Albion Navigator you accept these terms and the {privacidad}. If you don’t agree, please don’t use the site.' }],
      },
      {
        id: 'servicio',
        titulo: 'What Albion Navigator is',
        bloques: [
          {
            p: 'A free tool to find the hideouts of Black Zone guilds in Albion Online and follow the Avalonian routes the community registers. It is an independent project: it is not affiliated with, endorsed or sponsored by Sandbox Interactive GmbH, the creator of Albion Online.',
          },
        ],
      },
      {
        id: 'cuenta',
        titulo: 'Your account',
        bloques: [
          {
            lista: [
              'You are responsible for what is done with your account: use a strong password and don’t share it.',
              'Choose a username that doesn’t impersonate other people and isn’t offensive.',
              'If you think someone got into your account, change your password and write to us.',
            ],
          },
        ],
      },
      {
        id: 'uso',
        titulo: 'Acceptable use',
        bloques: [
          { p: 'So the site works for everyone, you may not:' },
          {
            lista: [
              'Deliberately register false data (made-up connections, routes or guilds) to mislead other players.',
              'Try to access other people’s accounts or private spaces, or bypass security measures.',
              'Make massive automated requests, copy the site’s data in bulk or overload the server.',
              'Use the site to harass, threaten or spread offensive or illegal content.',
            ],
          },
        ],
      },
      {
        id: 'contenido',
        titulo: 'What you contribute',
        bloques: [
          {
            p: 'The connections, routes and guilds you register remain your contribution, but you allow us to show them on the site to the right people: everyone if they are public, or only members if they are in a private space. Guild names you note are also copied to the community guild sheet.',
          },
          {
            p: 'By contributing you confirm you saw it in the game and that it’s correct to the best of your knowledge. Administrators may fix or delete content that breaks these terms or is wrong, and connections and routes are deleted automatically when their portals close.',
          },
        ],
      },
      {
        id: 'exactitud',
        titulo: 'Game data and accuracy',
        bloques: [
          {
            p: 'Hideouts are updated every season and Avalonian routes are registered by the community, so they may be incomplete or outdated. Use them as a guide and always confirm in the game: Albion Navigator doesn’t guarantee that a portal is still open or that a map is safe.',
          },
        ],
      },
      {
        id: 'donaciones',
        titulo: 'Donations',
        bloques: [
          {
            p: 'Donations are voluntary and help keep the server running and development going. They don’t unlock extra features or any kind of advantage. They are processed by Ko-fi, PayPal or your bank’s app, under their own terms; except where the law requires otherwise, they are non-refundable. If you donated by mistake, write to us and we’ll look into it.',
          },
        ],
      },
      {
        id: 'propiedad',
        titulo: 'Intellectual property',
        bloques: [
          {
            p: 'Albion Online, its names, maps, images and trademarks belong to Sandbox Interactive GmbH. Albion Navigator’s own design, code and texts belong to its creator; don’t copy them or publish them as your own without permission.',
          },
        ],
      },
      {
        id: 'terceros',
        titulo: 'Third-party links and services',
        bloques: [
          {
            p: 'The site links to other people’s services (Albion Online, its wiki, Discord, Ko-fi and others). We don’t control their content or terms, and using them is your choice.',
          },
        ],
      },
      {
        id: 'responsabilidad',
        titulo: 'No warranty and limitation of liability',
        bloques: [
          {
            p: 'Albion Navigator is offered free of charge and “as is”, without guarantees of continuous availability or data accuracy. To the extent permitted by law, we are not liable for in-game losses (gear, silver, territories) or other damages arising from using or not being able to use the site.',
          },
        ],
      },
      {
        id: 'suspension',
        titulo: 'Account suspension',
        bloques: [
          {
            p: 'We may suspend or delete accounts that break these terms, especially if they put other users or the site at risk. You can stop using the site whenever you want and ask us to delete your account.',
          },
        ],
      },
      {
        id: 'cambios',
        titulo: 'Changes and governing law',
        bloques: [
          {
            p: 'We may update these terms; the date above shows the latest version, and continuing to use the site after a change means you accept it. These terms are governed by the laws of the Republic of Colombia.',
          },
        ],
      },
    ],
  },
};

module.exports = { es, en, ACTUALIZADO };
