import { describe, it, expect } from 'vitest';
import { calcularCRC16 } from '../src/crc16.js';

describe('calcularCRC16', () => {
  describe('vetores de referência', () => {
    it('UT-1.2.1 — "123456789" → 0x29B1', () => {
      const buf = new Uint8Array([0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39]);
      expect(calcularCRC16(buf)).toBe(0x29b1);
    });

    it('UT-1.2.2 — buffer vazio → 0xFFFF (seed)', () => {
      expect(calcularCRC16(new Uint8Array(0))).toBe(0xffff);
    });

    it('UT-1.2.3 — byte único 0x00', () => {
      const resultado = calcularCRC16(new Uint8Array([0x00]));
      // CRC calculado manualmente: 0xFFFF ^ 0x00<<8 = 0xFF00 → 8 iterações
      // seed=0xFFFF, b=0x00 → índice=(0xFF^0x00)=0xFF → TABELA[0xFF]
      // Tabela[255] = resultado determinístico
      expect(typeof resultado).toBe('number');
      expect(resultado).toBeGreaterThanOrEqual(0);
      expect(resultado).toBeLessThanOrEqual(0xffff);
      // Consistência com Python: crc16_ccitt([0x00]) deve ser 0xE1F0
      expect(resultado).toBe(0xe1f0);
    });

    it('UT-1.2.4 — chamadas múltiplas retornam o mesmo resultado', () => {
      const buf = new Uint8Array([0xA1, 0xB2, 0x02, 0x01]);
      const r1 = calcularCRC16(buf);
      const r2 = calcularCRC16(buf);
      expect(r1).toBe(r2);
    });

    it('UT-1.2.5 — buffer com todos 0xFF', () => {
      const buf = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      const resultado = calcularCRC16(buf);
      expect(typeof resultado).toBe('number');
      expect(resultado).toBeGreaterThanOrEqual(0);
      expect(resultado).toBeLessThanOrEqual(0xffff);
    });
  });

  describe('propriedades do algoritmo', () => {
    it('buffers diferentes produzem CRCs diferentes (colisão improvável)', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([3, 2, 1]);
      expect(calcularCRC16(a)).not.toBe(calcularCRC16(b));
    });

    it('resultado sempre cabe em uint16', () => {
      for (let i = 0; i < 256; i++) {
        const resultado = calcularCRC16(new Uint8Array([i]));
        expect(resultado).toBeGreaterThanOrEqual(0);
        expect(resultado).toBeLessThanOrEqual(0xffff);
      }
    });
  });
});
