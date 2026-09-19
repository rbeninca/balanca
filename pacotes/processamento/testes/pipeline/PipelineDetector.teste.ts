import { describe, it, expect } from 'vitest';
import { PipelineProcessamento } from '../../src/pipeline/PipelineProcessamento.js';
import type { PacoteDados } from '@balancagfig/protocolo';

const pacote = (f: number, t: number): PacoteDados => ({ tipo: 'DADOS', marcaTemporal: t, forcaNewtons: f, forcaBruta: 0, statusFirmware: 0 });
const cfg = { limiarZonaMortaN: 0.5, janelaMediaMovel: 3, fatorCalibracao: 1, deslocamentoTara: 0, tempoMinFimMs: 100 };

describe('Pipeline — detector de evento (Fase 7)', () => {
  it('sem os campos novos, o detector segue a zona morta e o tempo de fim (compat)', () => {
    const p = new PipelineProcessamento({ ...cfg });
    expect(p.obterConfig().detector).toEqual({ limiarEntradaN: 0.5, limiarSaidaN: 0.5, tempoEntradaMs: 0, tempoSaidaMs: 100 });
    p.atualizarConfig({ limiarZonaMortaN: 0.8, tempoMinFimMs: 50 });
    expect(p.obterConfig().detector).toEqual({ limiarEntradaN: 0.8, limiarSaidaN: 0.8, tempoEntradaMs: 0, tempoSaidaMs: 50 });
  });

  it('limiares próprios desacoplam o detector da zona morta; saída maior que entrada é presa', () => {
    const p = new PipelineProcessamento({ ...cfg });
    p.atualizarConfig({ ativoDetectorQueima: true, limiarEntradaN: 5, limiarSaidaN: 2, tempoEntradaMs: 30, tempoSaidaMs: 100 });
    expect(p.obterConfig().detector).toEqual({ limiarEntradaN: 5, limiarSaidaN: 2, tempoEntradaMs: 30, tempoSaidaMs: 100 });
    p.atualizarConfig({ limiarZonaMortaN: 0.01 });     // zona morta muda, detector não
    expect(p.obterConfig().detector.limiarEntradaN).toBe(5);
    p.atualizarConfig({ limiarSaidaN: 9 });
    expect(p.obterConfig().detector.limiarSaidaN).toBe(5);

    // 20 N por 30 ms confirma; entre 2 e 5 mantém; abaixo de 2 por 100 ms encerra
    const q = new PipelineProcessamento({ ...cfg, limiarEntradaN: 5, limiarSaidaN: 2, tempoEntradaMs: 30, tempoSaidaMs: 100 });
    q.atualizarConfig({ ativoDetectorQueima: true });
    expect(q.processar(pacote(20, 0)).emQueima).toBe(false);
    expect(q.processar(pacote(20, 30)).emQueima).toBe(true);
    expect(q.processar(pacote(3, 60)).emQueima).toBe(true);
    expect(q.processar(pacote(1, 100)).emQueima).toBe(true);
    expect(q.processar(pacote(1, 200)).emQueima).toBe(false);
  });
});
