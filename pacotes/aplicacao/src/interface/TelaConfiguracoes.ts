import type { Fonte } from './TelaMedicao.js';
import { navHtml, bindNav, type StatusConexao } from './navBar.js';

interface ParamDef {
  id:        number;
  label:     string;
  descricao: string;
  tipo:      'float' | 'uint' | 'int' | 'bool';
  unidade?:  string;
  campo:     keyof ConfigView;
}

interface ConfigView {
  fatorConversao:    number;
  gravidade:         number;
  leiturasEstaveis:  number;
  toleranciaEst:     number;
  modo:              number;
  usarEMA:           boolean;
  numAmostrasMedia:  number;
  offsetTara:        number;
  timeoutCal:        number;
  capacidadeMaxGramas: number;
  acuracia:          number;
}

const PARAMS: ParamDef[] = [
  { id: 0x01, label: 'Gravidade',             descricao: 'Aceleração da gravidade local',     tipo: 'float', unidade: 'm/s²', campo: 'gravidade' },
  { id: 0x02, label: 'Fator de conversão',    descricao: 'Escala HX711 → gramas',             tipo: 'float',                  campo: 'fatorConversao' },
  { id: 0x0a, label: 'Capacidade máxima',     descricao: 'Capacidade nominal da célula',      tipo: 'float', unidade: 'g',    campo: 'capacidadeMaxGramas' },
  { id: 0x0b, label: 'Acurácia',              descricao: 'Classe de acurácia da célula',      tipo: 'float', unidade: '%',    campo: 'acuracia' },
  { id: 0x08, label: 'Offset de tara',        descricao: 'Offset ADC gravado pelo CMD_TARAR', tipo: 'int',                    campo: 'offsetTara' },
  { id: 0x09, label: 'Timeout calibração',    descricao: 'Tempo máximo de espera (s)',        tipo: 'uint',  unidade: 's',    campo: 'timeoutCal' },
  { id: 0x03, label: 'Leituras estáveis',     descricao: 'Nº de leituras para estabilização', tipo: 'uint',                  campo: 'leiturasEstaveis' },
  { id: 0x04, label: 'Tolerância estab.',     descricao: 'Variância máxima para estável',     tipo: 'float',                  campo: 'toleranciaEst' },
  { id: 0x07, label: 'Amostras média',        descricao: 'Nº de amostras para média móvel',   tipo: 'uint',                  campo: 'numAmostrasMedia' },
  { id: 0x06, label: 'Usar EMA',              descricao: 'Usar Média Exponencial (1=sim)',    tipo: 'bool',                   campo: 'usarEMA' },
  { id: 0x05, label: 'Modo',                  descricao: 'Modo de operação do firmware',       tipo: 'uint',                  campo: 'modo' },
];

export class TelaConfiguracoes {
  private configAtual: Partial<ConfigView> = {};
  private ouvinte: ((c: unknown) => void) | null = null;

  constructor(
    container: HTMLElement,
    private fonte:       Fonte,
    private onConexao:   () => void,
    private onMedicao:   () => void,
    private onJogos:     () => void,
    private onSessoes:   () => void,
    private onFirmware:  () => void,
    private status?:     StatusConexao,
  ) {
    this.renderizar(container);
    this.ouvinte = (raw) => this.aplicarConfig(raw);
    this.fonte.on('config', this.ouvinte);
    this.fonte.enviarComando?.({ tipo: 'CMD_OBTER_CONFIG' });
  }

