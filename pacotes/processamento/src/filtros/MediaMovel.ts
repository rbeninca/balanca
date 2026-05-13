export class MediaMovel {
  private janela: number[] = [];

  constructor(private tamanho: number) {}

  aplicar(valor: number): number {
    this.janela.push(valor);
    if (this.janela.length > this.tamanho) {
      this.janela.shift();
    }
    const soma = this.janela.reduce((a, b) => a + b, 0);
    return soma / this.janela.length;
  }

  reiniciar(): void {
    this.janela = [];
  }
}
