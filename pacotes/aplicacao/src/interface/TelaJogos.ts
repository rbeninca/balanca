import { CATALOGO_JOGOS } from '../jogos/CatalogoJogos.js';
import { abrirJogo } from '../jogos/LancadorJogos.js';
import { navHtml, bindNav, type StatusConexao } from './navBar.js';

export class TelaJogos {
  constructor(
    container: HTMLElement,
    private onConexao: () => void,
    private onMedicao: () => void,
    private onAbrirModulo: (idJogo: string) => void,
    private onSessoes: () => void,
    private onConfiguracoes: () => void,
    private onFirmware: () => void,
    private status?: StatusConexao,
  ) {
    this.renderizar(container);
  }

  private renderizar(container: HTMLElement) {
    const cards = CATALOGO_JOGOS.map(jogo => `
      <article class="jogo-card" data-jogo-id="${jogo.id}">
        <div class="jogo-card-header">
          <div>
            <h3>${jogo.nome}</h3>
            <div class="jogo-meta">${jogo.categoria}</div>
          </div>
          <span class="jogo-origem ${jogo.destaque ? 'destaque' : ''}">${jogo.origem === 'legado-v1' ? 'Legado v1' : 'Nativo'}</span>
        </div>
        <p class="jogo-desc">${jogo.descricao}</p>
        <div class="jogo-tags">
          ${jogo.etiquetas.map(tag => `<span class="jogo-tag">${tag}</span>`).join('')}
        </div>
        <div class="jogo-footer">
          <span class="jogo-meta">${jogo.modoExecucao === 'popup' ? 'Abre em nova janela' : 'Embutido na plataforma'}</span>
          <button class="btn-primary btn-sm btn-abrir-jogo" data-jogo-id="${jogo.id}">Abrir</button>
        </div>
      </article>
    `).join('');

    container.innerHTML = `
      ${navHtml({
        ativo: 'jogos',
        onConexao: this.onConexao,
        onMedicao: this.onMedicao,
        onJogos: () => {},
        onSessoes: this.onSessoes,
        onConfiguracoes: this.onConfiguracoes,
        onFirmware: this.onFirmware,
        ...(this.status && { status: this.status }),
      })}

      <div class="card">
        <h2>Plataforma de Jogos e Experimentos</h2>
        <div id="jogos-status" class="status-box ok">
          A leitura ao vivo da balança agora alimenta tanto módulos nativos quanto jogos legados via ponte de compatibilidade.
          O Martelo do Thor já foi reescrito e os demais podem migrar no mesmo formato.
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
          <div>
            <h2 style="margin:0">Catálogo Inicial</h2>
            <p style="margin-top:0.4rem;font-size:0.85rem;color:#6b7280;line-height:1.5">
              O catálogo já mistura duas camadas: um primeiro módulo nativo reescrito para a plataforma atual
              e os jogos da balancaGFIGv1 rodando pela ponte de compatibilidade. Isso acelera a migração sem
              travar o desenvolvimento de soluções novas.
            </p>
          </div>
        </div>
        <div class="jogos-grid" style="margin-top:1rem">
          ${cards}
        </div>
      </div>
    `;

    bindNav(container, {
      ativo: 'jogos',
      onConexao: this.onConexao,
      onMedicao: this.onMedicao,
      onJogos: () => {},
      onSessoes: this.onSessoes,
      onConfiguracoes: this.onConfiguracoes,
      onFirmware: this.onFirmware,
      ...(this.status && { status: this.status }),
    });

    container.querySelectorAll<HTMLButtonElement>('.btn-abrir-jogo').forEach(btn => {
      btn.addEventListener('click', () => this.abrir(btn.dataset.jogoId ?? '', container));
    });
  }

  private abrir(idJogo: string, container: HTMLElement): void {
    const jogo = CATALOGO_JOGOS.find(item => item.id === idJogo);
    if (!jogo) return;

    if (jogo.modoExecucao === 'embutido') {
      this.onAbrirModulo(jogo.id);
      return;
    }

    const janela = abrirJogo(jogo, { baseUrl: import.meta.env.BASE_URL });
    const status = container.querySelector<HTMLElement>('#jogos-status');
    if (!status) return;

    if (!janela) {
      status.className = 'status-box erro';
      status.textContent = 'O navegador bloqueou a nova janela. Libere popups para usar os jogos.';
      return;
    }

    status.className = 'status-box ok';
    status.textContent = `Abrindo "${jogo.nome}" em nova janela.`;
  }
}
