import { describe, it, expect } from 'vitest';
import { htmlPainelFiltros } from '../../src/interface/filtrosPainel.js';

describe('htmlPainelFiltros', () => {
  const html = htmlPainelFiltros();

  it('zona morta usa passo fino de 0.001 N', () => {
    const m = html.match(/id="in-zona-morta"[^>]*step="([^"]+)"/);
    expect(m?.[1]).toBe('0.001');
  });

  it('mantém os controles principais de processamento', () => {
    for (const id of ['in-zona-morta', 'in-media-movel', 'in-notch-freq', 'in-mediana-jan', 'in-kalman-q', 'in-kalman-r']) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});

import { RADIOS_FILTRO_PRINCIPAL, filtroPrincipalDe, patchFiltroPrincipal } from '../../src/interface/filtrosPainel.js';

describe('filtro principal no painel (Fase 2)', () => {
  const html = htmlPainelFiltros();

  it('os suavizadores são um grupo de radio com "nenhum" marcado por padrão', () => {
    for (const r of RADIOS_FILTRO_PRINCIPAL) {
      expect(html).toMatch(new RegExp(`<input type="radio" name="filtro-principal" id="${r.id}" value="${r.valor}"`));
    }
    expect(html).toMatch(/id="rd-fp-nenhum" value="nenhum" checked/);
    expect(html).not.toContain('id="ck-ema"');
  });

  it('filtroPrincipalDe entende o campo novo e as flags de gateways antigos', () => {
    expect(filtroPrincipalDe({ filtroPrincipal: 'ema', ativoKalman: true })).toBe('ema');
    expect(filtroPrincipalDe({ ativoSG: true })).toBe('savitzkyGolay');
    expect(filtroPrincipalDe({ ativoMediaMovel: true, ativoEMA: true })).toBe('ema');
    expect(filtroPrincipalDe({})).toBe('nenhum');
  });

  it('patchFiltroPrincipal manda o campo novo e as flags exclusivas', () => {
    expect(patchFiltroPrincipal('kalman')).toEqual({ filtroPrincipal: 'kalman', ativoMediaMovel: false, ativoEMA: false, ativoSG: false, ativoKalman: true });
    expect(patchFiltroPrincipal('nenhum')).toEqual({ filtroPrincipal: 'nenhum', ativoMediaMovel: false, ativoEMA: false, ativoSG: false, ativoKalman: false });
  });
});

import { janelaImpar } from '../../src/interface/TelaMedicao.js';

describe('Hampel no painel (Fase 4)', () => {
  it('tem checkbox, janela e K', () => {
    const html = htmlPainelFiltros();
    expect(html).toContain('id="ck-hampel"');
    expect(html).toMatch(/id="in-hampel-jan"[^>]*step="2"/);
    expect(html).toContain('id="in-hampel-k"');
  });
  it('janelaImpar força ímpar ≥ 3', () => {
    expect(janelaImpar(7)).toBe(7);
    expect(janelaImpar(8)).toBe(9);
    expect(janelaImpar(1)).toBe(3);
    expect(janelaImpar(6.4)).toBe(7);
  });
});
