// Tela (modal) de gerenciamento do pendrive no TVBox (Cenário A). Lista os
// arquivos de balancaGFIG/, faz backup, restaura backups .db e ejeta o pendrive.
// Só é útil quando servida pelo app Android do box (rotas /pendrive/*).

export interface ArquivoPendrive {
  nome: string;
  tamanhoBytes: number;
  data: string;
  pasta: 'backups' | 'sessoes';
}

export interface StatusPendrive {
  presente: boolean;
  id?: string;
  livreBytes?: number;
  totalBytes?: number;
}

/** Formata bytes em B/KB/MB/GB (base 1000), com uma casa. */
export function formatarTamanho(bytes: number): string {
  if (!isFinite(bytes) || bytes < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes, i = 0;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/** Separa a listagem em backups (.db) e sessões, cada um ordenado por data desc. */
export function agruparArquivos(arquivos: ArquivoPendrive[]): {
  backups: ArquivoPendrive[];
  sessoes: ArquivoPendrive[];
} {
  const porData = (a: ArquivoPendrive, b: ArquivoPendrive) => b.data.localeCompare(a.data);
  return {
    backups: arquivos.filter(a => a.pasta === 'backups').sort(porData),
    sessoes: arquivos.filter(a => a.pasta === 'sessoes').sort(porData),
  };
}

export class TelaPendrive {
  private overlay: HTMLElement;

  private baseApi: string;
  private chave?: string;

  constructor(baseApi?: string, chave?: string) {
    this.baseApi = baseApi ?? `http://${location.hostname}:3000`;
    this.chave = chave ?? this.lerChaveLocal();
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = this.esqueleto();
    document.body.appendChild(this.overlay);

    this.overlay.querySelector('#btn-fechar-pendrive')!.addEventListener('click', () => this.destruir());
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.destruir(); });
    this.overlay.querySelector('#btn-pd-backup')!.addEventListener('click', () => void this.fazerBackup());
    this.overlay.querySelector('#btn-pd-ejetar')!.addEventListener('click', () => void this.ejetar());

    void this.carregar();
  }

  private lerChaveLocal(): string | undefined {
    try {
      const cfg = JSON.parse(localStorage.getItem('balancagfig:conexao') ?? '{}') as { chave?: string };
      return cfg.chave || undefined;
    } catch { return undefined; }
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.chave) h['x-chave-api'] = this.chave;
    return h;
  }

  private async carregar(): Promise<void> {
    const corpo = this.overlay.querySelector<HTMLElement>('#pd-corpo')!;
    corpo.innerHTML = '<p class="pd-info">Carregando…</p>';
    try {
      const status = await fetch(`${this.baseApi}/pendrive/status`, { signal: AbortSignal.timeout(6000) })
        .then(r => r.ok ? r.json() as Promise<StatusPendrive> : Promise.reject(new Error(String(r.status))));
      if (!status.presente) {
        corpo.innerHTML = '<p class="pd-info">Nenhum pendrive conectado ao TVBox.</p>';
        this.habilitarAcoes(false);
        return;
      }
      const { arquivos } = await fetch(`${this.baseApi}/pendrive/arquivos`).then(r => r.json()) as { arquivos: ArquivoPendrive[] };
      corpo.innerHTML = this.htmlConteudo(status, agruparArquivos(arquivos));
      this.habilitarAcoes(true);
      this.overlay.querySelectorAll<HTMLButtonElement>('.btn-pd-restaurar').forEach(btn =>
        btn.addEventListener('click', () => void this.restaurar(btn.dataset['arquivo']!)));
    } catch (e) {
      corpo.innerHTML = `<p class="pd-info">Recurso disponível apenas no TVBox (app do box). ${String(e)}</p>`;
      this.habilitarAcoes(false);
    }
  }

  private async fazerBackup(): Promise<void> {
    await this.acao('#btn-pd-backup', 'Fazendo backup…', () =>
      fetch(`${this.baseApi}/pendrive/backup`, { method: 'POST', headers: this.headers() }));
    setTimeout(() => void this.carregar(), 1500);
  }

  private async ejetar(): Promise<void> {
    if (!confirm('Ejetar o pendrive? Faça isso antes de removê-lo do box.')) return;
    const r = await this.acao('#btn-pd-ejetar', 'Ejetando…', () =>
      fetch(`${this.baseApi}/pendrive/ejetar`, { method: 'POST', headers: this.headers() }));
    if (r) {
      const ok = (await r.json().catch(() => ({ ok: false })) as { ok: boolean }).ok;
      alert(ok ? 'Pendrive ejetado. Pode remover com segurança.' : 'Não foi possível ejetar.');
      if (ok) this.destruir();
    }
  }

  private async restaurar(arquivo: string): Promise<void> {
    const resp = prompt(
      `Restaurar "${arquivo}".\n\nDigite:\n  MESCLAR — adiciona ao banco as sessões que faltam\n  SUBSTITUIR — apaga as sessões atuais e usa as do backup`,
      'MESCLAR',
    );
    if (!resp) return;
    const modo = resp.trim().toUpperCase().startsWith('S') ? 'substituir' : 'mesclar';
    if (modo === 'substituir' && !confirm('SUBSTITUIR apaga as sessões atuais do box. Confirmar?')) return;
    try {
      const r = await fetch(`${this.baseApi}/pendrive/restaurar`, {
        method: 'POST', headers: this.headers(true),
        body: JSON.stringify({ arquivo, modo }),
      });
      const d = await r.json() as { inseridas?: number; erro?: string };
      alert(r.ok ? `Restauração concluída: ${d.inseridas} sessão(ões) importada(s).` : `Erro: ${d.erro}`);
    } catch (e) {
      alert(`Falha ao restaurar: ${String(e)}`);
    }
  }

  /** Executa uma ação num botão, mostrando estado; devolve a Response ou null. */
  private async acao(sel: string, textoOcupado: string, fn: () => Promise<Response>): Promise<Response | null> {
    const btn = this.overlay.querySelector<HTMLButtonElement>(sel)!;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = textoOcupado;
    try {
      return await fn();
    } catch (e) {
      alert(`Falha: ${String(e)}`);
      return null;
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  }

  private habilitarAcoes(ativo: boolean): void {
    this.overlay.querySelectorAll<HTMLButtonElement>('#btn-pd-backup, #btn-pd-ejetar')
      .forEach(b => { b.disabled = !ativo; });
  }

  private htmlConteudo(status: StatusPendrive, g: { backups: ArquivoPendrive[]; sessoes: ArquivoPendrive[] }): string {
    const linha = (a: ArquivoPendrive, comBotao: boolean) => `
      <div class="pd-arquivo">
        <span class="pd-nome">${a.nome}</span>
        <span class="pd-meta">${formatarTamanho(a.tamanhoBytes)} · ${a.data}</span>
        ${comBotao ? `<button class="btn-secondary btn-sm btn-pd-restaurar" data-arquivo="${a.nome}">Restaurar</button>` : ''}
      </div>`;
    return `
      <div class="pd-status">
        <strong>Pendrive ${status.id}</strong> —
        ${formatarTamanho(status.livreBytes ?? -1)} livres de ${formatarTamanho(status.totalBytes ?? -1)}
      </div>
      <h3>Backups do banco (${g.backups.length})</h3>
      <div class="pd-lista">${g.backups.map(a => linha(a, true)).join('') || '<p class="pd-info">Nenhum backup.</p>'}</div>
      <h3>Testes exportados (${g.sessoes.length})</h3>
      <div class="pd-lista">${g.sessoes.map(a => linha(a, false)).join('') || '<p class="pd-info">Nenhum teste exportado.</p>'}</div>
    `;
  }

  private esqueleto(): string {
    return `
      <div class="modal" style="max-width:720px">
        <div class="modal-header">
          <h2 style="margin:0;flex:1">Pendrive (backup do TVBox)</h2>
          <button class="modal-fechar" id="btn-fechar-pendrive">×</button>
        </div>
        <div class="modal-body">
          <div class="pd-acoes" style="display:flex;gap:8px;margin-bottom:1rem">
            <button id="btn-pd-backup" class="btn-primary btn-sm">Fazer backup agora</button>
            <button id="btn-pd-ejetar" class="btn-secondary btn-sm">Ejetar pendrive</button>
          </div>
          <div id="pd-corpo"></div>
        </div>
      </div>`;
  }

  destruir(): void { this.overlay.remove(); }
}
