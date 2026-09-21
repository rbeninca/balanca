import type { OpcoesCSV } from '@balancagfig/relatorio';

export type FormatoCSV = 'excel' | 'dados';

/**
 * As duas convenções, **pareadas**.
 *
 * A regra é nunca repetir o separador: campo com `;` pede decimal com `,`;
 * campo com `,` pede decimal com `.`. O que confundia antes era justamente a
 * mistura — campo `;` com decimal `.`, em que a planilha em português lê o
 * ponto como separador de milhar e mostra `0.012` como doze.
 */
export const OPCOES_CSV: Record<FormatoCSV, OpcoesCSV> = {
  excel: { separador: ';', decimal: ',' },
  dados: { separador: ',', decimal: '.' },
};

/**
 * Pergunta em que formato exportar o CSV.
 *
 * Devolve `null` quando o usuário fecha sem escolher — quem chamou não exporta
 * nada, que é o que se espera de um cancelamento.
 *
 * Usa as classes de modal que o app já tem, para nascer com a mesma cara (e
 * funcionar no tema escuro, que os estilos cobrem por `[data-tema]`).
 */
export function perguntarFormatoCSV(): Promise<FormatoCSV | null> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px">
        <div class="modal-header">
          <h2>Exportar CSV</h2>
          <button class="modal-fechar" data-acao="cancelar" title="Fechar">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 1rem;color:#6b7280">
            O conteúdo é o mesmo nos dois. Muda só como os números são escritos,
            e é isso que decide se a planilha lê certo.
          </p>
          <button class="btn-primary" data-formato="excel"
                  style="width:100%;text-align:left;padding:.8rem 1rem;margin-bottom:.6rem">
            <strong>Planilha</strong> — Excel, LibreOffice<br>
            <small style="opacity:.85">campo com <code>;</code> · decimal com <code>,</code></small>
          </button>
          <button class="btn-secondary" data-formato="dados"
                  style="width:100%;text-align:left;padding:.8rem 1rem">
            <strong>Dados</strong> — Python, R, script<br>
            <small style="opacity:.85">campo com <code>,</code> · decimal com <code>.</code></small>
          </button>
        </div>
      </div>`;

    const fechar = (escolha: FormatoCSV | null) => {
      document.removeEventListener('keydown', aoTeclar);
      overlay.remove();
      resolve(escolha);
    };

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar(null);
    };

    overlay.querySelectorAll<HTMLElement>('[data-formato]').forEach(el => {
      el.addEventListener('click', () => fechar(el.dataset['formato'] as FormatoCSV));
    });
    overlay.querySelector('[data-acao="cancelar"]')!.addEventListener('click', () => fechar(null));
    // Clique fora do cartão também cancela — o overlay é o fundo escurecido.
    overlay.addEventListener('click', e => {
      if (e.target === overlay) fechar(null);
    });
    document.addEventListener('keydown', aoTeclar);

    document.body.appendChild(overlay);
  });
}
