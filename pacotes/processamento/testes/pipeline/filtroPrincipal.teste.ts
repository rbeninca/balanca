import { describe, it, expect } from 'vitest';
import { resolverFiltroPrincipal, flagsDoFiltroPrincipal, ehFiltroPrincipal, FILTROS_PRINCIPAIS } from '../../src/pipeline/filtroPrincipal.js';

describe('resolverFiltroPrincipal (Fase 2)', () => {
  it('campo explícito vence as flags', () => {
    expect(resolverFiltroPrincipal('nenhum', { filtroPrincipal: 'savitzkyGolay', ativoKalman: true })).toBe('savitzkyGolay');
    expect(resolverFiltroPrincipal('ema', { filtroPrincipal: 'nenhum' })).toBe('nenhum');
  });

  it('flag ligada escolhe o filtro; a última na ordem MM → EMA → SG → Kalman vence', () => {
    expect(resolverFiltroPrincipal('nenhum', { ativoEMA: true })).toBe('ema');
    expect(resolverFiltroPrincipal('nenhum', { ativoSG: true, ativoKalman: true })).toBe('kalman');
    expect(resolverFiltroPrincipal('nenhum', { ativoMediaMovel: true, ativoEMA: true })).toBe('ema');
  });

  it('flag desligada só desliga se for o filtro atual', () => {
    expect(resolverFiltroPrincipal('ema', { ativoEMA: false })).toBe('nenhum');
    expect(resolverFiltroPrincipal('ema', { ativoSG: false })).toBe('ema');
    expect(resolverFiltroPrincipal('kalman', { ativoKalman: false, ativoMediaMovel: true })).toBe('mediaMovel');
  });

  it('patch sem nada relevante mantém o atual; valor desconhecido é ignorado', () => {
    expect(resolverFiltroPrincipal('kalman', { limiar: 1 } as never)).toBe('kalman');
    expect(resolverFiltroPrincipal('kalman', { filtroPrincipal: 'butterworth' as never })).toBe('kalman');
  });

  it('flags derivadas são exclusivas', () => {
    for (const tipo of FILTROS_PRINCIPAIS) {
      const f = flagsDoFiltroPrincipal(tipo);
      const ligadas = Object.values(f).filter(Boolean).length;
      expect(ligadas).toBe(tipo === 'nenhum' ? 0 : 1);
      expect(resolverFiltroPrincipal('nenhum', f)).toBe(tipo);   // ida e volta
    }
    expect(ehFiltroPrincipal('ema')).toBe(true);
    expect(ehFiltroPrincipal('hampel')).toBe(false);
  });
});
