import { describe, it, expect } from 'vitest';
import { FiltroHampel } from '../../src/filtros/FiltroHampel.js';

const passar = (f: FiltroHampel, xs: number[]) => xs.map(x => f.aplicarDetalhado(x));

describe('FiltroHampel (Fase 4)', () => {
  it('outlier isolado: 5000 no meio de ~100 é substituído pela mediana e marcado', () => {
    const f = new FiltroHampel(7, 3);
    const r = passar(f, [100, 101, 99, 100, 5000, 101, 100]);
    expect(r[4]!.outlier).toBe(true);
    expect(r[4]!.valor).toBeCloseTo(100, 6);           // mediana de [100,101,99,100,5000]
    expect(r.filter(x => x.outlier)).toHaveLength(1);
    expect(r[5]!.valor).toBe(101);                     // a amostra seguinte passa (o 5000 na janela não contamina)
  });

  it('mudança sustentada (100 → 200) atravessa depois de ⌈N/2⌉ amostras, nunca é apagada', () => {
    const f = new FiltroHampel(7, 3);
    const r = passar(f, [100, 100, 100, 100, 100, 100, 100, 200, 200, 200, 200, 200, 200, 200]);
    const saida = r.map(x => x.valor);
    // as primeiras amostras do degrau são "corrigidas" para 100 (ainda minoria na janela)…
    expect(saida[7]).toBe(100);
    // …e, com 4 de 7 na janela, a mediana vira 200 e o degrau passa
    expect(saida[10]).toBe(200);
    expect(saida.slice(11)).toEqual([200, 200, 200]);
    const atraso = saida.findIndex((v, i) => i >= 7 && v === 200) - 7;
    expect(atraso).toBeLessThanOrEqual((7 + 1) / 2);
  });

  it('MAD = 0 (sinal constante/quantizado): o piso em σ evita que qualquer desvio vire outlier', () => {
    const f = new FiltroHampel(5, 3, 1e-3);
    passar(f, [1, 1, 1, 1, 1]);
    expect(f.aplicarDetalhado(1.002)).toEqual({ valor: 1.002, outlier: false });   // 0,002 < 3·0,001
    expect(f.aplicarDetalhado(1.5).outlier).toBe(true);                             // 0,5 ≫ 3·0,001
  });

  it('sem piso, MAD = 0 engoliria um degrau real para sempre (o que o piso corrige)', () => {
    const semPiso = new FiltroHampel(5, 3, 0);
    passar(semPiso, [1, 1, 1, 1, 1]);
    const r = passar(semPiso, [2, 2, 2, 2, 2, 2]);
    expect(r[r.length - 1]!.valor).toBe(2);   // mesmo sem piso, a janela acaba virando: não é "para sempre"…
    // …mas o primeiro 2 é outlier (MAD 0) — com piso adequado ao sinal isso também seria; o piso importa
    // para ruído da ordem da resolução, testado acima.
    expect(r[0]!.outlier).toBe(true);
  });

  it('aquecimento: com menos de 3 amostras passa direto', () => {
    const f = new FiltroHampel(7);
    expect(f.aplicarDetalhado(50)).toEqual({ valor: 50, outlier: false });
    expect(f.aplicarDetalhado(5000)).toEqual({ valor: 5000, outlier: false });
  });

  it('ruído gaussiano moderado passa quase intocado; spike isolado não', () => {
    const f = new FiltroHampel(7, 3, 1e-3);
    let semente = 7;
    const rand = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff - 0.5; };
    let outliers = 0;
    for (let i = 0; i < 500; i++) if (f.aplicarDetalhado(10 + 0.1 * rand()).outlier) outliers++;
    // Janela curta (7) estima o MAD com ruído: alguns falsos positivos são esperados
    // (K = 3), e o "erro" é trocar a amostra pela mediana — inofensivo no ruído.
    expect(outliers).toBeLessThan(40);                  // < 8 %
    expect(f.aplicarDetalhado(10 + 50).outlier).toBe(true);
  });

  it('senoide com ruído realista não é tratada como outlier', () => {
    const f = new FiltroHampel(7, 3, 1e-3);
    let semente = 3;
    const rand = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff - 0.5; };
    let outliers = 0;
    for (let i = 0; i < 400; i++) if (f.aplicarDetalhado(5 * Math.sin(2 * Math.PI * i / 80) + 0.05 * rand()).outlier) outliers++;
    expect(outliers).toBeLessThan(25);   // ~4 %: mesma taxa de falsos positivos do ruído puro (janela 7, K = 3)
  });

  it('senoide perfeitamente lisa: a curvatura logo após o pico pode disparar com K = 3 (documentado)', () => {
    // Após o pico a janela se concentra no topo (MAD pequeno) e a amostra nova é a mais
    // distante — caso limite conhecido do Hampel causal em janela curta. K = 3,5 resolve.
    const k3 = new FiltroHampel(7, 3, 1e-3);
    const k35 = new FiltroHampel(7, 3.5, 1e-3);
    let o3 = 0, o35 = 0;
    for (let i = 0; i < 400; i++) {
      const x = 5 * Math.sin(2 * Math.PI * i / 80);
      if (k3.aplicarDetalhado(x).outlier) o3++;
      if (k35.aplicarDetalhado(x).outlier) o35++;
    }
    expect(o3).toBeLessThanOrEqual(10);   // 1 por pico
    expect(o35).toBe(0);
  });

  it('janela inválida é recusada; reiniciar limpa', () => {
    expect(() => new FiltroHampel(4)).toThrow();
    expect(() => new FiltroHampel(1)).toThrow();
    const f = new FiltroHampel(5);
    passar(f, [1, 1, 1, 1, 1]);
    f.reiniciar();
    expect(f.aplicarDetalhado(100).outlier).toBe(false);   // aquecendo de novo
  });
});
