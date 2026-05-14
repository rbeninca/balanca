import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { ArmazenamentoLocal } from '../../src/armazenamento/ArmazenamentoLocal.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function makeLeituras(n: number): LeituraProcessada[] {
  return Array.from({ length: n }, (_, i) => ({
    marcaTemporal: i * 100,
    forcaNewton: 2.0 + i * 0.1,
    temperatura: 0,
    emQueima: i > 2,
    impulsoAcumuladoNs: i * 0.2,
  }));
}

describe('ArmazenamentoLocal', () => {
  let armazenamento: ArmazenamentoLocal;

  beforeEach(() => {
    armazenamento = new ArmazenamentoLocal();
  });

  // UT-7.4.1
  it('criarSessao() gera id automaticamente', async () => {
    const s = await armazenamento.criarSessao('Teste');
    expect(s.id).toBeTruthy();
  });

  // UT-7.4.2
  it('listarSessoes() retorna 3 após criar 3', async () => {
    await armazenamento.criarSessao('A');
    await armazenamento.criarSessao('B');
    await armazenamento.criarSessao('C');
    const lista = await armazenamento.listarSessoes();
    expect(lista.length).toBeGreaterThanOrEqual(3);
  });

  // UT-7.4.3
  it('excluirSessao() remove da lista', async () => {
    const s = await armazenamento.criarSessao('Remover');
    const antes = await armazenamento.listarSessoes();
    await armazenamento.excluirSessao(s.id);
    const depois = await armazenamento.listarSessoes();
    expect(depois.length).toBe(antes.length - 1);
  });

  // UT-7.4.4
  it('adicionarLeituras() + obterLeituras() round-trip', async () => {
    const s = await armazenamento.criarSessao('Round-trip');
    const ls = makeLeituras(10);
    await armazenamento.adicionarLeituras(s.id, ls);
    const recuperadas = await armazenamento.obterLeituras(s.id);
    expect(recuperadas).toHaveLength(10);
  });

  // UT-7.4.5
  it('excluirSessao() remove leituras em cascata', async () => {
    const s = await armazenamento.criarSessao('Cascata');
    await armazenamento.adicionarLeituras(s.id, makeLeituras(5));
    await armazenamento.excluirSessao(s.id);
    const ls = await armazenamento.obterLeituras(s.id);
    expect(ls).toHaveLength(0);
  });

  // UT-7.4.6
  it('exportarCSV() retorna string com cabeçalho iniciando com #', async () => {
    const s = await armazenamento.criarSessao('CSV');
    await armazenamento.adicionarLeituras(s.id, makeLeituras(3));
    const csv = await armazenamento.exportarCSV(s.id);
    expect(csv.split('\n')[0]).toMatch(/^#/);
  });

  // UT-7.4.7
  it('salvarMetadados() + obterMetadados() round-trip', async () => {
    const s = await armazenamento.criarSessao('Meta');
    await armazenamento.salvarMetadados(s.id, { massaPropelente_g: 30, fabricante: 'GFIG' });
    const meta = await armazenamento.obterMetadados(s.id);
    expect(meta?.massaPropelente_g).toBe(30);
    expect(meta?.fabricante).toBe('GFIG');
  });

  // UT-7.4.8
  it('obterMetadados() retorna null para sessão sem metadados', async () => {
    const s = await armazenamento.criarSessao('Sem meta');
    const meta = await armazenamento.obterMetadados(s.id);
    expect(meta).toBeNull();
  });

  // UT-7.4.9
  it('substituirLeituras() troca os dados e preserva emQueima', async () => {
    const s = await armazenamento.criarSessao('Substituir');
    const originais = makeLeituras(5);
    await armazenamento.adicionarLeituras(s.id, originais);

    const novas: LeituraProcessada[] = [
      { marcaTemporal: 0,   forcaNewton: 1, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
      { marcaTemporal: 100, forcaNewton: 5, temperatura: 0, emQueima: true,  impulsoAcumuladoNs: 300 },
      { marcaTemporal: 200, forcaNewton: 3, temperatura: 0, emQueima: true,  impulsoAcumuladoNs: 700 },
    ];
    await armazenamento.substituirLeituras(s.id, novas);

    const resultado = await armazenamento.obterLeituras(s.id);
    expect(resultado).toHaveLength(3);
    expect(resultado[0]!.emQueima).toBe(false);
    expect(resultado[1]!.emQueima).toBe(true);
    expect(resultado[2]!.emQueima).toBe(true);
  });

  // UT-7.4.10
  it('substituirLeituras() atualiza flags emQueima de sessão já existente', async () => {
    const s = await armazenamento.criarSessao('Flags');
    const ls = makeLeituras(6);
    await armazenamento.adicionarLeituras(s.id, ls);

    // Muda emQueima de todas para false
    const alteradas = ls.map(l => ({ ...l, emQueima: false }));
    await armazenamento.substituirLeituras(s.id, alteradas);

    const resultado = await armazenamento.obterLeituras(s.id);
    expect(resultado.every(l => l.emQueima === false)).toBe(true);
  });
});
