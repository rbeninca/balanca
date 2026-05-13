import { WebSocketServer, WebSocket } from 'ws';
import type { PortaSerial } from './PortaSerial.js';
import { PipelineProcessamento } from '@balancagfig/processamento';
import type { ConfiguracaoPipeline, PipelinePatch } from '@balancagfig/processamento';
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

      // Envia estado atual do pipeline para o cliente recém-conectado
      cliente.send(JSON.stringify({
        tipo: 'PIPELINE_ESTADO',
        carga: this.pipeline.obterConfig(),
      }));

      cliente.on('message', async (mensagem) => {
        let cmd: Record<string, unknown>;
        try {
          cmd = JSON.parse(mensagem.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        // Comando de controle do pipeline do gateway (não vai para o ESP32)
        if (cmd['tipo'] === 'PIPELINE_CONFIG') {
          this.pipeline.atualizarConfig(cmd['carga'] as PipelinePatch);
          // Difunde o estado atualizado para todos os clientes
          this.difundir({ tipo: 'PIPELINE_ESTADO', carga: this.pipeline.obterConfig() });
          return;
        }

        // Demais comandos são repassados ao ESP32
        try {
          const bytes = codificarComando(cmd as never);
          await porta.enviar(Buffer.from(bytes));
        } catch {
          // Comando desconhecido ou erro de codificação — ignora
        }
      });

      cliente.on('close', () => this.clientes.delete(cliente));
    });

    porta.on('pacote', (pacote: PacoteESP32) => {
      if (pacote.tipo === 'DADOS') {
        const leitura = this.pipeline.processar(pacote as PacoteDados);
        this.difundir({ tipo: 'LEITURA', carga: leitura });
      } else if (pacote.tipo === 'CONFIGURACAO') {
        this.difundir({ tipo: 'CONFIG', carga: pacote });
      } else if (pacote.tipo === 'STATUS') {
        this.difundir({ tipo: 'STATUS', carga: pacote });
      }
    });

    porta.on('conectado', async () => {
      this.difundir({ tipo: 'SERIAL_OK' });
      try {
        const bytes = codificarComando({ tipo: 'CMD_OBTER_CONFIG' });
        await porta.enviar(Buffer.from(bytes));
      } catch { /* ignora — o ESP32 enviará CONFIG ao reiniciar */ }
    });
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
