import { describe, it, expect } from 'vitest';
import { itensMenu, textoClientes } from '../../src/interface/navBar.js';

describe('itensMenu (engrenagem)', () => {
  const noop = () => {};

  it('sem conexão: Configurações e Jogos aparecem desativados; o resto disponível', () => {
    const itens = itensMenu({ ativo: 'conexao', onFirmware: noop });
    const porId = Object.fromEntries(itens.map(i => [i.id, i]));
    expect(porId['nav-config']!.disponivel).toBe(false);
    expect(porId['nav-jogos']!.disponivel).toBe(false);
    expect(porId['nav-firmware']!.disponivel).toBe(true);
    expect(porId['nav-atualizacao']!.disponivel).toBe(true);
    expect(porId['nav-pendrive']!.disponivel).toBe(true);
    expect(porId['nav-montagem']!.disponivel).toBe(true);
    expect(porId['nav-creditos']!.disponivel).toBe(true);
  });

  it('agrupa em operação / box / ajuda, nessa ordem', () => {
    const itens = itensMenu({ ativo: 'medicao', onConfiguracoes: noop, onJogos: noop, onFirmware: noop });
    expect(itens.map(i => `${i.grupo}:${i.label}`)).toEqual([
      'operacao:Configurações', 'operacao:Jogos',
      'box:Firmware', 'box:Atualização', 'box:Pendrive',
      'ajuda:Montagem', 'ajuda:Créditos',
    ]);
  });

  it('marca o item da tela ativa dentro do menu', () => {
    const itens = itensMenu({ ativo: 'firmware', onConfiguracoes: noop, onJogos: noop, onFirmware: noop });
    expect(itens.filter(i => i.ativo).map(i => i.id)).toEqual(['nav-firmware']);
    expect(itensMenu({ ativo: 'jogos', onJogos: noop, onFirmware: noop }).find(i => i.id === 'nav-jogos')!.ativo).toBe(true);
    expect(itensMenu({ ativo: 'sessoes', onFirmware: noop }).some(i => i.ativo)).toBe(false);
  });
});

describe('textoClientes (chip de status)', () => {
  it('vazio sem gateway ou sem clientes; 👥 N com clientes', () => {
    expect(textoClientes({ disponivel: false, clientes: [{ endereco: 'a', conectadoEm: 0 }], gravandoPor: null })).toBe('');
    expect(textoClientes({ disponivel: true, clientes: [], gravandoPor: null })).toBe('');
    expect(textoClientes({ disponivel: true, clientes: [{ endereco: 'a', conectadoEm: 0 }, { endereco: 'b', conectadoEm: 0 }], gravandoPor: 'a' })).toBe('👥 2');
  });
});
