'use strict';

/**
 * hacerAdmin.js
 * ----------------------------------------------------------------------
 * Da el rol ADMIN a una cuenta ya registrada, desde la terminal del
 * servidor. Sirve para recuperar el acceso de administración sin tocar
 * contraseñas (por ejemplo, si nadie guardó la contraseña aleatoria de la
 * cuenta "admin" que se crea en el primer arranque).
 *
 * Uso:
 *   npm run admin:promover -- <usuario>
 *
 * Respeta DB_PATH, igual que el servidor. El cambio queda en la bitácora
 * de auditoría.
 * ----------------------------------------------------------------------
 */

const UsuarioRepository = require('../src/repositories/UsuarioRepository');
const AuditoriaRepository = require('../src/repositories/AuditoriaRepository');

function hacerAdmin(nombre) {
  const usuarios = new UsuarioRepository();
  const fila = usuarios.buscarConClave(String(nombre || '').trim().toLowerCase());
  if (!fila) throw new Error(`No existe ninguna cuenta llamada "${nombre}".`);

  const usuario = usuarios.obtenerPorId(fila.id);
  if (usuario.rol === 'ADMIN') return { usuario, cambiado: false };

  const actualizado = usuarios.cambiarRol(fila.id, 'ADMIN');
  new AuditoriaRepository().registrar({
    accion: 'ROL',
    entidad: 'usuario',
    entidadId: String(fila.id),
    detalle: { rol: 'ADMIN', origen: 'scripts/hacerAdmin.js' },
  });
  return { usuario: actualizado, cambiado: true };
}

if (require.main === module) {
  const nombre = process.argv[2];
  if (!nombre) {
    console.error('Uso: npm run admin:promover -- <usuario>');
    process.exit(1);
  }
  try {
    const { usuario, cambiado } = hacerAdmin(nombre);
    console.log(cambiado ? `"${usuario.usuario}" ahora es administrador.` : `"${usuario.usuario}" ya era administrador.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = hacerAdmin;
