import { describe, it, expect } from 'vitest';
import {
  atualizarRankingMartelo,
  criarPartidaMartelo,
  mensagemDesempenho,
  posicaoNoRanking,
  resumirTentativas,
  type TentativaMartelo,
} from '../../src/jogos/marteloThor/dominio.js';

describe('dominio Martelo do Thor', () => {
  const tentativas: TentativaMartelo[] = [
    { indice: 1, picoN: 320, duracaoMs: 8000, amostras: 120 },
    { indice: 2, picoN: 410, duracaoMs: 8000, amostras: 118 },
    { indice: 3, picoN: 380, duracaoMs: 8000, amostras: 121 },
  ];

  it('resume melhor e média das tentativas', () => {
    const resumo = resumirTentativas(tentativas);
    expect(resumo.melhorForcaN).toBe(410);
    expect(resumo.mediaForcaN).toBeCloseTo((320 + 410 + 380) / 3);
  });

  it('cria partida com dados agregados', () => {
    const partida = criarPartidaMartelo('Rbeninca', tentativas, new Date('2026-05-14T12:00:00Z'));
    expect(partida.jogador).toBe('Rbeninca');
    expect(partida.melhorForcaN).toBe(410);
    expect(partida.tentativas).toHaveLength(3);
  });

  it('atualiza ranking ordenando por melhor força e limitando tamanho', () => {
    const a = criarPartidaMartelo('A', [{ indice: 1, picoN: 300, duracaoMs: 1, amostras: 1 }], new Date('2026-05-14T10:00:00Z'));
    const b = criarPartidaMartelo('B', [{ indice: 1, picoN: 500, duracaoMs: 1, amostras: 1 }], new Date('2026-05-14T11:00:00Z'));
    const c = criarPartidaMartelo('C', [{ indice: 1, picoN: 450, duracaoMs: 1, amostras: 1 }], new Date('2026-05-14T12:00:00Z'));

    const ranking = atualizarRankingMartelo([a, c], b, 2);

    expect(ranking).toHaveLength(2);
    expect(ranking[0]?.jogador).toBe('B');
    expect(ranking[1]?.jogador).toBe('C');
    expect(posicaoNoRanking(ranking, b.id)).toBe(1);
  });

  it('gera mensagens de desempenho em faixas progressivas', () => {
    expect(mensagemDesempenho(80)).toMatch(/Aquecendo/);
    expect(mensagemDesempenho(1600)).toMatch(/Trovão|Lenda/);
  });
});
