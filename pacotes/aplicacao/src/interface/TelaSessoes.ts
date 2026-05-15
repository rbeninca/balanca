import type { IArmazenamento, SessaoLocal, MetadadosLocal } from '../armazenamento/ArmazenamentoLocal.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { ArmazenamentoApi } from '../armazenamento/ArmazenamentoApi.js';
import { analisarMotor } from '@balancagfig/analise';
import { gerarPDF } from '@balancagfig/relatorio';
import { exportarCSV } from '@balancagfig/relatorio';
import { TelaAnalise } from './TelaAnalise.js';
import { TelaComparacao } from './TelaComparacao.js';
import { navHtml, bindNav, type StatusConexao } from './navBar.js';

// ── Formato JSON de exportação/importação ────────────────────────────────────

interface SessaoExportadaV2 {
  versao: 2;
  nome: string;
  criadoEm: string;
  exportadoEm: string;
  metadados: MetadadosLocal;
  leituras: LeituraProcessada[];
}

// Formato legado v1 (balancaGFIGv1)
interface SessaoExportadaV1 {
  nome: string;
  dadosTabela: Array<{ tempo_esp: number; newtons: number }>;
  metadadosMotor?: {
    diameter?: number | null; length?: number | null;
    propweight?: number | null; totalweight?: number | null;
    manufacturer?: string | null; description?: string | null;
    observations?: string | null;
  } | null;
  burnMetadata?: { burnStartTime?: number; burnEndTime?: number } | null;
}

function converterV1(v1: SessaoExportadaV1): { nome: string; leituras: LeituraProcessada[]; meta: MetadadosLocal } {
  const burn = v1.burnMetadata ?? {};
  const inicio = burn.burnStartTime ?? -1;
  const fim    = burn.burnEndTime   ?? -1;

  let impulsoAcumulado = 0;
  const leituras: LeituraProcessada[] = v1.dadosTabela.map((p, i, arr) => {
    if (i > 0) {
      const dt = p.tempo_esp - arr[i - 1]!.tempo_esp; // segundos → N·s
      impulsoAcumulado += (arr[i - 1]!.newtons + p.newtons) / 2 * dt;
    }
    return {
      marcaTemporal:      Math.round(p.tempo_esp * 1000),
      forcaNewton:        p.newtons,
      temperatura:        0,
      emQueima:           inicio >= 0 ? (i >= inicio && i <= fim) : false,
      impulsoAcumuladoNs: impulsoAcumulado,
    };
  });

  const mm = v1.metadadosMotor;
  const meta: MetadadosLocal = {};
  if (mm?.diameter    != null) meta.diametro_mm       = mm.diameter;
  if (mm?.length      != null) meta.comprimento_mm    = mm.length;
  if (mm?.propweight  != null) meta.massaPropelente_g = mm.propweight  * 1000;
  if (mm?.totalweight != null) meta.massaTotal_g      = mm.totalweight * 1000;
  if (mm?.manufacturer)        meta.fabricante        = mm.manufacturer;
  if (mm?.description)         meta.descricao         = mm.description;
  if (mm?.observations)        meta.observacoes       = mm.observations;

  return { nome: v1.nome, leituras, meta };
}

