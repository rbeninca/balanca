import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import { analisarMotor, type ResultadoAnalise } from './AnalisadorMotor.js';

export interface SessaoParaComparar {
  id: string;
  nome: string;
  leituras: LeituraProcessada[];
}

export interface LeituraNormalizada {
  marcaTemporal: number;
  forcaNewton: number;
  impulsoAcumuladoNs: number;
  emQueima: boolean;
}

export interface LinhaTabelaComparativa {
  id: string;
  nome: string;
  analise: ResultadoAnalise;
}

export function normalizar(leituras: LeituraProcessada[]): LeituraNormalizada[] {
  const emQueima = leituras.filter(l => l.emQueima);
  if (emQueima.length === 0) throw new Error('Sessão sem leituras em queima — não pode ser normalizada');

  const tZero = emQueima[0]!.marcaTemporal;
  return emQueima.map(l => ({
    marcaTemporal: l.marcaTemporal - tZero,
    forcaNewton: l.forcaNewton,
    impulsoAcumuladoNs: l.impulsoAcumuladoNs,
    emQueima: l.emQueima,
  }));
}

export function gerarTabelaComparativa(sessoes: SessaoParaComparar[]): LinhaTabelaComparativa[] {
  return sessoes
    .filter(s => s.leituras.some(l => l.emQueima))
    .map(s => ({
      id: s.id,
      nome: s.nome,
      analise: analisarMotor(s.leituras),
    }));
}
