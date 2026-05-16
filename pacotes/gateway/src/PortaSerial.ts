import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { SerialPort } from 'serialport';
import { decodificar } from '@balancagfig/protocolo';
import type { PacoteESP32 } from '@balancagfig/protocolo';

export interface OpcaoPortaSerial {
  caminho: string;
  baud?: number;
}

const BACKOFF_MS    = [500, 1000, 2000, 4000, 8000, 16000, 30000];
const MAGIC_BYTES   = Buffer.from([0xb2, 0xa1]); // 0xA1B2 little-endian

export class PortaSerial extends EventEmitter {
  private porta: SerialPort | null = null;
  private buffer  = Buffer.alloc(0);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watcherDev: FSWatcher | null = null;
  private tentativa = 0;
  private abortado  = false;
  private pausado   = false;
  private conectado = false;

  constructor(private opcoes: OpcaoPortaSerial) {
    super();
  }

  iniciar(): void {
    this.conectar();
  }

  private pararWatcher(): void {
    this.watcherDev?.close();
    this.watcherDev = null;
  }

  private observarDispositivo(): void {
    if (this.watcherDev || this.abortado || this.pausado) return;
    const dir  = dirname(this.opcoes.caminho);
    const alvo = basename(this.opcoes.caminho);
    try {
      this.watcherDev = watch(dir, (_, arquivo) => {
        if (arquivo !== alvo) return;
        void access(this.opcoes.caminho).then(() => {
          if (this.abortado || this.pausado || this.conectado) return;
          this.pararWatcher();
          if (this.timer) { clearTimeout(this.timer); this.timer = null; }
          // pequena espera para o SO terminar de enumerar o dispositivo
          this.timer = setTimeout(() => this.conectar(), 300);
        }).catch(() => { /* dispositivo ainda ausente */ });
      });
    } catch { /* fs.watch não suportado neste ambiente */ }
  }

  private conectar(): void {
    if (this.abortado) return;

    this.porta = new SerialPort({
      path:     this.opcoes.caminho,
      baudRate: this.opcoes.baud ?? 921600,
      autoOpen: false,
    });

    this.porta.open((err) => {
      if (err) {
        this.agendarReconexao(`Erro ao abrir: ${err.message}`);
        return;
      }
      this.pararWatcher();
      this.tentativa = 0;
      this.conectado = true;
      this.buffer    = Buffer.alloc(0);
      this.emit('conectado', this.opcoes.caminho);

      this.porta!.on('data',  (chunk: Buffer) => this.processarChunk(chunk));
      this.porta!.on('error', (e) => this.agendarReconexao(e.message));
      this.porta!.on('close', ()  => this.agendarReconexao('porta fechada'));
    });
  }

  private processarChunk(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const idx = this.buffer.indexOf(MAGIC_BYTES);
      if (idx === -1) {
        // sem magic — mantém últimos 3 bytes (podem conter parte do magic)
        this.buffer = this.buffer.subarray(Math.max(0, this.buffer.length - 3));
        return;
      }
      if (idx > 0) {
        this.buffer = this.buffer.subarray(idx);
      }

      const ver  = this.buffer[2];
      const tipo = this.buffer[3];

      const tamPorTipo: Record<number, Record<number, number>> = {
        0x01: { 0x01: 20, 0x02: 64, 0x03: 14 },
        0x02: { 0x01: 20, 0x02: 64, 0x03: 14 },
      };

      const tam = tamPorTipo[ver as number]?.[tipo as number];
      if (!tam) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      if (this.buffer.length < tam) break;

      const bytes = new Uint8Array(this.buffer.subarray(0, tam));
      this.buffer = this.buffer.subarray(tam);

      try {
        const pacote: PacoteESP32 = decodificar(bytes);
        this.emit('pacote', pacote);
      } catch (e) {
        this.emit('erro_decodificacao', (e as Error).message);
      }
    }
  }

  private agendarReconexao(motivo: string): void {
    if (this.abortado || this.pausado) return;

    if (this.conectado) {
      this.conectado = false;
      this.emit('desconectado', motivo);
    }

    const delay = BACKOFF_MS[Math.min(this.tentativa, BACKOFF_MS.length - 1)] ?? 30000;
    this.tentativa++;
    this.timer = setTimeout(() => this.conectar(), delay);
    this.observarDispositivo();
  }

  enviar(dados: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.porta?.isOpen) {
        reject(new Error('Porta serial não está aberta'));
        return;
      }
      this.porta.write(dados, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  pausar(): Promise<void> {
    this.pausado = true;
    this.pararWatcher();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return new Promise((resolve) => {
      if (!this.porta?.isOpen) { resolve(); return; }
      this.porta.close(() => {
        this.conectado = false;
        this.emit('desconectado', 'pausado para atualização de firmware');
        resolve();
      });
    });
  }

  retomar(): void {
    this.pausado   = false;
    this.tentativa = 0;
    this.conectar();
  }

  fechar(): Promise<void> {
    this.abortado = true;
    this.pararWatcher();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return new Promise((resolve) => {
      if (!this.porta?.isOpen) { resolve(); return; }
      this.porta.close(() => resolve());
    });
  }

  estaConectado(): boolean { return this.conectado; }
}
