import { FiltroPassaAlta } from './FiltroPassaAlta.js';
import { FiltroPassaBaixa } from './FiltroPassaBaixa.js';

export class FiltroBandaPassante {
  private readonly passaAlta: FiltroPassaAlta;
  private readonly passaBaixa: FiltroPassaBaixa;

  constructor(taxaHz: number, fcAltaHz: number, fcBaixaHz: number) {
    this.passaAlta  = new FiltroPassaAlta(taxaHz, fcAltaHz);
    this.passaBaixa = new FiltroPassaBaixa(taxaHz, fcBaixaHz);
  }

  aplicar(valor: number): number {
    return this.passaBaixa.aplicar(this.passaAlta.aplicar(valor));
  }

  reiniciar(): void {
    this.passaAlta.reiniciar();
    this.passaBaixa.reiniciar();
  }
}
