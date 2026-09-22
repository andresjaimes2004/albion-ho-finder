'use strict';

require('dotenv').config();
const crearApp = require('./src/app');
const asegurarDatosCargados = require('./src/bootstrap');

const PORT = process.env.PORT || 3000;

// Muchos hostings gratuitos usan disco efímero (se borra al reiniciar o
// "dormir" el servicio). Por eso, antes de levantar el servidor,
// verificamos si la base de datos está vacía y, de ser así, la sembramos
// automáticamente con data/hideouts_seed.json. Así la app funciona sin
// pasos manuales sin importar si el disco persiste o no.
asegurarDatosCargados();

const app = crearApp();

app.listen(PORT, () => {
  console.log(`Servidor "Buscador de Hideouts" escuchando en el puerto ${PORT}`);
});
