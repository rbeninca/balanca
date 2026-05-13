export { classificarNAR } from './ClassificadorNAR.js';
export type { ResultadoNAR } from './ClassificadorNAR.js';

export { classificarPerfil } from './ClassificadorPerfil.js';
export type { PerfilQueima } from './ClassificadorPerfil.js';

export { detectarAnomalias } from './DetectorAnomalias.js';
export type { Anomalia, NivelAnomalia, TipoAnomalia } from './DetectorAnomalias.js';

export { analisarMotor } from './AnalisadorMotor.js';
export type { ResultadoAnalise, MetadadosMotor } from './AnalisadorMotor.js';

export { normalizar, gerarTabelaComparativa } from './ComparadorSessoes.js';
export type { SessaoParaComparar, LeituraNormalizada, LinhaTabelaComparativa } from './ComparadorSessoes.js';
