import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { EstadoPipeline, PipelinePatch } from '@balancagfig/processamento';

export type SerialGateway = 'conectada' | 'sem_dispositivo' | 'erro' | 'desconhecida';
export type FaseConexao = 'conectando' | 'ok' | 'reconectando' | 'fechada';

/** Situação da ligação com o gateway (evento 'conexao'); `conectado` continua sendo a serial, como sempre. */
export interface StatusFonteWS {
  conectado: boolean;
  transporte: 'websocket';
  fase: FaseConexao;
  serial: SerialGateway;
  /** true depois do primeiro SAUDE: o gateway tem batimento e o watchdog por inatividade fica ativo. */
  temBatimento: boolean;
  tentativas: number;
  /** Segundos até a próxima tentativa, enquanto reconectando. */
  proximaTentativaS: number | null;
  /** Instante da última LEITURA recebida (null se nenhuma nesta ligação). */
  ultimaLeituraMs: number | null;
}

/** Batimento do gateway (SAUDE, a cada ~2 s). */
export interface SaudeGateway {
  serial: SerialGateway;
  taxaHz: number;
  uptimeS: number;
  clientes: number;
  intervaloMs: number;
}

/** Estado da gravação compartilhada no gateway (GRAVACAO_ESTADO — só o app Android envia). */
export interface EstadoGravacaoRemota {
  gravando: boolean;
  idSessao: string | null;
  nome: string | null;
  inicioMs: number | null;
  amostras: number;
  iniciadaPor: string | null;
  ultima: { id: string; nome: string; amostras: number; paradaPor: string; emMs: number } | null;
  clientes: Array<{ endereco: string; conectadoEm: number }>;
}

export interface EventosDadosWS {
  dados: LeituraProcessada;
  config: unknown;
  status: unknown;
  gravacao: EstadoGravacaoRemota;
  conexao: StatusFonteWS;
  saude: SaudeGateway;
}

/** Espera entre tentativas de reconexão, em segundos; a última repete para sempre. */
export const BACKOFF_S = [1, 2, 4, 8, 15];
/** Batimentos perdidos para declarar a ligação morta. */
export const BATIMENTOS_PERDIDOS = 3;

type Ouvinte<T> = (detalhe: T) => void;

// Espelha os defaults de PipelineProcessamento para inicialização síncrona do painel
const CFG_GATEWAY_PADRAO: EstadoPipeline = {
  limiarZonaMortaN:    0.5,
  janelaMediaMovel:    5,
  fatorCalibracao:     1.0,
  deslocamentoTara:    0,
  tempoMinFimMs:       100,
  filtroPrincipal:     'nenhum',
  taxaEstimadaHz:      null,
  butterworthValido:   true,
  fonteCalculoImpulso: 'final',
  detector:            { limiarEntradaN: 0.5, limiarSaidaN: 0.5, tempoEntradaMs: 0, tempoSaidaMs: 100 },
  ativoHampel:         false,
  ativoZeroTracking:   false,
  zeroTrackingOffsetN: 0,
  ativoZonaMorta:      false,
  ativoMediaMovel:     false,
  ativoDetectorQueima: false,
  ativoMediana:        false,
  ativoEMA:            false,
  ativoNotch:          false,
  ativoSG:             false,
  ativoKalman:         false,
};

/**
 * Fonte de dados pelo WebSocket do gateway, com watchdog: a mesma instância
 * (as telas guardam a referência) troca o socket por baixo quando a ligação
 * cai ou fica muda.
 *
 * - Queda explícita (onclose/onerror) → reconecta com espera 1, 2, 4, 8, 15 s
 *   (para sempre, enquanto não for fechada).
 * - Ligação muda: se o gateway tem batimento (SAUDE) e 3 batimentos não
 *   chegam, a ligação é considerada morta — mesmo sem onclose (WiFi que
 *   "some"). Sem LEITURA mas com SAUDE não é queda: é célula ausente.
 * - Gateway antigo (sem SAUDE): só onclose/onerror, como antes.
 * - Ao voltar ao primeiro plano (visibilitychange/online) checa na hora.
 * - Ao reconectar, o gateway reenvia o estado (pipeline, gravação, config,
 *   serial); ainda assim pede CMD_OBTER_CONFIG por garantia.
 */
export class FonteWebSocket {
  private ws!: WebSocket;
  private _status: StatusFonteWS = {
    conectado: false, transporte: 'websocket', fase: 'conectando', serial: 'desconhecida',
    temBatimento: false, tentativas: 0, proximaTentativaS: null, ultimaLeituraMs: null,
  };
  private ouvintes: { [K in keyof EventosDadosWS]?: Array<Ouvinte<EventosDadosWS[K]>> } = {};
  private cfgGateway: EstadoPipeline = { ...CFG_GATEWAY_PADRAO };
  private gravacaoRemota: EstadoGravacaoRemota | null = null;

