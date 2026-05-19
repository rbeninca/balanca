import { describe, it, expect } from 'vitest';
import { CalculadorMetricasBarra } from '../../src/analise/CalculadorMetricasBarra.js';
import type { EstadoMovimento } from '../../src/analise/EstimadorMovimentoBarra.js';
import type { Repeticao } from '../../src/analise/DetectorRepeticaoBarra.js';

const PESO = 785;

function estadoPadrao(forcaN = PESO): EstadoMovimento {
  return { posicaoM: 0, velocidadeMs: 0, aceleracaoMs2: 0, fase: 'PARADO', forcaRelativa: forcaN / PESO, forcaN };
}

function repFake(trabalhoJ: number, durSubidaMs: number, potPico: number): Repeticao {
  return {
    indice: 1, duracaoSubidaMs: durSubidaMs, duracaoDescidaMs: 500,
    posicaoPicoM: 0.5, trabalhoJ, potenciaMediaW: trabalhoJ / (durSubidaMs / 1000),
    potenciaPicoW: potPico, velocidadePicoMs: 0.5, descidaRapida: false,
  };
}

describe('CalculadorMetricasBarra', () => {
  it('UT-2.10.1 — kcalMecanica = trabalhoTotalJ / 4184', () => {
    const calc = new CalculadorMetricasBarra();
    const rep  = repFake(418.4, 1000, 500);
    const m    = calc.processar(estadoPadrao(), 0, rep, PESO);
    expect(m.kcalMecanica).toBeCloseTo(418.4 / 4184, 5);
  });

  it('UT-2.10.2 — kcalMetabolica = kcalMecanica / 0.25', () => {
    const calc = new CalculadorMetricasBarra();
    const rep  = repFake(1000, 1000, 1000);
    const m    = calc.processar(estadoPadrao(), 0, rep, PESO);
    expect(m.kcalMetabolica).toBeCloseTo(m.kcalMecanica / 0.25, 5);
  });

  it('UT-2.10.3 — tempoSobTensaoMs acumula quando F > pesoRef', () => {
    const calc  = new CalculadorMetricasBarra();
    const fAlta = estadoPadrao(PESO + 50);
    calc.processar(fAlta, 0, null, PESO);
    calc.processar(fAlta, 100, null, PESO);
    calc.processar(fAlta, 200, null, PESO);
    const m = calc.processar(fAlta, 300, null, PESO);
    expect(m.tempoSobTensaoMs).toBeCloseTo(300, 0);
  });

  it('UT-2.10.4 — tempoSobTensaoMs não acumula quando F = pesoRef', () => {
    const calc = new CalculadorMetricasBarra();
    for (let t = 0; t <= 500; t += 100) {
      calc.processar(estadoPadrao(PESO), t, null, PESO);
    }
    const m = calc.processar(estadoPadrao(PESO), 600, null, PESO);
    expect(m.tempoSobTensaoMs).toBe(0);
  });

  it('UT-2.10.5 — múltiplas reps acumulam trabalho corretamente', () => {
    const calc = new CalculadorMetricasBarra();
    calc.processar(estadoPadrao(), 0,    repFake(300, 1000, 400), PESO);
    calc.processar(estadoPadrao(), 1000, repFake(350, 1000, 450), PESO);
    const m = calc.processar(estadoPadrao(), 2000, null, PESO);
    expect(m.trabalhoTotalJ).toBeCloseTo(650, 5);
    expect(m.repsTotal).toBe(2);
  });

  it('UT-2.10.6 — potenciaPicoW é o maior pico entre todas as reps', () => {
    const calc = new CalculadorMetricasBarra();
    calc.processar(estadoPadrao(), 0, repFake(300, 1000, 200), PESO);
    calc.processar(estadoPadrao(), 0, repFake(300, 1000, 500), PESO);
    const m = calc.processar(estadoPadrao(), 0, repFake(300, 1000, 300), PESO);
    expect(m.potenciaPicoW).toBe(500);
  });

  it('UT-2.10.7 — reiniciar() zera todas as métricas', () => {
    const calc = new CalculadorMetricasBarra();
    calc.processar(estadoPadrao(PESO + 10), 0,    repFake(500, 1000, 600), PESO);
    calc.processar(estadoPadrao(PESO + 10), 1000, null, PESO);
    calc.reiniciar();
    const m = calc.processar(estadoPadrao(), 0, null, PESO);
    expect(m.trabalhoTotalJ).toBe(0);
    expect(m.tempoSobTensaoMs).toBe(0);
    expect(m.repsTotal).toBe(0);
  });
});
