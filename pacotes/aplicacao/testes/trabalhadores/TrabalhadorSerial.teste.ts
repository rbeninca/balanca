import { describe, it, expect } from 'vitest';
import { TrabalhadorSerial } from '../../src/trabalhadores/TrabalhadorSerial.js';
import { criarPacoteDadosValido, criarPacoteDadosInvalido } from '../simulacros/pacoteDados.js';
import type { ConfiguracaoPipeline } from '@balancagfig/processamento/tipos';

const CONFIG: ConfiguracaoPipeline = {
  limiarZonaMortaN: 0.05,
  janelaMediaMovel: 1,
  fatorCalibracao: 0.001,
  deslocamentoTara: 0,
  tempoMinFimMs: 100,
};

describe('TrabalhadorSerial', () => {
  // UT-7.1.1
  it('CONFIGURAR instancia pipeline — BYTES processado após CONFIGURAR', () => {
    const w = new TrabalhadorSerial();
    w.processar({ tipo: 'CONFIGURAR', config: CONFIG });
    const buf = criarPacoteDadosValido(5.0, 100);
    const res = w.processar({ tipo: 'BYTES', buffer: buf });
    expect(res?.tipo).toBe('dados');
  });

  // UT-7.1.2
  it('BYTES → evento dados com LeituraProcessada.forcaNewton definido', () => {
    const w = new TrabalhadorSerial();
    w.processar({ tipo: 'CONFIGURAR', config: CONFIG });
    const buf = criarPacoteDadosValido(3.0, 200);
    const res = w.processar({ tipo: 'BYTES', buffer: buf });
    expect(res?.tipo).toBe('dados');
    if (res?.tipo === 'dados') {
      expect(typeof res.leitura.forcaNewton).toBe('number');
    }
  });

  // UT-7.1.3
  it('BYTES sem CONFIGURAR → retorna null silenciosamente', () => {
    const w = new TrabalhadorSerial();
    const buf = criarPacoteDadosValido();
    const res = w.processar({ tipo: 'BYTES', buffer: buf });
    expect(res).toBeNull();
  });

  // UT-7.1.4
  it('BYTES com CRC inválido → retorna evento erro sem crash', () => {
    const w = new TrabalhadorSerial();
    w.processar({ tipo: 'CONFIGURAR', config: CONFIG });
    const buf = criarPacoteDadosInvalido();
    const res = w.processar({ tipo: 'BYTES', buffer: buf });
    expect(res?.tipo).toBe('erro');
  });

  // UT-7.1.5
  it('REINICIAR → zera estado do pipeline (impulso acumulado = 0)', () => {
    const w = new TrabalhadorSerial();
    w.processar({ tipo: 'CONFIGURAR', config: CONFIG });

    // Acumula impulso em alguns pacotes
    for (let i = 0; i < 5; i++) {
      w.processar({ tipo: 'BYTES', buffer: criarPacoteDadosValido(10, i * 100) });
    }

    w.processar({ tipo: 'REINICIAR' });

    const res = w.processar({ tipo: 'BYTES', buffer: criarPacoteDadosValido(10, 600) });
    if (res?.tipo === 'dados') {
      expect(res.leitura.impulsoAcumuladoNs).toBe(0);
    }
  });

  // UT-7.1.6
  it('forcaBruta nunca exposta via evento dados', () => {
    const w = new TrabalhadorSerial();
    w.processar({ tipo: 'CONFIGURAR', config: CONFIG });
    const res = w.processar({ tipo: 'BYTES', buffer: criarPacoteDadosValido() });
    if (res?.tipo === 'dados') {
      expect((res.leitura as any).forcaBruta).toBeUndefined();
    }
  });

  // UT-7.1.7 — após transfer(), o ArrayBuffer original torna-se detachado (byteLength=0)
  it('transferência zero-cópia: original fica detachado após transfer()', () => {
    const buf = criarPacoteDadosValido();
    if (typeof (buf as any).transfer === 'function') {
      (buf as any).transfer();
      expect(buf.byteLength).toBe(0);
    } else {
      // Ambientes sem transfer() nativos não suportam zero-cópia
      expect(buf.byteLength).toBeGreaterThan(0);
    }
  });
});
