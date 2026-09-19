import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { IArmazenamento } from '../armazenamento/ArmazenamentoLocal.js';
import type { EstadoGravacaoRemota } from '../adaptadores/FonteWebSocket.js';
import type { GerenciadorSessao, SessaoTeste } from './GerenciadorSessao.js';

/** O que o controlador precisa de uma fonte; só a FonteWebSocket (gateway novo) tem os métodos de gravação. */
export interface FonteGravacao {
  on(evento: 'gravacao', fn: (e: EstadoGravacaoRemota) => void): void;
  on(evento: string, fn: (v: unknown) => void): void;
  readonly suportaGravacaoRemota?: boolean;
  obterEstadoGravacao?(): EstadoGravacaoRemota | null;
  iniciarGravacaoRemota?(nome: string): void;
  pararGravacaoRemota?(): void;
}

export interface EstadoGravacao {
  gravando: boolean;
  /** true quando a gravação acontece no gateway (compartilhada por todos os clientes). */
  remota: boolean;
  idSessao: string | null;
  nome: string | null;
  inicioMs: number | null;
  amostras: number;
  iniciadaPor: string | null;
  clientes: Array<{ endereco: string; conectadoEm: number }>;
  ultima: EstadoGravacaoRemota['ultima'];
}

export interface ResultadoParada extends SessaoTeste {
  leituras: LeituraProcessada[];
}

const ESTADO_PARADO: EstadoGravacao = {
  gravando: false, remota: false, idSessao: null, nome: null, inicioMs: null,
  amostras: 0, iniciadaPor: null, clientes: [], ultima: null,
};

/**
 * Controle de gravação com duas implementações escolhidas sozinho:
 *
 * - **Remota** (gateway Android): o box grava direto do pipeline e difunde o
 *   estado a todos os clientes; qualquer um pode iniciar/parar. Este
 *   controlador só envia GRAVACAO_INICIAR/PARAR e espelha GRAVACAO_ESTADO.
 * - **Local** (WebSerial/GitHub Pages ou gateway antigo): o GerenciadorSessao
 *   de sempre — cada cliente grava o que recebe.
 *
 * A escolha é por capacidade (o gateway anunciou GRAVACAO_ESTADO?), então a
 * versão hospedada no GitHub segue funcionando como hoje.
 */
export class ControladorGravacao {
  private estadoLocal: EstadoGravacao = { ...ESTADO_PARADO };
  private gravadasLocal: LeituraProcessada[] = [];
  private ouvintes: Array<(e: EstadoGravacao) => void> = [];
  private ouvintesEncerrada: Array<(ultima: NonNullable<EstadoGravacao['ultima']>) => void> = [];
  private ultimaVista: string | null = null;
  private viuEstado = false;
  private esperandoParada: ((e: EstadoGravacaoRemota) => void) | null = null;
  private esperandoInicio: ((e: EstadoGravacaoRemota) => void) | null = null;

  constructor(
    private readonly fonte: FonteGravacao,
    private readonly local: GerenciadorSessao,
    private readonly armazenamento: IArmazenamento,
    private readonly timeoutMs = 10_000,
  ) {
    const inicial = fonte.obterEstadoGravacao?.() ?? null;
    this.viuEstado = inicial !== null;
    this.ultimaVista = inicial?.ultima?.id ?? null;
    fonte.on('gravacao', (e: EstadoGravacaoRemota) => this.aoEstadoRemoto(e));
  }

  get remota(): boolean { return this.fonte.suportaGravacaoRemota === true; }

  get estado(): EstadoGravacao {
    if (!this.remota) return this.estadoLocal;
    const r = this.fonte.obterEstadoGravacao?.();
    return r ? converter(r) : { ...ESTADO_PARADO, remota: true };
  }

  aoMudar(fn: (e: EstadoGravacao) => void): void { this.ouvintes.push(fn); }

  /** Outro cliente parou a gravação: a sessão foi salva no gateway, mas não é este cliente que abre a análise. */
  aoEncerradaPorOutro(fn: (ultima: NonNullable<EstadoGravacao['ultima']>) => void): void { this.ouvintesEncerrada.push(fn); }

