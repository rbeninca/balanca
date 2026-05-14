import { ESPLoader, Transport } from 'esptool-js';

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

  constructor(container: HTMLElement, private onVoltar: () => void) {
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
    const semSuporte  = !temCenarioA && !temCenarioC;

    container.innerHTML = `
      <div class="nav-links">
        <a href="#" id="nav-voltar">← Voltar</a>
        <a href="#" class="ativo">Firmware</a>
      </div>

      <div class="card">
        <h2>Atualização de Firmware</h2>
        <div id="fw-versao" class="status-box">Carregando informações...</div>
      </div>

      ${semSuporte ? `
        <div class="card">
          <div class="status-box aviso">
            Nenhum método de gravação disponível neste ambiente.<br>
            Use Chrome/Edge com o dispositivo conectado via USB (Cenário C),
            ou acesse via TVBox com Docker (Cenário A).
          </div>
        </div>
      ` : ''}

      ${temCenarioA ? `
        <div class="card">
          <h2>Via Gateway — Cenário A</h2>
          <p style="font-size:0.85rem;color:#6b7280;margin-bottom:1rem">
            O gateway pausa a conexão serial, grava o firmware e reconecta automaticamente.
          </p>
          <button id="btn-gravar-a" class="btn-primary">Gravar via Docker</button>
        </div>
      ` : ''}

      ${temCenarioC ? `
        <div class="card">
          <h2>Via Browser — Cenário C</h2>
          <p style="font-size:0.85rem;color:#6b7280;margin-bottom:1rem">
            Grava diretamente pelo browser usando WebSerial.
            Qualquer sessão de leitura ativa deve ser encerrada antes.
          </p>
          <button id="btn-gravar-c" class="btn-primary">Gravar via Browser</button>
        </div>
      ` : ''}

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

    container.querySelector('#nav-voltar')
      ?.addEventListener('click', (e) => { e.preventDefault(); this.onVoltar(); });

    container.querySelector('#btn-gravar-a')
      ?.addEventListener('click', () => void this.gravarViaGateway(container));

    container.querySelector('#btn-gravar-c')
      ?.addEventListener('click', () => void this.gravarViaBrowser(container));
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
      await loader.write_flash({
        fileArray:        [{ data: binStr, address: 0x0 }],
        flashSize:        'detect',
        flashMode:        'dio',
        flashFreq:        '80m',
        eraseAll:         false,
        compress:         true,
        reportProgress:   (_i: number, written: number, total: number) => {
          this.anexarLinha(container,
            `  ${Math.round((written / total) * 100)}% — ${written}/${total} bytes`);
        },
        calculateMD5Hash: () => '',
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
