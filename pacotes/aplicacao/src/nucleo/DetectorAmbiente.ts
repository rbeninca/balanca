export type CenarioConexao = 'A' | 'B' | 'C';

export interface ResultadoDeteccao {
  cenario: CenarioConexao;
  urlGateway?: string;
  urlApi?: string;
  temApi: boolean;
}

export interface OpcoesDetector {
  urlGateway?: string;
  urlApi?: string;
  timeoutMs?: number;
  onProgresso?: (mensagem: string) => void;
}

async function tentarFetch(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

function temWebSerial(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).serial;
}

function temBluetooth(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
}

export async function detectarAmbiente(opcoes: OpcoesDetector = {}): Promise<ResultadoDeteccao> {
  const timeout = opcoes.timeoutMs ?? 1500;
  const log = opcoes.onProgresso ?? (() => {});
  const urlGateway = opcoes.urlGateway ?? 'http://localhost:8766/saude';
  const urlApi     = opcoes.urlApi     ?? 'http://localhost:3000/saude';

  log('Verificando gateway...');
  const temGateway = await tentarFetch(urlGateway, timeout);

  if (temGateway) {
    log('Gateway encontrado. Verificando API...');
    const temApi = await tentarFetch(urlApi, timeout);
    log(temApi ? 'API encontrada. Cenário A.' : 'Sem API. Cenário A (armazenamento local).');
    return { cenario: 'A', urlGateway, urlApi, temApi };
  }

  log('Gateway indisponível. Verificando WebSerial...');
  if (temWebSerial()) {
    log('WebSerial disponível. Cenário C.');
    return { cenario: 'C', temApi: false };
  }

  log('WebSerial indisponível. Verificando Bluetooth...');
  if (temBluetooth()) {
    log('Bluetooth disponível. Cenário B.');
    return { cenario: 'B', temApi: false };
  }

  throw new Error('Nenhuma forma de conexão disponível (sem gateway, WebSerial ou Bluetooth)');
}
