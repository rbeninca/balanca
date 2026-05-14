import { ESPLoader, Transport } from 'esptool-js';
import { navHtml, bindNav, type NavProps } from './navBar.js';

const CHAVE_LS = 'balancagfig:conexao';

interface VersaoFirmware {
  versao: string;
  protocolo: number;
  plataforma: string;
  baud: number;
}

export class TelaFirmware {
  private urlAtualizador: string | null = null;
  private webSerialDisponivel: boolean = false;
  private abortController: AbortController | null = null;

  constructor(container: HTMLElement, private nav: Omit<NavProps, 'ativo'>) {
    this.urlAtualizador      = this.resolverUrlAtualizador();
    this.webSerialDisponivel = 'serial' in navigator;
    this.renderizar(container);
    void this.carregarVersao(container);
  }

  private resolverUrlAtualizador(): string | null {
    try {
      const raw = localStorage.getItem(CHAVE_LS);
      const cfg = raw ? JSON.parse(raw) as { modo: string; ip: string } : null;
      if (cfg?.modo === 'tvbox') {
        const ip = cfg.ip || 'localhost';
        return `http://${ip}:8767`;
      }
    } catch { /* ignora */ }
    return null;
  }

  private renderizar(container: HTMLElement) {
    const temCenarioA = this.urlAtualizador !== null;
    const temCenarioC = this.webSerialDisponivel;

    const motGateway = temCenarioA
      ? null
      : 'Disponível somente quando a última conexão foi via TVBox/Gateway (Cenário A).';
    const motBrowser = temCenarioC
      ? null
      : 'Requer Chrome ou Edge. WebSerial não está disponível neste navegador.';

    container.innerHTML = `
      ${navHtml({ ativo: 'firmware', ...this.nav })}

      <div class="card">
        <h2>Atualização de Firmware</h2>
        <div id="fw-versao" class="status-box">Carregando informações...</div>
        <img src="${import.meta.env.BASE_URL}imgs/upload-firmware.png" alt="Diagrama de upload de firmware"
             class="cenario-img" style="margin-top:1rem" onerror="this.style.display='none'">
      </div>

      <div class="fw-opcoes">
        <div class="card fw-opcao-card ${temCenarioA ? '' : 'fw-opcao-desativada'}">
          <div class="fw-opcao-header">
            <h3 style="margin:0">Via Gateway</h3>
            <span class="fw-opcao-badge">Cenário A</span>
          </div>
          <p class="fw-opcao-desc">
            O gateway pausa a conexão serial, grava o firmware e reconecta automaticamente.
            Nenhum cabo USB necessário.
          </p>
          ${motGateway ? `<p class="fw-opcao-motivo">${motGateway}</p>` : ''}
          <button id="btn-gravar-a" class="btn-primary" ${temCenarioA ? '' : 'disabled'}>
            Gravar via Docker
          </button>
        </div>

        <div class="card fw-opcao-card ${temCenarioC ? '' : 'fw-opcao-desativada'}">
          <div class="fw-opcao-header">
            <h3 style="margin:0">Via Browser</h3>
            <span class="fw-opcao-badge">Cenário C</span>
          </div>
          <p class="fw-opcao-desc">
            Grava diretamente pelo browser via WebSerial (USB).
            Encerre qualquer sessão de leitura ativa antes de gravar.
          </p>
          ${motBrowser ? `<p class="fw-opcao-motivo">${motBrowser}</p>` : ''}
          <button id="btn-gravar-c" class="btn-primary" ${temCenarioC ? '' : 'disabled'}>
            Gravar via Browser
          </button>
        </div>
      </div>

      <div class="card hidden" id="fw-log-card">
        <h2>Log de gravação</h2>
        <pre id="fw-log" style="
          background:#1a1a1a;color:#d4d4d4;font-size:0.78rem;line-height:1.5;
          padding:0.75rem;border-radius:6px;max-height:300px;overflow-y:auto;
          white-space:pre-wrap;word-break:break-all;margin:0;
        "></pre>
        <div id="fw-resultado" class="hidden" style="margin-top:0.75rem"></div>
      </div>
    `;

    bindNav(container, { ativo: 'firmware', ...this.nav });

    if (temCenarioA) {
      container.querySelector('#btn-gravar-a')!
        .addEventListener('click', () => void this.gravarViaGateway(container));
    }
    if (temCenarioC) {
      container.querySelector('#btn-gravar-c')!
        .addEventListener('click', () => void this.gravarViaBrowser(container));
    }
  }

