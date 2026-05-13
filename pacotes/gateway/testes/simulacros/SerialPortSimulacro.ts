import { EventEmitter } from 'node:events';

export class SerialPortSimulacro extends EventEmitter {
  public dadosEscritos: Buffer[] = [];
  public isOpen = false;

  // simula SerialPort.open(callback)
  open(cb: (err?: Error) => void): void {
    this.isOpen = true;
    cb();
  }

  write(dados: Buffer, cb: (err?: Error) => void): void {
    this.dadosEscritos.push(Buffer.from(dados));
    cb();
  }

  close(cb: () => void): void {
    this.isOpen = false;
    cb();
  }

  // Injeta dados como se viessem da porta serial
  simularRecepcao(buffer: Buffer): void {
    this.emit('data', buffer);
  }

  simularErro(msg = 'erro simulado'): void {
    this.emit('error', new Error(msg));
  }

  simularFechamento(): void {
    this.isOpen = false;
    this.emit('close');
  }
}
