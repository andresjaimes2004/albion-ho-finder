'use strict';

require('./src/config/entorno')();

const crearApp = require('./src/app');
const asegurarDatosCargados = require('./src/bootstrap');

const PORT = Number(process.env.PORT) || 3000;

// Muchos hostings gratuitos usan disco efímero (se borra al reiniciar o
// "dormir" el servicio). Por eso, antes de levantar el servidor,
// verificamos si la base de datos está vacía y, de ser así, la sembramos
// automáticamente con data/hideouts_seed.json y la geografía oficial de
// los mapas. Así la app funciona sin pasos manuales sin importar si el
// disco persiste o no.
asegurarDatosCargados();

const app = crearApp();
const servidor = app.crearServidor();

servidor.listen(PORT, () => {
  console.log(`Servidor "Buscador de Hideouts" escuchando en el puerto ${PORT}`);
});

// Cierre ordenado: deja de aceptar conexiones antes de terminar el proceso.
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

module.exports = servidor;
