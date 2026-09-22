'use strict';

/**
 * BuscadorUI
 * ----------------------------------------------------------------------
 * Controlador de la interfaz (POO, sin frameworks): encapsula referencias
 * al DOM y el estado de la búsqueda. Todo el contenido dinámico se
 * inserta con textContent/createElement (nunca innerHTML con datos de la
 * API) para evitar XSS con nombres de gremio arbitrarios.
 * ----------------------------------------------------------------------
 */
class BuscadorUI {
  constructor() {
    this.input = document.getElementById('input-gremio');
    this.badgeTemporada = document.getElementById('badge-temporada');

    this.estados = {
      vacio: document.getElementById('estado-vacio'),
      cargando: document.getElementById('estado-cargando'),
      sinResultados: document.getElementById('estado-sin-resultados'),
      error: document.getElementById('estado-error'),
    };
    this.errorTexto = document.getElementById('estado-error__texto');

    this.resumen = document.getElementById('resumen-resultados');
    this.listaMapas = document.getElementById('lista-mapas');

    this.temporadaMostrada = false;
    this.temporizadorDebounce = null;
    this.controladorActual = null;

    this._bindEventos();
  }

  _bindEventos() {
    this.input.addEventListener('input', () => {
      clearTimeout(this.temporizadorDebounce);
      const texto = this.input.value.trim();

      if (texto.length < 2) {
        this._mostrarEstado('vacio');
        return;
      }

      this.temporizadorDebounce = setTimeout(() => this._ejecutarBusqueda(texto), 300);
    });
  }

  _mostrarEstado(nombreEstado) {
    Object.values(this.estados).forEach((el) => (el.hidden = true));
    this.resumen.hidden = true;
    this.listaMapas.innerHTML = '';

    if (nombreEstado && this.estados[nombreEstado]) {
      this.estados[nombreEstado].hidden = false;
    }
  }

  async _ejecutarBusqueda(texto) {
    this._mostrarEstado('cargando');

    if (this.controladorActual) {
      this.controladorActual.abort();
    }
    this.controladorActual = new AbortController();

    try {
      const respuesta = await fetch(`/api/buscar?gremio=${encodeURIComponent(texto)}`, {
        signal: this.controladorActual.signal,
      });
      const datos = await respuesta.json();

      if (!datos.ok) {
        this.errorTexto.textContent = datos.mensaje || 'No se pudo completar la búsqueda.';
        this._mostrarEstado('error');
        return;
      }

      this._actualizarBadgeTemporada(datos.temporada);

      if (datos.totalMapas === 0) {
        this._mostrarEstado('sinResultados');
        return;
      }

      this._renderizarResultados(datos);
    } catch (error) {
      if (error.name === 'AbortError') return;
      this.errorTexto.textContent = 'No se pudo conectar con el servidor. Intenta nuevamente.';
      this._mostrarEstado('error');
    }
  }

  _actualizarBadgeTemporada(codigo) {
    if (!codigo) return;
    this.badgeTemporada.textContent = `Temporada ${codigo}`;
    this.badgeTemporada.hidden = false;
  }

  _renderizarResultados(datos) {
    this._mostrarEstado(null);

    this.resumen.hidden = false;
    this.resumen.innerHTML = '';
    this.resumen.appendChild(
      this._crearSpanResumen(`${datos.totalMapas} mapa${datos.totalMapas === 1 ? '' : 's'}`)
    );
    this.resumen.appendChild(
      this._crearSpanResumen(`${datos.totalHideouts} hideout${datos.totalHideouts === 1 ? '' : 's'}`)
    );

    this.listaMapas.innerHTML = '';
    for (const grupo of datos.resultados) {
      this.listaMapas.appendChild(this._crearTarjetaMapa(grupo));
    }
  }

  _crearSpanResumen(texto) {
    const span = document.createElement('span');
    const partes = texto.split(' ');
    const fuerte = document.createElement('strong');
    fuerte.textContent = partes[0];
    span.appendChild(fuerte);
    span.append(' ' + partes.slice(1).join(' '));
    return span;
  }

  _crearTarjetaMapa(grupo) {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta-mapa';

    const titulo = document.createElement('h3');
    titulo.className = 'tarjeta-mapa__nombre';
    titulo.textContent = grupo.mapa;
    tarjeta.appendChild(titulo);

    const lista = document.createElement('ul');
    lista.className = 'lista-hideouts';

    for (const hideout of grupo.hideouts) {
      lista.appendChild(this._crearItemHideout(hideout));
    }

    tarjeta.appendChild(lista);
    return tarjeta;
  }

  _crearItemHideout(hideout) {
    const item = document.createElement('li');
    item.className = 'item-hideout';

    const gremio = document.createElement('span');
    gremio.className = 'item-hideout__gremio';
    gremio.textContent = hideout.gremio;

    const slot = document.createElement('span');
    slot.className = 'item-hideout__slot';
    slot.textContent = `Slot ${hideout.slot}`;

    const etiqueta = document.createElement('span');
    etiqueta.className = `etiqueta-tipo etiqueta-tipo--${hideout.tipo.toLowerCase()}`;
    etiqueta.textContent = hideout.tipo === 'ESTANDAR' ? 'HO' : hideout.tipo;

    item.append(gremio, slot, etiqueta);
    return item;
  }
}

document.addEventListener('DOMContentLoaded', () => new BuscadorUI());
