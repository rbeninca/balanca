const CHAVE_LS = 'balancagfig:conexao';

interface VersaoFirmware {
  versao: string;
  protocolo: number;
  plataforma: string;
  baud: number;
}

export class TelaFirmware {
  private urlAtualizador: string | null = null;
  private abortController: AbortController | null = null;

  constructor(container: HTMLElement, private onVoltar: () => void) {
    this.urlAtualizador = this.resolverUrlAtualizador();
    this.renderizar(container);
    if (this.urlAtualizador) {
      void this.carregarVersao(container);
    }
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
    const disponivel = this.urlAtualizador !== null;

    container.innerHTML = `
      <div class="nav-links">
        <a href="#" id="nav-voltar">← Voltar</a>
        <a href="#" class="ativo">Firmware</a>
      </div>

      <div class="card">
        <h2>Atualização de Firmware</h2>

        ${!disponivel ? `
          <div class="status-box aviso">
            Atualização de firmware disponível apenas no modo TVBox (Cenário A).
            Conecte-se via gateway para usar esta função.
          </div>
        ` : `
          <div id="fw-versao" class="status-box">Carregando versão...</div>

          <div style="margin-top:1.25rem">
            <h3>Gravar firmware no dispositivo</h3>
            <p style="font-size:0.85rem;color:#6b7280;margin:0.5rem 0 1rem">
              O gateway será pausado durante a gravação e retomado automaticamente.
              Mantenha o ESP8266 conectado via USB durante o processo.
            </p>
            <div class="btn-row">
              <button id="btn-gravar" class="btn-primary">Gravar Firmware</button>
            </div>
          </div>

          <div id="fw-log-wrap" class="hidden" style="margin-top:1.25rem">
            <h3>Log de gravação</h3>
            <pre id="fw-log" style="
              background:#1a1a1a;
              color:#d4d4d4;
              font-size:0.78rem;
              line-height:1.5;
              padding:0.75rem;
              border-radius:6px;
              max-height:300px;
              overflow-y:auto;
              white-space:pre-wrap;
              word-break:break-all;
            "></pre>
          </div>

          <div id="fw-resultado" class="hidden" style="margin-top:0.75rem"></div>
        `}
      </div>
    `;

    container.querySelector<HTMLElement>('#nav-voltar')
      ?.addEventListener('click', (e) => { e.preventDefault(); this.onVoltar(); });

    if (disponivel) {
      container.querySelector<HTMLElement>('#btn-gravar')
        ?.addEventListener('click', () => void this.iniciarGravacao(container));
    }
  }

  private async carregarVersao(container: HTMLElement): Promise<void> {
    const el = container.querySelector<HTMLElement>('#fw-versao');
    if (!el) return;

    try {
      const res = await fetch(`${this.urlAtualizador}/firmware/versao`,
        { signal: AbortSignal.timeout(5000) });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = await res.json() as VersaoFirmware;

      el.className = 'status-box ok';
      el.textContent =
        `Firmware disponível: ${meta.versao} — ${meta.plataforma} — ` +
        `Protocolo v${meta.protocolo} — ${meta.baud} baud`;

    } catch {
      el.className = 'status-box aviso';
      el.textContent = 'Não foi possível obter informações do firmware (atualizador inacessível).';
    }
  }

  private async iniciarGravacao(container: HTMLElement): Promise<void> {
    const btnGravar   = container.querySelector<HTMLButtonElement>('#btn-gravar')!;
    const logWrap     = container.querySelector<HTMLElement>('#fw-log-wrap')!;
    const logEl       = container.querySelector<HTMLPreElement>('#fw-log')!;
    const resultadoEl = container.querySelector<HTMLElement>('#fw-resultado')!;

    btnGravar.disabled = true;
    btnGravar.textContent = 'Gravando...';
    logWrap.classList.remove('hidden');
    resultadoEl.classList.add('hidden');
    logEl.textContent = '';

    const anexarLinha = (txt: string) => {
      logEl.textContent += txt + '\n';
      logEl.scrollTop = logEl.scrollHeight;
    };

    this.abortController = new AbortController();

    try {
      const res = await fetch(`${this.urlAtualizador}/firmware/gravar`, {
        method: 'POST',
        signal: this.abortController.signal,
      });

      if (res.status === 409) {
        resultadoEl.className = 'status-box aviso';
        resultadoEl.textContent = 'Gravação já em andamento. Aguarde.';
        resultadoEl.classList.remove('hidden');
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sucesso = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const texto = decoder.decode(value, { stream: true });
        texto.split('\n').filter(Boolean).forEach(l => {
          anexarLinha(l);
          if (l === 'CONCLUIDO') sucesso = true;
        });
      }

      resultadoEl.className = sucesso ? 'status-box ok' : 'status-box erro';
      resultadoEl.textContent = sucesso
        ? 'Firmware gravado com sucesso. O dispositivo foi reiniciado.'
        : 'Ocorreu um erro durante a gravação. Verifique o log acima.';
      resultadoEl.classList.remove('hidden');

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        resultadoEl.className = 'status-box erro';
        resultadoEl.textContent = `Erro de comunicação: ${String(err)}`;
        resultadoEl.classList.remove('hidden');
      }
    } finally {
      btnGravar.disabled = false;
      btnGravar.textContent = 'Gravar Firmware';
      this.abortController = null;
    }
  }

  destruir(): void {
    this.abortController?.abort();
  }
}
