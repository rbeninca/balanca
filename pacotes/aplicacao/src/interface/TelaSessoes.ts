import type { ArmazenamentoLocal, SessaoLocal } from '../armazenamento/ArmazenamentoLocal.js';
import { analisarMotor } from '@balancagfig/analise';
import { gerarPDF } from '@balancagfig/relatorio';
import { exportarCSV } from '@balancagfig/relatorio';
import { TelaAnalise } from './TelaAnalise.js';

export class TelaSessoes {
  constructor(
    container: HTMLElement,
    private armazenamento: ArmazenamentoLocal,
    private onMedicao: () => void,
    private onConfiguracoes: () => void,
  ) {
    this.renderizar(container);
  }

  private async renderizar(container: HTMLElement) {
    container.innerHTML = `
      <div class="nav-links">
        <a href="#" id="nav-medir">Medição</a>
        <a href="#" id="nav-sessoes" class="ativo">Sessões</a>
        <a href="#" id="nav-config">Configurações</a>
      </div>
      <div class="card">
        <h2>Sessões Gravadas</h2>
        <div id="lista-conteudo"><div class="vazio">Carregando...</div></div>
      </div>
    `;

    container.querySelector('#nav-medir')!.addEventListener('click', (e) => {
      e.preventDefault();
      this.onMedicao();
    });
    container.querySelector('#nav-config')!.addEventListener('click', (e) => {
      e.preventDefault();
      this.onConfiguracoes();
    });

    const sessoes = await this.armazenamento.listarSessoes();
    const lista   = container.querySelector<HTMLElement>('#lista-conteudo')!;

    if (sessoes.length === 0) {
      lista.innerHTML = '<div class="vazio">Nenhuma sessão gravada.</div>';
      return;
    }

    const ul = document.createElement('ul');
    ul.setAttribute('data-testid', 'lista-sessoes');
    ul.style.listStyle = 'none';

    for (const s of sessoes) {
      const li = await this.criarItem(s);
      ul.appendChild(li);
    }

    lista.innerHTML = '';
    lista.appendChild(ul);
  }

  private async criarItem(s: SessaoLocal): Promise<HTMLLIElement> {
    const li = document.createElement('li');
    li.className = 'sessao-item';

    const leituras = await this.armazenamento.obterLeituras(s.id);
    let motorBadge = '';
    let nomeMotor  = '';

    if (leituras.length > 0) {
      try {
        const analise = analisarMotor(leituras, {});
        nomeMotor = analise.nomeComum;
        motorBadge = `<span class="motor-badge" data-testid="nome-motor">${analise.letraMotor}</span>`;
      } catch { /* sem queima — sem badge */ }
    }

    const dataFmt = new Date(s.criadoEm).toLocaleString('pt-BR');

    li.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="nome">${s.nome} ${motorBadge}</div>
        <div class="meta">${dataFmt} — ${leituras.length} leituras${nomeMotor ? ' — ' + nomeMotor : ''}</div>
      </div>
      <div class="sessao-acoes">
        <button class="btn-outline btn-sm btn-analisar" data-id="${s.id}" title="Analisar sessão">Analisar</button>
        <button class="btn-secondary btn-sm btn-csv"     data-id="${s.id}" title="Baixar CSV">CSV</button>
        <button class="btn-secondary btn-sm btn-pdf"     data-id="${s.id}" title="Baixar PDF">PDF</button>
        <button class="btn-secondary btn-sm btn-excluir" data-id="${s.id}" title="Excluir sessão" style="color:#ef5350">Excluir</button>
      </div>
    `;

    // Analisar
    li.querySelector('.btn-analisar')!.addEventListener('click', async () => {
      const ls = await this.armazenamento.obterLeituras(s.id);
      new TelaAnalise(
        { leituras: ls, nomeSessao: s.nome, modo: 'revisao', idSessao: s.id },
        this.armazenamento,
        () => {},
      );
    });

    // CSV
    li.querySelector('.btn-csv')!.addEventListener('click', async () => {
      const ls = await this.armazenamento.obterLeituras(s.id);
      const data = new Date(s.criadoEm).toLocaleDateString('pt-BR');
      let csv: string;
      try {
        const analise = analisarMotor(ls, {});
        csv = exportarCSV(ls, analise, { nomeSessao: s.nome, data });
      } catch {
        csv = exportarCSV(ls, undefined, { nomeSessao: s.nome, data });
      }
      this.baixarArquivo(new Blob([csv], { type: 'text/csv' }), `${s.nome}.csv`);
    });

    // PDF
    li.querySelector('.btn-pdf')!.addEventListener('click', async () => {
      const ls = await this.armazenamento.obterLeituras(s.id);
      try {
        const data    = new Date(s.criadoEm).toLocaleDateString('pt-BR');
        const analise = analisarMotor(ls, {});
        const blob    = gerarPDF(ls, analise, { nomeSessao: s.nome, data });
        const url     = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (e) {
        alert(`Não foi possível gerar o PDF: ${String(e)}\n\nA sessão precisa ter pelo menos uma leitura em queima.`);
      }
    });

    // Excluir
    li.querySelector('.btn-excluir')!.addEventListener('click', async () => {
      if (confirm(`Excluir sessão "${s.nome}"?`)) {
        await this.armazenamento.excluirSessao(s.id);
        li.remove();
      }
    });

    return li;
  }

  private baixarArquivo(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
