import { decodificar } from '@balancagfig/protocolo';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { PipelineProcessamento } from '@balancagfig/processamento';
import type { ConfiguracaoPipeline, EstadoPipeline, PipelinePatch } from '@balancagfig/processamento';

export interface StatusFonteWebSerial {
  conectado: boolean;
  transporte: 'webserial';
}

type Ouvinte<T> = (detalhe: T) => void;

const CONFIG_PADRAO: ConfiguracaoPipeline = {
  limiarZonaMortaN: 0.05,
  janelaMediaMovel: 5,
  fatorCalibracao: 1.0,
  deslocamentoTara: 0,
  tempoMinFimMs: 100,
};

export class FonteWebSerial {
  private porta: SerialPort | null = null;
  private pipeline: PipelineProcessamento;
  private _status: StatusFonteWebSerial = { conectado: false, transporte: 'webserial' };
  private ouvintesDados: Array<Ouvinte<LeituraProcessada>> = [];
  private ouvinteserro: Array<Ouvinte<string>> = [];

  constructor(config?: ConfiguracaoPipeline) {
    this.pipeline = new PipelineProcessamento(config ?? CONFIG_PADRAO);
  }

  async conectar(baud = 921600): Promise<void> {
    this.porta = await navigator.serial.requestPort();
    await (this.porta as any).open({ baudRate: baud });
    this._status = { ...this._status, conectado: true };
    this._lerStream();
  }

  private async _lerStream(): Promise<void> {
    const reader = (this.porta as any).readable?.getReader();
    if (!reader) return;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        this._processarBytes(value as Uint8Array);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private _processarBytes(bytes: Uint8Array): void {
    try {
      const pacote = decodificar(bytes);
      if (pacote.tipo !== 'DADOS') return;
      // forcaBruta não é exposta
      const leitura = this.pipeline.processar(pacote);
      this.ouvintesDados.forEach(fn => fn(leitura));
    } catch (e) {
      this.ouvinteserro.forEach(fn => fn(String(e)));
    }
  }

  async desconectar(): Promise<void> {
    await (this.porta as any)?.close();
    this._status = { ...this._status, conectado: false };
    this.porta = null;
  }

  on(evento: 'dados', fn: Ouvinte<LeituraProcessada>): void;
  on(evento: 'erro', fn: Ouvinte<string>): void;
  on(evento: string, fn: Ouvinte<any>): void {
    if (evento === 'dados') this.ouvintesDados.push(fn);
    else if (evento === 'erro') this.ouvinteserro.push(fn);
  }

  atualizarConfigPipeline(patch: PipelinePatch): void {
    this.pipeline.atualizarConfig(patch);
  }

  obterConfigPipeline(): EstadoPipeline {
    return this.pipeline.obterConfig();
  }

  obterStatus(): StatusFonteWebSerial {
    return this._status;
  }
}
