import { FiltroButterworth } from '../filtros/FiltroButterworth.js';

export type QualidadeBCG = 'boa' | 'razoavel' | 'instavel' | 'sem-sinal';

export interface ResultadoBCG {
  /** Sinal sem DC (para o traço "bruto" da tela). */
  sinalBruto: number;
  /** Sinal na banda cardíaca, depois do passa-banda. */
  sinalFiltrado: number;
  /** Envelope retificado e suavizado do filtrado — onde os picos são procurados. */
  envelope: number;
  /** true nesta amostra se um batimento foi aceito. */
  pico: boolean;
  /** Batimentos por minuto, ou null enquanto não houver intervalo suficiente. */
  bpm: number | null;
  /** Último intervalo entre batimentos aceito, em ms. */
  ibiMs: number | null;
  qualidade: QualidadeBCG;
}

export interface ConfigDetectorBCG {
  /** Corte inferior do passa-banda: abaixo disso é respiração (0,15–0,45 Hz). */
  bandaInferiorHz: number;
  /** Corte superior: acima disso é ruído de sensor e de rede. */
  bandaSuperiorHz: number;
  /** Janela do suavizador do envelope. Une a onda H e a J num pico só. */
  envelopeMs: number;
  /** Tempo mínimo entre dois batimentos aceitos (280 ms permite até ~214 bpm). */
  refratarioMs: number;
  /**
   * Janela de consolidação do par H–J. Cada batimento BCG produz dois montes
   * no envelope: a onda H e, ~0,3–0,45 s depois, a onda J (maior). Um monte
   * só é aceito depois de esperar este tempo — se um monte MAIOR chegar, o
   * primeiro era o H e o novo toma o lugar. É o que impede o detector de
   * contar dois batimentos por batimento.
   */
  consolidacaoMs: number;
  /** Duração da fase de aprendizado do limiar. */
  aprendizadoMs: number;
  /**
   * Tempo em que os filtros são ignorados no começo: o passa-alta leva ~2 s
   * para assentar do degrau de DC (a célula de carga está com o peso dela), e
   * esse transiente tem amplitude ~30× a do batimento — se entrasse no
   * aprendizado, o limiar nascia alto demais e nada mais era detectado.
   */
  assentamentoMs: number;
  /** Limiar como fração da mediana dos últimos picos aceitos. */
  fatorLimiar: number;
  /** Piso do limiar, como fração da amplitude aprendida — não deixa colapsar. */
  pisoLimiar: number;
  /** Intervalo entre batimentos aceito (300–2000 ms = 30–200 bpm). */
  ibiMinMs: number;
  ibiMaxMs: number;
  /** Sem pico aceito por este tempo → qualidade cai para sem-sinal. */
  timeoutMs: number;
}

export const CONFIG_BCG_PADRAO: ConfigDetectorBCG = {
  bandaInferiorHz:  1.0,
  bandaSuperiorHz:  10,
  envelopeMs:       450,
  refratarioMs:     300,
  consolidacaoMs:   800,
  aprendizadoMs:    5000,
  assentamentoMs:   2500,
  fatorLimiar:      0.45,
  pisoLimiar:       0.25,
  ibiMinMs:         300,
  ibiMaxMs:         2000,
  timeoutMs:        3000,
};

const CV_BOA      = 0.08;
const CV_RAZOAVEL = 0.20;
const MAX_IBIS    = 10;
const MAX_PICOS   = 6;
const OUTLIER_FATOR = 0.25;

