# Buscador de Hideouts — Zona Negra (Albion Online)

Aplicación web que reemplaza el Excel "Buscador de Gremio — Hideouts Zona Negra":
el usuario escribe el nombre (completo o parcial) de un gremio y la página
devuelve todos los mapas de Zona Negra donde ese gremio tiene un Hideout,
con el slot y el tipo (HQ, personal o estándar).

## Cambios recientes

### v5 — Registrar conexiones desde capturas del juego

- **Panel "Registrar conexiones desde capturas"** en la pestaña Caminos de
  Avalon (requiere sesión). En el juego se abre el mapa del camino, se pasa
  el cursor por un portal y se saca una captura (Win+Shift+S); en la web se
  pega con Ctrl+V (o se arrastra). Se pueden pegar varias seguidas.
- **Lectura en el navegador:** la captura nunca sale del equipo. Se ubica el
  recuadro del portal por su barra de capacidad amarilla y el título del
  camino por el pergamino superior, se recortan y se leen con OCR
  (Tesseract.js, servido desde `public/vendor`). Los nombres se corrigen
  contra las 815 zonas oficiales (`data/zonas_albion.json`), así que los
  errores típicos del OCR o un título cortado no importan.
- **Revisión antes de guardar:** cada captura queda como una fila editable
  (origen, destino y tiempo) con los datos dudosos resaltados. Al guardar
  se descuenta el tiempo pasado desde la captura.
- **Conexiones del gremio junto a las de smugden:** se muestran con la
  etiqueta "gremio · usuario"; si smugden informa la misma conexión, se
  deja solo la del gremio. Quien la registró o un administrador puede
  borrarla. Se purgan solas un día después de cerrar.

Se descartó leer el tráfico de red del juego: los destinos y tiempos de los
portales llegan cifrados, y descifrarlos exigiría manipular el cliente, lo
que Sandbox prohíbe.

### v4 — Caminos de Avalon (tracking)

- **Nueva pestaña "Caminos de Avalon"** (enlazable con `/#caminos`): lista
  los 400 caminos avalonianos del juego, filtrables por nombre, tipo y
  tier, y permite consultar cualquier camino o mapa de Zona Negra para ver
  **las conexiones que tiene abiertas ahora y cuánto les queda**, con
  cuenta regresiva en vivo (roja a menos de 30 min, ámbar a menos de 1 h).
- **Catálogo oficial:** tipo, tier, recursos por tier y dungeons de cada
  camino salen de `cluster/world.json` de los dumps del cliente
  (clusters `TUNNEL_*`), guardados en `data/caminos_avalon.json`.
