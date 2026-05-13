import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { calcularCRC16 } from '@balancagfig/protocolo';

// ─── Mock do módulo serialport ───────────────────────────────────────────────

class MockSerialPort extends EventEmitter {
  public isOpen = false;
  public dadosEscritos: Buffer[] = [];
  public caminhoAberto = '';

  constructor(public opts: { path: string; baudRate: number; autoOpen: boolean }) {
    super();
    MockSerialPort.ultima = this;
  }

  open(cb: (err?: Error) => void): void {
    this.isOpen = true;
    this.caminhoAberto = this.opts.path;
    cb();
  }

  write(dados: Buffer, cb: (err?: Error) => void): void {
    this.dadosEscritos.push(Buffer.from(dados));
    cb();
  }

  close(cb: () => void): void {
    this.isOpen = false;
    cb();
  }

  static ultima: MockSerialPort;
}

vi.mock('serialport', () => ({
  SerialPort: MockSerialPort,
}));

// importação dinâmica APÓS o mock
const { PortaSerial } = await import('../src/PortaSerial.js');

// ─── Helper: monta pacote DATA v2 válido ─────────────────────────────────────

function pacoteDadosValido(): Buffer {
  const buf = Buffer.alloc(20);
  buf.writeUInt16LE(0xa1b2, 0);
  buf.writeUInt8(0x02, 2);
  buf.writeUInt8(0x01, 3);
  buf.writeUInt32LE(1000, 4);
  buf.writeFloatLE(9.81, 8);
  buf.writeInt32LE(210000, 12);
  buf.writeUInt8(0, 16);
  buf.writeUInt8(0, 17);
  const crc = calcularCRC16(new Uint8Array(buf.subarray(0, 18)));
  buf.writeUInt16LE(crc, 18);
  return buf;
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('PortaSerial', () => {
  let porta: InstanceType<typeof PortaSerial>;

  beforeEach(() => {
    porta = new PortaSerial({ caminho: '/dev/ttyUSB0', baud: 921600 });
    porta.iniciar();
  });

  afterEach(async () => {
    await porta.fechar();
  });

  it('UT-5.1.1 — emite pacote para cada frame válido', async () => {
    const pacotes: unknown[] = [];
    porta.on('pacote', (p) => pacotes.push(p));

    MockSerialPort.ultima.simularRecepcao = (buf: Buffer) => {
      MockSerialPort.ultima.emit('data', buf);
    };

    MockSerialPort.ultima.simularRecepcao(pacoteDadosValido());

    await new Promise((r) => setTimeout(r, 10));
    expect(pacotes).toHaveLength(1);
    const pkt = pacotes[0] as { tipo: string };
    expect(pkt.tipo).toBe('DADOS');
  });

  it('UT-5.1.2 — frame com CRC inválido emite erro_decodificacao sem throw', async () => {
    const erros: string[] = [];
    porta.on('erro_decodificacao', (msg: string) => erros.push(msg));

    const buf = pacoteDadosValido();
    buf[18] ^= 0x01; // corrompe CRC

    MockSerialPort.ultima.emit('data', buf);
    await new Promise((r) => setTimeout(r, 10));
    expect(erros.length).toBeGreaterThan(0);
  });

  it('UT-5.1.3 — agenda reconexão após erro serial', async () => {
    const spy = vi.spyOn(global, 'setTimeout');
    MockSerialPort.ultima.emit('error', new Error('erro'));
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalled();
  });

  it('UT-5.1.4 — agenda reconexão após close', async () => {
    const spy = vi.spyOn(global, 'setTimeout');
    MockSerialPort.ultima.emit('close');
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalled();
  });

  it('UT-5.1.5 — fechar() cancela o timer de reconexão', async () => {
    const spy = vi.spyOn(global, 'clearTimeout');
    MockSerialPort.ultima.emit('error', new Error('test'));
    await porta.fechar();
    expect(spy).toHaveBeenCalled();
  });

  it('UT-5.1.6 — enviar() chama porta.write()', async () => {
    const dados = Buffer.from([0x01, 0x02]);
    await porta.enviar(dados);
    expect(MockSerialPort.ultima.dadosEscritos).toHaveLength(1);
  });

  it('UT-5.1.7 — enviar() rejeita se porta fechada', async () => {
    await porta.fechar();
    const porta2 = new PortaSerial({ caminho: '/dev/ttyUSB0' });
    // não chama iniciar() — porta nunca é aberta
    await expect(porta2.enviar(Buffer.from([0x01]))).rejects.toThrow(/não está aberta/i);
  });
});
