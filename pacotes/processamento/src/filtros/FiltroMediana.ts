export class FiltroMediana {
  private buffer: number[] = [];

  constructor(private janela: number) {}

  aplicar(valor: number): number {
    this.buffer.push(valor);
    if (this.buffer.length > this.janela) {
      this.buffer.shift();
    }
    const ordenado = [...this.buffer].sort((a, b) => a - b);
    const meio = Math.floor(ordenado.length / 2);
    return ordenado.length % 2 === 1
      ? ordenado[meio]!
      : (ordenado[meio - 1]! + ordenado[meio]!) / 2;
  }

  reiniciar(): void {
    this.buffer = [];
  }
}