- **Conexiones en vivo:** el juego abre y cierra los portales al azar y no
  los publica en ningún dato oficial; se toman de la API pública de
  [ava.smugden.com](https://ava.smugden.com/), que alimentan los
  escáneres de su comunidad. El servidor la consulta con una caché
  compartida de 30 s (a smugden le llega como mucho una petición por
  intervalo) y, si falla, sigue sirviendo la última respuesta buena.
- **Integración con la Zona Negra:** las conexiones que llegan a un mapa
  de Zona Negra ofrecen "Ver mapa" para abrir su ventana de detalle.

**Límites honestos:** la API de smugden no está documentada ni tiene
términos de uso publicados, así que puede cambiar sin aviso. Solo tiene
conexiones cuando alguien de su comunidad está escaneando; si no, la
sección muestra el catálogo con "sin conexiones" y la antigüedad de la
fuente.

### v3 — Mapa del juego como fondo

- **Mapa mundial con el mapa real del juego:** el fondo del mapa de la Zona
  Negra es ahora el mismo mapa del juego que muestra albiononline2d, en
  teselas de la **wiki oficial de Albion Online** (wiki.albiononline.com,
  de Sandbox Interactive). Se cargan por nivel de detalle (zoom 2 a 7) y
  solo las que están a la vista; el proyecto no guarda copias.
- **Calibración verificada, no supuesta:** la conversión de las posiciones
  de los dumps al sistema de teselas replica la fórmula de la propia wiki y
  se contrastó con las coordenadas que publica para 14 mapas (desvío
  residual < 0,1 px a zoom 0, corregido). La orientación de cada mapa
  individual (giro de −45°) sale de los 740 pares de salidas entre mapas
  vecinos (coseno medio 0,895; ninguna otra orientación pasa de 0,64).
- **Ventana de cada mapa en diamante,** con la orientación del juego y tres
  fondos a elegir: *Mapa oficial* (recorte de esa zona del mapa del
  juego), *Imagen propia* (subida por un administrador) y *Sin fondo*.
  Fuera del diamante el mapa se oscurece para dar contexto sin distraer.
- **Imagen propia por mapa:** un administrador puede subir, por ejemplo,
  una captura del minimapa (PNG/JPG/WebP, máx. 4 MB, tipo verificado por
  firma binaria) y ajustarla con escala, desplazamiento y rotación, con
  vista previa en vivo. Se guarda en la base de datos (`mapas_imagen`).
- **Marcadores legibles a cualquier zoom:** salidas, pines y rótulos se
  dibujan en píxeles de pantalla y no tapan el terreno al acercar.
- **Correcciones:** la ventana del mapa ya no acumula manejadores de zoom
  cada vez que se abre, y arrastrar el mapa ya no cuenta como clic (no
  abre mapas ni marca ubicaciones por accidente).

**Límites honestos:** el mapa mundial del juego es una ilustración, así
que la superposición de caminos y salidas sobre el recorte oficial es
aproximada (por eso los caminos de los datos están apagados por defecto).
La imagen exacta del minimapa que usa albiononline2d sale del cliente del
juego y no está publicada en ninguna fuente oficial; para tenerla, un
administrador puede subirla por mapa.

### v2 — Mapa interactivo, cuentas y administración

- **Mapa interactivo de la Zona Negra:** los 276 mapas se dibujan en su
  posición real del mapa mundial, unidos por sus conexiones reales. Los
  mapas donde el gremio buscado tiene Hideout quedan resaltados.
- **Ventana flotante por mapa:** al tocar un mapa del resultado (o un nodo
  del mapa mundial) se abre un modal con el mapa dibujado a escala: red de
  caminos, salidas hacia cada mapa vecino (se puede saltar a ellos), los
  territorios con su monolito, y los hideouts registrados.
- **Datos geográficos verificados:** provienen de `cluster/world.json` de
  los dumps públicos del cliente del juego (repositorio `ao-data/ao-bin-dumps`).
  Los 276 mapas del Excel original coinciden 1 a 1 con clusters
  `OPENPVP_BLACK_*` reales. Se guardan en `data/mapas_geo.json` y se cargan
  a la tabla `mapas_geo`.
- **Ubicación del Hideout dentro del mapa:** el juego **no** publica esa
  coordenada (los hideouts son construcciones de jugadores y el "slot" del
  Excel es un orden propio, no una posición). Por eso no se inventa: un
  administrador la marca haciendo clic sobre el mapa real y queda guardada.
  Los que nadie ha ubicado se muestran como "sin ubicar".
- **Cuentas de usuario:** registro e inicio de sesión con usuario y
  contraseña; cada usuario ve sus últimas 20 búsquedas y puede repetirlas
  con un clic o borrarlas.
- **Panel de administración en la web:** renombrar gremios, subir o quitar
  su logo, editar notas, crear/editar/eliminar hideouts, marcar su posición,
  renombrar mapas, gestionar usuarios (rol y estado) y ver la bitácora de
  cambios.
- **Cero dependencias en tiempo de ejecución:** se reemplazaron Express,
  Helmet, compression y dotenv por un núcleo HTTP propio sobre el módulo
  `http` nativo (enrutador con parámetros, middlewares, gzip, estáticos,
  cabeceras de seguridad y carga de `.env`). `npm install` ya no hace falta
  para desplegar y no hay paquetes de terceros que parchear.

### v1

- **Corrección de un bug visual:** los distintos estados de la búsqueda
  (vacío, cargando, sin resultados, error, resultados) se mostraban todos
  al mismo tiempo, superpuestos. La causa era una regla CSS propia
  (`.estado { display: flex }`) que le ganaba en cascada a la regla nativa
  del navegador para el atributo `hidden`. Se agregó `[hidden] { display:
  none !important; }` en `public/css/styles.css` para que `hidden` siempre
  se respete, sin importar qué otra clase tenga el elemento.
- **Responsive reforzado:** se ajustaron tamaños de logo, tipografía y
  espaciados en dos puntos de quiebre (`560px` y `380px`) para que se vea
  bien en celulares angostos, tablets y escritorio.
- **Logo nuevo:** se diseñó un emblema (torreón + lupa, en la paleta oro/
  carmesí del sitio) en `public/assets/logo.svg`, usado en la cabecera de
  la página, y una versión optimizada para tamaños pequeños en
  `public/assets/favicon.svg` (con `favicon-32.png` y
  `apple-touch-icon.png` como respaldo para navegadores sin soporte de
  favicon SVG).

## Arquitectura

Stack simple y de bajo mantenimiento, pensado para desplegarse en cualquier
hosting de Node.js sin pasos extra:

- **Backend:** Node.js sin frameworks ni dependencias, en capas (rutas →
  controlador → servicio → repositorios), aplicando el patrón Repository y
  principios de POO (encapsulamiento, herencia en `BaseRepository`,
  responsabilidad única). El núcleo HTTP propio vive en `src/http/`.
- **Base de datos:** SQLite **relacional y normalizada** (3FN), accedida con
  el módulo nativo `node:sqlite` de Node 22 — sin dependencias binarias que
  compilar en el hosting.
  - `temporadas` (permite guardar histórico por season, ej. S34, S35...)
  - `mapas` (cada mapa se guarda una sola vez)
  - `gremios` (cada gremio se guarda una sola vez, con nombre normalizado
    indexado para búsquedas rápidas)
  - `hideouts` (tabla relacional: qué gremio ocupa qué slot, de qué mapa,
    en qué temporada, y su posición marcada dentro del mapa)
  - `mapas_geo` (geografía oficial de cada cluster: posición en el mapa
    mundial, límites, salidas, caminos y territorios)
  - `usuarios`, `sesiones`, `intentos_login` (cuentas y control de acceso)
  - `busquedas` (historial privado por usuario)
  - `auditoria` (bitácora de los cambios hechos desde el panel admin)
- **Frontend:** HTML + CSS + JavaScript "vanilla" (sin frameworks), un solo
  input de búsqueda con debounce, responsive y con paleta visual inspirada
  en la Zona Negra de Albion Online.
- **Sin redundancia:** a diferencia del Excel (que repetía el nombre del
  gremio en cada celda), aquí cada gremio y cada mapa existen una sola vez
  en la base de datos.
- **Auto-siembra al arrancar:** al iniciar, el servidor revisa si la base
  de datos está vacía y, si lo está, la carga automáticamente desde
  `data/hideouts_seed.json`. Esto hace que la app funcione sin pasos
  manuales incluso en hostings gratuitos con disco efímero (que borran el
  sistema de archivos al reiniciar o "dormir" el servicio).

```
├── server.js                       Punto de entrada
├── src/
│   ├── app.js                      Composición de la app (middlewares, rutas)
│   ├── bootstrap.js                Auto-siembra BD, geografía y cuenta admin
│   ├── http/                       Núcleo HTTP propio (Router, contexto,
│   │                               cuerpo, estáticos)
│   ├── config/                     Conexión SQLite, migraciones, seguridad, .env
│   ├── security/                   Contraseñas (scrypt), tokens, validación,
│   │                               detección real de imágenes
│   ├── middlewares/                Cookies, sesión, CSRF, límite de peticiones,
│   │                               cabeceras de seguridad
│   ├── models/Hideout.js           Entidad de dominio
│   ├── repositories/               Acceso a datos (patrón Repository)
│   ├── services/                   Lógica de negocio (búsqueda, mapas, auth, admin)
│   ├── controllers/                Controladores HTTP
│   └── routes/api.js               Definición de endpoints
├── database/schema.sql             Esquema relacional
├── data/hideouts_seed.json         Datos de la temporada S34 (del Excel)
├── data/mapas_geo.json             Geografía oficial de los 276 mapas
├── scripts/
│   ├── importarSeed.js             Carga inicial desde el JSON
│   ├── importarExcel.js            Importa un Excel nuevo como temporada nueva
│   ├── importarGeo.js              Carga data/mapas_geo.json a la BD
│   └── generarGeoDesdeDumps.js     Regenera mapas_geo.json desde los dumps
├── public/                         Frontend (HTML/CSS/JS por módulos)
└── tests/                          Pruebas automatizadas
```

## Requisitos

- Node.js **22.5 o superior** (usa el módulo nativo `node:sqlite`).
- Sin dependencias de npm para ejecutar (`xlsx` es opcional, solo para
  importar un Excel nuevo).

## Actualizar la geografía de los mapas

`data/mapas_geo.json` ya viene generado. Para regenerarlo tras un parche
del juego, clona los dumps oficiales y ejecuta:

```bash
git clone --depth 1 https://github.com/ao-data/ao-bin-dumps
node scripts/generarGeoDesdeDumps.js ao-bin-dumps/cluster/world.json
npm run db:geo
```

El catálogo de caminos de Avalon se regenera desde el mismo archivo:

```bash
npm run db:generar-caminos -- ao-bin-dumps/cluster/world.json
npm run db:generar-zonas -- ao-bin-dumps/cluster/world.json
```

## Uso local

```bash
npm start            # http://localhost:3000 — siembra la BD automáticamente
```

No hace falta `npm install`: la aplicación no tiene dependencias en tiempo
de ejecución (solo el script opcional de importar Excel necesita `xlsx`).

### Cuenta de administrador

Al arrancar por primera vez se crea una cuenta con rol `ADMIN`. Puedes
fijarla con variables de entorno:

```bash
ADMIN_USUARIO=andres ADMIN_CLAVE='una-clave-larga-2026' npm start
```

Si no las defines, se crea el usuario `admin` con una **contraseña aleatoria
que se imprime una sola vez en el log del servidor**. No hay credenciales
por defecto en el código ni en el repositorio.

Si prefieres sembrar la base de datos manualmente antes de arrancar:

```bash
npm run db:init
```

Modo desarrollo con recarga automática:

```bash
npm run dev
```

## Pruebas de calidad

```bash
npm test
```

41 pruebas sobre bases de datos SQLite temporales y aisladas, en tres
frentes:

- **Búsqueda:** coincidencia exacta, insensible a mayúsculas, por substring
  (igual que la fórmula `SEARCH()` del Excel), agrupación por mapa,
  búsquedas demasiado cortas y gremios inexistentes.
- **Seguridad:** hashing y verificación de contraseñas, validación de
  entradas, detección real del tipo de imagen y una batería de intentos de
  inyección SQL (búsquedas y login).
- **API completa:** se levanta el servidor real y se comprueban sesiones,
  cookies `HttpOnly`/`SameSite`, CSRF, permisos por rol, historial privado,
  validación de la posición del hideout contra los límites reales del mapa,
  subida/ajuste/borrado de la imagen de fondo por mapa (con tipo real y
  rangos validados), CSP limitada a la wiki oficial,
  path traversal, límite de tamaño del cuerpo y respuestas 404 en JSON.

## Endpoints de la API

Públicos:

- `GET /api/buscar?gremio=texto` → mapas y hideouts donde aparece el gremio.
- `GET /api/mapas` → mapa mundial: los 276 clusters y sus conexiones.
- `GET /api/mapas/:nombre` → detalle geográfico de un mapa + sus hideouts
  (+ datos de su imagen propia, si tiene).
- `GET /api/mapas/:nombre/imagen` → imagen de fondo propia del mapa.
- `GET /api/gremios/:id/logo` → logo del gremio (servido desde la BD).
- `GET /api/tracking` → catálogo de caminos de Avalon + conexiones vigentes
  + estado de la fuente en vivo.
- `GET /api/tracking/:nombre` → un camino o mapa: datos oficiales y sus
  conexiones vigentes (entradas y salidas, con hora de cierre).
- `GET /api/tracking/zonas` → zonas oficiales a las que puede llevar un portal.

Con sesión (+ token CSRF):

- `POST /api/tracking/reportes` → registrar conexiones `{ conexiones: [{ origen, destino, minutos }] }`.
- `DELETE /api/tracking/reportes/:id` → borrar una (autor o administrador).
- `GET /api/salud` → chequeo de salud de la base de datos.

Sesión:

- `POST /api/auth/registro`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/auth/sesion`, `POST /api/auth/clave`
- `GET /api/historial`, `DELETE /api/historial`

Administración (rol `ADMIN` + token CSRF):

- `GET /api/admin/resumen`, `GET /api/admin/auditoria`
- `GET /api/admin/gremios`, `PUT /api/admin/gremios/:id/nombre`,
  `PUT /api/admin/gremios/:id/notas`, `PUT|DELETE /api/admin/gremios/:id/logo`
- `PUT /api/admin/mapas/:id/nombre`
- `PUT|DELETE /api/admin/mapas/:id/imagen`, `PUT /api/admin/mapas/:id/imagen/ajuste`
- `POST /api/admin/hideouts`, `PUT /api/admin/hideouts/:id`,
  `PUT /api/admin/hideouts/:id/posicion`, `DELETE /api/admin/hideouts/:id`
- `GET /api/admin/usuarios`, `PUT /api/admin/usuarios/:id/estado`,
  `PUT /api/admin/usuarios/:id/rol`

## Seguridad

- **Inyección SQL:** el 100% de las consultas usa sentencias preparadas con
  parámetros nombrados (`node:sqlite`); ningún valor del usuario se
  concatena al SQL. Los comodines `%` y `_` de `LIKE` se escapan para que
  se busquen como texto literal. Hay pruebas automatizadas con payloads
  clásicos (`' OR '1'='1`, `'; DROP TABLE hideouts;--`, `UNION SELECT`...).
- **Contraseñas:** hash `scrypt` con sal única por usuario; nunca se
  guardan ni se devuelven en claro. El login tarda lo mismo si el usuario
  no existe que si la clave es incorrecta (no se pueden enumerar cuentas) y
  se bloquea tras 5 fallos en 15 minutos.
- **Sesiones:** viven en el servidor; el navegador solo recibe un token
  opaco en una cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` en
  producción). En la base solo se guarda su SHA-256.
- **CSRF:** patrón double submit — toda escritura exige la cabecera
  `X-CSRF-Token` que debe coincidir con la sesión.
- **Orígenes externos:** la CSP solo permite imágenes de este sitio y de
  `https://wiki.albiononline.com` (teselas del mapa); scripts, estilos y
  conexiones siguen restringidos al propio sitio.
- **XSS:** CSP estricta (`script-src 'self'`, sin `unsafe-inline`) y todo el
  contenido dinámico se inserta con `textContent`/`createElement`, nunca con
  `innerHTML`.
- **Nada sensible en el frontend:** la API devuelve solo lo que la pantalla
  necesita; los hashes, las sesiones y los datos de otros usuarios nunca
  salen del servidor. Ocultar botones no es la protección: cada endpoint
  del panel revalida el rol.
- **Subida de imágenes:** se valida la firma binaria real del archivo (PNG,
  JPG o WebP; el SVG queda excluido por permitir scripts), con tope de 1 MB,
  y se sirve con `Content-Type` fijado por el servidor y `nosniff`.
- **Otros:** límite de peticiones por minuto, cuerpo JSON máximo de 32 kB,
  protección contra *path traversal* en los archivos estáticos, cabeceras
  `X-Frame-Options`, `Referrer-Policy` y HSTS en producción, y bitácora de
  auditoría de cada cambio administrativo.

## Actualizar los datos en una nueva temporada

Cuando Albion Online rote la Zona Negra (nueva season), reemplaza los datos
sin tocar el código:

```bash
npm run db:import -- ./Nuevo_Buscador_S35.xlsx S35
```

El archivo debe tener una hoja llamada **"Mapas BZ"** con el mismo formato
del original (columna A = mapa, columnas B a K = HO 1 a HO 10). La
temporada anterior queda guardada en el histórico; la nueva se activa
automáticamente.

## Despliegue en hosting gratuito

El proyecto queda listo para subirse tal cual. Como los datos se
auto-siembran al arrancar (ver arriba), funciona bien incluso en planes
gratuitos con disco efímero.

### Opción recomendada: Render (plan Free)

1. Sube este proyecto a un repositorio en GitHub/GitLab.
2. En Render, crea un **Web Service** nuevo apuntando al repositorio.
3. **Build command:** `npm install` (o vacío: no hay dependencias)
4. **Start command:** `npm start`
5. Selecciona el plan **Free**.

Ten en cuenta las limitaciones reales del plan gratuito de Render:

- El servicio se "duerme" tras 15 minutos sin tráfico y tarda ~1 minuto en
  despertar con la siguiente visita.
- 750 horas gratis por mes (suficiente para un solo servicio corriendo
  todo el mes).
- El disco es efímero (no soporta discos persistentes en el plan Free),
  pero no es un problema aquí: al despertar, el servidor se auto-siembra
  de nuevo en segundos desde `data/hideouts_seed.json`.

### Alternativa: Koyeb (plan Free)

Koyeb tiene un nivel gratuito permanente: 1 servicio web con 512 MB de RAM,
0.1 vCPU y almacenamiento SSD incluido (regiones Frankfurt o Washington D.C.).
Pide tarjeta de crédito solo para verificación anti-fraude (no cobra si te
quedas en el plan Free). Pasos: conecta el repositorio, define
`npm install` como build command y `npm start` como start command.

### Otras alternativas a evaluar

- **Railway:** no tiene plan gratuito permanente, solo un trial de $5 de
  crédito por 30 días (después pasa a un plan de pago con $1/mes de
  crédito, insuficiente para mantener el servicio corriendo). Útil para
  pruebas cortas, no para dejarlo publicado indefinidamente.
- **Fly.io:** eliminó su nivel gratuito; hoy solo ofrece una prueba
  temporal y luego cobra por uso.

Dado que estas condiciones cambian con frecuencia, antes de decidirte
conviene revisar la página de precios vigente del proveedor elegido.

### Docker (cualquier proveedor con contenedores)

```bash
docker build -t albion-ho-finder .
docker run -p 3000:3000 albion-ho-finder
```

### VPS propio

```bash
git clone <tu-repo>
cd albion-ho-finder
npm install
npm start   # o usa pm2 / systemd para mantenerlo corriendo
```

## Notas

- Albion Online y sus marcas pertenecen a Sandbox Interactive GmbH; esta
  herramienta es un proyecto de comunidad, sin afiliación oficial. Las
  teselas del mapa se cargan desde la wiki oficial con atribución visible;
  si Sandbox Interactive pidiera no usarlas, basta con quitar ese dominio
  de la CSP: el fondo oficial queda vacío y el resto del mapa (nodos,
  salidas, hideouts e imágenes propias) sigue funcionando igual.
