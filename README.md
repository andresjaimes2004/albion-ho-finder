# Buscador de Hideouts — Zona Negra (Albion Online)

Aplicación web que reemplaza el Excel "Buscador de Gremio — Hideouts Zona Negra":
el usuario escribe el nombre (completo o parcial) de un gremio y la página
devuelve todos los mapas de Zona Negra donde ese gremio tiene un Hideout,
con el slot y el tipo (HQ, personal o estándar).

## Cambios recientes

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

- **Backend:** Node.js + Express, en capas (rutas → controlador → servicio →
  repositorios), aplicando el patrón Repository y principios de POO
  (encapsulamiento, herencia en `BaseRepository`, responsabilidad única).
- **Base de datos:** SQLite **relacional y normalizada** (3FN), accedida con
  el módulo nativo `node:sqlite` de Node 22 — sin dependencias binarias que
  compilar en el hosting.
  - `temporadas` (permite guardar histórico por season, ej. S34, S35...)
  - `mapas` (cada mapa se guarda una sola vez)
  - `gremios` (cada gremio se guarda una sola vez, con nombre normalizado
    indexado para búsquedas rápidas)
  - `hideouts` (tabla relacional: qué gremio ocupa qué slot, de qué mapa,
    en qué temporada)
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
├── server.js                  Punto de entrada
├── src/
│   ├── app.js                 Configuración de Express (middlewares, rutas)
│   ├── bootstrap.js           Auto-siembra la BD si está vacía al arrancar
│   ├── config/database.js     Conexión SQLite (patrón Singleton)
│   ├── models/Hideout.js      Entidad de dominio
│   ├── repositories/          Acceso a datos (patrón Repository)
│   ├── services/              Lógica de negocio (búsqueda y agrupación)
│   ├── controllers/           Controladores HTTP
│   └── routes/api.js          Definición de endpoints
├── database/schema.sql        Esquema relacional
├── data/hideouts_seed.json    Datos de la temporada S34 (extraídos del Excel)
├── scripts/
│   ├── importarSeed.js        Carga inicial desde el JSON
│   └── importarExcel.js       Importa un Excel nuevo como temporada nueva
├── public/                    Frontend (HTML/CSS/JS)
└── tests/                     Pruebas automatizadas
```

## Requisitos

- Node.js **22.5 o superior** (usa el módulo nativo `node:sqlite`).

## Uso local

```bash
npm install
npm start            # http://localhost:3000 — siembra la BD automáticamente
```

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

Valida, contra una base de datos SQLite temporal y aislada, que la
búsqueda: encuentra coincidencias exactas, es insensible a mayúsculas,
busca por substring (igual que la fórmula `SEARCH()` del Excel original),
agrupa correctamente por mapa, rechaza búsquedas demasiado cortas y
responde vacío cuando el gremio no existe.

## Endpoints de la API

- `GET /api/buscar?gremio=texto` → mapas y hideouts donde aparece el gremio.
- `GET /api/salud` → chequeo de salud de la base de datos.

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
3. **Build command:** `npm install`
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
  herramienta es un proyecto de comunidad, sin afiliación oficial.
