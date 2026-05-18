import { describe, it, expect } from 'vitest';
import { PipelineProcessamento } from '../../src/pipeline/PipelineProcessamento.js';
import type { PacoteDados } from '@balancagfig/protocolo';

function pacote(forcaNewtons: number, marcaTemporal = 0): PacoteDados {
  return {
    tipo: 'DADOS',
    marcaTemporal,
    forcaNewtons,
    forcaBruta: 0,
    statusFirmware: 0,
  };
}

const configBase = {
  limiarZonaMortaN:  0.5,
  janelaMediaMovel:  1,
  fatorCalibracao:   1.0,
  deslocamentoTara:  0,
  tempoMinFimMs:     100,
};

// ── Testes existentes (regressão) ────────────────────────────────────────────

describe('PipelineProcessamento', () => {
  it('UT-2.7.1 — ruído → zona morta elimina', () => {
    const p = new PipelineProcessamento(configBase);
    const r = p.processar(pacote(0.3));  // 0.3 < limiar 0.5 → zona morta → 0
    expect(r.forcaNewton).toBe(0);
    expect(r.emQueima).toBe(false);
  });

  it('UT-2.7.3 — forcaNewton em Newtons: 200 N passa direto', () => {
    const p = new PipelineProcessamento(configBase);
    const r = p.processar(pacote(200));
    expect(r.forcaNewton).toBeCloseTo(200);
  });

  it('UT-2.7.4 — temperatura passada como 0 (firmware não fornece)', () => {
    const p = new PipelineProcessamento(configBase);
    expect(p.processar(pacote(200)).temperatura).toBe(0);
  });

  it('UT-2.7.5 — marcaTemporal preservado', () => {
    const p = new PipelineProcessamento(configBase);
    expect(p.processar(pacote(200, 12345)).marcaTemporal).toBe(12345);
  });

  it('UT-2.7.6 — impulso cresce com queima: 10N por 0.5s → ≈5 N·s', () => {
    const p = new PipelineProcessamento(configBase);
    p.processar(pacote(10, 0));
    const r = p.processar(pacote(10, 500));
    expect(r.impulsoAcumuladoNs).toBeCloseTo(5, 1);
  });

  it('UT-2.7.7 — reiniciar() zera estado', () => {
    const p = new PipelineProcessamento(configBase);
    p.processar(pacote(200, 0));
    p.processar(pacote(200, 500));
    p.reiniciar();
    const r = p.processar(pacote(200, 600));
    expect(r.impulsoAcumuladoNs).toBeCloseTo(0, 5);
    expect(r.emQueima).toBe(true);
  });

  it('UT-2.7.8 — atualizarCalibracao() muda fator em runtime (usado pelo gateway)', () => {
    const p = new PipelineProcessamento(configBase);
    p.atualizarCalibracao(4.0, 0);
    expect(p.obterFatorCalibracao()).toBe(4.0);
  });

  it('UT-2.7.2 — sequência completa: emQueima alterna', () => {
    const p = new PipelineProcessamento(configBase);
    expect(p.processar(pacote(0,     0)).emQueima).toBe(false);
    expect(p.processar(pacote(200, 100)).emQueima).toBe(true);
    expect(p.processar(pacote(0,   200)).emQueima).toBe(true);
    expect(p.processar(pacote(0,   301)).emQueima).toBe(false);
  });

  // ── Regressão: novos filtros desativados não alteram comportamento ─────────

  it('UT-2.7.9 — novos filtros desativados por padrão: saída idêntica ao original', () => {
    const p1 = new PipelineProcessamento(configBase);
    const p2 = new PipelineProcessamento(configBase);
    // p2 ativa e desativa para garantir que o estado não fica sujo
    p2.atualizarConfig({ ativoMediana: true });
    p2.atualizarConfig({ ativoMediana: false });

    for (const forca of [0, 1, 5, 100, 200]) {
      const r1 = p1.processar(pacote(forca, forca * 10));
      const r2 = p2.processar(pacote(forca, forca * 10));
      expect(r2.forcaNewton).toBeCloseTo(r1.forcaNewton, 5);
    }
  });

  it('UT-2.7.10 — forcaNewtonBruta ausente quando nenhum filtro novo ativo', () => {
    const p = new PipelineProcessamento(configBase);
    const r = p.processar(pacote(100));
    expect(r.forcaNewtonBruta).toBeUndefined();
  });

  // ── EMA ──────────────────────────────────────────────────────────────────

  it('UT-2.7.11 — EMA ativo: forcaNewtonBruta presente e diferente', () => {
    const p = new PipelineProcessamento({ ...configBase, alphaEMA: 0.3 });
    p.atualizarConfig({ ativoEMA: true, ativoMediaMovel: false });
    p.processar(pacote(0, 0)); // inicializa EMA
    const r = p.processar(pacote(100, 10));
    expect(r.forcaNewtonBruta).toBeDefined();
    // EMA com alpha=0.3 após partir de 0: 0.3*100 = 30 ≠ 100
    expect(r.forcaNewton).not.toBeCloseTo(100, 0);
    expect(r.forcaNewtonBruta).toBeCloseTo(100, 5);
  });

  it('UT-2.7.12 — EMA: atualizarConfig muda alpha em runtime', () => {
    const p = new PipelineProcessamento(configBase);
    p.atualizarConfig({ ativoEMA: true, ativoMediaMovel: false, alphaEMA: 1.0 });
    p.processar(pacote(0));
    const r = p.processar(pacote(77));
    // alpha=1 → segue perfeitamente → forcaNewton ≈ forcaNewtonBruta
    expect(r.forcaNewton).toBeCloseTo(77, 2);
  });

  // ── Mediana ───────────────────────────────────────────────────────────────

  it('UT-2.7.13 — Mediana ativo: spike não contamina saída filtrada', () => {
    const p = new PipelineProcessamento({ ...configBase, janelaMediana: 3 });
    p.atualizarConfig({ ativoMediana: true });
    p.processar(pacote(10, 0));
    p.processar(pacote(10, 1));
    const r = p.processar(pacote(1000, 2)); // [10, 10, 1000] → mediana = 10
    expect(r.forcaNewton).toBeCloseTo(10, 1);
    expect(r.forcaNewtonBruta).toBeCloseTo(1000, 5);
  });

  // ── Notch ────────────────────────────────────────────────────────────────

  it('UT-2.7.14 — Notch ativo: forcaNewtonBruta presente', () => {
    const p = new PipelineProcessamento({ ...configBase, freqNotchHz: 60, qNotch: 30, taxaAmostragemHz: 100 });
    p.atualizarConfig({ ativoNotch: true });
    const r = p.processar(pacote(50, 0));
    expect(r.forcaNewtonBruta).toBeDefined();
  });

  // ── Savitzky-Golay ────────────────────────────────────────────────────────

  it('UT-2.7.15 — SG ativo: sinal constante preservado após aquecimento', () => {
    const p = new PipelineProcessamento({ ...configBase, janelaSG: 5, janelaMediaMovel: 1 });
    p.atualizarConfig({ ativoSG: true, ativoMediaMovel: false });
    for (let i = 0; i < 10; i++) {
      const r = p.processar(pacote(20, i * 10));
      if (i >= 4) expect(r.forcaNewton).toBeCloseTo(20, 3);
    }
  });

  // ── Kalman ────────────────────────────────────────────────────────────────

  it('UT-2.7.16 — Kalman ativo: converge para valor constante', () => {
    const p = new PipelineProcessamento({ ...configBase, kalmanQ: 0.01, kalmanR: 1.0 });
    p.atualizarConfig({ ativoKalman: true, ativoMediaMovel: false });
    let r = p.processar(pacote(100, 0));
    for (let i = 1; i < 100; i++) r = p.processar(pacote(100, i * 10));
    expect(r.forcaNewton).toBeCloseTo(100, 1);
    expect(r.forcaNewtonBruta).toBeCloseTo(100, 5);
  });

  // ── obterConfig ───────────────────────────────────────────────────────────

  it('UT-2.7.17 — obterConfig retorna flags dos novos filtros', () => {
    const p = new PipelineProcessamento(configBase);
    p.atualizarConfig({ ativoMediana: true, ativoKalman: true });
    const cfg = p.obterConfig();
    expect(cfg.ativoMediana).toBe(true);
    expect(cfg.ativoKalman).toBe(true);
    expect(cfg.ativoEMA).toBe(false);
    expect(cfg.ativoNotch).toBe(false);
    expect(cfg.ativoSG).toBe(false);
  });

  it('UT-2.7.18 — reiniciar() reseta todos os filtros novos', () => {
    const p = new PipelineProcessamento({ ...configBase, kalmanQ: 0.01, kalmanR: 1.0 });
    p.atualizarConfig({ ativoKalman: true, ativoMediaMovel: false });
    // Alimenta com 100 para que Kalman acumule estado
    for (let i = 0; i < 50; i++) p.processar(pacote(100, i * 10));
    p.reiniciar();
    // Após reiniciar, primeiro valor é tratado como estimativa inicial
    const r = p.processar(pacote(7, 0));
    expect(r.forcaNewton).toBeCloseTo(7, 1);
  });
});
