import { resumir, falhaEsperada, historico, TEXTO_REINSTALANDO, type EstadoAtualizacaoApp } from './atualizacaoApp.js';

/**
 * Atualização do app do TVBox pelo repositório (GitHub Releases). O usuário só
 * decide se atualiza; o box percorre sozinho todas as versões até a mais nova,
 * reiniciando o app a cada uma. A tela acompanha por GET /atualizacao e tolera
 * a queda da API durante cada reinstalação.
 */
export class TelaAtualizacao {
  private overlay: HTMLElement;
  private baseApi: string;
  private chave: string | undefined;
  private ultimo: EstadoAtualizacaoApp | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private falhasSeguidas = 0;
  private aberta = true;

  constructor(baseApi?: string, chave?: string) {
    this.baseApi = baseApi ?? `http://${location.hostname}:3000`;
    this.chave = chave ?? this.lerChaveLocal();
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = `
      <div class="modal" style="max-width:640px">
        <div class="modal-header">
          <h2 style="margin:0;flex:1">Atualização do app do TVBox</h2>
          <button class="modal-fechar" id="btn-fechar-atualizacao">×</button>
        </div>
        <div class="modal-body">
          <div id="at-corpo"><p class="pd-info">Consultando o box…</p></div>
        </div>
        <div class="modal-footer">
          <button id="btn-at-verificar" class="btn-secondary btn-sm">Verificar agora</button>
          <button id="btn-at-cancelar" class="btn-secondary btn-sm hidden">Cancelar</button>
          <button id="btn-at-recarregar" class="btn-secondary btn-sm hidden">Recarregar a página</button>
          <button id="btn-at-iniciar" class="btn-primary btn-sm" disabled>Atualizar agora</button>
        </div>
      </div>`;
    document.body.appendChild(this.overlay);

    this.overlay.querySelector('#btn-fechar-atualizacao')!.addEventListener('click', () => this.destruir());
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.destruir(); });
    this.overlay.querySelector('#btn-at-verificar')!.addEventListener('click', () => void this.verificar());
    this.overlay.querySelector('#btn-at-iniciar')!.addEventListener('click', () => void this.iniciar());
    this.overlay.querySelector('#btn-at-cancelar')!.addEventListener('click', () => void this.cancelar());
    this.overlay.querySelector('#btn-at-recarregar')!.addEventListener('click', () => location.reload());

    void this.atualizar();
  }

  private lerChaveLocal(): string | undefined {
    try {
      const cfg = JSON.parse(localStorage.getItem('balancagfig:conexao') ?? '{}') as { chave?: string };
      return cfg.chave || undefined;
    } catch { return undefined; }
  }

  private headers(): Record<string, string> {
    return this.chave ? { 'x-chave-api': this.chave } : {};
  }

  private async obter(caminho = '/atualizacao', metodo: 'GET' | 'POST' = 'GET'): Promise<EstadoAtualizacaoApp> {
    const r = await fetch(`${this.baseApi}${caminho}`, {
      method: metodo, headers: this.headers(), signal: AbortSignal.timeout(metodo === 'GET' ? 8000 : 30000),
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { msg = (await r.json() as { erro?: string }).erro ?? msg; } catch { /* sem corpo */ }
      throw new Error(msg);
    }
    return await r.json() as EstadoAtualizacaoApp;
  }

  /** Busca o estado, renderiza e agenda a próxima consulta enquanto houver execução. */
  private async atualizar(): Promise<void> {
    if (!this.aberta) return;
    try {
      const e = await this.obter();
      this.falhasSeguidas = 0;
      this.ultimo = e;
      this.renderizar(e);
    } catch (err) {
      this.falhasSeguidas++;
      if (falhaEsperada(this.ultimo) || (this.ultimo && this.falhasSeguidas <= 3)) {
        // App sendo reinstalado (ou soluço de rede): mantém a tela e insiste.
        this.mostrarAviso(TEXTO_REINSTALANDO);
      } else {
        this.mostrarErro(`Não foi possível falar com o box: ${String(err)}`);
      }
    }
    const executando = this.ultimo ? resumir(this.ultimo).emAndamento : false;
    const intervalo = executando || this.falhasSeguidas > 0 ? 1500 : 0;
    if (intervalo > 0) this.agendar(intervalo);
  }

  private agendar(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.atualizar(), ms);
  }

  private async verificar(): Promise<void> {
    await this.acao('#btn-at-verificar', 'Consultando…', async () => {
      this.ultimo = await this.obter('/atualizacao/verificar', 'POST');
      this.renderizar(this.ultimo);
    });
  }

  private async iniciar(): Promise<void> {
    if (!this.ultimo) return;
    const r = resumir(this.ultimo);
    const cadeia = r.passos.map(p => p.versao).join(' → ');
    if (!confirm(`Atualizar o box de ${r.instalada} para ${r.alvo}?\n\nVersões: ${r.instalada} → ${cadeia}\n\nO app vai reiniciar a cada versão; não desligue o box nem use a balança até terminar.`)) return;
    await this.acao('#btn-at-iniciar', 'Iniciando…', async () => {
      this.ultimo = await this.obter('/atualizacao/iniciar', 'POST');
      this.renderizar(this.ultimo);
      this.agendar(1000);
    });
  }

  private async cancelar(): Promise<void> {
    await this.acao('#btn-at-cancelar', 'Cancelando…', async () => {
      this.ultimo = await this.obter('/atualizacao/cancelar', 'POST');
      this.renderizar(this.ultimo);
    });
  }

  private async acao(sel: string, textoOcupado: string, fn: () => Promise<void>): Promise<void> {
    const btn = this.overlay.querySelector<HTMLButtonElement>(sel)!;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = textoOcupado;
    try {
      await fn();
    } catch (e) {
      alert(`Falha: ${String(e)}`);
    } finally {
      btn.textContent = original;
      if (this.ultimo) this.renderizar(this.ultimo); else btn.disabled = false;
    }
  }

  private renderizar(e: EstadoAtualizacaoApp) {
    const r = resumir(e);
    const corpo = this.overlay.querySelector<HTMLElement>('#at-corpo')!;

    const passos = r.passos.length > 0 ? `
      <div class="at-cadeia" data-testid="at-cadeia">
        <span class="at-versao at-atual" title="Instalada">${r.instalada}</span>
        ${r.passos.map((p, i) => {
          const cls = e.fase === 'concluida' || i < e.indice ? 'at-feita'
            : i === e.indice && r.emAndamento ? 'at-emcurso' : '';
          return `<span class="at-seta">→</span><span class="at-versao ${cls}" title="${p.tag}">${p.versao}</span>`;
        }).join('')}
      </div>` : '';

    const notas = r.passos.filter(p => p.notas.trim()).map(p => `
      <details class="at-notas"><summary>Novidades da ${p.versao}</summary><pre>${escapar(p.notas.trim())}</pre></details>`).join('');

    const barra = r.progressoTotal !== null ? `
      <div class="at-barra"><div class="at-barra-preenchida" style="width:${r.progressoTotal}%"></div></div>` : '';

    const quando = e.verificado_em ? `<div class="pd-meta">Última consulta ao repositório: ${new Date(e.verificado_em).toLocaleString('pt-BR')}</div>` : '';

    const hist = historico(e).slice(0, 5);
    const historicoHtml = hist.length > 0 && r.passos.length === 0 ? `
      <details class="at-notas"><summary>Versões publicadas</summary>
        <ul class="at-lista">${hist.map(h => `<li><b>${h.versao}</b>${h.versao === e.instalada ? ' (instalada)' : ''}</li>`).join('')}</ul>
      </details>` : '';

    corpo.innerHTML = `
      <p class="at-instalada">Versão instalada no box: <b>${r.instalada}</b></p>
      <p class="at-status ${e.fase === 'erro' ? 'at-erro' : ''}" data-testid="at-status">${escapar(r.texto)}</p>
      ${passos}${barra}${notas}${historicoHtml}${quando}
    `;

    const btnIniciar = this.overlay.querySelector<HTMLButtonElement>('#btn-at-iniciar')!;
    btnIniciar.disabled = !r.podeIniciar;
    btnIniciar.textContent = e.fase === 'erro' ? 'Tentar de novo' : 'Atualizar agora';
    this.overlay.querySelector<HTMLButtonElement>('#btn-at-verificar')!.disabled = r.emAndamento;
    this.overlay.querySelector<HTMLButtonElement>('#btn-at-cancelar')!.classList.toggle('hidden', !r.podeCancelar);
    // Ao concluir, o frontend servido pelo box também é o novo: recarregar traz a interface atualizada.
    this.overlay.querySelector<HTMLButtonElement>('#btn-at-recarregar')!.classList.toggle('hidden', e.fase !== 'concluida');
  }

  private mostrarAviso(texto: string) {
    const st = this.overlay.querySelector<HTMLElement>('#at-corpo .at-status');
    if (st) { st.textContent = texto; st.classList.remove('at-erro'); }
    else this.overlay.querySelector<HTMLElement>('#at-corpo')!.innerHTML = `<p class="at-status">${escapar(texto)}</p>`;
  }

  private mostrarErro(texto: string) {
    this.overlay.querySelector<HTMLElement>('#at-corpo')!.innerHTML = `<p class="at-status at-erro">${escapar(texto)}</p>`;
    this.overlay.querySelector<HTMLButtonElement>('#btn-at-verificar')!.disabled = false;
  }

  destruir(): void {
    this.aberta = false;
    if (this.timer) clearTimeout(this.timer);
    this.overlay.remove();
  }
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