/**
 * Detector de batimento BCG (balistocardiograma) por célula de carga.
 *
 * Desenhado a partir do sinal real capturado do box (célula sobre o peito,
 * ~83 Hz): a respiração domina a banda baixa com ~4× a energia do batimento,
 * e o batimento vive em ~1 Hz com harmônicas até ~10 Hz. O caminho é o
 * clássico do BCG:
 *
 *   x → passa-banda 1–10 Hz (Butterworth 2ª ordem, duas vezes)
 *     → retificação |·| → suavização 120 ms (envelope)
 *     → picos do envelope com limiar adaptativo + refratário
 *     → BPM pela mediana dos IBIs (300–2000 ms), com rejeição de outliers
 *
 * Tudo o que é tempo — refratário, janelas, IBI — usa o `marcaTemporal` das
 * leituras, nunca contagem de amostras. Assim o detector é indiferente à
 * taxa real do box (que varia de 80 a 96 Hz); só os coeficientes do filtro
 * dependem da Fs, e ela é **estimada** das próprias marcas de tempo (mediana
 * dos deltas em janela deslizante).
 *
 * Por que isto e não o que havia antes: o detector anterior media a amplitude
 * da janela inteira (min/max de 3 s) e cruzava um limiar nas bordas — com a
 * respiração 4× mais forte que o batimento, o limiar era ditado pela
 * respiração e o batimento se perdia dentro dela. O Pan-Tompkins, pensado
 * para QRS de ECG, também não trava no BCG. Aqui a respiração é removida
 * ANTES de qualquer limiar, e o limiar adapta à amplitude dos próprios picos.
 */
export class DetectorBCG {
  private cfg: ConfigDetectorBCG;
  private taxaHz: number;
  private taxaConhecida: boolean;

  // Filtro passa-banda: HP por subtração do LP + LP (Butterworth 2ª ordem cada)
  private hp: FiltroButterworth;
  private lp: FiltroButterworth;

  // Envelope: |filtrado| suavizado por média móvel
  private bufEnvelope: number[] = [];
  private somaEnvelope = 0;
  private janelaEnvelope: number;

  // Estimativa de Fs pelas marcas de tempo
  private deltas: number[] = [];
  private ultimoTMs: number | null = null;

  // Detecção de pico sobre o envelope
  private picoEnvelope = -Infinity;
  private picoTMs = 0;
  private candidato: { amplitude: number; tMs: number } | null = null;
  private ultimoPicoMs: number | null = null;
  /**
   * Histerese: depois de finalizar um monte, só volta a rastrear quando o
   * envelope SUBIR. Sem isto, a descida do envelope vira uma escada de montes
   * falsos — cada queda de 18% do máximo corrente finaliza outro "monte" na
   * rampa de descida.
   */
  private esperandoSubida = false;
  private envAnterior = 0;
  /** Fim do transiente de assentamento de um DEGRAU de DC no meio da operação. */
  private fimTransienteMs = 0;
  private forcaAnterior: number | null = null;
  private tInicioMs: number | null = null;
  private maxAprendizado = -Infinity;
  private ultimosPicos: number[] = [];
  private limiar = Infinity;
  private baseAmplitude = 0;

  // IBI e BPM
  private ibis: number[] = [];

  constructor(taxaInicialHz = 85, cfg: Partial<ConfigDetectorBCG> = {}) {
    this.cfg = { ...CONFIG_BCG_PADRAO, ...cfg };
    this.taxaHz = taxaInicialHz;
    this.taxaConhecida = false;
    this.janelaEnvelope = Math.max(3, Math.round(taxaInicialHz * this.cfg.envelopeMs / 1000));
    this.hp = new FiltroButterworth(this.cfg.bandaInferiorHz, taxaInicialHz);
    this.lp = new FiltroButterworth(this.cfg.bandaSuperiorHz, taxaInicialHz);
  }

