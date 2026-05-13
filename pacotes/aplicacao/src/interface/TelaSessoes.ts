import type { ArmazenamentoLocal, SessaoLocal } from '../armazenamento/ArmazenamentoLocal.js';
import { analisarMotor } from '@balancagfig/analise';

export class TelaSessoes {
  constructor(
    container: HTMLElement,
    private armazenamento: ArmazenamentoLocal,
    private onMedicao: () => void,
  ) {
    this.renderizar(container);
  }

  private async renderizar(container: HTMLElement) {
    container.innerHTML = `
      <div class="nav-links">
        <a href="#" id="nav-medir">Medição</a>
        <a href="#" id="nav-sessoes" class="ativo">Sessões</a>
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

    const sessoes = await this.armazenamento.listarSessoes();
    const lista = container.querySelector<HTMLElement>('#lista-conteudo')!;

    if (sessoes.length === 0) {
      lista.innerHTML = '<div class="vazio">Nenhuma sessão gravada.</div>';
      return;
    }

    const ul = document.createElement('ul');
    ul.setAttribute('data-testid', 'lista-sessoes');
    ul.style.listStyle = 'none';

    for (const s of sessoes) {
      const li = await this.criarItemSessao(s);
      ul.appendChild(li);
    }

    lista.innerHTML = '';
    lista.appendChild(ul);
  }

  private async criarItemSessao(s: SessaoLocal): Promise<HTMLLIElement> {
    const li = document.createElement('li');
    li.className = 'sessao-item';

    const leituras = await this.armazenamento.obterLeituras(s.id);
    let motorBadge = '';
    let nomeMotor = '';

    if (leituras.length > 0) {
      try {
        const analise = analisarMotor(leituras, { massaPropelente_g: undefined });
        nomeMotor = analise.classificacaoNAR ?? '';
        if (nomeMotor) {
          motorBadge = `<span class="motor-badge" data-testid="nome-motor">${nomeMotor}</span>`;
        }
      } catch { /* sem análise */ }
    }

    const dataFormatada = new Date(s.criadoEm).toLocaleString('pt-BR');

    li.innerHTML = `
      <div>
        <div class="nome">Sessão ${s.nome} ${motorBadge}</div>
        <div class="meta">${dataFormatada} — ${leituras.length} leituras</div>
      </div>
      <div style="display:flex;gap:0.5rem">
        <button class="btn-secondary btn-excluir" data-id="${s.id}" style="font-size:0.8rem;padding:0.35rem 0.6rem">Excluir</button>
      </div>
    `;

    li.querySelector('.btn-excluir')!.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset['id']!;
      if (confirm(`Excluir sessão "${s.nome}"?`)) {
        await this.armazenamento.excluirSessao(id);
        li.remove();
      }
    });

    return li;
  }
}
