# Albion Navigator — Hideouts de gremios y rutas de Avalon (Albion Online)

Aplicación web que reemplaza el Excel "Buscador de Gremio — Hideouts Zona Negra":
el usuario escribe el nombre (completo o parcial) de un gremio y la página
devuelve todos los mapas de Zona Negra donde ese gremio tiene un Hideout,
con su tipo (HQ o HO) sobre la imagen real del mapa. También sigue las rutas de
Avalon abiertas que registra la comunidad.

## Cambios recientes

### v13.9 — Sugerencias al día, hideouts con su color y ajustes de Caminos

- **Sugerencias del buscador siempre al día**: un gremio nuevo o cambiado en
  el Excel sale en las sugerencias en cuanto se sincroniza, sin recargar. El
  servidor ya no deja que el navegador las guarde 5 minutos: responde con
  `ETag` y `no-cache` (304 vacío si nada cambió). La página las vuelve a pedir
  al usar el buscador si pasaron más de 15 s, después de cada búsqueda y justo
  después de sincronizar desde el panel de administración (que también
  actualiza la búsqueda abierta y Caminos de Avalon). En Caminos de Avalon,
  las sugerencias (caminos y gremios con hideout) se ponían al día cada
  minuto; ahora también al enfocar el buscador.
- **Caminos de Avalon**: la ficha de un camino ya no muestra el código interno
  (`TNL-…`), solo el tier y el tipo.
- **"Tus últimas búsquedas"**: encima de la flecha o entre ella y "Limpiar" la
  tarjeta perdía el hover y parpadeaba (la caja de acciones tapaba la
  cabecera). Ahora solo "Limpiar" queda por encima; la flecha abre y cierra, y
  una franja en el borde de abajo evita el parpadeo al elevarse.
- **Hideouts con los colores de "Tus últimas búsquedas"**: botones, buscador,
  tarjetas de resultados, "Ver rutas", nombres enlazados, foco con teclado y la
  ventana del mapa abierta desde hideouts usan el verde azulado del apartado
  en lugar del dorado. Caminos de Avalon conserva su dorado.

### v13.8 — "Caminos avalonianos" vuelve a mostrar sus tarjetas y el borrado masivo incluye tus espacios

- **Corrección**: en v13.7 un método nuevo de la lista de rutas se llamó igual
  que el que dibuja las tarjetas de los caminos (`_crearTarjeta`) y lo tapaba:
  la sección "Caminos avalonianos" quedaba vacía. Se renombró.
- Prueba nueva: ninguna clase del JavaScript puede definir dos veces el mismo
  método (el segundo taparía al primero sin dar ningún error).
- **Corrección del borrado masivo** ("Administrar rutas"): "Borrar todas" y
  "Borrar las abiertas" solo borraban lo público, aunque el administrador viera
  en su lista rutas de sus espacios privados; esas seguían ahí y parecía que
  no funcionaba. Ahora borran lo que el administrador ve en la lista, según el
  filtro de espacio elegido ("Todos los espacios", "Públicas" o uno). Los
  espacios privados de los que no es miembro siguen sin tocarse. La
  confirmación dice dónde se borra y cuántas rutas, y queda auditado con el
  espacio.

### v13.7 — Las rutas movidas al editarlas se ven en su apartado

- **Corrección**: al editar desde la raíz y cambiar "Guardar en", el conjunto
  se encadenaba también con las conexiones guardadas del destino; se mezclaba
  con otras rutas del espacio y la ruta editada dejaba de existir tal cual (sus
  conexiones seguían, por eso se veía al buscar el mapa). Ahora el conjunto
  solo usa sus propias filas.
- Al mover un conjunto, sus rutas pasan antes al destino y **conservan su id**
  (antes se borraban y se creaban de nuevo); si allí ya hay una con el mismo
  recorrido, se usa esa, sin duplicados.
- Tras guardar una edición, "Rutas del gremio" **muestra la ruta en su
  apartado**: si el filtro de espacio (o de portal) la ocultaba, pasa al
  espacio o a "Públicas" donde quedó, abre su grupo y la resalta un momento
  (el resaltado aguanta los refrescos de la lista).
- Comprobado con capturas reales: al pegar capturas desordenadas en una
  edición, se colocan solas en la cadena (una ruta) o las rutas se vuelven a
  proponer solas (desde la raíz).
- **"Editar" en el mapa raíz**: cada grupo de "Rutas del gremio" (el mapa del
  que salen sus rutas, por ejemplo Sandrift Coast) tiene su botón "Editar",
  que abre directamente el conjunto desde la raíz, sin pasar por una ruta. Solo
  aparece si puedes editar esas rutas; si de ese mapa salen varios conjuntos
  (uno público y otro de un espacio), hay un botón por conjunto que dice cuál.

### v13.6 — Editar rutas desde la raíz, moverlas y nombres de gremio sin filtro

- **Editar desde la raíz**: al editar una ruta, el botón "Editar desde la
  raíz" abre su conjunto entero (las rutas de su misma red, que comparten
  conexiones, del mismo sitio y que puedes editar) con todas sus conexiones
  como filas, igual que al registrarlas: se pega la captura que faltó, se
  quitan o corrigen las que sobran y las rutas se vuelven a proponer solas,
  incluso ramales nuevos. Al guardar (`PUT /api/tracking/conjuntos`, en una
  transacción) las rutas con el mismo recorrido conservan su id, las nuevas
  se crean, las que ya no salen se borran y las conexiones viejas que no usa
  nadie también; nada se duplica. Sin ninguna conexión, se borra el
  conjunto (con confirmación). Solo el autor o un admin, y las rutas siguen a
  nombre de su autor.
- Una edición a medias (de una ruta o de un conjunto) **se conserva al
  cambiar de idioma**, con lo que se había escrito en cada fila.
- Prueba nueva: cada texto de `t()`/`tn()` del JavaScript tiene su
  traducción al inglés.
- **Editar una ruta permite cambiar dónde se guarda**: "Guardar en" aparece
  también al editar, con el destino actual de la ruta; cambiarlo la mueve
  (de público a un espacio privado o al revés, o entre espacios propios) sin
  duplicarla: es la misma ruta, sus tramos pasan al nuevo destino y las
  conexiones antiguas que ya no use nadie se borran. Hay que ser miembro del
  espacio de destino, y si allí ya existe una ruta con el mismo recorrido no
  se mueve.
