import { describe, it, expect } from 'vitest';
import { ZeroTracking } from '../../src/filtros/ZeroTracking.js';

const cfg = { limiarN: 0.05, tempoEstavelMs: 3000, alpha: 0.01 };
const dt = 12.5;   // 80 Hz

describe('ZeroTracking (Fase 8)', () => {
  it('deriva lenta sem carga é compensada: a saída volta para perto de zero', () => {
    const z = new ZeroTracking(cfg);
    let saida = 0;
    for (let i = 0; i < 4000; i++) {                 // 50 s
      const deriva = 0.03 * (i / 4000);              // sobe até 0,03 N
      saida = z.aplicar(deriva, i * dt);
    }
    expect(z.obterOffset()).toBeGreaterThan(0.02);
    expect(Math.abs(saida)).toBeLessThan(0.005);     // muito menor que a deriva de 0,03
  });

  it('não corrige antes do tempo estável', () => {
    const z = new ZeroTracking(cfg);
    for (let i = 0; i < 200; i++) z.aplicar(0.02, i * dt);   // 2,5 s < 3 s
    expect(z.obterOffset()).toBe(0);
    for (let i = 200; i < 260; i++) z.aplicar(0.02, i * dt); // passou de 3 s
    expect(z.obterOffset()).toBeGreaterThan(0);
  });

  it('força real constante acima do limiar não é "zerada"', () => {
    const z = new ZeroTracking(cfg);
    let saida = 0;
    for (let i = 0; i < 4000; i++) saida = z.aplicar(0.5, i * dt);
    expect(z.obterOffset()).toBe(0);
    expect(saida).toBe(0.5);
  });

  it('evento transitório interrompe e reinicia a contagem; bloqueio (evento/gravação) impede correção', () => {
    const z = new ZeroTracking(cfg);
    for (let i = 0; i < 300; i++) z.aplicar(0.02, i * dt);            // 3,75 s em repouso: corrigindo
    const antes = z.obterOffset();
    expect(antes).toBeGreaterThan(0);
    z.aplicar(5, 300 * dt);                                             // transitório
    for (let i = 301; i < 500; i++) z.aplicar(0.02, i * dt);           // 2,5 s de repouso: ainda contando
    expect(z.obterOffset()).toBe(antes);

    const b = new ZeroTracking(cfg);
    for (let i = 0; i < 1000; i++) b.aplicar(0.02, i * dt, true);      // bloqueado o tempo todo
    expect(b.obterOffset()).toBe(0);
  });

  it('variação rápida dentro da zona de repouso não conta como repouso', () => {
    const z = new ZeroTracking({ ...cfg, variacaoMaxN: 0.01 });
    for (let i = 0; i < 1000; i++) z.aplicar(i % 2 === 0 ? 0.04 : -0.04, i * dt);   // salta 0,08 a cada amostra
    expect(z.obterOffset()).toBe(0);
  });

  it('a correção não ultrapassa: converge para o valor de repouso, sem oscilar', () => {
    const z = new ZeroTracking({ ...cfg, alpha: 0.05, tempoEstavelMs: 0 });
    for (let i = 0; i < 2000; i++) z.aplicar(0.03, i * dt);
    expect(z.obterOffset()).toBeCloseTo(0.03, 6);
  });

  it('reiniciar zera o offset; parâmetros são saneados', () => {
    const z = new ZeroTracking({ limiarN: -1, tempoEstavelMs: -5, alpha: 7 });
    expect(z.config).toEqual({ limiarN: 0, tempoEstavelMs: 0, alpha: 1, variacaoMaxN: -0.5 });
    const w = new ZeroTracking({ ...cfg, tempoEstavelMs: 0 });
    for (let i = 0; i < 100; i++) w.aplicar(0.02, i * dt);
    expect(w.obterOffset()).toBeGreaterThan(0);
    w.reiniciar();
    expect(w.obterOffset()).toBe(0);
  });
});
