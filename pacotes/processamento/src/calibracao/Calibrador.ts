export class Calibrador {
  constructor(
    private fator: number,
    private offset: number,
  ) {}

  aplicar(forcaBruta: number): number {
    return (forcaBruta - this.offset) * this.fator;
  }

  atualizar(fator: number, offset: number): void {
    this.fator  = fator;
    this.offset = offset;
  }

  obterFator(): number  { return this.fator; }
  obterOffset(): number { return this.offset; }
}
