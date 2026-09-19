import { describe, it, expect } from 'vitest';
import { textoDuracao } from '../../src/interface/TelaMedicao.js';

describe('textoDuracao', () => {
  it('segundos, minutos e horas', () => {
    expect(textoDuracao(12_400)).toBe('12 s');
    expect(textoDuracao(125_000)).toBe('2 min 05 s');
    expect(textoDuracao(3_780_000)).toBe('1 h 03 min');
  });
});
