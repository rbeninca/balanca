import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { GerenciadorSessao } from '../../src/nucleo/GerenciadorSessao.js';
import { ArmazenamentoLocal } from '../../src/armazenamento/ArmazenamentoLocal.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function makeLeitura(t: number, f: number, q: boolean, i: number): LeituraProcessada {
  return { marcaTemporal: t, forcaNewton: f, temperatura: 0, emQueima: q, impulsoAcumuladoNs: i };
}

describe('GerenciadorSessao', () => {
  function criar() {
    const armazenamento = new ArmazenamentoLocal();
    const gerenciador   = new GerenciadorSessao(armazenamento);
    return { armazenamento, gerenciador };
  }

  // UT-7.6.1
  it('iniciarGravacao() cria sessão com id', async () => {
    const { gerenciador } = criar();
    const sessao = await gerenciador.iniciarGravacao('Motor X');
    expect(sessao.id).toBeTruthy();
  });

  // UT-7.6.2
  it('adicionarLeitura() × 50 → flush automático', async () => {
    const { armazenamento, gerenciador } = criar();
    const { id } = await gerenciador.iniciarGravacao('Flush');
    for (let i = 0; i < 50; i++) {
      await gerenciador.adicionarLeitura(makeLeitura(i * 10, 2.0, true, i * 0.02));
    }
    const ls = await armazenamento.obterLeituras(id);
    expect(ls.length).toBe(50);
  });

  // UT-7.6.3
  it('pararGravacao() retorna sessão com forcaMaximaN calculada', async () => {
    const { gerenciador } = criar();
    await gerenciador.iniciarGravacao('Metricas');
    await gerenciador.adicionarLeitura(makeLeitura(0, 2.0, true, 0.0));
    await gerenciador.adicionarLeitura(makeLeitura(100, 5.0, true, 0.35));
    await gerenciador.adicionarLeitura(makeLeitura(200, 3.0, true, 0.75));
    const resultado = await gerenciador.pararGravacao();
    expect(resultado.forcaMaximaN).toBe(5.0);
  });

  // UT-7.6.4
  it('pararGravacao() sem iniciarGravacao() → throw', async () => {
    const { gerenciador } = criar();
    await expect(gerenciador.pararGravacao()).rejects.toThrow(/sessão ativa/);
  });

  // UT-7.6.5
  it('forcaMaximaN = max das leituras gravadas', async () => {
    const { gerenciador } = criar();
    await gerenciador.iniciarGravacao('Max');
    const forcas = [1.0, 7.5, 3.0, 4.0, 2.0];
    for (let i = 0; i < forcas.length; i++) {
      await gerenciador.adicionarLeitura(makeLeitura(i * 100, forcas[i]!, true, i * 0.1));
    }
    const r = await gerenciador.pararGravacao();
    expect(r.forcaMaximaN).toBe(7.5);
  });

  // UT-7.6.6
  it('impulsoTotalNs = último impulsoAcumuladoNs', async () => {
    const { gerenciador } = criar();
    await gerenciador.iniciarGravacao('Impulso');
    await gerenciador.adicionarLeitura(makeLeitura(0,   1.0, true, 0.0));
    await gerenciador.adicionarLeitura(makeLeitura(100, 2.0, true, 1.5));
    await gerenciador.adicionarLeitura(makeLeitura(200, 1.0, true, 2.94));
    const r = await gerenciador.pararGravacao();
    expect(r.impulsoTotalNs).toBe(2.94);
  });
});
