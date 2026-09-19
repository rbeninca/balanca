import type { TipoFiltroPrincipal } from './pipeline/filtroPrincipal.js';

/**
 * Qual sinal alimenta a integral do impulso (Fase 6): 'final' (após a zona
 * morta — padrão, evita que o ruído de repouso acumule ao vivo), 'filtrado'
 * (após o suavizador, antes dos tratamentos), 'limpo' (após a limpeza) ou
 * 'bruto' (como veio da ESP).
 */
export type FonteImpulso = 'bruto' | 'limpo' | 'filtrado' | 'final';
export const FONTES_IMPULSO: readonly FonteImpulso[] = ['bruto', 'limpo', 'filtrado', 'final'];

export interface ConfiguracaoPipeline {
  limiarZonaMortaN:  number;  // força abaixo disso → zero
  janelaMediaMovel:  number;  // amostras para suavização
  fatorCalibracao:   number;  // multiplicador: forcaBruta → Newtons
  deslocamentoTara:  number;  // offset de tara (raw ADC)
  tempoMinFimMs:     number;  // histerese de fim de queima (ms) — padrão 100

  // Filtros adicionais — opcionais, desativados por padrão
  janelaMediana?:    number;   // amostras (padrão 5)
  alphaEMA?:         number;   // fator exponencial 0–1 (padrão 0.2)
  freqNotchHz?:      number;   // frequência a rejeitar em Hz (padrão 60)
  qNotch?:           number;   // fator de qualidade do notch (padrão 30)
  taxaAmostragemHz?: number;   // necessário para Notch (padrão 100)
  janelaSG?:         number;   // janela Savitzky-Golay (padrão 7)
  kalmanQ?:          number;   // ruído de processo Kalman (padrão 0.01)
  kalmanR?:          number;   // ruído de medição Kalman (padrão 1.0)

  /** Etapa 2: um só suavizador (padrão 'nenhum'). Substitui as flags ativoMediaMovel/EMA/SG/Kalman. */
  filtroPrincipal?:  TipoFiltroPrincipal;

  // Detector de evento (Fase 7). Padrões mantêm o comportamento antigo:
  // entrada = saída = limiarZonaMortaN, tempoEntrada = 0, tempoSaida = tempoMinFimMs.
  limiarEntradaN?:   number;   // N — força acima disso inicia (exige > limiarSaidaN)
  limiarSaidaN?:     number;   // N — força abaixo disso encerra
  tempoEntradaMs?:   number;   // ms acima da entrada para confirmar o início (0 = imediato)
  tempoSaidaMs?:     number;   // ms abaixo da saída para confirmar o fim

  /** Etapa 3 → análise: sinal que alimenta o impulso acumulado (padrão 'final'). */
  fonteCalculoImpulso?: FonteImpulso;

  // Etapa 2 — Butterworth passa-baixa (filtroPrincipal = 'butterworth')
  frequenciaCorteHz?:  number;   // Hz, exige 0 < fc < Fs/2 (padrão 10)

  // Etapa 1 — Hampel (remoção de spikes), desativado por padrão
  janelaHampel?:       number;   // amostras, ímpar (padrão 7)
  limiarHampelSigma?:  number;   // K em múltiplos de σ (padrão 3)
}

export interface LeituraProcessada {
  marcaTemporal:       number;    // ms desde boot
  forcaNewton:         number;    // após calibração, zona morta e suavização
  temperatura:         number;    // °C (0 quando firmware não fornece)
  emQueima:            boolean;   // detector de queima
  impulsoAcumuladoNs:  number;    // integral trapezoidal da força (N·s)
  forcaNewtonBruta?:   number;    // valor antes dos filtros opcionais (presente quando ≥1 ativo)
  forcaNewtonCrua?:    number;    // valor antes da zona morta — para BCG e análises de micro-sinal
}
