import { describe, it, expect } from 'vitest';
import { PipelineProcessamento } from '../../src/pipeline/PipelineProcessamento.js';
import type { PacoteDados } from '@balancagfig/protocolo';

const pacote = (f: number, t: number): PacoteDados => ({ tipo: 'DADOS', marcaTemporal: t, forcaNewtons: f, forcaBruta: 0, statusFirmware: 0 });
const cfg = { limiarZonaMortaN: 0.5, janelaMediaMovel: 3, fatorCalibracao: 1, deslocamentoTara: 0, tempoMinFimMs: 100 };
const marca = (i: number, hz: number) => Math.round(1000 + i * 1000 / hz);

function ganho(p: PipelineProcessamento, fSinal: number, fs: number, n = 600): number {
  let max = 0;
  for (let i = 0; i < n; i++) {
    const r = p.processar(pacote(Math.sin(2 * Math.PI * fSinal * i / fs), marca(i, fs)));
    if (i >= n - 100) max = Math.max(max, Math.abs(r.forcaNewton));
  }
  return max;
}

describe('Pipeline — Butterworth como filtro principal (Fase 5)', () => {
  it('é uma opção exclusiva do filtro principal e usa a Fs fixada', () => {
    const p = new PipelineProcessamento({ ...cfg, taxaAmostragemHz: 80 });
    p.atualizarConfig({ filtroPrincipal: 'butterworth', frequenciaCorteHz: 10 });
    expect(p.obterConfig()).toMatchObject({ filtroPrincipal: 'butterworth', butterworthValido: true, ativoEMA: false });
    expect(ganho(p, 2, 80)).toBeGreaterThan(0.97);
    const p30 = new PipelineProcessamento({ ...cfg, taxaAmostragemHz: 80 });
    p30.atualizarConfig({ filtroPrincipal: 'butterworth', frequenciaCorteHz: 10 });
    expect(ganho(p30, 30, 80)).toBeLessThan(0.12);
  });

  it('usa a Fs estimada quando não há taxa fixada: 30 Hz a 200 Hz passa (fc = 40), a 80 Hz não (fc = 10)', () => {
    const rapido = new PipelineProcessamento({ ...cfg });
    rapido.atualizarConfig({ filtroPrincipal: 'butterworth', frequenciaCorteHz: 40 });
    expect(ganho(rapido, 30, 200)).toBeGreaterThan(0.85);
    expect(rapido.obterConfig().taxaEstimadaHz!).toBeCloseTo(200, 0);
  });

  it('fc ≥ Fs/2 é inválido: o filtro passa direto e o estado avisa; corrigir fc reativa', () => {
    const p = new PipelineProcessamento({ ...cfg, taxaAmostragemHz: 80 });
    p.atualizarConfig({ filtroPrincipal: 'butterworth', frequenciaCorteHz: 45 });
    expect(p.obterConfig().butterworthValido).toBe(false);
    expect(p.processar(pacote(7, 1000)).forcaNewton).toBe(7);         // passa direto
    p.atualizarConfig({ frequenciaCorteHz: 10 });
    expect(p.obterConfig().butterworthValido).toBe(true);
    expect(p.processar(pacote(7, 1013)).forcaNewton).not.toBe(7);     // filtrando
  });

  it('a Fs estimada pode invalidar um fc que era válido (fc = 45 Hz, Fs cai de 100 para 80)', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ filtroPrincipal: 'butterworth', frequenciaCorteHz: 45 });
    expect(p.obterConfig().butterworthValido).toBe(true);   // Fs padrão 100 → Nyquist 50
    for (let i = 0; i < 300; i++) p.processar(pacote(0, marca(i, 80)));
    expect(p.obterConfig().butterworthValido).toBe(false);  // Fs 80 → Nyquist 40 < 45
  });

  it('flags antigas não conhecem o Butterworth: PIPELINE_ESTADO mostra todas false', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ filtroPrincipal: 'butterworth' });
    expect(p.obterConfig()).toMatchObject({ ativoMediaMovel: false, ativoEMA: false, ativoSG: false, ativoKalman: false });
    expect(p.processar(pacote(1, 1000)).forcaNewtonBruta).toBe(1);   // conta como "filtro novo"
  });
});
