import { describe, it, expect } from 'vitest';
import { PipelineProcessamento } from '../../src/pipeline/PipelineProcessamento.js';
import type { PacoteDados } from '@balancagfig/protocolo';

const pacote = (f: number, t: number): PacoteDados => ({ tipo: 'DADOS', marcaTemporal: t, forcaNewtons: f, forcaBruta: 0, statusFirmware: 0 });
const cfg = { limiarZonaMortaN: 0.5, janelaMediaMovel: 3, fatorCalibracao: 1, deslocamentoTara: 0, tempoMinFimMs: 100 };
const marca = (i: number, hz: number) => Math.round(1000 + i * 1000 / hz);

/** Seno de `hz` amostrado a `fs`, alimentado por `n` amostras; devolve a amplitude da saída no fim. */
function amplitudeSaida(p: PipelineProcessamento, fSinal: number, fs: number, n = 400): number {
  let max = 0;
  for (let i = 0; i < n; i++) {
    const r = p.processar(pacote(Math.sin(2 * Math.PI * fSinal * i / fs), marca(i, fs)));
    if (i > n - 80) max = Math.max(max, Math.abs(r.forcaNewton));
  }
  return max;
}

describe('Pipeline — Fs estimada (Fase 3)', () => {
  it('sem taxaAmostragemHz fixada, o estado expõe a Fs medida pelas marcas de tempo', () => {
    const p = new PipelineProcessamento({ ...cfg });
    expect(p.obterConfig().taxaEstimadaHz).toBeNull();
    for (let i = 0; i < 64; i++) p.processar(pacote(0, marca(i, 80)));
    expect(p.obterConfig().taxaEstimadaHz!).toBeCloseTo(80, 0);
    expect(p.consumirMudancaTaxa()).toBe(true);
    expect(p.consumirMudancaTaxa()).toBe(false);
  });

  it('o Notch usa a Fs real: rejeita 60 Hz a 200 Hz de amostragem (antes assumia 100 Hz e errava a frequência)', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ ativoNotch: true, freqNotchHz: 60, qNotch: 10 });
    // Aquece o estimador a 200 Hz para a reconstrução acontecer antes da medição
    for (let i = 0; i < 64; i++) p.processar(pacote(0, marca(i, 200)));
    const pNotch = new PipelineProcessamento({ ...cfg });
    pNotch.atualizarConfig({ ativoNotch: true, freqNotchHz: 60, qNotch: 10 });
    const em60 = amplitudeSaida(pNotch, 60, 200);
    const pRef = new PipelineProcessamento({ ...cfg });
    pRef.atualizarConfig({ ativoNotch: true, freqNotchHz: 60, qNotch: 10 });
    const em10 = amplitudeSaida(pRef, 10, 200);
    expect(em60).toBeLessThan(0.15);    // 60 Hz atenuado
    expect(em10).toBeGreaterThan(0.9);  // 10 Hz passa
  });

  it('com taxaAmostragemHz fixada no patch, a estimativa não reconstrói o Notch', () => {
    const p = new PipelineProcessamento({ ...cfg, taxaAmostragemHz: 80 });
    p.atualizarConfig({ ativoNotch: true });
    for (let i = 0; i < 64; i++) p.processar(pacote(0, marca(i, 200)));
    expect(p.obterConfig().taxaEstimadaHz!).toBeCloseTo(200, 0);   // mede, mas…
    expect(p.consumirMudancaTaxa()).toBe(false);                    // …não usa
    expect(p.obterConfig().taxaAmostragemHz).toBe(80);
  });

  it('reiniciar zera a estimativa', () => {
    const p = new PipelineProcessamento({ ...cfg });
    for (let i = 0; i < 64; i++) p.processar(pacote(0, marca(i, 80)));
    p.reiniciar();
    expect(p.obterConfig().taxaEstimadaHz).toBeNull();
  });
});
