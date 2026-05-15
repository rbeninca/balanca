export type OrigemJogo = 'legado-v1' | 'nativo';
export type ModoExecucaoJogo = 'popup' | 'embutido';

export interface JogoCatalogo {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  origem: OrigemJogo;
  modoExecucao: ModoExecucaoJogo;
  arquivoPublico?: string;
  requerConexao: boolean;
  etiquetas: string[];
  destaque?: boolean;
}

export interface AlertaSobrecargaCompartilhado {
  active: boolean;
  level: number;
  percent: number;
  forca: number;
  limite: number;
}

export interface EstadoCompartilhadoJogos {
  conectado: boolean;
  endereco: string | null;
  transporte: string;
  unidadeAtual: 'N';
  forcaAtual: number;
  ultimaLeituraMs: number | null;
  overloadAlert: AlertaSobrecargaCompartilhado;
}
