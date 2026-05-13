import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

type Fonte = {
  on(evento: 'dados',  fn: (l: LeituraProcessada) => void): void;
  on(evento: string,   fn: (v: unknown) => void): void;
  enviarComando?(cmd: object): void;
};

// Passos do wizard
const PASSOS = [
  { titulo: 'Preparação — balança vazia',        desc: 'Certifique-se de que a plataforma esteja completamente vazia e estável antes de prosseguir.' },
  { titulo: 'Tara (zerar)',                       desc: 'Vamos enviar o comando de tara ao firmware para que o zero seja registrado com a balança vazia.' },
  { titulo: 'Massa de referência',                desc: 'Coloque uma massa de valor conhecido (ex: 100 g) sobre a plataforma e informe o valor abaixo.' },
  { titulo: 'Calibração enviada',                 desc: 'O firmware calculará o novo fator de conversão. Aguarde a confirmação.' },
  { titulo: 'Parâmetros opcionais',               desc: 'Informe a capacidade nominal e a classe de acurácia da célula de carga (dados do datasheet). Deixe em branco para manter os valores atuais.' },
  { titulo: 'Verificação final',                  desc: 'Verifique a leitura com a massa de referência ainda na plataforma. Se estiver correta, finalize.' },
  { titulo: 'Calibração concluída',               desc: 'Os parâmetros foram enviados ao firmware com sucesso!' },
];

let instanciaAtual: WizardCalibracao | null = null;

export class WizardCalibracao {
  private overlay:  HTMLElement;
  private passo     = 0;
  private leituraAtual = 0;
  private ouvinte:  ((l: LeituraProcessada) => void) | null = null;
  private massaReferencia = 0;

  constructor(
    private fonte: Fonte,
    private onFechar: () => void,
  ) {
    instanciaAtual?.destruir();
    instanciaAtual = this;

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = this.html();
    document.body.appendChild(this.overlay);

    this.atualizarProgresso();
    this.mostrarPasso(0);
    this.iniciarOuvinte();
    this.bindEventos();
  }

  private html(): string {
    const dots = PASSOS.map((_, i) => `
      <div class="wizard-dot" id="wdot-${i}"></div>
      ${i < PASSOS.length - 1 ? '<div class="wizard-linha"></div>' : ''}
    `).join('');

    const passos = PASSOS.map((p, i) => `
      <div class="wizard-passo" id="wpasso-${i}">
        <h3>${p.titulo}</h3>
        <p>${p.desc}</p>
        ${this.htmlPasso(i)}
      </div>
    `).join('');

    return `
      <div class="modal" style="max-width:540px">
        <div class="modal-header">
          <h2>Assistente de Calibração</h2>
          <button class="modal-fechar" id="wbtn-fechar">×</button>
        </div>
        <div class="modal-body">
          <div class="wizard-progresso">${dots}</div>
          ${passos}
        </div>
        <div class="modal-footer">
          <button id="wbtn-prev" class="btn-secondary">Voltar</button>
          <button id="wbtn-next" class="btn-primary">Avançar</button>
          <button id="wbtn-finish" class="btn-success hidden">Finalizar</button>
        </div>
      </div>
    `;
  }

  private htmlPasso(i: number): string {
    switch (i) {
      case 0: return `
        <div class="wizard-leitura-live">
          <div class="valor" id="wleit-0">--.-</div>
          <div class="label">Leitura atual (N) — deve ser próxima de zero</div>
        </div>
        <div class="wizard-aviso">Retire qualquer objeto da plataforma antes de continuar.</div>
      `;

      case 1: return `
        <div class="wizard-leitura-live">
          <div class="valor" id="wleit-1">--.-</div>
          <div class="label">Aguardando confirmação da tara...</div>
        </div>
        <div id="wres-tara" class="wizard-resultado hidden">
          <p>Tara enviada com sucesso! Valor zerado.</p>
        </div>
      `;

      case 2: return `
        <div class="wizard-leitura-live">
          <div class="valor" id="wleit-2">--.-</div>
          <div class="label">Leitura atual (N)</div>
        </div>
        <div style="margin-top:0.75rem">
          <label for="wmassa">Massa de referência (gramas)</label>
          <input id="wmassa" type="number" placeholder="ex: 100" min="1" step="any">
        </div>
      `;

      case 3: return `
        <div class="wizard-leitura-live">
          <div class="valor" id="wleit-3">--.-</div>
          <div class="label">Aguardando confirmação do firmware...</div>
        </div>
        <div id="wres-calib" class="wizard-resultado hidden">
          <p>Calibração enviada. O firmware recalculou o fator de conversão.</p>
        </div>
      `;

      case 4: return `
        <div class="wizard-aviso">Estes campos são opcionais. Deixe em branco para manter os valores atuais do firmware.</div>
        <div class="wizard-grid">
          <div>
            <label for="wcapacidade">Capacidade máxima (kg)</label>
            <input id="wcapacidade" type="number" placeholder="ex: 5" min="0" step="any">
          </div>
          <div>
            <label for="wacuracia">Acurácia (%)</label>
            <input id="wacuracia" type="number" placeholder="ex: 0.03" min="0" step="any">
          </div>
        </div>
      `;

      case 5: return `
        <div class="wizard-leitura-live">
          <div class="valor" id="wleit-5">--.-</div>
          <div class="label">Leitura com massa de referência na plataforma</div>
        </div>
        <p id="wmassa-esperada" style="font-size:0.85rem;color:#888;text-align:center;margin-top:0.5rem"></p>
      `;

      case 6: return `
        <div class="wizard-resultado" style="text-align:center">
          <p style="font-size:1rem;font-weight:500">Calibração concluída com sucesso!</p>
          <p>Retire a massa de referência e verifique se a leitura retorna a zero.</p>
        </div>
      `;

      default: return '';
    }
  }

