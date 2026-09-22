'use strict';

const zlib = require('zlib');

/**
 * contexto.js
 * ----------------------------------------------------------------------
 * Decora los objetos nativos `req`/`res` de Node con las utilidades que
 * usan los controladores (query, get, ip, status, json, send, cookie...).
 * Es la capa que sustituye a Express manteniendo su forma de uso.
 *
 * Todas las respuestas salen con `Content-Type` explícito y, cuando el
 * contenido es texto y el cliente lo admite, comprimidas con gzip.
 * ----------------------------------------------------------------------
 */

const TIPOS_COMPRIMIBLES = /^(text\/|application\/(json|javascript|xml)|image\/svg)/;
const MINIMO_COMPRIMIR = 1024;

function serializarCookie(nombre, valor, opciones = {}) {
  const partes = [`${nombre}=${encodeURIComponent(valor)}`];

  if (opciones.expires instanceof Date) partes.push(`Expires=${opciones.expires.toUTCString()}`);
  if (typeof opciones.maxAge === 'number') partes.push(`Max-Age=${Math.floor(opciones.maxAge / 1000)}`);
  partes.push(`Path=${opciones.path || '/'}`);
  if (opciones.domain) partes.push(`Domain=${opciones.domain}`);
  if (opciones.httpOnly) partes.push('HttpOnly');
  if (opciones.secure) partes.push('Secure');
  if (opciones.sameSite) {
    const valorSameSite = String(opciones.sameSite);
    partes.push(`SameSite=${valorSameSite.charAt(0).toUpperCase()}${valorSameSite.slice(1)}`);
  }

  return partes.join('; ');
}

function decorarPeticion(req) {
  const url = new URL(req.url, 'http://interno');
  req.ruta = url.pathname;
  req.query = Object.create(null);
  for (const [clave, valor] of url.searchParams.entries()) {
    // Solo se conserva el primer valor de cada parámetro: evita que
    // ?gremio=a&gremio=b llegue como arreglo donde se espera texto.
    if (!(clave in req.query)) req.query[clave] = valor;
  }

  req.params = Object.create(null);
  req.body = undefined;

  req.get = (nombre) => req.headers[String(nombre).toLowerCase()];

  const reenviada = req.headers['x-forwarded-for'];
  req.ip = reenviada
    ? String(reenviada).split(',')[0].trim()
    : (req.socket && req.socket.remoteAddress) || 'desconocida';

  return req;
}

function decorarRespuesta(req, res) {
  res.codigo = 200;
  res.cabeceras = Object.create(null);

  res.status = (codigo) => {
    res.codigo = codigo;
    return res;
  };

  res.set = (nombre, valor) => {
    if (typeof nombre === 'object') {
      Object.assign(res.cabeceras, nombre);
    } else {
      res.cabeceras[nombre] = valor;
    }
    return res;
  };

  res.cookie = (nombre, valor, opciones) => {
    const previas = res.cabeceras['Set-Cookie'] || [];
    res.cabeceras['Set-Cookie'] = [...previas, serializarCookie(nombre, valor, opciones)];
    return res;
  };

  res.clearCookie = (nombre, opciones = {}) =>
    res.cookie(nombre, '', { ...opciones, expires: new Date(0) });

  res.send = (contenido) => {
    if (res.writableEnded) return res;

    let cuerpo = contenido;
    if (Buffer.isBuffer(cuerpo)) {
      if (!res.cabeceras['Content-Type']) res.set('Content-Type', 'application/octet-stream');
    } else if (typeof cuerpo === 'string') {
      if (!res.cabeceras['Content-Type']) res.set('Content-Type', 'text/html; charset=utf-8');
      cuerpo = Buffer.from(cuerpo, 'utf8');
    } else {
      return res.json(cuerpo);
    }

    escribir(req, res, cuerpo);
    return res;
  };

  res.json = (objeto) => {
    if (res.writableEnded) return res;
    res.set('Content-Type', 'application/json; charset=utf-8');
    escribir(req, res, Buffer.from(JSON.stringify(objeto), 'utf8'));
    return res;
  };

  return res;
}

function escribir(req, res, cuerpo) {
  const tipo = res.cabeceras['Content-Type'] || '';
  const aceptaGzip = String(req.headers['accept-encoding'] || '').includes('gzip');

  let salida = cuerpo;
  if (aceptaGzip && cuerpo.length >= MINIMO_COMPRIMIR && TIPOS_COMPRIMIBLES.test(tipo)) {
    salida = zlib.gzipSync(cuerpo);
    res.set('Content-Encoding', 'gzip');
    res.set('Vary', 'Accept-Encoding');
  }

  res.set('Content-Length', String(salida.length));
  res.writeHead(res.codigo, res.cabeceras);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(salida);
}

module.exports = { decorarPeticion, decorarRespuesta, serializarCookie };