export class TelaSessoes {
  private selecionadas = new Set<string>();
  private barraComp:   HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    private armazenamento:   IArmazenamento,
    private onConexao:        () => void,
    private onFirmware:       () => void,
    private onMedicao?:       () => void,
    private onJogos?:         () => void,
    private onConfiguracoes?: () => void,
    private status?:          StatusConexao,
  ) {
    this.renderizar(container);
  }

  private async renderizar(container: HTMLElement) {
    container.innerHTML = `
      ${navHtml({ ativo: 'sessoes', onConexao: this.onConexao, onSessoes: () => {}, onFirmware: this.onFirmware, ...(this.onMedicao && { onMedicao: this.onMedicao }), ...(this.onJogos && { onJogos: this.onJogos }), ...(this.onConfiguracoes && { onConfiguracoes: this.onConfiguracoes }), ...(this.status && { status: this.status }) })}
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
          <h2 style="margin:0">Sessões Gravadas</h2>
          <div style="display:flex;gap:0.5rem">
            <button id="btn-importar-json" class="btn-secondary btn-sm">⬆ Importar JSON</button>
            <input id="input-json-file" type="file" accept=".json" style="display:none">
          </div>
        </div>
        <div id="lista-conteudo"><div class="vazio">Carregando...</div></div>
        <div id="barra-comparacao" class="barra-comparacao hidden">
          <span id="barra-comp-info"></span>
          <button id="btn-comparar" class="btn-primary btn-sm">Comparar selecionadas</button>
        </div>
      </div>
    `;

    bindNav(container, {
      ativo:    'sessoes',
      onConexao: this.onConexao,
      onSessoes: () => {},
      onFirmware: this.onFirmware,
      ...(this.onMedicao       && { onMedicao:       this.onMedicao }),
      ...(this.onJogos         && { onJogos:         this.onJogos }),
      ...(this.onConfiguracoes  && { onConfiguracoes:  this.onConfiguracoes }),
      ...(this.status           && { status:           this.status }),
    });

    const lista = container.querySelector<HTMLElement>('#lista-conteudo')!;
    this.barraComp = container.querySelector<HTMLElement>('#barra-comparacao')!;

    container.querySelector<HTMLButtonElement>('#btn-comparar')!.addEventListener('click', () => {
      void this.abrirComparacao();
    });

    // Importar JSON
    const btnImportar = container.querySelector<HTMLButtonElement>('#btn-importar-json')!;
    const inputFile   = container.querySelector<HTMLInputElement>('#input-json-file')!;
    btnImportar.addEventListener('click', () => inputFile.click());
    inputFile.addEventListener('change', async () => {
      const file = inputFile.files?.[0];
      if (!file) return;
      inputFile.value = '';
      try {
        const text = await file.text();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(text) as any;
        await this.importarJSON(parsed, lista);
      } catch (e) {
        alert(`Erro ao importar JSON:\n${String(e)}`);
      }
    });

    const sessoes = await this.armazenamento.listarSessoes();

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

  private atualizarBarraComparacao() {
    const barra   = this.barraComp;
    const infoEl  = barra?.querySelector<HTMLElement>('#barra-comp-info');
    if (!barra || !infoEl) return;

    const n = this.selecionadas.size;
    if (n < 2) {
      barra.classList.add('hidden');
      return;
    }

    barra.classList.remove('hidden');
    const aviso = n > 6 ? ' ⚠ Muitas sessões podem tornar o gráfico ilegível.' : '';
    infoEl.textContent = `${n} sessões selecionadas.${aviso}`;
  }

  private async abrirComparacao() {
    const btn = this.barraComp?.querySelector<HTMLButtonElement>('#btn-comparar');
    if (btn) { btn.disabled = true; btn.textContent = 'Carregando…'; }

    try {
      const sessoes = await this.armazenamento.listarSessoes();
      const selecionadas = sessoes.filter(s => this.selecionadas.has(s.id));

      const itens = await Promise.all(selecionadas.map(async s => ({
        sessao:    s,
        leituras:  await this.armazenamento.obterLeituras(s.id),
        metadados: await this.armazenamento.obterMetadados(s.id),
      })));

      new TelaComparacao(itens);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Comparar selecionadas'; }
    }
  }

  private async criarItem(s: SessaoLocal): Promise<HTMLLIElement> {
    const li = document.createElement('li');
    li.className = 'sessao-item';

    const isGateway = this.armazenamento instanceof ArmazenamentoApi;
    const origemBadge = isGateway
      ? `<span class="origem-badge origem-gateway" title="Gravado no banco de dados do gateway">&#9635; gateway</span>`
      : `<span class="origem-badge origem-local"   title="Gravado no armazenamento local do browser">&#9632; local</span>`;

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
      <label class="sessao-check-label" title="Selecionar para comparar">
        <input type="checkbox" class="sessao-check" data-id="${s.id}">
      </label>
      <div style="flex:1;min-width:0">
        <div class="nome">${s.nome} ${motorBadge} ${origemBadge}</div>
        <div class="meta">
          <span class="sessao-data-texto">${dataFmt}</span>
          <button class="btn-editar-data" title="Editar data">✎</button>
          <span class="sessao-meta-resto"> — ${leituras.length} leituras${nomeMotor ? ' — ' + nomeMotor : ''}</span>
        </div>
      </div>
      <div class="sessao-acoes">
        <button class="btn-outline btn-sm btn-analisar" data-id="${s.id}" title="Analisar sessão">Analisar</button>
        <button class="btn-secondary btn-sm btn-csv"     data-id="${s.id}" title="Baixar CSV">CSV</button>
        <button class="btn-secondary btn-sm btn-json"    data-id="${s.id}" title="Baixar JSON">JSON</button>
        <button class="btn-secondary btn-sm btn-pdf"     data-id="${s.id}" title="Baixar PDF">PDF</button>
        <button class="btn-secondary btn-sm btn-excluir" data-id="${s.id}" title="Excluir sessão" style="color:#ef5350">Excluir</button>
      </div>
    `;

    li.querySelector<HTMLInputElement>('.sessao-check')!.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (checked) this.selecionadas.add(s.id);
      else         this.selecionadas.delete(s.id);
      this.atualizarBarraComparacao();
    });

    // Editar data
    li.querySelector('.btn-editar-data')!.addEventListener('click', () => {
      const meta       = li.querySelector<HTMLElement>('.meta')!;
      const textoEl    = meta.querySelector<HTMLElement>('.sessao-data-texto')!;
      const btnEditar  = meta.querySelector<HTMLButtonElement>('.btn-editar-data')!;
      const restoEl    = meta.querySelector<HTMLElement>('.sessao-meta-resto')!;

      const isoParaInput = (iso: string) => {
        const d = new Date(iso);
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
      };

      const input = document.createElement('input');
      input.type  = 'datetime-local';
      input.value = isoParaInput(s.criadoEm);
      input.className = 'input-editar-data';

      const btnSalvar   = document.createElement('button');
      btnSalvar.textContent = '✓';
      btnSalvar.className   = 'btn-salvar-data';
      btnSalvar.title       = 'Salvar';

      const btnCancelar   = document.createElement('button');
      btnCancelar.textContent = '✕';
      btnCancelar.className   = 'btn-cancelar-data';
      btnCancelar.title       = 'Cancelar';

      textoEl.replaceWith(input);
      btnEditar.replaceWith(btnSalvar, btnCancelar);

      const restaurar = () => {
        input.replaceWith(textoEl);
        btnSalvar.replaceWith(btnEditar);
        btnCancelar.remove();
      };

      btnCancelar.addEventListener('click', restaurar);

      btnSalvar.addEventListener('click', async () => {
        btnSalvar.disabled = true;
        try {
          if (!input.value) throw new Error('Data não preenchida.');
          const novaData = new Date(input.value).toISOString();
          if (isNaN(new Date(novaData).getTime())) throw new Error('Data inválida.');
          const atualizada = await this.armazenamento.atualizarSessao(s.id, { criadoEm: novaData });
          s.criadoEm = atualizada.criadoEm;
          textoEl.textContent = new Date(atualizada.criadoEm).toLocaleString('pt-BR');
        } catch (e) {
          alert(`Erro ao salvar data:\n${String(e)}`);
        } finally {
          restaurar();
        }
      });
    });

    // Analisar
    li.querySelector('.btn-analisar')!.addEventListener('click', async () => {
      const ls = await this.armazenamento.obterLeituras(s.id);
      new TelaAnalise(
        { leituras: ls, nomeSessao: s.nome, modo: 'revisao', idSessao: s.id },
        this.armazenamento,
        () => {},
      );
    });

    // JSON
    li.querySelector('.btn-json')!.addEventListener('click', async () => {
      const ls   = await this.armazenamento.obterLeituras(s.id);
      const meta = await this.armazenamento.obterMetadados(s.id) ?? {};
      const payload: SessaoExportadaV2 = {
        versao: 2, nome: s.nome, criadoEm: s.criadoEm,
        exportadoEm: new Date().toISOString(), metadados: meta, leituras: ls,
      };
      this.baixarArquivo(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${s.nome}.json`);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async importarJSON(parsed: any, lista: HTMLElement): Promise<void> {
    let nome: string;
    let leituras: LeituraProcessada[];
    let meta: MetadadosLocal;

    if (parsed.versao === 2) {
      // Formato v2 nativo
      const v2 = parsed as SessaoExportadaV2;
      if (!v2.nome || !Array.isArray(v2.leituras)) throw new Error('Arquivo JSON inválido (faltam campos obrigatórios).');
      nome     = v2.nome;
      leituras = v2.leituras;
      meta     = v2.metadados ?? {};
    } else if (Array.isArray(parsed.dadosTabela)) {
      // Formato legado v1
      const v1 = parsed as SessaoExportadaV1;
      if (!v1.nome) throw new Error('Arquivo JSON v1 inválido (faltam campos obrigatórios).');
      ({ nome, leituras, meta } = converterV1(v1));
    } else {
      throw new Error('Formato de arquivo não reconhecido. Esperado JSON exportado pelo BalançaGFIG.');
    }

    const sessao = await this.armazenamento.criarSessao(nome);
    if (leituras.length > 0) await this.armazenamento.adicionarLeituras(sessao.id, leituras);
    if (Object.keys(meta).length > 0) await this.armazenamento.salvarMetadados(sessao.id, meta);

    const li = await this.criarItem(sessao);
    let ul = lista.querySelector('ul');
    if (!ul) {
      lista.innerHTML = '';
      ul = document.createElement('ul');
      ul.setAttribute('data-testid', 'lista-sessoes');
      ul.style.listStyle = 'none';
      lista.appendChild(ul);
    }
    ul.appendChild(li);
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