- **"Guardar en"** con el menú desplegable propio de los filtros (panel
  oscuro, resaltado del apartado, apertura con fundido), enmarcado como los
  demás controles y apareciendo con suavidad.
- **Gremios de caminos de hideouts sin filtro de palabras**: si el juego
  permite el nombre del gremio, la web también (antes, algunos gremios
  reales no se podían anotar ni pasar al Excel). Se sigue comprobando el
  formato; el filtro de insultos queda solo para nombres de cuenta y de
  espacio.

### v13.5 — Caminos de Avalon reorganizado, confirmaciones y alertas propias

- **Caminos de Avalon reorganizado**: la ficha del camino consultado y los
  resultados de la búsqueda aparecen justo debajo del buscador; después,
  "Registrar conexiones", "Espacios privados", "Rutas del gremio" y una
  sección fija "Caminos avalonianos" que muestra los caminos de 9 en 9 (3 × 3),
  con flechas ‹ › para pasar de tanda (circulares: desde la última se vuelve
  a la primera y al revés) y transición horizontal. Los resultados de una
  búsqueda o un filtro usan el mismo formato fijo de 9 en 9 (antes, una lista
  larga con "Mostrar más"). Registro, espacios y rutas
  son tarjetas que se abren pulsando cualquier parte de su cabecera.
- Una sugerencia se elige al completar el clic (antes, al apretar el botón
  del ratón). Mientras se escribe solo se filtra la lista, sin consultar
  nada al servidor; la ficha de un camino se pide al elegirlo.
