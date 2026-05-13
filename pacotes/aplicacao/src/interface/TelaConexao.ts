import { FonteWebSocket } from '../adaptadores/FonteWebSocket.js';
import { FonteWebSerial } from '../adaptadores/FonteWebSerial.js';

type ModoConexao = 'tvbox' | 'webserial';

interface ConfigSalva {
  modo: ModoConexao;
  ip: string;
  chave: string;
}

const CHAVE_LS = 'balancagfig:conexao';

function carregarConfig(): ConfigSalva {
  try {
    const raw = localStorage.getItem(CHAVE_LS);
    if (raw) return JSON.parse(raw) as ConfigSalva;
  } catch { /* ignora */ }
  return { modo: 'tvbox', ip: '', chave: '' };
}

function salvarConfig(cfg: ConfigSalva) {
  localStorage.setItem(CHAVE_LS, JSON.stringify(cfg));
}

export class TelaConexao {
  private cfg: ConfigSalva;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(container: HTMLElement, private onConectado: (fonte: any) => void) {
    this.cfg = carregarConfig();
    this.renderizar(container);
  }

  private renderizar(container: HTMLElement) {
    const cfg = this.cfg;

    container.innerHTML = `
      <h1>BalançaGFIG</h1>

      <div class="card">
        <h2>Detecção de Ambiente</h2>
        <div data-testid="status-deteccao" class="status-box">Aguardando seleção de modo...</div>
      </div>

      <div class="card">
        <h2>Modo de Conexão</h2>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" name="modo" value="tvbox" ${cfg.modo === 'tvbox' ? 'checked' : ''}>
            TVBox / Gateway (Cenário A)
          </label>
          <label class="radio-label">
            <input type="radio" name="modo" value="webserial" ${cfg.modo === 'webserial' ? 'checked' : ''}>
            WebSerial — Conexão Direta (Cenário C)
          </label>
        </div>

        <div id="campos-tvbox" class="${cfg.modo !== 'tvbox' ? 'hidden' : ''}">
          <label for="campo-ip">Endereço IP</label>
          <input id="campo-ip" type="text" placeholder="192.168.1.100" value="${cfg.ip}">

          <label for="campo-chave">Chave de API</label>
          <input id="campo-chave" type="password" placeholder="opcional" value="${cfg.chave}">
        </div>

        <div id="lista-portas" data-testid="lista-portas" class="${cfg.modo !== 'webserial' ? 'hidden' : ''}">
          <ul class="ports-list" id="ul-portas">
            <li style="color:#666">Clique em Conectar para selecionar a porta serial...</li>
          </ul>
        </div>

        <div class="btn-row">
          <button id="btn-conectar" class="btn-primary">Conectar</button>
        </div>
      </div>
    `;

    this.bindEventos(container);
  }

  private bindEventos(container: HTMLElement) {
    const statusEl = container.querySelector<HTMLElement>('[data-testid="status-deteccao"]')!;
    const camposTVBox = container.querySelector<HTMLElement>('#campos-tvbox')!;
    const listaPorts = container.querySelector<HTMLElement>('#lista-portas')!;
    const inputIP = container.querySelector<HTMLInputElement>('#campo-ip')!;
    const inputChave = container.querySelector<HTMLInputElement>('#campo-chave')!;
    const btnConectar = container.querySelector<HTMLButtonElement>('#btn-conectar')!;

    const radios = container.querySelectorAll<HTMLInputElement>('input[name="modo"]');

    const atualizarModo = (modo: ModoConexao) => {
      this.cfg.modo = modo;
      salvarConfig(this.cfg);
      if (modo === 'tvbox') {
        camposTVBox.classList.remove('hidden');
        listaPorts.classList.add('hidden');
        statusEl.className = 'status-box';
        statusEl.textContent = 'Modo TVBox — insira o IP do gateway.';
      } else {
        camposTVBox.classList.add('hidden');
        listaPorts.classList.remove('hidden');
        const webSerialOk = !!(navigator as unknown as Record<string, unknown>)['serial'];
        if (webSerialOk) {
          statusEl.className = 'status-box ok';
          statusEl.textContent = 'WebSerial disponível neste navegador.';
        } else {
          statusEl.className = 'status-box erro';
          statusEl.textContent = 'WebSerial não disponível — use Chrome/Edge ou conexão via TVBox.';
        }
      }
    };

    radios.forEach(r => {
      r.addEventListener('change', () => {
        if (r.checked) atualizarModo(r.value as ModoConexao);
      });
    });

    inputIP.addEventListener('input', () => {
      this.cfg.ip = inputIP.value;
      salvarConfig(this.cfg);
    });

    inputChave.addEventListener('input', () => {
      this.cfg.chave = inputChave.value;
      salvarConfig(this.cfg);
    });

    // Estado inicial
    atualizarModo(this.cfg.modo);

    btnConectar.addEventListener('click', async () => {
      btnConectar.disabled = true;
      btnConectar.textContent = 'Conectando...';
      statusEl.className = 'status-box aviso';
      statusEl.textContent = 'Conectando...';

      try {
        if (this.cfg.modo === 'tvbox') {
          const ip = this.cfg.ip || 'localhost';
          const fonte = new FonteWebSocket(`ws://${ip}:8765`);
          statusEl.textContent = `Aguardando gateway em ${ip}:8765...`;
          await fonte.aguardarConexao();
          statusEl.className = 'status-box ok';
          statusEl.textContent = `Conectado ao gateway em ${ip}:8765`;
          this.onConectado(fonte);
        } else {
          const fonte = new FonteWebSerial();
          await fonte.conectar();
          statusEl.className = 'status-box ok';
          statusEl.textContent = 'Porta serial aberta.';
          this.onConectado(fonte);
        }
      } catch (err) {
        statusEl.className = 'status-box erro';
        statusEl.textContent = `Erro: ${String(err)}`;
        btnConectar.disabled = false;
        btnConectar.textContent = 'Conectar';
      }
    });
  }
}
