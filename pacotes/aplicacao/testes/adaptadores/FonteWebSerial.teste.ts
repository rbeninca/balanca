import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FonteWebSerial } from '../../src/adaptadores/FonteWebSerial.js';
import { criarPacoteDadosValido, criarPacoteDadosInvalido } from '../simulacros/pacoteDados.js';

function criarPortaSimulacro(bytes?: Uint8Array) {
  let resolveLeitura: ((v: any) => void) | null = null;
  const readable = {
    getReader: () => ({
      read: vi.fn().mockImplementationOnce(() => ({
        value: bytes,
        done: false,
      })).mockResolvedValue({ done: true }),
      releaseLock: vi.fn(),
    }),
  };
  return {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    readable,
  };
}

function instalarMockSerial(porta: any) {
  const serial = {
    requestPort: vi.fn().mockResolvedValue(porta),
    getPorts: vi.fn().mockResolvedValue([]),
  };
  Object.defineProperty(navigator, 'serial', {
    value: serial,
    writable: true,
    configurable: true,
  });
  return serial;
}

describe('FonteWebSerial', () => {
  // UT-7.3.1
  it('conectar() chama requestPort() uma vez', async () => {
    const porta = criarPortaSimulacro();
    const serial = instalarMockSerial(porta);
    const fonte = new FonteWebSerial();
    await fonte.conectar();
    expect(serial.requestPort).toHaveBeenCalledTimes(1);
    await fonte.desconectar();
  });

  // UT-7.3.2
  it('bytes válidos → evento dados com LeituraProcessada', async () => {
    const bytes = new Uint8Array(criarPacoteDadosValido(3.0, 500));
    const porta = criarPortaSimulacro(bytes);
    instalarMockSerial(porta);
    const fonte = new FonteWebSerial();
    const recebido: any[] = [];
    fonte.on('dados', l => recebido.push(l));
    await fonte.conectar();
    // Aguarda o stream ser processado
    await new Promise(r => setTimeout(r, 10));
    expect(recebido.length).toBeGreaterThan(0);
    expect(typeof recebido[0].forcaNewton).toBe('number');
    await fonte.desconectar();
  });

  // UT-7.3.3
  it('bytes inválidos (CRC ruim) → evento erro, sem crash', async () => {
    const bytes = new Uint8Array(criarPacoteDadosInvalido());
    const porta = criarPortaSimulacro(bytes);
    instalarMockSerial(porta);
    const fonte = new FonteWebSerial();
    const erros: string[] = [];
    fonte.on('erro', e => erros.push(e));
    await fonte.conectar();
    await new Promise(r => setTimeout(r, 10));
    expect(erros.length).toBeGreaterThan(0);
    await fonte.desconectar();
  });

  // UT-7.3.5
  it('desconectar() fecha a porta', async () => {
    const porta = criarPortaSimulacro();
    instalarMockSerial(porta);
    const fonte = new FonteWebSerial();
    await fonte.conectar();
    await fonte.desconectar();
    expect(porta.close).toHaveBeenCalled();
  });

  // UT-7.3.6
  it('forcaBruta nunca exposta no evento dados', async () => {
    const bytes = new Uint8Array(criarPacoteDadosValido(2.0, 100));
    const porta = criarPortaSimulacro(bytes);
    instalarMockSerial(porta);
    const fonte = new FonteWebSerial();
    const recebido: any[] = [];
    fonte.on('dados', l => recebido.push(l));
    await fonte.conectar();
    await new Promise(r => setTimeout(r, 10));
    if (recebido.length > 0) {
      expect((recebido[0] as any).forcaBruta).toBeUndefined();
    }
    await fonte.desconectar();
  });

  // UT-7.3.7
  it('obterStatus() retorna transporte webserial', () => {
    const fonte = new FonteWebSerial();
    expect(fonte.obterStatus().transporte).toBe('webserial');
  });
});
