/**
 * Zero tracking (Fase 8 do PLANEJAMENTO-PROCESSAMENTO.MD): compensa a deriva
 * lenta do zero (temperatura, fluência da célula) quando o sistema está
 * comprovadamente sem carga. É o terceiro "zero" do sistema, depois da tara
 * da ESP e do deslocamentoTara — só mexe no sinal final, e o offset fica
 * visível no painel.
 *
 * Regra: a saída é F − offset. Se |F − offset| < limiar por mais de
 * tempoEstavel ms, e sem variação rápida entre amostras, o offset caminha
 * devagar: offset += α·(F − offset). Proteções obrigatórias — nunca atualiza
 * quando `bloqueado` (evento em curso, gravação em andamento), quando a força
 * está fora da zona de repouso ou quando varia rápido (a estabilidade
 * recomeça a contar).
 */
export interface ConfigZeroTracking {
  limiarN:        number;   // zona de repouso (N), padrão 0.05
  tempoEstavelMs: number;   // tempo em repouso antes de corrigir, padrão 3000
  alpha:          number;   // passo da correção por amostra, padrão 0.01
  /** Variação máxima entre amostras consecutivas para contar como repouso; padrão limiar/2. */
  variacaoMaxN?:  number;
}

export class ZeroTracking {
  private offset = 0;
  private estavelDesdeMs: number | null = null;
  private ultimoCorrigido: number | null = null;
  readonly config: Required<ConfigZeroTracking>;

  constructor(config: ConfigZeroTracking) {
    this.config = {
      limiarN:        Math.max(0, config.limiarN),
      tempoEstavelMs: Math.max(0, config.tempoEstavelMs),
      alpha:          Math.min(1, Math.max(0, config.alpha)),
      variacaoMaxN:   config.variacaoMaxN ?? config.limiarN / 2,
    };
  }

  /** Devolve a força corrigida; atualiza o offset só nas condições de repouso e sem bloqueio. */
  aplicar(forca: number, marcaTemporal: number, bloqueado = false): number {
    const corrigida = forca - this.offset;
    const variacao = this.ultimoCorrigido === null ? 0 : Math.abs(corrigida - this.ultimoCorrigido);
    this.ultimoCorrigido = corrigida;

    const emRepouso = !bloqueado && Math.abs(corrigida) < this.config.limiarN && variacao <= this.config.variacaoMaxN;
    if (!emRepouso) {
      this.estavelDesdeMs = null;
      return corrigida;
    }
    if (this.estavelDesdeMs === null) this.estavelDesdeMs = marcaTemporal;
    if (marcaTemporal - this.estavelDesdeMs >= this.config.tempoEstavelMs) {
      this.offset += this.config.alpha * corrigida;
    }
    return corrigida;
  }

  obterOffset(): number { return this.offset; }

  reiniciar(): void {
    this.offset = 0;
    this.estavelDesdeMs = null;
    this.ultimoCorrigido = null;
  }
}
