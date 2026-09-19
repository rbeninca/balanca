import { describe, it, expect, vi } from 'vitest';
import { criarIndicador, MENSAGEM_PADRAO, type RenderizadorIndicador } from '../../src/interface/indicadorCarregando.js';

function montar(atraso = 150) {
  const render: RenderizadorIndicador = { mostrar: vi.fn(), esconder: vi.fn() };
  vi.useFakeTimers();
  const ind = criarIndicador(render, atraso);
  return { render, ind };
}

describe('indicador de carregamento', () => {
  it('só aparece se a operação passar do atraso', () => {
    const { render, ind } = montar(150);
    const concluir = ind.iniciar('Baixando…');
    vi.advanceTimersByTime(100);
    expect(render.mostrar).not.toHaveBeenCalled();
    concluir();
    vi.advanceTimersByTime(200);
    expect(render.mostrar).not.toHaveBeenCalled();
    expect(render.esconder).not.toHaveBeenCalled();
    expect(ind.ativo()).toBe(false);
  });

  it('mostra a mensagem após o atraso e esconde ao concluir', () => {
    const { render, ind } = montar(150);
    const concluir = ind.iniciar('Carregando sessões…');
    vi.advanceTimersByTime(150);
    expect(render.mostrar).toHaveBeenCalledWith('Carregando sessões…');
    concluir();
    expect(render.esconder).toHaveBeenCalledTimes(1);
  });

  it('usa a mensagem padrão quando não informada', () => {
    const { render, ind } = montar(0);
    ind.iniciar();
    vi.advanceTimersByTime(0);
    expect(render.mostrar).toHaveBeenCalledWith(MENSAGEM_PADRAO);
  });

  it('com várias operações, fica visível até a última terminar e mostra a mais recente', () => {
    const { render, ind } = montar(0);
    const a = ind.iniciar('A…');
    vi.advanceTimersByTime(0);
    const b = ind.iniciar('B…');
    expect(render.mostrar).toHaveBeenLastCalledWith('B…');
    a();
    expect(render.esconder).not.toHaveBeenCalled();
    expect(ind.ativo()).toBe(true);
    b();
    expect(render.esconder).toHaveBeenCalledTimes(1);
    expect(ind.ativo()).toBe(false);
  });

  it('concluir é idempotente', () => {
    const { render, ind } = montar(0);
    const a = ind.iniciar('A…');
    const b = ind.iniciar('B…');
    vi.advanceTimersByTime(0);
    a(); a(); a();
    expect(render.esconder).not.toHaveBeenCalled();
    b();
    expect(render.esconder).toHaveBeenCalledTimes(1);
  });

  it('envolver devolve o resultado e esconde mesmo com erro', async () => {
    const { render, ind } = montar(0);
    const valor = await ind.envolver('X…', async () => { vi.advanceTimersByTime(0); return 42; });
    expect(valor).toBe(42);
    expect(render.esconder).toHaveBeenCalledTimes(1);

    await expect(ind.envolver('Y…', async () => { throw new Error('falhou'); })).rejects.toThrow('falhou');
    expect(ind.ativo()).toBe(false);
  });
});
