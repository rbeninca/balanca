import type { EstadoCompartilhadoJogos } from './tipos.js';

const GRAVIDADE_PADRAO = 9.80665;
const CAPACIDADE_PADRAO_N = (5000 / 1000) * GRAVIDADE_PADRAO;

type JanelaCompartilhada = {
  sharedState?: EstadoCompartilhadoJogos;
};

type DocumentoEventos = {
  dispatchEvent?: (evento: Event) => boolean;
};

function estadoInicial(): EstadoCompartilhadoJogos {
  return {
    conectado: false,
    endereco: null,
    transporte: 'desconhecido',
    unidadeAtual: 'N',
    forcaAtual: 0,
    ultimaLeituraMs: null,
    overloadAlert: {
      active: false,
      level: 0,
      percent: 0,
      forca: 0,
      limite: CAPACIDADE_PADRAO_N,
    },
  };
}

function extrairCapacidadeMaximaGramas(config: unknown): number | null {
  if (!config || typeof config !== 'object') return null;
  const valor = (config as Record<string, unknown>)['capacidadeMaxGramas'];
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : null;
}

export class PonteJogosLegados {
  private readonly estado: EstadoCompartilhadoJogos;
  private capacidadeMaximaN = CAPACIDADE_PADRAO_N;

  constructor(
    private readonly janela: JanelaCompartilhada = (globalThis.window ?? {}) as JanelaCompartilhada,
    private readonly documento: DocumentoEventos | undefined = globalThis.document as DocumentoEventos | undefined,
  ) {
    this.estado = this.garantirEstado();
  }

  atualizarConexao(dados: { conectado: boolean; endereco?: string | null; transporte?: string }): void {
    this.estado.conectado = dados.conectado;
    this.estado.endereco = dados.endereco ?? this.estado.endereco;
    this.estado.transporte = dados.transporte ?? this.estado.transporte;
    this.emitir('jogos-status-atualizado', {
      conectado: this.estado.conectado,
      endereco: this.estado.endereco,
      transporte: this.estado.transporte,
    });
  }

  atualizarConfiguracao(config: unknown): void {
    const capacidadeMaximaGramas = extrairCapacidadeMaximaGramas(config);
    if (capacidadeMaximaGramas == null) return;

    this.capacidadeMaximaN = (capacidadeMaximaGramas / 1000) * GRAVIDADE_PADRAO;
    this.atualizarSobrecarga(this.estado.forcaAtual);
    this.emitir('jogos-config-atualizada', {
      capacidadeMaximaGramas,
      capacidadeMaximaN: this.capacidadeMaximaN,
    });
  }

  atualizarLeitura(leitura: { forcaNewton: number; marcaTemporal: number }): void {
    this.estado.forcaAtual = leitura.forcaNewton;
    this.estado.ultimaLeituraMs = leitura.marcaTemporal;
    this.atualizarSobrecarga(leitura.forcaNewton);

    this.emitir('forca-atualizada', {
      forcaN: leitura.forcaNewton,
      unidade: this.estado.unidadeAtual,
      marcaTemporal: leitura.marcaTemporal,
    });
  }

  limparLeitura(): void {
    this.estado.forcaAtual = 0;
    this.estado.ultimaLeituraMs = null;
    this.atualizarSobrecarga(0);
    this.emitir('forca-atualizada', {
      forcaN: 0,
      unidade: this.estado.unidadeAtual,
      marcaTemporal: null,
    });
  }

  obterEstado(): EstadoCompartilhadoJogos {
    return this.estado;
  }

  private garantirEstado(): EstadoCompartilhadoJogos {
    const atual = this.janela.sharedState;
    if (!atual) {
      this.janela.sharedState = estadoInicial();
      return this.janela.sharedState;
    }

    this.janela.sharedState = {
      ...estadoInicial(),
      ...atual,
      overloadAlert: {
        ...estadoInicial().overloadAlert,
        ...(atual.overloadAlert ?? {}),
      },
    };
    return this.janela.sharedState;
  }

  private atualizarSobrecarga(forcaN: number): void {
    const percent = this.capacidadeMaximaN > 0
      ? Math.abs((forcaN / this.capacidadeMaximaN) * 100)
      : 0;

    let level = 0;
    if (percent >= 100) level = 3;
    else if (percent >= 90) level = 2;
    else if (percent >= 80) level = 1;

    this.estado.overloadAlert = {
      active: level > 0,
      level,
      percent,
      forca: forcaN,
      limite: this.capacidadeMaximaN,
    };
  }

  private emitir(nome: string, detalhe: object): void {
    const dispatch = this.documento?.dispatchEvent;
    const CustomEventCtor = (globalThis as Record<string, unknown>)['CustomEvent'] as
      | (new (type: string, init: { detail: object }) => Event)
      | undefined;

    if (!dispatch || !CustomEventCtor) return;
    dispatch.call(this.documento, new CustomEventCtor(nome, { detail: detalhe }));
  }
}

declare global {
  interface Window {
    sharedState?: EstadoCompartilhadoJogos;
  }
}
