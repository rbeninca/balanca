import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { calcularCRC16, codificarComando } from '@balancagfig/protocolo';
import { ServidorWebSocket } from '../src/ServidorWebSocket.js';

// ─── Porta simulacra simples ─────────────────────────────────────────────────

class PortaSimulacra extends EventEmitter {
  public dadosEscritos: Buffer[] = [];
  estaConectado() { return true; }
  async enviar(b: Buffer) { this.dadosEscritos.push(b); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pacoteDadosBruto(forcaBruta = 110): Buffer {
  const buf = Buffer.alloc(20);
  buf.writeUInt16LE(0xa1b2, 0);
  buf.writeUInt8(0x02, 2);
  buf.writeUInt8(0x01, 3);
  buf.writeUInt32LE(500, 4);
  buf.writeFloatLE(9.81, 8);
  buf.writeInt32LE(forcaBruta, 12);
  buf.writeUInt8(0, 16);
  buf.writeUInt8(0, 17);
  const crc = calcularCRC16(new Uint8Array(buf.subarray(0, 18)));
  buf.writeUInt16LE(crc, 18);
  return buf;
}

const CONFIG_PADRAO = {
  limiarZonaMortaN:  0.5,
  janelaMediaMovel:  1,
  fatorCalibracao:   2.0,
  deslocamentoTara:  100,
  tempoMinFimMs:     100,
};

function aguardarMensagem(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
  });
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('ServidorWebSocket', () => {
  let porta: PortaSimulacra;
  let srv:   ServidorWebSocket;
  let porta_tcp: number;
  let cliente: WebSocket;

  beforeEach(async () => {
    porta_tcp = 9000 + Math.floor(Math.random() * 1000);
    porta = new PortaSimulacra();
    srv   = new ServidorWebSocket(porta, CONFIG_PADRAO, porta_tcp);

    cliente = new WebSocket(`ws://localhost:${porta_tcp}`);
    await new Promise((r) => cliente.on('open', r));
  });

  afterEach(async () => {
    cliente.close();
    await srv.fechar();
  });

  it('UT-5.2.1 — PacoteDados → LEITURA difundida', async () => {
    const promessa = aguardarMensagem(cliente);
    const buf = new Uint8Array(pacoteDadosBruto(200));
    porta.emit('pacote', { tipo: 'DADOS', marcaTemporal: 500, forcaNewtons: 9.81, forcaBruta: 200, statusFirmware: 0 });
    const msg = await promessa;
    expect(msg['tipo']).toBe('LEITURA');
  });

  it('UT-5.2.3 — PacoteStatus → difundido direto', async () => {
    const promessa = aguardarMensagem(cliente);
    porta.emit('pacote', { tipo: 'STATUS', tipoStatus: 1, codigo: 0x10, valor: 0, marcaTemporal: 100 });
    const msg = await promessa;
    expect(msg['tipo']).toBe('STATUS');
  });

  it('UT-5.2.5 — JSON inválido do cliente → não quebra', async () => {
    cliente.send('não é json!!');
    await new Promise((r) => setTimeout(r, 50));
    expect(srv.obterNumClientes()).toBeGreaterThan(0);
  });

  it('UT-5.2.7 — cliente desconecta → removido do set', async () => {
    expect(srv.obterNumClientes()).toBe(1);
    cliente.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(srv.obterNumClientes()).toBe(0);
  });

  it('UT-5.2.8 — serial desconecta → SERIAL_OFF difundido', async () => {
    const promessa = aguardarMensagem(cliente);
    porta.emit('desconectado', 'porta fechada');
    const msg = await promessa;
    expect(msg['tipo']).toBe('SERIAL_OFF');
  });

  it('UT-5.2.9 — serial reconecta → SERIAL_OK difundido', async () => {
    const promessa = aguardarMensagem(cliente);
    porta.emit('conectado', '/dev/ttyUSB0');
    const msg = await promessa;
    expect(msg['tipo']).toBe('SERIAL_OK');
  });

  it('UT-5.3.1 — /saude retorna via obterNumClientes()', () => {
    expect(typeof srv.obterNumClientes()).toBe('number');
  });
});