  processar(forcaN: number, marcaTemporalMs: number): ResultadoBCG {
    this.estimarTaxa(marcaTemporalMs);

    // Degrau de DC no meio da operação — a célula acabou de ser colocada (ou a
    // tara mudou). O passa-alta vai re-anelar por ~2,5 s, com amplitude ~30× a
    // do batimento; sem tratar, esse transiente recalibraria o limiar para o
    // teto e nada mais passaria. Um degrau também invalida o que se aprendeu
    // da posição anterior: recomeça o aprendizado.
    if (this.forcaAnterior !== null && Math.abs(forcaN - this.forcaAnterior) > 0.05) {
      this.fimTransienteMs = marcaTemporalMs + this.cfg.assentamentoMs;
      this.maxAprendizado = -Infinity;
      this.limiar = Infinity;
      this.ultimosPicos = [];
      this.ibis = [];
      this.ultimoPicoMs = null;
      this.candidato = null;
      this.picoEnvelope = -Infinity;
      this.esperandoSubida = false;
    }
    this.forcaAnterior = forcaN;

    // Passa-banda: HP por subtração do passa-baixa (LP de 2ª ordem em cada ponta)
    const resp = this.hp.aplicar(forcaN);
    const hpSaida = forcaN - resp;
    const filtrado = this.lp.aplicar(hpSaida);

    // Envelope: |filtrado| suavizado
    const env = this.envelope(filtrado);

    // Pico do envelope
    const pico = this.detectarPico(env, marcaTemporalMs);

    return {
      sinalBruto:    hpSaida,
      sinalFiltrado: filtrado,
      envelope:      env,
      pico,
      bpm:           this.calcularBpm(),
      ibiMs:         this.ibis[this.ibis.length - 1] ?? null,
      qualidade:     this.calcularQualidade(marcaTemporalMs),
    };
  }

  reiniciar(): void {
    this.hp.reiniciar();
    this.lp.reiniciar();
    this.bufEnvelope = [];
    this.somaEnvelope = 0;
    this.deltas = [];
    this.ultimoTMs = null;
    this.picoEnvelope = -Infinity;
    this.candidato = null;
    this.ultimoPicoMs = null;
    this.esperandoSubida = false;
    this.envAnterior = 0;
    this.fimTransienteMs = 0;
    this.forcaAnterior = null;
    this.tInicioMs = null;
    this.maxAprendizado = -Infinity;
    this.ultimosPicos = [];
    this.limiar = Infinity;
    this.baseAmplitude = 0;
    this.ibis = [];
  }

  // ─── Fs estimada ─────────────────────────────────────────────────────────

  private estimarTaxa(tMs: number): void {
    if (this.ultimoTMs === null) {
      this.ultimoTMs = tMs;
      return;
    }
    const delta = tMs - this.ultimoTMs;
    this.ultimoTMs = tMs;
    if (delta <= 0 || delta > 200) return; // salto de tempo = leitura perdida/zerada
    this.deltas.push(delta);
    if (this.deltas.length > 64) this.deltas.shift();
    if (this.deltas.length < 16) return;

    const ordenados = [...this.deltas].sort((a, b) => a - b);
    const mediana = ordenados[Math.floor(ordenados.length / 2)]!;
    const fs = 1000 / mediana;

    // Reconfigura os filtros se a taxa mudou mais de 2% — o estado interno
    // dos biquads é preservado por `configurar`, sem salto na saída.
    if (Math.abs(fs - this.taxaHz) / this.taxaHz > 0.02) {
      this.taxaHz = fs;
      this.janelaEnvelope = Math.max(3, Math.round(fs * this.cfg.envelopeMs / 1000));
      this.hp.configurar(this.cfg.bandaInferiorHz, fs);
      this.lp.configurar(this.cfg.bandaSuperiorHz, fs);
    }
    this.taxaConhecida = true;
  }

  // ─── Envelope ────────────────────────────────────────────────────────────

  private envelope(valor: number): number {
    this.bufEnvelope.push(Math.abs(valor));
    this.somaEnvelope += Math.abs(valor);
    if (this.bufEnvelope.length > this.janelaEnvelope) {
      this.somaEnvelope -= this.bufEnvelope.shift()!;
    }
    return this.somaEnvelope / this.bufEnvelope.length;
  }

  // ─── Detecção de pico ────────────────────────────────────────────────────

