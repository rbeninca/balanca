import { describe, it, expect } from 'vitest';
import { EstimadorMovimentoBarra } from '../../src/analise/EstimadorMovimentoBarra.js';

const TAX    = 100;   // Hz
const PESO   = 785;   // N (~80 kg)
const MASSA  = PESO / 9.81;
const DT_MS  = 1000 / TAX;

function simular(
  est: EstimadorMovimentoBarra,
  forcaFn: (i: number) => number,
  amostras: number,
) {
  let ultimo: ReturnType<EstimadorMovimentoBarra['processar']> | null = null;
  for (let i = 0; i < amostras; i++) {
    ultimo = est.processar(forcaFn(i), i * DT_MS, PESO, MASSA);
  }
  return ultimo!;
}

describe('EstimadorMovimentoBarra', () => {
  it('UT-2.8.1 — força igual a pesoRef mantém posição em zero', () => {
    const est = new EstimadorMovimentoBarra(TAX);
    est.ativar();
    const res = simular(est, () => PESO, TAX * 5);
    expect(Math.abs(res.posicaoM)).toBeLessThan(0.01);
    expect(Math.abs(res.velocidadeMs)).toBeLessThan(0.01);
  });

  it('UT-2.8.2 — força acima de pesoRef gera velocidade positiva', () => {
    const est = new EstimadorMovimentoBarra(TAX, { tempoForcandoS: 10 }); // evita FORCANDO
    est.ativar();
    // Força 50 N acima por 1 s
    const res = simular(est, () => PESO + 50, TAX);
    expect(res.velocidadeMs).toBeGreaterThan(0);
  });

  it('UT-2.8.3 — força abaixo de pesoRef gera velocidade negativa', () => {
    const est = new EstimadorMovimentoBarra(TAX);
    est.ativar();
    // Primeiro sobe um pouco
    simular(est, () => PESO + 80, TAX / 2);
    // Depois força abaixo → desce
    const res = simular(est, () => PESO - 80, TAX / 2);
    expect(res.velocidadeMs).toBeLessThan(0);
  });

  it('UT-2.8.4 — filtro passa-alta: offset constante não acumula posição indefinidamente', () => {
    const est = new EstimadorMovimentoBarra(TAX, { tempoForcandoS: 999 });
    est.ativar();
    // Offset constante de 10 N por 30 s
    const res = simular(est, () => PESO + 10, TAX * 30);
    // Com HP, o offset DC é removido — posição não deve explodir
    expect(Math.abs(res.posicaoM)).toBeLessThan(5);
  });

  it('UT-2.8.5 — reiniciar() zera estado e volta para CALIBRANDO', () => {
    const est = new EstimadorMovimentoBarra(TAX);
    est.ativar();
    simular(est, () => PESO + 100, TAX * 2);
    est.reiniciar();
    expect(est.faseAtual).toBe('CALIBRANDO');
    const res = est.processar(PESO, 0, PESO, MASSA);
    expect(res.posicaoM).toBe(0);
    expect(res.velocidadeMs).toBe(0);
  });

  it('UT-2.8.6 — transição PARADO → SUBINDO → DESCENDO → PARADO com rep sintética', () => {
    const est = new EstimadorMovimentoBarra(TAX, { vMinimoSubidaMs: 0.01, margemForcaN: 2 });
    est.ativar();

    const fases: string[] = [];
    const AMOSTRAS = TAX * 4;

    for (let i = 0; i < AMOSTRAS; i++) {
      let f: number;
      const t = i / TAX;
      if      (t < 1.0) f = PESO;           // parado
      else if (t < 1.8) f = PESO + 120;     // subindo
      else if (t < 2.5) f = PESO - 80;      // descendo
      else              f = PESO;            // parado novamente

      const res = est.processar(f, i * DT_MS, PESO, MASSA);
      fases.push(res.fase);
    }

    expect(fases).toContain('SUBINDO');
    expect(fases).toContain('DESCENDO');
    // Deve terminar em PARADO
    expect(fases[fases.length - 1]).toBe('PARADO');
  });

  it('UT-2.8.7 — FORCANDO detectado com força alta sem subida', () => {
    const est = new EstimadorMovimentoBarra(TAX, { tempoForcandoS: 1, vMinimoSubidaMs: 10 });
    est.ativar();
    // Força 30 N acima mas vMinimoSubida muito alto → nunca confirma subida
    const res = simular(est, () => PESO + 30, TAX * 2);
    expect(res.fase).toBe('FORCANDO');
  });

  it('UT-2.8.8 — forcaRelativa = forcaN / pesoRef', () => {
    const est = new EstimadorMovimentoBarra(TAX);
    est.ativar();
    const res = est.processar(PESO * 1.1, 0, PESO, MASSA);
    expect(res.forcaRelativa).toBeCloseTo(1.1, 5);
  });

  it('UT-2.8.9 — atualizarConfig altera parâmetros em tempo real', () => {
    const est = new EstimadorMovimentoBarra(TAX, { fatorDamping: 0.5 });
    est.ativar();
    est.atualizarConfig({ fatorDamping: 0.99 });
    // Com damping alto, velocidade acumula mais
    const res1 = simular(est, () => PESO + 80, TAX);
    est.reiniciar();
    est.ativar();
    est.atualizarConfig({ fatorDamping: 0.1 });
    const res2 = simular(est, () => PESO + 80, TAX);
    expect(res1.velocidadeMs).toBeGreaterThan(res2.velocidadeMs);
  });
});