  private readonly criar: (url: string) => WebSocket;
  private readonly agora: () => number;
  private fechada = false;
  private ligacoes = 0;
  private ultimaMensagemMs = 0;
  private intervaloBatimentoMs = 2000;
  private timerWatchdog: ReturnType<typeof setInterval> | null = null;
  private timerReconexao: ReturnType<typeof setTimeout> | null = null;
  private timerContagem: ReturnType<typeof setInterval> | null = null;
  private aoVisivel = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') this.verificarAgora(); };

  constructor(private readonly url: string, factory?: (url: string) => WebSocket, agora: () => number = () => Date.now()) {
    this.criar = factory ?? ((u: string) => new WebSocket(u));
    this.agora = agora;
    this.abrir();
    this.timerWatchdog = setInterval(() => this.vigiar(), 1000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.aoVisivel);
    if (typeof window !== 'undefined') window.addEventListener('online', this.aoVisivel);
  }

  // ─── Ligação e watchdog ────────────────────────────────────────────────

  private abrir(): void {
    this.ligacoes++;
    const primeira = this.ligacoes === 1;
    const ws = this.criar(this.url);
    this.ws = ws;
    this.ultimaMensagemMs = this.agora();
    ws.onmessage = (ev) => { if (ws === this.ws) this._processar(ev.data as string); };
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.ultimaMensagemMs = this.agora();
      this.mudarConexao({ fase: 'ok', tentativas: 0, proximaTentativaS: null, ultimaLeituraMs: null });
      // Volta de uma queda: o gateway reenvia o estado, mas a CONFIG da ESP só se ele a tiver guardado
      if (!primeira) ws.send(JSON.stringify({ tipo: 'CMD_OBTER_CONFIG' }));
    };
    ws.onerror = () => { if (ws === this.ws) this.caiu('erro'); };
    ws.onclose = () => { if (ws === this.ws) this.caiu('fechada pelo gateway/rede'); };
  }

  /** A ligação atual caiu (ou foi declarada morta): agenda a próxima tentativa. */
  private caiu(_motivo: string): void {
    if (this.fechada || this._status.fase === 'reconectando') return;
    this.desligarSocket();
    // Sem ligação não há serial: quem ouve 'status' (medição, jogos) vê a queda como sempre viu
    this._status = { ...this._status, conectado: false };
    this._emitir('status', { conectado: false } as any);
    const tentativa = this._status.tentativas + 1;
    const esperaS = BACKOFF_S[Math.min(tentativa, BACKOFF_S.length) - 1]!;
    this.mudarConexao({ fase: 'reconectando', tentativas: tentativa, proximaTentativaS: esperaS, temBatimento: false, ultimaLeituraMs: null });

    this.timerContagem = setInterval(() => {
      const restante = (this._status.proximaTentativaS ?? 1) - 1;
      if (restante > 0) this.mudarConexao({ proximaTentativaS: restante });
    }, 1000);
    this.timerReconexao = setTimeout(() => {
      this.limparTimersReconexao();
      if (this.fechada) return;
      this.mudarConexao({ fase: 'conectando', proximaTentativaS: null });
      this.abrir();
    }, esperaS * 1000);
  }

  private desligarSocket(): void {
    const ws = this.ws;
    ws.onmessage = null; ws.onopen = null; ws.onerror = null; ws.onclose = null;
    try { if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(); } catch { /* já fechado */ }
  }

  private limparTimersReconexao(): void {
    if (this.timerReconexao) { clearTimeout(this.timerReconexao); this.timerReconexao = null; }
    if (this.timerContagem) { clearInterval(this.timerContagem); this.timerContagem = null; }
  }

  /** Roda 1×/s: ligação aberta mas muda por 3 batimentos → morta. Só quando o gateway tem batimento. */
  private vigiar(): void {
    if (this.fechada || this._status.fase !== 'ok' || !this._status.temBatimento) return;
    if (this.agora() - this.ultimaMensagemMs > BATIMENTOS_PERDIDOS * this.intervaloBatimentoMs) this.caiu('sem batimento');
  }

  /** Volta ao primeiro plano / rede voltou: não espera o backoff. */
  private verificarAgora(): void {
    if (this.fechada) return;
    if (this._status.fase === 'reconectando') {
      this.limparTimersReconexao();
      this.mudarConexao({ fase: 'conectando', proximaTentativaS: null });
      this.abrir();
    } else if (this._status.fase === 'ok') {
      this.vigiar();
    }
  }

  private mudarConexao(parcial: Partial<StatusFonteWS>): void {
    this._status = { ...this._status, ...parcial };
    this._emitir('conexao', this._status);
  }

  private _processar(json: string): void {
    let msg: any;
    try { msg = JSON.parse(json); } catch { return; }
    this.ultimaMensagemMs = this.agora();

    switch (msg.tipo) {
      case 'LEITURA': {
        // forcaBruta nunca é exposta para o consumidor
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { forcaBruta: _fb, ...leitura } = msg.carga ?? {};
        this._status = { ...this._status, ultimaLeituraMs: this.ultimaMensagemMs };
        this._emitir('dados', leitura as LeituraProcessada);
        break;
      }
      case 'SAUDE': {
        const s = msg.carga as Partial<SaudeGateway> | undefined;
        if (!s) break;
        if (typeof s.intervaloMs === 'number' && s.intervaloMs > 0) this.intervaloBatimentoMs = s.intervaloMs;
        const serial = (s.serial ?? 'desconhecida') as SerialGateway;
        const conectado = serial === 'conectada';
        const mudouSerial = conectado !== this._status.conectado;
        this.mudarConexao({ temBatimento: true, serial, conectado });
        if (mudouSerial) this._emitir('status', { conectado } as any);
        this._emitir('saude', { serial, taxaHz: s.taxaHz ?? 0, uptimeS: s.uptimeS ?? 0, clientes: s.clientes ?? 0, intervaloMs: this.intervaloBatimentoMs });
        break;
      }
      case 'CONFIG':
        this._emitir('config', msg.carga);
        break;
      case 'STATUS':
        this._emitir('status', msg.carga);
        break;
      case 'PIPELINE_ESTADO':
        this.cfgGateway = msg.carga as EstadoPipeline;
        this._emitir('config', msg.carga);
        break;
      case 'SERIAL_OFF':
        this._status = { ...this._status, conectado: false, serial: 'sem_dispositivo' };
        this._emitir('status', { conectado: false } as any);
        this._emitir('conexao', this._status);
        break;
      case 'SERIAL_OK':
        this._status = { ...this._status, conectado: true, serial: 'conectada' };
        this._emitir('status', { conectado: true } as any);
        this._emitir('conexao', this._status);
        break;
      case 'GRAVACAO_ESTADO':
        this.gravacaoRemota = msg.carga as EstadoGravacaoRemota;
        this._emitir('gravacao', this.gravacaoRemota);
        break;
    }
  }

  /** true depois que o gateway anunciou GRAVACAO_ESTADO (app Android); gateways antigos nunca anunciam. */
  get suportaGravacaoRemota(): boolean { return this.gravacaoRemota !== null; }

  obterEstadoGravacao(): EstadoGravacaoRemota | null { return this.gravacaoRemota; }

  iniciarGravacaoRemota(nome: string): void {
    this.enviarComando({ tipo: 'GRAVACAO_INICIAR', carga: { nome } });
  }

  pararGravacaoRemota(): void {
    this.enviarComando({ tipo: 'GRAVACAO_PARAR' });
  }

  private _emitir<K extends keyof EventosDadosWS>(evento: K, detalhe: EventosDadosWS[K]): void {
    (this.ouvintes[evento] ?? []).forEach(fn => fn(detalhe));
  }

  on<K extends keyof EventosDadosWS>(evento: K, fn: Ouvinte<EventosDadosWS[K]>): void {
    if (!this.ouvintes[evento]) this.ouvintes[evento] = [];
    (this.ouvintes[evento] as Array<Ouvinte<EventosDadosWS[K]>>).push(fn);
  }

  /** Espera a PRIMEIRA ligação abrir (a tela de Conexão decide se deu certo); depois disso o watchdog cuida. */
  aguardarConexao(timeoutMs = 5000): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout: gateway não respondeu em ${timeoutMs}ms`)),
        timeoutMs,
      );
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Erro ao conectar ao gateway')); }, { once: true });
    });
  }

  enviarComando(comando: object): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(comando));
  }

  atualizarConfigPipeline(patch: PipelinePatch): void {
    // Atualiza o pipeline do gateway via WebSocket
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ tipo: 'PIPELINE_CONFIG', carga: patch }));
    }
    // Atualização otimista do cache local para resposta imediata da UI
    for (const k of Object.keys(patch) as (keyof PipelinePatch)[]) {
      if (patch[k] != null) (this.cfgGateway as Record<string, unknown>)[k] = patch[k];
    }
  }

  obterConfigPipeline(): EstadoPipeline {
    return this.cfgGateway;
  }

  obterStatus(): StatusFonteWS {
    return this._status;
  }

  /** Encerra de vez (usuário desconectou): sem reconexão. */
  fechar(): void {
    this.fechada = true;
    this.limparTimersReconexao();
    if (this.timerWatchdog) { clearInterval(this.timerWatchdog); this.timerWatchdog = null; }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.aoVisivel);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.aoVisivel);
    this.desligarSocket();
    this.mudarConexao({ fase: 'fechada', proximaTentativaS: null });
  }
}
