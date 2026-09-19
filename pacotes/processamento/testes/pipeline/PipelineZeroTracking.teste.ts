import { describe, it, expect } from 'vitest';
import { PipelineProcessamento } from '../../src/pipeline/PipelineProcessamento.js';
import type { PacoteDados } from '@balancagfig/protocolo';

const pacote = (f: number, t: number): PacoteDados => ({ tipo: 'DADOS', marcaTemporal: t, forcaNewtons: f, forcaBruta: 0, statusFirmware: 0 });
const cfg = { limiarZonaMortaN: 0.5, janelaMediaMovel: 3, fatorCalibracao: 1, deslocamentoTara: 0, tempoMinFimMs: 100 };
const zt = { ativoZeroTracking: true, zeroTrackingLimiarN: 0.1, zeroTrackingTempoMs: 200, zeroTrackingAlpha: 0.05 };

describe('Pipeline — zero tracking (Fase 8)', () => {
  it('desligado por padrão; ligado, compensa deriva e expõe o offset', () => {
    const p = new PipelineProcessamento({ ...cfg });
    expect(p.obterConfig()).toMatchObject({ ativoZeroTracking: false, zeroTrackingOffsetN: 0 });
    p.atualizarConfig(zt);
    let r = p.processar(pacote(0.05, 0));
    for (let i = 1; i < 400; i++) r = p.processar(pacote(0.05, i * 12.5));
    expect(p.obterConfig().zeroTrackingOffsetN).toBeCloseTo(0.05, 3);
    expect(Math.abs(r.forcaNewton)).toBeLessThan(0.002);
    expect(p.consumirMudancaOffset()).toBe(true);
    expect(p.consumirMudancaOffset()).toBe(false);
  });

  it('roda antes da zona morta: com as duas ligadas a deriva é compensada, não escondida', () => {
    const p = new PipelineProcessamento({ ...cfg, limiarZonaMortaN: 0.08 });
    p.atualizarConfig({ ...zt, ativoZonaMorta: true });
    for (let i = 0; i < 400; i++) p.processar(pacote(0.05, i * 12.5));
    expect(p.obterConfig().zeroTrackingOffsetN).toBeGreaterThan(0.04);
  });

  it('não corrige durante evento (detector) nem durante gravação', () => {
    const emEvento = new PipelineProcessamento({ ...cfg, limiarEntradaN: 1, limiarSaidaN: 0.5 });
    emEvento.atualizarConfig({ ...zt, ativoDetectorQueima: true });
    emEvento.processar(pacote(5, 0));                                     // evento começa
    for (let i = 1; i < 400; i++) emEvento.processar(pacote(0.05, i * 12.5));   // dentro da zona de repouso, mas…
    // …o detector só encerra 100 ms após cair abaixo de 0,5; depois disso o ZT volta a contar
    expect(emEvento.obterConfig().zeroTrackingOffsetN).toBeLessThan(0.05);

    const gravando = new PipelineProcessamento({ ...cfg });
    gravando.atualizarConfig(zt);
    gravando.definirGravando(true);
    for (let i = 0; i < 400; i++) gravando.processar(pacote(0.05, i * 12.5));
    expect(gravando.obterConfig().zeroTrackingOffsetN).toBe(0);
    gravando.definirGravando(false);
    for (let i = 400; i < 800; i++) gravando.processar(pacote(0.05, i * 12.5));
    expect(gravando.obterConfig().zeroTrackingOffsetN).toBeGreaterThan(0.04);
  });

  it('desligar e religar zera o offset; trocar parâmetros também', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig(zt);
    for (let i = 0; i < 400; i++) p.processar(pacote(0.05, i * 12.5));
    expect(p.obterConfig().zeroTrackingOffsetN).toBeGreaterThan(0.04);
    p.atualizarConfig({ ativoZeroTracking: false });
    expect(p.obterConfig().zeroTrackingOffsetN).toBe(0);
    p.atualizarConfig({ ativoZeroTracking: true });
    for (let i = 0; i < 400; i++) p.processar(pacote(0.05, i * 12.5));
    p.atualizarConfig({ zeroTrackingAlpha: 0.02 });
    expect(p.obterConfig().zeroTrackingOffsetN).toBe(0);
  });

  it('reenviar os mesmos parâmetros (o painel manda tudo a cada mudança) não zera o offset', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig(zt);
    for (let i = 0; i < 400; i++) p.processar(pacote(0.05, i * 12.5));
    const antes = p.obterConfig().zeroTrackingOffsetN;
    expect(antes).toBeGreaterThan(0.04);
    p.atualizarConfig({ ...zt, ativoNotch: true, freqNotchHz: 50 });   // mexeu em outra coisa
    expect(p.obterConfig().zeroTrackingOffsetN).toBe(antes);
  });
});
