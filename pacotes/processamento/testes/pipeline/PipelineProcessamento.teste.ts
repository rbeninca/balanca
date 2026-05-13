import { describe, it, expect } from 'vitest';
import { PipelineProcessamento } from '../../src/pipeline/PipelineProcessamento.js';
import type { PacoteDados } from '@balancagfig/protocolo';

function pacote(forcaBruta: number, marcaTemporal = 0): PacoteDados {
  return {
    tipo: 'DADOS',
    marcaTemporal,
    forcaNewtons: 0,   // ignorado — pipeline usa forcaBruta
    forcaBruta,
    statusFirmware: 0,
  };
}

const configBase = {
  limiarZonaMortaN:  0.5,
  janelaMediaMovel:  1,
  fatorCalibracao:   2.0,
  deslocamentoTara:  100,
  tempoMinFimMs:     100,
};

describe('PipelineProcessamento', () => {
  it('UT-2.7.1 — ruído → zona morta elimina', () => {
    const p = new PipelineProcessamento(configBase);
    const r = p.processar(pacote(100));  // (100-100)*2 = 0 → zona morta → 0
    expect(r.forcaNewton).toBe(0);
    expect(r.emQueima).toBe(false);
  });

  it('UT-2.7.3 — forcaNewton em Newtons: (200-100)*2 = 200', () => {
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
    // forcaBruta = 100+5 = 105 → calibrado: (105-100)*2 = 10 N
    p.processar(pacote(105, 0));
    const r = p.processar(pacote(105, 500));
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

  it('UT-2.7.8 — atualizarCalibracao() muda fator em runtime', () => {
    const p = new PipelineProcessamento(configBase);
    p.atualizarCalibracao(4.0, 100);
    const r = p.processar(pacote(150)); // (150-100)*4 = 200 N
    expect(r.forcaNewton).toBeCloseTo(200);
    expect(p.obterFatorCalibracao()).toBe(4.0);
  });

  it('UT-2.7.2 — sequência completa: emQueima alterna', () => {
    const p = new PipelineProcessamento(configBase);
    // REPOUSO → IGNIÇÃO → BURNOUT
    expect(p.processar(pacote(100,   0)).emQueima).toBe(false);  // 0 N
    expect(p.processar(pacote(200, 100)).emQueima).toBe(true);   // 200 N
    expect(p.processar(pacote(100, 200)).emQueima).toBe(true);   // 0 N → timer início
    expect(p.processar(pacote(100, 301)).emQueima).toBe(false);  // 101ms abaixo → REPOUSO
  });
});