  private iniciarOuvinte() {
    this.ouvinte = (l: LeituraProcessada) => {
      this.leituraAtual = l.forcaNewton;
      this.atualizarLeituras();
    };
    this.fonte.on('dados', this.ouvinte);
  }

  private atualizarLeituras() {
    const v = this.leituraAtual.toFixed(3);
    [0, 1, 2, 3, 5].forEach(i => {
      const el = this.overlay.querySelector(`#wleit-${i}`);
      if (el) el.textContent = `${v} N`;
    });
  }

  private mostrarPasso(n: number) {
    this.passo = n;
    PASSOS.forEach((_, i) => {
      const el = this.overlay.querySelector(`#wpasso-${i}`);
      if (el) el.classList.toggle('ativo', i === n);
    });
    this.atualizarProgresso();
    this.atualizarBotoes();
    this.acoesAoEntrar(n);
  }

  private acoesAoEntrar(n: number) {
    if (n === 1) {
      // envia tara automaticamente
      this.fonte.enviarComando?.({ tipo: 'CMD_TARAR' });
      setTimeout(() => {
        const res = this.overlay.querySelector('#wres-tara');
        res?.classList.remove('hidden');
      }, 1200);
    }

    if (n === 3) {
      // envia calibração com a massa informada
      if (this.massaReferencia > 0) {
        this.fonte.enviarComando?.({ tipo: 'CMD_CALIBRAR', massaG: this.massaReferencia });
        setTimeout(() => {
          const res = this.overlay.querySelector('#wres-calib');
          res?.classList.remove('hidden');
        }, 1500);
      }
    }

    if (n === 5) {
      const el = this.overlay.querySelector('#wmassa-esperada');
      if (el) el.textContent = `Valor esperado: ${(this.massaReferencia / 1000 * 9.80665).toFixed(3)} N`;
    }
  }

  private acoesAoSair(n: number): boolean {
    if (n === 2) {
      const input = this.overlay.querySelector<HTMLInputElement>('#wmassa');
      const val   = parseFloat(input?.value ?? '0');
      if (!val || val <= 0) {
        alert('Informe a massa de referência em gramas antes de continuar.');
        return false;
      }
      this.massaReferencia = val;
    }
    return true;
  }

  private atualizarProgresso() {
    PASSOS.forEach((_, i) => {
      const dot = this.overlay.querySelector(`#wdot-${i}`);
      if (!dot) return;
      dot.className = 'wizard-dot' +
        (i < this.passo  ? ' concluido' :
         i === this.passo ? ' ativo'    : '');
    });
  }

  private atualizarBotoes() {
    const prev   = this.overlay.querySelector<HTMLButtonElement>('#wbtn-prev')!;
    const next   = this.overlay.querySelector<HTMLButtonElement>('#wbtn-next')!;
    const finish = this.overlay.querySelector<HTMLButtonElement>('#wbtn-finish')!;

    prev.classList.toggle('hidden', this.passo === 0);
    const ultimo = this.passo === PASSOS.length - 1;
    next.classList.toggle('hidden', ultimo);
    finish.classList.toggle('hidden', !ultimo);
  }

  private async finalizar() {
    // envia parâmetros opcionais se preenchidos
    const capEl = this.overlay.querySelector<HTMLInputElement>('#wcapacidade');
    const acuEl = this.overlay.querySelector<HTMLInputElement>('#wacuracia');
    const cap   = parseFloat(capEl?.value ?? '');
    const acu   = parseFloat(acuEl?.value ?? '');

    if (!isNaN(cap) && cap > 0) {
      this.fonte.enviarComando?.({ tipo: 'CMD_DEFINIR_PARAM', paramId: 0x0a, valorF: cap * 1000, valorI: 0 });
    }
    if (!isNaN(acu) && acu > 0) {
      this.fonte.enviarComando?.({ tipo: 'CMD_DEFINIR_PARAM', paramId: 0x0b, valorF: acu / 100, valorI: 0 });
    }
    this.destruir();
  }

  private bindEventos() {
    this.overlay.querySelector('#wbtn-fechar')!.addEventListener('click', () => this.destruir());

    this.overlay.querySelector('#wbtn-prev')!.addEventListener('click', () => {
      if (this.passo > 0) this.mostrarPasso(this.passo - 1);
    });

    this.overlay.querySelector('#wbtn-next')!.addEventListener('click', () => {
      if (!this.acoesAoSair(this.passo)) return;
      if (this.passo < PASSOS.length - 1) this.mostrarPasso(this.passo + 1);
    });

    this.overlay.querySelector('#wbtn-finish')!.addEventListener('click', () => this.finalizar());
  }

  destruir() {
    this.overlay.remove();
    if (instanciaAtual === this) instanciaAtual = null;
    this.onFechar();
  }
}
