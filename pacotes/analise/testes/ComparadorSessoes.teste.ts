import { describe, it, expect } from 'vitest';
import { normalizar, gerarTabelaComparativa } from '../src/ComparadorSessoes.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { SessaoParaComparar } from '../src/ComparadorSessoes.js';

function makeLeituras(forcas: number[], tInicio: number, emQueima = true): LeituraProcessada[] {
  let impulso = 0;
  return forcas.map((f, i) => {
    if (i > 0) impulso += ((forcas[i - 1]! + f) / 2) * 0.1;
    return {
      marcaTemporal: tInicio + i * 100,
      forcaNewton: f,
      temperatura: 0,
      emQueima,
      impulsoAcumuladoNs: impulso,
    };
  });
}

describe('ComparadorSessoes', () => {
  // UT-3.5.1 — normalizar alinha t=0 no início da queima
  it('normalizar() alinha primeira leitura em queima para t=0', () => {
    const leituras: LeituraProcessada[] = [
      { marcaTemporal: 500, forcaNewton: 0.0, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
      { marcaTemporal: 1000, forcaNewton: 2.0, temperatura: 0, emQueima: true, impulsoAcumuladoNs: 0 },
      { marcaTemporal: 1100, forcaNewton: 2.5, temperatura: 0, emQueima: true, impulsoAcumuladoNs: 0.2 },
    ];
    const norm = normalizar(leituras);
    expect(norm[0]!.marcaTemporal).toBe(0);
    expect(norm[1]!.marcaTemporal).toBe(100);
  });

  // UT-3.5.2 — duas sessões de durações diferentes, pontos independentes
  it('normalizar() gera pontos independentes por sessão', () => {
    const ls1 = makeLeituras([2, 2, 2], 1000);
    const ls2 = makeLeituras([2, 2, 2, 2, 2], 2000);
    const n1 = normalizar(ls1);
    const n2 = normalizar(ls2);
    expect(n1).toHaveLength(3);
    expect(n2).toHaveLength(5);
    expect(n1[0]!.marcaTemporal).toBe(0);
    expect(n2[0]!.marcaTemporal).toBe(0);
  });

  // UT-3.5.3 — tabela comparativa tem N linhas para N sessões
  it('gerarTabelaComparativa() retorna 3 linhas para 3 sessões', () => {
    const sessoes: SessaoParaComparar[] = [
      { id: 's1', nome: 'A', leituras: makeLeituras([2, 2, 2], 0) },
      { id: 's2', nome: 'B', leituras: makeLeituras([3, 3, 3], 0) },
      { id: 's3', nome: 'C', leituras: makeLeituras([1, 1, 1], 0) },
    ];
    const tabela = gerarTabelaComparativa(sessoes);
    expect(tabela).toHaveLength(3);
    expect(tabela.map(l => l.id)).toEqual(['s1', 's2', 's3']);
  });

  // UT-3.5.4 — sessão sem queima é excluída da comparação
  it('sessão sem queima é excluída da tabela comparativa', () => {
    const semQueima: LeituraProcessada[] = [
      { marcaTemporal: 0, forcaNewton: 0, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
    ];
    const sessoes: SessaoParaComparar[] = [
      { id: 's1', nome: 'Com queima', leituras: makeLeituras([2, 2, 2], 0) },
      { id: 's2', nome: 'Sem queima', leituras: semQueima },
    ];
    const tabela = gerarTabelaComparativa(sessoes);
    expect(tabela).toHaveLength(1);
    expect(tabela[0]!.id).toBe('s1');
  });
});
