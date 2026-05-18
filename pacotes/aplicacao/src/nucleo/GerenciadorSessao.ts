import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { IArmazenamento } from '../armazenamento/ArmazenamentoLocal.js';

export interface SessaoTeste {
  id: string;
  nome: string;
  totalLeituras: number;
  forcaMaximaN: number;
  impulsoTotalNs: number;
}

const TAMANHO_LOTE = 50;

export class GerenciadorSessao {
  private idSessaoAtual: string | null = null;
  private buffer: LeituraProcessada[] = [];

  constructor(private readonly armazenamento: IArmazenamento) {}

  async iniciarGravacao(nome: string): Promise<{ id: string }> {
    const sessao = await this.armazenamento.criarSessao(nome);
    this.idSessaoAtual = sessao.id;
    this.buffer = [];
    return { id: sessao.id };
  }

  async adicionarLeitura(leitura: LeituraProcessada): Promise<void> {
    if (!this.idSessaoAtual) throw new Error('Nenhuma sessão ativa — chame iniciarGravacao() primeiro');
    this.buffer.push(leitura);
    if (this.buffer.length >= TAMANHO_LOTE) {
      await this._flush();
    }
  }

  async pararGravacao(): Promise<SessaoTeste> {
    if (!this.idSessaoAtual) throw new Error('Nenhuma sessão ativa — chame iniciarGravacao() primeiro');

    if (this.buffer.length > 0) {
      await this._flush();
    }

    const id = this.idSessaoAtual;
    const leituras = await this.armazenamento.obterLeituras(id);
    const forcaMaximaN = leituras.reduce((m, l) => Math.max(m, l.forcaNewton), 0);
    const impulsoTotalNs = leituras[leituras.length - 1]?.impulsoAcumuladoNs ?? 0;

    this.idSessaoAtual = null;
    this.buffer = [];

    return {
      id,
      nome: id,
      totalLeituras: leituras.length,
      forcaMaximaN,
      impulsoTotalNs,
    };
  }

  private async _flush(): Promise<void> {
    if (!this.idSessaoAtual || this.buffer.length === 0) return;
    const lote = this.buffer;
    this.buffer = [];
    await this.armazenamento.adicionarLeituras(this.idSessaoAtual, lote);
  }
}
