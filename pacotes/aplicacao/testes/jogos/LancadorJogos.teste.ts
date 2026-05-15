import { describe, it, expect, vi } from 'vitest';
import { obterJogoPorId } from '../../src/jogos/CatalogoJogos.js';
import { abrirJogo, resolverUrlJogo } from '../../src/jogos/LancadorJogos.js';

describe('LancadorJogos', () => {
  it('resolve URLs respeitando o BASE_URL da aplicação', () => {
    const jogo = obterJogoPorId('soco-do-seculo');
    expect(jogo).toBeDefined();
    expect(resolverUrlJogo(jogo!, '/balancaGFIG2/')).toBe('/balancaGFIG2/legado/jogos/01-soco-do-seculo.html');
  });

  it('abre popup com alvo estável por id do jogo', () => {
    const jogo = obterJogoPorId('reacao-em-cadeia');
    const abrir = vi.fn().mockReturnValue({} as Window);

    abrirJogo(jogo!, { baseUrl: '/app/', openFn: abrir });

    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir.mock.calls[0]?.[0]).toBe('/app/legado/jogos/08-reacao-cadeia.html');
    expect(abrir.mock.calls[0]?.[1]).toBe('balancagfig-jogo-reacao-em-cadeia');
    expect(abrir.mock.calls[0]?.[2]).toContain('width=1366');
  });

  it('não tenta resolver popup para módulo nativo sem arquivo público', () => {
    const jogo = obterJogoPorId('martelo-thor');
    expect(jogo).toBeDefined();
    expect(() => resolverUrlJogo(jogo!, '/app/')).toThrow(/não possui arquivo público/i);
    expect(abrirJogo(jogo!, { baseUrl: '/app/' })).toBeNull();
  });
});
