import { describe, it, expect } from 'vitest';
import { DetectorBatimento, CONFIG_DETECTOR_PADRAO } from '../../src/analise/DetectorBatimento.js';

const TAXA_HZ = 80;

function processar(detector: DetectorBatimento, forcaN: number, ms: number) {
  return detector.processar(forcaN, ms);
}

describe('DetectorBatimento', () => {
  // ── Inicialização e configuração ──────────────────────────────────────────

  it('UT-2.20.1 — instancia com config padrão sem erro', () => {
    expect(() => new DetectorBatimento(TAXA_HZ)).not.toThrow();
  });

  it('UT-2.20.2 — obterConfig retorna config completa com novos campos', () => {
    const d = new DetectorBatimento(TAXA_HZ);
    const cfg = d.obterConfig();
    expect(cfg.cancelarRespiracao).toBe(false);
    expect(cfg.modoPico).toBe('limiar');
    expect(cfg.modoBpm).toBe('ibi');
    expect(cfg.janelaAutoS).toBe(10);
  });

  it('UT-2.20.3 — atualizarConfig altera cancelarRespiracao', () => {
    const d = new DetectorBatimento(TAXA_HZ);
    d.atualizarConfig({ cancelarRespiracao: true });
    expect(d.obterConfig().cancelarRespiracao).toBe(true);
  });

  it('UT-2.20.4 — atualizarConfig altera modoPico para panTompkins', () => {
    const d = new DetectorBatimento(TAXA_HZ);
    d.atualizarConfig({ modoPico: 'panTompkins' });
    expect(d.obterConfig().modoPico).toBe('panTompkins');
  });

  // ── Traço bruto e filtrado ────────────────────────────────────────────────

  it('UT-2.20.5 — sinalBruto e sinalFiltrado são números finitos', () => {
    const d = new DetectorBatimento(TAXA_HZ);
    const r = processar(d, 0.05, 0);
    expect(isFinite(r.sinalBruto)).toBe(true);
    expect(isFinite(r.sinalFiltrado)).toBe(true);
  });

  it('UT-2.20.6 — sinal zero por longo período: qualidade sem-sinal', () => {
    const d = new DetectorBatimento(TAXA_HZ);
    let r = processar(d, 0, 0);
    for (let i = 1; i <= 300; i++) r = processar(d, 0, i * (1000 / TAXA_HZ));
    expect(r.qualidade).toBe('sem-sinal');
    expect(r.bpm).toBeNull();
  });

  // ── Modos de BPM ─────────────────────────────────────────────────────────

  it('UT-2.20.7 — bpmAuto e confiancaAuto estão presentes no resultado', () => {
    const d = new DetectorBatimento(TAXA_HZ);
    const r = processar(d, 0.01, 0);
    expect('bpmAuto' in r).toBe(true);
    expect('confiancaAuto' in r).toBe(true);
  });

  it('UT-2.20.8 — modoBpm=autocorrelacao: bpm vem do estimador (null antes do aquecimento)', () => {
    const d = new DetectorBatimento(TAXA_HZ, { modoBpm: 'autocorrelacao' });
    const r = processar(d, 0.01, 0);
    // Com buffer frio, bpm deve ser null
    expect(r.bpm).toBeNull();
  });

  // ── Cancelador de respiração ──────────────────────────────────────────────

  it('UT-2.20.9 — cancelarRespiracao=true: saída é número finito', () => {
    const d = new DetectorBatimento(TAXA_HZ, { cancelarRespiracao: true });
    for (let i = 0; i < 50; i++) {
      const r = processar(d, Math.sin(2 * Math.PI * 0.25 * i / TAXA_HZ), i * 12.5);
      expect(isFinite(r.sinalFiltrado)).toBe(true);
    }
  });

  // ── Pan-Tompkins ──────────────────────────────────────────────────────────

  it('UT-2.20.10 — modoPico=panTompkins: não lança erro em operação normal', () => {
    const d = new DetectorBatimento(TAXA_HZ, { modoPico: 'panTompkins' });
    expect(() => {
      for (let i = 0; i < 200; i++) {
        const amp = (i % 60 < 5) ? 1.0 : 0.0;
        processar(d, amp, i * 12.5);
      }
    }).not.toThrow();
  });

  // ── reiniciar ─────────────────────────────────────────────────────────────

  it('UT-2.20.11 — reiniciar() zera todos os estados internos', () => {
    const d = new DetectorBatimento(TAXA_HZ, {
      cancelarRespiracao: true, modoPico: 'panTompkins', modoBpm: 'ambos',
    });
    for (let i = 0; i < 200; i++) processar(d, Math.sin(i * 0.1), i * 12.5);
    d.reiniciar();
    const r = processar(d, 0.001, 0);
    expect(r.ibiMs).toBeNull();
    expect(r.qualidade).toBe('sem-sinal');
  });

  // ── atualizarConfig recria instâncias internas ────────────────────────────

  it('UT-2.20.12 — atualizarConfig com novo numPesosNlms recria cancelador', () => {
    const d = new DetectorBatimento(TAXA_HZ, { cancelarRespiracao: true });
    // Alimenta o cancelador com dados para que tenha estado
    for (let i = 0; i < 50; i++) processar(d, 0.5, i * 12.5);
    // Muda numPesosNlms: deve recriar sem error
    expect(() => d.atualizarConfig({ numPesosNlms: 32 })).not.toThrow();
    const r = processar(d, 0.01, 51 * 12.5);
    expect(isFinite(r.sinalFiltrado)).toBe(true);
  });
});
