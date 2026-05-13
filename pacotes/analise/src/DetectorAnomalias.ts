import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

export type NivelAnomalia = 'AVISO' | 'CRITICO';
export type TipoAnomalia = 'OSCILACAO' | 'QUEIMA_IRREGULAR' | 'FALHA_IGNICAO';

export interface Anomalia {
  tipo: TipoAnomalia;
  nivel: NivelAnomalia;
  marcaTemporal?: number;
  detalhe?: string;
}

const LIMIAR_OSCILACAO_AVISO   = 0.30;
const LIMIAR_OSCILACAO_CRITICO = 0.60;
const LIMIAR_CV_IRREGULAR      = 0.20;
const TEMPO_IGNICAO_MAX_MS     = 2000;

function desvio(vals: number[], media: number): number {
  const variancia = vals.reduce((s, v) => s + (v - media) ** 2, 0) / vals.length;
  return Math.sqrt(variancia);
}

export function detectarAnomalias(leituras: LeituraProcessada[]): Anomalia[] {
  const emQueima = leituras.filter(l => l.emQueima);
  if (emQueima.length === 0) return [];

  const anomalias: Anomalia[] = [];
  const forcas = emQueima.map(l => l.forcaNewton);
  const media = forcas.reduce((s, v) => s + v, 0) / forcas.length;

  // Detecção de oscilações pico-a-pico entre amostras consecutivas
  for (let i = 1; i < emQueima.length; i++) {
    const delta = Math.abs((emQueima[i]!.forcaNewton - emQueima[i - 1]!.forcaNewton) / media);
    if (delta > LIMIAR_OSCILACAO_CRITICO) {
      anomalias.push({ tipo: 'OSCILACAO', nivel: 'CRITICO', marcaTemporal: emQueima[i]!.marcaTemporal });
    } else if (delta > LIMIAR_OSCILACAO_AVISO) {
      anomalias.push({ tipo: 'OSCILACAO', nivel: 'AVISO', marcaTemporal: emQueima[i]!.marcaTemporal });
    }
  }

  // Coeficiente de variação
  const cv = desvio(forcas, media) / media;
  if (cv > LIMIAR_CV_IRREGULAR) {
    anomalias.push({ tipo: 'QUEIMA_IRREGULAR', nivel: 'AVISO', detalhe: `CV=${cv.toFixed(3)}` });
  }

  // Atraso de ignição
  const primeiraQueima = leituras.find(l => l.emQueima);
  if (primeiraQueima && primeiraQueima.marcaTemporal > TEMPO_IGNICAO_MAX_MS) {
    anomalias.push({
      tipo: 'FALHA_IGNICAO',
      nivel: 'AVISO',
      marcaTemporal: primeiraQueima.marcaTemporal,
    });
  }

  return anomalias;
}
