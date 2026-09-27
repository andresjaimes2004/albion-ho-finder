'use strict';

import { regional } from './i18n.js';

/**
 * portada.js
 * ----------------------------------------------------------------------
 * Comportamiento de la portada y de las secciones "Todo lo que
 * necesitas" y "Apoyar el proyecto":
 *
 *  - Enlaces internos (#buscador, #apoyar) con desplazamiento suave y sin
 *    tocar el hash: el hash lo usan las pestañas (#caminos) y cambiarlo
 *    cambiaría de sección.
 *  - Accesos a Caminos de Avalon desde las tarjetas (y abrir el panel de
 *    registro desde capturas).
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
   *   - mostrarVista(vista): cambia de pestaña ('hideouts' | 'caminos')
   *   - abrirRegistro(): abre el panel de registro desde capturas
   */
  constructor({ mostrarVista, abrirRegistro }) {
    this.mostrarVista = mostrarVista;
    this.abrirRegistro = abrirRegistro;
    document.documentElement.classList.add('js');

    this._enlazarDesplazamientos();
    this._enlazarCaminos();
    this._enlazarCopiar();
    this._revelarAlDesplazar();
  }

  _desplazarA(elemento) {
    elemento.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'start' });
  }

  _enlazarDesplazamientos() {
    for (const enlace of document.querySelectorAll('a[data-desplazar]')) {
      enlace.addEventListener('click', (evento) => {
        const destino = document.querySelector(enlace.getAttribute('href'));
        if (!destino) return;
        evento.preventDefault();
        // El buscador está en la pestaña de hideouts: si está oculta, se muestra.
        if (destino.closest('[role="tabpanel"][hidden]')) {
          history.replaceState(null, '', location.pathname);
          this.mostrarVista('hideouts');
        }
        this._desplazarA(destino);
        const enfocar = enlace.dataset.enfocar && document.getElementById(enlace.dataset.enfocar);
        if (enfocar) setTimeout(() => enfocar.focus({ preventScroll: true }), sinMovimiento() ? 0 : 450);
      });
    }
  }

  _enlazarCaminos() {
    for (const enlace of document.querySelectorAll('.funcion a[href$="#caminos"]')) {
      enlace.addEventListener('click', (evento) => {
        evento.preventDefault();
        history.replaceState(null, '', '#caminos');
        this.mostrarVista('caminos');
        if (enlace.hasAttribute('data-abrir-registro')) {
          this.abrirRegistro();
          const registro = document.querySelector('.registro');
          if (registro) this._desplazarA(registro);
        } else {
          window.scrollTo({ top: 0, behavior: sinMovimiento() ? 'auto' : 'smooth' });
        }
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
