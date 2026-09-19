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

  it('Fase 4: Hampel vem antes da mediana e do Notch — o spike some antes de entrar no IIR', () => {
    const p = new PipelineProcessamento({ ...cfg, taxaAmostragemHz: 80 });
    p.atualizarConfig({ ativoHampel: true, janelaHampel: 5, ativoNotch: true, freqNotchHz: 20, qNotch: 5 });
    for (let i = 0; i < 20; i++) p.processar(pacote(10, i));
    const comSpike = p.processar(pacote(10 + 500, 20));
    expect(Math.abs(comSpike.forcaNewton - 10)).toBeLessThan(0.5);   // Hampel removeu; Notch não "tocou o sino"
    const depois = p.processar(pacote(10, 21));
    expect(Math.abs(depois.forcaNewton - 10)).toBeLessThan(0.5);
    expect(p.obterConfig().ativoHampel).toBe(true);
  });

  it('Fase 6: zona morta vem DEPOIS do filtro principal — decide sobre o sinal já suavizado', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ ativoZonaMorta: true, filtroPrincipal: 'mediaMovel', janelaMediaMovel: 3 });
    // 0.9, 0.9, 0 → média 0.6 > 0.5: passa (antes, cada 0.9 passava e o 0 zerava a média para 0.6 também;
    // a diferença aparece com ruído em torno do limiar:)
    p.processar(pacote(0.9)); p.processar(pacote(0.9));
    expect(p.processar(pacote(0)).forcaNewton).toBeCloseTo(0.6, 9);
    const q = new PipelineProcessamento({ ...cfg });
    q.atualizarConfig({ ativoZonaMorta: true, filtroPrincipal: 'mediaMovel', janelaMediaMovel: 3 });
    // 0.6, 0.6, 0.2 → média 0.467 < 0.5 → 0. Antes (zona morta antes da média): 0.6, 0.6, 0 → 0.4 → saía 0.4.
    q.processar(pacote(0.6)); q.processar(pacote(0.6));
    expect(q.processar(pacote(0.2)).forcaNewton).toBe(0);
  });

  it('Fase 6: fonteCalculoImpulso — padrão final (após zona morta); filtrado integra antes dela', () => {
    const final = new PipelineProcessamento({ ...cfg });
    final.atualizarConfig({ ativoZonaMorta: true });
    expect(final.obterConfig().fonteCalculoImpulso).toBe('final');
    let ultimo = 0;
    for (let i = 0; i < 10; i++) ultimo = final.processar(pacote(0.3, i * 100)).impulsoAcumuladoNs;   // 0.3 < 0.5 → zerado
    expect(ultimo).toBe(0);                                                                            // ruído não acumula

    const filtrado = new PipelineProcessamento({ ...cfg, fonteCalculoImpulso: 'filtrado' });
    filtrado.atualizarConfig({ ativoZonaMorta: true });
    for (let i = 0; i < 10; i++) ultimo = filtrado.processar(pacote(0.3, i * 100)).impulsoAcumuladoNs;
    expect(ultimo).toBeCloseTo(0.3 * 0.9, 9);   // integra o sinal antes da zona morta (9 intervalos de 0,1 s)
    expect(filtrado.processar(pacote(0.3, 1000)).forcaNewton).toBe(0);   // a saída visível continua zerada

    filtrado.atualizarConfig({ fonteCalculoImpulso: 'invalido' as never });
    expect(filtrado.obterConfig().fonteCalculoImpulso).toBe('filtrado');   // valor desconhecido é ignorado
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
