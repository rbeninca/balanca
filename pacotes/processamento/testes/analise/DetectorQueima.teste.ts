import { describe, it, expect } from 'vitest';
import { DetectorQueima } from '../../src/analise/DetectorQueima.js';

describe('DetectorQueima', () => {
  it('UT-2.5.1 — ignição simples: de falso para verdadeiro', () => {
    const d = new DetectorQueima(1.0, 100);
    expect(d.atualizar(0, 0)).toBe(false);
    expect(d.atualizar(5, 100)).toBe(true);
  });

  it('UT-2.5.2 — burnout após histerese: só termina após ≥ 100ms abaixo', () => {
    const d = new DetectorQueima(1.0, 100);
    d.atualizar(5, 0);     // em queima
    expect(d.atualizar(0, 100)).toBe(true);   // 0ms abaixo ainda (acabou de zerar)
    expect(d.atualizar(0, 200)).toBe(false);  // 100ms abaixo → REPOUSO
  });

  it('UT-2.5.3 — spike passageiro não encerra a queima', () => {
    const d = new DetectorQueima(1.0, 100);
    d.atualizar(5, 0);
    expect(d.atualizar(0, 50)).toBe(true);    // apenas 50ms abaixo
    expect(d.atualizar(5, 60)).toBe(true);    // voltou acima → reseta timer
  });

  it('UT-2.5.4 — nunca ultrapassa limiar → falso sempre', () => {
    const d = new DetectorQueima(1.0, 100);
    for (let t = 0; t < 1000; t += 10) {
      expect(d.atualizar(0.1, t)).toBe(false);
    }
  });

  it('UT-2.5.5 — reiniciar() volta para REPOUSO', () => {
    const d = new DetectorQueima(1.0, 100);
    d.atualizar(5, 0);
    d.reiniciar();
    expect(d.atualizar(5, 200)).toBe(true);   // nova ignição após reinício
    d.reiniciar();
    expect(d.atualizar(0, 300)).toBe(false);
  });

  it('UT-2.5.6 — histerese configurável: 200ms', () => {
    const d = new DetectorQueima(1.0, 200);
    d.atualizar(5, 0);
    d.atualizar(0, 100);    // timer começa em t=100
    expect(d.atualizar(0, 150)).toBe(true);   // 50ms abaixo — insuficiente
    expect(d.atualizar(0, 299)).toBe(true);   // 199ms abaixo — ainda insuficiente
    expect(d.atualizar(0, 300)).toBe(false);  // 200ms abaixo → REPOUSO
  });
});
