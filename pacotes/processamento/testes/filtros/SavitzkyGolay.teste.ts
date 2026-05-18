import { describe, it, expect } from 'vitest';
import { SavitzkyGolay } from '../../src/filtros/SavitzkyGolay.js';

describe('SavitzkyGolay', () => {
  it('UT-2.11.1 — sinal constante é preservado exatamente após aquecimento', () => {
    const sg = new SavitzkyGolay(5);
    let saida = 0;
    for (let i = 0; i < 5; i++) saida = sg.aplicar(10);
    expect(saida).toBeCloseTo(10);
  });

  it('UT-2.11.2 — reta preservada: y = x deve sair inalterada em regime', () => {
    const sg = new SavitzkyGolay(5);
    // Alimenta 5 amostras de reta: 1,2,3,4,5 → ponto central 3 deve sair ≈3
    sg.aplicar(1); sg.aplicar(2); sg.aplicar(3); sg.aplicar(4);
    const r = sg.aplicar(5);
    // Saída do filtro no ponto central de [1,2,3,4,5] com coefs [-3,12,17,12,-3]/35:
    // (-3*1 + 12*2 + 17*3 + 12*4 - 3*5) / 35 = (-3+24+51+48-15)/35 = 105/35 = 3
    expect(r).toBeCloseTo(3, 3);
  });

  it('UT-2.11.3 — coeficientes somam 1: sinal constante não é amplificado', () => {
    const sg = new SavitzkyGolay(7);
    let saida = 0;
    for (let i = 0; i < 7; i++) saida = sg.aplicar(42);
    expect(saida).toBeCloseTo(42, 5);
  });

  it('UT-2.11.4 — aquecimento retorna média das amostras disponíveis', () => {
    const sg = new SavitzkyGolay(5);
    expect(sg.aplicar(10)).toBeCloseTo(10);      // [10]       → 10
    expect(sg.aplicar(20)).toBeCloseTo(15);      // [10,20]    → 15
    expect(sg.aplicar(30)).toBeCloseTo(20);      // [10,20,30] → 20
  });

  it('UT-2.11.5 — janela não suportada: ajusta para a janela mais próxima sem erro', () => {
    expect(() => new SavitzkyGolay(6)).not.toThrow();
    expect(() => new SavitzkyGolay(3)).not.toThrow();
  });

  it('UT-2.11.6 — janela 9 preserva sinal constante', () => {
    const sg = new SavitzkyGolay(9);
    let saida = 0;
    for (let i = 0; i < 9; i++) saida = sg.aplicar(55);
    expect(saida).toBeCloseTo(55, 4);
  });

  it('UT-2.11.7 — reiniciar() zera buffer: aquecimento recomeça', () => {
    const sg = new SavitzkyGolay(5);
    for (let i = 0; i < 5; i++) sg.aplicar(100);
    sg.reiniciar();
    expect(sg.aplicar(7)).toBeCloseTo(7);
  });

  it('UT-2.11.8 — janela 11 preserva sinal constante', () => {
    const sg = new SavitzkyGolay(11);
    let saida = 0;
    for (let i = 0; i < 11; i++) saida = sg.aplicar(33);
    expect(saida).toBeCloseTo(33, 4);
  });
});
