import { decodificar, codificarComando, MAGIC, TIPO_DADOS, TIPO_CONFIGURACAO, TIPO_STATUS } from '@balancagfig/protocolo';
import type { ComandoHost } from '@balancagfig/protocolo';
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

const TAM_PACOTE: Partial<Record<number, number>> = {
  [TIPO_DADOS]:        20,
  [TIPO_CONFIGURACAO]: 64,
  [TIPO_STATUS]:       14,
};

export class FonteWebSerial {
  private porta: SerialPort | null = null;
  private leitor:  ReadableStreamDefaultReader<Uint8Array> | null = null;
  private escritor: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private pipeline: PipelineProcessamento;
  private _status: StatusFonteWebSerial = { conectado: false, transporte: 'webserial' };
  private ouvintesDados:  Array<Ouvinte<LeituraProcessada>> = [];
  private ouvintesConfig: Array<Ouvinte<unknown>> = [];
  private ouvintesStatus: Array<Ouvinte<unknown>> = [];
  private ouvinteserro:   Array<Ouvinte<string>> = [];
  private buffer = new Uint8Array(0);

  constructor(config?: ConfiguracaoPipeline) {
    this.pipeline = new PipelineProcessamento(config ?? CONFIG_PADRAO);
  }

  async conectar(baud = 921600): Promise<void> {
    this.porta = await navigator.serial.requestPort();
    await (this.porta as any).open({ baudRate: baud });
    this.escritor = (this.porta as any).writable?.getWriter() ?? null;
    this._status = { ...this._status, conectado: true };
    this.ouvintesStatus.forEach(fn => fn({ conectado: true }));
    this._lerStream();
  }

  private async _lerStream(): Promise<void> {
    const reader = (this.porta as any).readable?.getReader();
    if (!reader) return;
    this.leitor = reader;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        this._processarBytes(value as Uint8Array);
      }
    } finally {
      reader.releaseLock();
      this.leitor = null;
    }
  }

  private _processarBytes(bytes: Uint8Array): void {
    const novo = new Uint8Array(this.buffer.length + bytes.length);
    novo.set(this.buffer);
    novo.set(bytes, this.buffer.length);
    this.buffer = novo;

    while (this.buffer.length >= 4) {
      const magic = this.buffer[0]! | (this.buffer[1]! << 8);
      if (magic !== MAGIC) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const tipo = this.buffer[3]!;
      const tam  = TAM_PACOTE[tipo];
      if (tam === undefined) { this.buffer = this.buffer.subarray(1); continue; }
      if (this.buffer.length < tam) break;

      const pacoteBytes = this.buffer.slice(0, tam);
      this.buffer = this.buffer.subarray(tam);

      try {
        const pacote = decodificar(pacoteBytes);
        if (pacote.tipo === 'DADOS') {
          const leitura = this.pipeline.processar(pacote);
          this.ouvintesDados.forEach(fn => fn(leitura));
        } else if (pacote.tipo === 'CONFIGURACAO') {
          this.ouvintesConfig.forEach(fn => fn(pacote));
        }
        // PacoteStatus (tara OK, calib OK) ignorado na UI por ora
      } catch (e) {
        this.ouvinteserro.forEach(fn => fn(String(e)));
      }
    }
  }

  enviarComando(cmd: object): void {
    if (!this.escritor) return;
    try {
      const bytes = codificarComando(cmd as ComandoHost);
      void this.escritor.write(bytes);
    } catch (e) {
      this.ouvinteserro.forEach(fn => fn(String(e)));
    }
  }

  async desconectar(): Promise<void> {
    if (this.leitor) {
      try { await this.leitor.cancel(); } catch { /* ignora */ }
    }
    if (this.escritor) {
      try { this.escritor.releaseLock(); } catch { /* ignora */ }
      this.escritor = null;
    }
    await new Promise(r => setTimeout(r, 50));
    try { await (this.porta as any)?.close(); } catch { /* ignora */ }
    this._status = { ...this._status, conectado: false };
    this.ouvintesStatus.forEach(fn => fn({ conectado: false }));
    this.porta = null;
  }

  on(evento: 'dados',  fn: Ouvinte<LeituraProcessada>): void;
  on(evento: 'config', fn: Ouvinte<unknown>): void;
  on(evento: 'status', fn: Ouvinte<unknown>): void;
  on(evento: 'erro',   fn: Ouvinte<string>): void;
  on(evento: string, fn: Ouvinte<any>): void {
    if      (evento === 'dados')  this.ouvintesDados.push(fn);
    else if (evento === 'config') this.ouvintesConfig.push(fn);
    else if (evento === 'status') this.ouvintesStatus.push(fn);
    else if (evento === 'erro')   this.ouvinteserro.push(fn);
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
