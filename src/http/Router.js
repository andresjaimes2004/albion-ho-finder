'use strict';

/**
 * Router
 * ----------------------------------------------------------------------
 * Enrutador mínimo con la misma forma de uso que Express (get/post/put/
 * delete/use, middlewares encadenados y parámetros `:id`), pero escrito
 * sobre el módulo `http` nativo de Node.
 *
 * ¿Por qué propio y no Express? El proyecto ya usa `node:sqlite` nativo
 * para no arrastrar dependencias binarias. Con este enrutador la app pasa
 * a tener CERO dependencias en tiempo de ejecución: `npm install` deja de
 * ser necesario para desplegar, el arranque es inmediato y la superficie
 * de vulnerabilidades de terceros desaparece.
 *
 * Los parámetros de ruta se extraen con `decodeURIComponent` y nunca se
 * interpolan en SQL: viajan como parámetros de sentencias preparadas.
 * ----------------------------------------------------------------------
 */

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function compilarPatron(ruta) {
  // '/gremios/:id/logo' -> /^\/gremios\/([^/]+)\/logo$/  + ['id']
  const nombres = [];
  const patron = ruta
    .split('/')
    .map((segmento) => {
      if (!segmento) return '';
      if (segmento.startsWith(':')) {
        nombres.push(segmento.slice(1));
        return '([^/]+)';
      }
      return segmento.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return { expresion: new RegExp(`^${patron || '/'}/?$`), nombres };
}

class Router {
  constructor() {
    this.capas = [];
  }

  /** Registra un middleware (opcionalmente montado en un prefijo). */
  use(rutaOManejador, ...manejadores) {
    if (typeof rutaOManejador === 'function') {
      this.capas.push({ tipo: 'middleware', prefijo: '', manejadores: [rutaOManejador, ...manejadores] });
      return this;
    }
    this.capas.push({ tipo: 'middleware', prefijo: rutaOManejador, manejadores });
    return this;
  }

  _registrar(metodo, ruta, manejadores) {
    const { expresion, nombres } = compilarPatron(ruta);
    this.capas.push({ tipo: 'ruta', metodo, ruta, expresion, nombres, manejadores });
    return this;
  }

  /** Ejecuta el router sobre una petición. `siguiente` continúa hacia afuera. */
  manejar(req, res, siguiente, rutaRestante) {
    const ruta = rutaRestante !== undefined ? rutaRestante : req.ruta;
    let indice = 0;

    const avanzar = (error) => {
      if (error) return siguiente(error);

      const capa = this.capas[indice++];
      if (!capa) return siguiente();

      if (capa.tipo === 'middleware') {
        if (capa.prefijo && !ruta.startsWith(capa.prefijo)) return avanzar();

        const sub = capa.prefijo ? ruta.slice(capa.prefijo.length) || '/' : ruta;
        return ejecutarCadena(capa.manejadores, req, res, avanzar, sub);
      }

      if (capa.metodo !== req.method) return avanzar();

      const coincidencia = capa.expresion.exec(ruta);
      if (!coincidencia) return avanzar();

      req.params = {};
      capa.nombres.forEach((nombre, i) => {
        try {
          req.params[nombre] = decodeURIComponent(coincidencia[i + 1]);
        } catch (error2) {
          req.params[nombre] = coincidencia[i + 1];
        }
      });

      return ejecutarCadena(capa.manejadores, req, res, avanzar, ruta);
    };

    return avanzar();
  }
}

function ejecutarCadena(manejadores, req, res, alTerminar, ruta) {
  let indice = 0;

  const siguiente = (error) => {
    if (error) return alTerminar(error);

    const manejador = manejadores[indice++];
    if (!manejador) return alTerminar();

    try {
      if (manejador instanceof Router) {
        return manejador.manejar(req, res, siguiente, ruta);
      }
      return manejador(req, res, siguiente);
    } catch (error2) {
      return alTerminar(error2);
    }
  };

  return siguiente();
}

for (const metodo of METODOS) {
  Router.prototype[metodo.toLowerCase()] = function registrar(ruta, ...manejadores) {
    return this._registrar(metodo, ruta, manejadores);
  };
}

module.exports = Router;
module.exports.ejecutarCadena = ejecutarCadena;
