import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { ControladorGravacao, metricas, type FonteGravacao } from '../../src/nucleo/ControladorGravacao.js';
import { GerenciadorSessao } from '../../src/nucleo/GerenciadorSessao.js';
import { ArmazenamentoLocal } from '../../src/armazenamento/ArmazenamentoLocal.js';
import type { EstadoGravacaoRemota } from '../../src/adaptadores/FonteWebSocket.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function leitura(t: number, f: number, i: number): LeituraProcessada {
  return { marcaTemporal: t, forcaNewton: f, temperatura: 0, emQueima: f > 0, impulsoAcumuladoNs: i };
}

/** Fonte sem gravação remota (WebSerial / gateway antigo). */
class FonteSimples implements FonteGravacao {
  gravando: boolean[] = [];
  on(_evento: string, _fn: (v: unknown) => void): void { /* nunca emite gravacao */ }
  definirGravando(v: boolean) { this.gravando.push(v); }
  obterConfigPipeline() { return { filtroPrincipal: 'mediaMovel', janelaMediaMovel: 5 }; }
}

/** Simula o gateway Android: guarda o estado difundido e responde aos comandos. */
class FonteGatewaySimulado implements FonteGravacao {
  private ouvintes: Array<(e: EstadoGravacaoRemota) => void> = [];
  estado: EstadoGravacaoRemota = {
    gravando: false, idSessao: null, nome: null, inicioMs: null, amostras: 0, iniciadaPor: null, ultima: null,
    clientes: [{ endereco: '192.168.43.10', conectadoEm: 1 }],
  };
  anunciado = true;
  comandos: string[] = [];
  /** id que o "gateway" dará à próxima sessão. */
  proximoId = 's1';

  on(evento: string, fn: (v: any) => void): void { if (evento === 'gravacao') this.ouvintes.push(fn); }
  get suportaGravacaoRemota() { return this.anunciado; }
  obterEstadoGravacao() { return this.anunciado ? this.estado : null; }
  iniciarGravacaoRemota(nome: string) { this.comandos.push(`iniciar:${nome}`); }
  pararGravacaoRemota() { this.comandos.push('parar'); }

  /** O gateway difunde um estado novo (para todos os clientes). */
  difundir(parcial: Partial<EstadoGravacaoRemota>) {
    this.estado = { ...this.estado, ...parcial };
    this.ouvintes.forEach(fn => fn(this.estado));
  }
  gatewayIniciou(nome: string, por: string) {
    this.difundir({ gravando: true, idSessao: this.proximoId, nome, inicioMs: 1000, amostras: 0, iniciadaPor: por });
  }
  gatewayParou(por: string, amostras = 3) {
    const id = this.estado.idSessao!, nome = this.estado.nome!;
    this.difundir({ gravando: false, idSessao: null, nome: null, inicioMs: null, amostras: 0, iniciadaPor: null,
      ultima: { id, nome, amostras, paradaPor: por, emMs: 2000 } });
  }
}

function criarLocal() {
  const armazenamento = new ArmazenamentoLocal();
  const fonte = new FonteSimples();
  const controlador = new ControladorGravacao(fonte, new GerenciadorSessao(armazenamento), armazenamento);
  return { armazenamento, controlador, fonte };
}

function criarRemoto(timeout = 200) {
  const armazenamento = new ArmazenamentoLocal();   // faz o papel da API do gateway
  const fonte = new FonteGatewaySimulado();
  const controlador = new ControladorGravacao(fonte, new GerenciadorSessao(armazenamento), armazenamento, timeout);
  return { armazenamento, fonte, controlador };
}

describe('ControladorGravacao — modo local (WebSerial / GitHub Pages)', () => {
  it('sem capacidade remota grava pelo GerenciadorSessao, como sempre', async () => {
    const { armazenamento, controlador } = criarLocal();
    expect(controlador.remota).toBe(false);
    const estados: boolean[] = [];
    controlador.aoMudar(e => estados.push(e.gravando));

    const { id } = await controlador.iniciar('Local');
    controlador.adicionarLeitura(leitura(0, 1, 0));
    controlador.adicionarLeitura(leitura(10, 3, 0.02));
    expect(controlador.estado).toMatchObject({ gravando: true, remota: false, nome: 'Local', amostras: 2 });

    const r = await controlador.parar();
    expect(r.id).toBe(id);
    expect(r.leituras).toHaveLength(2);
    expect(r.forcaMaximaN).toBe(3);
    expect((await armazenamento.obterLeituras(id))).toHaveLength(2);
    expect(estados).toEqual([true, false]);
    expect(controlador.estado.gravando).toBe(false);
  });

  it('fotografa a configuração do pipeline na sessão ao iniciar a gravação local (Fase 10)', async () => {
    const { armazenamento, controlador } = criarLocal();
    const { id } = await controlador.iniciar('Cfg');
    await controlador.parar();
    const sessao = (await armazenamento.listarSessoes()).find(s => s.id === id);
    expect(sessao?.configPipeline).toEqual({ filtroPrincipal: 'mediaMovel', janelaMediaMovel: 5 });
  });

  it('avisa a fonte local para bloquear o zero tracking durante a gravação (Fase 8)', async () => {
    const { controlador, fonte } = criarLocal();
    await controlador.iniciar('ZT');
    await controlador.parar();
    expect(fonte.gravando).toEqual([true, false]);
  });
});

