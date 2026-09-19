export { classificarNAR } from './ClassificadorNAR.js';
export type { ResultadoNAR } from './ClassificadorNAR.js';

export { classificarPerfil } from './ClassificadorPerfil.js';
export type { PerfilQueima } from './ClassificadorPerfil.js';

export { detectarAnomalias } from './DetectorAnomalias.js';
export type { Anomalia, NivelAnomalia, TipoAnomalia } from './DetectorAnomalias.js';

export { analisarMotor, garantirQueima } from './AnalisadorMotor.js';
export type { ResultadoAnalise, MetadadosMotor } from './AnalisadorMotor.js';

export { normalizar, gerarTabelaComparativa } from './ComparadorSessoes.js';
export type { SessaoParaComparar, LeituraNormalizada, LinhaTabelaComparativa } from './ComparadorSessoes.js';

export { removerMedia, removerLinear, aplicarDetrend, METODOS_DETREND } from './Detrend.js';
export type { MetodoDetrend, ResultadoDetrend } from './Detrend.js';
