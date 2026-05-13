import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { PipelineProcessamento } from '@balancagfig/processamento';
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

export class FonteWebSocket {
  private ws: WebSocket;
  private _status: StatusFonteWS = { conectado: false, transporte: 'websocket' };
  private ouvintes: { [K in keyof EventosDadosWS]?: Array<Ouvinte<EventosDadosWS[K]>> } = {};
  private pipeline: PipelineProcessamento;

  constructor(url: string, factory?: (url: string) => WebSocket) {
    this.pipeline = new PipelineProcessamento({
      limiarZonaMortaN: 0.05,
      janelaMediaMovel: 5,
      fatorCalibracao: 1.0,
      deslocamentoTara: 0,
      tempoMinFimMs: 100,
    });
    // Gateway already processes data; local filters start disabled
    this.pipeline.atualizarConfig({
      ativoZonaMorta: false, ativoMediaMovel: false, ativoDetectorQueima: false,
    });
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
        const { forcaBruta: _fb, ...base } = msg.carga ?? {};
        const leitura = this.pipeline.processarLeitura(base as LeituraProcessada);
        this._emitir('dados', leitura);
        break;
      }
      case 'CONFIG':
        this._emitir('config', msg.carga);
        break;
      case 'STATUS':
        this._emitir('status', msg.carga);
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

  obterStatus(): StatusFonteWS {
    return this._status;
  }

  atualizarConfigPipeline(patch: PipelinePatch): void {
    this.pipeline.atualizarConfig(patch);
  }

  obterConfigPipeline(): EstadoPipeline {
    return this.pipeline.obterConfig();
  }

  fechar(): void {
    this.ws.close();
  }
}