describe('ControladorGravacao — modo remoto (gateway Android)', () => {
  it('iniciar envia o comando e resolve quando o gateway confirma', async () => {
    const { fonte, controlador } = criarRemoto();
    expect(controlador.remota).toBe(true);
    const p = controlador.iniciar('Motor A');
    expect(fonte.comandos).toEqual(['iniciar:Motor A']);
    fonte.gatewayIniciou('Motor A', '192.168.43.10');
    expect(await p).toEqual({ id: 's1' });
    expect(controlador.estado).toMatchObject({ gravando: true, remota: true, nome: 'Motor A', iniciadaPor: '192.168.43.10' });
  });

  it('leituras recebidas não são reenviadas: o gateway já gravou', async () => {
    const { fonte, controlador, armazenamento } = criarRemoto();
    const antes = (await armazenamento.listarSessoes()).length;   // o IndexedDB simulado é compartilhado entre testes
    const p = controlador.iniciar('A'); fonte.gatewayIniciou('A', 'x'); await p;
    controlador.adicionarLeitura(leitura(0, 1, 0));
    expect((await armazenamento.listarSessoes()).length).toBe(antes);
  });

  it('o contador de amostras vem do gateway', async () => {
    const { fonte, controlador } = criarRemoto();
    const p = controlador.iniciar('A'); fonte.gatewayIniciou('A', 'x'); await p;
    fonte.difundir({ amostras: 240 });
    expect(controlador.estado.amostras).toBe(240);
  });

  it('parar espera a confirmação e busca as leituras da sessão no gateway', async () => {
    const { fonte, controlador, armazenamento } = criarRemoto();
    // sessão "gravada pelo gateway": simulada no armazenamento
    const sessao = await armazenamento.criarSessao('A');
    await armazenamento.adicionarLeituras(sessao.id, [leitura(0, 2, 0), leitura(10, 5, 0.05), leitura(20, 1, 0.08)]);
    fonte.proximoId = sessao.id;

    const pi = controlador.iniciar('A'); fonte.gatewayIniciou('A', 'eu'); await pi;
    const outro = vi.fn(); controlador.aoEncerradaPorOutro(outro);

    const pp = controlador.parar();
    expect(fonte.comandos).toContain('parar');
    fonte.difundir({ amostras: 3 });          // ainda gravando: não resolve
    fonte.gatewayParou('eu', 3);
    const r = await pp;
    expect(r).toMatchObject({ id: sessao.id, nome: 'A', totalLeituras: 3, forcaMaximaN: 5, impulsoTotalNs: 0.08 });
    expect(r.leituras).toHaveLength(3);
    expect(outro).not.toHaveBeenCalled();     // fui eu que parei
  });

  it('quando outro cliente inicia e para, este só é avisado (não abre análise)', async () => {
    const { fonte, controlador } = criarRemoto();
    const estados: Array<{ gravando: boolean; iniciadaPor: string | null }> = [];
    controlador.aoMudar(e => estados.push({ gravando: e.gravando, iniciadaPor: e.iniciadaPor }));
    const outro = vi.fn(); controlador.aoEncerradaPorOutro(outro);

    fonte.gatewayIniciou('Do vizinho', '192.168.43.99');
    expect(controlador.estado).toMatchObject({ gravando: true, iniciadaPor: '192.168.43.99', nome: 'Do vizinho' });
    fonte.gatewayParou('192.168.43.99', 42);
    expect(outro).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', nome: 'Do vizinho', amostras: 42, paradaPor: '192.168.43.99' }));
    expect(estados.map(e => e.gravando)).toEqual([true, false]);
  });

  it('iniciar com gravação em curso de outro cliente é recusado sem mandar comando', async () => {
    const { fonte, controlador } = criarRemoto();
    fonte.gatewayIniciou('X', 'outro');
    await expect(controlador.iniciar('Y')).rejects.toThrow(/em curso/);
    expect(fonte.comandos).toEqual([]);
  });

  it('sem confirmação do gateway, iniciar falha por timeout', async () => {
    const { controlador } = criarRemoto(30);
    await expect(controlador.iniciar('A')).rejects.toThrow(/não confirmou/);
  });

  it('o primeiro estado após conectar não dispara aviso de sessão antiga', () => {
    const armazenamento = new ArmazenamentoLocal();
    const fonte = new FonteGatewaySimulado();
    fonte.anunciado = false;                 // conectou, GRAVACAO_ESTADO ainda não chegou
    const controlador = new ControladorGravacao(fonte, new GerenciadorSessao(armazenamento), armazenamento);
    const outro = vi.fn(); controlador.aoEncerradaPorOutro(outro);
    fonte.anunciado = true;
    fonte.difundir({ ultima: { id: 'antiga', nome: 'ontem', amostras: 1, paradaPor: 'x', emMs: 1 } });
    expect(outro).not.toHaveBeenCalled();
    expect(controlador.remota).toBe(true);
    // uma parada nova, essa sim avisa
    fonte.gatewayIniciou('nova', 'y'); fonte.gatewayParou('y');
    expect(outro).toHaveBeenCalledTimes(1);
  });

  it('lista de clientes acompanha o estado', () => {
    const { fonte, controlador } = criarRemoto();
    fonte.difundir({ clientes: [{ endereco: 'a', conectadoEm: 1 }, { endereco: 'b', conectadoEm: 2 }] });
    expect(controlador.estado.clientes.map(c => c.endereco)).toEqual(['a', 'b']);
  });
});

describe('metricas', () => {
  it('calcula como o GerenciadorSessao', () => {
    expect(metricas([])).toEqual({ totalLeituras: 0, forcaMaximaN: 0, impulsoTotalNs: 0 });
    expect(metricas([leitura(0, 2, 0.1), leitura(1, 7, 0.4)])).toEqual({ totalLeituras: 2, forcaMaximaN: 7, impulsoTotalNs: 0.4 });
  });
});
