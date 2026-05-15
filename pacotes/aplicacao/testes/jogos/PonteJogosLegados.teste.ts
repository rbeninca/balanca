import { describe, it, expect, vi, afterEach } from 'vitest';
import { PonteJogosLegados } from '../../src/jogos/PonteJogosLegados.js';

class CustomEventSimulacro extends Event {
  detail: object;

  constructor(type: string, init: { detail: object }) {
    super(type);
    this.detail = init.detail;
  }
}

describe('PonteJogosLegados', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publica leituras em window.sharedState e dispara evento compatível com a v1', () => {
    vi.stubGlobal('CustomEvent', CustomEventSimulacro);

    const janela: any = {};
    const dispatchEvent = vi.fn();
    const ponte = new PonteJogosLegados(janela, { dispatchEvent });

    ponte.atualizarLeitura({ forcaNewton: 12.5, marcaTemporal: 250 });

    expect(janela.sharedState?.forcaAtual).toBe(12.5);
    expect(janela.sharedState?.ultimaLeituraMs).toBe(250);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0]?.[0] as Event).type).toBe('forca-atualizada');
  });

  it('usa a configuração recebida para calcular alerta de sobrecarga', () => {
    const janela: any = {};
    const ponte = new PonteJogosLegados(janela);

    ponte.atualizarConfiguracao({ capacidadeMaxGramas: 1000 });
    ponte.atualizarLeitura({ forcaNewton: 9.7, marcaTemporal: 10 });

    expect(janela.sharedState?.overloadAlert.active).toBe(true);
    expect(janela.sharedState?.overloadAlert.percent).toBeGreaterThan(90);
  });

  it('limparLeitura zera o valor compartilhado sem apagar o estado da ponte', () => {
    const janela: any = {};
    const ponte = new PonteJogosLegados(janela);

    ponte.atualizarConexao({ conectado: true, endereco: 'WebSerial', transporte: 'webserial' });
    ponte.atualizarLeitura({ forcaNewton: 7.4, marcaTemporal: 15 });
    ponte.limparLeitura();

    expect(janela.sharedState?.forcaAtual).toBe(0);
    expect(janela.sharedState?.conectado).toBe(true);
  });
});
