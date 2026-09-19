/**
 * Lógica (sem DOM) da tela de atualização do app do TVBox — interpreta o
 * estado de GET /atualizacao (ServidorApi.kt / atualizacao/Atualizador.kt).
 */
export type FaseAtualizacao = 'ociosa' | 'verificando' | 'baixando' | 'conferindo' | 'instalando' | 'concluida' | 'erro';

export interface ReleaseApp {
  versao: string;
  tag: string;
  notas: string;
}

export interface EstadoAtualizacaoApp {
  instalada: string;
  fase: FaseAtualizacao;
  disponiveis: ReleaseApp[];
  plano: ReleaseApp[];
  indice: number;
  progresso: number;
  erro: string | null;
  verificado_em: number | null;
  versao_inicial: string | null;
}

export interface ResumoAtualizacao {
  instalada: string;
  alvo: string | null;
  /** Versões pelas quais o box vai passar, em ordem. */
  passos: ReleaseApp[];
  haAtualizacao: boolean;
  podeIniciar: boolean;
  podeCancelar: boolean;
  emAndamento: boolean;
  terminou: boolean;
  /** Linha de status para o usuário. */
  texto: string;
  /** 0–100 do processo inteiro (todas as versões), ou null quando parado. */
  progressoTotal: number | null;
}

export function resumir(e: EstadoAtualizacaoApp): ResumoAtualizacao {
  const passos = e.plano;
  const alvo = passos.length > 0 ? passos[passos.length - 1]!.versao : null;
  const emAndamento = e.fase === 'baixando' || e.fase === 'conferindo' || e.fase === 'instalando';
  const terminou = e.fase === 'concluida' || e.fase === 'erro';
  const atual = passos[e.indice];
  const posicao = passos.length > 0 ? `${Math.min(e.indice + 1, passos.length)}/${passos.length}` : '';

  let texto: string;
  switch (e.fase) {
    case 'baixando':   texto = `Baixando ${atual?.versao ?? '…'} (${posicao}) — ${e.progresso}%`; break;
    case 'conferindo': texto = `Conferindo ${atual?.versao ?? '…'} (${posicao})…`; break;
    case 'instalando': texto = `Instalando ${atual?.versao ?? '…'} (${posicao})… o app vai reiniciar`; break;
    case 'concluida':  texto = `Atualizado${e.versao_inicial ? ` de ${e.versao_inicial}` : ''} para ${e.instalada}.`; break;
    case 'erro':       texto = `Falhou: ${e.erro ?? 'erro desconhecido'}`; break;
    case 'verificando': texto = 'Consultando o repositório…'; break;
    default:
      texto = e.erro
        ? e.erro
        : passos.length === 0
          ? `Você está na versão mais recente (${e.instalada}).`
          : `Atualização disponível: ${e.instalada} → ${alvo}`;
  }

  let progressoTotal: number | null = null;
  if (emAndamento && passos.length > 0) {
    const porPasso = 100 / passos.length;
    const dentro = e.fase === 'baixando' ? e.progresso * 0.9 : e.fase === 'conferindo' ? 92 : 97;
    progressoTotal = Math.min(100, Math.round(e.indice * porPasso + (dentro / 100) * porPasso));
  } else if (e.fase === 'concluida') {
    progressoTotal = 100;
  }

  return {
    instalada: e.instalada,
    alvo,
    passos,
    haAtualizacao: passos.length > 0 && !terminou,
    podeIniciar: passos.length > 0 && !emAndamento && e.fase !== 'concluida',
    podeCancelar: e.fase === 'baixando' || e.fase === 'conferindo',
    emAndamento,
    terminou,
    texto,
    progressoTotal,
  };
}

/**
 * Durante a instalação a API some (o app é morto e reinstalado). Enquanto o
 * último estado conhecido for "instalando", uma falha de rede é esperada e
 * a tela deve continuar tentando, não mostrar erro.
 */
export function falhaEsperada(ultimo: EstadoAtualizacaoApp | null): boolean {
  return ultimo?.fase === 'instalando';
}

/** Texto do aviso enquanto a API está fora do ar no meio da atualização. */
export const TEXTO_REINSTALANDO = 'Reinstalando o app no box… a conexão volta sozinha em instantes.';

/** Ordena as releases disponíveis da mais nova para a mais antiga (para o histórico). */
export function historico(e: EstadoAtualizacaoApp): ReleaseApp[] {
  return [...e.disponiveis].sort((a, b) => compararVersao(b.versao, a.versao));
}

export function compararVersao(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