- Mensajes centrados y legibles en cualquier pantalla (por ejemplo "Ningún
  camino coincide con la búsqueda" ocupaba solo la primera columna).
- **Cambiar de idioma conserva lo que se estaba mirando**: búsquedas,
  filtros, tandas, secciones abiertas, el camino consultado, el mapa de la
  Zona Negra, la ventana de un mapa y la posición de la página (antes, la
  página del otro idioma empezaba de cero).
- En la ficha de un camino, "Datos oficiales del camino" (dungeons y
  recursos) es una tarjeta desplegable al final, plegada por defecto (se
  recuerda si se deja abierta); las conexiones ocupan todo el ancho.
- Las ✕ ya no cortan de golpe: la ficha se pliega con suavidad y lo que se
  borra o se quita (rutas, conexiones, gremios anotados, miembros de un
  espacio, capturas del registro) sale con un fundido.
- **Arreglo**: al buscar o filtrar y desplazar la página, el buscador (y su
  desplegable) pasaba por encima de la cabecera fija. Ahora todo el
  contenido queda por debajo (escala de capas en el CSS).
- **Tarjetas enteras accionables**: en "Conexiones abiertas ahora" toda la
  tarjeta lleva a la ficha del otro mapa (sin el botón "Ver mapa"; la ✕ de
  borrar sigue funcionando aparte), y en "Tus últimas búsquedas" toda la
  píldora repite la búsqueda ("Limpiar" sigue igual).
- "Tus últimas búsquedas" se abre y se cierra pulsando cualquier parte de su
  cabecera (no solo el título), con la flecha a la derecha y el mismo hover
  que las demás secciones desplegables; "Limpiar" funciona aparte.
- **Arreglos**: la ✕ de la ficha de un camino ya no la vuelve a abrir; en
  Hideouts, "Ver mapa de la Zona Negra" se despliega justo debajo del botón.
- **Confirmaciones en una ventana propia** (borrar el espacio, salir de él,
  borrar rutas, eliminar un hideout, quitar una imagen, forzar el Excel),
  con el color del apartado, en lugar de la del navegador.
- **Alertas de los campos con el estilo del sitio** ("Completa este campo",
  "Escribe al menos N caracteres"...), en el idioma de la página.
- **Transiciones revisadas**: botones, apariciones (fichas, estados,
  sugerencias, filas del registro), grupos de rutas que se despliegan y el
  historial plegable, todo con la misma curva y duraciones. Ver "Guía de
  estilo: transiciones".

### v13.4 — Espacios en vivo, sugerencias propias y pulido visual

- **Espacios en vivo, sin recargar**: al agregarte a un espacio, quitarte,
  borrarlo o si alguien sale del tuyo, llega una notificación (abajo a la
  derecha) y se actualizan al momento tus espacios, el "Guardar en" y las
  rutas. La página consulta los avisos cada 10 segundos mientras está
  visible; cada usuario solo ve los suyos.
- Tus espacios aparecen en el filtro de rutas desde que entras en ellos,
  aunque todavía no tengan rutas.
- **Agregar cuenta** sugiere los nombres que tú mismo agregaste antes a tus
  espacios (nunca otros usuarios del sitio).
- **Sugerencias propias** en los buscadores de Hideouts y Caminos de Avalon y
  en origen/destino del registro: con el color de cada apartado, el tipo de
  cada resultado, la parte que coincide resaltada y teclado (↑ ↓ Enter Esc).
- **✕ para borrar** lo escrito en los buscadores y campos de texto.
- **Barras de desplazamiento** con el color de cada apartado.
- "Tus últimas búsquedas" se pliega con su flecha; el mensaje "Escribe al
  menos 2 caracteres" va antes y ocupa menos.
- "Últimos cambios" del panel de administración con alto fijo y su scroll.
- "Guardar en" con el mismo estilo que los demás selectores.

### v13.3 — Espacios privados

- **Crear un espacio privado** (pestaña Caminos de Avalon → "Espacios
  privados"): un grupo de amigos que gankea, farmea o transporta guarda sus
  rutas solo para ellos. Quien lo crea agrega las cuentas por su nombre de
  usuario, **hasta 7 en total contándose**, y puede quitarlas, renombrarlo o
  borrarlo (con todas sus rutas). Cualquier miembro puede salir.
- **"Guardar en"** en el panel de registro: público o uno de tus espacios.
  Una ruta solo se encadena con conexiones del mismo sitio (no se mezclan
  públicas y privadas, ni espacios distintos).
- **"Permitir que los demás vean las conexiones"**: para los grupos que
  quieren alimentar el sitio, las rutas del espacio las ve todo el mundo.
- Las rutas y conexiones muestran a qué espacio pertenecen (🔒 privado, 👥
  abierto) y quién las registró ("por usuario"), y la lista de rutas se
  puede filtrar por espacio.
- Seguridad: el filtrado se hace en el servidor en cada consulta. Lo privado
  no existe (404) para quien no es miembro, aunque sea administrador; al
  deduplicar nunca se toca una conexión o ruta de otro espacio; los borrados
  masivos del administrador solo afectan a lo público; al cerrar sesión la
  lista se vuelve a pedir y desaparece lo privado.
- Límites: hasta 3 espacios creados y 10 espacios por cuenta.

### v13.2 — Gremios de caminos de hideouts que la web recuerda (y comparte con el Excel)

- **Se anotan al crear la ruta**: cuando una ruta nueva llega a un camino de
  hideouts, el panel de registro muestra los gremios que ya se conocen allí y
  un campo para escribir los que se vieron (separados por comas). Se guardan
  con la ruta y quedan para siempre: la próxima ruta a ese camino ya los
  muestra.
- **Pestaña Caminos de Avalon**: con el filtro "Hideout" cada tarjeta muestra
  los gremios del camino, y el buscador también encuentra caminos por gremio
  (sin importar espacios ni tildes: "requiem" encuentra "R E Q U I E M").
- **Pestaña Hideouts**: al buscar un gremio aparecen también los caminos de
  Avalon donde tiene hideout.
- **Excel de Drive en los dos sentidos**, en la hoja nueva "Caminos Avalon"
  (columna A el camino, B..K los gremios):
  - Del Excel a la web: lo que el equipo escribe aparece en la web. Antes se
    valida (solo caminos de hideouts reales y nombres válidos; lo demás se
    ignora y se avisa en el panel de administración).
  - De la web al Excel, **solo agregando**: lo anotado en la web que el Excel
    no tiene se escribe en la primera celda vacía de la fila del camino, o en
    una fila nueva al final. Antes de escribir se vuelve a leer la hoja y se
    comprueba que la celda siga vacía. La web no tiene ninguna forma de
    borrar ni sobrescribir nada del Excel.
  - El Excel manda: si el equipo borra un gremio del Excel, la web también lo
    quita (con la misma protección del 30 % contra hojas vaciadas por error),
    y desde la web ya no se puede borrar lo que está en el Excel.
  - Lo anotado en la web llega al Excel en un par de minutos.
  - Requiere que el archivo sea una **Hoja de cálculo de Google** y dar
    permiso de edición a la cuenta de servicio (ver "Sincronización con el
    Excel de Google Drive" → "Agregar gremios de caminos al Excel").
- Como mucho 10 gremios por camino (las columnas del Excel) y sin nombres
  ofensivos.

### v13.1 — Lector de capturas afinado y rutas desde la entrada

- **Lector medido con 106 capturas reales** (antes 31), revisadas a ojo una
  por una: origen, destino y tiempo correctos en las 106, y **ningún error
  confiado** (antes: 3 tiempos equivocados que no se marcaban para revisar,
  como "12 h 28 m" en vez de "2 h 28 m" o "6 h 10 m" en vez de "6 h 30 m").
  En validación cruzada el tiempo da 105/106 y el fallo queda marcado.
- **Rutas desde la entrada**: cada red de caminos da una ruta desde su mapa
  de entrada hasta cada destino, en vez de todas las combinaciones entre
  extremos (con las sesiones reales, 54 rutas en vez de 152). Una casilla en
  el panel de registro permite volver a todas las combinaciones.
- Banco de pruebas del lector en `herramientas/banco-lector/` para medir
  cada cambio con capturas reales.

### v13 — Correcciones del gremio (segunda ronda)

- **Editar rutas**: quitando todas las conexiones (a mano o con "Vaciar") el
  botón pasa a "Borrar la ruta" y la borra entera; "Invertir sentido"; y la
  captura que faltaba se coloca sola en su sitio de la cadena al pegarla.
- **Cerradas hace poco** con el mismo filtro y agrupación por portal de ciudad
  que las abiertas; los filtros muestran "+N" cerradas.
- **Conexiones sueltas** (sin ruta, sin mapa inicial ni final) se borran solas
  30 minutos después de registrarse.
- **Administradores**: borrar todas las rutas, las abiertas, las del portal
  filtrado o las que pasan por un mapa (`DELETE /api/tracking/rutas?alcance=`).
- **Buscador de hideouts**: sugerencias al escribir (gremios y mapas) y
  búsqueda sin espacios ni separadores ("requiem" encuentra "R E Q U I E M").
- **Nombres de usuario ofensivos** (español e inglés) rechazados al crear
  cuentas (`src/security/nombresOfensivos.js`).
- Campo para anotar gremios en caminos de hideouts con el estilo del buscador,
  y sin la subsección "Gremios" en el panel de administración (la mantiene el
  Excel de Drive).

### v12.7 — Sincronización con el Excel de Google Drive

- El servidor revisa cada hora (configurable) el Excel que el equipo edita en
  Google Drive y **aplica solo las diferencias** a la temporada activa:
  hideouts nuevos, destruidos, de otro gremio o de otro tipo. Las posiciones
  y notas se conservan mientras el gremio del slot no cambie. Si el archivo
  no cambió desde la última revisión, no se descarga.
- Acceso **privado y sin claves**: el archivo se comparte solo con una cuenta
  de servicio de Google (lectura) vinculada a la VM; no hay ningún archivo
  de clave que se pueda filtrar.
- Protección: si el Excel borraría o cambiaría más del 30 % de los hideouts
  no se aplica nada (un administrador puede forzarlo desde el panel).
- Panel de administración: estado de la última revisión y "Sincronizar ahora".
- Lector de .xlsx propio (`src/excel/leerXlsx.js`); se quita el paquete
  `xlsx` de npm, que tiene fallos de seguridad sin corregir. Comprobado contra
  un lector de referencia con Excel reales: 0 diferencias en 783 celdas.

### v12.6 — Hideouts en caminos de Avalon

- **Rutas que terminan en un camino de hideouts.** Los caminos de tipo
  `TUNNEL_HIDEOUT` y `TUNNEL_HIDEOUT_DEEP` (100 en los dumps del juego)
  pueden ser el final de una ruta (Zona Negra → camino → … → camino de
  hideouts), y también seguir más allá si continúan. Antes esas rutas no se
  formaban nunca.
- **Gremios con hideout en ese camino**: en la ficha del camino (y desde la
  tarjeta de la ruta, "¿De quién son los hideouts? Anótalo") cualquier usuario
  con sesión anota los gremios que ve. Anotar otra vez el mismo gremio solo
  renueva la fecha. Hasta 30 gremios por camino. Solo quien lo anotó o un
  administrador lo borra. Tabla `hideouts_camino`.
- **Buscador**: al buscar un gremio o el nombre de un camino aparece el bloque
  "Hideouts en caminos de Avalon"; la tarjeta abre la ficha del camino.
- API: `GET /api/tracking/hideouts?camino=`, `POST /api/tracking/hideouts`
  (`{ camino, gremio }`) y `DELETE /api/tracking/hideouts/:id`.

### v12.5 — Editar rutas guardadas

- Botón **Editar** en cada ruta (su autor o un administrador), también en las
  "Cerradas hace poco". Abre el panel de registro en modo edición con cada
  tramo como una fila: se pueden **pegar capturas nuevas, quitar conexiones,
  cambiar el orden con ↑ ↓ y corregir los tiempos**. La vista previa dice si
  la ruta se encadena o qué conexión no continúa.
- Un portal que ya cerró aparece marcado para reemplazarlo: así se repara una
  ruta cerrada sin borrarla y volver a crearla.
- Las capturas que tenías pendientes se apartan durante la edición y vuelven
  al terminar o cancelar.
- API: `PUT /api/tracking/rutas/:id` con `{ conexiones: [...] }` en el orden
  de la ruta. Las conexiones que ya existían entre las mismas zonas se
  reutilizan; las que la ruta deja de usar se borran si ninguna otra las usa.
  La ruta conserva su autor.

### v12.4 — Rutas que se cierran sin dejar conexiones sueltas

- Cuando cierra un portal de una ruta, lo que viene **después** (leyendo la
  ruta desde su entrada, el lado del portal de ciudad) ya no se alcanza:
  esos tramos dejan de contar como conexiones abiertas al instante, salvo
  que otra ruta abierta los use (`src/services/estadoRutas.js`).
- La ruta pasa a **"Cerradas hace poco"** durante 30 minutos: se ve entera,
  con el portal cerrado en rojo y lo desconectado apagado, para saber a
  dónde llevaba y corregirla.
- Pasados los 30 minutos, una **tarea automática** (cada minuto,
  `src/tareas.js`) borra la ruta y esos tramos siguientes, y purga las
  conexiones ya cerradas. La misma tarea limpia cada hora las sesiones
  caducadas y los intentos de inicio de sesión viejos (antes esa limpieza
  existía pero nunca se ejecutaba).

### v12.3 — Rutas organizadas por portal de ciudad

- **Filtro por portal** en "Rutas del gremio": Bridgewatch, Fort Sterling,
  Lymhurst, Martlock, Thetford (y "Otras"). Cada ruta cuenta para el portal
  más cercano a uno de sus extremos, medido en saltos por la Zona Negra con
  las salidas oficiales de cada mapa (`src/services/portales.js`). Una ciudad
  real cuenta como su propio portal. El filtro elegido se recuerda.
- **Agrupadas por mapa de entrada**, de la más cercana a la más lejana, en
  bloques plegables. El resumen de cada bloque ya dice a dónde lleva cada
  ruta y cuánto le queda; se despliega solo el que interesa.
- Cada ruta se muestra empezando por el extremo más cercano al portal y
  lleva la línea "Entrada: mapa, a N mapas de X Portal" (también en la vista
  de hideouts y en la ficha de cada mapa).

### v12.2 — Rutas que continúan entre envíos y lector sin atascos

- **Una captura nueva continúa una ruta ya guardada.** Antes, las rutas solo
  se armaban con las capturas del mismo envío: si una parte de la ruta ya
  estaba guardada (por ti o por otro miembro), los portales siguientes nunca
  formaban ruta. Ahora el panel de registro encadena también con las
  conexiones abiertas del servidor y marca los tramos "ya guardados".
- **Lector sin atascos:** cada captura dejaba su imagen completa en memoria
  y una lectura colgada bloqueaba toda la cola ("Leyendo..." para siempre y
  sin poder guardar). Ahora la memoria se libera y una lectura que pasa de
  60 s se descarta para que sigan las demás.
- Hasta 100 conexiones por envío (antes 50).
- Aclaración: no hay límite de rutas activas en total. Al borrar una ruta se
  borran de verdad (no se ocultan) la ruta y las conexiones que solo usaba
  ella; las que comparte con otras rutas se conservan.

### v12.1 — Mapa global usable en el móvil

- **Gestos táctiles** en el mapa de la Zona Negra y en la ventana de cada mapa:
  un dedo arrastra, dos dedos pellizcan (zoom y desplazamiento a la vez) y el
  doble toque acerca. Arrastrar empezando sobre un mapa también mueve la vista
  (y no abre el mapa); un toque sin mover lo sigue abriendo.
- **Botones + / − / ver todo** sobre el mapa global, y + / − junto a "Centrar"
  en la ventana del mapa.
- **Fondo resistente a bloqueos**: las teselas vienen de la wiki oficial, que
  está detrás de Cloudflare y a veces responde a redes o navegadores móviles
  con un desafío (403) en lugar de la imagen. Cada tesela que falla se
  reintenta una vez; si no carga ninguna, el mapa lo avisa y cambia a un fondo
  liso que deja ver puntos, nombres y conexiones.

### v12 — Lector de capturas nuevo, borrador y token de seguridad

- **Lector de capturas rehecho** y medido con 31 capturas reales a
  1920×1080 (antes: origen 25/31, destino 26/31, tiempo 11/31; ahora
  31/31 en los tres, 30/31 en tiempo validando dejando una fuera):
  - el recuadro del portal se ubica por el carril completo de la barra
    de capacidad (parte llena + vacía, siempre 137 px a 1080p), no solo
    por lo amarillo: antes los portales que no estaban 7/7 se recortaban
    mal y los de 0/7 o 1/7 no se encontraban;
  - el tiempo de cierre lo lee un reconocedor propio de la tipografía del
    juego (`capturas/tiempo.js` + `capturas/plantillas.js`, 156
    caracteres reales) con una gramática estricta ("18 h 03 m", "12 h",
    "42 m 09 s"): ya no se pierde el "1" de 10-19 h;
  - los nombres cortados por la interfaz, por delante o por detrás, se
    encuentran igual y se resaltan para revisarlos;
  - ante la duda se resalta o se deja vacío, nunca se inventa un valor.
- **Borrador de capturas:** las capturas del panel (imagen, lectura y
  correcciones) se guardan en el navegador (IndexedDB) hasta enviarlas;
  si la página se recarga, vuelven tal cual.
- **Portales cerrados:** una captura cuyo portal ya cerró se marca y no se
  guarda ni forma rutas (antes quedaba con 1 minuto). Cada ruta propuesta
  muestra cuánto le queda (hasta que cierra su primer portal).
- **Token de seguridad:** se renueva junto con la sesión y el servidor lo
  repone si el navegador lo pierde; si una escritura lo encuentra
  caducado, el navegador reintenta solo. Antes, pasadas 8 h desde el
  login, todo guardado fallaba con "Token de seguridad inválido".

### v11 — Imágenes de los mapas y ventana del mapa renovada

- **Imagen real de cada mapa:** los 276 mapas de la Zona Negra muestran la
  textura del minimapa del juego, girada a diamante con la misma
  transformación que las salidas y los hideouts, así que encaja sin
  ajustes. Se cargan por lotes con `npm run db:imagenes` (ver "Imágenes
  de los mapas por lotes") y se pueden pasar antes a WebP con
  `herramientas/convertir-webp.html`. La imagen guarda su tipo
  (`mapas_imagen.proyeccion`: `juego` o `diamante`) y el administrador
  puede cambiarlo junto a la escala y la rotación.
- **Salidas:** se omiten las mazmorras estáticas (Cathedral of Light,
  Exalted Crypt…). Las que llevan a ciudades, Smuggler's Den, Rests o
  pasajes se muestran como referencia, punteadas y sin poder abrirse.
- **Ventana del mapa:** fundido suave al saltar a un mapa vecino (el nuevo
  aparece con su imagen ya descargada), estética de vidrio con el acento
  del apartado y el arte de Hideouts de fondo, un solo scroll (en
  escritorio el mapa queda fijo y solo se desplaza la lista) y textos con
  jerarquía: los mapas vecinos destacan, lo secundario es más pequeño y
  los textos que chocan se recolocan.
- **Tarjetas de resultados:** toda la tarjeta abre el mapa, con elevación
  y flecha al pasar el ratón. Se quitó el "Slot n": era el número de fila
  del Excel original y no aportaba información.
- **Arrastre de los mapas:** ya no se queda "bloqueado" al arrastrar sobre
  las imágenes (el navegador intentaba arrastrarlas como archivos).

### v10 — Pulido de la interfaz, rutas con bifurcaciones y mapa global

- **Rutas de Avalon con bifurcaciones:** las capturas pegadas en desorden
  forman un grafo (zonas = nodos, portales = aristas) que se recorre en
  árbol desde cada extremo (Zona Negra, ciudad…) por los caminos de
  Avalon. Cada llegada a otro extremo es una ruta, así que un portal que
  lleva a varios mapas genera rutas independientes que comparten tramos
  (`public/js/capturas/encadenar.js`). Hasta 50 conexiones y 40 rutas por
  envío.
- **Lectura de capturas tolerante al color:** la barra del portal y el
  título se buscan primero con los colores exactos y, si no aparecen, por
  tono/saturación/brillo relativos a la propia captura (otro brillo,
  gamma, saturación, HDR o luz nocturna).
- **Mapa global de la Zona Negra** al estilo de ava.smugden.com: más
  grande, puntos del color de su tier y etiquetas con el nombre al
  acercar; los mapas del gremio buscado se resaltan.
- **Ventana del mapa:** sin "Caminos de los datos" ni selector de fondos
  (queda "Mapa"); tipos de hideout solo HQ y HO (los "P" antiguos se
  muestran como HO sin tocar la base de datos).
- **Interfaz:** transiciones suaves en todo lo accionable (también al abrir
  y cerrar ventanas), tarjetas de "Todo lo que necesitas" navegables,
  interruptor y selectores con estilo propio, iconos en botones, cajas
  más translúcidas con bordes del color de cada fondo, y el scroll del
  fondo bloqueado mientras hay una ventana abierta.

### v9 — Portada y donaciones

- **Tres apartados:** Inicio (`/`, presentación del sitio), Hideouts
  (`/#hideouts`, el buscador) y Caminos de Avalon (`/#caminos`). La marca
  "Albion Navigator" lleva al inicio; el botón "atrás" del navegador vuelve
  al apartado anterior.
- **Fondo fijo por apartado** (como AlbionOnlineBuilds): la imagen se queda
  quieta al desplazarse y el pie, sólido, la tapa al final. Inicio usa el
  arte morado, Hideouts `fondo-hideouts.webp` y Caminos
  `fondo-caminos.webp`, con un fundido al cambiar de apartado. A las
  imágenes se les recortó la franja con el logo de Albion.

- **Portada** (al estilo de HostGator): arte del juego en una tarjeta
  redondeada, titular, qué es el sitio, que es gratis y sin anuncios, y dos
  botones: "Buscar un gremio" y "Apoyar el proyecto". Debajo, una franja
  con cifras reales (hideouts, mapas con hideouts, caminos y temporada) que
  cuentan hacia arriba al cargar.
- **"Todo lo que necesitas"**: tres tarjetas, cada una con su arte (buscar
  hideouts, seguir rutas,
  registrar conexiones) que se expanden al pasar el ratón; en móvil se
  apilan.
- **"Mantén Albion Navigator en línea"**: en qué se usan las donaciones y
  dos formas de donar: **Ko-fi** (tarjeta o PayPal, desde cualquier país) y
  **Bre-B** (desde Colombia, sin comisiones, con botón para copiar la llave
  y QR opcional). Botón "Apoyar" en la barra superior y enlace "Donar" en el
  pie, junto a "Creado por TurnDark".
- **Configuración** por entorno: `DONAR_KOFI_URL`, `DONAR_BREB_LLAVE` y el QR
  en `public/assets/qr-breb.png`. Se validan antes de publicarse; sin
  configurar, cada opción aparece como "muy pronto". El sitio nunca maneja
  datos de pago: solo enlaza a Ko-fi y muestra la llave.
- **Preguntas frecuentes** (al estilo de HostGator): título y un acordeón de
  11 preguntas (una abierta a la vez, apertura suave). Las
  preguntas viven en `src/i18n/preguntas.js` (español e inglés) y se
  publican también como datos estructurados `FAQPage` para Google.
- Pie: "© 2026 Albion Navigator. Todos los derechos reservados."
- Animaciones suaves (entrada de la portada, aparición al desplazarse,
  latido del corazón) que se desactivan con "reducir movimiento".

### v8 — SEO y versión en inglés

- **Dos idiomas, dos URL:** `/` en español y `/en/` en inglés, con su
  propio título, descripción, URL canónica y enlaces `hreflang` entre
  ellas (`x-default` → inglés). Selector ES / EN en la barra superior que
  conserva la sección abierta (`#caminos`). No se redirige según el idioma
  del navegador: Google necesita ver ambas versiones.
- **Plantilla única:** la página sale de `src/vistas/index.html`; los
  textos marcados con `{{...}}` se traducen con `src/i18n/pagina.js` y los
  del JavaScript con `public/js/i18n.js` (`t('texto en español')`). Las
  pruebas fallan si un texto nuevo no tiene traducción.
- **Para buscadores:** palabras clave de lo que buscan los jugadores
  (hideouts de gremios, Zona Negra / Black Zone, caminos y rutas de Avalon /
  Avalonian roads), datos estructurados de schema.org (`WebSite` y
  `WebApplication` gratuita), Open Graph y Twitter Card con imagen de
  1200×630 (`og-albion-navigator.jpg`), `robots.txt`, `sitemap.xml` y
  `manifest.webmanifest`.
- **Sin contenido duplicado:** las rutas desconocidas responden un 404 real
  (antes devolvían la página principal) y `/index.html` redirige a `/`.
- **Variables nuevas:** `SITIO_URL` (por defecto
  `https://albionho.duckdns.org`) y, opcionales,
  `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` para verificar el
  sitio en Search Console y Bing Webmaster Tools.

### v7 — Nueva imagen: Albion Navigator

- **Nombre y logo:** el sitio pasa a llamarse **Albion Navigator**. El
  escudo del logo se usa completo y, recortado como medallón (la brújula
  central), en la cabecera, el pie, el favicon y el icono de iOS
  (`public/assets/marca-96.webp`, `favicon-32.png`, `apple-touch-icon.png`).
- **Cabecera:** barra fija y translúcida (con desenfoque) con la marca, las
  secciones Hideouts / Caminos de Avalon como navegación y la cuenta. En
  móvil queda en dos filas; "Crear cuenta" se ofrece desde el diálogo de
  inicio de sesión.
- **Fondo:** arte de Albion Online oscurecido en la parte superior que se
  funde con el fondo (`fondo-avalon.webp`, con versión de 960 px para
  móvil). Paneles de búsqueda translúcidos sobre el arte.
- **Títulos de sección** con icono, título y descripción.
- **Pie a varias columnas:** marca y descripción, herramientas, recursos,
  créditos ("Creado por TurnDark") y aviso de marca de Sandbox Interactive.

### v6.2 — Sin fuentes externas en Caminos de Avalon

- Se quitó la API de ava.smugden.com: no se actualizaba con la frecuencia
  necesaria. Las conexiones y rutas salen **solo** de lo que registran los
  usuarios desde capturas del juego (v5), y el catálogo de caminos, de los
  dumps oficiales del cliente. El servidor ya no hace peticiones externas
  para esta sección y la variable `TRACKING_API_URL` dejó de usarse.
- El indicador de la pestaña muestra "N conexiones activas · M rutas"; si
  un camino no tiene conexiones, la ficha invita a registrarlas desde una
  captura.

### v6.1 — Rutas en la ventana del mapa

- Al abrir la ventana de un mapa (desde el buscador, el mapa mundial o una
  salida vecina), el panel lateral muestra las rutas de Avalon vigentes que
  pasan por él y sus conexiones directas, con el botón **"Ir a la ruta en
  Caminos de Avalon"** que cierra la ventana y abre su ficha. Cada zona de
  la ruta también lleva a su ficha.

### v6 — Rutas de Avalon y hideouts conectados

- **Rutas:** varias conexiones encadenadas en orden, por ejemplo
  mapa de Zona Negra → camino 1 → camino 2 → … → mapa final (o solo
  Zona Negra → camino → mapa final). Cada tramo conserva su propio tiempo
  de cierre; la ruta se muestra mientras todos sigan abiertos.
- **Registro encadenado:** en el panel de capturas se pega un portal de
  cada tramo, en cualquier orden. Los tramos que comparten zonas (en
  cualquier sentido: los portales son de ida y vuelta) se proponen como una
  ruta ordenada desde la Zona Negra; se puede invertir o guardar por
  separado. Si hay bifurcaciones o ciclos no se adivina.
- **Hideouts conectados:** al buscar un gremio, cada mapa con hideout que
  aparezca en una ruta o tenga conexiones vigentes muestra "Avalon: N rutas
  · M conexiones"; al desplegarlo se ve la ruta con ese mapa resaltado y se
  puede saltar a su ficha en Caminos de Avalon.
- **Caminos de Avalon:** lista "Rutas del gremio" y, en la ficha de cada
  mapa, las rutas que pasan por él. Quien registró la ruta o un
  administrador puede borrarla (se borran también los tramos que no usa
  ninguna otra ruta).

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

## Guía de estilo: transiciones

Toda transición nueva tiene que ser suave y mantener el estilo del sitio:

- Hover, foco y cambios de color: `--duracion-rapida` (0,18 s); aparecer y
  desplegar: `--duracion` (0,28 s); siempre con la curva `--curva`
  (variables en `public/css/styles.css`, bloque v13.5).
- Lo que aparece entra con la animación `aparecer` (fundido y leve
  desplazamiento). Lo que se despliega o pliega usa `mostrarSuave`,
  `ocultarSuave` o `conectarDesplegable` (`public/js/animar.js`), nunca un
  `hidden` a secas; lo que se borra o se quita sale con `retirarSuave`.
- Ventanas flotantes con `.ventana`; confirmaciones con `confirmar()`
  (`public/js/dialogos.js`). Nada de `window.confirm` ni `alert`; las
  alertas de los campos las pone `validacionFormularios.js`.
- Nada de animaciones de más de 0,4 s (salvo la decoración de la portada) ni
  en listas que se redibujan a cada refresco (parpadean).
- Siempre con su versión para `prefers-reduced-motion` (sin movimiento).
- **Capas (z-index)**: nada del contenido puede pasar por encima de la
  cabecera fija. Se usa la escala `--capa-elevada` (panel en uso) <
  `--capa-alerta-campo` < `--capa-cabecera` < `--capa-avisos`; una prueba
  automática falla si algún z-index del contenido llega a la cabecera.
- `tests/frontend.test.js` comprueba que cada id que usa el JavaScript existe
  en la página y que no vuelven los diálogos ni las listas nativas.

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
│   ├── importarImagenesMapas.js    Carga por lotes las imágenes de los mapas
│   └── generarGeoDesdeDumps.js     Regenera mapas_geo.json desde los dumps
├── herramientas/convertir-webp.html  Conversor por lotes a WebP (local)
├── public/                         Frontend (HTML/CSS/JS por módulos)
└── tests/                          Pruebas automatizadas
```

## Requisitos

- Node.js **22.5 o superior** (usa el módulo nativo `node:sqlite`).
- Sin dependencias de npm (ni siquiera para leer Excel: el lector de .xlsx
  es propio).

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

## Imágenes de los mapas por lotes

Cada mapa puede tener una imagen de fondo propia (la que sube un
administrador desde la ventana del mapa). Para cargarlas todas de una vez,
deja los archivos (PNG, JPG o WebP, máximo 4 MB cada uno) en una carpeta
y ejecuta:

```bash
npm run db:imagenes -- ./imagenes-mapas --simular   # revisa qué haría
npm run db:imagenes -- ./imagenes-mapas             # importa
```

El mapa se reconoce por el nombre del archivo: el número inicial es el id
del cluster en los dumps, que es como el cliente del juego nombra cada mapa
(`1353_WRL_FR_AUTO_T8_MOR_OUT_Q1.png` → Timbertop Escarp). También vale el
nombre del mapa (`Avalanche Incline.png`). Los mapas que ya tienen imagen
no se tocan, para no perder ajustes hechos a mano; `--reemplazar` los
sustituye. Se tratan como la textura cuadrada del minimapa del juego: la
ventana del mapa la gira a diamante con la misma transformación que las
salidas y los hideouts, así que encaja sin ajustes. En producción se
ejecuta en el servidor, con la carpeta subida
allí. Después, cada imagen se puede afinar con el ajuste de escala,
desplazamiento y rotación.

Para que pesen poco (el plan gratuito de Google Cloud solo incluye 1 GB de
tráfico al mes), conviértelas antes a WebP con
`herramientas/convertir-webp.html`: se abre con doble clic en Chrome o Edge,
convierte por lotes en el propio navegador conservando cada nombre y entrega
un ZIP o guarda el resultado en una carpeta.

## Uso local

```bash
npm start            # http://localhost:3000 — siembra la BD automáticamente
```

No hace falta `npm install`: la aplicación no tiene dependencias.

### Datos de ejemplo (solo en local)

Para ver el sitio con contenido: dos cuentas de prueba (`demo_lider` y
`demo_amigo`), rutas públicas, un espacio privado con su ruta, gremios en un
camino de hideouts y un aviso pendiente.

```bash
node herramientas/demo/sembrarDemo.js           # crea (o recrea) la demo
node herramientas/demo/sembrarDemo.js --borrar  # la quita sin tocar nada más
```

Las claves de las cuentas de prueba se generan al azar y quedan en
`herramientas/demo/credenciales-demo.local.txt` (ignorado por git). No se
ejecuta con `NODE_ENV=production`. Las rutas duran unas horas, como las
reales: si caducan, se vuelve a ejecutar.

### Cuenta de administrador

Al arrancar por primera vez se crea una cuenta con rol `ADMIN`. Puedes
fijarla con variables de entorno:

```bash
ADMIN_USUARIO=andres ADMIN_CLAVE='una-clave-larga-2026' npm start
```

Si no las defines, se crea el usuario `admin` con una **contraseña aleatoria
que se imprime una sola vez en el log del servidor**. No hay credenciales
por defecto en el código ni en el repositorio.

Si pierdes esa contraseña, registra una cuenta normal desde la web y dale
rol de administrador desde la terminal del servidor (no toca contraseñas y
queda en la bitácora):

```bash
npm run admin:promover -- <usuario>
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
  + estado de la fuente en vivo. Las consultas de caminos solo devuelven lo
  público, lo de los espacios de quien pregunta y lo de espacios abiertos.
- `GET /api/tracking/:nombre` → un camino o mapa: datos oficiales y sus
  conexiones vigentes (entradas y salidas, con hora de cierre).
- `GET /api/tracking/zonas` → zonas oficiales a las que puede llevar un portal.
- `GET /api/tracking/rutas?mapas=A,B` → rutas del gremio y conexiones vigentes
  de esos mapas (hasta 50), para la vista de hideouts.

Con sesión (+ token CSRF):

- `POST /api/tracking/reportes` → registrar conexiones `{ conexiones: [{ origen, destino, minutos }], rutas: [[0, 1, 2]], espacio: null }`
  (cada ruta es la lista, en orden, de posiciones dentro de `conexiones`;
  `espacio` es el id de un espacio privado del que se es miembro, o `null`
  para público).
- `GET /api/avisos`, `POST /api/avisos/leidos` `{ ids }` → avisos del
  usuario (cambios en sus espacios).
- `GET /api/espacios/contactos` → cuentas que el usuario agregó antes a sus
  espacios (sugerencias al agregar miembros).
- `GET /api/espacios`, `POST /api/espacios` `{ nombre, publico }`,
  `PUT|DELETE /api/espacios/:id`, `POST /api/espacios/:id/miembros` `{ usuario }`,
  `DELETE /api/espacios/:id/miembros/:usuarioId` → espacios privados (crear,
  cambiar, borrar y agregar o quitar cuentas los hace quien lo creó; salir,
  cualquier miembro).
- `DELETE /api/tracking/rutas/:id` → borrar una ruta (autor o administrador).
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

## Sincronización con el Excel de Google Drive

El Excel de hideouts (hoja **"Mapas BZ"**: columna A = mapa, B..K = HO 1..HO 10,
con "(HQ)" o "(P)" al final del gremio cuando corresponde) puede vivir en Google
Drive. El servidor lo revisa cada `EXCEL_SYNC_MINUTOS` minutos y aplica los
cambios. Sirve un `.xlsx` subido a Drive o una hoja de cálculo de Google.

**Reglas**

- El Excel manda: si alguien cambia un hideout desde el panel y el Excel dice
  otra cosa, la siguiente sincronización deja lo del Excel.
- Solo cambia lo que es distinto. Si en un slot sigue el mismo gremio, su
  posición en el mapa y su nota se conservan; si entra otro gremio, se borran
  (eran del anterior).
- Los mapas que el Excel escribe mal se ignoran y se avisan; los mapas que
  faltan en el Excel no se vacían.
- Si se borrarían o cambiarían más del 30 % de los hideouts, no se aplica
  nada. Si es correcto (por ejemplo, un reinicio de temporada), un
  administrador pulsa "Aplicar de todos modos" en el panel.
- Una temporada nueva se sigue creando con `npm run db:import`.

**Configuración sin claves (una sola vez)**

La web corre en una VM de Google Cloud, así que no se descarga ninguna clave:
se crea una cuenta de servicio sin permisos, se **vincula a la VM** y la VM pide
tokens temporales a Google por sí sola. Es la opción que Google recomienda para
programas que corren dentro de Google Cloud (la federación de identidades es
para los que corren fuera).

1. Consola de Google Cloud, en el proyecto de la VM: *APIs y servicios →
   Biblioteca* → **Google Drive API** → *Habilitar*.
2. *IAM y administración → Cuentas de servicio → Crear cuenta de servicio*:
   nombre `albion-excel-lector`, **sin ningún rol**. No crees claves.
3. En Google Drive, **comparte el Excel** con el correo de esa cuenta
   (`albion-excel-lector@<proyecto>.iam.gserviceaccount.com`) como **Lector**.
   Si el Excel está en una *unidad compartida*, añade ese correo como miembro
   **Lector** de la unidad. No hace falta ningún enlace público.
4. Copia el **id del archivo**: lo que va entre `/d/` y la siguiente `/` en
   su dirección (`https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit`).
5. En **Cloud Shell** (no en la ventana SSH de la VM), vincula la cuenta a la
   VM con permiso de solo lectura de Drive. La VM se apaga 1–2 minutos; la IP
   fija no cambia. `ZONA` sale de `gcloud compute instances list`:
   ```bash
   gcloud compute instances stop albion-ho-finder --zone=ZONA
   gcloud compute instances set-service-account albion-ho-finder --zone=ZONA \
     --service-account=albion-excel-lector@<proyecto>.iam.gserviceaccount.com \
     --scopes=https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write
   gcloud compute instances start albion-ho-finder --zone=ZONA
   ```
   De paso, la VM deja de usar la cuenta por defecto de Compute Engine, que
   tiene permisos de Editor sobre todo el proyecto.
6. Añade al `.env` de la VM (en la ventana SSH):
   ```
   EXCEL_DRIVE_ID=ESTE_ES_EL_ID
   EXCEL_SYNC_MINUTOS=60
   ```
7. Reinicia y mira el registro: la primera revisión ocurre a los 30 s.
   ```bash
   sudo systemctl restart albion
   journalctl -u albion -n 30 --no-pager
   ```
   En el panel de administración aparecen el estado, la cuenta con la que se
   comparte el Excel y el botón "Sincronizar ahora". Cada sincronización con
   cambios queda en la bitácora.

**Agregar gremios de caminos al Excel (v13.2, opcional)**

Los gremios de caminos de Avalon de hideouts viven en la hoja **"Caminos
Avalon"** (columna A = camino, B..K = gremios). Del Excel a la web funciona con
la configuración de arriba. Para que la web también **agregue** al Excel lo que
se anota en ella hace falta permiso de edición. La web solo agrega: escribe en
celdas vacías o en filas nuevas al final, nunca borra ni sobrescribe, y crea la
hoja "Caminos Avalon" si no existe.

1. El archivo tiene que ser una **Hoja de cálculo de Google**. Si en Drive
   aparece la etiqueta `XLSX` junto al título, ábrelo y usa *Archivo → Guardar
   como Hoja de cálculo de Google*; el equipo pasa a editar la copia y en
   `EXCEL_DRIVE_ID` va el id de la copia.
2. Consola de Google Cloud: *APIs y servicios → Biblioteca* → **Google Sheets
   API** → *Habilitar*.
3. En Drive, cambia el permiso de la cuenta `albion-excel-lector@…` sobre la
   hoja de **Lector** a **Editor** (si es miembro de una unidad compartida,
   a **Colaborador**). Solo puede editar lo que se comparte con ella.
4. En **Cloud Shell**, añade el alcance de Hojas de cálculo a la VM (se apaga
   1–2 minutos, la IP fija no cambia):
   ```bash
   gcloud compute instances stop albion-ho-finder --zone=ZONA
   gcloud compute instances set-service-account albion-ho-finder --zone=ZONA \
     --service-account=albion-excel-lector@<proyecto>.iam.gserviceaccount.com \
     --scopes=https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write
   gcloud compute instances start albion-ho-finder --zone=ZONA
   ```
5. Pulsa "Sincronizar ahora" en el panel de administración: si hay gremios
   pendientes, el estado dice cuántos se agregaron o qué permiso falta.

Sin estos pasos todo lo demás sigue funcionando: los gremios anotados se
guardan en la web y el panel de administración muestra cuántos están
pendientes de pasar al Excel.

**Fuera de Google Cloud** (por ejemplo, para probar en local) no hay VM que
entregue tokens: ahí sí hace falta una clave JSON de la cuenta de servicio en
`GOOGLE_CREDENCIALES=/ruta/credenciales-drive.json` (`credenciales*.json` está
en `.gitignore`). Nunca la subas a GitHub; si se filtra, bórrala en la consola
(*Claves*).

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
- **Las cuentas y todo lo editado desde la web se pierden** al dormir o
  reiniciar el servicio: usuarios, hideouts, nombres de gremio, logos,
  imágenes de mapas y conexiones registradas. Define `ADMIN_USUARIO` y
  `ADMIN_CLAVE` en *Environment* para que la cuenta de administrador se
  recree siempre con tu contraseña. Para conservar los datos hace falta un
  plan con disco persistente (montarlo, p. ej., en `/var/data` y definir
  `DB_PATH=/var/data/albion.db`).
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
