import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { EstadoPipeline, PipelinePatch } from '@balancagfig/processamento';

export interface StatusFonteWS {
  conectado: boolean;
  transporte: 'websocket';
}

export interface EventosDadosWS {
  dados: LeituraProcessada;
  config: unknown;
  status: unknown;
}

type Ouvinte<T> = (detalhe: T) => void;

// Espelha os defaults de PipelineProcessamento para inicialização síncrona do painel
const CFG_GATEWAY_PADRAO: EstadoPipeline = {
  limiarZonaMortaN:    0.5,
  janelaMediaMovel:    5,
  fatorCalibracao:     1.0,
  deslocamentoTara:    0,
  tempoMinFimMs:       100,
  ativoZonaMorta:      false,
  ativoMediaMovel:     false,
  ativoDetectorQueima: false,
  ativoMediana:        false,
  ativoEMA:            false,
  ativoNotch:          false,
  ativoSG:             false,
  ativoKalman:         false,
};

export class FonteWebSocket {
  private ws: WebSocket;
  private _status: StatusFonteWS = { conectado: false, transporte: 'websocket' };
  private ouvintes: { [K in keyof EventosDadosWS]?: Array<Ouvinte<EventosDadosWS[K]>> } = {};
  private cfgGateway: EstadoPipeline = { ...CFG_GATEWAY_PADRAO };

  constructor(url: string, factory?: (url: string) => WebSocket) {
    const criar = factory ?? ((u: string) => new WebSocket(u));
    this.ws = criar(url);
    this.ws.onmessage = (ev) => this._processar(ev.data as string);
    this.ws.onopen = () => { this._status = { ...this._status, conectado: true }; };
    this.ws.onclose = () => {
      this._status = { ...this._status, conectado: false };
      this._emitir('status', { conectado: false } as any);
    };
  }

  private _processar(json: string): void {
    let msg: any;
    try { msg = JSON.parse(json); } catch { return; }

    switch (msg.tipo) {
      case 'LEITURA': {
        // forcaBruta nunca é exposta para o consumidor
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { forcaBruta: _fb, ...leitura } = msg.carga ?? {};
        this._emitir('dados', leitura as LeituraProcessada);
        break;
      }
      case 'CONFIG':
        this._emitir('config', msg.carga);
        break;
      case 'STATUS':
        this._emitir('status', msg.carga);
        break;
      case 'PIPELINE_ESTADO':
        this.cfgGateway = msg.carga as EstadoPipeline;
        this._emitir('config', msg.carga);
        break;
      case 'SERIAL_OFF':
        this._status = { ...this._status, conectado: false };
        this._emitir('status', { conectado: false } as any);
        break;
      case 'SERIAL_OK':
        this._status = { ...this._status, conectado: true };
        this._emitir('status', { conectado: true } as any);
        break;
    }
  }

  private _emitir<K extends keyof EventosDadosWS>(evento: K, detalhe: EventosDadosWS[K]): void {
    (this.ouvintes[evento] ?? []).forEach(fn => fn(detalhe));
  }

  on<K extends keyof EventosDadosWS>(evento: K, fn: Ouvinte<EventosDadosWS[K]>): void {
    if (!this.ouvintes[evento]) this.ouvintes[evento] = [];
    (this.ouvintes[evento] as Array<Ouvinte<EventosDadosWS[K]>>).push(fn);
  }

  aguardarConexao(timeoutMs = 5000): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout: gateway não respondeu em ${timeoutMs}ms`)),
        timeoutMs,
      );
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Erro ao conectar ao gateway')); }, { once: true });
    });
  }

  enviarComando(comando: object): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(comando));
  }

  atualizarConfigPipeline(patch: PipelinePatch): void {
    // Atualiza o pipeline do gateway via WebSocket
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ tipo: 'PIPELINE_CONFIG', carga: patch }));
    }
    // Atualização otimista do cache local para resposta imediata da UI
    for (const k of Object.keys(patch) as (keyof PipelinePatch)[]) {
      if (patch[k] != null) (this.cfgGateway as Record<string, unknown>)[k] = patch[k];
    }
  }

  obterConfigPipeline(): EstadoPipeline {
    return this.cfgGateway;
  }

  obterStatus(): StatusFonteWS {
    return this._status;
  }

  fechar(): void {
    this.ws.close();
  }
}
