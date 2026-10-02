'use strict';

import { regional } from './i18n.js';

/**
 * portada.js
 * ----------------------------------------------------------------------
 * Comportamiento de la página de inicio y de los enlaces entre apartados:
 *
 *  - Enlaces con data-ir="inicio|hideouts|caminos" (marca, botones de la
 *    portada, tarjetas y pie): cambian de apartado sin recargar. Con
 *    data-enfocar ponen el foco en un campo (el buscador de gremios) y con
 *    data-abrir-registro abren el panel de registro desde capturas.
 *  - Enlaces a secciones del inicio (#apoyar) con desplazamiento suave: si
 *    se está en otro apartado, primero se vuelve al inicio.
 *  - Cifras con cuenta ascendente cuando llegan los datos.
 *  - Botón para copiar la llave Bre-B.
 *  - Aparición suave de las secciones al desplazarse.
 *
 * Todo respeta prefers-reduced-motion.
 * ----------------------------------------------------------------------
 */

const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Portada {
  /**
   * @param {object} opciones
   *   - irA(vista, { destino, alTerminar }): cambia de apartado
   *     ('inicio' | 'hideouts' | 'caminos') con fundido
   *   - abrirRegistro(): abre el panel de registro desde capturas
   */
  constructor({ irA, abrirRegistro }) {
    this.irA = irA;
    this.abrirRegistro = abrirRegistro;
    document.documentElement.classList.add('js');

    this._enlazarApartados();
    this._enlazarDesplazamientos();
    this._enlazarCopiar();
    this._revelarAlDesplazar();
  }

  _desplazarA(elemento) {
    elemento.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'start' });
  }

  _enlazarApartados() {
    for (const enlace of document.querySelectorAll('a[data-ir]')) {
      enlace.addEventListener('click', (evento) => {
        // Ctrl/Cmd + clic o clic central: que el navegador abra otra pestaña.
        if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.button !== 0) return;
        evento.preventDefault();
        const registro = enlace.hasAttribute('data-abrir-registro') && document.querySelector('.registro');
        const enfocar = enlace.dataset.enfocar && document.getElementById(enlace.dataset.enfocar);
        this.irA(enlace.dataset.ir, {
          destino: registro || null,
          alTerminar: () => {
            if (registro) this.abrirRegistro();
            if (enfocar) enfocar.focus({ preventScroll: true });
          },
        });
      });
    }
  }

  _enlazarDesplazamientos() {
    for (const enlace of document.querySelectorAll('a[data-desplazar]')) {
      enlace.addEventListener('click', (evento) => {
        // El pie es común a todas las páginas: sus enlaces llevan la ruta
        // (/#apoyar). En esta misma página, desplazamiento suave; en otra, el
        // navegador la abre.
        const url = new URL(enlace.href, location.href);
        if (url.pathname !== location.pathname || !url.hash) return;
        const destino = document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (!destino) return;
        evento.preventDefault();
        const panel = destino.closest('[data-panel]');
        // En otro apartado: fundido hasta la sección; en el mismo, desplazamiento suave.
        if (panel && panel.hidden) this.irA(panel.dataset.panel, { destino });
        else this._desplazarA(destino);
      });
    }
  }

  _enlazarCopiar() {
    for (const boton of document.querySelectorAll('[data-copiar]')) {
      const original = boton.textContent;
      boton.addEventListener('click', async () => {
        const origen = document.getElementById(boton.dataset.copiar);
        if (!origen) return;
        try {
          await navigator.clipboard.writeText(origen.textContent.trim());
          boton.textContent = boton.dataset.copiado || original;
        } catch (error) {
          // Sin permiso de portapapeles: se selecciona el texto para copiarlo a mano.
          const rango = document.createRange();
          rango.selectNodeContents(origen);
          const seleccion = window.getSelection();
          seleccion.removeAllRanges();
          seleccion.addRange(rango);
        }
        setTimeout(() => { boton.textContent = original; }, 2000);
      });
    }
  }

  _revelarAlDesplazar() {
    const elementos = document.querySelectorAll('[data-revelar]');
    if (typeof IntersectionObserver !== 'function' || sinMovimiento()) {
      elementos.forEach((el) => el.classList.add('revelado'));
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          entrada.target.classList.add('revelado');
          observador.unobserve(entrada.target);
        }
      },
      { threshold: 0.12 }
    );
    elementos.forEach((el) => observador.observe(el));
  }

  /** Rellena la franja de cifras: { hideouts, mapas, temporada }. */
  mostrarCifras(valores) {
    for (const el of document.querySelectorAll('[data-cifra]')) {
      const clave = el.dataset.cifra;
      if (clave === 'temporada') {
        if (valores.temporada) el.textContent = valores.temporada;
        continue;
      }
      const objetivo = Number(valores[clave] ?? el.dataset.valor);
      if (Number.isFinite(objetivo)) this._contar(el, objetivo);
    }
  }

  _contar(el, objetivo) {
    const formato = (n) => n.toLocaleString(regional);
    if (sinMovimiento()) {
      el.textContent = formato(objetivo);
      return;
    }
    const duracion = 1200;
    const inicio = performance.now();
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const suavizado = 1 - (1 - t) ** 3;
      el.textContent = formato(Math.round(objetivo * suavizado));
      if (t < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
}

export default Portada;
