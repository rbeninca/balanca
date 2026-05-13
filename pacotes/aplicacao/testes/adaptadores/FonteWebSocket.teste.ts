import { describe, it, expect, vi } from 'vitest';
import { FonteWebSocket } from '../../src/adaptadores/FonteWebSocket.js';

class WebSocketSimulacro {
  onmessage: ((ev: any) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  envios: string[] = [];

  constructor(public readonly url: string) {}

  send(data: string) { this.envios.push(data); }
  close() { this.onclose?.(); }

  simularMensagem(obj: object) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

function criarFonte(): [FonteWebSocket, WebSocketSimulacro] {
  const simulacro = new WebSocketSimulacro('ws://localhost:8765');
  const fonte = new FonteWebSocket('ws://localhost:8765', () => simulacro as unknown as WebSocket);
  return [fonte, simulacro];
}

describe('FonteWebSocket', () => {
  // UT-7.2.1
  it('mensagem LEITURA emite evento dados com LeituraProcessada', () => {
    const [fonte, ws] = criarFonte();
    const recebido: any[] = [];
    fonte.on('dados', l => recebido.push(l));

    ws.simularMensagem({
      tipo: 'LEITURA',
      carga: { marcaTemporal: 100, forcaNewton: 2.5, temperatura: 0, emQueima: true, impulsoAcumuladoNs: 0 },
    });

    expect(recebido).toHaveLength(1);
    expect(recebido[0].forcaNewton).toBe(2.5);
  });

  // UT-7.2.2
  it('mensagem CONFIG emite evento config', () => {
    const [fonte, ws] = criarFonte();
    const recebido: any[] = [];
    fonte.on('config', c => recebido.push(c));
    ws.simularMensagem({ tipo: 'CONFIG', carga: { fatorConversao: 1.0 } });
    expect(recebido).toHaveLength(1);
  });

  // UT-7.2.3
  it('mensagem STATUS emite evento status', () => {
    const [fonte, ws] = criarFonte();
    const recebido: any[] = [];
    fonte.on('status', s => recebido.push(s));
    ws.simularMensagem({ tipo: 'STATUS', carga: { tipoStatus: 0 } });
    expect(recebido).toHaveLength(1);
  });

  // UT-7.2.4
  it('SERIAL_OFF → obterStatus().conectado = false', () => {
    const [fonte, ws] = criarFonte();
    ws.simularMensagem({ tipo: 'SERIAL_OFF' });
    expect(fonte.obterStatus().conectado).toBe(false);
  });

  // UT-7.2.5
  it('enviarComando() → ws.send() com JSON válido', () => {
    const [fonte, ws] = criarFonte();
    fonte.enviarComando({ tipo: 'CMD_TARAR' });
    expect(ws.envios).toHaveLength(1);
    expect(() => JSON.parse(ws.envios[0]!)).not.toThrow();
  });

  // UT-7.2.6
  it('WebSocket fecha → evento status emitido', () => {
    const [fonte, ws] = criarFonte();
    const eventos: any[] = [];
    fonte.on('status', s => eventos.push(s));
    ws.close();
    expect(eventos.length).toBeGreaterThanOrEqual(1);
  });

  // UT-7.2.7
  it('forcaBruta nunca presente no evento dados', () => {
    const [fonte, ws] = criarFonte();
    const recebido: any[] = [];
    fonte.on('dados', l => recebido.push(l));

    ws.simularMensagem({
      tipo: 'LEITURA',
      carga: { marcaTemporal: 0, forcaNewton: 1.0, forcaBruta: 99999, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
    });

    expect(recebido[0]?.forcaBruta).toBeUndefined();
  });
});
