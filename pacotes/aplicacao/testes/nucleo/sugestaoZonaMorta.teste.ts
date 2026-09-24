import { describe, it, expect } from 'vitest';
import { sugerirZonaMortaN, GRAVIDADE_PADRAO } from '../../src/nucleo/sugestaoZonaMorta.js';

describe('sugerirZonaMortaN', () => {
  it('calcula acuracia × fundo de escala em N (célula de 1 kg, 0,003%)', () => {
    // FE = 1 kg × 9,80665 = 9,80665 N ; × 3e-5 ≈ 2,94e-4 N
    const zm = sugerirZonaMortaN({ capacidadeMaxGramas: 1000, acuracia: 3e-5, gravidade: GRAVIDADE_PADRAO });
    expect(zm).toBeCloseTo(9.80665 * 3e-5, 9);
  });

  it('célula de 5 kg a 0,03% dá ~0,0147 N', () => {
    const zm = sugerirZonaMortaN({ capacidadeMaxGramas: 5000, acuracia: 3e-4 })!;
    expect(zm).toBeCloseTo(5 * GRAVIDADE_PADRAO * 3e-4, 9);
    expect(zm).toBeGreaterThan(0.014);
    expect(zm).toBeLessThan(0.015);
  });

  it('usa a gravidade padrão quando não informada', () => {
    const zm = sugerirZonaMortaN({ capacidadeMaxGramas: 2000, acuracia: 1e-3 });
    expect(zm).toBeCloseTo((2000 / 1000) * GRAVIDADE_PADRAO * 1e-3, 9);
  });

  it('aplica o fator k', () => {
    const base = sugerirZonaMortaN({ capacidadeMaxGramas: 1000, acuracia: 1e-3 })!;
    expect(sugerirZonaMortaN({ capacidadeMaxGramas: 1000, acuracia: 1e-3 }, 3)).toBeCloseTo(base * 3, 9);
  });

  it('devolve null sem capacidade ou acurácia válidas', () => {
    expect(sugerirZonaMortaN({ acuracia: 1e-3 })).toBeNull();
    expect(sugerirZonaMortaN({ capacidadeMaxGramas: 1000 })).toBeNull();
    expect(sugerirZonaMortaN({ capacidadeMaxGramas: 0, acuracia: 1e-3 })).toBeNull();
    expect(sugerirZonaMortaN({ capacidadeMaxGramas: 1000, acuracia: 0 })).toBeNull();
  });
});

import { sugerirLimiaresDetector } from '../../src/nucleo/sugestaoZonaMorta.js';

describe('sugerirLimiaresDetector (Fase 7)', () => {
  it('início 4× e fim 2× o piso de ruído; null sem dados', () => {
    const piso = sugerirZonaMortaN({ capacidadeMaxGramas: 1000, acuracia: 0.0003 })!;
    expect(sugerirLimiaresDetector({ capacidadeMaxGramas: 1000, acuracia: 0.0003 })).toEqual({ limiarEntradaN: piso * 4, limiarSaidaN: piso * 2 });
    expect(sugerirLimiaresDetector({})).toBeNull();
  });
});

import { deveSugerirZonaMorta } from '../../src/nucleo/sugestaoZonaMorta.js';

describe('deveSugerirZonaMorta (preenchimento automático ao conectar)', () => {
  it('vale enquanto o campo está num valor de partida: 0,5 N do gateway e 0,05 N do modo local', () => {
    expect(deveSugerirZonaMorta(0.5, false)).toBe(true);
    expect(deveSugerirZonaMorta(0.05, false)).toBe(true);
  });

  it('não sobrescreve um valor que já não é de partida', () => {
    expect(deveSugerirZonaMorta(0.0147, false)).toBe(false);   // sugestão já aplicada
    expect(deveSugerirZonaMorta(1.2, false)).toBe(false);      // valor configurado no box
  });

  it('não mexe no campo depois que o usuário mexeu nele — nem se ainda estiver no padrão', () => {
    expect(deveSugerirZonaMorta(0.5, true)).toBe(false);
    expect(deveSugerirZonaMorta(0.05, true)).toBe(false);
  });

  it('ignora valor inválido', () => {
    expect(deveSugerirZonaMorta(NaN, false)).toBe(false);
  });
});
