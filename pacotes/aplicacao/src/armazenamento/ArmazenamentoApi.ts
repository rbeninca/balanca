import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { exportarCSV } from '@balancagfig/relatorio';
import type { IArmazenamento, SessaoLocal, MetadadosLocal } from './ArmazenamentoLocal.js';

export class ArmazenamentoApi implements IArmazenamento {
  private readonly base: string;
  private readonly headersJson: Record<string, string>;  // POST/PUT com body JSON
  private readonly headersAuth: Record<string, string>;  // DELETE/GET autenticados sem body

  constructor(ip: string, chave: string) {
    this.base = `http://${ip}:3000`;
    const auth = chave ? { 'x-chave-api': chave } : {};
    this.headersJson = { 'Content-Type': 'application/json', ...auth };
    this.headersAuth = { ...auth };
  }

  async criarSessao(nome: string): Promise<SessaoLocal> {
    const res = await fetch(`${this.base}/sessoes`, {
      method: 'POST',
      headers: this.headersJson,
      body: JSON.stringify({ nome }),
    });
    if (!res.ok) throw new Error(`Erro ao criar sessão: ${res.status}`);
    const d = await res.json() as { id: string; nome: string; criado_em: string };
    return { id: d.id, nome: d.nome, criadoEm: d.criado_em };
  }

  async listarSessoes(): Promise<SessaoLocal[]> {
    const res = await fetch(`${this.base}/sessoes`);
    if (!res.ok) throw new Error(`Erro ao listar sessões: ${res.status}`);
    const lista = await res.json() as Array<{ id: string; nome: string; criado_em: string }>;
    return lista.map(s => ({ id: s.id, nome: s.nome, criadoEm: s.criado_em }));
  }

  async atualizarSessao(id: string, dados: Partial<Pick<SessaoLocal, 'nome' | 'criadoEm'>>): Promise<SessaoLocal> {
    const body: Record<string, string> = {};
    if (dados.nome     != null) body['nome']      = dados.nome;
    if (dados.criadoEm != null) body['criado_em'] = dados.criadoEm;
    const res = await fetch(`${this.base}/sessoes/${id}`, {
      method: 'PATCH',
      headers: this.headersJson,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Erro ao atualizar sessão: ${res.status}`);
    const d = await res.json() as { id: string; nome: string; criado_em: string };
    return { id: d.id, nome: d.nome, criadoEm: d.criado_em };
  }

  async excluirSessao(id: string): Promise<void> {
    const res = await fetch(`${this.base}/sessoes/${id}`, {
      method: 'DELETE',
      headers: this.headersAuth,
    });
    if (!res.ok && res.status !== 404) throw new Error(`Erro ao excluir sessão: ${res.status}`);
  }

  async adicionarLeituras(idSessao: string, leituras: LeituraProcessada[]): Promise<void> {
    const body = leituras.map(l => ({
      marca_temporal:       l.marcaTemporal,
      forca_newton:         l.forcaNewton,
      em_queima:            l.emQueima,
      impulso_acumulado_ns: l.impulsoAcumuladoNs,
    }));
    const res = await fetch(`${this.base}/sessoes/${idSessao}/leituras`, {
      method: 'POST',
      headers: this.headersJson,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Erro ao adicionar leituras: ${res.status}`);
  }

  async obterLeituras(idSessao: string): Promise<LeituraProcessada[]> {
    const res = await fetch(`${this.base}/sessoes/${idSessao}/leituras`);
    if (!res.ok) throw new Error(`Erro ao obter leituras: ${res.status}`);
    const lista = await res.json() as Array<{
      marca_temporal: number; forca_newton: number;
      em_queima: number; impulso_acumulado_ns: number;
    }>;
    return lista.map(l => ({
      marcaTemporal:       l.marca_temporal,
      forcaNewton:         l.forca_newton,
      emQueima:            l.em_queima !== 0,
      impulsoAcumuladoNs:  l.impulso_acumulado_ns,
    } as LeituraProcessada));
  }

  async exportarCSV(idSessao: string): Promise<string> {
    const leituras = await this.obterLeituras(idSessao);
    return exportarCSV(leituras);
  }

  async substituirLeituras(idSessao: string, leituras: LeituraProcessada[]): Promise<void> {
    const del = await fetch(`${this.base}/sessoes/${idSessao}/leituras`, {
      method: 'DELETE',
      headers: this.headersAuth,
    });
    if (!del.ok && del.status !== 404) throw new Error(`Erro ao apagar leituras: ${del.status}`);
    if (leituras.length === 0) return;
    await this.adicionarLeituras(idSessao, leituras);
  }

  async salvarMetadados(idSessao: string, meta: MetadadosLocal): Promise<void> {
    const res = await fetch(`${this.base}/sessoes/${idSessao}/metadados`, {
      method: 'POST',
      headers: this.headersJson,
      body: JSON.stringify({
        massa_propelente_g: meta.massaPropelente_g ?? null,
        massa_total_g:      meta.massaTotal_g ?? null,
        diametro_mm:        meta.diametro_mm ?? null,
        comprimento_mm:     meta.comprimento_mm ?? null,
        fabricante:         meta.fabricante ?? null,
        descricao:          meta.descricao ?? null,
        observacoes:        meta.observacoes ?? null,
      }),
    });
    if (!res.ok) throw new Error(`Erro ao salvar metadados: ${res.status}`);
  }

  async obterMetadados(idSessao: string): Promise<MetadadosLocal | null> {
    const res = await fetch(`${this.base}/sessoes/${idSessao}/metadados`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Erro ao obter metadados: ${res.status}`);
    const d = await res.json() as {
      massa_propelente_g: number | null; massa_total_g: number | null;
      diametro_mm: number | null; comprimento_mm: number | null;
      fabricante: string | null; descricao: string | null; observacoes: string | null;
    };
    const meta: MetadadosLocal = {};
    if (d.massa_propelente_g != null) meta.massaPropelente_g = d.massa_propelente_g;
    if (d.massa_total_g      != null) meta.massaTotal_g      = d.massa_total_g;
    if (d.diametro_mm        != null) meta.diametro_mm       = d.diametro_mm;
    if (d.comprimento_mm     != null) meta.comprimento_mm    = d.comprimento_mm;
    if (d.fabricante         != null) meta.fabricante        = d.fabricante;
    if (d.descricao          != null) meta.descricao         = d.descricao;
    if (d.observacoes        != null) meta.observacoes       = d.observacoes;
    return meta;
  }
}