  async iniciar(nome: string): Promise<{ id: string }> {
    if (this.remota) {
      const atual = this.fonte.obterEstadoGravacao?.();
      if (atual?.gravando) throw new Error(`Já há uma gravação em curso no gateway (${atual.nome}, iniciada por ${atual.iniciadaPor ?? '?'}).`);
      const espera = this.esperarRemoto(e => e.gravando, 'iniciar', r => { this.esperandoInicio = r; });
      this.fonte.iniciarGravacaoRemota!(nome);
      const e = await espera;
      return { id: e.idSessao! };
    }
    const { id } = await this.local.iniciarGravacao(nome);
    this.gravadasLocal = [];
    this.estadoLocal = { ...ESTADO_PARADO, gravando: true, idSessao: id, nome, inicioMs: Date.now() };
    this.emitir();
    return { id };
  }

  /** No modo local, cada leitura recebida vai para a sessão; no remoto o gateway já gravou. */
  adicionarLeitura(l: LeituraProcessada): void {
    if (this.remota || !this.estadoLocal.gravando) return;
    this.gravadasLocal.push(l);
    this.estadoLocal = { ...this.estadoLocal, amostras: this.gravadasLocal.length };
    this.local.adicionarLeitura(l).catch(() => {});
  }

  async parar(): Promise<ResultadoParada> {
    if (this.remota) {
      const atual = this.fonte.obterEstadoGravacao?.();
      if (!atual?.gravando) throw new Error('Não há gravação em curso no gateway.');
      const espera = this.esperarRemoto(e => !e.gravando && e.ultima != null, 'parar', r => { this.esperandoParada = r; });
      this.fonte.pararGravacaoRemota!();
      const e = await espera;
      const ultima = e.ultima!;
      const leituras = await this.armazenamento.obterLeituras(ultima.id);
      return { id: ultima.id, nome: ultima.nome, leituras, ...metricas(leituras) };
    }
    const sessao = await this.local.pararGravacao();
    const leituras = this.gravadasLocal;
    this.gravadasLocal = [];
    this.estadoLocal = { ...ESTADO_PARADO, ultima: { id: sessao.id, nome: sessao.nome, amostras: leituras.length, paradaPor: 'local', emMs: Date.now() } };
    this.emitir();
    return { ...sessao, leituras };
  }

  private esperarRemoto(
    condicao: (e: EstadoGravacaoRemota) => boolean,
    acao: string,
    registrar: (r: ((e: EstadoGravacaoRemota) => void) | null) => void,
  ): Promise<EstadoGravacaoRemota> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { registrar(null); reject(new Error(`O gateway não confirmou ${acao} a gravação em ${this.timeoutMs / 1000}s.`)); }, this.timeoutMs);
      registrar((e) => {
        if (!condicao(e)) return;
        clearTimeout(timer); registrar(null); resolve(e);
      });
    });
  }

  private aoEstadoRemoto(e: EstadoGravacaoRemota): void {
    const pediParar = this.esperandoParada !== null;
    this.esperandoInicio?.(e);
    this.esperandoParada?.(e);

    // Sessão encerrada que este cliente não pediu para parar → avisa a tela.
    // O primeiro estado após conectar é só referência (a 'ultima' pode ser antiga).
    const idUltima = e.ultima?.id ?? null;
    if (!this.viuEstado) {
      this.viuEstado = true;
      this.ultimaVista = idUltima;
    } else if (idUltima && idUltima !== this.ultimaVista) {
      this.ultimaVista = idUltima;
      if (!pediParar) this.ouvintesEncerrada.forEach(fn => fn(e.ultima!));
    }
    this.emitir();
  }

  private emitir(): void {
    const e = this.estado;
    this.ouvintes.forEach(fn => fn(e));
  }
}

function converter(r: EstadoGravacaoRemota): EstadoGravacao {
  return {
    gravando: r.gravando, remota: true, idSessao: r.idSessao, nome: r.nome, inicioMs: r.inicioMs,
    amostras: r.amostras, iniciadaPor: r.iniciadaPor, clientes: r.clientes ?? [], ultima: r.ultima ?? null,
  };
}

export function metricas(leituras: LeituraProcessada[]): { totalLeituras: number; forcaMaximaN: number; impulsoTotalNs: number } {
  return {
    totalLeituras: leituras.length,
    forcaMaximaN: leituras.reduce((m, l) => Math.max(m, l.forcaNewton), 0),
    impulsoTotalNs: leituras[leituras.length - 1]?.impulsoAcumuladoNs ?? 0,
  };
}
