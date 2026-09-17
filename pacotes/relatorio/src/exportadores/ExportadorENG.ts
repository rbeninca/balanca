import type { LeituraProcessada } from '@balancagfig/processamento';
import type { ResultadoAnalise } from '@balancagfig/analise';

export interface MetadadosENG {
  diametroMm?: number;
  comprimentoMm?: number;
  massaPropelente_g?: number;
  massaTotal_g?: number;
  fabricante?: string;
}

// O OpenRocket (formato RASP) recusa motores com diâmetro, comprimento ou
// massa iguais a zero. Quando o usuário não informa, usamos padrões válidos
// e sinalizamos no comentário para ele ajustar.
const DIAMETRO_PADRAO_MM   = 29;
const COMPRIMENTO_PADRAO_MM = 70;
const ISP_ESTIMADO_S = 100;   // usado só para estimar a massa de propelente ausente
const G0 = 9.80665;

const positivo = (v: number | undefined): v is number => typeof v === 'number' && v > 0;

/**
 * Gera um arquivo RASP (.eng) válido para o OpenRocket a partir da curva de
 * empuxo medida.
 *
 * Cabeçalho: `nome diametro_mm comprimento_mm delays massaProp_kg massaTotal_kg fabricante`
 * Pontos: `tempo_s empuxo_N`, tempo estritamente crescente começando em t>0,
 * último ponto com empuxo 0. Comentários (linhas `;`) em ASCII.
 */
export function exportarENG(
  leituras: LeituraProcessada[],
  analise: ResultadoAnalise,
  meta?: MetadadosENG,
): string {
  const linhas: string[] = [];

  // Nome e fabricante não podem conter espaços (quebrariam o cabeçalho de 7 campos)
  const nomeMotor  = (analise.nomeComum || 'Motor').replace(/\s+/g, '_');
  const fabricante = (meta?.fabricante ?? 'GFIG').replace(/\s+/g, '_');

  const diametro    = positivo(meta?.diametroMm)    ? meta!.diametroMm!    : DIAMETRO_PADRAO_MM;
  const comprimento = positivo(meta?.comprimentoMm) ? meta!.comprimentoMm! : COMPRIMENTO_PADRAO_MM;

  // Massa de propelente: informada ou estimada do impulso (Isp ~100 s).
  const massaProp_g = positivo(meta?.massaPropelente_g)
    ? meta!.massaPropelente_g!
    : Math.max(1, (analise.impulsoTotal_Ns / (ISP_ESTIMADO_S * G0)) * 1000);
  // Massa total deve ser > massa de propelente; senão, o dobro dela.
  const massaTotal_g = positivo(meta?.massaTotal_g) && meta!.massaTotal_g! > massaProp_g
    ? meta!.massaTotal_g!
    : massaProp_g * 2;

  const estimados = !positivo(meta?.diametroMm) || !positivo(meta?.comprimentoMm) ||
                    !positivo(meta?.massaPropelente_g) || !positivo(meta?.massaTotal_g);

  linhas.push('; Gerado por balancaGFIG');
  linhas.push(`; Motor: ${nomeMotor}`);
  linhas.push(`; Impulso total: ${analise.impulsoTotal_Ns.toFixed(3)} Ns`);
  linhas.push(`; Forca maxima: ${analise.forcaPico_N.toFixed(3)} N`);
  linhas.push(`; Duracao: ${analise.duracaoQueima_s.toFixed(3)} s`);
  linhas.push(analise.impulsoEspecifico_s != null
    ? `; Isp: ${analise.impulsoEspecifico_s.toFixed(2)} s`
    : '; Isp: massa propelente nao informada');
  if (estimados) {
    linhas.push('; ATENCAO: diametro/comprimento/massa estimados - ajuste os valores reais no OpenRocket');
  }

  // Cabeçalho do motor (delays "P" = sem carga de ejecao, adequado a teste de bancada)
  linhas.push(
    `${nomeMotor} ${diametro.toFixed(0)} ${comprimento.toFixed(0)} P ` +
    `${(massaProp_g / 1000).toFixed(4)} ${(massaTotal_g / 1000).toFixed(4)} ${fabricante}`,
  );

  const emQueima = leituras.filter(l => l.emQueima);
  if (emQueima.length === 0) {
    // Curva mínima válida (não deveria ocorrer: análise exige queima)
    linhas.push('   0.0010 0.000');
    linhas.push(';');
    return linhas.join('\n');
  }

  // Recua 1 ms para o primeiro ponto ficar em t=0.001 (> 0, exigido pelo RASP)
  const tZero = emQueima[0]!.marcaTemporal - 1;
  let tAnterior = 0;
  for (const l of emQueima) {
    const t = (l.marcaTemporal - tZero) / 1000;
    if (t <= tAnterior) continue;                 // tempo estritamente crescente
    const f = Math.max(0, l.forcaNewton);         // empuxo nunca negativo
    linhas.push(`   ${t.toFixed(4)} ${f.toFixed(3)}`);
    tAnterior = t;
  }

  // Ponto final com empuxo zero, logo após o último
  const tFinal = (emQueima[emQueima.length - 1]!.marcaTemporal - tZero) / 1000 + 0.01;
  linhas.push(`   ${tFinal.toFixed(4)} 0.000`);
  linhas.push(';');

  return linhas.join('\n');
}
