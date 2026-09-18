// Sugestão de zona morta a partir das especificações da célula de carga.
// Lógica pura (sem DOM), para ser testável e reaproveitável.

/** Aceleração da gravidade padrão (m/s²), usada quando o config não traz uma. */
export const GRAVIDADE_PADRAO = 9.80665;

export interface DadosCelula {
  /** Capacidade nominal da célula, em gramas (como no config do ESP). */
  capacidadeMaxGramas?: number;
  /** Classe de acurácia como fração do fundo de escala (0,03 % → 0,0003). */
  acuracia?: number;
  /** Gravidade local (m/s²); usa GRAVIDADE_PADRAO quando ausente. */
  gravidade?: number;
}

/**
 * Zona morta (N) sugerida: o menor esforço que a célula distingue de forma
 * confiável — a acurácia (fração do fundo de escala) aplicada ao fundo de
 * escala em Newtons, vezes um fator [k] opcional. Devolve null quando faltam
 * capacidade ou acurácia válidas.
 *
 * fundoDeEscalaN = (capacidadeMaxGramas / 1000) × g
 * zonaMorta      = fundoDeEscalaN × acuracia × k
 */
export function sugerirZonaMortaN(dados: DadosCelula, k = 1): number | null {
  const cap = dados.capacidadeMaxGramas;
  const acu = dados.acuracia;
  if (!cap || cap <= 0 || !acu || acu <= 0 || k <= 0) return null;
  const g = dados.gravidade && dados.gravidade > 0 ? dados.gravidade : GRAVIDADE_PADRAO;
  const fundoDeEscalaN = (cap / 1000) * g;
  return fundoDeEscalaN * acu * k;
}
