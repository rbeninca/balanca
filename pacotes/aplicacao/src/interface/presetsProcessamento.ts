import type { PipelinePatch, EstadoPipeline } from '@balancagfig/processamento';

/**
 * Perfis de processamento (Fase 12 do PLANEJAMENTO-PROCESSAMENTO.MD): valores
 * iniciais para situações típicas. O usuário pode mudar qualquer coisa
 * depois — aí o perfil mostrado volta a "Personalizado". Só Hampel na limpeza
 * (Hampel + Mediana é redundante); o detector mantém os limiares já ajustados.
 */
export type PerfilProcessamento = 'personalizado' | 'pesagem' | 'motor' | 'impacto' | 'bruto';

export interface Perfil {
  nome: string;
  descricao: string;
  /** Tudo que o perfil define — as chaves ausentes ficam como estão. */
  patch: PipelinePatch;
}

export const PERFIS: Record<Exclude<PerfilProcessamento, 'personalizado'>, Perfil> = {
  pesagem: {
    nome: 'Pesagem',
    descricao: 'Leitura estável de uma massa parada: Hampel, EMA suave, zero tracking e zona morta; sem detector.',
    patch: {
      ativoHampel: true, janelaHampel: 7, limiarHampelSigma: 3,
      ativoMediana: false, ativoNotch: false,
      filtroPrincipal: 'ema', alphaEMA: 0.10,
      ativoZeroTracking: true, zeroTrackingLimiarN: 0.05, zeroTrackingTempoMs: 3000, zeroTrackingAlpha: 0.01,
      ativoZonaMorta: true,
      ativoDetectorQueima: false,
      fonteCalculoImpulso: 'final',
    },
  },
  motor: {
    nome: 'Teste de motor',
    descricao: 'Curva de empuxo: Hampel, Savitzky-Golay 5 (preserva picos), zona morta e detector de evento; sem zero tracking.',
    patch: {
      ativoHampel: true, janelaHampel: 7, limiarHampelSigma: 3,
      ativoMediana: false, ativoNotch: false,
      filtroPrincipal: 'savitzkyGolay', janelaSG: 5,
      ativoZeroTracking: false,
      ativoZonaMorta: true,
      ativoDetectorQueima: true,
      fonteCalculoImpulso: 'final',
    },
  },
  impacto: {
    nome: 'Impacto',
    descricao: 'Eventos rápidos: Hampel e Butterworth com corte alto (25 Hz); sem zona morta nem zero tracking; detector imediato.',
    patch: {
      ativoHampel: true, janelaHampel: 5, limiarHampelSigma: 3.5,
      ativoMediana: false, ativoNotch: false,
      filtroPrincipal: 'butterworth', frequenciaCorteHz: 25,
      ativoZeroTracking: false,
      ativoZonaMorta: false,
      ativoDetectorQueima: true, tempoEntradaMs: 0,
      fonteCalculoImpulso: 'filtrado',
    },
  },
  bruto: {
    nome: 'Dados brutos',
    descricao: 'Nenhum filtro, nenhum tratamento: o sinal como veio da ESP.',
    patch: {
      ativoHampel: false, ativoMediana: false, ativoNotch: false,
      filtroPrincipal: 'nenhum',
      ativoZeroTracking: false, ativoZonaMorta: false, ativoDetectorQueima: false,
      fonteCalculoImpulso: 'final',
    },
  },
};

export const ORDEM_PERFIS: readonly PerfilProcessamento[] = ['personalizado', 'pesagem', 'motor', 'impacto', 'bruto'];

/** Chaves comparadas para reconhecer um perfil; o resto do estado é livre. */
function coincide(cfg: Partial<EstadoPipeline>, patch: PipelinePatch): boolean {
  for (const [k, v] of Object.entries(patch)) {
    const atual = (cfg as Record<string, unknown>)[k];
    if (typeof v === 'number') {
      if (typeof atual !== 'number' || Math.abs(atual - v) > 1e-9) return false;
    } else if (atual !== v) {
      return false;
    }
  }
  return true;
}

/** Perfil que corresponde exatamente ao estado atual, ou 'personalizado'. */
export function detectarPerfil(cfg: Partial<EstadoPipeline>): PerfilProcessamento {
  for (const chave of ['pesagem', 'motor', 'impacto', 'bruto'] as const) {
    if (coincide(cfg, PERFIS[chave].patch)) return chave;
  }
  return 'personalizado';
}

export function htmlSeletorPerfil(): string {
  const opcoes = ORDEM_PERFIS.map(p =>
    p === 'personalizado'
      ? '<option value="personalizado">Personalizado</option>'
      : `<option value="${p}" title="${PERFIS[p].descricao}">${PERFIS[p].nome}</option>`).join('');
  return `
            <div class="filtros-perfil">
              <label for="sel-perfil"><b>Perfil</b></label>
              <select id="sel-perfil" class="filtro-sel" title="Valores iniciais para situações típicas; qualquer ajuste vira Personalizado">${opcoes}</select>
              <span id="perfil-descricao" class="filtro-fs"></span>
            </div>`;
}
