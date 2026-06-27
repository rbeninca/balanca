import type { IArmazenamento, SessaoLocal, MetadadosLocal } from '../armazenamento/ArmazenamentoLocal.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { ArmazenamentoApi } from '../armazenamento/ArmazenamentoApi.js';
import { analisarMotor } from '@balancagfig/analise';
import { gerarPDF } from '@balancagfig/relatorio';
import { exportarCSV } from '@balancagfig/relatorio';
import { jsPDF } from 'jspdf';
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
          <button id="btn-comparar"    class="btn-primary btn-sm">Comparar selecionadas</button>
          <button id="btn-baixar-csv"  class="btn-secondary btn-sm">Baixar CSV</button>
          <button id="btn-baixar-pdf"  class="btn-secondary btn-sm">Baixar PDF</button>
          <button id="btn-baixar-json" class="btn-secondary btn-sm">Baixar JSON</button>
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
    container.querySelector<HTMLButtonElement>('#btn-baixar-csv')!.addEventListener('click', () => {
      void this.baixarSelecionadas('csv');
    });
    container.querySelector<HTMLButtonElement>('#btn-baixar-pdf')!.addEventListener('click', () => {
      void this.baixarSelecionadas('pdf');
    });
    container.querySelector<HTMLButtonElement>('#btn-baixar-json')!.addEventListener('click', () => {
      void this.baixarSelecionadas('json');
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

    const sessoes = (await this.armazenamento.listarSessoes())
      .slice()
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());

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
    if (n < 1) {
      barra.classList.add('hidden');
      return;
    }

    barra.classList.remove('hidden');
    const btnComparar = barra.querySelector<HTMLButtonElement>('#btn-comparar');
    if (btnComparar) btnComparar.disabled = n < 2;
    const aviso = n > 6 ? ' ⚠ Muitas sessões podem tornar o gráfico ilegível.' : '';
    infoEl.textContent = `${n} ${n === 1 ? 'sessão selecionada' : 'sessões selecionadas'}.${aviso}`;
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

  private async baixarSelecionadas(formato: 'csv' | 'pdf' | 'json'): Promise<void> {
    const sessoes = await this.armazenamento.listarSessoes();
    const selecionadas = sessoes.filter(s => this.selecionadas.has(s.id));
    if (selecionadas.length === 0) return;

    const erros: string[] = [];

    for (const s of selecionadas) {
      try {
        const ls = await this.armazenamento.obterLeituras(s.id);

        if (formato === 'json') {
          const meta = await this.armazenamento.obterMetadados(s.id) ?? {};
          const payload: SessaoExportadaV2 = {
            versao: 2, nome: s.nome, criadoEm: s.criadoEm,
            exportadoEm: new Date().toISOString(), metadados: meta, leituras: ls,
          };
          this.baixarArquivo(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${s.nome}.json`);
        } else if (formato === 'csv') {
          const data = new Date(s.criadoEm).toLocaleDateString('pt-BR');
          let csv: string;
          try {
            const analise = analisarMotor(ls, {});
            csv = exportarCSV(ls, analise, { nomeSessao: s.nome, data });
          } catch {
            csv = exportarCSV(ls, undefined, { nomeSessao: s.nome, data });
          }
          this.baixarArquivo(new Blob([csv], { type: 'text/csv' }), `${s.nome}.csv`);
        } else {
          const data    = new Date(s.criadoEm).toLocaleDateString('pt-BR');
          const analise = analisarMotor(ls, {});
          const pdfBlob  = await this.gerarPdfLote(s.nome, data, ls, analise);
          this.baixarArquivo(pdfBlob, `${s.nome}.pdf`);
        }
      } catch (e) {
        erros.push(`${s.nome}: ${String(e)}`);
      }
    }

    if (erros.length > 0) {
      alert(`Algumas sessões não puderam ser exportadas em ${formato.toUpperCase()}:\n\n${erros.join('\n')}`);
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

  private async gerarPdfLote(nomeSessao: string, data: string, leituras: LeituraProcessada[], analise: ReturnType<typeof analisarMotor>): Promise<Blob> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const margem = 12;
    const larguraPagina = 210;
    const alturaPagina = 297;
    const larguraUtil = larguraPagina - margem * 2;
    let y = margem;

    const quebraPagina = (alturaNecessaria = 10) => {
      if (y + alturaNecessaria > alturaPagina - margem) {
        doc.addPage();
        y = margem;
      }
    };

    const titulo = (texto: string, tamanho = 14) => {
      quebraPagina(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(tamanho);
      doc.text(texto, margem, y);
      y += tamanho >= 14 ? 8 : 6;
      doc.setDrawColor(52, 152, 219);
      doc.setLineWidth(0.4);
      doc.line(margem, y, larguraPagina - margem, y);
      y += 5;
    };

    const linha = (rotulo: string, valor: string) => {
      quebraPagina(7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(rotulo, margem, y);
      doc.setFont('helvetica', 'normal');
      doc.text(valor, margem + 56, y);
      y += 5;
    };

    const textoQuebrado = (texto: string, alturaMinima = 8) => {
      const linhas = doc.splitTextToSize(texto, larguraUtil);
      quebraPagina(Math.max(alturaMinima, linhas.length * 4.5));
      doc.text(linhas, margem, y);
      y += linhas.length * 4.5 + 1;
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('balançaGFIG - RELATÓRIO DE TESTE ESTÁTICO', margem, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${nomeSessao} • ${data}`, margem, y);
    y += 6;
    doc.text('GFIG / IFSC Campus Gaspar', margem, y);
    y += 10;

    titulo('Resumo');
    linha('Classe:', analise.letraMotor);
    linha('Nome comum:', analise.nomeComum);
    linha('Impulso total:', `${analise.impulsoTotal_Ns.toFixed(3)} N⋅s`);
    linha('Força máxima:', `${analise.forcaPico_N.toFixed(3)} N`);
    linha('Força média:', `${analise.forcaMedia_N.toFixed(3)} N`);
    linha('Duração de queima:', `${analise.duracaoQueima_s.toFixed(3)} s`);
    linha('Perfil:', analise.perfilQueima);
    y += 2;

    titulo('Gráfico', 12);
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 650;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const ordenadas = [...leituras].sort((a, b) => a.marcaTemporal - b.marcaTemporal);
      const t0 = ordenadas[0]?.marcaTemporal ?? 0;
      const dados = ordenadas.map(l => ({ t: (l.marcaTemporal - t0) / 1000, f: l.forcaNewton }));
      const tempos = dados.map(d => d.t);
      const valores = dados.map(d => d.f);
      const w = canvas.width;
      const h = canvas.height;
      const gx = 95;
      const gy = 70;
      const gw = w - 150;
      const gh = h - 150;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2c3e50';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Curva de Propulsão - ${nomeSessao}`, w / 2, 34);
      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = '#3498db';
      ctx.fillText(`${analise.impulsoTotal_Ns.toFixed(2)} N⋅s`, w / 2, 58);

      if (dados.length >= 2) {
        const maxV = Math.max(...valores);
        const minV = Math.min(0, ...valores);
        const pad = (maxV - minV) * 0.12 || 0.1;
        const yMin = minV - pad;
        const yMax = maxV + pad;
        const yRange = yMax - yMin || 1;
        const maxT = Math.max(...tempos) || 1;

        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(gx, gy, gw, gh);
        ctx.strokeStyle = '#95a5a6';
        ctx.lineWidth = 2;
        ctx.strokeRect(gx, gy, gw, gh);

        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 6; i++) {
          const yy = gy + (gh / 6) * i;
          const v = yMax - (yRange / 6) * i;
          ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy); ctx.stroke();
          ctx.fillStyle = '#2c3e50'; ctx.font = '12px Arial'; ctx.textAlign = 'right';
          ctx.fillText(v.toFixed(1) + ' N', gx - 8, yy + 4);
        }
        for (let j = 0; j <= 8; j++) {
          const xx = gx + (gw / 8) * j;
          const t = (maxT / 8) * j;
          ctx.beginPath(); ctx.moveTo(xx, gy); ctx.lineTo(xx, gy + gh); ctx.stroke();
          ctx.fillStyle = '#2c3e50'; ctx.textAlign = 'center';
          ctx.fillText(t.toFixed(2) + ' s', xx, gy + gh + 18);
        }
        ctx.setLineDash([]);

        const px = (t: number) => gx + (t / maxT) * gw;
        const py = (v: number) => gy + gh - ((v - yMin) / yRange) * gh;

        ctx.fillStyle = 'rgba(52,152,219,0.25)';
        ctx.beginPath();
        ctx.moveTo(px(dados[0]!.t), py(0));
        for (const d of dados) ctx.lineTo(px(d.t), py(d.f));
        ctx.lineTo(px(dados[dados.length - 1]!.t), py(0));
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        dados.forEach((d, i) => {
          if (i === 0) ctx.moveTo(px(d.t), py(d.f));
          else ctx.lineTo(px(d.t), py(d.f));
        });
        ctx.stroke();

        const maxIdx = valores.reduce((melhor, atual, idx, arr) => atual > arr[melhor]! ? idx : melhor, 0);
        const pkx = px(dados[maxIdx]!.t);
        const pky = py(valores[maxIdx]!);
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(pkx, pky, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`Fmax: ${valores[maxIdx]!.toFixed(2)} N`, pkx, pky - 12);
      } else {
        ctx.fillStyle = '#e74c3c';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Dados insuficientes para o gráfico', w / 2, h / 2);
      }
    }

    const imagem = canvas.toDataURL('image/png', 1.0);
    quebraPagina(120);
    doc.addImage(imagem, 'PNG', margem, y, larguraUtil, 120);
    y += 126;

    titulo('Métricas detalhadas', 12);
    linha('Leituras:', `${leituras.length}`);
    linha('Força RMS:', `${analise.forcaRms_N.toFixed(3)} N`);
    linha('Coef. variação:', `${(analise.coefVariacao * 100).toFixed(1)} %`);
    linha('Impulso específico:', analise.impulsoEspecifico_s != null ? `${analise.impulsoEspecifico_s.toFixed(2)} s` : 'Aguardando massa propelente');
    linha('Perfil de queima:', analise.perfilQueima);

    return new Blob([doc.output('blob')], { type: 'application/pdf' });
  }
}
