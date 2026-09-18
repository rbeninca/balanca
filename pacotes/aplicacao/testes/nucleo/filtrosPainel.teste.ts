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
