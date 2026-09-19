import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FonteWebSocket, BACKOFF_S, type StatusFonteWS } from '../../src/adaptadores/FonteWebSocket.js';

/** Socket simulado com controle de abrir/fechar/mensagens. */
class SocketSimulado {
  static OPEN = 1;
  readyState = 0;   // CONNECTING
  onmessage: ((ev: any) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  envios: string[] = [];
  fechadoPeloCliente = false;
  constructor(public readonly url: string) {}
  send(d: string) { this.envios.push(d); }
  close() { this.fechadoPeloCliente = true; this.readyState = 3; }
  addEventListener(tipo: string, fn: () => void) { if (tipo === 'open') this.onopen = fn; }
  abrir() { this.readyState = 1; this.onopen?.(); }
  cair() { this.readyState = 3; this.onclose?.(); }
  mensagem(o: object) { this.onmessage?.({ data: JSON.stringify(o) }); }
  saude(serial = 'conectada') { this.mensagem({ tipo: 'SAUDE', carga: { serial, taxaHz: 80, uptimeS: 1, clientes: 1, intervaloMs: 2000 } }); }
}

function montar() {
  const sockets: SocketSimulado[] = [];
  const conexoes: StatusFonteWS[] = [];
  const fonte = new FonteWebSocket('ws://x:8765', (u) => { const s = new SocketSimulado(u); sockets.push(s); return s as unknown as WebSocket; }, () => Date.now());
  fonte.on('conexao', (c) => conexoes.push({ ...c }));
  return { fonte, sockets, conexoes, atual: () => sockets[sockets.length - 1]! };
}

beforeEach(() => { vi.useFakeTimers(); (globalThis as any).WebSocket = { OPEN: 1, CONNECTING: 0 }; });
afterEach(() => { vi.useRealTimers(); });

describe('FonteWebSocket — watchdog e reconexão', () => {
  it('abre, fica ok e reconhece o batimento', () => {
    const { fonte, atual, conexoes } = montar();
    atual().abrir();
    expect(fonte.obterStatus().fase).toBe('ok');
    expect(fonte.obterStatus().temBatimento).toBe(false);
    atual().saude('sem_dispositivo');
    expect(fonte.obterStatus()).toMatchObject({ temBatimento: true, serial: 'sem_dispositivo', conectado: false });
    atual().saude('conectada');
    expect(fonte.obterStatus()).toMatchObject({ serial: 'conectada', conectado: true });
    expect(conexoes.length).toBeGreaterThan(0);
  });

  it('queda explícita: reconecta com espera 1, 2, 4, 8, 15, 15 s', () => {
    const { fonte, sockets, atual } = montar();
    atual().abrir();
    const esperas: number[] = [];
    for (const esperado of [...BACKOFF_S, 15, 15]) {
      atual().cair();
      expect(fonte.obterStatus().fase).toBe('reconectando');
      esperas.push(fonte.obterStatus().proximaTentativaS!);
      const antes = sockets.length;
      vi.advanceTimersByTime(esperado * 1000 - 1);
      expect(sockets.length).toBe(antes);            // ainda esperando
      vi.advanceTimersByTime(1);
      expect(sockets.length).toBe(antes + 1);        // nova tentativa
      expect(fonte.obterStatus().fase).toBe('conectando');
    }
    expect(esperas).toEqual([1, 2, 4, 8, 15, 15, 15]);
  });

  it('a contagem regressiva é publicada a cada segundo', () => {
    const { fonte, atual, conexoes } = montar();
    atual().abrir(); atual().cair();                 // tentativa 1: espera 1 s
    vi.advanceTimersByTime(1000);                    // tenta de novo (socket 2, ainda conectando)
    atual().cair();                                  // falhou de novo: tentativa 2, espera 2 s
    expect(fonte.obterStatus()).toMatchObject({ tentativas: 2, proximaTentativaS: 2 });
    conexoes.length = 0;
    vi.advanceTimersByTime(1000);
    expect(conexoes.map(c => c.proximaTentativaS)).toEqual([1]);
    vi.advanceTimersByTime(1000);
    expect(fonte.obterStatus().fase).toBe('conectando');
  });

  it('ao reabrir, zera as tentativas e pede a configuração da ESP', () => {
    const { fonte, atual } = montar();
    atual().abrir();
    expect(atual().envios).toEqual([]);          // 1ª ligação: quem pede é a tela
    atual().cair();
    vi.advanceTimersByTime(1000);
    atual().abrir();
    expect(fonte.obterStatus()).toMatchObject({ fase: 'ok', tentativas: 0, proximaTentativaS: null });
    expect(atual().envios).toEqual([JSON.stringify({ tipo: 'CMD_OBTER_CONFIG' })]);
  });

  it('ligação muda com batimento: 3 batimentos perdidos → morta → reconecta', () => {
    const { fonte, sockets, atual } = montar();
    atual().abrir(); atual().saude();
    vi.advanceTimersByTime(5000); atual().saude();  // dentro do prazo, renova
    vi.advanceTimersByTime(5000);
    expect(fonte.obterStatus().fase).toBe('ok');
    vi.advanceTimersByTime(2000);                    // 7 s sem nada > 3 × 2 s
    expect(fonte.obterStatus().fase).toBe('reconectando');
    expect(sockets[0]!.fechadoPeloCliente).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(sockets.length).toBe(2);
  });

  it('sem LEITURA mas com SAUDE não é queda (gateway vivo sem célula)', () => {
    const { fonte, atual } = montar();
    atual().abrir();
    for (let i = 0; i < 10; i++) { atual().saude('sem_dispositivo'); vi.advanceTimersByTime(2000); }
    expect(fonte.obterStatus()).toMatchObject({ fase: 'ok', serial: 'sem_dispositivo', ultimaLeituraMs: null });
  });

  it('gateway antigo sem SAUDE: silêncio não dispara reconexão', () => {
    const { fonte, sockets, atual } = montar();
    atual().abrir();
    atual().mensagem({ tipo: 'PIPELINE_ESTADO', carga: {} });
    vi.advanceTimersByTime(60_000);
    expect(fonte.obterStatus().fase).toBe('ok');
    expect(sockets.length).toBe(1);
  });

  it('mensagens do socket antigo são ignoradas depois da troca', () => {
    const { fonte, sockets, atual } = montar();
    atual().abrir(); atual().cair();
    vi.advanceTimersByTime(1000);
    const recebidos: unknown[] = [];
    fonte.on('dados', (l) => recebidos.push(l));
    sockets[0]!.mensagem({ tipo: 'LEITURA', carga: { forcaNewton: 1 } });
    expect(recebidos).toEqual([]);
    atual().abrir(); atual().mensagem({ tipo: 'LEITURA', carga: { forcaNewton: 2 } });
    expect(recebidos).toHaveLength(1);
  });

  it('fechar() encerra sem reconectar', () => {
    const { fonte, sockets, atual } = montar();
    atual().abrir();
    fonte.fechar();
    expect(fonte.obterStatus().fase).toBe('fechada');
    vi.advanceTimersByTime(60_000);
    expect(sockets.length).toBe(1);
    expect(sockets[0]!.fechadoPeloCliente).toBe(true);
  });

  it('status conectado cai junto com a ligação', () => {
    const { fonte, atual } = montar();
    const status: any[] = [];
    fonte.on('status', (s) => status.push(s));
    atual().abrir(); atual().mensagem({ tipo: 'SERIAL_OK' });
    atual().cair();
    expect(status).toEqual([{ conectado: true }, { conectado: false }]);
  });
});
