import { describe, it, expect } from 'vitest';
import { CATALOGO_JOGOS, obterJogoPorId } from '../../src/jogos/CatalogoJogos.js';

describe('CatalogoJogos', () => {
  it('expõe um catálogo inicial com Martelo do Thor e os templates legados', () => {
    expect(CATALOGO_JOGOS.length).toBeGreaterThanOrEqual(9);
    expect(obterJogoPorId('martelo-thor')?.modoExecucao).toBe('embutido');
    expect(obterJogoPorId('soco-do-seculo')?.arquivoPublico).toContain('01-soco-do-seculo.html');
  });

  it('mantém ids únicos para uso no launcher e na navegação', () => {
    const ids = CATALOGO_JOGOS.map(jogo => jogo.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
