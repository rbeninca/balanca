export interface ResultadoCalibracao {
  calibrado:    boolean;
  pesoRef:      number;   // N — média da força em repouso
  massaEst:     number;   // kg — pesoRef / 9.81
  progresso:    number;   // 0–1 — progresso da janela de estabilidade
  mediaAtualN:  number;   // média corrente da janela (0 se vazia)
}

export interface ConfigCalibradorBarra {
  duracaoEstavelS:    number;  // segundos estável necessários (padrão 3)
  desvioPadraoMaxN:   number;  // std dev máximo para considerar estável (padrão 2)
  forcaMinN:          number;  // força mínima para considerar usuário pendurado (padrão 50)
  forcaMaxN:          number;  // força máxima para filtrar picos absurdos (padrão 2000)
}

const CFG_PADRAO: ConfigCalibradorBarra = {
  duracaoEstavelS:  3,
  desvioPadraoMaxN: 2,
  forcaMinN:        50,
  forcaMaxN:        2000,
};

export class CalibradorBarra {
  private readonly cfg: ConfigCalibradorBarra;
  private readonly capacidade: number;
  private janela: number[] = [];
  private _calibrado  = false;
  private _pesoRef    = 0;
  private _massaEst   = 0;

  constructor(taxaHz: number, cfg?: Partial<ConfigCalibradorBarra>) {
    this.cfg = { ...CFG_PADRAO, ...cfg };
    this.capacidade = Math.round(this.cfg.duracaoEstavelS * taxaHz);
  }

  processar(forcaN: number): ResultadoCalibracao {
    if (this._calibrado) {
      return { calibrado: true, pesoRef: this._pesoRef, massaEst: this._massaEst, progresso: 1, mediaAtualN: this._pesoRef };
    }

    // Aceita amostra apenas se dentro da faixa esperada de "pendurado"
    if (forcaN >= this.cfg.forcaMinN && forcaN <= this.cfg.forcaMaxN) {
      this.janela.push(forcaN);
      if (this.janela.length > this.capacidade) {
        this.janela.shift();
      }
    } else {
      // Força fora da faixa — reseta janela
      this.janela = [];
    }

    const n = this.janela.length;
    const progresso = n / this.capacidade;
    const mediaAtualN = n > 0 ? this.janela.reduce((s, v) => s + v, 0) / n : 0;

    if (n < this.capacidade) {
      return { calibrado: false, pesoRef: 0, massaEst: 0, progresso, mediaAtualN };
    }

    // Janela cheia — verifica estabilidade
    const variancia = this.janela.reduce((s, v) => s + (v - mediaAtualN) ** 2, 0) / n;
    const desvio = Math.sqrt(variancia);

    if (desvio > this.cfg.desvioPadraoMaxN) {
      // Instável — remove amostra mais antiga e continua
      this.janela.shift();
      return { calibrado: false, pesoRef: 0, massaEst: 0, progresso: (n - 1) / this.capacidade, mediaAtualN };
    }

    this._pesoRef  = mediaAtualN;
    this._massaEst = mediaAtualN / 9.81;
    this._calibrado = true;
    return { calibrado: true, pesoRef: this._pesoRef, massaEst: this._massaEst, progresso: 1, mediaAtualN: this._pesoRef };
  }

  reiniciar(): void {
    this.janela     = [];
    this._calibrado = false;
    this._pesoRef   = 0;
    this._massaEst  = 0;
  }

  get calibrado(): boolean { return this._calibrado; }
  get pesoRef(): number    { return this._pesoRef; }
  get massaEst(): number   { return this._massaEst; }
}
