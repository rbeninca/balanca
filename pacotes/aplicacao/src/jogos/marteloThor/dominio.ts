export interface TentativaMartelo {
  indice: number;
  picoN: number;
  duracaoMs: number;
  amostras: number;
}

export interface PartidaMartelo {
  id: string;
  jogador: string;
  criadoEm: string;
  melhorForcaN: number;
  mediaForcaN: number;
  tentativas: TentativaMartelo[];
}

export const CHAVE_RANKING_MARTELO = 'balancagfig:jogos:martelo-thor:ranking-v2';

export function resumirTentativas(tentativas: TentativaMartelo[]) {
  const melhorForcaN = tentativas.reduce((melhor, tentativa) => Math.max(melhor, tentativa.picoN), 0);
  const mediaForcaN = tentativas.length > 0
    ? tentativas.reduce((soma, tentativa) => soma + tentativa.picoN, 0) / tentativas.length
    : 0;

  return { melhorForcaN, mediaForcaN };
}

export function criarPartidaMartelo(
  jogador: string,
  tentativas: TentativaMartelo[],
  criadoEm = new Date(),
): PartidaMartelo {
  const resumo = resumirTentativas(tentativas);

  return {
    id: typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `martelo-${criadoEm.getTime()}`,
    jogador: jogador.trim(),
    criadoEm: criadoEm.toISOString(),
    melhorForcaN: resumo.melhorForcaN,
    mediaForcaN: resumo.mediaForcaN,
    tentativas,
  };
}

export function atualizarRankingMartelo(
  rankingAtual: PartidaMartelo[],
  partida: PartidaMartelo,
  limite = 10,
): PartidaMartelo[] {
  return [...rankingAtual, partida]
    .sort((a, b) => {
      if (b.melhorForcaN !== a.melhorForcaN) return b.melhorForcaN - a.melhorForcaN;
      return Date.parse(b.criadoEm) - Date.parse(a.criadoEm);
    })
    .slice(0, limite);
}

export function posicaoNoRanking(ranking: PartidaMartelo[], idPartida: string): number | null {
  const indice = ranking.findIndex(partida => partida.id === idPartida);
  return indice >= 0 ? indice + 1 : null;
}

export function mensagemDesempenho(forcaN: number): string {
  if (forcaN < 120) return 'Aquecendo. A próxima tentativa já vem mais forte.';
  if (forcaN < 350) return 'Boa pancada. Já está entrando no jogo.';
  if (forcaN < 700) return 'Força muito boa. O martelo já respeita você.';
  if (forcaN < 1200) return 'Impacto bruto. Isso já parece nível competição.';
  if (forcaN < 1800) return 'Trovão detectado. Resultado de alto nível.';
  return 'Lenda viva. O martelo quase pediu arrego.';
}

export function formatarForcaN(forcaN: number): string {
  return `${forcaN.toFixed(1)} N`;
}

export function formatarForcaKg(forcaN: number): string {
  return `${(forcaN / 9.80665).toFixed(1)} kg`;
}
