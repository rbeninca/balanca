/**
 * Estado global do gateway que a barra de navegação mostra em qualquer tela:
 * clientes conectados e quem está gravando. Alimentado pelo ControladorGravacao
 * (GRAVACAO_ESTADO do WebSocket); vazio na versão WebSerial/GitHub Pages.
 */
export interface ClienteGateway {
  endereco: string;
  conectadoEm: number;
}

export interface EstadoGatewayDados {
  /** false quando não há gateway com gravação compartilhada (WebSerial, gateway antigo). */
  disponivel: boolean;
  clientes: ClienteGateway[];
  /** Endereço de quem iniciou a gravação em curso, ou null. */
  gravandoPor: string | null;
}

const VAZIO: EstadoGatewayDados = { disponivel: false, clientes: [], gravandoPor: null };

type Observador = (e: EstadoGatewayDados) => void;

export class EstadoGateway {
  private dados: EstadoGatewayDados = VAZIO;
  private observadores = new Set<Observador>();

  obter(): EstadoGatewayDados { return this.dados; }

  definir(novo: EstadoGatewayDados): void {
    this.dados = novo;
    this.observadores.forEach(fn => fn(novo));
  }

  limpar(): void { this.definir(VAZIO); }

  /** Observa mudanças; devolve a função que cancela. Chama já com o estado atual. */
  observar(fn: Observador): () => void {
    this.observadores.add(fn);
    fn(this.dados);
    return () => { this.observadores.delete(fn); };
  }
}

/** Instância única da aplicação. */
export const estadoGateway = new EstadoGateway();

/** "há 5 s", "há 3 min", "há 2 h" — para a lista de clientes. */
export function descreverTempo(desdeMs: number, agoraMs: number): string {
  const s = Math.max(0, Math.round((agoraMs - desdeMs) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.round(m / 60)} h`;
}

export interface LinhaCliente {
  endereco: string;
  desde: string;
  gravando: boolean;
}

/** Linhas do painel de clientes, quem grava primeiro. */
export function linhasClientes(e: EstadoGatewayDados, agoraMs: number): LinhaCliente[] {
  return [...e.clientes]
    .map(c => ({ endereco: c.endereco, desde: descreverTempo(c.conectadoEm, agoraMs), gravando: c.endereco === e.gravandoPor }))
    .sort((a, b) => Number(b.gravando) - Number(a.gravando));
}

// ─── Ligação com o gateway (watchdog da FonteWebSocket) ──────────────────────

export type FaseLigacao = 'conectando' | 'ok' | 'reconectando' | 'fechada';

export interface EstadoLigacao {
  fase: FaseLigacao;
  serial: 'conectada' | 'sem_dispositivo' | 'erro' | 'desconhecida';
  proximaTentativaS: number | null;
  ultimaLeituraMs: number | null;
}

type ObservadorLigacao = (e: EstadoLigacao | null) => void;

/** null = sem gateway WebSocket (WebSerial/GitHub Pages): o chip fica como sempre foi. */
export class EstadoConexao {
  private dados: EstadoLigacao | null = null;
  private observadores = new Set<ObservadorLigacao>();
  obter(): EstadoLigacao | null { return this.dados; }
  definir(e: EstadoLigacao | null): void { this.dados = e; this.observadores.forEach(fn => fn(e)); }
  observar(fn: ObservadorLigacao): () => void {
    this.observadores.add(fn); fn(this.dados);
    return () => { this.observadores.delete(fn); };
  }
}

export const estadoConexao = new EstadoConexao();

export interface AparenciaChip {
  /** classe CSS do chip: conectado (verde) · atencao (amarelo) · reconectando (vermelho) · desconectado */
  classe: 'conectado' | 'atencao' | 'reconectando' | 'desconectado';
  texto: string;
}

/** Como o chip de status deve aparecer para o endereço [endereco] dado o estado da ligação. */
export function descreverChip(e: EstadoLigacao | null, endereco: string): AparenciaChip {
  if (!e) return { classe: 'conectado', texto: endereco };
  switch (e.fase) {
    case 'reconectando':
      return { classe: 'reconectando', texto: `${endereco} — reconectando${e.proximaTentativaS != null ? ` em ${e.proximaTentativaS} s` : '…'}` };
    case 'conectando':
      return { classe: 'reconectando', texto: `${endereco} — conectando…` };
    case 'fechada':
      return { classe: 'desconectado', texto: `${endereco} — desconectado` };
    default:
      if (e.serial === 'conectada') return { classe: 'conectado', texto: endereco };
      return { classe: 'atencao', texto: `${endereco} — gateway ok, ${e.serial === 'erro' ? 'erro na serial' : 'sem célula'}` };
  }
}
