import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { GerenciadorSessao } from '../nucleo/GerenciadorSessao.js';
import { CMD_TARAR } from '@balancagfig/protocolo';

type Fonte = {
  on(evento: 'dados', fn: (l: LeituraProcessada) => void): void;
  enviarComando?(cmd: object): void;
  fechar?(): void;
  desconectar?(): Promise<void>;
};

export class TelaMedicao {
  private gravando = false;
  private nomeSessao = '';

  constructor(
    container: HTMLElement,
    private fonte: Fonte,
    private gerenciador: GerenciadorSessao,
    private onSessoes: () => void,
  ) {
    this.renderizar(container);
    this.fonte.on('dados', (l) => this.atualizarForca(l));
  }

  private renderizar(container: HTMLElement) {
    container.innerHTML = `
      <div class="nav-links">
        <a href="#" id="nav-medir" class="ativo">Medição</a>
        <a href="#" id="nav-sessoes">Sessões</a>
      </div>

      <div class="card">
        <div data-testid="valor-forca" class="valor-forca">
          <span id="valor-num">0.00</span><span class="unidade"> N</span>
        </div>
        <div class="info-row">
          <span>Temperatura</span>
          <span id="val-temp">—</span>
        </div>
        <div class="info-row">
          <span>Impulso acumulado</span>
          <span id="val-impulso">0.000 N·s</span>
        </div>
        <div class="info-row">
          <span>Em queima</span>
          <span id="val-queima">Não</span>
        </div>
      </div>

      <div class="card">
        <h2>Gravação <span id="badge-gravando" class="gravando-badge hidden">REC</span></h2>
        <div style="margin-bottom:0.75rem">
          <label for="nome-sessao" style="margin-top:0">Nome da Sessão</label>
          <input id="nome-sessao" type="text" placeholder="Sessão ${new Date().toLocaleDateString('pt-BR')}">
        </div>
        <div class="controles">
          <button id="btn-iniciar" class="btn-primary">Iniciar</button>
          <button id="btn-parar" class="btn-danger hidden">Parar</button>
          <button id="btn-tarar" class="btn-secondary">Tarar</button>
        </div>
        <div id="status-grav" class="status-box hidden" style="margin-top:0.75rem"></div>
      </div>
    `;

    this.bindEventos(container);
  }

  private atualizarForca(l: LeituraProcessada) {
    const valNum = document.getElementById('valor-num');
    if (valNum) valNum.textContent = l.forcaNewton.toFixed(2);

    const valTemp = document.getElementById('val-temp');
    if (valTemp) valTemp.textContent = l.temperatura != null ? `${l.temperatura.toFixed(1)} °C` : '—';

    const valImpulso = document.getElementById('val-impulso');
    if (valImpulso) valImpulso.textContent = `${(l.impulsoAcumuladoNs / 1_000_000).toFixed(3)} N·s`;

    const valQueima = document.getElementById('val-queima');
    if (valQueima) {
      valQueima.textContent = l.emQueima ? 'Sim' : 'Não';
      valQueima.style.color = l.emQueima ? '#4caf50' : '#888';
    }

    if (this.gravando) {
      this.gerenciador.adicionarLeitura(l).catch(() => {/* ignora */});
    }
  }

  private bindEventos(container: HTMLElement) {
    const btnIniciar = container.querySelector<HTMLButtonElement>('#btn-iniciar')!;
    const btnParar = container.querySelector<HTMLButtonElement>('#btn-parar')!;
    const btnTarar = container.querySelector<HTMLButtonElement>('#btn-tarar')!;
    const badgeGravando = container.querySelector<HTMLElement>('#badge-gravando')!;
    const inputNome = container.querySelector<HTMLInputElement>('#nome-sessao')!;
    const statusGrav = container.querySelector<HTMLElement>('#status-grav')!;

    container.querySelector('#nav-sessoes')!.addEventListener('click', (e) => {
      e.preventDefault();
      this.onSessoes();
    });

    btnIniciar.addEventListener('click', async () => {
      this.nomeSessao = inputNome.value.trim() || `Sessão ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`;
      await this.gerenciador.iniciarGravacao(this.nomeSessao);
      this.gravando = true;
      btnIniciar.classList.add('hidden');
      btnParar.classList.remove('hidden');
      badgeGravando.classList.remove('hidden');
      statusGrav.className = 'status-box ok';
      statusGrav.textContent = `Gravando: ${this.nomeSessao}`;
      statusGrav.classList.remove('hidden');
    });

    btnParar.addEventListener('click', async () => {
      this.gravando = false;
      const sessao = await this.gerenciador.pararGravacao();
      btnIniciar.classList.remove('hidden');
      btnParar.classList.add('hidden');
      badgeGravando.classList.add('hidden');
      statusGrav.className = 'status-box ok';
      statusGrav.textContent = `Sessão salva — ${sessao.totalLeituras} leituras, F_máx ${sessao.forcaMaximaN.toFixed(1)} N`;
    });

    btnTarar.addEventListener('click', () => {
      if (this.fonte.enviarComando) {
        this.fonte.enviarComando({ tipo: 'COMANDO', comando: 'TARAR', codigo: CMD_TARAR });
      }
    });
  }
}
