/**
 * Indicador global de "aguarde" — um selo fixo no canto da tela, não
 * bloqueante, mostrado enquanto houver alguma operação demorada em curso
 * (carregar sessões, baixar leituras, salvar, exportar).
 *
 * Contagem de referências: várias operações simultâneas mantêm o selo
 * visível até a última terminar; a mensagem exibida é a da operação mais
 * recente. Operações rápidas (< atraso) não chegam a mostrar nada, para
 * evitar piscar.
 */
export interface RenderizadorIndicador {
  mostrar(mensagem: string): void;
  esconder(): void;
}

export interface Indicador {
  /** Registra uma operação em curso; devolve a função que a conclui (idempotente). */
  iniciar(mensagem?: string): () => void;
  /** Executa [fn] com o indicador ligado, concluindo mesmo em erro. */
  envolver<T>(mensagem: string, fn: () => Promise<T>): Promise<T>;
  ativo(): boolean;
}

export const MENSAGEM_PADRAO = 'Carregando…';

export function criarIndicador(
  render: RenderizadorIndicador,
  atrasoMs = 150,
  agendar: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  cancelar: (id: unknown) => void = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
): Indicador {
  let pendentes = 0;
  let mensagemAtual = MENSAGEM_PADRAO;
  let visivel = false;
  let timer: unknown = null;

  const exibir = () => {
    timer = null;
    if (pendentes === 0) return;
    visivel = true;
    render.mostrar(mensagemAtual);
  };

  const iniciar = (mensagem = MENSAGEM_PADRAO) => {
    pendentes++;
    mensagemAtual = mensagem;
    if (visivel) render.mostrar(mensagemAtual);
    else if (timer === null) timer = agendar(exibir, atrasoMs);

    let concluido = false;
    return () => {
      if (concluido) return;
      concluido = true;
      pendentes = Math.max(0, pendentes - 1);
      if (pendentes > 0) return;
      if (timer !== null) { cancelar(timer); timer = null; }
      if (visivel) { visivel = false; render.esconder(); }
    };
  };

  return {
    iniciar,
    async envolver(mensagem, fn) {
      const concluir = iniciar(mensagem);
      try { return await fn(); } finally { concluir(); }
    },
    ativo: () => pendentes > 0,
  };
}

/** Renderizador padrão: cria o selo no <body> na primeira exibição. */
function renderizadorDom(): RenderizadorIndicador {
  let el: HTMLElement | null = null;
  const obter = () => {
    if (!el) {
      el = document.createElement('div');
      el.id = 'indicador-carregando';
      el.className = 'indicador-carregando hidden';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<span class="indicador-spinner"></span><span class="indicador-texto"></span>';
      document.body.appendChild(el);
    }
    return el;
  };
  return {
    mostrar(mensagem) {
      const e = obter();
      e.querySelector('.indicador-texto')!.textContent = mensagem;
      e.classList.remove('hidden');
    },
    esconder() { el?.classList.add('hidden'); },
  };
}

/** Instância única da aplicação. */
export const indicador: Indicador = criarIndicador(
  typeof document !== 'undefined' ? renderizadorDom() : { mostrar() {}, esconder() {} },
);
