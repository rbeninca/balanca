import { decodificar } from '@balancagfig/protocolo';
import { PipelineProcessamento } from '@balancagfig/processamento';
import type { ConfiguracaoPipeline, LeituraProcessada } from '@balancagfig/processamento/tipos';

export type MensagemParaWorker =
  | { tipo: 'CONFIGURAR'; config: ConfiguracaoPipeline }
  | { tipo: 'BYTES'; buffer: ArrayBuffer }
  | { tipo: 'REINICIAR' };

export type MensagemDoWorker =
  | { tipo: 'dados'; leitura: LeituraProcessada }
  | { tipo: 'erro'; mensagem: string };

export class TrabalhadorSerial {
  private pipeline: PipelineProcessamento | null = null;
  private config: ConfiguracaoPipeline | null = null;

  processar(mensagem: MensagemParaWorker): MensagemDoWorker | null {
    switch (mensagem.tipo) {
      case 'CONFIGURAR':
        this.config = mensagem.config;
        this.pipeline = new PipelineProcessamento(mensagem.config);
        return null;

      case 'BYTES': {
        if (!this.pipeline) return null;
        try {
          const pacote = decodificar(new Uint8Array(mensagem.buffer));
          if (pacote.tipo !== 'DADOS') return null;
          const leitura = this.pipeline.processar(pacote);
          return { tipo: 'dados', leitura };
        } catch (e) {
          return { tipo: 'erro', mensagem: String(e) };
        }
      }

      case 'REINICIAR':
        if (this.config) {
          this.pipeline = new PipelineProcessamento(this.config);
        }
        return null;
    }
  }
}
