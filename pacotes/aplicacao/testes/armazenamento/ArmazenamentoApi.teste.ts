import { describe, it, expect } from 'vitest';
import { analisarJson } from '../../src/armazenamento/ArmazenamentoApi.js';

describe('ArmazenamentoApi.analisarJson (Fase 10)', () => {
  it('objeto JSON vira objeto; nulo, inválido ou não-objeto viram null', () => {
    expect(analisarJson('{"a":1}')).toEqual({ a: 1 });
    expect(analisarJson(null)).toBeNull();
    expect(analisarJson(undefined)).toBeNull();
    expect(analisarJson('{lixo')).toBeNull();
    expect(analisarJson('[1,2]')).toBeNull();
    expect(analisarJson('"texto"')).toBeNull();
  });
});
