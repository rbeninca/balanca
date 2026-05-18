export type FaseBarra = 'CALIBRANDO' | 'PARADO' | 'SUBINDO' | 'DESCENDO' | 'FORCANDO';

export interface EstadoMovimento {
  posicaoM:      number;    // metros acima do ponto zero (positivo = acima)
  velocidadeMs:  number;    // m/s — positivo = subindo
  aceleracaoMs2: number;    // m/s² — após filtro passa-alta
  fase:          FaseBarra;
  forcaRelativa: number;    // forcaN / pesoRef (1.0 = repouso)
  forcaN:        number;    // força atual em Newtons
}

export interface ConfigEstimador {
  fcPassaAltaHz:   number;  // cutoff do filtro HP na aceleração (padrão 0.3)
  fatorDamping:    number;  // amortecimento de v por amostra (padrão 0.98)
  aMinMs2:         number;  // limiar mínimo de aceleração — ruído ignorado (padrão 0.05)
  vResetMs:        number;  // v máxima para considerar em repouso (padrão 0.05)
  aResetMs2:       number;  // a máxima para considerar em repouso (padrão 0.3)
  vMinimoSubidaMs: number;  // v mínima para confirmar subida (padrão 0.05)
  tempoForcandoS:  number;  // s com força alta sem v crescer → FORCANDO (padrão 1.5)
  margemForcaN:    number;  // margem acima de pesoRef para iniciar subida (padrão 5)
}

const CFG_PADRAO: ConfigEstimador = {
  fcPassaAltaHz:   0.3,
  fatorDamping:    0.98,
  aMinMs2:         0.05,
  vResetMs:        0.05,
  aResetMs2:       0.3,
  vMinimoSubidaMs: 0.05,
  tempoForcandoS:  1.5,
  margemForcaN:    5,
};

export class EstimadorMovimentoBarra {
  private cfg: ConfigEstimador;
  private readonly taxaHz: number;

  // Estado do integrador
  private v   = 0;
  private x   = 0;
  private aHp = 0;      // aceleração após filtro HP
  private aRawAnterior = 0;

  // Estado da máquina de estados
  private fase: FaseBarra = 'CALIBRANDO';
  private tsAnteriorMs: number | null = null;

  // Controle FORCANDO
  private tsForcaAltaMs: number | null = null;

  constructor(taxaHz: number, cfg?: Partial<ConfigEstimador>) {
    this.taxaHz = taxaHz;
    this.cfg    = { ...CFG_PADRAO, ...cfg };
  }

  processar(forcaN: number, marcaTemporal: number, pesoRef: number, massaEst: number): EstadoMovimento {
    if (this.fase === 'CALIBRANDO') {
      return {
        posicaoM: 0, velocidadeMs: 0, aceleracaoMs2: 0,
        fase: 'CALIBRANDO', forcaRelativa: pesoRef > 0 ? forcaN / pesoRef : 0, forcaN,
      };
    }

    const dt = this.tsAnteriorMs !== null
      ? Math.min((marcaTemporal - this.tsAnteriorMs) / 1000, 0.1)
      : 1 / this.taxaHz;
    this.tsAnteriorMs = marcaTemporal;

    // Aceleração bruta
    const aRaw = massaEst > 0 ? (forcaN - pesoRef) / massaEst : 0;

    // Filtro passa-alta IIR 1ª ordem: remove offset DC (isométrico sem deslocamento)
    const tau   = 1 / (2 * Math.PI * this.cfg.fcPassaAltaHz);
    const alpha = tau / (tau + dt);
    this.aHp    = alpha * (this.aHp + aRaw - this.aRawAnterior);
    this.aRawAnterior = aRaw;

    // Threshold de ruído
    const a = Math.abs(this.aHp) > this.cfg.aMinMs2 ? this.aHp : 0;

    // Integração
    this.v = this.v * this.cfg.fatorDamping + a * dt;
    this.x = this.x + this.v * dt;

    const forcaRelativa = pesoRef > 0 ? forcaN / pesoRef : 1;
    const forcaAlta     = forcaN > pesoRef + this.cfg.margemForcaN;
    const forcaBaixa    = forcaN < pesoRef - this.cfg.margemForcaN;

    // Reset de deriva quando em repouso confirmado
    if (this.fase === 'PARADO' && Math.abs(this.aHp) < this.cfg.aResetMs2 && Math.abs(this.v) < this.cfg.vResetMs) {
      this.v = 0;
      this.x = 0;
    }

    // Máquina de estados
    this.fase = this.atualizarFase(forcaAlta, forcaBaixa, marcaTemporal);

    return { posicaoM: this.x, velocidadeMs: this.v, aceleracaoMs2: this.aHp, fase: this.fase, forcaRelativa, forcaN };
  }

  private atualizarFase(forcaAlta: boolean, forcaBaixa: boolean, tsMs: number): FaseBarra {
    switch (this.fase) {
      case 'PARADO':
        if (forcaAlta) {
          if (this.v > this.cfg.vMinimoSubidaMs) {
            this.tsForcaAltaMs = null;
            return 'SUBINDO';
          }
          if (this.tsForcaAltaMs === null) this.tsForcaAltaMs = tsMs;
          if ((tsMs - this.tsForcaAltaMs) / 1000 > this.cfg.tempoForcandoS) return 'FORCANDO';
        } else {
          this.tsForcaAltaMs = null;
        }
        return 'PARADO';

      case 'SUBINDO':
        if (this.v < -this.cfg.vMinimoSubidaMs) return 'DESCENDO';
        // Só vai para PARADO no pico se força não estiver ativamente abaixo de pesoRef
        if (Math.abs(this.v) < this.cfg.vResetMs && !forcaBaixa) return 'PARADO';
        return 'SUBINDO';

      case 'DESCENDO':
        if (this.x <= 0 && Math.abs(this.v) < this.cfg.vResetMs) return 'PARADO';
        if (this.v > this.cfg.vMinimoSubidaMs) return 'SUBINDO';
        return 'DESCENDO';

      case 'FORCANDO':
        if (this.v > this.cfg.vMinimoSubidaMs) { this.tsForcaAltaMs = null; return 'SUBINDO'; }
        if (!forcaAlta) { this.tsForcaAltaMs = null; return 'PARADO'; }
        return 'FORCANDO';

      default:
        return this.fase;
    }
  }

  ativar(): void {
    this.fase = 'PARADO';
    this.reiniciarIntegrador();
  }

  reiniciar(): void {
    this.fase = 'CALIBRANDO';
    this.reiniciarIntegrador();
    this.tsForcaAltaMs = null;
  }

  private reiniciarIntegrador(): void {
    this.v = 0;
    this.x = 0;
    this.aHp = 0;
    this.aRawAnterior = 0;
    this.tsAnteriorMs = null;
  }

  atualizarConfig(patch: Partial<ConfigEstimador>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  get faseAtual(): FaseBarra { return this.fase; }
}
