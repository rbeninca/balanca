import { describe, it, expect, vi } from 'vitest';
import { EstadoGateway, descreverTempo, linhasClientes } from '../../src/nucleo/EstadoGateway.js';

describe('EstadoGateway', () => {
  it('observar recebe o estado atual e as mudanças; cancelar para de receber', () => {
    const eg = new EstadoGateway();
    const fn = vi.fn();
    const cancelar = eg.observar(fn);
    expect(fn).toHaveBeenCalledWith({ disponivel: false, clientes: [], gravandoPor: null });
    eg.definir({ disponivel: true, clientes: [{ endereco: 'a', conectadoEm: 1 }], gravandoPor: null });
    expect(fn).toHaveBeenCalledTimes(2);
    cancelar();
    eg.limpar();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(eg.obter().disponivel).toBe(false);
  });
});

describe('descreverTempo', () => {
  it('segundos, minutos e horas', () => {
    expect(descreverTempo(1000, 6000)).toBe('há 5 s');
    expect(descreverTempo(0, 3 * 60_000)).toBe('há 3 min');
    expect(descreverTempo(0, 2 * 3_600_000)).toBe('há 2 h');
    expect(descreverTempo(5000, 1000)).toBe('há 0 s');   // relógio do box adiantado
  });
});

describe('linhasClientes', () => {
  it('marca quem grava e o coloca primeiro', () => {
    const linhas = linhasClientes({
      disponivel: true, gravandoPor: '192.168.43.12',
      clientes: [{ endereco: '192.168.43.10', conectadoEm: 0 }, { endereco: '192.168.43.12', conectadoEm: 30_000 }],
    }, 60_000);
    expect(linhas).toEqual([
      { endereco: '192.168.43.12', desde: 'há 30 s', gravando: true },
      { endereco: '192.168.43.10', desde: 'há 1 min', gravando: false },
    ]);
  });
});

import { descreverChip } from '../../src/nucleo/EstadoGateway.js';

describe('descreverChip', () => {
  const base = { serial: 'conectada' as const, proximaTentativaS: null, ultimaLeituraMs: null };
  it('sem ligação WebSocket (WebSerial): chip como sempre', () => {
    expect(descreverChip(null, 'WebSerial')).toEqual({ classe: 'conectado', texto: 'WebSerial' });
  });
  it('ok com célula: verde com o endereço', () => {
    expect(descreverChip({ ...base, fase: 'ok' }, '192.168.43.1')).toEqual({ classe: 'conectado', texto: '192.168.43.1' });
  });
  it('gateway vivo sem célula: amarelo', () => {
    expect(descreverChip({ ...base, fase: 'ok', serial: 'sem_dispositivo' }, 'g')).toEqual({ classe: 'atencao', texto: 'g — gateway ok, sem célula' });
    expect(descreverChip({ ...base, fase: 'ok', serial: 'erro' }, 'g').texto).toContain('erro na serial');
  });
  it('reconectando: vermelho com contagem', () => {
    expect(descreverChip({ ...base, fase: 'reconectando', proximaTentativaS: 4 }, 'g')).toEqual({ classe: 'reconectando', texto: 'g — reconectando em 4 s' });
    expect(descreverChip({ ...base, fase: 'conectando' }, 'g')).toEqual({ classe: 'reconectando', texto: 'g — conectando…' });
    expect(descreverChip({ ...base, fase: 'fechada' }, 'g')).toEqual({ classe: 'desconectado', texto: 'g — desconectado' });
  });
});
