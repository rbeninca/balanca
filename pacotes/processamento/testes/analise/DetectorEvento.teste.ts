import { describe, it, expect } from 'vitest';
import { DetectorEvento } from '../../src/analise/DetectorEvento.js';
import { DetectorQueima } from '../../src/analise/DetectorQueima.js';

describe('DetectorEvento (Fase 7)', () => {
  it('com saída = entrada e tempo de entrada 0 reproduz o DetectorQueima', () => {
    const antigo = new DetectorQueima(1.0, 100);
    const novo = new DetectorEvento({ limiarEntradaN: 1.0, limiarSaidaN: 1.0, tempoEntradaMs: 0, tempoSaidaMs: 100 });
    const sinal = [0, 5, 5, 0, 0, 0, 5, 0, 0.5, 1.0, 1.01, 0, 0, 0, 0];
    sinal.forEach((f, i) => expect(novo.atualizar(f, i * 30)).toBe(antigo.atualizar(f, i * 30)));
  });

  it('início exige força acima do limiar de entrada pelo tempo de entrada', () => {
    const d = new DetectorEvento({ limiarEntradaN: 0.2, limiarSaidaN: 0.1, tempoEntradaMs: 30, tempoSaidaMs: 100 });
    expect(d.atualizar(0.5, 0)).toBe(false);     // 1ª acima: começa a contar
    expect(d.atualizar(0.5, 20)).toBe(false);    // 20 ms
    expect(d.atualizar(0.5, 30)).toBe(true);     // 30 ms → evento
  });

  it('um spike de uma amostra não inicia o evento (tempo de entrada)', () => {
    const d = new DetectorEvento({ limiarEntradaN: 0.2, limiarSaidaN: 0.1, tempoEntradaMs: 30, tempoSaidaMs: 100 });
    expect(d.atualizar(50, 0)).toBe(false);
    expect(d.atualizar(0, 12)).toBe(false);      // caiu antes de confirmar: zera a contagem
    expect(d.atualizar(50, 24)).toBe(false);
    expect(d.atualizar(50, 36)).toBe(false);     // 12 ms desde a nova subida
  });

  it('fim: força entre saída e entrada mantém o evento (histerese), abaixo da saída por tempo de saída encerra', () => {
    const d = new DetectorEvento({ limiarEntradaN: 0.2, limiarSaidaN: 0.1, tempoEntradaMs: 0, tempoSaidaMs: 100 });
    expect(d.atualizar(1, 0)).toBe(true);
    expect(d.atualizar(0.15, 50)).toBe(true);    // entre 0,1 e 0,2: continua
    expect(d.atualizar(0.05, 100)).toBe(true);   // abaixo: começa a contar
    expect(d.atualizar(0.05, 150)).toBe(true);   // 50 ms
    expect(d.atualizar(0.15, 160)).toBe(true);   // voltou acima da saída: zera
    expect(d.atualizar(0.05, 200)).toBe(true);
    expect(d.atualizar(0.05, 300)).toBe(false);  // 100 ms abaixo → fim
  });

  it('saída maior que entrada é presa à entrada; tempos negativos viram 0', () => {
    const d = new DetectorEvento({ limiarEntradaN: 0.2, limiarSaidaN: 0.5, tempoEntradaMs: -5, tempoSaidaMs: -1 });
    expect(d.config).toEqual({ limiarEntradaN: 0.2, limiarSaidaN: 0.2, tempoEntradaMs: 0, tempoSaidaMs: 0 });
  });

  it('reiniciar volta ao repouso', () => {
    const d = new DetectorEvento({ limiarEntradaN: 0.2, limiarSaidaN: 0.1, tempoEntradaMs: 0, tempoSaidaMs: 100 });
    d.atualizar(1, 0);
    d.reiniciar();
    expect(d.atualizar(0, 10)).toBe(false);
  });
});
