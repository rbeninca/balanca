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
    // REPOUSO → IGNIÇÃO → BURNOUT
    expect(p.processar(pacote(0,     0)).emQueima).toBe(false);  // 0 N
    expect(p.processar(pacote(200, 100)).emQueima).toBe(true);   // 200 N
    expect(p.processar(pacote(0,   200)).emQueima).toBe(true);   // 0 N → timer início
    expect(p.processar(pacote(0,   301)).emQueima).toBe(false);  // 101ms abaixo → REPOUSO
  });
});