  /**
   * Um batimento é um "monte" do envelope. Enquanto o envelope sobe, o
   * máximo é rastreado; quando cai para 65% do máximo, o monte é finalizado e
   * julgado. Comparar contra o PRÓPRIO pico — e não contra um limiar fixo da
   * janela — é o que mantém a detecção viva mesmo com a respiração (já
   * filtrada) variando a linha de base.
   */
  private detectarPico(env: number, tMs: number): boolean {
    if (this.tInicioMs === null) this.tInicioMs = tMs;
    const decorrido = tMs - this.tInicioMs;

    // Transiente de assentamento dos filtros (início ou degrau recente):
    // não rastreia monte nenhum.
    if (decorrido < this.cfg.assentamentoMs || tMs < this.fimTransienteMs) return false;

    // Histerese de subida: enquanto o envelope cai, não há monte novo.
    if (this.esperandoSubida) {
      if (env > this.envAnterior) {
        this.esperandoSubida = false;
      } else {
        this.envAnterior = env;
        return false;
      }
    }
    this.envAnterior = env;

    if (env > this.picoEnvelope) {
      this.picoEnvelope = env;
      this.picoTMs = tMs;
    }

    // Monte finalizado de duas formas: o envelope caiu uma fração do máximo,
    // OU passou tempo demais sem cair (platô). No BCG real o envelope NÃO
    // volta a zero entre batimentos — fica numa linha de base alta por causa
    // das harmônicas —, então exigir queda profunda era justamente o que
    // impedia a detecção: o monte nunca "caía" o bastante.
    const caiu = this.picoEnvelope > 0 && env < 0.82 * this.picoEnvelope;
    const platou = (tMs - this.picoTMs) >= 500;
    if (caiu || platou) {
      const monte = { amplitude: this.picoEnvelope, tMs: this.picoTMs };
      this.picoEnvelope = -Infinity;
      this.esperandoSubida = true;

      // Consolidação do par H–J: se o monte novo for MAIOR que o candidato
      // guardado e chegou dentro da janela, o guardado era a onda H — o novo
      // toma o lugar, e o batimento continua por decidir.
      if (
        this.candidato !== null &&
        monte.amplitude > this.candidato.amplitude &&
        (monte.tMs - this.candidato.tMs) <= this.cfg.consolidacaoMs
      ) {
        this.candidato = monte;
        return false;
      }

      // Candidato velho confirmado: chegou um monte menor (ou passou da
      // janela de consolidação). Decide o candidato.
      let picoAceito = false;
      if (this.candidato !== null) {
        picoAceito = this.aceitar(this.candidato);
      }
      this.candidato = monte;
      return picoAceito;
    }

    // Nenhum monte novo finalizou, mas o candidato já esperou a janela inteira:
    // confirma por tempo.
    if (this.candidato !== null && (tMs - this.candidato.tMs) > this.cfg.consolidacaoMs) {
      const c = this.candidato;
      this.candidato = null;
      return this.aceitar(c);
    }

    return false;
  }

  /** Julga um candidato confirmado: refratário, aprendizado, limiar adaptativo. */
  private aceitar(c: { amplitude: number; tMs: number }): boolean {
    // Refratário adaptativo: mínimo fixo no começo; depois de conhecer o
    // período, o mínimo sobe para 65% da mediana dos IBIs. É o "beat-lock":
    // o que sobra de cada batimento (ombros do envelope, onda K) chega a
    // ~0,6 s depois do pico, e sem isto vira batimento duplo.
    let refratario = this.cfg.refratarioMs;
    if (this.ibis.length >= 3) {
      refratario = Math.max(refratario, 0.65 * medianaDe(this.ibis));
    }
    if (this.ultimoPicoMs !== null && (c.tMs - this.ultimoPicoMs) < refratario) {
      return false;
    }

    const decorrido = c.tMs - (this.tInicioMs ?? c.tMs);

    // Fase de aprendizado: aceita montes claros para dar retorno imediato e
    // acumula o máximo para o limiar. Montes de ruído ficam abaixo de 30%.
    // Amplitude zero (ou negativa) nunca é batimento — sem a guarda, um sinal
    // mudo produzia montes de 0 a cada platô e o aprendizado os aceitava
    // (0 < 0.3 × 0 é falso).
    //
    // O aprendizado NÃO termina enquanto nenhuma energia foi vista: um sinal
    // mudo no começo (célula ainda não posicionada) não pode queimar a fase e
    // deixar o limiar infinito para sempre — quando o sinal chega, a fase
    // ainda está aberta e o primeiro monte de verdade a fecha.
    const aprendendo = this.maxAprendizado <= 0 ||
      decorrido < this.cfg.assentamentoMs + this.cfg.aprendizadoMs;

    if (aprendendo) {
      if (c.amplitude <= 0) return false;
      this.maxAprendizado = Math.max(this.maxAprendizado, c.amplitude);
      if (c.amplitude < 0.3 * this.maxAprendizado) return false;
      this.registrarPico(c.amplitude, c.tMs);
      return true;
    }

    // Fim do aprendizado: o limiar nasce da amplitude aprendida. Sem nenhuma
    // energia vista (sinal mudo o tempo todo), o limiar fica infinito — nada
    // passa até aparecer sinal de verdade.
    if (this.limiar === Infinity) {
      this.baseAmplitude = this.maxAprendizado;
      if (this.baseAmplitude > 0) {
        this.limiar = Math.max(this.cfg.fatorLimiar, this.cfg.pisoLimiar) * this.baseAmplitude;
      }
    }

    if (c.amplitude < this.limiar) return false;
    this.registrarPico(c.amplitude, c.tMs);
    return true;
  }

