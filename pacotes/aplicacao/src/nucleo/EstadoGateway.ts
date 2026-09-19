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