  private renderizar(container: HTMLElement) {
    const linhas = PARAMS.map(p => `
      <tr class="cfg-linha" data-id="${p.id}">
        <td class="cfg-label">
          <div class="cfg-nome">${p.label}</div>
          <div class="cfg-desc">${p.descricao}${p.unidade ? ` (${p.unidade})` : ''}</div>
        </td>
        <td class="cfg-input-cell">
          <input
            id="cfg-input-${p.id}"
            class="cfg-input"
            type="${p.tipo === 'bool' ? 'number' : 'number'}"
            step="${p.tipo === 'float' ? 'any' : '1'}"
            min="${p.tipo === 'uint' || p.tipo === 'bool' ? '0' : ''}"
            placeholder="—"
          >
        </td>
        <td class="cfg-enviar-cell">
          <button class="btn-secondary btn-sm cfg-btn-enviar" data-id="${p.id}">Enviar</button>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      ${navHtml({ ativo: 'configuracoes', onConexao: this.onConexao, onMedicao: this.onMedicao, onJogos: this.onJogos, onSessoes: this.onSessoes, onConfiguracoes: () => {}, onFirmware: this.onFirmware, ...(this.status && { status: this.status }) })}

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h2 style="margin:0">Configurações do firmware</h2>
          <button id="cfg-btn-atualizar" class="btn-secondary btn-sm">↻ Atualizar</button>
        </div>
        <div id="cfg-status" class="status-box hidden" style="margin-bottom:0.75rem"></div>
        <div class="cfg-table-wrap">
          <table class="cfg-table">
            <thead>
              <tr>
                <th>Parâmetro</th>
                <th>Valor atual</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        <p style="font-size:0.75rem;color:#555;margin-top:1rem">
          Clique em <strong>Enviar</strong> para gravar o valor na ESP32. Use <strong>Calibração</strong>
          (tela Medição) para o assistente guiado de tara + fator de conversão.
        </p>
      </div>
    `;

    bindNav(container, { ativo: 'configuracoes', onConexao: this.onConexao, onMedicao: this.onMedicao, onJogos: this.onJogos, onSessoes: this.onSessoes, onConfiguracoes: () => {}, onFirmware: this.onFirmware, ...(this.status && { status: this.status }) });
    container.querySelector('#cfg-btn-atualizar')!.addEventListener('click', () => {
      this.fonte.enviarComando?.({ tipo: 'CMD_OBTER_CONFIG' });
      this.mostrarStatus('info', 'Solicitando configuração ao firmware…');
    });

    container.querySelectorAll<HTMLButtonElement>('.cfg-btn-enviar').forEach(btn => {
      btn.addEventListener('click', () => this.enviarParam(Number(btn.dataset.id)));
    });
  }

  private aplicarConfig(raw: unknown) {
    const c = raw as Partial<ConfigView> | null;
    if (!c) return;
    this.configAtual = { ...c };

    PARAMS.forEach(p => {
      const input = document.querySelector<HTMLInputElement>(`#cfg-input-${p.id}`);
      if (!input) return;
      const val = c[p.campo];
      if (val === undefined || val === null) return;
      if (p.tipo === 'bool') {
        input.value = (val as boolean) ? '1' : '0';
      } else {
        input.value = String(val);
      }
    });

    this.mostrarStatus('ok', 'Configuração recebida do firmware.');
  }

  private enviarParam(id: number) {
    const def   = PARAMS.find(p => p.id === id);
    if (!def) return;

    const input = document.querySelector<HTMLInputElement>(`#cfg-input-${id}`);
    if (!input) return;

    const raw = parseFloat(input.value);
    if (isNaN(raw)) {
      this.mostrarStatus('erro', `Valor inválido para "${def.label}".`);
      return;
    }

    const isFloat = def.tipo === 'float';
    this.fonte.enviarComando?.({
      tipo:    'CMD_DEFINIR_PARAM',
      paramId: id,
      valorF:  isFloat ? raw : 0,
      valorI:  isFloat ? 0   : Math.round(raw),
    });

    this.mostrarStatus('ok', `Parâmetro "${def.label}" enviado (${raw}).`);
  }

  private mostrarStatus(tipo: 'ok' | 'info' | 'erro', msg: string) {
    const el = document.querySelector<HTMLElement>('#cfg-status');
    if (!el) return;
    el.className = `status-box ${tipo === 'info' ? '' : tipo}`;
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}
