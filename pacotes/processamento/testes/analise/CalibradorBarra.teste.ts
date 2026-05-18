import { describe, it, expect } from 'vitest';
import { CalibradorBarra } from '../../src/analise/CalibradorBarra.js';

const TAX = 100; // Hz
const PESO_REF = 785; // N (~80 kg)

function alimentar(cal: CalibradorBarra, forcaN: number, amostras: number) {
  let ultimo = { calibrado: false, pesoRef: 0, massaEst: 0, progresso: 0 };
  for (let i = 0; i < amostras; i++) ultimo = cal.processar(forcaN);
  return ultimo;
}

describe('CalibradorBarra', () => {
  it('UT-2.7.1 — retorna não-calibrado com poucas amostras', () => {
    const cal = new CalibradorBarra(TAX);
    const res = alimentar(cal, PESO_REF, TAX * 2); // 2 s (precisa de 3 s)
    expect(res.calibrado).toBe(false);
    expect(res.progresso).toBeCloseTo(2 / 3, 1);
  });

  it('UT-2.7.2 — retorna não-calibrado com sinal instável (alta variância)', () => {
    const cal = new CalibradorBarra(TAX);
    // Alterna força para gerar variância alta
    for (let i = 0; i < TAX * 4; i++) {
      const f = i % 2 === 0 ? PESO_REF - 30 : PESO_REF + 30;
      cal.processar(f);
    }
    expect(cal.calibrado).toBe(false);
  });

  it('UT-2.7.3 — calibra após janela estável com sinal constante', () => {
    const cal = new CalibradorBarra(TAX);
    const res = alimentar(cal, PESO_REF, TAX * 3 + 1);
    expect(res.calibrado).toBe(true);
    expect(res.pesoRef).toBeCloseTo(PESO_REF, 4);
  });

  it('UT-2.7.4 — massaEst = pesoRef / 9.81', () => {
    const cal = new CalibradorBarra(TAX);
    const res = alimentar(cal, PESO_REF, TAX * 4);
    expect(res.calibrado).toBe(true);
    expect(res.massaEst).toBeCloseTo(PESO_REF / 9.81, 5);
  });

  it('UT-2.7.5 — reiniciar() recomeça do zero', () => {
    const cal = new CalibradorBarra(TAX);
    alimentar(cal, PESO_REF, TAX * 4);
    expect(cal.calibrado).toBe(true);
    cal.reiniciar();
    expect(cal.calibrado).toBe(false);
    expect(cal.pesoRef).toBe(0);
    const res = cal.processar(PESO_REF);
    expect(res.calibrado).toBe(false);
  });

  it('UT-2.7.6 — progresso cresce monotonicamente durante estabilização', () => {
    const cal = new CalibradorBarra(TAX);
    let anterior = -1;
    for (let i = 0; i < TAX * 3; i++) {
      const res = cal.processar(PESO_REF);
      expect(res.progresso).toBeGreaterThanOrEqual(anterior);
      anterior = res.progresso;
    }
  });

  it('UT-2.7.7 — força abaixo do mínimo reseta a janela', () => {
    const cal = new CalibradorBarra(TAX);
    // Alimenta 2.5 s de sinal bom
    alimentar(cal, PESO_REF, TAX * 2.5);
    // Força fora da faixa — reseta
    cal.processar(10);
    // Progresso deve voltar a zero
    const res = cal.processar(PESO_REF);
    expect(res.progresso).toBeCloseTo(1 / (TAX * 3), 1);
  });

  it('UT-2.7.8 — permanece calibrado após nova amostra', () => {
    const cal = new CalibradorBarra(TAX);
    alimentar(cal, PESO_REF, TAX * 4);
    const res = cal.processar(PESO_REF + 100); // qualquer valor
    expect(res.calibrado).toBe(true);
    expect(res.pesoRef).toBeCloseTo(PESO_REF, 4);
  });
});
