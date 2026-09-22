'use strict';

/**
 * Hideout
 * ----------------------------------------------------------------------
 * Entidad de dominio (POO): representa un hideout ocupado por un gremio
 * en un slot específico de un mapa. No conoce SQL ni la base de datos;
 * solo modela el concepto del negocio (encapsulamiento).
 *
 * `posX`/`posY` son la ubicación dentro del mapa marcada manualmente por
 * un administrador. Son nulas mientras nadie la haya marcado: el juego no
 * publica esa coordenada, así que no se inventa.
 * ----------------------------------------------------------------------
 */
class Hideout {
  constructor({ id, mapa, slot, gremio, tipo, posX, posY, nota, gremioId, mapaId, tieneLogo }) {
    this.id = id ?? null;
    this.mapa = mapa;
    this.slot = slot;
    this.gremio = gremio;
    this.tipo = tipo || 'ESTANDAR';
    this.posX = posX ?? null;
    this.posY = posY ?? null;
    this.nota = nota ?? null;
    this.gremioId = gremioId ?? null;
    this.mapaId = mapaId ?? null;
    this.tieneLogo = Boolean(tieneLogo);
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

  /** true si un administrador ya marcó dónde está dentro del mapa. */
  get ubicado() {
    return this.posX !== null && this.posY !== null;
  }

  toJSON() {
    return {
      id: this.id,
      mapa: this.mapa,
      slot: this.slot,
      gremio: this.gremio,
      gremioId: this.gremioId,
      tipo: this.tipo,
      etiquetaTipo: this.etiquetaTipo,
      pos: this.ubicado ? [this.posX, this.posY] : null,
      ubicado: this.ubicado,
      nota: this.nota,
      tieneLogo: this.tieneLogo,
    };
  }
}

module.exports = Hideout;
