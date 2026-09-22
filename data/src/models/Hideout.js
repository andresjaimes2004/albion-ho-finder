'use strict';

/**
 * Hideout
 * ----------------------------------------------------------------------
 * Entidad de dominio (POO): representa un hideout ocupado por un gremio
 * en un slot específico de un mapa. No conoce SQL ni la base de datos;
 * solo modela el concepto del negocio (encapsulamiento).
 * ----------------------------------------------------------------------
 */
class Hideout {
  constructor({ mapa, slot, gremio, tipo }) {
    this.mapa = mapa;
    this.slot = slot;
    this.gremio = gremio;
    this.tipo = tipo || 'ESTANDAR';
  }

  /** Etiqueta legible del tipo de hideout, lista para mostrar en la UI. */
  get etiquetaTipo() {
    switch (this.tipo) {
      case 'HQ':
        return 'Hideout principal (HQ)';
      case 'P':
        return 'Hideout personal (P)';
      default:
        return 'Hideout';
    }
  }

  toJSON() {
    return {
      mapa: this.mapa,
      slot: this.slot,
      gremio: this.gremio,
      tipo: this.tipo,
      etiquetaTipo: this.etiquetaTipo,
    };
  }
}

module.exports = Hideout;
