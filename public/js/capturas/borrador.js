/**
 * borrador.js
 * ----------------------------------------------------------------------
 * Guarda en el navegador (IndexedDB) las capturas del panel de registro
 * que aún no se han enviado: la imagen, lo que leyó el OCR y lo que el
 * usuario corrigió. Si la página se recarga o se cierra, al volver las
 * capturas siguen ahí y no hay que pegarlas ni revisarlas otra vez.
 *
 * Nada sale del navegador: el borrador vive solo en este equipo y se
 * borra al guardar las conexiones, al quitar una captura o al vaciar la
 * lista. Si el navegador no permite IndexedDB (modo privado estricto,
 * almacenamiento bloqueado), todo sigue funcionando sin borrador.
 * ----------------------------------------------------------------------
 */

const BASE = 'albion-navigator';
const ALMACEN = 'capturas-pendientes';
/** Un borrador de más de un día ya no sirve: los portales duran menos. */
export const VIGENCIA_MS = 24 * 60 * 60 * 1000;

let conexion = null;

function abrir() {
  if (!conexion) {
    conexion = new Promise((resolver, rechazar) => {
      if (typeof indexedDB === 'undefined') {
        rechazar(new Error('IndexedDB no disponible'));
        return;
      }
      const peticion = indexedDB.open(BASE, 1);
      peticion.onupgradeneeded = () => {
        const db = peticion.result;
        if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'id' });
      };
      peticion.onsuccess = () => resolver(peticion.result);
      peticion.onerror = () => rechazar(peticion.error);
    }).catch((error) => {
      conexion = null;
      throw error;
    });
  }
  return conexion;
}

async function operar(modo, accion) {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const transaccion = db.transaction(ALMACEN, modo);
    const almacen = transaccion.objectStore(ALMACEN);
    const peticion = accion(almacen);
    transaccion.oncomplete = () => resolver(peticion ? peticion.result : undefined);
    transaccion.onerror = () => rechazar(transaccion.error);
    transaccion.onabort = () => rechazar(transaccion.error);
  });
}

/** Ejecuta una operación del borrador sin romper el panel si falla. */
async function seguro(accion, porDefecto) {
  try {
    return await accion();
  } catch (error) {
    return porDefecto;
  }
}

/** Guarda (o reemplaza) una captura pendiente. */
export function guardar(registro) {
  return seguro(() => operar('readwrite', (almacen) => almacen.put({ ...registro, actualizadoEn: Date.now() })));
}

/** Mezcla cambios en una captura ya guardada. */
export function actualizar(id, cambios) {
  return seguro(async () => {
    const actual = await operar('readonly', (almacen) => almacen.get(id));
    if (!actual) return;
    await operar('readwrite', (almacen) => almacen.put({ ...actual, ...cambios, actualizadoEn: Date.now() }));
  });
}

export function borrar(id) {
  return seguro(() => operar('readwrite', (almacen) => almacen.delete(id)));
}

/** Capturas pendientes de un usuario, en el orden en que se agregaron. */
export async function listar(usuario) {
  const todas = await seguro(() => operar('readonly', (almacen) => almacen.getAll()), []);
  return (todas || [])
    .filter((r) => r.usuario === usuario)
    .sort((a, b) => a.orden - b.orden);
}

/** Borra todas las capturas pendientes de un usuario. */
export async function vaciar(usuario) {
  const suyas = await listar(usuario);
  await Promise.all(suyas.map((r) => borrar(r.id)));
}
