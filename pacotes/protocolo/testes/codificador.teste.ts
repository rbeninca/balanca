import { describe, it, expect } from 'vitest';
import { decodificar, codificarComando, calcularCRC16 } from '../src/codificador.js';
import type { ComandoTarar, ComandoCalibar, ComandoObterConfig, ComandoDefinirParam } from '../src/tipos.js';
import { PARAM_FATOR_CONV } from '../src/tipos.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function pacoteDadosFicticios(overrides: Partial<{
  marcaTemporal: number;
  forcaNewtons: number;
  forcaBruta: number;
  statusFirmware: number;
}> = {}): Uint8Array {
  const buf = new ArrayBuffer(20);
  const dv  = new DataView(buf);
  const bytes = new Uint8Array(buf);
  dv.setUint16(0, 0xa1b2, true);   // magic
  dv.setUint8(2, 0x02);             // versão
  dv.setUint8(3, 0x01);             // TIPO_DADOS
  dv.setUint32(4, overrides.marcaTemporal ?? 12345, true);
  dv.setFloat32(8, overrides.forcaNewtons ?? 9.81, true);
  dv.setInt32(12, overrides.forcaBruta ?? 210000, true);
  dv.setUint8(16, overrides.statusFirmware ?? 0);
  dv.setUint8(17, 0); // reserved
  const crc = calcularCRC16(bytes.subarray(0, 18));
  dv.setUint16(18, crc, true);
  return bytes;
}

// ─── Testes de decodificação de PacoteDados ─────────────────────────────────

describe('decodificar — PacoteDados', () => {
  it('UT-1.4.1 — round-trip: marcaTemporal preservado', () => {
    const bytes = pacoteDadosFicticios({ marcaTemporal: 99999 });
    const pkt = decodificar(bytes);
    expect(pkt.tipo).toBe('DADOS');
    if (pkt.tipo === 'DADOS') expect(pkt.marcaTemporal).toBe(99999);
  });

  it('UT-1.4.1b — round-trip: forcaNewtons preservado', () => {
    const bytes = pacoteDadosFicticios({ forcaNewtons: 15.5 });
    const pkt = decodificar(bytes);
    if (pkt.tipo === 'DADOS') expect(pkt.forcaNewtons).toBeCloseTo(15.5, 3);
  });

  it('UT-1.4.1c — round-trip: forcaBruta negativa preservada', () => {
    const bytes = pacoteDadosFicticios({ forcaBruta: -32768 });
    const pkt = decodificar(bytes);
    if (pkt.tipo === 'DADOS') expect(pkt.forcaBruta).toBe(-32768);
  });

  it('UT-1.4.7 — marcaTemporal máximo uint32 sem overflow', () => {
    const bytes = pacoteDadosFicticios({ marcaTemporal: 4294967295 });
    const pkt = decodificar(bytes);
    if (pkt.tipo === 'DADOS') expect(pkt.marcaTemporal).toBe(4294967295);
  });

  it('UT-1.4.4 — CRC corrompido lança erro', () => {
    const bytes = pacoteDadosFicticios();
    bytes[bytes.length - 3] ^= 0x01;   // corrompe byte antes do CRC
    expect(() => decodificar(bytes)).toThrow(/CRC inválido/i);
  });

  it('UT-1.4.5 — buffer truncado lança erro', () => {
    expect(() => decodificar(new Uint8Array([0xb2, 0xa1, 0x02]))).toThrow(/curto/i);
  });

  it('UT-1.4.6 — tipo desconhecido (0xFF) lança erro', () => {
    const bytes = new Uint8Array(20);
    const dv = new DataView(bytes.buffer);
    dv.setUint16(0, 0xa1b2, true);
    dv.setUint8(2, 0x02);
    dv.setUint8(3, 0xff);
    expect(() => decodificar(bytes)).toThrow(/desconhecido/i);
  });

  it('UT-1.4.6b — magic inválido lança erro', () => {
    const bytes = pacoteDadosFicticios();
    bytes[0] = 0x00;
    expect(() => decodificar(bytes)).toThrow(/Magic inválido/i);
  });
});

// ─── Testes de PacoteConfiguracao ───────────────────────────────────────────

describe('decodificar — PacoteConfiguracao', () => {
  it('UT-1.4.2 — round-trip: fatorConversao e offsetTara preservados', () => {
    const buf = new ArrayBuffer(64);
    const dv  = new DataView(buf);
    const bytes = new Uint8Array(buf);
    dv.setUint16(0, 0xa1b2, true);
    dv.setUint8(2, 0x02);
    dv.setUint8(3, 0x02); // TIPO_CONFIGURACAO
    dv.setFloat32(4, 21000.0, true);  // fatorConversao
    dv.setFloat32(8, 9.80665, true);  // gravidade
    dv.setUint16(12, 10, true);       // leiturasEstaveis
    dv.setFloat32(14, 100.0, true);   // toleranciaEst
    dv.setUint16(18, 3, true);        // numAmostrasMedia
    dv.setUint16(20, 10000, true);    // numAmostrasCal
    dv.setUint8(22, 1);               // usarMediaMovel
    dv.setUint8(23, 0);               // usarEMA
    dv.setUint16(24, 20, true);       // timeoutCal
    dv.setInt32(26, -5000, true);     // offsetTara negativo
    dv.setFloat32(30, 5000.0, true);  // capacidadeMaxGramas
    dv.setFloat32(34, 0.05, true);    // acuracia
    dv.setUint8(38, 0);               // modo
    const crc = calcularCRC16(bytes.subarray(0, 62));
    dv.setUint16(62, crc, true);
    const pkt = decodificar(bytes);
    expect(pkt.tipo).toBe('CONFIGURACAO');
    if (pkt.tipo === 'CONFIGURACAO') {
      expect(pkt.fatorConversao).toBeCloseTo(21000.0, 0);
      expect(pkt.offsetTara).toBe(-5000);
      expect(pkt.usarMediaMovel).toBe(true);
      expect(pkt.usarEMA).toBe(false);
    }
  });
});

