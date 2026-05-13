import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

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
      case 'LEITURA':
        // forcaBruta nunca é exposta para o consumidor
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { forcaBruta: _fb, ...leitura } = msg.carga ?? {};
        this._emitir('dados', leitura as LeituraProcessada);
        break;
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

  fechar(): void {
    this.ws.close();
  }
}
