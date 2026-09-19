import { describe, it, expect } from 'vitest';
import { PipelineProcessamento } from '../../src/pipeline/PipelineProcessamento.js';
import type { PacoteDados } from '@balancagfig/protocolo';

const pacote = (f: number, t = 0): PacoteDados => ({ tipo: 'DADOS', marcaTemporal: t, forcaNewtons: f, forcaBruta: 0, statusFirmware: 0 });
const cfg = { limiarZonaMortaN: 0.5, janelaMediaMovel: 3, fatorCalibracao: 1, deslocamentoTara: 0, tempoMinFimMs: 100 };

/**
 * Fase 1: a estrutura em três etapas não muda a ordem numérica de hoje
 * (Notch → Mediana → Zona morta → suavizadores). Os golden files provam a
 * igualdade byte a byte; aqui ficam as propriedades da ordem.
 */
describe('Pipeline — etapas (Fase 1)', () => {
  it('limpeza vem antes da zona morta: a mediana remove o spike e a zona morta zera o que sobrou', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ ativoMediana: true, janelaMediana: 3, ativoZonaMorta: true });
    p.processar(pacote(0.1)); p.processar(pacote(0.1));
    const r = p.processar(pacote(50));          // spike: mediana(0.1, 0.1, 50) = 0.1 → zona morta → 0
    expect(r.forcaNewton).toBe(0);
    expect(r.forcaNewtonCrua).toBe(50);
  });

  it('zona morta vem antes do filtro principal: a média móvel recebe zeros, não o ruído', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ ativoZonaMorta: true, ativoMediaMovel: true, janelaMediaMovel: 3 });
    p.processar(pacote(0.4)); p.processar(pacote(0.4));
    const r = p.processar(pacote(0.4));         // todos abaixo de 0.5 → zerados antes de suavizar
    expect(r.forcaNewton).toBe(0);
  });

  it('filtro principal vem depois da limpeza: com tudo desligado a saída é a entrada', () => {
    const p = new PipelineProcessamento({ ...cfg });
    const r = p.processar(pacote(12.34));
    expect(r.forcaNewton).toBe(12.34);
    expect(r.forcaNewtonBruta).toBeUndefined();
  });

  it('Fase 2: nunca dois suavizadores — ligar média móvel e EMA deixa só a EMA (última vence)', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ ativoMediaMovel: true, janelaMediaMovel: 2, ativoEMA: true, alphaEMA: 0.5 });
    expect(p.obterConfig().filtroPrincipal).toBe('ema');
    expect(p.obterConfig()).toMatchObject({ ativoMediaMovel: false, ativoEMA: true, ativoSG: false, ativoKalman: false });
    p.processar(pacote(10));
    const r2 = p.processar(pacote(0));
    expect(r2.forcaNewton).toBeCloseTo(5, 9);        // só EMA: 0.5·0 + 0.5·10 (antes, MM+EMA dava 7.5)
  });

  it('Fase 2: filtroPrincipal explícito e troca reinicia o filtro novo', () => {
    const p = new PipelineProcessamento({ ...cfg, filtroPrincipal: 'mediaMovel' });
    expect(p.obterConfig().filtroPrincipal).toBe('mediaMovel');
    p.processar(pacote(10)); p.processar(pacote(10)); p.processar(pacote(10));
    p.atualizarConfig({ filtroPrincipal: 'kalman' });
    expect(p.obterConfig().ativoKalman).toBe(true);
    const r = p.processar(pacote(10));
    expect(r.forcaNewton).toBeCloseTo(10, 6);        // Kalman recém-reiniciado converge na 1ª amostra
    p.atualizarConfig({ filtroPrincipal: 'nenhum' });
    expect(p.processar(pacote(3.3)).forcaNewton).toBe(3.3);
    expect(p.processar(pacote(3.3)).forcaNewtonBruta).toBeUndefined();
  });

  it('Fase 2: cliente antigo que desliga a flag do filtro atual volta a nenhum', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ ativoSG: true });
    expect(p.obterConfig().filtroPrincipal).toBe('savitzkyGolay');
    p.atualizarConfig({ ativoSG: false });
    expect(p.obterConfig().filtroPrincipal).toBe('nenhum');
  });
});
