// Coeficientes pré-calculados para grau 2, ponto central, janelas ímpares 5-11.
// Fonte: Savitzky & Golay (1964), Anal. Chem. 36(8).
const COEFS: Record<number, { c: number[]; norm: number }> = {
   5: { c: [-3, 12, 17, 12, -3],                           norm: 35  },
   7: { c: [-2,  3,  6,  7,  6,  3, -2],                  norm: 21  },
   9: { c: [-21, 14, 39, 54, 59, 54, 39, 14, -21],        norm: 231 },
  11: { c: [-36,  9, 44, 69, 84, 89, 84, 69, 44,  9, -36], norm: 429 },
};

export class SavitzkyGolay {
  private buffer: number[] = [];
  private coefs:  number[];
  private norm:   number;

  constructor(janela: number) {
    // Seleciona a janela suportada mais próxima (5, 7, 9 ou 11)
    const tamanhos = Object.keys(COEFS).map(Number);
    const suportado = tamanhos.reduce((prev, cur) =>
      Math.abs(cur - janela) < Math.abs(prev - janela) ? cur : prev
    );
    const entry = COEFS[suportado]!;
    this.coefs  = entry.c;
    this.norm   = entry.norm;
  }

  private get janela(): number { return this.coefs.length; }

  aplicar(valor: number): number {
    this.buffer.push(valor);
    if (this.buffer.length > this.janela) {
      this.buffer.shift();
    }

    // Aquecimento: média simples até ter amostras suficientes
    if (this.buffer.length < this.janela) {
      const soma = this.buffer.reduce((a, b) => a + b, 0);
      return soma / this.buffer.length;
    }

    let soma = 0;
    for (let i = 0; i < this.janela; i++) {
      soma += this.coefs[i]! * this.buffer[i]!;
    }
    return soma / this.norm;
  }

  reiniciar(): void {
    this.buffer = [];
  }
}
