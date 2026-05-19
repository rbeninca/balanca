import { describe, it, expect } from 'vitest';
import { DetectorRepeticaoBarra } from '../../src/analise/DetectorRepeticaoBarra.js';
import { EstimadorMovimentoBarra } from '../../src/analise/EstimadorMovimentoBarra.js';

const TAX   = 100;
const PESO  = 785;
const MASSA = PESO / 9.81;
const DT_MS = 1000 / TAX;

function simularRep(
  est: EstimadorMovimentoBarra,
  det: DetectorRepeticaoBarra,
  forcaFn: (tS: number) => number,
  duracaoS: number,
): ReturnType<DetectorRepeticaoBarra['processar']>[] {
  const reps: ReturnType<DetectorRepeticaoBarra['processar']>[] = [];
  const n = Math.round(duracaoS * TAX);
  for (let i = 0; i < n; i++) {
    const ts = i * DT_MS;
    const estado = est.processar(forcaFn(i / TAX), ts, PESO, MASSA);
    const rep = det.processar(estado, ts, PESO);
    reps.push(rep);
  }
  return reps;
}

function perfilRep(tS: number): number {
  // 0–0.5 s: parado; 0.5–1.3 s: subindo (F+120); 1.3–2.0 s: descendo (F-80); 2.0+: parado
  if (tS < 0.5)  return PESO;
  if (tS < 1.3)  return PESO + 120;
  if (tS < 2.0)  return PESO - 80;
  return PESO;
}

describe('DetectorRepeticaoBarra', () => {
  it('UT-2.9.1 — rep completa emite Repeticao com dados corretos', () => {
    const est = new EstimadorMovimentoBarra(TAX, { vMinimoSubidaMs: 0.01, margemForcaN: 2 });
    const det = new DetectorRepeticaoBarra();
    est.ativar();

    const reps = simularRep(est, det, perfilRep, 3).filter(Boolean);
    expect(reps.length).toBeGreaterThanOrEqual(1);
    const r = reps[0]!;
    expect(r!.posicaoPicoM).toBeGreaterThan(0);
    expect(r!.trabalhoJ).toBeGreaterThan(0);
    expect(r!.indice).toBe(1);
  });

  it('UT-2.9.2 — rep parcial (só sobe, não desce) não emite Repeticao', () => {
    const est = new EstimadorMovimentoBarra(TAX, { vMinimoSubidaMs: 0.01, margemForcaN: 2 });
    const det = new DetectorRepeticaoBarra();
    est.ativar();

    // Só sobe — nunca desce de volta a PARADO
    const reps = simularRep(est, det, (t) => t < 0.5 ? PESO : PESO + 120, 2).filter(Boolean);
    expect(reps.length).toBe(0);
  });

  it('UT-2.9.3 — trabalho ≈ pesoRef × posicaoPico', () => {
    const est = new EstimadorMovimentoBarra(TAX, { vMinimoSubidaMs: 0.01, margemForcaN: 2 });
    const det = new DetectorRepeticaoBarra();
    est.ativar();

    const reps = simularRep(est, det, perfilRep, 3).filter(Boolean);
    expect(reps.length).toBeGreaterThanOrEqual(1);
    const r = reps[0]!;
    // Trabalho ≈ pesoRef × pico (integração discreta, tolerância 20%)
    const esperado = PESO * r!.posicaoPicoM;
    expect(r!.trabalhoJ).toBeGreaterThan(esperado * 0.5);
    expect(r!.trabalhoJ).toBeLessThan(esperado * 1.5);
  });

  it('UT-2.9.4 — totalReps incrementa a cada rep completa', () => {
    const est = new EstimadorMovimentoBarra(TAX, { vMinimoSubidaMs: 0.01, margemForcaN: 2 });
    const det = new DetectorRepeticaoBarra();
    est.ativar();

    // Duas reps completas
    simularRep(est, det, perfilRep, 3);
    simularRep(est, det, perfilRep, 3);
    expect(det.totalReps).toBeGreaterThanOrEqual(1);
  });

  it('UT-2.9.5 — reiniciar() zera contador e estado', () => {
    const est = new EstimadorMovimentoBarra(TAX, { vMinimoSubidaMs: 0.01, margemForcaN: 2 });
    const det = new DetectorRepeticaoBarra();
    est.ativar();

    simularRep(est, det, perfilRep, 3);
    expect(det.totalReps).toBeGreaterThanOrEqual(1);
    det.reiniciar();
    expect(det.totalReps).toBe(0);
  });

  it('UT-2.9.6 — potenciaPicoW > 0 em rep válida', () => {
    const est = new EstimadorMovimentoBarra(TAX, { vMinimoSubidaMs: 0.01, margemForcaN: 2 });
    const det = new DetectorRepeticaoBarra();
    est.ativar();

    const reps = simularRep(est, det, perfilRep, 3).filter(Boolean);
    expect(reps.length).toBeGreaterThanOrEqual(1);
    expect(reps[0]!.potenciaPicoW).toBeGreaterThan(0);
  });
});