// ─── Testes de PacoteStatus ─────────────────────────────────────────────────

describe('decodificar — PacoteStatus', () => {
  it('UT-1.4.3 — round-trip: código e marcaTemporal preservados', () => {
    const buf = new ArrayBuffer(14);
    const dv  = new DataView(buf);
    const bytes = new Uint8Array(buf);
    dv.setUint16(0, 0xa1b2, true);
    dv.setUint8(2, 0x02);
    dv.setUint8(3, 0x03); // TIPO_STATUS
    dv.setUint8(4, 0x01); // STATUS_SUCESSO
    dv.setUint8(5, 0x10); // MSG_TARA_OK
    dv.setUint16(6, 0, true);
    dv.setUint32(8, 55000, true);
    const crc = calcularCRC16(bytes.subarray(0, 12));
    dv.setUint16(12, crc, true);
    const pkt = decodificar(bytes);
    expect(pkt.tipo).toBe('STATUS');
    if (pkt.tipo === 'STATUS') {
      expect(pkt.tipoStatus).toBe(0x01);
      expect(pkt.codigo).toBe(0x10);
      expect(pkt.marcaTemporal).toBe(55000);
    }
  });
});

// ─── Testes de codificarComando ──────────────────────────────────────────────

describe('codificarComando — ComandoTarar', () => {
  it('UT-1.3.1 — tipo 0x10 no byte 3', () => {
    const cmd: ComandoTarar = { tipo: 'CMD_TARAR' };
    const bytes = codificarComando(cmd);
    expect(bytes[3]).toBe(0x10);
  });

  it('UT-1.3.2 — tamanho 8 bytes', () => {
    expect(codificarComando({ tipo: 'CMD_TARAR' })).toHaveLength(8);
  });

  it('UT-1.3.3 — CRC válido (últimos 2 bytes)', () => {
    const bytes = codificarComando({ tipo: 'CMD_TARAR' });
    const dv = new DataView(bytes.buffer);
    const crcRecebido = dv.getUint16(6, true);
    const crcCalculado = calcularCRC16(bytes.subarray(0, 6));
    expect(crcRecebido).toBe(crcCalculado);
  });
});

describe('codificarComando — ComandoCalibar', () => {
  it('UT-1.3.4 — massa_g codificada como float32', () => {
    const cmd: ComandoCalibar = { tipo: 'CMD_CALIBRAR', massaG: 500.0 };
    const bytes = codificarComando(cmd);
    expect(bytes).toHaveLength(10);
    const dv = new DataView(bytes.buffer);
    expect(dv.getFloat32(4, true)).toBeCloseTo(500.0, 3);
  });
});

describe('codificarComando — ComandoObterConfig', () => {
  it('UT-1.3.5 — tamanho 8 bytes e tipo 0x12', () => {
    const cmd: ComandoObterConfig = { tipo: 'CMD_OBTER_CONFIG' };
    const bytes = codificarComando(cmd);
    expect(bytes).toHaveLength(8);
    expect(bytes[3]).toBe(0x12);
  });
});

describe('codificarComando — ComandoDefinirParam', () => {
  it('UT-1.3.6 — tamanho 18 bytes e paramId correto', () => {
    const cmd: ComandoDefinirParam = {
      tipo: 'CMD_DEFINIR_PARAM',
      paramId: PARAM_FATOR_CONV,
      valorF: 2.05,
      valorI: 0,
    };
    const bytes = codificarComando(cmd);
    expect(bytes).toHaveLength(18);
    expect(bytes[4]).toBe(PARAM_FATOR_CONV);
    const dv = new DataView(bytes.buffer);
    expect(dv.getFloat32(8, true)).toBeCloseTo(2.05, 4);
  });
});

// ─── Tamanho mínimo para tipos conhecidos ───────────────────────────────────

describe('decodificar — validação de buffer curto por tipo', () => {
  it('TIPO_DADOS buffer com apenas 4 bytes (header) → erro buffer curto', () => {
    const buf = new Uint8Array(4);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, 0xa1b2, true);
    dv.setUint8(2, 0x02);
    dv.setUint8(3, 0x01); // TIPO_DADOS
    expect(() => decodificar(buf)).toThrow(/curto/i);
  });
});