  private registrarPico(amplitude: number, tMs: number): void {
    this.ultimosPicos.push(amplitude);
    if (this.ultimosPicos.length > MAX_PICOS) this.ultimosPicos.shift();

    // Limiar adaptativo: fração da mediana dos últimos picos, com piso ancorado
    // na amplitude aprendida — se o sinal enfraquecer, o limiar não colapsa.
    const mediana = medianaDe(this.ultimosPicos);
    const piso = this.cfg.pisoLimiar * (this.baseAmplitude || mediana);
    this.limiar = Math.max(piso, this.cfg.fatorLimiar * mediana);

    if (this.ultimoPicoMs !== null) {
      const ibi = tMs - this.ultimoPicoMs;
      if (ibi >= this.cfg.ibiMinMs && ibi <= this.cfg.ibiMaxMs) {
        this.ibis.push(ibi);
        if (this.ibis.length > MAX_IBIS) this.ibis.shift();
      }
    }
    this.ultimoPicoMs = tMs;
  }

  // ─── BPM e qualidade ─────────────────────────────────────────────────────

  private calcularBpm(): number | null {
    if (this.ibis.length < 3) return null;
    const mediana = medianaDe(this.ibis);
    const validos = this.ibis.filter(ibi => Math.abs(ibi - mediana) / mediana < OUTLIER_FATOR);
    if (validos.length < 3) return null;
    const media = validos.reduce((a, b) => a + b, 0) / validos.length;
    return Math.round(60000 / media);
  }

  private calcularQualidade(tMs: number): QualidadeBCG {
    if (
      this.ultimoPicoMs === null ||
      (tMs - this.ultimoPicoMs) > this.cfg.timeoutMs ||
      this.ibis.length < 3
    ) return 'sem-sinal';

    // CV sobre os MESMOS intervalos válidos que o BPM usa: duplas de detecção
    // (ombro do envelope aceito como batimento) são rejeitadas pelo filtro de
    // outliers e não podem degradar a qualidade.
    const mediana = medianaDe(this.ibis);
    const validos = this.ibis.filter(ibi => Math.abs(ibi - mediana) / mediana < OUTLIER_FATOR);
    if (validos.length < 3) return 'sem-sinal';

    const media = validos.reduce((a, b) => a + b, 0) / validos.length;
    const variancia = validos.reduce((acc, v) => acc + (v - media) ** 2, 0) / validos.length;
    const cv = Math.sqrt(variancia) / media;

    if (cv < CV_BOA)      return 'boa';
    if (cv < CV_RAZOAVEL) return 'razoavel';
    return 'instavel';
  }
}

function medianaDe(valores: number[]): number {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  return o.length % 2 ? o[meio]! : ((o[meio - 1]! + o[meio]!) / 2);
}
