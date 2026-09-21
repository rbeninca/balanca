import type { LeituraProcessada } from '@balancagfig/processamento';

/** O que se recupera de um arquivo CURVA EMPUXO. */
export interface SessaoCurvaEmpuxo {
  /** Campo `Caso` do cabeçalho — quando existe. */
  nome?: string;
  /** Campo `Título` do cabeçalho — quando existe. */
  titulo?: string;
  leituras: LeituraProcessada[];
  /** O que foi descartado no caminho, para o chamador poder avisar. */
  avisos: string[];
}

/**
 * Lê um arquivo **CURVA EMPUXO** — o formato do programa do Prof. Carlos Marchi
 * (UFPR). É o inverso de [exportarCurvaEmpuxo].
 *
 * O cabeçalho é **opcional**: o que o arquivo tem de essencial é o par tempo e
 * força. Arquivos vindos do programa do professor, ou salvos de novo por uma
 * planilha, aparecem sem `Caso` e sem `Título`, e nem por isso deixam de ser
 * curvas válidas — por isso toda linha começada por `#` é cabeçalho e é
 * ignorada, aproveitando-se dela apenas `Caso` e `Título` quando existirem.
 *
 * O tempo sai relativo ao primeiro ponto, como no resto do programa (ver
 * `tempo.ts`), e o impulso acumulado é recalculado por trapézio — o formato não
 * o traz.
 */
export function importarCurvaEmpuxo(texto: string): SessaoCurvaEmpuxo {
  const leituras: LeituraProcessada[] = [];
  const avisos: string[] = [];
  let nome: string | undefined;
  let titulo: string | undefined;

  let origemS: number | null = null;   // t do primeiro ponto, em segundos
  let tAnterior = Number.NEGATIVE_INFINITY;
  let impulso = 0;
  let invalidas = 0;
  let foraDeOrdem = 0;

  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (limpa === '') continue;

    if (limpa.startsWith('#')) {
      const campo = /^#\s*([^=]+?)\s*=\s*(.+)$/.exec(limpa);
      if (campo) {
        const chave = semAcento(campo[1]!.trim().toLowerCase());
        // `---` é o que o exportador escreve quando não há o dado.
        const valor = campo[2]!.trim();
        if (valor !== '' && valor !== '---') {
          if (chave === 'caso') nome = valor;
          else if (chave === 'titulo') titulo = valor;
        }
      }
      continue;
    }

    const campos = limpa.split(/\s+/);
    if (campos.length < 2) { invalidas++; continue; }

    const t = numero(campos[0]!);
    const forcaNewton = numero(campos[1]!);
    if (!Number.isFinite(t) || !Number.isFinite(forcaNewton)) { invalidas++; continue; }

    // Tempo que anda para trás quebraria o trapézio e a escala dos gráficos.
    // Ponto repetido passa: dois `t` iguais somam zero ao impulso.
    if (t < tAnterior) { foraDeOrdem++; continue; }

    if (origemS === null) origemS = t;

    const anterior = leituras[leituras.length - 1];
    const dt = t - tAnterior;
    if (anterior !== undefined && Number.isFinite(dt) && dt > 0) {
      impulso += (anterior.forcaNewton + forcaNewton) / 2 * dt;
    }

    leituras.push({
      marcaTemporal:      Math.round((t - origemS) * 1000),
      forcaNewton,
      temperatura:        0,      // o formato não carrega temperatura
      emQueima:           false,  // nem janela de queima — a análise decide
      impulsoAcumuladoNs: impulso,
    });
    tAnterior = t;
  }

  if (leituras.length < 2) {
    throw new Error(
      'Nenhum par tempo/força encontrado — o arquivo não parece ser do formato CURVA EMPUXO.',
    );
  }
  if (invalidas > 0) {
    avisos.push(`${invalidas} linha(s) sem par tempo/força válido foram ignoradas.`);
  }
  if (foraDeOrdem > 0) {
    avisos.push(`${foraDeOrdem} ponto(s) com tempo fora de ordem foram ignorados.`);
  }

  return {
    leituras,
    avisos,
    ...(nome !== undefined && { nome }),
    ...(titulo !== undefined && { titulo }),
  };
}

/**
 * Número de um campo do arquivo.
 *
 * A planilha em português troca o ponto decimal por vírgula, e quem salva o
 * arquivo por ela deixa o número no meio do caminho. Quando os dois separadores
 * aparecem, o **último** é o decimal e o outro é separador de milhar —
 * `1.234,5` e `1,234.5` são o mesmo número.
 */
function numero(campo: string): number {
  const temPonto = campo.includes('.');
  const temVirgula = campo.includes(',');
  let normalizado = campo;

  if (temPonto && temVirgula) {
    normalizado = campo.lastIndexOf(',') > campo.lastIndexOf('.')
      ? campo.replace(/\./g, '').replace(',', '.')
      : campo.replace(/,/g, '');
  } else if (temVirgula) {
    normalizado = campo.replace(',', '.');
  }

  return Number(normalizado);
}

/** `Título` → `titulo`, para a chave do cabeçalho não depender do acento. */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
