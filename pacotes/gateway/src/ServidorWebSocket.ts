import { WebSocketServer, WebSocket } from 'ws';
import type { PortaSerial } from './PortaSerial.js';
import { PipelineProcessamento } from '@balancagfig/processamento';
import type { ConfiguracaoPipeline } from '@balancagfig/processamento';
import { codificarComando } from '@balancagfig/protocolo';
import type { PacoteESP32, PacoteDados } from '@balancagfig/protocolo';

export class ServidorWebSocket {
  private servidor:  WebSocketServer;
  private clientes   = new Set<WebSocket>();
  private pipeline:  PipelineProcessamento;
  private portaTCP:  number;

  constructor(porta: PortaSerial, config: ConfiguracaoPipeline, portaTCP = 8765) {
    this.portaTCP = portaTCP;
    this.pipeline = new PipelineProcessamento(config);

    this.servidor = new WebSocketServer({ port: portaTCP });

    this.servidor.on('connection', (cliente) => {
      this.clientes.add(cliente);

      cliente.on('message', async (mensagem) => {
        try {
          const cmd = JSON.parse(mensagem.toString()) as Record<string, unknown>;
          const bytes = codificarComando(cmd as never);
          await porta.enviar(Buffer.from(bytes));
        } catch {
          // JSON inválido ou comando desconhecido — ignora e mantém conexão
        }
      });

      cliente.on('close', () => this.clientes.delete(cliente));
    });

    porta.on('pacote', (pacote: PacoteESP32) => {
      if (pacote.tipo === 'DADOS') {
        const leitura = this.pipeline.processar(pacote as PacoteDados);
        this.difundir({ tipo: 'LEITURA', carga: leitura });
      } else if (pacote.tipo === 'CONFIGURACAO') {
        this.pipeline.atualizarCalibracao(
          pacote.fatorConversao / 1000 * pacote.gravidade,
          pacote.offsetTara,
        );
        this.difundir({ tipo: 'CONFIG', carga: pacote });
      } else if (pacote.tipo === 'STATUS') {
        this.difundir({ tipo: 'STATUS', carga: pacote });
      }
    });

    porta.on('conectado',    () => this.difundir({ tipo: 'SERIAL_OK' }));
    porta.on('desconectado', () => this.difundir({ tipo: 'SERIAL_OFF' }));
  }

  private difundir(obj: object): void {
    const dados = JSON.stringify(obj);
    for (const c of this.clientes) {
      if (c.readyState === WebSocket.OPEN) c.send(dados);
    }
  }

  reiniciarPipeline(): void { this.pipeline.reiniciar(); }

  obterFatorCalibracao(): number { return this.pipeline.obterFatorCalibracao(); }

  obterNumClientes(): number { return this.clientes.size; }

  fechar(): Promise<void> {
    return new Promise((resolve) => this.servidor.close(() => resolve()));
  }

  obterPortaTCP(): number { return this.portaTCP; }
}