  private async carregarVersao(container: HTMLElement): Promise<void> {
    const el = container.querySelector<HTMLElement>('#fw-versao');
    if (!el) return;

    const urls = [
      this.urlAtualizador ? `${this.urlAtualizador}/firmware/versao` : null,
      `${import.meta.env.BASE_URL}firmware-versao.json`,
    ].filter(Boolean) as string[];

    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const meta = await res.json() as VersaoFirmware;
        el.className = 'status-box ok';
        el.textContent =
          `Firmware disponível: ${meta.versao} — ${meta.plataforma} — ` +
          `Protocolo v${meta.protocolo} — ${meta.baud} baud`;
        return;
      } catch { /* tenta próxima */ }
    }

    el.className = 'status-box aviso';
    el.textContent = 'Não foi possível obter informações da versão do firmware.';
  }

  // ── Cenário A: via serviço Docker ─────────────────────────────────────────

  private async gravarViaGateway(container: HTMLElement): Promise<void> {
    const btn = container.querySelector<HTMLButtonElement>('#btn-gravar-a')!;
    this.iniciarLog(container, btn);
    this.abortController = new AbortController();

    try {
      const res = await fetch(`${this.urlAtualizador}/firmware/gravar`, {
        method: 'POST',
        signal: this.abortController.signal,
      });

      if (res.status === 409) {
        this.mostrarResultado(container, false, 'Gravação já em andamento. Aguarde.');
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sucesso = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        decoder.decode(value, { stream: true })
          .split('\n').filter(Boolean)
          .forEach(l => { this.anexarLinha(container, l); if (l === 'CONCLUIDO') sucesso = true; });
      }

      this.mostrarResultado(container, sucesso,
        sucesso
          ? 'Firmware gravado. O dispositivo foi reiniciado.'
          : 'Erro durante a gravação. Veja o log acima.',
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.mostrarResultado(container, false, `Erro de comunicação: ${String(err)}`);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gravar via Docker';
      this.abortController = null;
    }
  }

  // ── Cenário C: via browser com esptool-js ─────────────────────────────────

  private async gravarViaBrowser(container: HTMLElement): Promise<void> {
    const btn = container.querySelector<HTMLButtonElement>('#btn-gravar-c')!;
    this.iniciarLog(container, btn);

    let transport: Transport | null = null;

    try {
      this.anexarLinha(container, 'Baixando firmware...');
      const binUrl = `${import.meta.env.BASE_URL}firmware.bin`;
      const res = await fetch(binUrl);
      if (!res.ok) throw new Error(`Firmware não encontrado (${binUrl})`);

      const bytes = new Uint8Array(await res.arrayBuffer());
      let binStr = '';
      for (let i = 0; i < bytes.length; i++) binStr += String.fromCharCode(bytes[i]);
      this.anexarLinha(container, `Firmware: ${(bytes.length / 1024).toFixed(0)} KB`);

      this.anexarLinha(container, 'Selecione a porta USB do ESP8266...');
      const porta = await navigator.serial.requestPort();

      transport = new Transport(porta, false);

      const loader = new ESPLoader({
        transport,
        baudrate: 921600,
        romBaudrate: 115200,
        terminal: {
          clean:     () => {},
          writeLine: (d: string) => this.anexarLinha(container, d),
          write:     (d: string) => this.anexarLinha(container, d),
        },
      });

      this.anexarLinha(container, 'Conectando ao bootloader...');
      await loader.main();

      this.anexarLinha(container, 'Gravando...');
      await loader.writeFlash({
        fileArray:      [{ data: binStr, address: 0x0 }],
        flashSize:      '4MB',
        flashMode:      'dio',
        flashFreq:      '40m',
        eraseAll:       false,
        compress:       true,
        reportProgress: (_i: number, written: number, total: number) => {
          this.anexarLinha(container,
            `  ${Math.round((written / total) * 100)}% — ${written}/${total} bytes`);
        },
      });

      this.anexarLinha(container, 'Reiniciando ESP...');
      await transport.setDTR(false);
      await new Promise(r => setTimeout(r, 100));
      await transport.setDTR(true);

      this.mostrarResultado(container, true, 'Firmware gravado. Reconecte para medir.');

    } catch (err) {
      const msg = (err as Error).name === 'NotFoundError'
        ? 'Nenhuma porta selecionada.'
        : String(err);
      this.mostrarResultado(container, false, `Erro: ${msg}`);
    } finally {
      try { await transport?.disconnect(); } catch { /* ignora */ }
      btn.disabled = false;
      btn.textContent = 'Gravar via Browser';
    }
  }

  // ── Helpers de UI ─────────────────────────────────────────────────────────

  private iniciarLog(container: HTMLElement, btn: HTMLButtonElement): void {
    btn.disabled = true;
    btn.textContent = 'Gravando...';
    container.querySelector('#fw-log-card')!.classList.remove('hidden');
    container.querySelector('#fw-resultado')!.classList.add('hidden');
    const log = container.querySelector<HTMLPreElement>('#fw-log')!;
    log.textContent = '';
  }

  private anexarLinha(container: HTMLElement, txt: string): void {
    const log = container.querySelector<HTMLPreElement>('#fw-log')!;
    log.textContent += txt + '\n';
    log.scrollTop = log.scrollHeight;
  }

  private mostrarResultado(container: HTMLElement, sucesso: boolean, msg: string): void {
    const el = container.querySelector<HTMLElement>('#fw-resultado')!;
    el.className = `status-box ${sucesso ? 'ok' : 'erro'}`;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  destruir(): void {
    this.abortController?.abort();
  }
}
