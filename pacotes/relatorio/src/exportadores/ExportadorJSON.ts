import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { ResultadoAnalise } from '@balancagfig/analise';

export interface MetadadosJSON {
  nomeSessao?: string;
  idSessao?: string;
  data?: string;
}

interface LeituraCompacta {
  t: number;   // marcaTemporal ms
  f: number;   // forcaNewton N
  tc: number;  // temperatura °C
  q: boolean;  // emQueima
  i: number;   // impulsoAcumuladoNs
}

export function exportarJSON(
  leituras: LeituraProcessada[],
  analise: ResultadoAnalise,
  meta?: MetadadosJSON,
): string {
  const leiturasCompactas: LeituraCompacta[] = leituras.map(l => ({
    t: l.marcaTemporal,
    f: l.forcaNewton,
    tc: l.temperatura,
    q: l.emQueima,
    i: l.impulsoAcumuladoNs,
  }));

  const obj = {
    versaoFormato: '2.0',
    sessao: {
      id: meta?.idSessao ?? null,
      nome: meta?.nomeSessao ?? null,
      data: meta?.data ?? null,
    },
    analise: {
      nomeComum: analise.nomeComum,
      letraMotor: analise.letraMotor,
      impulsoTotal_Ns: analise.impulsoTotal_Ns,
      forcaPico_N: analise.forcaPico_N,
      forcaMedia_N: analise.forcaMedia_N,
      duracaoQueima_s: analise.duracaoQueima_s,
      perfilQueima: analise.perfilQueima,
      impulsoEspecifico_s: analise.impulsoEspecifico_s ?? null,
      anomalias: analise.anomalias,
    },
    leituras: leiturasCompactas,
  };

  return JSON.stringify(obj, null, 2);
}
